-- Kurum silme (yönetici): yalnızca askıdaki (status = 'paused') kurum silinebilir; önce "Askıya al", sonra "Sil".
-- Kurumun rolleri, yöneticileri, davetleri ve sözleşme kayıtları kurumla birlikte silinir (ilişkili tablolar on delete cascade).
-- Kuruma bağlı mülkler SİLİNMEZ: properties.org_id boşalır, mülkler sahibinin hesabında bireysel mülk olarak kalır.
-- İşlem, silinmeden önce denetim kaydına (kurum adı, sektör, yönetici ve mülk sayısı) yazılır.
-- Yeni işlev; eski kodla uyumludur. Yeniden çalıştırılabilir.

create or replace function public.admin_org_delete(oid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare o public.organizations; props int; mem int;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  select * into o from public.organizations where id = oid;
  if not found then raise exception 'Kurum bulunamadı' using errcode = 'P0002'; end if;
  if o.status <> 'paused' then raise exception 'Önce kurumu askıya al, sonra sil' using errcode = '22023'; end if;
  select count(*) into props from public.properties where org_id = oid;
  select count(*) into mem from public.org_members where org_id = oid;
  perform public.audit('org.delete', oid::text, jsonb_build_object('name', o.name, 'sector', o.sector, 'members', mem, 'properties', props));
  delete from public.organizations where id = oid;
end $$;
grant execute on function public.admin_org_delete(uuid) to authenticated;
