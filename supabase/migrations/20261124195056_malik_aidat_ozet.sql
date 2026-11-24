-- Maliklere aylık aidat özeti e-postası.
-- Her ayın 1'inde (07:00 UTC = 10:00 İstanbul), uygulamaya bağlı ve sitelerde en az 2 dairesi olan maliklere tek e-posta:
-- daire daire geçen ayın aidat durumu (ödendi / kısmi / ödenmedi / tahakkuk yok), kim ödüyor ve dairenin toplam ödenmemiş borcu.
-- Malik Ayarlar → Bildirimler → "Aylık aidat özeti" ile kapatır (profiles.settings.malikOzet, varsayılan açık).
-- E-posta mail_outbox ('aidat_ozet') üzerinden mail-send fonksiyonuyla gider; aynı ay için ikinci kez kuyruğa girmez.
-- Yeni işlev ve zamanlanmış iş; eski istemciyle uyumlu, yeniden çalıştırılabilir.

alter table public.mail_outbox drop constraint if exists mail_outbox_kind_check;
alter table public.mail_outbox add constraint mail_outbox_kind_check
  check (kind in ('account_deleted', 'plan_choice', 'org_master_invite', 'investor_report', 'admin_message', 'havale_bilgi', 'aidat_ozet'));

create or replace function public.site_malik_summary(today date default (now() at time zone 'Europe/Istanbul')::date)
returns int language plpgsql security definer set search_path = public as $$
declare m text := to_char(today - interval '1 month', 'YYYY-MM'); n int;
begin
  with mine as (
    select r.user_id, r.unit_id, u.org_id, o.name as org, public.unit_label(u.id) as lbl, public.site_payer(u.id) as payer
    from public.site_residents r join public.site_units u on u.id = r.unit_id
    join public.organizations o on o.id = u.org_id and o.status = 'active' and o.sector = 'site'
    where r.role = 'malik' and r.user_id is not null
  ), many as (
    select user_id from mine group by user_id having count(distinct unit_id) >= 2
  ), rows as (
    select x.user_id, jsonb_build_object('org', x.org, 'unit', x.lbl, 'payer', x.payer,
             'status', coalesce((select case when bool_and(c.status = 'paid') then 'paid' when bool_or(c.status in ('paid','partial')) then 'partial' else 'open' end
                                 from public.site_charges c where c.unit_id = x.unit_id and c.month = m), 'none'),
             'due', coalesce((select sum(c.amount - case when c.status = 'partial' then c.paid_amount else 0 end)
                              from public.site_charges c where c.unit_id = x.unit_id and c.status in ('open','partial','rejected')), 0)) as j,
           x.org, x.lbl
    from mine x join many y on y.user_id = x.user_id
  )
  insert into public.mail_outbox (kind, to_email, lang, data, dedupe)
  select 'aidat_ozet', au.email, coalesce(nullif(p.settings ->> 'lang', ''), 'tr'),
         jsonb_build_object('name', p.name, 'month', m, 'units', jsonb_agg(r.j order by r.org, r.lbl)),
         'aidat-ozet-' || r.user_id || '-' || m
  from rows r join public.profiles p on p.id = r.user_id join auth.users au on au.id = r.user_id
  where coalesce((p.settings ->> 'malikOzet')::boolean, true) and au.email is not null
  group by r.user_id, au.email, p.name, p.settings
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.site_malik_summary(date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'anahtar-site-malik-ozet';
    perform cron.schedule('anahtar-site-malik-ozet', '0 7 1 * *', 'select public.site_malik_summary()');
  end if;
end $$;
