-- istek sınırları (üretim öncesi güvenlik denetimi, 2026-11-13)
-- Sorunlar: destek talebinde e-posta adresi istemciden geliyordu (lead-mail onay e-postası herhangi bir adrese gidebilirdi) ve günlük sınır yoktu;
-- submit_lead yalnız e-posta başına ve sistem geneli sınırlıydı (adresi değiştiren biri sistem sınırını doldururdu); report_error oturumsuzda yalnız
-- genel sınırı vardı; plan seçimi her farklı adet için e-posta üretirdi; push_subscriptions.endpoint her adresi kabul ediyordu (sunucu o adrese istek yapar: SSRF);
-- davet e-postasında kullanıcı başına günlük sınır yoktu; cihaz anahtarı başka kullanıcıya geçirilemiyordu (device_own politikası), çıkışta silinemiyordu.
-- Not: sınır sayaçları (request_log) yalnız başarıyla biten işlemde yazılır; hata fırlatan işlem geri alınır. Bu yüzden sayaç "başarılı kayıt" sayar (başvuru, hata
-- kaydı, e-posta); başarısız deneme sayaçları için bkz. invite_attempts (davet_kodlari).
-- Yeniden çalıştırılabilir.

-- ---------------------------------------------------------------------
-- 1. Ortak sayaç: request_log + rate_ok(tür, özne, sınır, süre)
-- ---------------------------------------------------------------------
create table if not exists public.request_log (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  kind    text not null,
  subject text not null
);
create index if not exists request_log_kind_subject on public.request_log (kind, subject, at);
alter table public.request_log enable row level security;          -- politika yok: yalnız security definer işlevler yazar/okur
revoke all on public.request_log from anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then revoke all on public.request_log from service_role; end if;
end $$;

-- true: sınır dolu değil, bir kayıt eklendi. false: son "süre" içinde zaten "sınır" kadar kayıt var (kayıt eklenmez).
create or replace function public.rate_ok(p_kind text, p_subject text, p_limit integer, p_window interval) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_subject is null then return true; end if;
  if (select count(*) from public.request_log r where r.kind = p_kind and r.subject = p_subject and r.at > now() - p_window) >= p_limit then return false; end if;
  insert into public.request_log (kind, subject) values (p_kind, p_subject);
  return true;
end $$;
revoke execute on function public.rate_ok(text, text, integer, interval) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. Destek talebi: e-posta hesabın e-postasına zorlanır; günde en çok 10
-- ---------------------------------------------------------------------
create or replace function public.guard_support_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare em text;
begin
  -- Yalnız uygulamadan (source 'app') oturumla gelen satırlar; web başvurusu submit_lead ile gelir, sunucu yolları oturumsuzdur.
  if new.source = 'app' and auth.uid() is not null then
    if (select count(*) from public.support_requests s where s.user_id = auth.uid() and s.source = 'app' and s.created_at > now() - interval '1 day') >= 10 then
      raise exception 'Günlük başvuru sınırına ulaştın. Yarın yeniden dene.' using errcode = '54000';
    end if;
    select lower(btrim(u.email::text)) into em from auth.users u where u.id = auth.uid();
    new.email := coalesce(em, '');
  end if;
  return new;
end $$;
revoke execute on function public.guard_support_request() from public, anon, authenticated;
drop trigger if exists guard_support_request on public.support_requests;
create trigger guard_support_request before insert on public.support_requests for each row execute function public.guard_support_request();

drop policy if exists support_insert on public.support_requests;
create policy support_insert on public.support_requests for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'open' and source = 'app');

