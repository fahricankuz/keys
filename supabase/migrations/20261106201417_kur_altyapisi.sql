-- Kur altyapısı: TCMB'nin her iş günü açıkladığı dolar ve avro kurları (döviz alış ve döviz satış).
-- Raporlar satış kurunu kullanır (raporda dip notla belirtilir); alış da saklanır ki gerekirse yöntem değiştirilebilsin.
-- Yazma yalnız sunucudan (tufe-sync fonksiyonu, service_role); okuma oturum açmış herkese açık (kamuya açık veri).
-- Hafta sonu ve resmî tatil: o gün kur yoktur, son iş gününün kuru kullanılır (public.fx_rate).
-- tufe-sync her gün çalışır: kur her gün gelir, TÜFE ayda bir değişir (aynı oranı yeniden yazmak zararsızdır).
-- Yeni tablo, yeni işlev ve zamanlama değişikliği; eski kodla uyumlu, yeniden çalıştırılabilir.

create table if not exists public.fx_rates (
  day        date not null,
  currency   text not null check (currency in ('USD','EUR')),
  buy        numeric(12,4) check (buy is null or buy > 0),
  sell       numeric(12,4) not null check (sell > 0),
  source     text not null default 'evds' check (source in ('evds','manual')),
  updated_at timestamptz not null default now(),
  primary key (currency, day)
);
alter table public.fx_rates enable row level security;
drop policy if exists fx_read on public.fx_rates;
create policy fx_read on public.fx_rates for select to authenticated using (true);
grant select on public.fx_rates to authenticated;
revoke insert, update, delete on public.fx_rates from anon, authenticated;

/** Bir günün satış kuru (1 birim döviz kaç TL): o gün yoksa (hafta sonu, tatil) o günden önceki son iş günü. TRY → 1.
    Kur hiç yoksa null döner; çağıran "kur bekleniyor" der. */
create or replace function public.fx_rate(cur text, d date)
returns numeric language sql stable set search_path = public as $$
  select case when cur = 'TRY' then 1::numeric
              else (select r.sell from public.fx_rates r where r.currency = cur and r.day <= d order by r.day desc limit 1) end
$$;
grant execute on function public.fx_rate(text, date) to authenticated;

-- tufe-sync zamanlaması (Supabase → Integrations → Cron'da "tufe-sync-aylik"): ayın 3–6'sından her güne.
-- TCMB kurları 15:30'da (12:30 UTC) açıklar; 13:00 UTC'de o günün kuru gelmiş olur. TÜFE de aynı çağrıda güncellenir.
-- İş yoksa (pg_cron yok ya da zamanlama kurulmamış) hiçbir şey yapmaz; komut ve gizli başlık değişmez.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.alter_job(jobid, schedule := '0 13 * * *') from cron.job where jobname = 'tufe-sync-aylik';
  end if;
end $$;
