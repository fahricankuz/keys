-- Abonelik geçmişi, churn ve kohort (yönetici paneli → Büyüme).
-- 1. subscription_events: abonelik satırındaki her durum değişikliği bir olay olarak yazılır (tetikleyici):
--    basladi (ödeyen abone oldu), iptal (otomatik yenilemeyi kapattı; süre bitene kadar erişimi var), yeniden (yenilemeyi
--    tekrar açtı), odeme_sorunu (mağaza ödemeyi alamadı), bitti (aboneliği sona erdi = ayrıldı).
--    subscriptions tablosu yalnız bugünkü durumu tuttuğu için geçmiş buradan okunur.
-- 2. Geçmiş doldurma (yalnız tablo boşken, bir kez): sona ermiş aboneliklere bitiş tarihinde "bitti" olayı (backfill = true).
--    Başlangıç tarihleri bilinmez; ayrılıp sonra geri dönenler görünmez. Panel bunu "yaklaşık" diye belirtir.
-- 3. admin_subscription_events(): yönetici için olaylar; bugünkü durum mevcut admin_subscriptions() ile gelir
--    (churn, erken uyarı ve ödeme kohortu uygulamada hesaplanır).
-- 4. admin_cohorts(n): kayıt ayına göre kohortlar ve sonraki aylarda en az bir işlem yapan kişi sayısı (etkinlik kohortu;
--    activity tablosu geçmişi tuttuğu için geçmiş aylar da dolar).
-- Yeni tablo ve işlevler; eski kodla uyumlu, yeniden çalıştırılabilir.

create table if not exists public.subscription_events (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('basladi','iptal','yeniden','odeme_sorunu','bitti')),
  product_id  text,
  period_type text,
  backfill    boolean not null default false,
  at          timestamptz not null default now()
);
create index if not exists subscription_events_at on public.subscription_events (at);
create index if not exists subscription_events_user on public.subscription_events (user_id, at);
alter table public.subscription_events enable row level security;
drop policy if exists subev_admin_read on public.subscription_events;
create policy subev_admin_read on public.subscription_events for select to authenticated using (public.is_admin());
grant select on public.subscription_events to authenticated;
revoke insert, update, delete on public.subscription_events from authenticated;

/** subscriptions satırı değişince olay yazar (sandbox ortamındaki deneme satın almaları sayılmaz). */
create or replace function public.subscription_log()
returns trigger language plpgsql security definer set search_path = public as $$
declare was_active boolean := tg_op = 'UPDATE' and old.active;
begin
  if coalesce(new.environment, 'production') = 'sandbox' then return null; end if;
  if new.active and not was_active then
    insert into public.subscription_events (user_id, kind, product_id, period_type) values (new.user_id, 'basladi', new.product_id, new.period_type);
  elsif was_active and not new.active then
    insert into public.subscription_events (user_id, kind, product_id, period_type) values (new.user_id, 'bitti', new.product_id, new.period_type);
  elsif new.active and tg_op = 'UPDATE' then
    if old.will_renew and not new.will_renew then
      insert into public.subscription_events (user_id, kind, product_id, period_type) values (new.user_id, 'iptal', new.product_id, new.period_type);
    elsif not old.will_renew and new.will_renew then
      insert into public.subscription_events (user_id, kind, product_id, period_type) values (new.user_id, 'yeniden', new.product_id, new.period_type);
    end if;
  end if;
  if new.billing_issue and (tg_op = 'INSERT' or not old.billing_issue) then
    insert into public.subscription_events (user_id, kind, product_id, period_type) values (new.user_id, 'odeme_sorunu', new.product_id, new.period_type);
  end if;
  return null;
end $$;
revoke execute on function public.subscription_log() from public, anon, authenticated;
drop trigger if exists subscriptions_log on public.subscriptions;
create trigger subscriptions_log after insert or update on public.subscriptions for each row execute function public.subscription_log();

-- Geçmiş doldurma: yalnız ilk kez (tabloda hiç olay yokken).
insert into public.subscription_events (user_id, kind, product_id, period_type, backfill, at)
select s.user_id, 'bitti', s.product_id, s.period_type, true, s.expires_at
from public.subscriptions s
where not s.active and s.expires_at is not null and coalesce(s.environment, 'production') <> 'sandbox'
  and not exists (select 1 from public.subscription_events);

/** Yönetici: son 3 yılın abonelik olayları (bugünkü durum mevcut admin_subscriptions() ile gelir). */
create or replace function public.admin_subscription_events()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', e.user_id, 'kind', e.kind, 'product_id', e.product_id,
      'period_type', e.period_type, 'backfill', e.backfill, 'at', e.at) order by e.at, e.id)
    from public.subscription_events e where e.at > now() - interval '3 years'), '[]'::jsonb);
end $$;
revoke execute on function public.admin_subscription_events() from public, anon;
grant execute on function public.admin_subscription_events() to authenticated;

/** Yönetici: etkinlik kohortu. Son n kayıt ayı (İstanbul saati) × rol; her ay için kohorttan en az bir işlem yapan kişi sayısı. */
create or replace function public.admin_cohorts(n int default 12)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare since date := (date_trunc('month', now() at time zone 'Europe/Istanbul') - make_interval(months => greatest(1, least(n, 36)) - 1))::date;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  return coalesce((
    with c as (
      select p.id, p.role, to_char(p.created_at at time zone 'Europe/Istanbul', 'YYYY-MM') as cohort
      from public.profiles p
      where (p.created_at at time zone 'Europe/Istanbul')::date >= since
        and not exists (select 1 from public.admins a where a.user_id = p.id)
    ), size as (
      select cohort, role, count(*) as n from c group by cohort, role
    ), act as (
      select c.cohort, c.role, to_char(a.at at time zone 'Europe/Istanbul', 'YYYY-MM') as month, count(distinct c.id) as n
      from c join public.activity a on a.actor = c.id
      where (a.at at time zone 'Europe/Istanbul')::date >= since
      group by 1, 2, 3
    )
    select jsonb_agg(jsonb_build_object('cohort', s.cohort, 'role', s.role, 'size', s.n,
             'active', coalesce((select jsonb_object_agg(x.month, x.n) from act x where x.cohort = s.cohort and x.role = s.role), '{}'::jsonb))
           order by s.cohort, s.role)
    from size s), '[]'::jsonb);
end $$;
revoke execute on function public.admin_cohorts(int) from public, anon;
grant execute on function public.admin_cohorts(int) to authenticated;
