-- Rapor e-postası alıcıları: Başlangıç hariç herkes.
-- report_recipients: Profesyonel ('bes') eklendi (Kurumsal, deneme ve eski 'pro' zaten alıyordu; Başlangıç 'tek' almaz).
-- site_report_recipients: Kurumsal'ın bütün kategorileri (emlak, aile ofisi, diğer dahil). Yönetim raporu birim verisinden
-- üretildiği için hiç birimi olmayan kuruma boş e-posta gitmez.
-- Yalnız işlev gövdeleri değişir; yetkiler korunur, eski kodla uyumlu, yeniden çalıştırılabilir.

create or replace function public.report_recipients(period text)
returns table (user_id uuid, email text, name text, lang text)
language sql stable security definer set search_path = public as $$
  select p.id, u.email::text, p.name, p.lang
    from public.profiles p join auth.users u on u.id = p.id
   where p.role = 'landlord'
     and not exists (select 1 from public.bans b where b.user_id = p.id)
     and (public.access_state(p.id) ->> 'plan') in ('kurumsal', 'bes', 'pro', 'trial')
     and coalesce((p.settings ->> case when period = 'year' then 'reportYearly' else 'reportMonthly' end)::boolean, true)
     and exists (select 1 from public.properties x where x.owner_id = p.id)
$$;

create or replace function public.site_report_recipients()
returns table (org_id uuid, user_id uuid, email text, name text, lang text) language sql stable security definer set search_path = public as $$
  select o.id, p.id, u.email::text, p.name, p.lang
  from public.organizations o
  cross join lateral public.org_people(o.id, 'reports.view') pp(uid)
  join public.profiles p on p.id = pp.uid join auth.users u on u.id = p.id
  where o.status = 'active' and exists (select 1 from public.site_units su where su.org_id = o.id)
    and coalesce((p.settings ->> 'siteReport')::boolean, true)
$$;
