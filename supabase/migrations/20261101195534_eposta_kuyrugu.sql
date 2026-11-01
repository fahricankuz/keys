-- E-posta gönderim kuyruğu: bildirim hattına sığmayan e-postalar için (alıcının hesabı silinmiş ya da henüz hiç olmamış, ya da alıcı ekibimiz).
--   account_deleted   hesabı silinen kişiye "hesabın silindi" (kendisi sildi ya da yönetici sildi)
--   plan_choice       ekibe "şu kullanıcı şu paketi seçti" (satın alma sayfasındaki seçim)
--   org_master_invite kurum yöneticisi olarak davet edilen, henüz hesabı olmayan kişiye davet bağlantısı
-- Satırı Database Webhook (mail_outbox INSERT) mail-send Edge Function'a iletir; fonksiyon Resend ile gönderir ve satırı kapatır.
-- Tabloya yalnızca sunucu (service_role) ve güvenlik tanımlı işlevler yazar/okur; kullanıcı erişemez.
-- Migration eski kodla uyumludur. Yeniden çalıştırılabilir.

create table if not exists public.mail_outbox (
  id         bigserial primary key,
  kind       text not null check (kind in ('account_deleted', 'plan_choice', 'org_master_invite')),
  to_email   text,                                             -- boşsa ekip adresi (LEAD_TO) kullanılır
  lang       text not null default 'tr',
  data       jsonb not null default '{}'::jsonb,
  dedupe     text,                                             -- aynı olay iki kez yazılmaz
  attempts   int not null default 0,
  sent_at    timestamptz,
  error      text,
  created_at timestamptz not null default now(),
  check (to_email is not null or kind = 'plan_choice')
);
create unique index if not exists mail_outbox_dedupe on public.mail_outbox (kind, dedupe) where dedupe is not null;
create index if not exists mail_outbox_pending on public.mail_outbox (created_at) where sent_at is null;
alter table public.mail_outbox enable row level security;      -- kural yok: yalnız sunucu yazar ve okur
revoke all on public.mail_outbox from anon, authenticated;
revoke all on sequence public.mail_outbox_id_seq from anon, authenticated;

-- ---- Sunucu işlevleri (mail-send) -----------------------------------------------------------------------------------
/** Satırı gönderim için ayırır: gönderilmemiş ve 5 denemeyi aşmamışsa deneme sayısını artırıp satırı döner; yoksa boş. */
create or replace function public.mail_claim(rid bigint)
returns public.mail_outbox language plpgsql security definer set search_path = public as $$
declare r public.mail_outbox;
begin
  update public.mail_outbox set attempts = attempts + 1
   where id = rid and sent_at is null and attempts < 5
  returning * into r;
  return r;
end $$;
create or replace function public.mail_done(rid bigint)
returns void language sql security definer set search_path = public as $$
  update public.mail_outbox set sent_at = now(), error = null where id = rid
$$;
create or replace function public.mail_fail(rid bigint, msg text)
returns void language sql security definer set search_path = public as $$
  update public.mail_outbox set error = left(coalesce(msg, ''), 500) where id = rid
$$;
/** Gönderilemeyen (5 dakikadan eski, 5 denemeden az) satırların kimlikleri; mail-send {"sweep":true} ile yeniden dener. */
create or replace function public.mail_retry()
returns setof bigint language sql security definer set search_path = public as $$
  select id from public.mail_outbox where sent_at is null and attempts < 5 and created_at < now() - interval '5 minutes' order by id limit 50
$$;
revoke execute on function public.mail_claim(bigint), public.mail_done(bigint), public.mail_fail(bigint, text), public.mail_retry()
  from public, anon, authenticated;

-- ---- Hesap silindi: kullanıcı kendi silince ve yönetici silince -----------------------------------------------------------
-- Önceki sürümler (baseline / admin_sil) + silinmeden önce kuyruğa e-posta (adres hesapla birlikte gideceği için burada saklanır).
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare mail text; nm text; lg text;
begin
  if auth.uid() is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  select u.email::text, p.name, coalesce(p.lang, 'tr') into mail, nm, lg
    from auth.users u left join public.profiles p on p.id = u.id where u.id = auth.uid();
  if mail is not null then
    insert into public.mail_outbox (kind, to_email, lang, data, dedupe)
    values ('account_deleted', mail, lg, jsonb_build_object('name', coalesce(nm, ''), 'by', 'self'), auth.uid()::text)
    on conflict do nothing;
  end if;
  update public.messages set by_user = null where by_user = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;
grant execute on function public.delete_my_account() to authenticated;

