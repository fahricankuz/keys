-- site sozlesmeler
-- Hizmet ve tedarikçi sözleşmeleri (asansör bakımı, sigorta, temizlik, güvenlik…): firma, tür, başlangıç/bitiş, tutar, not.
-- Bitişe kalan gün sözleşmedeki hatırlatma günlerinden birine eşitse (varsayılan 30, 15, 7) "Giderler" yetkisi olan yöneticilere
-- bildirim gider (bildirim tetikleyicisi telefon bildirimini ve e-postayı gönderir). Her gün 09:10 İstanbul'da çalışır.
-- Bitiş tarihi uzatılırsa (yenileme) hatırlatmalar yeni tarihe göre yeniden kurulur (etikette bitiş tarihi var).
-- Yeni tablo ve işlev; eski kodla uyumlu, yeniden çalıştırılabilir.

create table if not exists public.site_contracts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  kind        text not null default 'diger' check (kind in ('asansor','sigorta','temizlik','guvenlik','bahce','bakim','diger')),
  vendor      text not null check (length(btrim(vendor)) between 1 and 120),
  phone       text not null default '' check (length(phone) <= 30),
  starts_on   date,
  ends_on     date not null,
  amount      numeric check (amount is null or amount >= 0),
  period      text not null default 'yillik' check (period in ('aylik','yillik','tek')),
  remind_days int[] not null default '{30,15,7}' check (cardinality(remind_days) between 1 and 5 and 0 < all (remind_days) and 366 > all (remind_days)),
  note        text not null default '' check (length(note) <= 500),
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (starts_on is null or starts_on <= ends_on)
);
create index if not exists site_contracts_org on public.site_contracts (org_id, ends_on);
alter table public.site_contracts enable row level security;
drop policy if exists not_banned on public.site_contracts;
create policy not_banned on public.site_contracts as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned());
drop policy if exists sc_read on public.site_contracts;
create policy sc_read on public.site_contracts for select to authenticated
  using (public.org_can(org_id, 'expenses.manage') or public.org_can(org_id, 'reports.view') or public.is_admin());
drop policy if exists sc_write on public.site_contracts;
create policy sc_write on public.site_contracts for all to authenticated
  using (public.org_can(org_id, 'expenses.manage')) with check (public.org_can(org_id, 'expenses.manage'));
grant select, insert, update, delete on public.site_contracts to authenticated;

/** Sözleşme bitiş hatırlatması: bitişe kalan gün hatırlatma günlerinden biriyse "Giderler" yetkisi olan yöneticilere bildirim. */
create or replace function public.site_contract_reminders(today date default (now() at time zone 'Europe/Istanbul')::date)
returns int language plpgsql security definer set search_path = public as $$
declare before int;
begin
  select count(*) into before from public.notifications;
  insert into public.notifications (user_id, title, body, url, tag)
  select p.u, c.vendor || ': sözleşme ' || (c.ends_on - today) || ' gün sonra bitiyor',
         'Bitiş ' || to_char(c.ends_on, 'DD.MM.YYYY') || '. Yenilemeyi ya da yeni teklif almayı planla.',
         '/uygulama/site/sozlesmeler', 'contract-' || c.id || '-' || c.ends_on || '-' || (c.ends_on - today)
  from public.site_contracts c join public.organizations o on o.id = c.org_id and o.status = 'active'
  cross join lateral public.org_people(c.org_id, 'expenses.manage') p(u)
  where (c.ends_on - today) = any (c.remind_days)
  on conflict do nothing;
  return (select count(*) from public.notifications) - before;
end $$;
revoke execute on function public.site_contract_reminders(date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'anahtar-site-contracts';
    perform cron.schedule('anahtar-site-contracts', '10 6 * * *', 'select public.site_contract_reminders()');
  end if;
end $$;
