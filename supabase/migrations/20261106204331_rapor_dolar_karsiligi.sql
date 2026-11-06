-- Rapor e-postasına dolar karşılıkları: site_report artık "usd" (istenen, tahsil edilen, gider, kur farkı, dönem sonu kuru)
-- ve "fx_diff_try" (dövizli sözleşmelerde TL kur farkı) da döndürür. Kurallar uygulamadaki fx-report.js ile aynı:
--   istenen → son ödeme günü (due_on; yoksa ayın son günü), tahsilat → ödeme günü (paid_on; yoksa son ödeme günü),
--   gider → harcama günü; hafta sonu ve tatilde son iş günü (fx_rate). Dövizli sözleşmede sözleşmedeki döviz tutarı esas alınır,
--   tahsil edilen TL'nin ödeme günündeki karşılığıyla fark "kur farkı"dır. Kuru olmayan işlem toplama katılmaz (missing sayılır).
-- Var olan alanlar değişmez (eski e-posta şablonu çalışmaya devam eder); yeni işlev ve işlev gövdesi, yeniden çalıştırılabilir.

/** Dönemin seçilen para birimindeki özeti (site_report içinden çağrılır; doğrudan çağrılamaz). */
create or replace function public.site_report_fx(oid uuid, m0 text, m1 text, d0 date, d1 date, cur text)
returns jsonb language sql stable set search_path = public as $$
  with c as (
    select x.*, coalesce(x.due_on, (to_date(x.month, 'YYYY-MM') + interval '1 month' - interval '1 day')::date) as due,
           case when x.status = 'paid' then x.amount when x.status = 'partial' then x.paid_amount else 0 end as paid,
           (x.currency <> 'TRY' and x.orig_amount is not null and x.amount > 0) as is_fx
    from public.site_charges x where x.org_id = oid and x.month between m0 and m1
  ), r as (
    select c.*, coalesce(c.paid_on, c.due) as pd,
           case when c.amount > 0 then least(1, c.paid / c.amount) else 0 end as share,
           public.fx_rate(cur, c.due) as r_due, public.fx_rate(cur, coalesce(c.paid_on, c.due)) as r_pd,
           case when c.is_fx then public.fx_rate(c.currency, c.due) else 1 end as c_due,
           case when c.is_fx then public.fx_rate(c.currency, coalesce(c.paid_on, c.due)) else 1 end as c_pd
    from c
  ), v as (
    select r.*,
      case when cur = 'TRY' then r.amount when r.is_fx then r.orig_amount * r.c_due / r.r_due else r.amount / r.r_due end as charged,
      case when cur = 'TRY' then r.paid when r.paid = 0 then 0 when r.is_fx then r.orig_amount * r.share * r.c_pd / r.r_pd else r.paid / r.r_pd end as collected,
      case when not r.is_fx or r.paid = 0 then 0 else (r.paid - r.orig_amount * r.share * r.c_pd) / r.r_pd end as diff,
      (r.r_due is null or r.c_due is null or (r.paid > 0 and (r.r_pd is null or r.c_pd is null))) as missing
    from r
  ), e as (
    select x.amount / public.fx_rate(cur, x.spent_on) as total
    from public.site_expenses x where x.org_id = oid and x.spent_on >= d0 and x.spent_on < d1
  )
  select jsonb_build_object(
    'currency', cur,
    'charged', coalesce((select round(sum(charged), 2) from v where not missing), 0),
    'collected', coalesce((select round(sum(collected), 2) from v where not missing), 0),
    'fx_diff', coalesce((select round(sum(diff), 2) from v where not missing), 0),
    'spent', coalesce((select round(sum(total), 2) from e where total is not null), 0),
    'missing', exists (select 1 from v where missing) or exists (select 1 from e where total is null),
    'rate', public.fx_rate(cur, least(d1 - 1, current_date)),
    'rate_day', (select max(day) from public.fx_rates where currency = cur and day <= least(d1 - 1, current_date)))
$$;
revoke execute on function public.site_report_fx(uuid, text, text, date, date, text) from public, anon, authenticated;

/** Dönem raporu (period: month | year; ref: dönemden bir gün): tahakkuk ve tahsilat (türe göre), giderler (kaleme göre),
    bütçe karşılaştırması, borçlular, talepler; dolar karşılıkları (usd) ve TL kur farkı. Yönetimde "Raporlar" yetkisi olan ve report edge fonksiyonu (service_role) çağırır. */
create or replace function public.site_report(oid uuid, period text, ref date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d0 date := case when period = 'year' then date_trunc('year', ref)::date else date_trunc('month', ref)::date end;
  d1 date := case when period = 'year' then (date_trunc('year', ref) + interval '1 year')::date else (date_trunc('month', ref) + interval '1 month')::date end;
  m0 text := to_char(d0, 'YYYY-MM');
  m1 text := to_char(d1 - 1, 'YYYY-MM');
  yr int := extract(year from d0)::int;
begin
  if auth.uid() is not null and not public.org_can(oid, 'reports.view') and not public.is_admin() then
    raise exception 'Rapor yetkin yok' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'org', (select name from public.organizations where id = oid),
    'sector', (select sector from public.organizations where id = oid),
    'period', period, 'from', d0, 'to', d1 - 1,
    'units', (select count(*) from public.site_units where org_id = oid),
    'charges', (select coalesce(jsonb_agg(x order by x.kind), '[]'::jsonb) from (
        select kind, sum(amount) as charged,
               sum(case when status = 'paid' then amount when status in ('partial') then paid_amount else 0 end) as collected
        from public.site_charges where org_id = oid and month between m0 and m1 group by kind) x),
    'expenses', (select coalesce(jsonb_agg(x order by x.total desc), '[]'::jsonb) from (
        select cat, sum(amount) as total from public.site_expenses where org_id = oid and spent_on >= d0 and spent_on < d1 group by cat) x),
    'budget', (select case when b.org_id is null then null else jsonb_build_object('year', b.year, 'approved_on', b.approved_on,
                 'items', b.items, 'total', (select coalesce(sum((i ->> 'amount')::numeric), 0) from jsonb_array_elements(b.items) i)) end
               from (select 1) one left join public.site_budgets b on b.org_id = oid and b.year = yr),
    'debtors', (select coalesce(jsonb_agg(x order by x.unpaid desc), '[]'::jsonb) from (
        select public.unit_label(unit_id) as unit, sum(amount - case when status = 'partial' then paid_amount else 0 end) as unpaid
        from public.site_charges where org_id = oid and status <> 'paid' and month <= m1
          and (date_trunc('month', to_date(month, 'YYYY-MM')) + interval '1 month')::date <= least(d1, current_date)
        group by unit_id order by 2 desc limit 20) x),
    'requests', jsonb_build_object(
        'opened', (select count(*) from public.site_requests where org_id = oid and created_at >= d0 and created_at < d1),
        'open', (select count(*) from public.site_requests where org_id = oid and status < 3)),
    -- Dolar karşılıkları (rapor_dolar_karsiligi): her işlem kendi gününün TCMB satış kuruyla; TL kur farkı bilgi satırı.
    'usd', public.site_report_fx(oid, m0, m1, d0, d1, 'USD'),
    'fx_diff_try', (public.site_report_fx(oid, m0, m1, d0, d1, 'TRY') ->> 'fx_diff')::numeric);
end $$;
grant execute on function public.site_report(uuid, text, date) to authenticated;
