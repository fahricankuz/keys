-- Depozito ve ticari portföyde otomatik kira.
-- 1. Birim sözleşmesinde depozito (AVM, depo, GYO): tutar ve para birimi, tür (nakit, teminat mektubu, banka blokesi),
--    alındığı gün; teminat mektubunda banka ve bitiş; sözleşme bitince iade günü, iade edilen tutar ve kesinti nedeni.
--    Kiracı kendi depozitosunu görür (my_site_units → deposit). Teminat mektubunun bitişine 30 ve 7 gün kala birim yetkisi olan
--    yöneticiye bildirim (her gün çalışan site_reminders içinden; ayrı zamanlama yok).
-- 2. Otomatik tahakkuk (site_auto) AVM, depo ve GYO'yu da kapsar: kiracısı olan ve sözleşmesi süren birime ayın kirası ve ortak
--    gideri yazılır. Kural elle oluşturmayla aynı: KDV'li sözleşmede %20 eklenir, stopajlıda %20 düşülür, vade sözleşmedeki ödeme
--    günü; dövizli kira o günün TCMB satış kuruyla (fx_rate) TL'ye çevrilir, asıl tutar ve kur saklanır. Kur yoksa o birim
--    yazılmaz ve iş ertesi gün yeniden dener. Aynı ay elle oluşturulmuş kayıt varsa ikincisi yazılmaz. Ticari kurumda varsayılan kapalı.
-- Yeni sütunlar boş başlar; işlev gövdeleri eski alanları korur. Eski kodla uyumlu, yeniden çalıştırılabilir.

alter table public.site_units add column if not exists deposit_amount     numeric check (deposit_amount is null or deposit_amount >= 0);
alter table public.site_units add column if not exists deposit_currency   text not null default 'TRY';
alter table public.site_units add column if not exists deposit_kind       text not null default 'nakit';
alter table public.site_units add column if not exists deposit_on         date;
alter table public.site_units add column if not exists deposit_bank       text not null default '' check (length(deposit_bank) <= 120);
alter table public.site_units add column if not exists deposit_until      date;
alter table public.site_units add column if not exists deposit_returned_on date;
alter table public.site_units add column if not exists deposit_returned   numeric check (deposit_returned is null or deposit_returned >= 0);
alter table public.site_units add column if not exists deposit_cut_reason text not null default '' check (length(deposit_cut_reason) <= 300);
alter table public.site_units drop constraint if exists site_units_deposit_currency_check;
alter table public.site_units add constraint site_units_deposit_currency_check check (deposit_currency in ('TRY','USD','EUR'));
alter table public.site_units drop constraint if exists site_units_deposit_kind_check;
alter table public.site_units add constraint site_units_deposit_kind_check check (deposit_kind in ('nakit','teminat','bloke'));

create or replace function public.my_site_units()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'unit_id', u.id, 'org_id', o.id, 'org', o.name, 'sector', o.sector, 'block', u.block, 'no', u.no, 'area', u.area, 'aidat', u.aidat,
    'payer', u.payer, 'role', l.role, 'rent', u.rent,
    'payer_effective', public.site_payer(u.id), 'pays', public.site_payer(u.id) = l.role, 'currency', u.currency, 'turnover_rate', u.turnover_rate,
    'lease_start', u.lease_start, 'lease_end', u.lease_end,
    'deposit', case when u.deposit_amount is null then null else jsonb_build_object('amount', u.deposit_amount, 'currency', u.deposit_currency,
      'kind', u.deposit_kind, 'on', u.deposit_on, 'bank', u.deposit_bank, 'until', u.deposit_until,
      'returned_on', u.deposit_returned_on, 'returned', u.deposit_returned, 'cut_reason', u.deposit_cut_reason) end,
    'property_id', (select p.id from public.properties p where p.site_unit_id = u.id
                     and (p.owner_id = auth.uid() or exists (select 1 from public.memberships m where m.property_id = p.id and m.user_id = auth.uid()))
                     limit 1)) order by o.name, u.block, u.no), '[]'::jsonb)
  from (select unit_id, case when bool_or(role = 'malik') then 'malik' else 'kiraci' end as role
          from public.site_links(auth.uid()) group by unit_id) l
  join public.site_units u on u.id = l.unit_id join public.organizations o on o.id = u.org_id
