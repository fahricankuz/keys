-- CRM (yönetici paneli): iletişime geçilen potansiyel aboneler, pipeline aşamaları ve takip hatırlatmaları.
-- 1. crm_leads: ad, telefon, e-posta, kurum, sektör, düşündüğü paket ve mülk adedi (potansiyel getiri uygulamada paket
--    fiyatından; Kurumsal için aylık tutar elle), aşama, kaynak, sonraki takip günü, son temas, kaybedilme nedeni;
--    "Bize ulaş" talebinden aktarıldıysa talep, kazanıldıysa kurum ya da hesap bağlantısı.
-- 2. crm_notes: temas notları (görüşme geçmişi); not eklenince son temas güncellenir.
-- 3. Hatırlatma (crm_reminders, her gün 09:30 İstanbul): açık aşamadaki kişi 30, 60 ya da 90 gündür temas edilmediyse ve takip
--    günü geldiyse anahtar yöneticilerine bildirim (e-posta bildirim ayarına göre). Kişiye otomatik e-posta gitmez
--    (ticari ileti için önceden izin ve İYS kaydı gerekir); kişiye e-posta panelden elle gönderilir.
-- Yalnız anahtar yöneticisi okur ve yazar. Yeni tablolar ve işlevler; eski kodla uyumlu, yeniden çalıştırılabilir.

create table if not exists public.crm_leads (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 1 and 120),
  phone           text not null default '' check (length(phone) <= 40),
  email           text not null default '' check (length(email) <= 200),
  company         text not null default '' check (length(company) <= 160),
  sector          text not null default '' check (sector in ('','bireysel','site','avm','gyo','depo','emlak','family','diger')),
  plan            text not null default 'bes' check (plan in ('tek','bes','kurumsal')),
  units           int not null default 1 check (units between 1 and 1000000),
  yearly          boolean not null default false,
  monthly_value   numeric check (monthly_value is null or monthly_value >= 0),
  stage           text not null default 'yeni' check (stage in ('yeni','iletisim','gorusme','teklif','kazanildi','kaybedildi')),
  source          text not null default 'diger' check (source in ('web','telefon','referans','etkinlik','sosyal','diger')),
  next_at         date,
  last_contact_at timestamptz,
  lost_reason     text not null default '' check (length(lost_reason) <= 300),
  note            text not null default '' check (length(note) <= 2000),
  request_id      uuid references public.support_requests(id) on delete set null,
  org_id          uuid references public.organizations(id) on delete set null,
  user_id         uuid references public.profiles(id) on delete set null,
  created_by      uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  closed_at       timestamptz
);
create index if not exists crm_leads_stage on public.crm_leads (stage, updated_at desc);
alter table public.crm_leads enable row level security;
drop policy if exists crm_admin on public.crm_leads;
create policy crm_admin on public.crm_leads for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.crm_leads to authenticated;

create table if not exists public.crm_notes (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.crm_leads(id) on delete cascade,
  note       text not null check (length(btrim(note)) between 1 and 2000),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists crm_notes_lead on public.crm_notes (lead_id, created_at desc);
alter table public.crm_notes enable row level security;
drop policy if exists crmn_admin on public.crm_notes;
create policy crmn_admin on public.crm_notes for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, delete on public.crm_notes to authenticated;

/** Aşama değişince kapanış zamanı ve güncelleme; not eklenince son temas. */
create or replace function public.crm_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'crm_notes' then
    update public.crm_leads set last_contact_at = new.created_at, updated_at = now() where id = new.lead_id;
    return null;
  end if;
  new.updated_at := now();
  if new.stage in ('kazanildi','kaybedildi') and (tg_op = 'INSERT' or old.stage is distinct from new.stage) then new.closed_at := now();
  elsif new.stage not in ('kazanildi','kaybedildi') then new.closed_at := null;
  end if;
  return new;
end $$;
revoke execute on function public.crm_touch() from public, anon, authenticated;
drop trigger if exists crm_leads_touch on public.crm_leads;
create trigger crm_leads_touch before insert or update on public.crm_leads for each row execute function public.crm_touch();
drop trigger if exists crm_notes_touch on public.crm_notes;
create trigger crm_notes_touch after insert on public.crm_notes for each row execute function public.crm_touch();

/** Takip hatırlatmaları: açık kişi 30 / 60 / 90 gündür temas edilmediyse ya da takip günü bugünse yöneticilere bildirim. */
create or replace function public.crm_reminders(today date default (now() at time zone 'Europe/Istanbul')::date)
returns int language plpgsql security definer set search_path = public as $$
declare before int;
begin
  select count(*) into before from public.notifications;
  with open_leads as (
    select l.*, today - (coalesce(l.last_contact_at, l.created_at) at time zone 'Europe/Istanbul')::date as idle
    from public.crm_leads l where l.stage not in ('kazanildi','kaybedildi')
  ), due as (
    select o.id, o.name, o.company,
           case when o.next_at = today then 'takip' when o.idle in (30, 60, 90) then 'sessiz-' || o.idle end as why, o.idle
    from open_leads o
    where o.next_at = today or o.idle in (30, 60, 90)
  )
  insert into public.notifications (user_id, title, body, url, tag)
  select a.user_id,
         case when d.why = 'takip' then 'CRM: bugün takip — ' || d.name else 'CRM: ' || d.name || ' ' || d.idle || ' gündür aranmadı' end,
         coalesce(nullif(d.company, '') || ' · ', '') || 'Potansiyel aboneyle yeniden iletişime geç.',
         '/admin', 'crm-' || d.id || '-' || d.why || '-' || today
  from due d cross join public.admins a
  on conflict do nothing;
  return (select count(*) from public.notifications) - before;
end $$;
revoke execute on function public.crm_reminders(date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'anahtar-crm-reminders';
    perform cron.schedule('anahtar-crm-reminders', '30 6 * * *', 'select public.crm_reminders()');
  end if;
end $$;
