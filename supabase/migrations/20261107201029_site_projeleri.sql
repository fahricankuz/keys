-- Site projeleri: çatı onarımı, dış cephe boyası, otopark gibi işler; aşama aşama ilerler ve sakinler her aşamada bilgilenir.
-- Aşamalar: Proje açıldı (acildi) → Teklif alındı (teklif) → Yapıma başlandı (yapim) → Tamamlandı (tamam); yan durum: Askıda.
-- Yönetim projeyi açar (bütçe, harcanan, tarihler, kapak fotoğrafı) → sakinlere "yeni site projesi" bildirimi gider.
-- Aşama yalnız bir güncelleme kaydıyla ilerler (not, en çok 12 fotoğraf, isteğe bağlı ilerleme yüzdesi); her aşama
-- değişikliğinde sakinlere aşamanın adıyla bildirim gider ("Dış cephe boyası: Teklif alındı"). Projeyi düzenlemek aşamayı
-- değiştirmez; böylece her aşamanın tarihli, fotoğraflı kaydı kalır.
-- Sitenin bütün sakinleri (malik, kiracı ve daireye bağlı mülkün kiracısı) projeleri ve güncellemeleri görür.
-- Yazma yetkisi yeni "projects.manage" (Site projeleri) yetkisindedir: master her zaman, diğer yöneticiler rolüyle.
-- Fotoğraflar sitenin dosya klasöründedir (site-<kurum>/…; erişim site_folder_ok ile).
-- Yeni tablolar ve işlevler; org_perm_list'e yalnız yetki eklenir. Eski kodla uyumlu, yeniden çalıştırılabilir.

/** Yetki kataloğu (domain/org.js → PERMS): "projects.manage" eklendi. */
create or replace function public.org_perm_list()
returns text[] language sql immutable as $$
  select array['org.settings','org.members','units.manage','residents.manage','charges.manage','payments.approve',
               'expenses.manage','requests.manage','announce','documents.manage','reports.view','projects.manage']
$$;

create table if not exists public.site_projects (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  title      text not null check (length(btrim(title)) between 2 and 160),
  body       text not null default '' check (length(body) <= 4000),
  status     text not null default 'acildi' check (status in ('acildi','teklif','yapim','askida','tamam')),
  progress   int not null default 0 check (progress between 0 and 100),
  budget     numeric check (budget is null or budget >= 0),
  spent      numeric check (spent is null or spent >= 0),
  start_on   date,
  end_on     date,
  cover      text check (cover is null or cover ~ '^site-[0-9a-f-]{36}/'),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_on is null or end_on is null or end_on >= start_on),
  check (cover is null or position('site-' || org_id::text || '/' in cover) = 1)
);
create index if not exists site_projects_org on public.site_projects (org_id, created_at desc);

create table if not exists public.site_project_updates (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.site_projects(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  body       text not null default '' check (length(body) <= 4000),
  status     text check (status is null or status in ('acildi','teklif','yapim','askida','tamam')),
  progress   int check (progress is null or progress between 0 and 100),
  photos     text[] not null default '{}' check (cardinality(photos) <= 12),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (length(btrim(body)) > 0 or cardinality(photos) > 0 or status is not null or progress is not null)
);
create index if not exists site_project_updates_project on public.site_project_updates (project_id, created_at desc);

alter table public.site_projects enable row level security;
alter table public.site_project_updates enable row level security;
drop policy if exists not_banned on public.site_projects;
create policy not_banned on public.site_projects as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned());
drop policy if exists not_banned on public.site_project_updates;
create policy not_banned on public.site_project_updates as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned());

-- Okuma: kurum yönetimi ve sitenin sakinleri. Yazma: Site projeleri yetkisi.
drop policy if exists spj_read on public.site_projects;
create policy spj_read on public.site_projects for select to authenticated
  using (public.is_org_member(org_id) or public.site_linked(org_id) or public.is_admin());
drop policy if exists spj_write on public.site_projects;
create policy spj_write on public.site_projects for all to authenticated
  using (public.org_can(org_id, 'projects.manage')) with check (public.org_can(org_id, 'projects.manage'));

drop policy if exists spu_read on public.site_project_updates;
create policy spu_read on public.site_project_updates for select to authenticated
  using (public.is_org_member(org_id) or public.site_linked(org_id) or public.is_admin());
drop policy if exists spu_insert on public.site_project_updates;
create policy spu_insert on public.site_project_updates for insert to authenticated
  with check (public.org_can(org_id, 'projects.manage') and created_by = auth.uid()
    and exists (select 1 from public.site_projects p where p.id = project_id and p.org_id = site_project_updates.org_id)
    and not exists (select 1 from unnest(photos) x where position('site-' || org_id::text || '/' in x) <> 1));
