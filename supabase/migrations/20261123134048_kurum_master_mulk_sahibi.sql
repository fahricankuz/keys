-- Kurum master yöneticisi mülk sahibi hesabı olur: ekip hesabı da çevrilir.
-- Sorun: master daveti yeni kişiye "Hesap oluştur" ile EKİP hesabı açtırıyordu. org_master_landlord yalnız kiracı hesabını çevirdiği
-- için master ekip hesabı kalıyor; kurumun mülkleri master'ın hesabına eklendiğinden yönetici panelindeki "Mülk ekle"
-- "Bu hesap mülk sahibi hesabı değil" diye reddediliyordu.
-- Çözüm: org_master_landlord (org_members tetikleyicisi, master atanınca ve davet kabulünde çalışır) başka bir mülk sahibinin ekibinde
-- olmayan ekip hesabını da çevirir; landlord_since o an yazılır (add_landlord_role ile aynı). Yönetici panelinden çevrilemeyecek
-- hesap (başka birinin ekibindeki ekip hesabı, bir eve kiracı olarak bağlı kiracı) master atanamaz, açık uyarı verir.
-- Mevcut master'lar da çevrilir. Eski istemciyle uyumlu; yeniden çalıştırılabilir.

/** Kurumun master yöneticisini mülk sahibi yapar: kiracı hesabı (hiçbir eve kiracı olarak bağlı değilse) ya da ekip hesabı
    (hiçbir mülk sahibinin ekibinde değilse). Diğerlerinde bir şey yapmaz. */
create or replace function public.org_master_landlord(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('anahtar.system', '1', true);
  update public.profiles set role = 'landlord', landlord_since = coalesce(landlord_since, now())
   where id = uid
     and ((role = 'tenant' and not exists (select 1 from public.memberships m where m.user_id = uid and m.role = 'tenant'))
       or (role = 'team' and not exists (select 1 from public.team_members t where t.member_id = uid)));
  perform set_config('anahtar.system', '', true);
end $$;
revoke execute on function public.org_master_landlord(uuid) from public, anon, authenticated;

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
    if exists (select 1 from public.profiles where id = uid and role = 'team') and exists (select 1 from public.team_members where member_id = uid) then
      raise exception 'Bu hesap başka bir mülk sahibinin ekibinde; kurum yöneticisi için mülk sahibi hesabı gerekir.' using errcode = '22023';
    end if;
    if exists (select 1 from public.profiles where id = uid and role = 'tenant') and exists (select 1 from public.memberships m where m.user_id = uid and m.role = 'tenant') then
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

create or replace function public.admin_add_property(owner_uid uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r text;
  nm text := btrim(coalesce(p ->> 'name', ''));
  pid text;
  o public.organizations;
  lim int;
  n int;
  sd date := coalesce(nullif(p ->> 'start_date', '')::date, current_date);
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  select role into r from public.profiles where id = owner_uid;
  if r is null then raise exception 'Hesap bulunamadı' using errcode = 'P0002'; end if;
  if r = 'team' then raise exception 'Bu hesap ekip hesabı; mülk yalnız mülk sahibi hesabına eklenir. Kurum yöneticisini mülk sahibi hesabıyla yeniden ata.' using errcode = '22023'; end if;
  if r <> 'landlord' then raise exception 'Bu hesap mülk sahibi hesabı değil' using errcode = '22023'; end if;
  if length(nm) < 2 then raise exception 'Mülk adını yaz' using errcode = '22023'; end if;
  insert into public.properties (owner_id, name, addr, prop_type, area, rent, due_day, aidat, deposit, start_date, contract_end)
  values (owner_uid, nm, left(coalesce(p ->> 'addr', ''), 300), coalesce(nullif(p ->> 'prop_type', ''), 'Konut'),
          nullif(p ->> 'area', '')::numeric, coalesce(nullif(p ->> 'rent', '')::numeric, 0), coalesce(nullif(p ->> 'due_day', '')::int, 1),
          coalesce(nullif(p ->> 'aidat', '')::numeric, 0), coalesce(nullif(p ->> 'deposit', '')::numeric, 0), sd,
          coalesce(nullif(p ->> 'contract_end', '')::date, (sd + interval '1 year')::date))
  returning id into pid;
  o := public.master_org(owner_uid);
  if o.id is not null then
    lim := o.units;
    select count(*) into n from public.properties x where x.org_id = o.id or x.owner_id = owner_uid;
  else
    lim := (public.access_state(owner_uid) ->> 'units')::int;
    select count(*) into n from public.properties x where x.owner_id = owner_uid;
  end if;
  perform public.audit('property.add', pid, jsonb_build_object('owner', owner_uid, 'name', nm));
  return jsonb_build_object('id', pid, 'count', n, 'limit', lim, 'over', lim is not null and n > lim);
end $$;

-- Mevcut master'lar.
do $$
declare m uuid;
begin
  for m in select distinct user_id from public.org_members where is_master loop
    perform public.org_master_landlord(m);
  end loop;
end $$;
