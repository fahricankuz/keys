-- Duyurular: yönetici panelinden (Müşteriler › Duyurular) kullanıcılara uygulama içi kart ya da şerit, telefon bildirimi ve e-posta.
-- announcements: duyuru (tür, görünüm, TR/EN metin, düğme, kitle, kanallar, başlangıç/bitiş, durum). Yalnız yönetici işlevleri yazar.
-- announcement_recipients: gönderimdeki kitle ve olaylar (bildirim kuyruğa alındı, e-posta kuyruğa alındı, gördü, kapattı, tıkladı).
-- Gönderim gruplar halinde: announcement_dispatch dakikada bir en çok 100 bildirim (notifications → push) ve 20 e-posta
-- (mail_outbox 'duyuru' → mail-send) kuyruğa ekler. Bildirimi kapatan (settings.push=false) kişiye telefon bildirimi,
-- duyuru e-postasını kapatan (settings.duyuruMail=false) kişiye e-posta gitmez. Duyuru bildirimi push işlevinde ayrıca bildirim e-postası doğurmaz.
-- 21:00–09:00 (İstanbul) arasında telefon bildirimli gönderim uyarı döner; yönetici onaylarsa (force) yine gönderilir.
-- E-postadaki "Duyuru e-postalarını alma" bağlantısı alıcıya özel jetonla announcement_unsubscribe'ı (girişsiz) çağırır.
-- Tablolara istemci doğrudan erişemez (RLS açık, kural yok); her şey güvenlik tanımlı işlevlerle. Eski istemciyle uyumlu, yeniden çalıştırılabilir.