create or replace function public.admin_delete_user(uid uuid, why text default '')
returns void language plpgsql security definer set search_path = public as $$
declare pr public.profiles; mail text; owned int;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  if uid = auth.uid() then raise exception 'Kendi hesabını buradan silemezsin' using errcode = '22023'; end if;
  if exists (select 1 from public.admins where user_id = uid) then raise exception 'Yönetici silinemez' using errcode = '22023'; end if;
  select * into pr from public.profiles where id = uid;
  if not found then raise exception 'Kullanıcı bulunamadı' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.bans where user_id = uid) then raise exception 'Önce hesabı yasakla, sonra sil' using errcode = '22023'; end if;
  select email::text into mail from auth.users where id = uid;
  select count(*) into owned from public.properties where owner_id = uid;
  perform public.audit('user.delete', uid::text, jsonb_build_object('email', coalesce(mail, ''), 'name', coalesce(pr.name, ''), 'role', pr.role,
                                                                      'properties', owned, 'reason', coalesce(trim(why), '')));
  if mail is not null then
    insert into public.mail_outbox (kind, to_email, lang, data, dedupe)
    values ('account_deleted', mail, coalesce(pr.lang, 'tr'),
            jsonb_build_object('name', coalesce(pr.name, ''), 'by', 'admin', 'reason', coalesce(trim(why), '')), uid::text)
    on conflict do nothing;
  end if;
  update public.messages set by_user = null where by_user = uid;
  delete from auth.users where id = uid;
end $$;
grant execute on function public.admin_delete_user(uuid, text) to authenticated;

-- ---- Paket seçimi: ekibe haber ------------------------------------------------------------------------------------------
-- Satın alma sayfasında oturum açmış mülk sahibi paket / adet / dönem seçince (profiles.settings.planChoice) ekibe e-posta.
-- Yalnızca seçim gerçekten değişince (yalnız zaman damgası değişirse değil) ve aynı seçim günde bir kez. Hata kullanıcının
-- profil güncellemesini asla engellemez.
create or replace function public.queue_plan_choice()
returns trigger language plpgsql security definer set search_path = public as $$
declare c jsonb := new.settings -> 'planChoice'; o jsonb := old.settings -> 'planChoice'; mail text; yr boolean;
begin
  if new.role <> 'landlord' or c is null or jsonb_typeof(c) <> 'object' or c ->> 'plan' not in ('tek', 'bes') then return new; end if;
  yr := (c ->> 'yearly') = 'true';
  if o is not null and jsonb_typeof(o) = 'object'
     and (o ->> 'plan', o ->> 'units', coalesce(o ->> 'yearly', 'false')) is not distinct from (c ->> 'plan', c ->> 'units', coalesce(c ->> 'yearly', 'false')) then
    return new;
  end if;
  select email::text into mail from auth.users where id = new.id;
  insert into public.mail_outbox (kind, to_email, lang, data, dedupe)
  values ('plan_choice', null, 'tr',
          jsonb_build_object('user', new.id, 'name', coalesce(new.name, ''), 'email', coalesce(mail, ''), 'plan', c ->> 'plan',
                             'units', left(coalesce(c ->> 'units', ''), 6), 'yearly', yr),
          new.id::text || ':' || (c ->> 'plan') || ':' || coalesce(c ->> 'units', '') || ':' || yr::text || ':' || to_char(now(), 'YYYYMMDD'))
  on conflict do nothing;
  return new;
exception when others then
  return new;
end $$;
drop trigger if exists queue_plan_choice on public.profiles;
create trigger queue_plan_choice after update of settings on public.profiles
  for each row when (old.settings is distinct from new.settings) execute function public.queue_plan_choice();

-- ---- Kurum yöneticisi ----------------------------------------------------------------------------------------------------
-- Önceki sürüm (kurumlar bölümü) + hesabı olana bildirim, hesabı olmayana davet e-postası (kuyruğa).
create or replace function public.admin_org_set_master(oid uuid, mail text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  c text;
  oname text;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  select name into oname from public.organizations where id = oid;
  if not found then raise exception 'Kurum bulunamadı' using errcode = 'P0002'; end if;
  mail := lower(btrim(coalesce(mail, '')));
  if mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Geçerli bir e-posta adresi yaz.' using errcode = '22023'; end if;
  select id into uid from auth.users where lower(email) = mail;
  if uid is not null and exists (select 1 from public.profiles where id = uid) then
    update public.org_members set is_master = false where org_id = oid and is_master and user_id <> uid;
    insert into public.org_members (org_id, user_id, role_id, is_master) values (oid, uid, null, true)
    on conflict (org_id, user_id) do update set is_master = true, role_id = null;
    perform public.audit('org.master', oid::text, jsonb_build_object('user', uid, 'email', mail));
    insert into public.notifications (user_id, title, body, url, tag)
    values (uid, 'Kurum yöneticisi olarak atandın',
            oname || ' kurumunun yöneticisi oldun. Panelinden ekibi, kişileri ve ayarları yönetebilirsin.',
            '/uygulama', 'acct-org-' || floor(extract(epoch from clock_timestamp()))::text)
    on conflict do nothing;
    return jsonb_build_object('status', 'set', 'user', uid);
  end if;
  delete from public.org_invites where org_id = oid and master and accepted_by is null;
  insert into public.org_invites (org_id, master, email) values (oid, true, mail) returning code into c;
  perform public.audit('org.master_invite', oid::text, jsonb_build_object('email', mail));
  insert into public.mail_outbox (kind, to_email, lang, data, dedupe)
  values ('org_master_invite', mail, 'tr', jsonb_build_object('org', oname, 'code', c), c)
  on conflict do nothing;
  return jsonb_build_object('status', 'invited', 'code', c);
end $$;
grant execute on function public.admin_org_set_master(uuid, text) to authenticated;
