-- davet kodları (üretim öncesi güvenlik denetimi, 2026-11-13)
-- Sorunlar: kodlar kısaydı (mülk 8 onaltılık hane = 32 bit; kurum "K"+7, site sakini "S"+7 = 28 bit) ve denemeye sınır yoktu; oturumsuz üç işlev
-- (invite_preview, site_invite_info, signup_code_ok) kod avcılığına yarıyordu ve site_invite_info geçerli bir kod için sakinin adını, telefonunu ve
-- e-postasını veriyordu; kabul işlevleri ayırt edici hata iletileri döndürüyordu; davet kimin için olduğuna bağlı değildi; site sakininin davet kodu
-- kurumun salt okur rollerince de okunabiliyordu.
-- Bu migration:
--  1. Yeni kodlar ≥80 bit: mülk 16 karakter, kurum "K"+16, site sakini "S"+16 (Crockford base32, büyük harf). Eski kodlar süresi dolana (sakin kodları kabul edilene)
--     kadar geçerli kalır. Kabul işlevleri girdiyi normalleştirir (büyük harf; boşluk, tire ve işaret atılır; O→0, I ve L→1).
--  2. invite_attempts + invite_throttle(): kullanıcı başına ve istemci IP'si başına saatte en çok 10 başarısız deneme; sınır dolunca doğru kod bile reddedilir.
--  3. Başarısız her kabul / önizleme tek biçimde sonuçlanır: kabul işlevleri NULL döndürür (kod yok, kullanılmış, süresi dolmuş, başka e-postaya ait ya da
--     deneme sınırı: hepsi aynı), önizleme işlevleri NULL / false döner. Neden hata fırlatılmıyor: işlev hata verirse PostgREST işlemi geri alır ve
--     başarısız denemenin kaydı da silinirdi; sınır işlemez. Oturum yok / hesap askıda hataları ve "kendi davetini kullanamazsın" gibi kod doğrulandıktan
--     sonraki iletiler eskisi gibi hata olarak kalır.
--  4. E-posta bağlama: davetin e-postası doluysa yalnız o e-postalı hesap kabul edebilir.
--  5. site_invite_info yalnız maskeli ad döndürür (telefon ve e-posta yok); site_resident_code(p_resident) kodu yalnız "Malik ve kiracılar" yetkisine verir;
--     site_residents.code sütunu istemciden yazılamaz. (Okumanın kapatılması eski istemciyi bozacağı için sonraki PR'dadır:
--     specs/followup-migrations/.)
--  6. site_invite_mail: aynı kişiye e-posta 2 dakikada bir.
-- Yeniden çalıştırılabilir. Eski kodlar ve eski istemci: kod biçimi serbest, işlev imzaları aynı; istemcinin yapması gereken değişiklikler
-- tests/davet-kodlari.sql.spec.mjs içinde.

-- ---------------------------------------------------------------------
-- 1. Kod üretici ve normalleştirici
-- ---------------------------------------------------------------------
-- n karakterlik (5 bit/karakter) kod. Rastgelelik: gen_random_uuid() (kriptografik); sürüm ve varyant baytları atılır, kalan 14 bayt/uuid kullanılır.
create or replace function public.gen_invite_code(n integer default 16) returns text
language plpgsql volatile set search_path = public as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  raw bytea;
  bits text := '';
  res text := '';
  i int;
begin
  if n is null or n < 1 or n > 40 then raise exception 'Geçersiz kod uzunluğu' using errcode = '22023'; end if;
  while length(bits) < n * 5 loop
    raw := uuid_send(gen_random_uuid());
    for i in 0..15 loop
      continue when i in (6, 8);
      bits := bits || get_byte(raw, i)::bit(8)::text;
    end loop;
  end loop;
  for i in 0..n - 1 loop
    res := res || substr(alphabet, (substring(bits from i * 5 + 1 for 5)::bit(5)::int) + 1, 1);
  end loop;
  return res;
end $$;

create or replace function public.invite_norm(c text) returns text
language sql immutable set search_path = public as $$
  select translate(upper(left(regexp_replace(coalesce(c, ''), '[^0-9A-Za-z]', '', 'g'), 40)), 'OIL', '011')
$$;

alter table public.invites alter column code set default public.gen_invite_code(16);
alter table public.org_invites alter column code set default ('K' || public.gen_invite_code(16));
alter table public.site_residents alter column code set default ('S' || public.gen_invite_code(16));

-- Ad maskesi: her sözcüğün ilk harfi ve ***  ("Ayşe Yılmaz" → "A*** Y***").
create or replace function public.mask_name(n text) returns text
language sql immutable set search_path = public as $$
  select regexp_replace(btrim(coalesce(n, '')), '(\S)\S*', '\1***', 'g')