$$;
grant execute on function public.my_site_units() to authenticated;

/** Teminat mektubu bitişine 30 ve 7 gün kala: birim yetkisi olan yöneticilere bildirim (iade edilmemiş, etkin kurum). */
create or replace function public.site_deposit_reminders(today date default (now() at time zone 'Europe/Istanbul')::date)
returns int language plpgsql security definer set search_path = public as $$
declare before int;
begin
  select count(*) into before from public.notifications;
  insert into public.notifications (user_id, title, body, url, tag)
  select p.u, public.unit_label(u.id) || ': teminat mektubu ' || (u.deposit_until - today) || ' gün sonra bitiyor',
         coalesce(nullif(u.deposit_bank, '') || ' · ', '') || 'Bitiş ' || to_char(u.deposit_until, 'DD.MM.YYYY') || '. Yenilenmesini ya da yerine depozito alınmasını iste.',
         '/uygulama/site/birimler', 'deposit-' || u.id || '-' || (u.deposit_until - today)
  from public.site_units u join public.organizations o on o.id = u.org_id and o.status = 'active'
  cross join lateral public.org_people(u.org_id, 'units.manage') p(u)
  where u.deposit_kind = 'teminat' and u.deposit_until is not null and u.deposit_returned_on is null
    and (u.deposit_until - today) in (30, 7)
  on conflict do nothing;
  return (select count(*) from public.notifications) - before;
end $$;
revoke execute on function public.site_deposit_reminders(date) from public, anon, authenticated;

create or replace function public.site_reminders(today date default (now() at time zone 'Europe/Istanbul')::date)
returns int language plpgsql security definer set search_path = public as $$
declare before int;
begin
  select count(*) into before from public.notifications;
  with due as (
    select c.*, coalesce(c.due_on, (date_trunc('month', to_date(c.month, 'YYYY-MM')) + interval '1 month' - interval '1 day')::date) as last_day,
           u.payer, public.unit_label(c.unit_id) as lbl
    from public.site_charges c join public.site_units u on u.id = c.unit_id
    join public.organizations o on o.id = c.org_id and o.status = 'active'
    where c.status in ('open','partial','rejected')
  ), stage as (
    select d.*, case today - d.last_day when -3 then 'soon' when 0 then 'due' when 5 then 'late' when 15 then 'late2' end as st
    from due d
  ), cand as (
    -- Dairenin hesabı bağlı kişileri: doğrudan kayıtlı malik/kiracı ve bağlı mülkün kiracısı.
    select s.*, x.user_id, x.role from stage s
    join lateral (
      select r.user_id, r.role from public.site_residents r where r.unit_id = s.unit_id and r.user_id is not null
      union
      select m.user_id, 'kiraci' from public.properties p join public.memberships m on m.property_id = p.id and m.role = 'tenant'
       where p.site_unit_id = s.unit_id
    ) x on true
    where s.st is not null
  ), who as (
    -- Ödeyen: dairede seçilen rol (aidatı kim öder); o rolde kimse yoksa diğer rol.
    select c.* from cand c where c.role = public.site_payer(c.unit_id)
  )
  insert into public.notifications (user_id, title, body, url, tag)
  select distinct on (w.user_id, w.id) w.user_id,
         w.lbl || case when w.kind = 'kira' then ': kira ' else ': aidat ' end || case when w.st in ('late','late2') then 'gecikti' else 'günü yaklaşıyor' end,
         to_char(to_date(w.month, 'YYYY-MM'), 'MM.YYYY') || ' ' || public.charge_word(w.kind, w.title)
           || ' ' || public.fmt_tl(w.amount - case when w.status = 'partial' then w.paid_amount else 0 end)
           || case when w.st in ('late','late2') then ', son gün ' || to_char(w.last_day, 'DD.MM.YYYY') || ' idi.' else ', son gün ' || to_char(w.last_day, 'DD.MM.YYYY') || '.' end,
         '/uygulama/sitem', 'aidat-' || w.st || '-' || w.id
  from who w left join public.profiles pr on pr.id = w.user_id
  where coalesce((pr.settings ->> 'remindAidat')::boolean, true)
  on conflict do nothing;
  perform public.site_deposit_reminders(today);
  return (select count(*) from public.notifications) - before;
