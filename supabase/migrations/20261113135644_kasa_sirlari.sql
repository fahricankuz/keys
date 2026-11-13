-- kasa sırları (üretim öncesi güvenlik denetimi, 2026-11-13)
-- Sorun: 4 webhook tetikleyicisi (support_requests.talep, legal_requests.hukuki → lead-mail; notifications.bildirim → push; mail_outbox.kuyruk → mail-send) ve
-- 4 HTTP zamanlanmış iş (anahtar-mail-sweep, anahtar-rapor-aylik, anahtar-rapor-yillik, tufe-sync-aylik) gizli anahtarları (bir tanesi info@anahtar.io
-- posta kutusunun parolasıyla aynıydı) ve service_role JWT'sini düz metin olarak tetikleyici/iş tanımında taşıyordu: tanımı okuyabilen herkes (pg_dump,
-- yedek, yönetim paneli, bu repo) anahtarları görürdü. Hedef işlevlerin hepsi verify_jwt=false'tur; Authorization başlığı gereksizdi.
-- Çözüm: gizli değerler Supabase Vault'ta durur, başlıklar ÇAĞRI ANINDA oluşturulur; tetikleyici ve iş tanımlarında hiçbir gizli değer yoktur.
-- Bu dosyaya hiçbir gizli değer yazılmaz; yalnız Vault'taki kayıtların ADLARI geçer.
--
-- Vault'ta bulunması gereken kayıtlar (SQL Editor: select vault.create_secret('<değer>', '<ad>', '<açıklama>'); değerler git'e, sohbete, yoruma yazılmaz):
--   anahtar_functions_url   fonksiyonların taban adresi, ör. https://<proje>.supabase.co/functions/v1   (gizli değil; ayar olarak tutulur)
--   anahtar_lead_secret     lead-mail    → başlık x-anahtar-secret  (işlev ortam değişkeni LEAD_SECRET)
--   anahtar_mail_secret     mail-send    → başlık x-anahtar-secret  (MAIL_SECRET)
--   anahtar_push_secret     push         → başlık x-evim-secret     (WEBHOOK_SECRET)
--   anahtar_report_secret   report       → başlık x-anahtar-secret  (REPORT_SECRET)
--   anahtar_tufe_secret     tufe-sync    → başlık x-anahtar-secret  (TUFE_SECRET)
--   anahtar_billing_secret  billing      → başlık x-anahtar-secret  (BILLING_CRON_SECRET)
-- Her gizli değer ayrı, rastgele ve en az 32 bayttır. Vault, pg_net ve pg_cron eklentileri kuruluysa kayıtların hepsi bulunmalıdır; biri eksikse bu migration
-- hiçbir şeyi değiştirmeden hata verir. Eklentiler yoksa (yerel test, staging) bu dosyadaki kurulum atlanır; yardımcı işlevler yine oluşturulur.
-- Yeniden çalıştırılabilir (tetikleyiciler yeniden kurulur, işler adıyla silinip yeniden zamanlanır).

-- ---------------------------------------------------------------------
-- 0. Ön denetim: gerekli Vault kayıtları var mı? (hiçbir şey değişmeden önce)
-- ---------------------------------------------------------------------
do $$
declare
  has_vault boolean := to_regclass('vault.decrypted_secrets') is not null;
  has_net   boolean := exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net' and p.proname = 'http_post');
  has_cron  boolean := to_regclass('cron.job') is not null;
  need text[];
  missing text;
