-- anon işlev yetkileri (üretim öncesi güvenlik denetimi, 2026-11-13)
-- Sorun: Supabase, public şemasındaki her yeni işleve anon ve authenticated rollerine doğrudan EXECUTE verir ve Postgres ayrıca PUBLIC'e verir.
-- 179 security definer işlevin 110'una oturumsuz (anon) çağrı yapılabiliyordu; yalnız altısı bilerek herkese açıktır.
-- Bu migration: (1) izin listesindekiler dışındaki her security definer işlevden anon ve PUBLIC EXECUTE'u kaldırır (authenticated'ın yetkisi aynen
-- kalır: RLS ve depolama politikaları işlevleri bu rolle çağırır), (2) yeni işlevlerde varsayılan yetkiyi aynı yönde değiştirir,
-- (3) search_path'i sabit olmayan yardımcı işlevlere sabit bir yol verir. Yeniden çalıştırılabilir.
-- İzin listesi tests/qa-db.spec.mjs içinde de tutulur; yeni bir herkese açık işlev eklemek bilinçli bir karar olmalıdır.

-- ---------------------------------------------------------------------
-- 1. Mevcut işlevler
--    İzin listesi (oturumsuz kullanılabilen): invite_preview (davet sayfası), signup_code_ok (kayıt formu), site_invite_info (site davet sayfası),
--    submit_lead (web kurumsal başvuru), report_error (oturum öncesi hata kaydı), verify_rent_certificate (kira belgesi doğrulama).
-- ---------------------------------------------------------------------
do $$
declare
  f record;
  keep constant text[] := array['invite_preview', 'signup_code_ok', 'site_invite_info', 'submit_lead', 'report_error', 'verify_rent_certificate'];
  had_auth boolean;
  had_svc boolean;
  has_svc boolean := exists (select 1 from pg_roles where rolname = 'service_role');
begin
  for f in
    select p.oid, p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef and p.proname <> all (keep)
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')   -- eklentiye ait işlevlere dokunma
  loop
    had_auth := has_function_privilege('authenticated', f.oid, 'execute');
    had_svc := has_svc and has_function_privilege('service_role', f.oid, 'execute');
    execute format('revoke execute on function %s from public, anon', f.sig);
    -- authenticated ve service_role yetkiyi yalnız PUBLIC üzerinden alıyorsa (Supabase'de doğrudan alırlar; yerel testte almazlar) geri ver.
    if had_auth and not has_function_privilege('authenticated', f.oid, 'execute') then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    if had_svc and not has_function_privilege('service_role', f.oid, 'execute') then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. Yeni işlevler: anon ve PUBLIC varsayılan EXECUTE'u kaldırılır; authenticated (ve service_role, varsa) doğrudan alır.
--    Dahili (yalnız tetikleyici/zamanlanmış iş) işlevler yazılırken ayrıca "revoke ... from authenticated" yapılmalıdır.
--    Not: "in schema public" varsayılanı PUBLIC'in yerleşik varsayılan EXECUTE'unu kaldırmaz; bu yüzden şemasız satır da gerekir.
-- ---------------------------------------------------------------------
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges revoke execute on functions from public;
alter default privileges in schema public grant execute on functions to authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    alter default privileges in schema public grant execute on functions to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. search_path sabit olmayan işlevler (card_trial_from, charge_word, fmt_tl, legal_label, month_tr, org_module_list, org_perm_list, pay_ref,
--    plan_of, plan_units, product_units, project_stage_label, project_stage_tr, quotes_tenant_ok, recent_messages, sector_modules,
--    short_name, signup_code_required, storage_path, touch_updated_at, trial_days, welcome_since ve varsa benzerleri)
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public', f.sig);
  end loop;
end $$;
