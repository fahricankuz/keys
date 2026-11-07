-- Düzenli giderler ve sakinlere kasa özeti (site).
-- 1. Düzenli gider (ör. personel maaşı): kategori, tutar, ayın günü, başlangıç ve isteğe bağlı bitiş ayı. Her gün çalışan iş
--    (site_recurring_run, 09:15 İstanbul) günü gelen ayın giderini kayda düşer; aynı ay iki kez yazılmaz (recurring_id + gün).
-- 2. Şeffaflık (yönetim açarsa; varsayılan kapalı): sakin aylık kasa özetini (devreden, tahsilat, gider, kalan) ve kategori
--    toplamlarını görür (site_cash_summary). Faturaları göstermek ayrı bir seçenektir.
-- Yeni tablo, sütunlar ve işlevler; eski kodla uyumlu, yeniden çalıştırılabilir.

alter table public.site_cash add column if not exists share_summary  boolean not null default false;
alter table public.site_cash add column if not exists share_receipts boolean not null default false;

create table if not exists public.site_recurring_expenses (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  cat         text not null check (length(cat) between 1 and 60),
  amount      numeric not null check (amount > 0),
  day         int not null default 1 check (day between 1 and 28),
  note        text not null default '' check (length(note) <= 500),
  start_month text not null check (start_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  end_month   text check (end_month is null or end_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  active      boolean not null default true,
  last_month  text,
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  check (end_month is null or end_month >= start_month)
);
create index if not exists site_recurring_org on public.site_recurring_expenses (org_id);
alter table public.site_recurring_expenses enable row level security;
drop policy if exists not_banned on public.site_recurring_expenses;
create policy not_banned on public.site_recurring_expenses as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned());
drop policy if exists sre_read on public.site_recurring_expenses;
create policy sre_read on public.site_recurring_expenses for select to authenticated
  using (public.org_can(org_id, 'expenses.manage') or public.org_can(org_id, 'reports.view') or public.is_admin());
drop policy if exists sre_write on public.site_recurring_expenses;
create policy sre_write on public.site_recurring_expenses for all to authenticated
  using (public.org_can(org_id, 'expenses.manage')) with check (public.org_can(org_id, 'expenses.manage'));
grant select, insert, update, delete on public.site_recurring_expenses to authenticated;

alter table public.site_expenses add column if not exists recurring_id uuid references public.site_recurring_expenses(id) on delete set null;
create unique index if not exists site_expenses_recurring on public.site_expenses (recurring_id, spent_on) where recurring_id is not null;

/** Düzenli giderleri kayda düşer: günü gelen (ya da kaçırılan) ayın gideri; aynı ay ikinci kez yazılmaz. */
create or replace function public.site_recurring_run(today date default (now() at time zone 'Europe/Istanbul')::date)
returns int language plpgsql security definer set search_path = public as $$
declare m text := to_char(today, 'YYYY-MM'); m0 date := date_trunc('month', today)::date; n int;
begin
  insert into public.site_expenses (org_id, cat, amount, spent_on, note, recurring_id)
  select r.org_id, r.cat, r.amount, m0 + (r.day - 1), r.note, r.id
  from public.site_recurring_expenses r join public.organizations o on o.id = r.org_id and o.status = 'active'
  where r.active and r.start_month <= m and (r.end_month is null or r.end_month >= m)
    and extract(day from today) >= r.day and coalesce(r.last_month, '') < m
  on conflict do nothing;
  get diagnostics n = row_count;
  update public.site_recurring_expenses r set last_month = m
  from public.organizations o
  where o.id = r.org_id and o.status = 'active' and r.active and r.start_month <= m and (r.end_month is null or r.end_month >= m)
    and extract(day from today) >= r.day and coalesce(r.last_month, '') < m;
  return n;
end $$;
revoke execute on function public.site_recurring_run(date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'anahtar-site-recurring';
    perform cron.schedule('anahtar-site-recurring', '15 6 * * *', 'select public.site_recurring_run()');
  end if;
end $$;

/** Ayın kasa özeti (m: YYYY-AA): yönetimde Raporlar ya da Giderler yetkisi olan her zaman; sakin yalnız yönetim açtıysa.
    { carry, income, spent, left, byCat: [{cat, total}], receipts?: [...] } (receipts yalnız fatura paylaşımı açıksa). */
create or replace function public.site_cash_summary(oid uuid, m text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.site_cash;
  d0 date := to_date(m, 'YYYY-MM');
  d1 date := (to_date(m, 'YYYY-MM') + interval '1 month')::date;
  start date;
  carry numeric; income numeric; spent numeric;
  staff boolean := public.org_can(oid, 'reports.view') or public.org_can(oid, 'expenses.manage') or public.is_admin();
begin
  if m !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Ay geçersiz' using errcode = '22023'; end if;
  select * into c from public.site_cash where org_id = oid;
  if not staff and not (public.is_site_resident(oid) and coalesce(c.share_summary, false)) then
    raise exception 'Kasa özeti paylaşılmıyor' using errcode = '42501';
  end if;
  start := coalesce(c.opening_on, '0001-01-01'::date);
  with col as (
    select coalesce(x.paid_on, (to_date(x.month, 'YYYY-MM') + interval '1 month' - interval '1 day')::date) as day,
           case when x.status = 'paid' then x.amount else x.paid_amount end as v
    from public.site_charges x where x.org_id = oid and x.kind in ('aidat','yakit','demirbas','ozel') and x.status in ('paid','partial')
  ), ex as (select spent_on as day, amount as v from public.site_expenses where org_id = oid)
  select coalesce(c.opening, 0)
           + coalesce((select sum(v) from col where day >= start and day < d0), 0)
           - coalesce((select sum(v) from ex where day >= start and day < d0), 0),
         coalesce((select sum(v) from col where day >= start and day >= d0 and day < d1), 0),
         coalesce((select sum(v) from ex where day >= start and day >= d0 and day < d1), 0)
    into carry, income, spent;
  return jsonb_build_object('month', m, 'carry', carry, 'income', income, 'spent', spent, 'left', carry + income - spent,
    'byCat', (select coalesce(jsonb_agg(jsonb_build_object('cat', cat, 'total', t) order by t desc), '[]'::jsonb) from (
       select cat, sum(amount) t from public.site_expenses where org_id = oid and spent_on >= greatest(d0, start) and spent_on < d1 group by cat) s),
    'receipts', case when staff or coalesce(c.share_receipts, false) then (select coalesce(jsonb_agg(jsonb_build_object('cat', cat, 'amount', amount,
       'day', spent_on, 'name', receipt_name, 'path', receipt_path) order by spent_on), '[]'::jsonb)
       from public.site_expenses where org_id = oid and receipt_path is not null and spent_on >= greatest(d0, start) and spent_on < d1) else null end);
end $$;
grant execute on function public.site_cash_summary(uuid, text) to authenticated;
