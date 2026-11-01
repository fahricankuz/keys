-- P0 security upgrade for existing Anahtar installations.
-- This migration changes no existing invite, membership, or user data.
-- It intentionally has no BEGIN/COMMIT: Supabase CLI manages migration transactions.

-- New invite codes use UUID-v4 randomness (122 bits). Existing codes remain valid until expiry.
alter table public.invites
  alter column code set default upper(replace(gen_random_uuid()::text, '-', ''));

-- The RLS policy permits a member to edit their contact details. It must not also
-- permit them to change their role, user, or property. The approved team RPCs
-- set the transaction-local flag below after performing their own authorization.
create or replace function public.guard_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null
     and not public.is_admin()
     and current_setting('app.membership_role_change', true) is distinct from 'on'
     and (new.property_id is distinct from old.property_id
          or new.user_id is distinct from old.user_id
          or new.role is distinct from old.role) then
    raise exception 'Üyelik rolü, kullanıcısı ve mülkü değiştirilemez' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists guard_membership on public.memberships;
create trigger guard_membership
  before update on public.memberships
  for each row execute function public.guard_membership();

-- A tenant invite is one-time, expires, and, when addressed to an email address,
-- can only be redeemed by that verified email address.
create or replace function public.accept_invite(invite_code text)
returns text language plpgsql security definer set search_path = public as $$
declare inv public.invites; me public.profiles; pid text;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  if public.is_banned() then raise exception 'Hesap askıya alındı' using errcode = '42501'; end if;
  select * into inv from public.invites where code = upper(trim(invite_code)) for update;
  if inv.code is null then raise exception 'Davet kodu bulunamadı' using errcode = 'P0002'; end if;
  if inv.accepted_by is not null then raise exception 'Bu davet kullanılmış' using errcode = '22023'; end if;
  if inv.expires_at < now() then raise exception 'Davetin süresi dolmuş' using errcode = '22023'; end if;

  if inv.role = 'tenant' then
    if me.role <> 'tenant' then raise exception 'Bu davet kiracı hesapları içindir' using errcode = '22023'; end if;
    if nullif(btrim(inv.email), '') is not null and not exists (
      select 1 from auth.users u
      where u.id = me.id
        and lower(u.email) = lower(btrim(inv.email))
        and u.email_confirmed_at is not null
    ) then
      raise exception 'Davet edilen doğrulanmış e-posta hesabı gerekli' using errcode = '42501';
    end if;
    insert into public.memberships (property_id, user_id, role, display_name, phone, email)
    values (inv.property_id, me.id, 'tenant', coalesce(nullif(me.name, ''), inv.name),
            coalesce(nullif(me.phone, ''), inv.phone),
            coalesce((select email from auth.users where id = me.id), inv.email))
    on conflict (property_id, user_id) do nothing;
    insert into public.messages (id, property_id, from_role, by_user, body)
    values (gen_random_uuid()::text, inv.property_id, 'system', null, me.name || ' eve katıldı');
  else
    if me.role not in ('team','landlord') then raise exception 'Ekip davetleri ekip ya da mülk sahibi hesapları içindir' using errcode = '22023'; end if;
    if me.id = inv.created_by then raise exception 'Kendi davetini kullanamazsın' using errcode = '22023'; end if;
    perform set_config('app.membership_role_change', 'on', true);
    insert into public.team_members (owner_id, member_id, role, scope)
    values (inv.created_by, me.id, inv.role, inv.scope)
    on conflict (owner_id, member_id) do update set
      role = excluded.role,
      scope = case when public.team_members.scope = 'portfolio' then 'portfolio' else excluded.scope end;
    for pid in select id from public.properties where owner_id = inv.created_by
      and (inv.scope = 'portfolio' or id = inv.property_id) loop
      insert into public.memberships (property_id, user_id, role, display_name, email)
      values (pid, me.id, inv.role, me.name, coalesce((select email from auth.users where id = me.id), ''))
      on conflict (property_id, user_id) do update set role = excluded.role
        where public.memberships.role <> 'landlord';
    end loop;
    perform public.log_activity(inv.property_id, 'team', 'join', me.id::text,
      jsonb_build_object('role', inv.role, 'scope', inv.scope), inv.created_by);
  end if;
  update public.invites set accepted_by = me.id, accepted_at = now() where code = inv.code;
  return inv.property_id;
end $$;
grant execute on function public.accept_invite(text) to authenticated;

create or replace function public.team_set(member uuid, new_role text, new_scope text, pids text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.team_members where owner_id = auth.uid() and member_id = member) then
    raise exception 'Bu kişi ekibinde değil' using errcode = '42501';
  end if;
  if new_role not in ('agent','accountant','staff') or new_scope not in ('property','portfolio') then
    raise exception 'Geçersiz rol' using errcode = '22023';
  end if;
  perform set_config('app.membership_role_change', 'on', true);
  update public.team_members set role = new_role, scope = new_scope
    where owner_id = auth.uid() and member_id = member;
  delete from public.memberships m using public.properties p
    where m.property_id = p.id and p.owner_id = auth.uid() and m.user_id = member
      and m.role <> 'landlord' and new_scope = 'property' and not (m.property_id = any(pids));
  insert into public.memberships (property_id, user_id, role, display_name)
    select p.id, member, new_role, pr.name
    from public.properties p join public.profiles pr on pr.id = member
    where p.owner_id = auth.uid() and (new_scope = 'portfolio' or p.id = any(pids))
    on conflict (property_id, user_id) do update set role = excluded.role
      where public.memberships.role <> 'landlord';
  perform public.log_activity(null, 'team', 'set', member::text,
    jsonb_build_object('role', new_role, 'scope', new_scope), auth.uid());
end $$;
grant execute on function public.team_set(uuid, text, text, text[]) to authenticated;
