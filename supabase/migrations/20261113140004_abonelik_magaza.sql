-- abonelik ve mağaza (üretim öncesi güvenlik denetimi ve mağaza hazırlığı, 2026-11-13)
-- 1. app_config: uygulamanın okuduğu, yöneticinin değiştirdiği ayarlar. "billing_paused" (ödeme duraklatma bayrağı) şimdiye dek uygulamada sabitti
--    (config.js billing.paused = true); mağazalar onaylayınca veritabanından açılır. Mevcut davranış değişmez: bayrak doğru (true) ile başlar.
-- 2. Mağaza test (sandbox) satın alımları erişim verir (access_state aynen sayar) ama gelir ve KPI hesaplarına (admin_kpis) ile abonelik
--    hatırlatmasına (billing_reminders) girmez.
-- 3. billing_reconcile_candidates(): günlük uzlaştırma işi (billing işlevi, service_role) için, süresi 2 gün içinde dolacak ya da son 30 günde dolmuş
--    mağaza abonelikleri.
-- 4. subscriptions yedek koruma: service_role (mağaza eşitlemesi) yöneticinin verdiği ya da promosyon olarak verilmiş ve süresi dolmamış paketi ezemez
--    (billing işlevi de bu satırları atlar; bu ikinci kattır). Süresi dolmuş hibe eşitlemeyle değiştirilebilir.
-- Yeniden çalıştırılabilir.

-- ---------------------------------------------------------------------
-- 1. app_config
-- ---------------------------------------------------------------------
create table if not exists public.app_config (
  key        text primary key check (key ~ '^[a-z][a-z0-9_]{0,63}$'),
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
drop policy if exists app_config_read on public.app_config;
create policy app_config_read on public.app_config for select to anon, authenticated using (true);
drop policy if exists app_config_admin on public.app_config;
create policy app_config_admin on public.app_config for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
revoke all on public.app_config from anon, authenticated;
grant select on public.app_config to anon, authenticated;
grant insert, update, delete on public.app_config to authenticated;     -- yazma yalnız yönetici politikasından geçer
insert into public.app_config (key, value) values ('billing_paused', 'true'::jsonb) on conflict (key) do nothing;

drop trigger if exists touch_app_config on public.app_config;
create trigger touch_app_config before update on public.app_config for each row execute function public.touch_updated_at();

-- Yöneticinin ayar değişikliği işlem kaydına yazılır (ödeme duraklatma bayrağı önemlidir).
create or replace function public.app_config_audit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.audit('config.set', new.key, jsonb_build_object('value', new.value));
  return new;
end $$;
revoke execute on function public.app_config_audit() from public, anon, authenticated;
drop trigger if exists app_config_audit on public.app_config;
create trigger app_config_audit after insert or update on public.app_config for each row
  when (auth.uid() is not null) execute function public.app_config_audit();

-- ---------------------------------------------------------------------
-- 2. Sandbox satın alımları gelir/KPI dışında
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_kpis(days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d int := least(greatest(days, 1), 365);
  res jsonb;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  with owners as (
    -- Mağaza test (sandbox) satın alımları erişim verir (access_state) ama ödeyen/gelir sayımına girmez: o hesaplar "abone değil" sayılır.
    select p.id,
           case when exists (select 1 from public.subscriptions sx where sx.user_id = p.id and sx.environment = 'sandbox')
                then public.access_state(p.id) || jsonb_build_object('subscribed', false, 'plan', null)
                else public.access_state(p.id) end a,
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
    'billingIssues', (select count(*) from public.subscriptions where billing_issue and coalesce(environment, '') <> 'sandbox'),
    'cancelling', (select count(*) from public.subscriptions where active and not will_renew and store <> 'admin' and coalesce(environment, '') <> 'sandbox'),
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
end $function$;

CREATE OR REPLACE FUNCTION public.billing_reminders(today date DEFAULT ((now() AT TIME ZONE 'Europe/Istanbul'::text))::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int;
begin
  with due as (
    select s.user_id, s.product_id, s.period_type, s.store, s.expires_at
      from public.subscriptions s
     where s.active and s.will_renew and coalesce(s.store, '') not in ('admin', 'promotional') and coalesce(s.environment, '') <> 'sandbox' and s.expires_at is not null
       and (s.expires_at at time zone 'Europe/Istanbul')::date = today + 1
  ), ins as (
    insert into public.notifications (user_id, title, body, url, tag)
    select d.user_id,
      case when d.period_type in ('trial','intro') then 'Ücretsiz denemen yarın bitiyor' else 'Aboneliğin yarın yenilenecek' end,
      case when d.period_type in ('trial','intro') then 'Yarın ilk ödemen alınacak.' else 'Yarın ödemen alınacak.' end
        || ' Paket: ' || case public.plan_of(d.product_id) when 'tek' then 'Başlangıç' when 'bes' then 'Profesyonel' when 'kurumsal' then 'Kurumsal' else 'Abonelik' end
        || coalesce(' · ' || public.product_units(d.product_id)::text || ' mülk', '')
        || case when d.product_id ~ '_yillik$' then ' · yıllık' when d.product_id ~ '_aylik$' then ' · aylık' else '' end
        || '. İptal etmek istersen ' || case d.store when 'app_store' then 'App Store' when 'play_store' then 'Google Play' else 'ödeme' end
        || ' abonelik ayarlarından bugün iptal edebilirsin.',
      '/uygulama/ayarlar', 'bill-' || to_char(today + 1, 'YYYYMMDD')
      from due d
    on conflict do nothing
    returning 1
  )
  select count(*) into n from ins;
  return n;
end $function$;

-- ---------------------------------------------------------------------
-- 3. Günlük uzlaştırma adayları (yalnız service_role)
-- ---------------------------------------------------------------------
create or replace function public.billing_reconcile_candidates() returns setof uuid
language sql stable security definer set search_path = public as $$
  select s.user_id from public.subscriptions s
   where coalesce(s.store, '') not in ('', 'admin', 'promotional')
     and s.expires_at is not null
     and s.expires_at < now() + interval '2 days'
     and s.expires_at > now() - interval '30 days'
   order by s.expires_at
$$;
revoke execute on function public.billing_reconcile_candidates() from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then grant execute on function public.billing_reconcile_candidates() to service_role; end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Hibe (admin / promotional) satırı mağaza eşitlemesiyle ezilmez
-- ---------------------------------------------------------------------
create or replace function public.guard_grant() returns trigger
language plpgsql set search_path = public as $$
begin
  -- Yalnız service_role (billing edge işlevi): yönetici işlevleri (security definer) ve SQL bu denetimden geçer.
  if current_user = 'service_role' and old.active and (old.expires_at is null or old.expires_at > now()) then
    if old.store = 'admin' then return old; end if;
    if old.store = 'promotional' and not (new.active and new.store = 'promotional') then return old; end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_grant() from public, anon;
drop trigger if exists guard_grant on public.subscriptions;
create trigger guard_grant before update on public.subscriptions for each row execute function public.guard_grant();
