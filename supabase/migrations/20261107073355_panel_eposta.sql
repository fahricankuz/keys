-- Yönetici panelinden e-posta: "E-posta gönder" düğmesi mailto: yerine panelde yazılan iletiyi sitenin e-posta altyapısıyla
-- (mail_outbox → mail-send) gönderir; yanıt adresi info@anahtar.io (LEAD_TO). Gönderilenler admin_emails'te saklanır, talebin
-- altında "gönderildi" olarak görünür, İşlem kaydı'na düşer; kişiye ya da kuruma gönderildiyse "Son temas" notu da yazılır.
-- Yalnız anahtar yöneticisi çağırır; yönetici başına saatte 30 ileti (yanlışlıkla toplu gönderime karşı).
-- Yeni tablo, yeni işlev ve kuyruk türü; eski kodla uyumlu, yeniden çalıştırılabilir.

create table if not exists public.admin_emails (
  id         uuid primary key default gen_random_uuid(),
  to_email   text not null check (to_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(to_email) <= 200),
  subject    text not null check (length(btrim(subject)) between 1 and 200),
  body       text not null check (length(btrim(body)) between 1 and 10000),
  request_id uuid references public.support_requests(id) on delete set null,
  user_id    uuid references public.profiles(id) on delete set null,
  org_id     uuid references public.organizations(id) on delete set null,
  outbox_id  bigint,
  sent_by    uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists admin_emails_request on public.admin_emails (request_id, created_at desc);
alter table public.admin_emails enable row level security;
drop policy if exists ae_admin on public.admin_emails;
create policy ae_admin on public.admin_emails for select to authenticated using (public.is_admin());
grant select on public.admin_emails to authenticated;
revoke insert, update, delete on public.admin_emails from anon, authenticated;

alter table public.mail_outbox drop constraint if exists mail_outbox_kind_check;
alter table public.mail_outbox add constraint mail_outbox_kind_check
  check (kind in ('account_deleted', 'plan_choice', 'org_master_invite', 'investor_report', 'admin_message'));

/** Yönetici: e-posta gönderir. p: {to, subject, body, request_id?, user_id?, org_id?}. Gönderim kaydının kimliğini döner. */
create or replace function public.admin_send_email(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  mail text := lower(btrim(coalesce(p ->> 'to', '')));
  subj text := btrim(coalesce(p ->> 'subject', ''));
  msg  text := btrim(coalesce(p ->> 'body', ''));
  req  uuid := nullif(p ->> 'request_id', '')::uuid;
  uid  uuid := nullif(p ->> 'user_id', '')::uuid;
  oid  uuid := nullif(p ->> 'org_id', '')::uuid;
  box  bigint;
  rid  uuid;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  if mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(mail) > 200 then raise exception 'Geçerli bir e-posta adresi yaz.' using errcode = '22023'; end if;
  if length(subj) < 1 or length(subj) > 200 then raise exception 'Konu yaz (en çok 200 karakter).' using errcode = '22023'; end if;
  if length(msg) < 1 or length(msg) > 10000 then raise exception 'Mesaj yaz (en çok 10.000 karakter).' using errcode = '22023'; end if;
  if (select count(*) from public.admin_emails where sent_by = auth.uid() and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Saatte en çok 30 e-posta gönderebilirsin.' using errcode = '54000';
  end if;
  insert into public.mail_outbox (kind, to_email, lang, data)
  values ('admin_message', mail, 'tr', jsonb_build_object('subject', subj, 'body', msg))
  returning id into box;
  insert into public.admin_emails (to_email, subject, body, request_id, user_id, org_id, outbox_id)
  values (mail, subj, msg, req, uid, oid, box) returning id into rid;
  if uid is not null or oid is not null then
    insert into public.customer_contacts (user_id, org_id, note) values (uid, oid, left('E-posta gönderildi: ' || subj, 1000));
  end if;
  perform public.audit('email.send', mail, jsonb_build_object('subject', subj, 'request', req, 'user', uid, 'org', oid));
  return rid;
end $$;
revoke execute on function public.admin_send_email(jsonb) from public, anon;
grant execute on function public.admin_send_email(jsonb) to authenticated;
