-- Ödeyen kuralı ve bildirim ayarları (site).
-- 1. Aidatı kim öder: dairede seçilen rol (payer); o rolde hesabı bağlı kimse yoksa diğer rol. Kural tek yerde (site_payer):
--    aidat hatırlatması, sakinin ekranı (my_site_units: payer_effective, pays) ve dekont düğmesi aynı sonucu verir.
--    Evde kiracı yoksa malik dekont yükler ve hatırlatmayı o alır.
-- 2. Yöneticinin bildirim ayarları (profiles.settings; yoksa açık): siteReceipt (dekont geldiğinde), siteRequest (yeni talep),
--    siteLate (geciken daireler özeti). Bugün giden hiçbir bildirim kendiliğinden kesilmez.
-- 3. Geciken daireler özeti: her pazartesi 09:00 (İstanbul), yalnız gecikme varsa; son ödeme gününden 5 gün geçmiş, ödenmemiş
--    tahakkuklar kurum başına tek bildirimde ("3 daire geç ödedi, toplam ₺4.500"). Alıcı: tahakkuk ya da dekont yetkisi olanlar.
-- Yeni işlevler ve işlev gövdeleri; eski kodla uyumlu (my_site_units eski alanları korur), yeniden çalıştırılabilir.

/** Kişi bu bildirimi istiyor mu? Ayar yoksa evet. */
create or replace function public.wants(uid uuid, k text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select (settings ->> k)::boolean from public.profiles where id = uid), true)
$$;
revoke execute on function public.wants(uuid, text) from public, anon, authenticated;

/** Dairede aidatı fiilen kim öder: seçilen rol; o rolde hesabı bağlı kimse yoksa (ve diğer rolde varsa) diğer rol. */
create or replace function public.site_payer(unit uuid)
returns text language sql stable security definer set search_path = public as $$
  with u as (select payer from public.site_units where id = unit),
  roles as (
    select r.role from public.site_residents r where r.unit_id = unit and r.user_id is not null
    union
    select 'kiraci' from public.properties p join public.memberships m on m.property_id = p.id and m.role = 'tenant' where p.site_unit_id = unit
  )
  select case when exists (select 1 from roles where role = u.payer) or not exists (select 1 from roles) then u.payer
              else case u.payer when 'kiraci' then 'malik' else 'kiraci' end end
  from u
$$;
revoke execute on function public.site_payer(uuid) from public, anon, authenticated;

create or replace function public.my_site_units()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'unit_id', u.id, 'org_id', o.id, 'org', o.name, 'sector', o.sector, 'block', u.block, 'no', u.no, 'area', u.area, 'aidat', u.aidat,
    'payer', u.payer, 'role', l.role, 'rent', u.rent,
    'payer_effective', public.site_payer(u.id), 'pays', public.site_payer(u.id) = l.role, 'currency', u.currency, 'turnover_rate', u.turnover_rate,
    'lease_start', u.lease_start, 'lease_end', u.lease_end,
    'property_id', (select p.id from public.properties p where p.site_unit_id = u.id
                     and (p.owner_id = auth.uid() or exists (select 1 from public.memberships m where m.property_id = p.id and m.user_id = auth.uid()))
                     limit 1)) order by o.name, u.block, u.no), '[]'::jsonb)
  from (select unit_id, case when bool_or(role = 'malik') then 'malik' else 'kiraci' end as role
          from public.site_links(auth.uid()) group by unit_id) l
  join public.site_units u on u.id = l.unit_id join public.organizations o on o.id = u.org_id
$$;
grant execute on function public.my_site_units() to authenticated;

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
  return (select count(*) from public.notifications) - before;
end $$;
revoke execute on function public.site_reminders(date) from public, anon, authenticated;

create or replace function public.on_site_charge_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare lbl text := public.unit_label(new.unit_id);
begin
  if new.status = 'review' and old.status is distinct from 'review' then
    insert into public.notifications (user_id, title, body, url)
    select u, lbl || ': dekont geldi', new.month || ' ' || public.charge_word(new.kind, new.title)
             || ' için ' || public.fmt_tl(new.paid_amount) || ' ödendi.', '/uygulama/site'
    from public.org_people(new.org_id, 'payments.approve') u where u is distinct from auth.uid()
      and public.wants(u, 'siteReceipt');
  elsif new.status in ('paid','partial','rejected') and old.status = 'review' and new.paid_by is not null then
    insert into public.notifications (user_id, title, body, url)
    values (new.paid_by, case when new.status = 'rejected' then 'Dekont reddedildi' else 'Ödemen onaylandı' end,
            lbl || ' · ' || new.month || case when new.status = 'rejected' then ': ' || coalesce(new.reject_reason, '') else '' end, '/uygulama/sitem');
  end if;
  return new;
end $$;

create or replace function public.on_site_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, title, body, url)
    select u, coalesce(public.unit_label(new.unit_id) || ': ', '') || 'yeni talep', new.title, '/uygulama/site'
    from public.org_people(new.org_id, 'requests.manage') u where public.wants(u, 'siteRequest');
  elsif (new.status <> old.status or new.reply <> old.reply) and new.user_id is not null then
    insert into public.notifications (user_id, title, body, url)
    values (new.user_id, 'Talebin güncellendi', new.title || case when new.reply <> '' then ': ' || left(new.reply, 200) else '' end, '/uygulama/sitem');
  end if;
  return null;
end $$;

/** Geciken daireler özeti (haftalık): son ödeme gününden 5 gün geçmiş ödenmemiş tahakkuklar, kurum başına tek bildirim. */
create or replace function public.site_late_digest(today date default (now() at time zone 'Europe/Istanbul')::date)
returns int language plpgsql security definer set search_path = public as $$
declare before int;
begin
  select count(*) into before from public.notifications;
  with late as (
    select c.org_id, c.unit_id, c.amount - case when c.status = 'partial' then c.paid_amount else 0 end as left_amount
    from public.site_charges c join public.organizations o on o.id = c.org_id and o.status = 'active'
    where c.status in ('open','partial','rejected')
      and coalesce(c.due_on, (date_trunc('month', to_date(c.month, 'YYYY-MM')) + interval '1 month' - interval '1 day')::date) + 5 < today
  ), per as (
    select l.org_id, count(distinct l.unit_id) as units, sum(l.left_amount) as total from late l group by l.org_id
  ), who as (
    select p.*, x.u from per p
    join lateral (select public.org_people(p.org_id, 'charges.manage') u union select public.org_people(p.org_id, 'payments.approve')) x on true
  )
  insert into public.notifications (user_id, title, body, url, tag)
  select w.u,
         case when o.sector = 'site' then 'Aidatı geciken daireler' else 'Kirası geciken birimler' end,
         o.name || ': ' || w.units || case when o.sector = 'site' then ' daire' else ' birim' end || ' geç ödedi, toplam '
           || public.fmt_tl(w.total) || ' (son ödeme gününden 5 günden fazla geçti).',
         '/uygulama/site/tahakkuk', 'site-late-' || w.org_id || '-' || to_char(today, 'IYYY-IW')
  from who w join public.organizations o on o.id = w.org_id
  where public.wants(w.u, 'siteLate')
  on conflict do nothing;
  return (select count(*) from public.notifications) - before;
end $$;
revoke execute on function public.site_late_digest(date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'anahtar-site-late';
    perform cron.schedule('anahtar-site-late', '0 6 * * 1', 'select public.site_late_digest()');
  end if;
end $$;
