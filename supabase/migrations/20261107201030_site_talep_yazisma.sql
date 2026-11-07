-- Site talebinde yazışma: talebi açan sakin ile yönetim arasında iki yönlü mesajlar. Bugüne kadar yönetim tek bir "yanıt"
-- yazabiliyor, sakin cevap veremiyordu. Yönetim tarafında master ve "Talepler" (requests.manage) yetkisi verilen yöneticiler
-- yazar; kurumun diğer üyeleri okur. Sakin yalnız kendi açtığı talebin yazışmasını görür ve ona yazar.
-- Mesaj yazılınca karşı tarafa bildirim gider; sakin çözülmüş talebe yazarsa talep yeniden "İşlemde"ye döner.
-- Yeni tablo ve işlevler; site_requests.reply alanı olduğu gibi kalır. Eski kodla uyumlu, yeniden çalıştırılabilir.

create table if not exists public.site_request_messages (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.site_requests(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null default auth.uid(),
  from_mgmt  boolean not null default false,
  body       text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists site_request_messages_request on public.site_request_messages (request_id, created_at);

alter table public.site_request_messages enable row level security;
drop policy if exists not_banned on public.site_request_messages;
create policy not_banned on public.site_request_messages as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned());

drop policy if exists srm_read on public.site_request_messages;
create policy srm_read on public.site_request_messages for select to authenticated
  using (public.is_org_member(org_id) or public.is_admin()
         or exists (select 1 from public.site_requests r where r.id = request_id and r.user_id = auth.uid()));
drop policy if exists srm_insert on public.site_request_messages;
create policy srm_insert on public.site_request_messages for insert to authenticated
  with check (user_id = auth.uid()
    and exists (select 1 from public.site_requests r where r.id = request_id and r.org_id = site_request_messages.org_id
                and (r.user_id = auth.uid() or public.org_can(r.org_id, 'requests.manage'))));
-- Güncelleme ve silme yok: yazışma kayıt olarak kalır.

/** Gönderen tarafı sunucu belirler: talebi açan kişi değilse yönetimdir. */
create or replace function public.guard_site_request_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.from_mgmt := not exists (select 1 from public.site_requests r where r.id = new.request_id and r.user_id = auth.uid());
  new.created_at := now();
  return new;
end $$;
revoke execute on function public.guard_site_request_message() from public, anon, authenticated;
drop trigger if exists guard_site_request_message on public.site_request_messages;
create trigger guard_site_request_message before insert on public.site_request_messages for each row execute function public.guard_site_request_message();

/** Bildirim: yönetim yazdıysa talebi açana; sakin yazdıysa Talepler yetkisi olan yönetime. Sakin çözülmüş talebe yazarsa talep yeniden açılır. */
create or replace function public.on_site_request_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.site_requests;
begin
  select * into r from public.site_requests where id = new.request_id;
  if new.from_mgmt then
    if r.user_id is not null and r.user_id is distinct from new.user_id then
      insert into public.notifications (user_id, title, body, url)
      values (r.user_id, 'Talebine yanıt: ' || left(r.title, 100), left(new.body, 240), '/uygulama/talepler');
    end if;
  else
    if r.status = 3 then update public.site_requests set status = 2, updated_at = now() where id = r.id; end if;
    insert into public.notifications (user_id, title, body, url)
    select u, coalesce(public.unit_label(r.unit_id) || ': ', '') || 'talebe yeni mesaj', left(r.title, 100) || ': ' || left(new.body, 200),
           '/uygulama/site/talepler'
    from public.org_people(r.org_id, 'requests.manage') u
    where u is distinct from new.user_id and public.wants(u, 'siteRequest');
  end if;
  return null;
end $$;
revoke execute on function public.on_site_request_message() from public, anon, authenticated;

/** Talep bildirimi (önceki sürümle aynı); talebi açan kişiye kendi yaptığı değişiklik için bildirim gitmez
    (sakin çözülmüş talebe yazınca talep yeniden açılır; bu ona "Talebin güncellendi" diye dönmemeli). */
create or replace function public.on_site_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, title, body, url)
    select u, coalesce(public.unit_label(new.unit_id) || ': ', '') || 'yeni talep', new.title, '/uygulama/site'
    from public.org_people(new.org_id, 'requests.manage') u where public.wants(u, 'siteRequest');
  elsif (new.status <> old.status or new.reply <> old.reply) and new.user_id is not null and new.user_id is distinct from auth.uid() then
    insert into public.notifications (user_id, title, body, url)
    values (new.user_id, 'Talebin güncellendi', new.title || case when new.reply <> '' then ': ' || left(new.reply, 200) else '' end, '/uygulama/sitem');
  end if;
  return null;
end $$;
drop trigger if exists on_site_request_message on public.site_request_messages;
create trigger on_site_request_message after insert on public.site_request_messages for each row execute function public.on_site_request_message();
