-- saklama süreleri
-- Yeni gizlilik ve hesap silme sayfaları (gizlilik, hesap-silme) saklama süreleri vaat eder; kod bunları şimdiye kadar uygulamıyordu:
--  1. prune_logs(): mail_outbox satırları 90 gün sonra silinir (gönderilmiş, başarısız ya da takılı kalmış: hepsi; adres taşıdıkları için bekletilmez);
--     çözülmüş (status = 'done') destek talepleri 6 ay sonra silinir. support_requests'te güncelleme zamanı sütunu yoktur: kapanış anı bilinmediği için
--     created_at + status = 'done' kullanılır (talep en erken oluşturulduktan 6 ay sonra, çözülmüşse silinir). Hukuki talepler (legal_requests) hesapla
--     birlikte silinir (user_id ... on delete cascade); admin_audit değişmez (politika 10 yıla kadar der).
--  2. delete_my_account(): silmeden önce kişinin destek taleplerini anonimleştirir (ad 'silindi'; e-posta, telefon, şirket, mesaj ve ayrıntı boşaltılır;
--     talep ve durum kalır, user_id zaten on delete set null), hesap silindi e-postası kuyruğa yalnız gerekli alanlarla (adres, dil, ad) yazılır
--     (satır 90 gün sonra prune_logs ile silinir) ve RevenueCat abonesinin silinmesi için revenuecat_deletions kuyruğuna kimlik yazılır.
--     Hukuki talepte contact alanı guard_legal ile değişmezdir ve satır hesap silinince zaten cascade ile gider; ayrıca güncellenmez.
--  3. revenuecat_deletions: billing fonksiyonunun günlük uzlaştırması (RevenueCat DELETE /v1/subscribers/{app_user_id}) bu kuyruğu işler.
-- Eski istemciyle uyumlu: işlev imzaları aynı. Yeniden çalıştırılabilir.

-- ---------------------------------------------------------------------
-- 3. RevenueCat silme kuyruğu (istemciye kapalı: RLS açık, politika yok, yetki yok; yalnız security definer işlev ve service_role)
-- ---------------------------------------------------------------------
create table if not exists public.revenuecat_deletions (
  user_id    uuid primary key,
  created_at timestamptz not null default now()
);
alter table public.revenuecat_deletions enable row level security;
revoke all on public.revenuecat_deletions from anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then grant select, delete on public.revenuecat_deletions to service_role; end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Hesabı silme
-- ---------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare mail text; nm text; lg text; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  select u.email::text, p.name, coalesce(p.lang, 'tr') into mail, nm, lg
    from auth.users u left join public.profiles p on p.id = u.id where u.id = uid;
  if mail is not null then
    insert into public.mail_outbox (kind, to_email, lang, data, dedupe)
    values ('account_deleted', mail, lg, jsonb_build_object('name', coalesce(nm, ''), 'by', 'self'), uid::text)
    on conflict do nothing;
  end if;
  update public.support_requests set name = 'silindi', email = '', phone = '', company = '', message = '', details = '{}'::jsonb where user_id = uid;
  insert into public.revenuecat_deletions (user_id) values (uid) on conflict do nothing;
  update public.messages set by_user = null where by_user = uid;
  delete from auth.users where id = uid;
end $$;
grant execute on function public.delete_my_account() to authenticated;

-- Yönetici silmesi de aynı saklama kurallarına uyar: destek talepleri anonimleşir, RevenueCat kuyruğuna kimlik yazılır (denetim ve yönetici kontrolleri aynı).
create or replace function public.admin_delete_user(uid uuid, why text default '')
returns void language plpgsql security definer set search_path = public as $$
declare pr public.profiles; mail text; owned int;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  if uid = auth.uid() then raise exception 'Kendi hesabını buradan silemezsin' using errcode = '22023'; end if;
  if exists (select 1 from public.admins where user_id = uid) then raise exception 'Yönetici silinemez' using errcode = '22023'; end if;
  select * into pr from public.profiles where id = uid;
  if not found then raise exception 'Kullanıcı bulunamadı' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.bans where user_id = uid) then raise exception 'Önce hesabı yasakla, sonra sil' using errcode = '22023'; end if;
  select email::text into mail from auth.users where id = uid;
  select count(*) into owned from public.properties where owner_id = uid;
  perform public.audit('user.delete', uid::text, jsonb_build_object('email', coalesce(mail, ''), 'name', coalesce(pr.name, ''), 'role', pr.role,
                                                                      'properties', owned, 'reason', coalesce(trim(why), '')));
  if mail is not null then
    insert into public.mail_outbox (kind, to_email, lang, data, dedupe)
    values ('account_deleted', mail, coalesce(pr.lang, 'tr'),
            jsonb_build_object('name', coalesce(pr.name, ''), 'by', 'admin', 'reason', coalesce(trim(why), '')), uid::text)
    on conflict do nothing;
  end if;
  update public.support_requests set name = 'silindi', email = '', phone = '', company = '', message = '', details = '{}'::jsonb where user_id = uid;
  insert into public.revenuecat_deletions (user_id) values (uid) on conflict do nothing;
  update public.messages set by_user = null where by_user = uid;
  delete from auth.users where id = uid;
end $$;
grant execute on function public.admin_delete_user(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 1. Temizlik
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
  delete from public.mail_outbox where created_at < now() - interval '90 days';
  delete from public.support_requests where status = 'done' and created_at < now() - interval '6 months';
  return n + m;
end $$;