begin
  if not (has_vault and has_net) then
    raise notice 'kasa_sirlari: Vault ya da pg_net yok; webhook ve zamanlanmış iş kurulumu atlandı';
    return;
  end if;
  need := array['anahtar_functions_url', 'anahtar_lead_secret', 'anahtar_mail_secret', 'anahtar_push_secret'];
  if has_cron then need := need || array['anahtar_report_secret', 'anahtar_tufe_secret', 'anahtar_billing_secret']; end if;
  execute 'select string_agg(n, '', '' order by n) from unnest($1::text[]) n
            where not exists (select 1 from vault.decrypted_secrets s where s.name = n and btrim(coalesce(s.decrypted_secret, '''')) <> '''')'
    into missing using need;
  if missing is not null then
    raise exception 'Vault gizli anahtarı eksik: %. Önce SQL Editor''de vault.create_secret(değer, ad) ile ekle (değerleri git''e yazma); sonra bu migration''ı yeniden uygula.', missing
      using errcode = '55000';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 1. Yardımcı işlevler (eklentiler olmasa da oluşturulur; yalnız çalıştırıldıklarında Vault/pg_net gerekir)
-- ---------------------------------------------------------------------
-- Vault'tan bir kayıt (yalnız bu işlevler okur; istemciye kapalı).
create or replace function public.anahtar_secret(p_name text) returns text
language plpgsql stable security definer set search_path = public as $$
declare v text;
begin
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v using p_name;
  return v;
end $$;

-- Bir edge işlevini çağırır: adres ve gizli başlık değeri ÇAĞRI ANINDA Vault'tan okunur; Authorization başlığı yoktur.
-- p_fn: işlev adı (lead-mail, push, ...), p_secret: Vault kayıt adı, p_header: gizli başlığın adı, p_timeout: yanıt bekleme (ms).
create or replace function public.anahtar_call(p_fn text, p_secret text, p_header text, p_body jsonb default '{}'::jsonb, p_timeout integer default 10000) returns bigint
language plpgsql security definer set search_path = public as $$
declare base text := btrim(coalesce(public.anahtar_secret('anahtar_functions_url'), '')); sec text := public.anahtar_secret(p_secret); rid bigint;
begin
  if base !~ '^https://' then raise exception 'anahtar_functions_url geçersiz (https ile başlamalı)' using errcode = '55000'; end if;
  if sec is null or btrim(sec) = '' then raise exception 'Vault kaydı eksik: %', p_secret using errcode = '55000'; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := $4)'
    into rid using rtrim(base, '/') || '/' || p_fn, coalesce(p_body, '{}'::jsonb),
      jsonb_build_object('Content-Type', 'application/json', p_header, sec), greatest(p_timeout, 1000);
  return rid;
end $$;

-- Webhook tetikleyicisi: supabase_functions.http_request ile aynı yük ({type, table, schema, record, old_record}); bağımsız değişkenler:
-- işlev adı, Vault kayıt adı, gizli başlığın adı. Hata ana işlemi bozmaz (başvuru/bildirim yine kaydedilir); uyarı günlüğe düşer, değer yazılmaz.
create or replace function public.anahtar_webhook() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.anahtar_call(tg_argv[0], tg_argv[1], tg_argv[2],
      jsonb_build_object('type', tg_op, 'table', tg_table_name, 'schema', tg_table_schema,
        'record', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
        'old_record', case when tg_op = 'INSERT' then null else to_jsonb(old) end), 10000);
  exception when others then
    raise warning 'anahtar_webhook % -> %: % (%)', tg_table_name, tg_argv[0], sqlerrm, sqlstate;
  end;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

revoke execute on function public.anahtar_secret(text) from public, anon, authenticated;
revoke execute on function public.anahtar_call(text, text, text, jsonb, integer) from public, anon, authenticated;
revoke execute on function public.anahtar_webhook() from public, anon, authenticated;
-- Supabase service_role'e yeni işlevlerde varsayılan olarak EXECUTE verir; gizli değerleri okuyan işlevlere service_role (edge işlevleri) de erişmemeli.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke execute on function public.anahtar_secret(text) from service_role;
    revoke execute on function public.anahtar_call(text, text, text, jsonb, integer) from service_role;
    revoke execute on function public.anahtar_webhook() from service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Webhook tetikleyicileri (eskileri supabase_functions.http_request ile düz metin başlık taşıyordu)
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('vault.decrypted_secrets') is null
     or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net' and p.proname = 'http_post') then
    return;
  end if;
  drop trigger if exists talep on public.support_requests;
  create trigger talep after insert on public.support_requests
    for each row execute function public.anahtar_webhook('lead-mail', 'anahtar_lead_secret', 'x-anahtar-secret');
  drop trigger if exists hukuki on public.legal_requests;
  create trigger hukuki after insert on public.legal_requests
    for each row execute function public.anahtar_webhook('lead-mail', 'anahtar_lead_secret', 'x-anahtar-secret');
  drop trigger if exists bildirim on public.notifications;
  create trigger bildirim after insert on public.notifications
    for each row execute function public.anahtar_webhook('push', 'anahtar_push_secret', 'x-evim-secret');
  drop trigger if exists kuyruk on public.mail_outbox;
  create trigger kuyruk after insert on public.mail_outbox
    for each row execute function public.anahtar_webhook('mail-send', 'anahtar_mail_secret', 'x-anahtar-secret');
end $$;

-- ---------------------------------------------------------------------
-- 3. Zamanlanmış işler (pg_cron): komutlarda gizli değer yok; başlık anahtar_call içinde çağrı anında oluşur
--    anahtar-mail-sweep     her 15 dakikada      mail-send   {"sweep":true}
--    anahtar-rapor-aylik    ayın 1'i 06:00 UTC   report      {"period":"month"}   (yanıt 120 sn beklenir)
--    anahtar-rapor-yillik   1 Ocak 06:30 UTC     report      {"period":"year"}
--    tufe-sync-aylik        her gün 13:00 UTC    tufe-sync   {}                   (30 sn)
--    anahtar-billing-reconcile  her gün 04:30 UTC  billing   {"action":"reconcile"}  (kaçan mağaza bildirimlerini yeniden eşitler)
--    anahtar-cron-prune     her gün 00:20 UTC    cron.job_run_details 14 günden eski kayıtları siler
-- ---------------------------------------------------------------------
do $$
declare j record;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regclass('cron.job') is null
     or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net' and p.proname = 'http_post') then
    return;
  end if;
  for j in select * from (values
    ('anahtar-mail-sweep', '*/15 * * * *',
      $c$select public.anahtar_call('mail-send', 'anahtar_mail_secret', 'x-anahtar-secret', '{"sweep":true}'::jsonb, 10000)$c$),
    ('anahtar-rapor-aylik', '0 6 1 * *',
      $c$select public.anahtar_call('report', 'anahtar_report_secret', 'x-anahtar-secret', '{"period":"month"}'::jsonb, 120000)$c$),
    ('anahtar-rapor-yillik', '30 6 1 1 *',
      $c$select public.anahtar_call('report', 'anahtar_report_secret', 'x-anahtar-secret', '{"period":"year"}'::jsonb, 120000)$c$),
    ('tufe-sync-aylik', '0 13 * * *',
      $c$select public.anahtar_call('tufe-sync', 'anahtar_tufe_secret', 'x-anahtar-secret', '{}'::jsonb, 30000)$c$),
    ('anahtar-billing-reconcile', '30 4 * * *',
      $c$select public.anahtar_call('billing', 'anahtar_billing_secret', 'x-anahtar-secret', '{"action":"reconcile"}'::jsonb, 30000)$c$),
    ('anahtar-cron-prune', '20 0 * * *',
      $c$delete from cron.job_run_details where end_time < now() - interval '14 days'$c$)
  ) as t(name, schedule, command) loop
    perform cron.unschedule(jobid) from cron.job where jobname = j.name;
    perform cron.schedule(j.name, j.schedule, j.command);
  end loop;
end $$;
