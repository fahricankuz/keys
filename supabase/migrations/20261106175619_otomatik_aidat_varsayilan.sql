-- Otomatik aidat varsayılan: aylık aidat kira gibi her ay kendiliğinden yazılır.
-- 1. Mevcut sitelerde açılır (aidat günü, yani son ödeme, ayın 10'u). Kapalı olanlar gelecek aydan başlar ki bu ayın ortasında
--    beklenmedik borç yazılmasın; zaten açık olanlara dokunulmaz.
-- 2. Yeni site (ya da sektörü siteye çevrilen kurum) açık başlar, bu aydan itibaren.
-- Yönetici Aidat ekranından kapatabilir. Yalnız ayar satırları ve bir tetikleyici; eski kodla uyumlu, yeniden çalıştırılabilir
-- (bir kez açılıp sonra yönetici tarafından kapatılan site, migration yeniden çalışınca yeniden açılmaz: auto_default işareti).

alter table public.site_auto add column if not exists auto_default boolean not null default false;

insert into public.site_auto (org_id, enabled, run_day, due_day, start_month, auto_default)
select o.id, true, 1, 10, to_char((date_trunc('month', now() at time zone 'Europe/Istanbul') + interval '1 month')::date, 'YYYY-MM'), true
  from public.organizations o
 where o.sector = 'site'
on conflict (org_id) do nothing;

update public.site_auto s
   set enabled = true, run_day = 1,
       start_month = to_char((date_trunc('month', now() at time zone 'Europe/Istanbul') + interval '1 month')::date, 'YYYY-MM'),
       auto_default = true, updated_at = now()
 where not s.enabled and not s.auto_default
   and exists (select 1 from public.organizations o where o.id = s.org_id and o.sector = 'site');

/** Yeni site ya da sektörü siteye çevrilen kurum: otomatik aidat açık başlar (bu aydan, son ödeme ayın 10'u). */
create or replace function public.site_auto_default()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.sector = 'site' and (tg_op = 'INSERT' or old.sector is distinct from 'site') then
    insert into public.site_auto (org_id, enabled, run_day, due_day, start_month, auto_default)
    values (new.id, true, 1, 10, to_char((now() at time zone 'Europe/Istanbul')::date, 'YYYY-MM'), true)
    on conflict (org_id) do nothing;
  end if;
  return new;
end $$;
revoke execute on function public.site_auto_default() from public, anon, authenticated;
drop trigger if exists site_auto_default on public.organizations;
create trigger site_auto_default after insert or update of sector on public.organizations
  for each row execute function public.site_auto_default();
