-- Malike aidat gecikme ve ödendi bildirimi.
-- Aidatı kiracı ödeyen dairede (site_payer = 'kiraci') son ödeme gününden 5 gün geçtiği hâlde ödenmemiş tahakkuk için dairenin
-- uygulamaya bağlı malikine bir kez bildirim gider ("aidat-malik-late-<tahakkuk>"); bildirim tetikleyicisi telefon bildirimini ve
-- e-postayı gönderir. Malike gecikme bildirimi gitmiş tahakkuk ödenince bir kez "ödendi" bildirimi gider.
-- Malik bunu Ayarlar → Bildirimler → "Kiracım aidatı geciktirince" ile kapatır (profiles.settings.malikAidat, varsayılan açık).
-- İlk çalıştırmada eski borçlar için toplu bildirim olmasın diye yalnız son 40 günde geciken tahakkuklar sayılır.
-- Yeni işlev, tetikleyici ve zamanlanmış iş; eski istemciyle uyumlu, yeniden çalıştırılabilir.

create or replace function public.site_malik_late(today date default (now() at time zone 'Europe/Istanbul')::date)
returns int language plpgsql security definer set search_path = public as $$
declare before int;
begin
  select count(*) into before from public.notifications;
  insert into public.notifications (user_id, title, body, url, tag)
  select distinct on (r.user_id, c.id) r.user_id,
         public.unit_label(c.unit_id) || ': kiracı aidatı ödemedi',
         o.name || ' · ' || to_char(to_date(c.month, 'YYYY-MM'), 'MM.YYYY') || ' ' || public.charge_word(c.kind, c.title) || ' '
           || public.fmt_tl(c.amount - case when c.status = 'partial' then c.paid_amount else 0 end)
           || ' henüz ödenmedi; son gün ' || to_char(c.last_day, 'DD.MM.YYYY') || ' idi.',
         '/uygulama/sitem', 'aidat-malik-late-' || c.id
  from (select x.*, coalesce(x.due_on, (date_trunc('month', to_date(x.month, 'YYYY-MM')) + interval '1 month' - interval '1 day')::date) as last_day
          from public.site_charges x where x.status in ('open','partial','rejected')) c
  join public.organizations o on o.id = c.org_id and o.status = 'active' and o.sector = 'site'
  join public.site_residents r on r.unit_id = c.unit_id and r.role = 'malik' and r.user_id is not null
  left join public.profiles pr on pr.id = r.user_id
  where today - c.last_day between 5 and 40
    and public.site_payer(c.unit_id) = 'kiraci'
    and coalesce((pr.settings ->> 'malikAidat')::boolean, true)
    and not exists (select 1 from public.notifications n where n.user_id = r.user_id and n.tag = 'aidat-malik-late-' || c.id)
  on conflict do nothing;
  return (select count(*) from public.notifications) - before;
end $$;
revoke execute on function public.site_malik_late(date) from public, anon, authenticated;

/** Gecikme bildirimi gitmiş tahakkuk ödenince aynı maliklere bir kez "ödendi" bildirimi. */
create or replace function public.site_malik_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    insert into public.notifications (user_id, title, body, url, tag)
    select n.user_id, public.unit_label(new.unit_id) || ': aidat ödendi',
           to_char(to_date(new.month, 'YYYY-MM'), 'MM.YYYY') || ' ' || public.charge_word(new.kind, new.title) || ' ödendi.',
           '/uygulama/sitem', 'aidat-malik-paid-' || new.id
    from public.notifications n left join public.profiles pr on pr.id = n.user_id
    where n.tag = 'aidat-malik-late-' || new.id
      and coalesce((pr.settings ->> 'malikAidat')::boolean, true)
      and not exists (select 1 from public.notifications m where m.user_id = n.user_id and m.tag = 'aidat-malik-paid-' || new.id)
    on conflict do nothing;
  end if;
  return null;
end $$;
revoke execute on function public.site_malik_paid() from public, anon, authenticated;
drop trigger if exists site_malik_paid on public.site_charges;
create trigger site_malik_paid after update of status on public.site_charges
  for each row execute function public.site_malik_paid();

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'anahtar-site-malik';
    perform cron.schedule('anahtar-site-malik', '7 6 * * *', 'select public.site_malik_late()');
  end if;
end $$;
