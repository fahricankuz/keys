-- Site talebine ve talep yazışmasına fotoğraf ve video eki: sakin talebi açarken, sakin ve yönetim mesaj yazarken ekler.
--   * site_requests.media ve site_request_messages.media: depo yolları (en çok 6); dosyalar sitenin klasöründedir (site-<kurum>/…).
--   * Yalnız görsel (jpg, png, webp) ve video (mp4, m4v, mov, webm) uzantıları ve yalnız talebin kendi sitesinin klasörü kabul edilir.
--   * Ek, talep açılırken yazılır; sonradan değişmez (yönetim durumu ve yanıtı güncelleyince ek bozulmaz).
--   * Mesaj yalnız dosyadan oluşabilir (metin boş olabilir; en az biri gerekir).
-- Eski kodla uyumludur: yalnız sütun ekler (varsayılan boş). Yeniden çalıştırılabilir.

alter table public.site_requests add column if not exists media text[] not null default '{}';
alter table public.site_requests drop constraint if exists site_requests_media_check;
alter table public.site_requests add constraint site_requests_media_check check (cardinality(media) <= 6);

alter table public.site_request_messages add column if not exists media text[] not null default '{}';
alter table public.site_request_messages drop constraint if exists site_request_messages_media_check;
alter table public.site_request_messages add constraint site_request_messages_media_check check (cardinality(media) <= 6);
-- Metin boş olabilir, ama metin de dosya da yoksa mesaj olmaz.
alter table public.site_request_messages drop constraint if exists site_request_messages_body_check;
alter table public.site_request_messages add constraint site_request_messages_body_check
  check (length(body) <= 4000 and (length(btrim(body)) > 0 or cardinality(media) > 0));

/** Ek yolları: kurumun klasöründe, izinli uzantıda ve tek parça dosya adı. */
create or replace function public.site_media_ok(oid uuid, media text[])
returns boolean language sql immutable set search_path = public as $$
  select not exists (
    select 1 from unnest(media) m
    where m !~ ('^site-' || oid::text || '/[A-Za-z0-9_.-]+\.(jpe?g|png|webp|mp4|m4v|mov|webm)$'))
$$;
revoke execute on function public.site_media_ok(uuid, text[]) from public, anon, authenticated;

create or replace function public.guard_site_request_media()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.media := old.media;                       -- ek talep açılırken yazılır, sonradan değişmez
    return new;
  end if;
  if not public.site_media_ok(new.org_id, new.media) then
    raise exception 'Ek dosyalar sitenin klasöründe ve görsel ya da video olmalı' using errcode = '22023';
  end if;
  return new;
end $$;
revoke execute on function public.guard_site_request_media() from public, anon, authenticated;
drop trigger if exists guard_site_request_media on public.site_requests;
create trigger guard_site_request_media before insert or update on public.site_requests for each row execute function public.guard_site_request_media();
drop trigger if exists guard_site_request_media on public.site_request_messages;
create trigger guard_site_request_media before insert on public.site_request_messages for each row execute function public.guard_site_request_media();

/** Mesaj bildirimi (önceki sürümle aynı); metin boşsa "Fotoğraf / video eklendi" yazar. */
create or replace function public.on_site_request_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.site_requests; txt text;
begin
  select * into r from public.site_requests where id = new.request_id;
  txt := coalesce(nullif(btrim(new.body), ''), 'Fotoğraf / video eklendi');
  if new.from_mgmt then
    if r.user_id is not null and r.user_id is distinct from new.user_id then
      insert into public.notifications (user_id, title, body, url)
      values (r.user_id, 'Talebine yanıt: ' || left(r.title, 100), left(txt, 240), '/uygulama/talepler');
    end if;
  else
    if r.status = 3 then update public.site_requests set status = 2, updated_at = now() where id = r.id; end if;
    insert into public.notifications (user_id, title, body, url)
    select u, coalesce(public.unit_label(r.unit_id) || ': ', '') || 'talebe yeni mesaj', left(r.title, 100) || ': ' || left(txt, 200),
           '/uygulama/site/talepler'
    from public.org_people(r.org_id, 'requests.manage') u
    where u is distinct from new.user_id and public.wants(u, 'siteRequest');
  end if;
  return null;
end $$;
revoke execute on function public.on_site_request_message() from public, anon, authenticated;
