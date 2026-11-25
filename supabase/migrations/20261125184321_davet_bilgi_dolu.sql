-- Davet bağlantısıyla kayıt formu dolu gelir: davet edenin girdiği ad, e-posta ve telefon.
-- Önceden yalnız davet kodu doluyordu (gizlilik için kişi bilgisi dönülmüyordu). Karar (25 Kasım 2026): kod kullanılmamış ve süresi
-- dolmamışsa davetlinin bilgileri döner; kod kullanıldıktan sonra dönmez. Kod 80 bit, tek kullanımlık, süreli ve başarısız denemeler
-- IP başına sınırlı (invite_throttle). Kalan risk: bağlantı başkasına iletilirse kod kullanılana kadar bilgiler görülebilir.
-- invite_preview (mülk/ekip daveti) ve site_invite_info (site daveti) "invitee" alanı döner; yeni org_invite_info (kurum daveti) e-postayı.
-- Eski istemciyle uyumlu (alan eklenir), yeniden çalıştırılabilir.

create or replace function public.invite_preview(invite_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare r jsonb; c text := public.invite_norm(invite_code);
begin
  if public.invite_throttle() then return null; end if;
  select jsonb_build_object('role', i.role, 'scope', i.scope, 'owner', o.name, 'property', p.name, 'valid', true, 'email_bound', btrim(i.email) <> '',
                            'invitee', jsonb_build_object('name', i.name, 'email', i.email, 'phone', i.phone))
    into r
    from public.invites i join public.properties p on p.id = i.property_id join public.profiles o on o.id = i.created_by
   where i.code = c and i.accepted_by is null and i.expires_at > now();
  if r is null then perform public.invite_fail(); end if;
  return r;
end $$;

create or replace function public.site_invite_info(invite_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare res jsonb; c text := public.invite_norm(invite_code);
begin
  if public.invite_throttle() then return null; end if;
  select jsonb_build_object('org', o.name, 'sector', o.sector, 'unit', public.unit_label(r.unit_id), 'role', r.role,
                            'name', public.mask_name(r.name), 'email_bound', btrim(r.email) <> '', 'used', false,
                            'invitee', jsonb_build_object('name', r.name, 'email', r.email, 'phone', r.phone))
    into res
    from public.site_residents r join public.organizations o on o.id = r.org_id
   where r.code = c and r.user_id is null;
  if res is null then perform public.invite_fail(); end if;
  return res;
end $$;

/** Kurum daveti ("K" kodu): kurum adı, master daveti mi ve davet edilen e-posta (kullanılmamış ve süresi dolmamışsa). */
create or replace function public.org_invite_info(invite_code text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare res jsonb; c text := public.invite_norm(invite_code);
begin
  if public.invite_throttle() then return null; end if;
  select jsonb_build_object('org', o.name, 'sector', o.sector, 'master', i.master, 'invitee', jsonb_build_object('email', i.email))
    into res
    from public.org_invites i join public.organizations o on o.id = i.org_id
   where i.code = c and i.accepted_by is null and i.expires_at > now();
  if res is null then perform public.invite_fail(); end if;
  return res;
end $$;
revoke execute on function public.org_invite_info(text) from public;
grant execute on function public.org_invite_info(text) to anon, authenticated;