create table if not exists public.announcements (
  id          bigserial primary key,
  kind        text not null default 'info' check (kind in ('info', 'feature', 'maintenance')),
  view        text not null default 'card' check (view in ('card', 'banner')),
  title       text not null check (length(btrim(title)) between 2 and 120),
  body        text not null default '' check (length(body) <= 2000),
  title_en    text not null default '' check (length(title_en) <= 120),
  body_en     text not null default '' check (length(body_en) <= 2000),
  cta         text not null default '' check (length(cta) <= 40),
  cta_en      text not null default '' check (length(cta_en) <= 40),
  url         text not null default '' check (url = '' or url ~ '^(/uygulama|https://)'),
  audience    jsonb not null default '{}'::jsonb,
  ch_app      boolean not null default true,
  ch_push     boolean not null default false,
  ch_email    boolean not null default false,
  starts_at   timestamptz,
  ends_at     timestamptz,
  status      text not null default 'draft' check (status in ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  recipients  int not null default 0,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  check (ch_app or ch_push or ch_email),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
revoke all on sequence public.announcements_id_seq from anon, authenticated;

create table if not exists public.announcement_recipients (
  announcement_id bigint not null references public.announcements(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  token           uuid not null default gen_random_uuid() unique,
  test            boolean not null default false,
  push_at         timestamptz,
  push_skip       boolean not null default false,
  mail_at         timestamptz,
  mail_skip       boolean not null default false,
  seen_at         timestamptz,
  dismissed_at    timestamptz,
  clicked_at      timestamptz,
  primary key (announcement_id, user_id)
);
create index if not exists announcement_recipients_user on public.announcement_recipients (user_id);
alter table public.announcement_recipients enable row level security;
revoke all on public.announcement_recipients from anon, authenticated;

alter table public.mail_outbox drop constraint if exists mail_outbox_kind_check;
alter table public.mail_outbox add constraint mail_outbox_kind_check
  check (kind in ('account_deleted', 'plan_choice', 'org_master_invite', 'investor_report', 'admin_message', 'havale_bilgi', 'aidat_ozet', 'duyuru'));

-- ---- Kitle ----------------------------------------------------------------------------------------------------------
-- aud: {roles: [landlord|tenant|resident|org|team], paid: all|paid|free, sectors: [...], platform: all|ios|android|web, lang: all|tr|en}
-- Boş liste ya da 'all' = filtre yok. Askıya alınmış hesaplar dahil edilmez.
create or replace function public.announcement_audience(aud jsonb)
returns setof uuid language plpgsql stable security definer set search_path = public as $$
begin
  return query
  with a as (
    select coalesce(array(select jsonb_array_elements_text(coalesce(aud -> 'roles', '[]'::jsonb))), '{}') as roles,
           coalesce(nullif(aud ->> 'paid', ''), 'all') as paid,
           coalesce(array(select jsonb_array_elements_text(coalesce(aud -> 'sectors', '[]'::jsonb))), '{}') as sectors,
           coalesce(nullif(aud ->> 'platform', ''), 'all') as platform,
           coalesce(nullif(aud ->> 'lang', ''), 'all') as lang
  )
  select p.id from public.profiles p cross join a
  join auth.users u on u.id = p.id
  where (u.banned_until is null or u.banned_until < now())
    and (cardinality(a.roles) = 0
      or ('landlord' = any(a.roles) and p.role = 'landlord')
      or ('tenant' = any(a.roles) and exists (select 1 from public.memberships m where m.user_id = p.id and m.role = 'tenant'))
      or ('resident' = any(a.roles) and exists (select 1 from public.site_residents r where r.user_id = p.id))
      or ('org' = any(a.roles) and exists (select 1 from public.org_members o where o.user_id = p.id))
      or ('team' = any(a.roles) and exists (select 1 from public.team_members t where t.member_id = p.id)))
    and (a.paid = 'all'
      or (a.paid = 'paid') = exists (select 1 from public.subscriptions s where s.user_id = p.id and s.active
                                       and (s.expires_at is null or s.expires_at > now())))
    and (cardinality(a.sectors) = 0
      or exists (select 1 from public.org_members o join public.organizations g on g.id = o.org_id
                  where o.user_id = p.id and g.sector = any(a.sectors))
      or exists (select 1 from public.site_residents r join public.organizations g on g.id = r.org_id
                  where r.user_id = p.id and g.sector = any(a.sectors)))
    and (a.platform = 'all'
      or (a.platform in ('ios', 'android') and exists (select 1 from public.device_tokens d where d.user_id = p.id and d.platform = a.platform))
      or (a.platform = 'web' and not exists (select 1 from public.device_tokens d where d.user_id = p.id)))
    and (a.lang = 'all' or (case when p.lang = 'en' then 'en' else 'tr' end) = a.lang);
end $$;
revoke execute on function public.announcement_audience(jsonb) from public, anon, authenticated;

/** 21:00–09:00 (İstanbul) arası mı? */
create or replace function public.announcement_quiet(at timestamptz default now())
returns boolean language sql stable set search_path = public as $$
  select extract(hour from at at time zone 'Europe/Istanbul') >= 21 or extract(hour from at at time zone 'Europe/Istanbul') < 9
$$;

-- ---- Yönetici işlevleri -----------------------------------------------------------------------------------------------
/** Taslağı kaydeder (yeni ya da taslak/zamanlanmış güncelleme); kimliği döner. */
create or replace function public.admin_announcement_save(p jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare aid bigint := nullif(p ->> 'id', '')::bigint; st text;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  if aid is not null then
    select status into st from public.announcements where id = aid;
    if st is null then raise exception 'Duyuru bulunamadı' using errcode = 'P0002'; end if;
    if st not in ('draft', 'scheduled') then raise exception 'Gönderilmiş duyuru değiştirilemez' using errcode = '22023'; end if;
    update public.announcements set
      kind = coalesce(p ->> 'kind', 'info'), view = coalesce(p ->> 'view', 'card'),
      title = btrim(coalesce(p ->> 'title', '')), body = coalesce(p ->> 'body', ''),
      title_en = btrim(coalesce(p ->> 'title_en', '')), body_en = coalesce(p ->> 'body_en', ''),
      cta = btrim(coalesce(p ->> 'cta', '')), cta_en = btrim(coalesce(p ->> 'cta_en', '')), url = btrim(coalesce(p ->> 'url', '')),
      audience = coalesce(p -> 'audience', '{}'::jsonb),
      ch_app = coalesce((p ->> 'ch_app')::boolean, true), ch_push = coalesce((p ->> 'ch_push')::boolean, false),
      ch_email = coalesce((p ->> 'ch_email')::boolean, false),
      starts_at = nullif(p ->> 'starts_at', '')::timestamptz, ends_at = nullif(p ->> 'ends_at', '')::timestamptz,
      status = 'draft'
    where id = aid;
  else
    insert into public.announcements (kind, view, title, body, title_en, body_en, cta, cta_en, url, audience, ch_app, ch_push, ch_email, starts_at, ends_at, created_by)
    values (coalesce(p ->> 'kind', 'info'), coalesce(p ->> 'view', 'card'), btrim(coalesce(p ->> 'title', '')), coalesce(p ->> 'body', ''),
            btrim(coalesce(p ->> 'title_en', '')), coalesce(p ->> 'body_en', ''), btrim(coalesce(p ->> 'cta', '')), btrim(coalesce(p ->> 'cta_en', '')),
            btrim(coalesce(p ->> 'url', '')), coalesce(p -> 'audience', '{}'::jsonb),
            coalesce((p ->> 'ch_app')::boolean, true), coalesce((p ->> 'ch_push')::boolean, false), coalesce((p ->> 'ch_email')::boolean, false),
            nullif(p ->> 'starts_at', '')::timestamptz, nullif(p ->> 'ends_at', '')::timestamptz, auth.uid())
    returning id into aid;
  end if;
  return aid;
end $$;

/** Kitle sayısı (gönderilmeden önce formda gösterilir). */
create or replace function public.admin_announcement_count(aud jsonb)
returns int language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  return (select count(*) from public.announcement_audience(coalesce(aud, '{}'::jsonb)));
end $$;

/** Seçili kanallardan bir alıcıya: bildirim ve e-postayı kuyruğa ekler (dispatch ve test ortak). */
create or replace function public.announcement_deliver(a public.announcements, r public.announcement_recipients, do_push boolean, do_mail boolean)
returns void language plpgsql security definer set search_path = public as $$
declare pr public.profiles; en boolean; mail text;
begin
  select * into pr from public.profiles where id = r.user_id;
  en := pr.lang = 'en' and a.title_en <> '';
  if do_push and a.ch_push and r.push_at is null and not r.push_skip then
    if coalesce((pr.settings ->> 'push')::boolean, true) or r.test then
      insert into public.notifications (user_id, title, body, url, tag)
      values (r.user_id, case when en then a.title_en else a.title end,
              left(case when en then coalesce(nullif(a.body_en, ''), a.body) else a.body end, 300),
              case when a.url like '/uygulama%' then a.url else '/uygulama' end, 'duyuru-' || a.id)
      on conflict do nothing;
      update public.announcement_recipients set push_at = now() where announcement_id = a.id and user_id = r.user_id;
    else
      update public.announcement_recipients set push_skip = true where announcement_id = a.id and user_id = r.user_id;
    end if;
  end if;
  if do_mail and a.ch_email and r.mail_at is null and not r.mail_skip then
    select email into mail from auth.users where id = r.user_id;
    if coalesce(mail, '') <> '' and (coalesce((pr.settings ->> 'duyuruMail')::boolean, true) or r.test) then
      insert into public.mail_outbox (kind, to_email, lang, data, dedupe)
      values ('duyuru', mail, case when en then 'en' else 'tr' end,
              jsonb_build_object('kind', a.kind, 'name', pr.name,
                'title', case when en then a.title_en else a.title end,
                'body', case when en then coalesce(nullif(a.body_en, ''), a.body) else a.body end,
                'cta', case when en then coalesce(nullif(a.cta_en, ''), a.cta) else a.cta end,
                'url', a.url, 'token', r.token),
              'duyuru-' || a.id || '-' || r.user_id || case when r.test then '-test-' || extract(epoch from now())::bigint else '' end)
      on conflict do nothing;
      update public.announcement_recipients set mail_at = now() where announcement_id = a.id and user_id = r.user_id;
    else
      update public.announcement_recipients set mail_skip = true where announcement_id = a.id and user_id = r.user_id;
    end if;
  end if;
end $$;
revoke execute on function public.announcement_deliver(public.announcements, public.announcement_recipients, boolean, boolean) from public, anon, authenticated;

/** "Bana test gönder": yöneticinin kendisine seçili kanallardan hemen gönderir; uygulama içi kart/şerit de yalnız ona görünür. */
create or replace function public.admin_announcement_test(aid bigint)
returns void language plpgsql security definer set search_path = public as $$
declare a public.announcements; r public.announcement_recipients;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  select * into a from public.announcements where id = aid;
  if a.id is null then raise exception 'Duyuru bulunamadı' using errcode = 'P0002'; end if;
  insert into public.announcement_recipients (announcement_id, user_id, test) values (aid, auth.uid(), true)
  on conflict (announcement_id, user_id) do update set push_at = null, push_skip = false, mail_at = null, mail_skip = false,
    seen_at = null, dismissed_at = null, clicked_at = null
  returning * into r;
  -- Aynı gün ikinci test bildirimi tekil dizinde düşmesin diye öncekini sil.
  delete from public.notifications where user_id = auth.uid() and tag = 'duyuru-' || aid;
  perform public.announcement_deliver(a, r, true, true);
end $$;

/** Kitleyi doldurur ve gönderimi başlatır (dispatch dakikada bir gruplar halinde ilerletir). */
create or replace function public.announcement_start(aid bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.announcement_recipients (announcement_id, user_id)
  select aid, u from public.announcement_audience((select audience from public.announcements where id = aid)) u
  on conflict (announcement_id, user_id) do update set test = false;
  update public.announcements set status = 'sending', sent_at = now(),
    recipients = (select count(*) from public.announcement_recipients where announcement_id = aid)
  where id = aid;
end $$;
revoke execute on function public.announcement_start(bigint) from public, anon, authenticated;

/** Gönder: başlangıç ileri tarihse zamanlar, değilse hemen başlatır. Telefon bildirimi 21:00–09:00 arasına düşüyorsa
    force olmadan {quiet:true} döner (yönetici uyarıyı onaylarsa force ile yeniden çağırır). */
create or replace function public.admin_announcement_send(aid bigint, force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare a public.announcements; at timestamptz;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  select * into a from public.announcements where id = aid for update;
  if a.id is null then raise exception 'Duyuru bulunamadı' using errcode = 'P0002'; end if;
  if a.status not in ('draft', 'scheduled') then raise exception 'Bu duyuru zaten gönderildi' using errcode = '22023'; end if;
  at := greatest(coalesce(a.starts_at, now()), now());
  if a.ends_at is not null and a.ends_at <= at then raise exception 'Bitiş tarihi geçmiş' using errcode = '22023'; end if;
  if a.ch_push and not force and public.announcement_quiet(at) then
    return jsonb_build_object('quiet', true);
  end if;
  if a.starts_at is not null and a.starts_at > now() + interval '1 minute' then
    update public.announcements set status = 'scheduled' where id = aid;
    perform public.audit('announce.schedule', aid::text, jsonb_build_object('at', a.starts_at));
    return jsonb_build_object('scheduled', true);
  end if;
  perform public.announcement_start(aid);
  perform public.announcement_dispatch(aid);
  perform public.audit('announce.send', aid::text, jsonb_build_object('recipients', (select recipients from public.announcements where id = aid)));
  return jsonb_build_object('sent', true, 'recipients', (select recipients from public.announcements where id = aid));
end $$;

/** Durdur: zamanlanmış ya da süren gönderim durur; uygulama içinde de artık görünmez. */
create or replace function public.admin_announcement_cancel(aid bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  update public.announcements set status = 'cancelled' where id = aid and status in ('draft', 'scheduled', 'sending', 'sent');
  perform public.audit('announce.cancel', aid::text, '{}'::jsonb);
end $$;

/** Gönderilenler ve taslaklar: kitle, ulaşan (bildirim ya da e-posta kuyruğa alınan), gören, tıklayan. */
create or replace function public.admin_announcements()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object(
      'reached', (select count(*) from public.announcement_recipients r where r.announcement_id = a.id and not r.test and (r.push_at is not null or r.mail_at is not null)),
      'pushed', (select count(*) from public.announcement_recipients r where r.announcement_id = a.id and not r.test and r.push_at is not null),
      'mailed', (select count(*) from public.announcement_recipients r where r.announcement_id = a.id and not r.test and r.mail_at is not null),
      'seen', (select count(*) from public.announcement_recipients r where r.announcement_id = a.id and not r.test and r.seen_at is not null),
      'clicked', (select count(*) from public.announcement_recipients r where r.announcement_id = a.id and not r.test and r.clicked_at is not null))
    order by a.created_at desc)
    from (select * from public.announcements order by created_at desc limit 100) a), '[]'::jsonb);
end $$;

-- ---- Gönderim (zamanlanmış iş) --------------------------------------------------------------------------------------
/** Zamanı gelen duyuruyu başlatır; süren gönderimlerde dakikada en çok 100 bildirim ve 20 e-posta kuyruğa ekler. */
create or replace function public.announcement_dispatch(only_id bigint default null)
returns int language plpgsql security definer set search_path = public as $$
declare a public.announcements; r public.announcement_recipients; n int := 0;
begin
  for a in select * from public.announcements where status = 'scheduled' and starts_at <= now() and (only_id is null or id = only_id) loop
    perform public.announcement_start(a.id);
  end loop;
  for a in select * from public.announcements where status = 'sending' and (only_id is null or id = only_id) loop
    if a.ends_at is not null and a.ends_at <= now() then
      update public.announcements set status = 'sent' where id = a.id; continue;
    end if;
    for r in select * from public.announcement_recipients where announcement_id = a.id and a.ch_push and push_at is null and not push_skip limit 100 loop
      perform public.announcement_deliver(a, r, true, false); n := n + 1;
    end loop;
    for r in select * from public.announcement_recipients where announcement_id = a.id and a.ch_email and mail_at is null and not mail_skip limit 20 loop
      perform public.announcement_deliver(a, r, false, true); n := n + 1;
    end loop;
    if not exists (select 1 from public.announcement_recipients where announcement_id = a.id
                    and ((a.ch_push and push_at is null and not push_skip) or (a.ch_email and mail_at is null and not mail_skip))) then
      update public.announcements set status = 'sent' where id = a.id;
    end if;
  end loop;
  return n;
end $$;
revoke execute on function public.announcement_dispatch(bigint) from public, anon, authenticated;

-- ---- Kullanıcı işlevleri --------------------------------------------------------------------------------------------
/** Bana gösterilecek uygulama içi duyurular: yayında (ya da bana test), süresi dolmamış, kapatmadığım. */
create or replace function public.my_announcements()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'kind', a.kind, 'view', a.view, 'title', a.title, 'body', a.body,
           'title_en', a.title_en, 'body_en', a.body_en, 'cta', a.cta, 'cta_en', a.cta_en, 'url', a.url, 'seen', r.seen_at is not null)
         order by a.sent_at desc nulls first, a.id desc), '[]'::jsonb)
  from public.announcement_recipients r join public.announcements a on a.id = r.announcement_id
  where r.user_id = auth.uid() and a.ch_app and r.dismissed_at is null
    and (a.status in ('sending', 'sent') or (r.test and a.status in ('draft', 'scheduled')))
    and (a.ends_at is null or a.ends_at > now())
$$;
revoke execute on function public.my_announcements() from public, anon;
grant execute on function public.my_announcements() to authenticated;

/** Gördü / kapattı / tıkladı. */
create or replace function public.announcement_mark(aid bigint, what text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if what not in ('seen', 'dismiss', 'click') then raise exception 'Geçersiz işlem' using errcode = '22023'; end if;
  update public.announcement_recipients set
    seen_at = coalesce(seen_at, now()),
    dismissed_at = case when what = 'dismiss' then coalesce(dismissed_at, now()) else dismissed_at end,
    clicked_at = case when what = 'click' then coalesce(clicked_at, now()) else clicked_at end
  where announcement_id = aid and user_id = auth.uid();
end $$;
revoke execute on function public.announcement_mark(bigint, text) from public, anon;
grant execute on function public.announcement_mark(bigint, text) to authenticated;

/** E-postadaki "Duyuru e-postalarını alma" bağlantısı (girişsiz): jetonun sahibinin duyuru e-postalarını kapatır. */
create or replace function public.announcement_unsubscribe(t uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  select user_id into uid from public.announcement_recipients where token = t;
  if uid is null then return false; end if;
  update public.profiles set settings = coalesce(settings, '{}'::jsonb) || '{"duyuruMail": false}'::jsonb where id = uid;
  return true;
end $$;
revoke execute on function public.announcement_unsubscribe(uuid) from public;
grant execute on function public.announcement_unsubscribe(uuid) to anon, authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    revoke execute on function public.announcement_audience(jsonb) from service_role;
  end if;
end $$;

revoke execute on function public.admin_announcement_save(jsonb) from public, anon;
revoke execute on function public.admin_announcement_count(jsonb) from public, anon;
revoke execute on function public.admin_announcement_test(bigint) from public, anon;
revoke execute on function public.admin_announcement_send(bigint, boolean) from public, anon;
revoke execute on function public.admin_announcement_cancel(bigint) from public, anon;
revoke execute on function public.admin_announcements() from public, anon;
grant execute on function public.admin_announcement_save(jsonb) to authenticated;
grant execute on function public.admin_announcement_count(jsonb) to authenticated;
grant execute on function public.admin_announcement_test(bigint) to authenticated;
grant execute on function public.admin_announcement_send(bigint, boolean) to authenticated;
grant execute on function public.admin_announcement_cancel(bigint) to authenticated;
grant execute on function public.admin_announcements() to authenticated;
revoke execute on function public.announcement_quiet(timestamptz) from public, anon;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'anahtar-duyuru';
    perform cron.schedule('anahtar-duyuru', '* * * * *', 'select public.announcement_dispatch()');
  end if;
end $$;
