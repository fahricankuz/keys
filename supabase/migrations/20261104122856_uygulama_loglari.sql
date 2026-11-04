-- Uygulama logları: Edge Function kayıtları, yakalanan istemci hataları, kişisel veri temizliği ve saklama süresi.
-- function_logs: fonksiyonların warn/error kayıtları (yalnız service_role yazar, yalnız yönetici okur ve siler).
-- client_errors: yeni tür 'caught' (uygulamanın yakalayıp sürdürdüğü hatalar: eşitleme, yükleme vb.).
-- log_redact: iki tabloya yazılan metinden e-posta, telefon, jeton ve parolayı temizler (tetikleyiciyle; yazan kim olursa olsun).
-- prune_logs: 90 günden eski kayıtları siler (pg_cron varsa her gece). admin_audit denetim kaydıdır, silinmez.
-- Eski kodla uyumlu: eski istemci 'caught' göndermez; yeni istemci eski işlevde 'error' olarak yazılır. Yeniden çalıştırılabilir.

create or replace function public.log_redact(s text)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(s, ''),
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+', '[e-posta]', 'g'),
    'eyJ[A-Za-z0-9_-]{8,}(\.[A-Za-z0-9_-]+){1,2}', '[jeton]', 'g'),
    '([Bb]earer|[Bb]asic)\s+[A-Za-z0-9._~+/=-]{8,}', '\1 [gizli]', 'g'),
    '(token|secret|password|passwd|parola|sifre|şifre|apikey|api_key|authorization)(["'']?\s*[:=]\s*["'']?)[^\s"''&,;}]+', '\1\2[gizli]', 'gi'),
    '(^|[^0-9])(\+?90[ -]?)?0?5[0-9]{2}[ -]?[0-9]{3}[ -]?[0-9]{2}[ -]?[0-9]{2}($|[^0-9])', '\1[telefon]\3', 'g')
$$;
revoke execute on function public.log_redact(text) from public, anon, authenticated;

create table if not exists public.function_logs (
  id      bigserial primary key,
  at      timestamptz not null default now(),
  fn      text not null default '',
  level   text not null default 'error' check (level in ('warn','error')),
  message text not null default '',
  detail  text not null default ''
);
create index if not exists function_logs_at on public.function_logs (at desc);
alter table public.function_logs enable row level security;
drop policy if exists function_logs_admin on public.function_logs;
create policy function_logs_admin on public.function_logs for select to authenticated using (public.is_admin());
drop policy if exists function_logs_admin_del on public.function_logs;
create policy function_logs_admin_del on public.function_logs for delete to authenticated using (public.is_admin());

create or replace function public.function_logs_clean()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.fn := left(new.fn, 40);
  new.message := left(public.log_redact(new.message), 1000);
  new.detail := left(public.log_redact(new.detail), 4000);
  return new;
end $$;
revoke execute on function public.function_logs_clean() from public, anon, authenticated;
drop trigger if exists function_logs_clean on public.function_logs;
create trigger function_logs_clean before insert on public.function_logs for each row execute function public.function_logs_clean();

create or replace function public.client_errors_clean()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.route := public.log_redact(new.route);
  new.message := public.log_redact(new.message);
  new.stack := public.log_redact(new.stack);
  return new;
end $$;
revoke execute on function public.client_errors_clean() from public, anon, authenticated;
drop trigger if exists client_errors_clean on public.client_errors;
create trigger client_errors_clean before insert on public.client_errors for each row execute function public.client_errors_clean();

-- Daha önce yazılmış kayıtlar da temizlenir.
update public.client_errors set route = public.log_redact(route), message = public.log_redact(message), stack = public.log_redact(stack)
 where (route, message, stack) is distinct from (public.log_redact(route), public.log_redact(message), public.log_redact(stack));

alter table public.client_errors drop constraint if exists client_errors_kind_check;
alter table public.client_errors add constraint client_errors_kind_check check (kind in ('error','rejection','render','caught'));

create or replace function public.report_error(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is not null and (select count(*) from public.client_errors where user_id = uid and at > now() - interval '1 hour') >= 30 then return; end if;
  if uid is null and (select count(*) from public.client_errors where user_id is null and at > now() - interval '1 hour') >= 500 then return; end if;
  insert into public.client_errors (user_id, route, message, stack, kind, platform, version, agent)
  values (uid, left(coalesce(p->>'route', ''), 200), left(coalesce(p->>'message', ''), 1000), left(coalesce(p->>'stack', ''), 4000),
          case when p->>'kind' in ('error','rejection','render','caught') then p->>'kind' else 'error' end,
          left(coalesce(p->>'platform', ''), 20), left(coalesce(p->>'version', ''), 40), left(coalesce(p->>'agent', ''), 300));
end $$;
revoke execute on function public.report_error(jsonb) from public;
grant execute on function public.report_error(jsonb) to anon, authenticated;

create or replace function public.prune_logs(days int default 90)
returns int language plpgsql security definer set search_path = public as $$
declare n int; m int;
begin
  delete from public.client_errors where at < now() - make_interval(days => greatest(days, 1));
  get diagnostics n = row_count;
  delete from public.function_logs where at < now() - make_interval(days => greatest(days, 1));
  get diagnostics m = row_count;
  return n + m;
end $$;
revoke execute on function public.prune_logs(int) from public, anon, authenticated;

-- pg_cron varsa her gece 03:15 (İstanbul, UTC+3).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'anahtar-log-prune';
    perform cron.schedule('anahtar-log-prune', '15 0 * * *', 'select public.prune_logs()');
  end if;
end $$;
