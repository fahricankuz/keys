-- Genel kurul çağrısı: katılım durumu her sakine sorulur (malik ve kiracı).
-- Sorun: yanıtı yalnız dairenin maliki verebiliyordu (site_meeting_reply ve ekran). Sakinleri kiracı olarak kayıtlı sitelerde
-- (malik uygulamada yok, yönetim daireyi kiracıyla eşledi) hiç kimseye katılım sorusu çıkmıyordu; bildirim de yalnız maliklere gidiyordu.
-- 1. site_meeting_replies.role: yanıt dairedeki rolüyle saklanır; malik ve kiracı aynı dairede ayrı yanıt verir (birbirini ezmez).
--    Birincil anahtar (meeting_id, unit_id, role). Eski yanıtlar malik yanıtıdır (yalnız malik yanıt verebiliyordu).
-- 2. site_meeting_reply: dairede kaydı olan her sakin (malik ya da kiracı) kendi rolüyle yanıt verir. Vekâlet yalnız malik içindir
--    (kat malikleri kurulunda oy malikindir); kiracı katılacak / katılmayacak bildirir.
-- 3. Çağrı bildirimi tüm sakinlere gider (malik ve kiracı).
-- Yeter sayı ve toplantı paketi (hazirun) malik yanıtlarıyla hesaplanır; kiracı yanıtları bilgi içindir. Yeniden çalıştırılabilir.

alter table public.site_meeting_replies add column if not exists role text not null default 'malik';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'site_meeting_replies_role_check') then
    alter table public.site_meeting_replies add constraint site_meeting_replies_role_check check (role in ('malik','kiraci'));
  end if;
  if (select count(*) from pg_constraint c join unnest(c.conkey) k on true
      where c.conrelid = 'public.site_meeting_replies'::regclass and c.contype = 'p') <> 3 then
    alter table public.site_meeting_replies drop constraint if exists site_meeting_replies_pkey;
    alter table public.site_meeting_replies add constraint site_meeting_replies_pkey primary key (meeting_id, unit_id, role);
  end if;
end $$;

create or replace function public.site_meeting_reply(mid uuid, unit uuid, answer text, proxy text default '')
returns void language plpgsql security definer set search_path = public as $$
declare m public.site_meetings; r text;
begin
  select * into m from public.site_meetings where id = mid;
  if m.id is null then raise exception 'Toplantı bulunamadı' using errcode = 'P0002'; end if;
  r := public.site_role(unit);
  if public.is_banned() or r is null or r not in ('malik','kiraci')
     or not exists (select 1 from public.site_units where id = unit and org_id = m.org_id) then
    raise exception 'Yalnız dairenin sakini yanıt verebilir' using errcode = '42501';
  end if;
  if m.status <> 'cagrildi' then raise exception 'Toplantı kapandı' using errcode = '22023'; end if;
  if answer not in ('katilacak','katilmayacak','vekalet') then raise exception 'Yanıt geçersiz' using errcode = '22023'; end if;
  if answer = 'vekalet' and r <> 'malik' then raise exception 'Vekâlet yalnız malik içindir' using errcode = '22023'; end if;
  if answer = 'vekalet' and length(btrim(coalesce(proxy, ''))) < 2 then raise exception 'Vekilin adını yaz' using errcode = '22023'; end if;
  insert into public.site_meeting_replies (meeting_id, unit_id, org_id, user_id, role, answer, proxy_name, updated_at)
  values (mid, unit, m.org_id, auth.uid(), r, answer, case when answer = 'vekalet' then left(btrim(proxy), 120) else '' end, now())
  on conflict (meeting_id, unit_id, role) do update set user_id = excluded.user_id, answer = excluded.answer,
    proxy_name = excluded.proxy_name, updated_at = now();
end $$;
revoke execute on function public.site_meeting_reply(uuid, uuid, text, text) from public, anon;
grant execute on function public.site_meeting_reply(uuid, uuid, text, text) to authenticated;

/** Bildirim: çağrı tüm sakinlere (malik ve kiracı), yoklama oy verebileceklere gider. */
create or replace function public.on_site_meeting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, title, body, url)
  select distinct r.user_id, 'Genel kurul çağrısı: ' || new.title,
         to_char(new.held_at at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI') || case when new.place <> '' then ' · ' || new.place else '' end
           || ' · Katılım durumunu bildir.',
         '/uygulama/sitem'
  from public.site_residents r where r.org_id = new.org_id and r.user_id is not null and r.role in ('malik','kiraci');
  return new;
end $$;
