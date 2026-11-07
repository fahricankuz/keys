-- Site belgeleri: yönetim bütün siteye (işletme projesi, karar defteri, sigorta poliçesi…) ya da tek daireye belge yükler;
-- sakin (malik, kiracı ya da bağlı mülkün kiracısı) yönetime belge gönderir. Dosya site klasöründe (site-<kurum>/…).
-- audience: 'herkes' (sitenin bütün sakinleri), 'daire' (yalnız o dairenin sakinleri), 'yonetim' (sakinden yönetime).
-- site_folder_ok artık bağlı mülkün kiracısını da tanır (site_links): dekont ve belge dosyalarını o da yükleyip açar.
-- Yeni tablo ve işlev gövdesi; eski kodla uyumlu, yeniden çalıştırılabilir.

create table if not exists public.site_documents (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  unit_id     uuid references public.site_units(id) on delete cascade,
  audience    text not null default 'herkes' check (audience in ('herkes','daire','yonetim')),
  title       text not null check (length(btrim(title)) between 2 and 160),
  name        text not null default '' check (length(name) <= 200),
  path        text not null check (path ~ '^site-[0-9a-f-]{36}/'),
  uploaded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  check ((audience = 'herkes' and unit_id is null) or (audience in ('daire','yonetim') and unit_id is not null))
);
create index if not exists site_documents_org on public.site_documents (org_id, created_at desc);

alter table public.site_documents enable row level security;
drop policy if exists not_banned on public.site_documents;
create policy not_banned on public.site_documents as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned());

/** Oturumdaki kişi bu sitenin (ya da bu dairenin) sakini mi? Bağlı mülkün kiracısı dahil. */
create or replace function public.site_linked(oid uuid, unit uuid default null)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.site_links(auth.uid()) l where l.org_id = oid and (unit is null or l.unit_id = unit))
$$;
grant execute on function public.site_linked(uuid, uuid) to authenticated;

drop policy if exists sd_read on public.site_documents;
create policy sd_read on public.site_documents for select to authenticated
  using (public.is_org_member(org_id) or public.is_admin() or uploaded_by = auth.uid()
         or (audience = 'herkes' and public.site_linked(org_id))
         or (audience = 'daire' and public.site_linked(org_id, unit_id)));
drop policy if exists sd_insert on public.site_documents;
create policy sd_insert on public.site_documents for insert to authenticated
  with check (uploaded_by = auth.uid()
    and position('site-' || org_id::text || '/' in path) = 1
    and (unit_id is null or exists (select 1 from public.site_units u where u.id = unit_id and u.org_id = site_documents.org_id))
    and ((audience in ('herkes','daire') and public.org_can(org_id, 'documents.manage'))
         or (audience = 'yonetim' and public.site_linked(org_id, unit_id))));
drop policy if exists sd_delete on public.site_documents;
create policy sd_delete on public.site_documents for delete to authenticated
  using (public.org_can(org_id, 'documents.manage') or uploaded_by = auth.uid());

/** Site klasörü: kurum üyesi ya da sitenin sakini (bağlı mülkün kiracısı dahil). */
create or replace function public.site_folder_ok(folder text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare oid uuid;
begin
  if folder is null or folder !~ '^site-[0-9a-f-]{36}$' then return false; end if;
  oid := substr(folder, 6)::uuid;
  return public.is_org_member(oid) or public.is_site_resident(oid) or public.site_linked(oid);
end $$;
grant execute on function public.site_folder_ok(text) to authenticated;

/** Bildirim: siteye belge (sakinlere), daireye belge (dairenin sakinlerine), sakinden belge (belge yetkisi olan yönetime). */
create or replace function public.on_site_document()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.audience = 'yonetim' then
    insert into public.notifications (user_id, title, body, url)
    select u, public.unit_label(new.unit_id) || ': yeni belge', new.title, '/uygulama/site/belgeler'
    from public.org_people(new.org_id, 'documents.manage') u where u is distinct from auth.uid();
  else
    insert into public.notifications (user_id, title, body, url)
    select distinct l.uid, 'Yeni belge', new.title, '/uygulama/belgeler'
    from (select r.user_id uid, r.unit_id, r.org_id from public.site_residents r where r.user_id is not null
          union
          select m.user_id, u.id, u.org_id from public.properties p join public.site_units u on u.id = p.site_unit_id
            join public.memberships m on m.property_id = p.id and m.role = 'tenant') l
    where l.org_id = new.org_id and (new.audience = 'herkes' or l.unit_id = new.unit_id) and l.uid is distinct from auth.uid();
  end if;
  return new;
end $$;
revoke execute on function public.on_site_document() from public, anon, authenticated;
drop trigger if exists on_site_document on public.site_documents;
create trigger on_site_document after insert on public.site_documents for each row execute function public.on_site_document();
