-- Yönetici paneli: genel bakış, büyüme, gelir ve gider.
-- 1. admin_kpis'e eklenen alanlar (eski alanlar aynı; eski ekran yenilerini görmez, bozulmaz):
--    orgRent (kurumların tahsil ettiği kira ve ciro farkı), aidat (bireysel + site aidatı), revenueBase (tahmini gelir için
--    paket / dönem / mülk adedi), orgs (kurum sayısı, sektörler, yönetilen birim, biten sözleşme).
--    Tutarlar TL: bireysel ödemeler TL'dir, kurum tahakkukları dövizliyse tahakkuk anında TL'ye çevrilip saklanır.
-- 2. Gider kayıtları (admin_costs): yalnız anahtar yöneticisi görür; ekleme, düzenleme ve silme İşlem kaydı'na düşer.
--    Tek seferlik, aylık ya da yıllık; para birimi ₺ / $ / € (ekranda o günün TCMB kuruyla TL'ye çevrilir); KDV dahil/hariç ve oranı.
-- Yeni tablo ve işlevler, işlev gövdesi; eski kodla uyumlu, yeniden çalıştırılabilir.

/** Kurum tahakkuklarında bir ayın tahsil edilen tutarı (ödenen ya da kısmi ödenen; TL). */
create or replace function public.admin_collected(kinds text[], m text)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when status = 'paid' then amount else paid_amount end), 0)
  from public.site_charges where kind = any(kinds) and month = m and status in ('paid','partial')
$$;
revoke execute on function public.admin_collected(text[], text) from public, anon, authenticated;

