-- Portföy kurumu (site, GYO, AVM, depo) master'ı otomatik mülk sahibi yapılmaz.
-- Sorun: master atanınca hesap mülk sahibine çevriliyordu (org_master_landlord). Site/GYO/AVM/depo kurumlarının portföyü birimlerde
-- olduğundan buna gerek yok; çevrilen hesapta boş bir "Mülk sahibi · Deneme" rolü çıkıyor, kişisel deneme boşuna başlıyordu.
-- 1. Master tetikleyicisi yalnız emlak ofisi, aile ofisi ve diğer kurumlarda mülk sahibine çevirir.
-- 2. admin_org_set_master: kiracı/ekip denetimi yalnız bu sektörlerde (portföy sektöründe her hesap master olabilir).
-- 3. add_landlord_role: kimsenin ekibinde olmayan ekip hesabı (ör. davetle açılmış site yöneticisi) "Rol ekle → Mülk sahibi" yapabilir.
-- 4. Mevcut hesaplar: yalnız portföy kurumunda master olan, hiç mülkü, mülk sahipliği, aboneliği olmayan ve emlak/aile/diğer kurumunda
--    master olmayan "mülk sahibi" hesapları eski rolüne döner (sitede/evde kiracı ya da sakin kaydı varsa kiracı, yoksa ekip);
--    deneme başlangıcı silinir (kişi sonradan mülk sahibi olursa deneme o an başlar). Kayıt silinmez.
-- Eski istemciyle uyumlu, yeniden çalıştırılabilir.

create or replace function public.org_master_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_master and (select sector from public.organizations where id = new.org_id) not in ('site','avm','depo','gyo') then
    perform public.org_master_landlord(new.user_id);
  end if;
  return null;
end $$;

create or replace function public.admin_org_set_master(oid uuid, mail text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  c text;
  oname text;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  select name into oname from public.organizations where id = oid;
  if not found then raise exception 'Kurum bulunamadı' using errcode = 'P0002'; end if;
  mail := lower(btrim(coalesce(mail, '')));
  if mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Geçerli bir e-posta adresi yaz.' using errcode = '22023'; end if;
  select id into uid from auth.users where lower(email) = mail;
  if uid is not null and exists (select 1 from public.profiles where id = uid) then
    -- Master mülk sahibi hesabı olmalı (kurumun mülkleri onun hesabına eklenir). Çevrilemeyecek hesap atanmaz:
    -- başka bir mülk sahibinin ekibindeki ekip hesabı ve bir eve kiracı olarak bağlı kiracı hesabı.
    -- Portföy sektörlerinde (site, GYO, AVM, depo) master mülk sahibi olmak zorunda değil: denetim yalnız diğer sektörlerde.
    if (select sector from public.organizations where id = oid) not in ('site','avm','depo','gyo')
       and exists (select 1 from public.profiles where id = uid and role = 'team') and exists (select 1 from public.team_members where member_id = uid) then
      raise exception 'Bu hesap başka bir mülk sahibinin ekibinde; kurum yöneticisi için mülk sahibi hesabı gerekir.' using errcode = '22023';
    end if;
    if (select sector from public.organizations where id = oid) not in ('site','avm','depo','gyo')
       and exists (select 1 from public.profiles where id = uid and role = 'tenant') and exists (select 1 from public.memberships m where m.user_id = uid and m.role = 'tenant') then
      raise exception 'Bu hesap bir eve kiracı olarak bağlı; kurum yöneticisi için mülk sahibi hesabı gerekir.' using errcode = '22023';
    end if;
    update public.org_members set is_master = false where org_id = oid and is_master and user_id <> uid;
    insert into public.org_members (org_id, user_id, role_id, is_master) values (oid, uid, null, true)
    on conflict (org_id, user_id) do update set is_master = true, role_id = null;
    perform public.audit('org.master', oid::text, jsonb_build_object('user', uid, 'email', mail));
    insert into public.notifications (user_id, title, body, url, tag)
    values (uid, 'Kurum yöneticisi olarak atandın',
            oname || ' kurumunun yöneticisi oldun. Panelinden ekibi, kişileri ve ayarları yönetebilirsin.',
            '/uygulama', 'acct-org-' || floor(extract(epoch from clock_timestamp()))::text)
    on conflict do nothing;
    return jsonb_build_object('status', 'set', 'user', uid);
  end if;
  delete from public.org_invites where org_id = oid and master and accepted_by is null;
  insert into public.org_invites (org_id, master, email) values (oid, true, mail) returning code into c;
  perform public.audit('org.master_invite', oid::text, jsonb_build_object('email', mail));
  insert into public.mail_outbox (kind, to_email, lang, data, dedupe)
  values ('org_master_invite', mail, 'tr', jsonb_build_object('org', oname, 'code', c), c)
  on conflict do nothing;
  return jsonb_build_object('status', 'invited', 'code', c);
end $$;

create or replace function public.add_landlord_role()
returns text language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  if public.is_banned() then raise exception 'Hesap askıya alındı' using errcode = '42501'; end if;
  if p.role = 'landlord' then return 'landlord'; end if;
  if p.role = 'team' and exists (select 1 from public.team_members t where t.member_id = p.id) then raise exception 'Ekip hesabı mülk sahibi hesabına dönüştürülemez' using errcode = '22023'; end if;
  perform set_config('anahtar.system', '1', true);
  update public.profiles set role = 'landlord', landlord_since = coalesce(landlord_since, now()) where id = p.id;
  perform set_config('anahtar.system', '', true);
  return 'landlord';
end $$;

do $$
begin
  perform set_config('anahtar.system', '1', true);
  update public.profiles p
     set role = case when exists (select 1 from public.memberships m where m.user_id = p.id and m.role = 'tenant')
                       or exists (select 1 from public.site_residents r where r.user_id = p.id) then 'tenant' else 'team' end,
         landlord_since = null
   where p.role = 'landlord'
     and exists (select 1 from public.org_members m join public.organizations o on o.id = m.org_id
                 where m.user_id = p.id and m.is_master and o.sector in ('site','avm','depo','gyo'))
     and not exists (select 1 from public.org_members m join public.organizations o on o.id = m.org_id
                     where m.user_id = p.id and m.is_master and o.sector not in ('site','avm','depo','gyo'))
     and not exists (select 1 from public.properties x where x.owner_id = p.id)
     and not exists (select 1 from public.memberships m where m.user_id = p.id and m.role = 'landlord')
     and not exists (select 1 from public.subscriptions s where s.user_id = p.id);
  perform set_config('anahtar.system', '', true);
end $$;
