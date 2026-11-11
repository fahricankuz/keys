-- Yönetici paneli → Hesaplar: bir hesabın tüm rolleri. Tek giriş ile bir kişi aynı anda mülk sahibi, kiracı, site sakini (malik / kiracı),
-- site ya da portföy yöneticisi ve ekip üyesi olabilir; profiles.role yalnız birini tutar.
-- admin_user_roles(): her hesap için rol listesi [{k, org, sector}] (k: admin | landlord | tenant | site_malik | site_kiraci | org | team).
-- Yalnız anahtar yöneticisi. Yeni işlev; eski kodla uyumlu, yeniden çalıştırılabilir.
create or replace function public.admin_user_roles()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  return coalesce((
    with r as (
      select a.user_id as uid, 'admin' as k, null::text as org, null::text as sector from public.admins a
      union select p.id, 'landlord', null, null from public.profiles p
        where p.role = 'landlord' or exists (select 1 from public.properties x where x.owner_id = p.id)
      union select m.user_id, 'tenant', null, null from public.memberships m where m.role = 'tenant'
      union select s.user_id, case when s.role = 'malik' then 'site_malik' else 'site_kiraci' end, o.name, o.sector
        from public.site_residents s join public.organizations o on o.id = s.org_id where s.user_id is not null
      union select om.user_id, 'org', o.name, o.sector from public.org_members om join public.organizations o on o.id = om.org_id
      union select t.member_id, 'team', null, null from public.team_members t
      union select p.id, 'team', null, null from public.profiles p where p.role = 'team'
    )
    select jsonb_object_agg(uid, roles) from (
      select uid, jsonb_agg(jsonb_build_object('k', k, 'org', org, 'sector', sector) order by k, org) as roles from r group by uid
    ) g), '{}'::jsonb);
end $$;
revoke execute on function public.admin_user_roles() from public, anon;
grant execute on function public.admin_user_roles() to authenticated;