create or replace function public.admin_kpis(days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d int := least(greatest(days, 1), 365);
  res jsonb;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  with owners as (
    select p.id, public.access_state(p.id) a,
           exists (select 1 from public.activity x where x.actor = p.id and x.at > now() - interval '30 days') active
    from public.profiles p where p.role = 'landlord'
  )
  select jsonb_build_object(
    'days', d,
    'users', (select jsonb_build_object('total', count(*), 'landlords', count(*) filter (where role = 'landlord'),
                                        'tenants', count(*) filter (where role = 'tenant'), 'team', count(*) filter (where role = 'team'))
              from public.profiles),
    'signups', jsonb_build_object(
       'period', (select count(*) from public.profiles where created_at > now() - make_interval(0, 0, 0, d)),
       'prev', (select count(*) from public.profiles where created_at <= now() - make_interval(0, 0, 0, d)
                                                       and created_at > now() - make_interval(0, 0, 0, 2 * d))),
    'owners', (select jsonb_build_object('total', count(*),
                 'paying', count(*) filter (where (a ->> 'subscribed')::boolean),
                 'trial', count(*) filter (where (a ->> 'inTrial')::boolean),
                 'expiring', count(*) filter (where (a ->> 'inTrial')::boolean and (a ->> 'trialEnds')::timestamptz < now() + interval '7 days'),
                 'active', count(*) filter (where active),
                 'lapsed', count(*) filter (where not (a ->> 'access')::boolean)) from owners),
    'plans', (select coalesce(jsonb_object_agg(plan, n), '{}'::jsonb) from
               (select a ->> 'plan' plan, count(*) n from owners where (a ->> 'subscribed')::boolean group by 1) x),
    'billingIssues', (select count(*) from public.subscriptions where billing_issue),
    'cancelling', (select count(*) from public.subscriptions where active and not will_renew and store <> 'admin'),
    'units', jsonb_build_object('total', (select count(*) from public.properties),
                                'connected', (select count(distinct property_id) from public.memberships where role = 'tenant')),
    'rent', jsonb_build_object(
       'month', (select coalesce(sum(amount), 0) from public.payments where kind = 'kira' and status in ('approved','partial') and month = to_char(now(), 'YYYY-MM')),
       'prevMonth', (select coalesce(sum(amount), 0) from public.payments where kind = 'kira' and status in ('approved','partial') and month = to_char(now() - interval '1 month', 'YYYY-MM'))),
    'supportOpen', (select count(*) from public.support_requests where status = 'open'),
    -- Aktivasyon hunisi: mülk sahibi → mülk ekledi → kiracı bağlandı → onaylı ödeme aldı.
    'funnel', (select jsonb_build_object(
       'owners', count(*),
       'withProperty', count(*) filter (where exists (select 1 from public.properties pr where pr.owner_id = o.id)),
       'withTenant', count(*) filter (where exists (select 1 from public.properties pr join public.memberships m on m.property_id = pr.id
                                                     where pr.owner_id = o.id and m.role = 'tenant')),
       'withPayment', count(*) filter (where exists (select 1 from public.properties pr join public.payments pa on pa.property_id = pr.id
                                                      where pr.owner_id = o.id and pa.status in ('approved','partial'))))
       from public.profiles o where o.role = 'landlord'),
    -- Etkin kullanıcı: son 7 / 30 günde en az bir işlem yapan (mülk sahibi, kiracı, ekip).
    'activeUsers', jsonb_build_object(
       'week', (select count(distinct actor) from public.activity where at > now() - interval '7 days'),
       'month', (select count(distinct actor) from public.activity where at > now() - interval '30 days')),
    -- Kiracı davetleri: dönemde oluşturulan ve kabul edilen.
    'invites', jsonb_build_object(
       'created', (select count(*) from public.invites where role = 'tenant' and created_at > now() - make_interval(0, 0, 0, d)),
       'accepted', (select count(*) from public.invites where role = 'tenant' and accepted_at > now() - make_interval(0, 0, 0, d))),
    -- Arıza / tadilat talepleri.
    'requests', jsonb_build_object(
       'open', (select count(*) from public.requests where status < 3),
       'done', (select count(*) from public.requests where status = 3),
       'period', (select count(*) from public.requests where req_date > current_date - d)),
    -- Geçen ayın ödemeleri: vadesinde (ödeme günü ≤ vade günü) ya da geç.
    'punctuality', (select jsonb_build_object(
       'onTime', count(*) filter (where pa.paid_on <= make_date(split_part(pa.month, '-', 1)::int, split_part(pa.month, '-', 2)::int, least(greatest(pr.due_day, 1), 28))),
       'late', count(*) filter (where pa.paid_on > make_date(split_part(pa.month, '-', 1)::int, split_part(pa.month, '-', 2)::int, least(greatest(pr.due_day, 1), 28))))
       from public.payments pa join public.properties pr on pr.id = pa.property_id
       where pa.kind = 'kira' and pa.status in ('approved','partial') and pa.paid_on is not null and pa.month = to_char(now() - interval '1 month', 'YYYY-MM')),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('d', g::date,
                 'landlords', (select count(*) from public.profiles where role = 'landlord' and created_at::date = g::date),
                 'tenants', (select count(*) from public.profiles where role <> 'landlord' and created_at::date = g::date)) order by g), '[]'::jsonb)
               from generate_series(current_date - (d - 1), current_date, interval '1 day') g),
    -- Kurum kiraları (AVM, depo, GYO, site): tahsil edilen kira ve ciro farkı (tahakkukta TL'ye çevrilmiş tutar).
    'orgRent', jsonb_build_object(
       'month', (select public.admin_collected(array['kira','ciro'], to_char(now(), 'YYYY-MM'))),
       'prevMonth', (select public.admin_collected(array['kira','ciro'], to_char(now() - interval '1 month', 'YYYY-MM')))),
    -- Aidat hacmi: bireysel mülklerin onaylı aidat ödemeleri + sitelerde tahsil edilen aidat (yakıt, demirbaş, özel toplama dahil).
    'aidat', jsonb_build_object(
       'month', (select coalesce(sum(amount), 0) from public.payments where kind = 'aidat' and status in ('approved','partial') and month = to_char(now(), 'YYYY-MM')),
       'prevMonth', (select coalesce(sum(amount), 0) from public.payments where kind = 'aidat' and status in ('approved','partial') and month = to_char(now() - interval '1 month', 'YYYY-MM')),
       'siteMonth', (select public.admin_collected(array['aidat','yakit','demirbas','ozel'], to_char(now(), 'YYYY-MM'))),
       'sitePrev', (select public.admin_collected(array['aidat','yakit','demirbas','ozel'], to_char(now() - interval '1 month', 'YYYY-MM')))),
    -- Tahmini gelirin tabanı: ödeyen mülk sahipleri paket, dönem (aylık / yıllık) ve mülk adedine göre (fiyat uygulamada).
    'revenueBase', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
       -- Adet: yöneticinin verdiği pakette subscriptions.units, mağaza ürününde kimlikteki sayı ("bes_5_yillik"), yoksa 1.
       select o.a ->> 'plan' as plan, coalesce(sb.product_id, '') ~* '(yillik|yearly|annual)' as yearly, count(*) as owners,
              sum(greatest(coalesce(sb.units, (regexp_match(coalesce(sb.product_id, ''), '_([0-9]+)_(aylik|yillik)'))[1]::int, 1), 1)) as units
       from owners o left join public.subscriptions sb on sb.user_id = o.id
       where (o.a ->> 'subscribed')::boolean group by 1, 2) x),
    -- Kurumlar: sayı, sektör dağılımı, yönetilen birim (site dairesi, mağaza, depo) ve sözleşmedeki adet.
    'orgs', (select jsonb_build_object(
       'total', count(*), 'active', count(*) filter (where status = 'active'),
       'bySector', (select coalesce(jsonb_object_agg(sector, n), '{}'::jsonb) from (select sector, count(*) n from public.organizations group by 1) s),
       'units', (select count(*) from public.site_units),
       'contracted', coalesce(sum(units), 0),
       'ending', count(*) filter (where contract_until is not null and contract_until < current_date + 60)) from public.organizations)
  ) into res;
  return res;