-- ---------------------------------------------------------------------
-- 3. Herkese açık başvuru ve hata kaydı: IP başına sınır
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_lead(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  nm text := btrim(coalesce(p ->> 'name', ''));
  em text := lower(btrim(coalesce(p ->> 'email', '')));
  ph text := btrim(coalesce(p ->> 'phone', ''));
  co text := btrim(coalesce(p ->> 'company', ''));
  msg text := btrim(coalesce(p ->> 'message', ''));
  units int;
  types jsonb := coalesce(p -> 'types', '[]'::jsonb);
  rid uuid;
begin
  if length(nm) not between 2 and 120 then raise exception 'Adını yaz.' using errcode = '22023'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(em) > 200 then raise exception 'Geçerli bir e-posta adresi yaz.' using errcode = '22023'; end if;
  if length(ph) > 30 or length(co) > 160 or length(msg) > 4000 then raise exception 'Alanlardan biri çok uzun.' using errcode = '22023'; end if;
  if coalesce((p ->> 'consent')::boolean, false) is not true then raise exception 'Aydınlatma metnini onayla.' using errcode = '22023'; end if;
  begin units := nullif(p ->> 'units', '')::int; exception when others then units := null; end;
  if units is not null and (units < 0 or units > 1000000) then units := null; end if;
  if jsonb_typeof(types) <> 'array' or exists (select 1 from jsonb_array_elements_text(types) x where x not in ('Konut','Ofis','Mağaza','Depo','Arsa','Diğer')) then
    types := '[]'::jsonb;
  end if;
  -- Kötüye kullanım sınırı: aynı adresten saatte en fazla 3, sistem genelinde 10 dakikada en fazla 30 başvuru.
  if (select count(*) from public.support_requests where source = 'web' and email = em and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.support_requests where source = 'web' and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Çok sık başvuru. Biraz sonra yeniden dene.' using errcode = '54000';
  end if;
  -- İstemci IP'si başına saatte en çok 5 başvuru (e-posta adresini değiştirerek yapılan toplu gönderimi keser). IP bilinmiyorsa yalnız yukarıdaki sınırlar.
  if public.client_ip() is not null and not public.rate_ok('lead', public.client_ip(), 5, interval '1 hour') then
    raise exception 'Çok sık başvuru. Biraz sonra yeniden dene.' using errcode = '54000';
  end if;
  insert into public.support_requests (user_id, kind, units, name, email, phone, message, company, source, details)
  values (auth.uid(), 'kurumsal', units, nm, em, ph, msg, co, 'web', jsonb_build_object(
    'types', types,
    'role', left(coalesce(p ->> 'role', ''), 60),
    'city', left(coalesce(p ->> 'city', ''), 80),
    'timeline', left(coalesce(p ->> 'timeline', ''), 60)))
  returning id into rid;
  return rid;
end $function$;

CREATE OR REPLACE FUNCTION public.report_error(p jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare uid uuid := auth.uid(); v_ip text := public.client_ip();
begin
  if uid is not null and (select count(*) from public.client_errors where user_id = uid and at > now() - interval '1 hour') >= 30 then return; end if;
  if uid is null and (select count(*) from public.client_errors where user_id is null and at > now() - interval '1 hour') >= 500 then return; end if;
  -- Oturumsuz kayıtta IP başına saatte en çok 60 (yalnız kaydedilen hata sayılır; sınır aşılınca kayıt sessizce atlanır).
  if uid is null and v_ip is not null and not public.rate_ok('error', v_ip, 60, interval '1 hour') then return; end if;
  insert into public.client_errors (user_id, route, message, stack, kind, platform, version, agent)
  values (uid, left(coalesce(p->>'route', ''), 200), left(coalesce(p->>'message', ''), 1000), left(coalesce(p->>'stack', ''), 4000),
          case when p->>'kind' in ('error','rejection','render','caught') then p->>'kind' else 'error' end,
          left(coalesce(p->>'platform', ''), 20), left(coalesce(p->>'version', ''), 40), left(coalesce(p->>'agent', ''), 300));
end $function$;

-- ---------------------------------------------------------------------
-- 4. Plan seçimi e-postası ve davet e-postası: kullanıcı başına günlük sınır
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.queue_plan_choice()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare c jsonb := new.settings -> 'planChoice'; o jsonb := old.settings -> 'planChoice'; mail text; yr boolean;
begin
  if new.role <> 'landlord' or c is null or jsonb_typeof(c) <> 'object' or c ->> 'plan' not in ('tek', 'bes') then return new; end if;
  yr := (c ->> 'yearly') = 'true';
  if o is not null and jsonb_typeof(o) = 'object'
     and (o ->> 'plan', o ->> 'units', coalesce(o ->> 'yearly', 'false')) is not distinct from (c ->> 'plan', c ->> 'units', coalesce(c ->> 'yearly', 'false')) then
    return new;
  end if;
  -- Kullanıcı başına günde en çok 5 plan seçimi e-postası (her farklı mülk adedi ayrı e-posta üretirdi).
  if (select count(*) from public.mail_outbox where kind = 'plan_choice' and data ->> 'user' = new.id::text and created_at > now() - interval '1 day') >= 5 then
    return new;
  end if;
  select email::text into mail from auth.users where id = new.id;
  insert into public.mail_outbox (kind, to_email, lang, data, dedupe)
  values ('plan_choice', null, 'tr',
          jsonb_build_object('user', new.id, 'name', coalesce(new.name, ''), 'email', coalesce(mail, ''), 'plan', c ->> 'plan',
                             'units', left(coalesce(c ->> 'units', ''), 6), 'yearly', yr),
          new.id::text || ':' || (c ->> 'plan') || ':' || coalesce(c ->> 'units', '') || ':' || yr::text || ':' || to_char(now(), 'YYYYMMDD'))
  on conflict do nothing;
  return new;
exception when others then
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.invite_mail_claim(uid uuid, invite_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare i public.invites; o public.profiles; pname text;
begin
  select * into i from public.invites where code = upper(trim(invite_code)) and created_by = uid for update;
  if not found or i.accepted_by is not null or i.expires_at <= now() or btrim(i.email) = '' or i.role <> 'tenant' then return null; end if;
  if i.mailed_at is not null and i.mailed_at > now() - interval '2 minutes' then return jsonb_build_object('throttled', true); end if;
  -- Mülk sahibi başına günde en çok 40 davet e-postası (e-posta kutusunu ve gönderici itibarını korur).
  if not public.rate_ok('invite_mail', uid::text, 40, interval '1 day') then return jsonb_build_object('throttled', true); end if;
  update public.invites set mailed_at = now() where code = i.code;
  select * into o from public.profiles where id = uid;
  select name into pname from public.properties where id = i.property_id;
  return jsonb_build_object('code', i.code, 'email', i.email, 'name', i.name, 'owner', coalesce(o.name, ''),
                            'property', coalesce(pname, ''), 'lang', coalesce(o.lang, 'tr'), 'expires', i.expires_at);
end $function$;

-- ---------------------------------------------------------------------
-- 5. Web push uç noktası: yalnız bilinen itme servislerinin https adresleri (sunucu bu adrese istek yapar).
--    Mevcut satırlar kontrol edilmez (NOT VALID); satır yoksa ya da hepsi uyuyorsa kural doğrulanır.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'push_subscriptions_endpoint_host' and conrelid = 'public.push_subscriptions'::regclass) then
    alter table public.push_subscriptions add constraint push_subscriptions_endpoint_host check (
      length(endpoint) <= 2000
      and endpoint ~* '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)(:443)?/'
    ) not valid;
  end if;
  if not exists (select 1 from public.push_subscriptions
                  where not (length(endpoint) <= 2000 and endpoint ~* '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)*notify\.windows\.com)(:443)?/')) then
    alter table public.push_subscriptions validate constraint push_subscriptions_endpoint_host;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 6. Cihaz anahtarı (native push): kaydet / sil işlevleri
--    register: anahtarı çağıran kullanıcıya bağlar (paylaşılan cihazda önceki kullanıcıdan devralır); kullanıcı başına en çok 20 anahtar.
--    unregister: çağıranın anahtarını siler; sahibinin açık oturumu kalmamış (yetim) anahtar da silinir (çıkış sonrası yeniden başlatılan cihaz).
-- ---------------------------------------------------------------------
create or replace function public.register_device_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_token, ''));
begin
  if auth.uid() is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  if p_platform is null or p_platform not in ('ios', 'android') then raise exception 'Geçersiz platform' using errcode = '22023'; end if;
  if length(t) < 8 or length(t) > 4096 then raise exception 'Geçersiz cihaz anahtarı' using errcode = '22023'; end if;
  insert into public.device_tokens (token, user_id, platform) values (t, auth.uid(), p_platform)
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform, created_at = now();
  delete from public.device_tokens d where d.user_id = auth.uid()
     and d.token not in (select x.token from public.device_tokens x where x.user_id = auth.uid() order by x.created_at desc, x.token limit 20);
end $$;

create or replace function public.unregister_device_token(p_token text) returns void
language plpgsql security definer set search_path = public as $$
declare t text := btrim(coalesce(p_token, ''));
begin
  if auth.uid() is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  delete from public.device_tokens d where d.token = t
     and (d.user_id = auth.uid() or not exists (select 1 from auth.sessions s where s.user_id = d.user_id));
end $$;
grant execute on function public.register_device_token(text, text) to authenticated;
grant execute on function public.unregister_device_token(text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Temizlik: sayaç kayıtları 2 gün tutulur (zamanlanmış prune_logs işi siler)
-- ---------------------------------------------------------------------
create or replace function public.prune_logs(days integer default 90) returns integer
language plpgsql security definer set search_path = public as $$
declare n int; m int;
begin
  delete from public.client_errors where at < now() - make_interval(days => greatest(days, 1));
  get diagnostics n = row_count;
  delete from public.function_logs where at < now() - make_interval(days => greatest(days, 1));
  get diagnostics m = row_count;
  delete from public.invite_attempts where at < now() - interval '2 days';
  delete from public.request_log where at < now() - interval '2 days';
  return n + m;
end $$;
