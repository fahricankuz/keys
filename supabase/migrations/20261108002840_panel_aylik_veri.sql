-- Yönetici paneli: aylık veri (Ay / Yıl görünümü ve genel bakış grafiği).
-- 1. admin_monthly(y): seçilen yılın 12 ayı için kira hacmi (bireysel + kurum), aidat hacmi (bireysel + site), kartla ödenen tutar
--    (sanal POS; işlem ücreti ve POS maliyeti uygulamada oranlarla hesaplanır), ödenen hukuki destek ücreti, yeni kayıt.
--    Ay, ödemenin ait olduğu ay (tahakkuk ayı); hukuki ücrette ödeme günü; kayıtta hesabın açıldığı gün.
-- 2. Üyelik geliri tahmini her ay kaydedilir (admin_revenue_months): geçmişte mağaza ödemeleri tutulmadığı için tahmin bundan
--    sonra ay ay birikir; panel açıldığında o ayın tahmini yazılır (yalnız yönetici). Geçmiş aylar "veri yok" görünür.
-- Yeni tablo ve işlevler; eski kodla uyumlu, yeniden çalıştırılabilir.

create or replace function public.admin_monthly(y int)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'month', m,
      'rent', (select coalesce(sum(amount), 0) from public.payments where kind = 'kira' and status in ('approved','partial') and month = m),
      'orgRent', public.admin_collected(array['kira','ciro'], m),
      'aidat', (select coalesce(sum(amount), 0) from public.payments where kind = 'aidat' and status in ('approved','partial') and month = m),
      'siteAidat', public.admin_collected(array['aidat','yakit','demirbas','ozel'], m),
      'card', (select coalesce(sum(amount), 0) from public.payments where method = 'pos' and status in ('approved','partial') and month = m)
            + (select coalesce(sum(case when status = 'paid' then amount else paid_amount end), 0) from public.site_charges
                where method = 'pos' and status in ('paid','partial') and month = m),
      'legal', (select coalesce(sum(price), 0) from public.legal_requests where paid_at is not null and to_char(paid_at at time zone 'Europe/Istanbul', 'YYYY-MM') = m),
      'signups', (select count(*) from public.profiles where to_char(created_at at time zone 'Europe/Istanbul', 'YYYY-MM') = m),
      'mrr', (select mrr from public.admin_revenue_months r where r.month = m),
      'payers', (select payers from public.admin_revenue_months r where r.month = m)
    ) order by m), '[]'::jsonb)
    from (select to_char(make_date(y, g, 1), 'YYYY-MM') m from generate_series(1, 12) g) months
  );
end $$;
grant execute on function public.admin_monthly(int) to authenticated;

create table if not exists public.admin_revenue_months (
  month      text primary key check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  mrr        numeric not null check (mrr >= 0),
  payers     int not null default 0 check (payers >= 0),
  updated_at timestamptz not null default now()
);
alter table public.admin_revenue_months enable row level security;
drop policy if exists arm_admin on public.admin_revenue_months;
create policy arm_admin on public.admin_revenue_months for select to authenticated using (public.is_admin());
grant select on public.admin_revenue_months to authenticated;
revoke insert, update, delete on public.admin_revenue_months from anon, authenticated;

/** Bu ayın tahmini üyelik gelirini yazar (panel açılınca; yalnız yönetici, yalnız içinde bulunulan ay). */
create or replace function public.admin_revenue_save(mrr numeric, payers int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  if mrr is null or mrr < 0 or payers is null or payers < 0 then raise exception 'Tutar geçersiz' using errcode = '22023'; end if;
  insert into public.admin_revenue_months (month, mrr, payers, updated_at)
  values (to_char(now() at time zone 'Europe/Istanbul', 'YYYY-MM'), round(mrr, 2), payers, now())
  on conflict (month) do update set mrr = excluded.mrr, payers = excluded.payers, updated_at = now();
end $$;
grant execute on function public.admin_revenue_save(numeric, int) to authenticated;