end $$;
grant execute on function public.admin_kpis(int) to authenticated;

create table if not exists public.admin_costs (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(btrim(title)) between 1 and 120),
  category     text not null check (category in ('altyapi','magaza','odeme','vergi','pazarlama','hizmet','diger')),
  amount       numeric(14,2) not null check (amount > 0),
  currency     text not null default 'TRY' check (currency in ('TRY','USD','EUR')),
  vat_included boolean not null default true,
  vat_rate     numeric(5,2) not null default 20 check (vat_rate >= 0 and vat_rate <= 100),
  recurrence   text not null default 'once' check (recurrence in ('once','monthly','yearly')),
  start_on     date not null default current_date,
  end_on       date,
  note         text not null default '' check (length(note) <= 1000),
  created_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_on is null or end_on >= start_on)
);
alter table public.admin_costs enable row level security;
drop policy if exists ac_admin on public.admin_costs;
create policy ac_admin on public.admin_costs for select to authenticated using (public.is_admin());
grant select on public.admin_costs to authenticated;
revoke insert, update, delete on public.admin_costs from anon, authenticated;

/** Yönetici: gider ekler ya da düzenler (p.id varsa). Kayıt İşlem kaydı'na düşer. */
create or replace function public.admin_cost_save(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid := nullif(p ->> 'id', '')::uuid; r public.admin_costs;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  r.title := btrim(coalesce(p ->> 'title', ''));
  r.category := coalesce(nullif(p ->> 'category', ''), 'diger');
  r.amount := nullif(p ->> 'amount', '')::numeric;
  r.currency := coalesce(nullif(p ->> 'currency', ''), 'TRY');
  r.vat_included := coalesce((p ->> 'vat_included')::boolean, true);
  r.vat_rate := coalesce(nullif(p ->> 'vat_rate', '')::numeric, 20);
  r.recurrence := coalesce(nullif(p ->> 'recurrence', ''), 'once');
  r.start_on := coalesce(nullif(p ->> 'start_on', '')::date, current_date);
  r.end_on := nullif(p ->> 'end_on', '')::date;
  r.note := coalesce(p ->> 'note', '');
  if r.title = '' then raise exception 'Başlık yaz.' using errcode = '22023'; end if;
  if r.amount is null or r.amount <= 0 then raise exception 'Tutar sıfırdan büyük olmalı.' using errcode = '22023'; end if;
  if r.end_on is not null and r.end_on < r.start_on then raise exception 'Bitiş, başlangıçtan önce olamaz.' using errcode = '22023'; end if;
  if cid is null then
    insert into public.admin_costs (title, category, amount, currency, vat_included, vat_rate, recurrence, start_on, end_on, note)
    values (r.title, r.category, r.amount, r.currency, r.vat_included, r.vat_rate, r.recurrence, r.start_on, r.end_on, r.note)
    returning id into cid;
    perform public.audit('cost.create', cid::text, jsonb_build_object('title', r.title, 'amount', r.amount, 'currency', r.currency, 'recurrence', r.recurrence));
  else
    update public.admin_costs set title = r.title, category = r.category, amount = r.amount, currency = r.currency, vat_included = r.vat_included,
      vat_rate = r.vat_rate, recurrence = r.recurrence, start_on = r.start_on, end_on = r.end_on, note = r.note, updated_at = now()
    where id = cid;
    if not found then raise exception 'Gider bulunamadı' using errcode = 'P0002'; end if;
    perform public.audit('cost.update', cid::text, jsonb_build_object('title', r.title, 'amount', r.amount, 'currency', r.currency, 'recurrence', r.recurrence));
  end if;
  return cid;
end $$;
grant execute on function public.admin_cost_save(jsonb) to authenticated;

create or replace function public.admin_cost_delete(cid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare ttl text;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  delete from public.admin_costs where id = cid returning title into ttl;
  if ttl is null then raise exception 'Gider bulunamadı' using errcode = 'P0002'; end if;
  perform public.audit('cost.delete', cid::text, jsonb_build_object('title', ttl));
end $$;
grant execute on function public.admin_cost_delete(uuid) to authenticated;
