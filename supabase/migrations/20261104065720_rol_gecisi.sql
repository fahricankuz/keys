-- Aynı e-posta birden çok rol taşıyabilir: mülk sahibi (ve ekip) hesabı başka bir mülkte kiracı olabilir.
-- Önceden kiracı davetini yalnız kiracı hesapları kabul edebiliyordu; ev sahibi aynı zamanda kiracıysa ikinci bir hesap açmak gerekiyordu.
-- Yalnızca accept_invite değişir (önceki sürüm: davet_tekrar_kullanim). Kendi mülkünün davetini kullanma engeli eklendi.
-- Yeniden çalıştırılabilir: create or replace.

create or replace function public.accept_invite(invite_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
  me  public.profiles;
  pid text;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  if public.is_banned() then raise exception 'Hesap askıya alındı' using errcode = '42501'; end if;

  select * into inv from public.invites where code = upper(trim(invite_code)) for update;
  if inv.code is null then raise exception 'Davet kodu bulunamadı' using errcode = 'P0002'; end if;
  if inv.accepted_by is not null then raise exception 'Bu davet kullanılmış' using errcode = '22023'; end if;
  if inv.expires_at < now() then raise exception 'Davetin süresi dolmuş' using errcode = '22023'; end if;

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
grant execute on function public.accept_invite(text) to authenticated;