$$;

-- ---------------------------------------------------------------------
-- 2. Deneme kaydı ve sınır
-- ---------------------------------------------------------------------
create table if not exists public.invite_attempts (
  id      bigint generated always as identity primary key,
  at      timestamptz not null default now(),
  user_id uuid,
  ip      text
);
create index if not exists invite_attempts_user on public.invite_attempts (user_id, at) where user_id is not null;
create index if not exists invite_attempts_ip on public.invite_attempts (ip, at) where ip is not null;
alter table public.invite_attempts enable row level security;     -- politika yok: yalnız security definer işlevler (ve service_role) yazar/okur
revoke all on public.invite_attempts from anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then revoke all on public.invite_attempts from service_role; end if;
end $$;

-- İstemci IP'si. Cloudflare'in koyduğu cf-connecting-ip varsa o (istemci uyduramaz), yoksa x-forwarded-for'un ilk girdisi.
-- Oturum açan kullanıcı sayacı ayrıca tutulur; IP yoksa (ör. kayıt sırasında auth tetikleyicisi) yalnız kullanıcıya bakılır.
create or replace function public.client_ip() returns text
language plpgsql stable set search_path = public as $$
declare h jsonb; v text;
begin
  begin h := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then h := null; end;
  if h is null then return null; end if;
  v := coalesce(nullif(btrim(h ->> 'cf-connecting-ip'), ''), nullif(btrim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)), ''));
  return left(v, 64);
end $$;

-- true: kullanıcı ya da IP son bir saatte 10 başarısız deneme yapmış.
create or replace function public.invite_throttle() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_ip text := public.client_ip();
begin
  if v_uid is null and v_ip is null then return false; end if;
  return (v_uid is not null and (select count(*) from public.invite_attempts a where a.user_id = v_uid and a.at > now() - interval '1 hour') >= 10)
      or (v_ip is not null and (select count(*) from public.invite_attempts a where a.ip = v_ip and a.at > now() - interval '1 hour') >= 10);
end $$;

create or replace function public.invite_fail() returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_ip text := public.client_ip();
begin
  if v_uid is null and v_ip is null then return; end if;
  insert into public.invite_attempts (user_id, ip) values (v_uid, v_ip);
end $$;