drop policy if exists spu_delete on public.site_project_updates;
create policy spu_delete on public.site_project_updates for delete to authenticated
  using (public.org_can(org_id, 'projects.manage'));

/** Aşamanın bildirimdeki adı. */
create or replace function public.project_stage_tr(s text)
returns text language sql immutable as $$
  select case s when 'acildi' then 'Proje açıldı' when 'teklif' then 'Teklif alındı' when 'yapim' then 'Yapıma başlandı'
                when 'askida' then 'Askıya alındı' when 'tamam' then 'Tamamlandı' else coalesce(s, '') end
$$;
revoke execute on function public.project_stage_tr(text) from public, anon, authenticated;

/** Proje koruması: kurum, oluşturan ve oluşturma zamanı değişmez; aşama yalnız güncelleme kaydıyla (tetikleyiciden) değişir. */
create or replace function public.guard_site_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.org_id <> old.org_id then raise exception 'Proje başka siteye taşınamaz' using errcode = '42501'; end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if pg_trigger_depth() <= 1 then new.status := old.status; end if;   -- doğrudan düzenleme aşamayı değiştirmez
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.guard_site_project() from public, anon, authenticated;
drop trigger if exists guard_site_project on public.site_projects;
create trigger guard_site_project before update on public.site_projects for each row execute function public.guard_site_project();

/** Yeni proje her zaman "Proje açıldı" aşamasında başlar. */
create or replace function public.guard_site_project_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.status := 'acildi';
  return new;
end $$;
revoke execute on function public.guard_site_project_insert() from public, anon, authenticated;
drop trigger if exists guard_site_project_insert on public.site_projects;
create trigger guard_site_project_insert before insert on public.site_projects for each row execute function public.guard_site_project_insert();

/** Sitenin hesabı bağlı bütün sakinleri: malik ve kiracı kayıtları ile daireye bağlı mülklerin kiracıları. */
create or replace function public.site_org_people(oid uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select r.user_id from public.site_residents r where r.org_id = oid and r.user_id is not null
  union
  select m.user_id from public.properties p join public.site_units u on u.id = p.site_unit_id
    join public.memberships m on m.property_id = p.id and m.role = 'tenant'
   where u.org_id = oid
$$;
revoke execute on function public.site_org_people(uuid) from public, anon, authenticated;

/** Yeni proje ("Proje açıldı"): sakinlere bildirim. */
create or replace function public.on_site_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, title, body, url)
  select u, 'Yeni site projesi: ' || left(new.title, 120), coalesce(nullif(left(btrim(new.body), 240), ''), 'Proje açıldı'), '/uygulama/sitem'
  from public.site_org_people(new.org_id) u where u is distinct from auth.uid();
  return null;
end $$;
revoke execute on function public.on_site_project() from public, anon, authenticated;
drop trigger if exists on_site_project on public.site_projects;
create trigger on_site_project after insert on public.site_projects for each row execute function public.on_site_project();

/** Güncelleme eklenince: aşama ve yüzde projeye taşınır ("Tamamlandı" yüzdeyi 100 yapar); sakinlere bildirim gider —
    aşama değiştiyse başlıkta aşamanın adıyla ("Dış cephe boyası: Teklif alındı"), değişmediyse "Proje güncellendi". */
create or replace function public.on_site_project_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare prev text; p public.site_projects; stage boolean; msg text;
begin
  select status into prev from public.site_projects where id = new.project_id;
  update public.site_projects
     set status = coalesce(new.status, status),
         progress = case when new.status = 'tamam' then 100 else coalesce(new.progress, progress) end
   where id = new.project_id
  returning * into p;
  stage := new.status is not null and new.status is distinct from prev;
  msg := coalesce(nullif(left(btrim(new.body), 200), ''),
                  case when cardinality(new.photos) > 0 then cardinality(new.photos) || ' yeni fotoğraf eklendi' else 'İlerleme %' || p.progress end);
  insert into public.notifications (user_id, title, body, url)
  select u, case when stage then left(p.title, 120) || ': ' || public.project_stage_tr(new.status) else 'Proje güncellendi: ' || left(p.title, 120) end,
         msg, '/uygulama/sitem'
  from public.site_org_people(new.org_id) u where u is distinct from auth.uid();
  return null;
end $$;
revoke execute on function public.on_site_project_update() from public, anon, authenticated;
drop trigger if exists on_site_project_update on public.site_project_updates;
create trigger on_site_project_update after insert on public.site_project_updates for each row execute function public.on_site_project_update();