end $$;
revoke execute on function public.site_reminders(date) from public, anon, authenticated;

/** Otomatik tahakkuk: sitede o ayın aidatı (aidatı tanımlı her daire); AVM, depo ve GYO'da kiracısı olan ve sözleşmesi süren
    birimlerin kirası ve ortak gideri. Aynı ay için ikinci çalıştırma bir şey eklemez. */
create or replace function public.site_auto_run(today date default (now() at time zone 'Europe/Istanbul')::date)
returns int language plpgsql security definer set search_path = public as $$
declare a record; m text := to_char(today, 'YYYY-MM'); m0 date := date_trunc('month', today)::date;
        m1 date := (date_trunc('month', today) + interval '1 month' - interval '1 day')::date; n int := 0; k int; missing boolean;
begin
  for a in select s.*, o.sector, o.modules from public.site_auto s join public.organizations o on o.id = s.org_id and o.status = 'active'
           where s.enabled and o.sector in ('site','avm','depo','gyo') and extract(day from today) >= s.run_day
             and coalesce(s.last_month, '') < m and m >= coalesce(s.start_month, m) loop
    missing := false;
    if a.sector = 'site' then
      insert into public.site_charges (org_id, unit_id, month, kind, title, amount, due_on)
      select a.org_id, u.id, m, 'aidat', '', u.aidat,
             (m0 + (a.due_day - 1) + case when a.due_day < a.run_day then interval '1 month' else interval '0' end)::date
      from public.site_units u where u.org_id = a.org_id and u.aidat > 0
      on conflict (unit_id, month, kind, title) do nothing;
      get diagnostics k = row_count;
      n := n + k;
    else
      -- Kiracısı olan ve sözleşmesi bu ay süren birimler.
      create temporary table if not exists _auto_units (id uuid, rent numeric, currency text, rate numeric, mult numeric, aidat numeric, due date) on commit drop;
      truncate _auto_units;
      insert into _auto_units
      select u.id, u.rent, u.currency, public.fx_rate(u.currency, today),
             case when u.vat then 1.2 when u.stopaj then 0.8 else 1 end, u.aidat,
             case when u.due_day is not null then m0 + (u.due_day - 1) else null end
      from public.site_units u
      where u.org_id = a.org_id
        and (u.lease_start is null or u.lease_start <= m1) and (u.lease_end is null or u.lease_end >= m0)
        and (exists (select 1 from public.site_residents r where r.unit_id = u.id and r.role = 'kiraci')
             or exists (select 1 from public.properties p join public.memberships mb on mb.property_id = p.id and mb.role = 'tenant' where p.site_unit_id = u.id));
      insert into public.site_charges (org_id, unit_id, month, kind, title, amount, currency, fx, orig_amount, due_on)
      select a.org_id, x.id, m, 'kira', '', round(x.rent * x.rate * x.mult, 2), x.currency,
             case when x.currency <> 'TRY' then x.rate end, case when x.currency <> 'TRY' then x.rent end, x.due
      from _auto_units x where x.rent > 0 and x.rate is not null
      on conflict (unit_id, month, kind, title) do nothing;
      get diagnostics k = row_count;
      n := n + k;
      if 'ortak_gider' = any(a.modules) then
        insert into public.site_charges (org_id, unit_id, month, kind, title, amount, due_on)
        select a.org_id, x.id, m, 'ortak_gider', '', x.aidat, x.due from _auto_units x where x.aidat > 0
        on conflict (unit_id, month, kind, title) do nothing;
        get diagnostics k = row_count;
        n := n + k;
      end if;
      missing := exists (select 1 from _auto_units x where x.rent > 0 and x.rate is null);
    end if;
    -- Kuru henüz olmayan dövizli birim varsa ay kapanmaz; iş ertesi gün yalnız eksikleri yazar.
    if not missing then update public.site_auto set last_month = m where org_id = a.org_id; end if;
  end loop;
  return n;
end $$;
revoke execute on function public.site_auto_run(date) from public, anon, authenticated;