revoke execute on function public.invite_throttle() from public, anon, authenticated;
revoke execute on function public.invite_fail() from public, anon, authenticated;
revoke execute on function public.client_ip() from public, anon, authenticated;
revoke execute on function public.invite_norm(text) from public, anon, authenticated;
revoke execute on function public.mask_name(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Kabul işlevleri
-- ---------------------------------------------------------------------
create or replace function public.accept_invite(invite_code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
  me  public.profiles;
  pid text;
  c   text := public.invite_norm(invite_code);
  mail text;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  if public.is_banned() then raise exception 'Hesap askıya alındı' using errcode = '42501'; end if;
  if public.invite_throttle() then return null; end if;

  select lower(btrim(email::text)) into mail from auth.users where id = me.id;
  select * into inv from public.invites where code = c for update;
  -- Tek sonuç: kod yok, kullanılmış, süresi dolmuş, başka e-postaya bağlı ya da deneme sınırı → NULL (başarısızlık kaydedilir).
  if inv.code is null or inv.accepted_by is not null or inv.expires_at < now()
     or (btrim(inv.email) <> '' and lower(btrim(inv.email)) is distinct from mail) then
    perform public.invite_fail();
    return null;
  end if;

  if inv.role = 'tenant' then
    -- Aynı e-posta birden çok rol taşıyabilir: mülk sahibi ve ekip hesapları da başka bir mülkte kiracı olabilir.
    -- Kendi mülkünün kiracı davetini kullanamaz (kendi evinin kiracısı olamaz).
    if me.id = inv.created_by or exists (select 1 from public.properties where id = inv.property_id and owner_id = me.id) then
      raise exception 'Kendi davetini kullanamazsın' using errcode = '22023';
    end if;
    insert into public.memberships (property_id, user_id, role, display_name, phone, email)
    values (inv.property_id, me.id, 'tenant', coalesce(nullif(me.name, ''), inv.name), coalesce(nullif(me.phone, ''), inv.phone),
            coalesce((select email from auth.users where id = me.id), inv.email))
    on conflict (property_id, user_id) do nothing;
    insert into public.messages (id, property_id, from_role, by_user, body)
    values (gen_random_uuid()::text, inv.property_id, 'system', null, me.name || ' eve katıldı');
  else
    if me.role not in ('team','landlord') then raise exception 'Ekip davetleri ekip ya da mülk sahibi hesapları içindir' using errcode = '22023'; end if;
    if me.id = inv.created_by then raise exception 'Kendi davetini kullanamazsın' using errcode = '22023'; end if;
    insert into public.team_members (owner_id, member_id, role, scope) values (inv.created_by, me.id, inv.role, inv.scope)
    on conflict (owner_id, member_id) do update set role = excluded.role,
      scope = case when public.team_members.scope = 'portfolio' then 'portfolio' else excluded.scope end;
    for pid in select id from public.properties
               where owner_id = inv.created_by and (inv.scope = 'portfolio' or id = inv.property_id) loop
      insert into public.memberships (property_id, user_id, role, display_name, email)
      values (pid, me.id, inv.role, me.name, coalesce((select email from auth.users where id = me.id), ''))
      on conflict (property_id, user_id) do update set role = excluded.role where public.memberships.role <> 'landlord';
    end loop;
    perform public.log_activity(inv.property_id, 'team', 'join', me.id::text, jsonb_build_object('role', inv.role, 'scope', inv.scope), inv.created_by);
  end if;

  update public.invites set accepted_by = me.id, accepted_at = now() where code = inv.code;
  return inv.property_id;
end $$;

create or replace function public.accept_org_invite(invite_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  inv public.org_invites;
  me uuid := auth.uid();
  c text := public.invite_norm(invite_code);
  mail text;
begin
  if me is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  if public.is_banned() then raise exception 'Hesap askıya alındı' using errcode = '42501'; end if;
  if public.invite_throttle() then return null; end if;
  select lower(btrim(email::text)) into mail from auth.users where id = me;
  select * into inv from public.org_invites where code = c for update;
  if inv.code is null or (inv.accepted_by is not null and inv.accepted_by <> me) or inv.expires_at < now()
     or (btrim(inv.email) <> '' and lower(btrim(inv.email)) is distinct from mail) then
    perform public.invite_fail();
    return null;
  end if;
  if inv.master then
    update public.org_members set is_master = false where org_id = inv.org_id and is_master and user_id <> me;
    insert into public.org_members (org_id, user_id, role_id, is_master) values (inv.org_id, me, null, true)
    on conflict (org_id, user_id) do update set is_master = true, role_id = null;
  else
    insert into public.org_members (org_id, user_id, role_id) values (inv.org_id, me, inv.role_id)
    on conflict (org_id, user_id) do update set role_id = case when public.org_members.is_master then null else excluded.role_id end;
  end if;
  update public.org_invites set accepted_by = me, accepted_at = now() where code = inv.code;
  return inv.org_id;
end $$;

create or replace function public.accept_site_invite(invite_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r public.site_residents;
  c text := public.invite_norm(invite_code);
  mail text;
begin
  if auth.uid() is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  if public.is_banned() then raise exception 'Hesap askıya alındı' using errcode = '42501'; end if;
  if public.invite_throttle() then return null; end if;
  select lower(btrim(email::text)) into mail from auth.users where id = auth.uid();
  select * into r from public.site_residents where code = c for update;
  if r.id is not null and r.user_id = auth.uid() then return r.unit_id; end if;            -- aynı hesap kodu yeniden kullanırsa işlem değişmez
  if r.id is null or r.user_id is not null or (btrim(r.email) <> '' and lower(btrim(r.email)) is distinct from mail) then
    perform public.invite_fail();
    return null;
  end if;
  update public.site_residents set user_id = auth.uid() where id = r.id;
  return r.unit_id;
end $$;

-- ---------------------------------------------------------------------
-- 4. Oturumsuz önizleme / kod denetimi (anon): geçerli koddan başka hiçbir şey döndürmez
-- ---------------------------------------------------------------------
create or replace function public.invite_preview(invite_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare r jsonb; c text := public.invite_norm(invite_code);
begin
  if public.invite_throttle() then return null; end if;
  select jsonb_build_object('role', i.role, 'scope', i.scope, 'owner', o.name, 'property', p.name, 'valid', true, 'email_bound', btrim(i.email) <> '')
    into r
    from public.invites i join public.properties p on p.id = i.property_id join public.profiles o on o.id = i.created_by
   where i.code = c and i.accepted_by is null and i.expires_at > now();
  if r is null then perform public.invite_fail(); end if;
  return r;
end $$;

create or replace function public.signup_code_ok(invite_code text) returns boolean
language plpgsql volatile security definer set search_path = public as $$
declare c text := public.invite_norm(invite_code); ok boolean;
begin
  if public.invite_throttle() then return false; end if;
  if length(c) not between 6 and 24 then
    if length(c) > 0 then perform public.invite_fail(); end if;
    return false;
  end if;
  ok := exists (select 1 from public.invites i where i.code = c and i.role = 'tenant' and i.accepted_by is null and i.expires_at > now())
     or exists (select 1 from public.site_residents r where r.code = c and r.user_id is null);
  if not ok then perform public.invite_fail(); end if;
  return ok;
end $$;

-- Site daveti önizlemesi: kurum, daire ve rol; ad yalnız maskeli, telefon/e-posta yok (e-postaya bağlı olup olmadığı bilgisi var).
create or replace function public.site_invite_info(invite_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare res jsonb; c text := public.invite_norm(invite_code);
begin
  if public.invite_throttle() then return null; end if;
  select jsonb_build_object('org', o.name, 'sector', o.sector, 'unit', public.unit_label(r.unit_id), 'role', r.role,
                            'name', public.mask_name(r.name), 'email_bound', btrim(r.email) <> '', 'used', false)
    into res
    from public.site_residents r join public.organizations o on o.id = r.org_id
   where r.code = c and r.user_id is null;
  if res is null then perform public.invite_fail(); end if;
  return res;
end $$;

-- ---------------------------------------------------------------------
-- 5. Sakin davet kodu: yalnız "Malik ve kiracılar" yetkisi okur
-- ---------------------------------------------------------------------
create or replace function public.site_resident_code(p_resident uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare r public.site_residents;
begin
  if auth.uid() is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  select * into r from public.site_residents where id = p_resident;
  if r.id is null then raise exception 'Kişi bulunamadı' using errcode = 'P0002'; end if;
  if not public.org_can(r.org_id, 'residents.manage') then raise exception 'Davet yetkin yok' using errcode = '42501'; end if;
  return r.code;
end $$;
grant execute on function public.site_resident_code(uuid) to authenticated;

-- Sütun yetkileri: code istemciden YAZILAMAZ (istemci kod uyduramaz). Eski istemci yalnız bu sütunları yazar (saveResident, markInvited, toplu ekleme),
-- bu yüzden yazma kısıtı eski istemciyi bozmaz; mailed_at ve code yalnız sunucuda yazılır.
-- Okuma kısıtı (code sütununu istemciden gizleyen "revoke select" ve sütun listesiyle "grant select") BU migrationda YOKTUR: yayındaki eski web istemcisi
-- "select *" ve "insert ... returning *" kullanır ve sütun yetkisiyle bozulur. O değişiklik, yeni site yayına çıkıp en az 24 saat geçtikten sonra ayrı bir PR'da
-- uygulanır: specs/followup-migrations/20261113141601_site_residents_kod_gizle.sql (README.md orada). Yeni istemci kodu zaten site_resident_code() ile okur.
alter table public.site_residents add column if not exists mailed_at timestamptz;
revoke insert, update on public.site_residents from authenticated;
grant insert (org_id, unit_id, user_id, role, name, phone, email, lives_here, invited_at) on public.site_residents to authenticated;
grant update (org_id, unit_id, user_id, role, name, phone, email, lives_here, invited_at) on public.site_residents to authenticated;

-- ---------------------------------------------------------------------
-- 6. Davet e-postası: aynı kişiye 2 dakikada bir (site-invite işlevi {throttled:true} alınca göndermez)
-- ---------------------------------------------------------------------
create or replace function public.site_invite_mail(rid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.site_residents; o public.organizations;
begin
  select * into r from public.site_residents where id = rid;
  if r.id is null then raise exception 'Kişi bulunamadı' using errcode = 'P0002'; end if;
  if not public.org_can(r.org_id, 'residents.manage') then raise exception 'Davet yetkin yok' using errcode = '42501'; end if;
  if r.user_id is not null then raise exception 'Bu kişi zaten katıldı' using errcode = '22023'; end if;
  if r.email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'E-posta adresi yok' using errcode = '22023'; end if;
  if r.mailed_at is not null and r.mailed_at > now() - interval '2 minutes' then return jsonb_build_object('throttled', true); end if;
  select * into o from public.organizations where id = r.org_id;
  update public.site_residents set invited_at = now(), mailed_at = now() where id = rid;
  return jsonb_build_object('email', r.email, 'name', r.name, 'role', r.role, 'code', r.code, 'org', o.name, 'sector', o.sector,
    'unit', public.unit_label(r.unit_id), 'by', (select name from public.profiles where id = auth.uid()));
end $$;

-- ---------------------------------------------------------------------
-- 7. Temizlik: deneme kayıtları 2 gün tutulur (zamanlanmış prune_logs işi siler)
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
  return n + m;
end $$;
