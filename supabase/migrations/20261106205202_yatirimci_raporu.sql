-- Yatırımcı raporu (GYO; AVM ve depoda anahtar yöneticisi açar).
-- 1. Gider türü: "ortak" (ortak alan gideri, kiracıya yansır) ya da "isletme" (işletme gideri). Eski giderler işletme sayılır.
-- 2. Kurumun rapor para birimi (USD | EUR): yatırımcı raporu bu para biriminde hazırlanır; anahtar yöneticisi seçer.
-- 3. "yatirimci" modülü: GYO'da varsayılan açık (mevcut GYO kurumlarına bir kez eklenir); AVM ve depoda yönetici panelinden açılır.
-- 4. Dönem başına yönetimin notu (boşsa raporda bölüm görünmez): "Raporlar" yetkisi olan okur ve yazar.
-- 5. "Mailime gönder": raporun özeti ve bağlantısı oturumdaki kişinin kendi e-postasına (mail_outbox, investor_report).
--    Kişi başına saatte 10 gönderim; özet verisi 8 KB ile sınırlı.
-- Yeni sütunlar varsayılanlı, işlev gövdeleri eski alanları korur: eski kodla uyumlu, yeniden çalıştırılabilir.

alter table public.site_expenses add column if not exists kind text not null default 'isletme';
alter table public.site_expenses drop constraint if exists site_expenses_kind_check;
alter table public.site_expenses add constraint site_expenses_kind_check check (kind in ('isletme','ortak'));

alter table public.organizations add column if not exists report_currency text not null default 'USD';
alter table public.organizations drop constraint if exists organizations_report_currency_check;
alter table public.organizations add constraint organizations_report_currency_check check (report_currency in ('USD','EUR'));

create or replace function public.org_module_list()
returns text[] language sql immutable as $$
  select array['kira','aidat','gider_dagitim','duyuru','ciro_kira','ortak_gider','endeksleme','doluluk','onay_akisi','rapor','api','yatirimci']
$$;
create or replace function public.sector_modules(sec text)
returns text[] language sql immutable as $$
  select case sec
    when 'site'   then array['aidat','gider_dagitim','duyuru','rapor']
    when 'avm'    then array['kira','ortak_gider','ciro_kira','endeksleme','doluluk','duyuru','rapor']
    when 'depo'   then array['kira','ortak_gider','endeksleme','doluluk','duyuru','rapor']
    when 'gyo'    then array['kira','ortak_gider','endeksleme','doluluk','duyuru','rapor','yatirimci']
    else array['kira','rapor'] end
$$;
do $$
begin
  if not exists (select 1 from public.schema_migrations where id = '2026-11-yatirimci-modulu') then
    update public.organizations set modules = array_append(modules, 'yatirimci'), updated_at = now()
     where sector = 'gyo' and not ('yatirimci' = any(modules));
    insert into public.schema_migrations (id) values ('2026-11-yatirimci-modulu');
  end if;
end $$;

create or replace function public.admin_org_save(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  oid uuid := nullif(p ->> 'id', '')::uuid;
  sec text := coalesce(p ->> 'sector', '');
  mods text[];
  lead uuid := nullif(p ->> 'lead_id', '')::uuid;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  if sec not in ('site','avm','gyo','depo','emlak','family','diger') then raise exception 'Sektör seç' using errcode = '22023'; end if;
  if length(btrim(coalesce(p ->> 'name', ''))) < 2 then raise exception 'Kurum adını yaz' using errcode = '22023'; end if;
  mods := case when p ? 'modules' then array(select distinct x from jsonb_array_elements_text(p -> 'modules') x order by 1)
               else public.sector_modules(sec) end;
  if exists (select 1 from unnest(mods) x where x <> all(public.org_module_list())) then
    raise exception 'Geçersiz modül' using errcode = '22023';
  end if;
  if coalesce(p ->> 'report_currency', 'USD') not in ('USD','EUR') then raise exception 'Rapor para birimi dolar ya da avro olmalı' using errcode = '22023'; end if;
  if oid is null then
    insert into public.organizations (name, sector, modules, status, units, contract_until, billing, note, lead_id, report_currency)
    values (btrim(p ->> 'name'), sec, mods, coalesce(nullif(p ->> 'status', ''), 'active'), nullif(p ->> 'units', '')::int,
            nullif(p ->> 'contract_until', '')::date, coalesce(p -> 'billing', '{}'::jsonb), coalesce(p ->> 'note', ''), lead,
            coalesce(nullif(p ->> 'report_currency', ''), 'USD'))
    returning id into oid;
    perform public.org_seed_roles(oid, sec);
    if lead is not null then update public.support_requests set status = 'done' where id = lead; end if;
    perform public.audit('org.create', oid::text, jsonb_build_object('name', p ->> 'name', 'sector', sec));
  else
    update public.organizations set name = btrim(p ->> 'name'), sector = sec, modules = mods,
      status = coalesce(nullif(p ->> 'status', ''), status), units = nullif(p ->> 'units', '')::int,
      contract_until = nullif(p ->> 'contract_until', '')::date, billing = coalesce(p -> 'billing', billing),
      note = coalesce(p ->> 'note', note), report_currency = coalesce(nullif(p ->> 'report_currency', ''), report_currency), updated_at = now()
    where id = oid;
    if not found then raise exception 'Kurum bulunamadı' using errcode = 'P0002'; end if;
    perform public.audit('org.update', oid::text, jsonb_build_object('name', p ->> 'name', 'sector', sec, 'status', p ->> 'status'));
  end if;
  return oid;
end $$;
grant execute on function public.admin_org_save(jsonb) to authenticated;

create or replace function public.my_orgs()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'name', o.name, 'sector', o.sector, 'modules', to_jsonb(o.modules), 'status', o.status, 'units', o.units, 'report_currency', o.report_currency,
    'master', m.is_master, 'role', case when r.id is null then null else jsonb_build_object('id', r.id, 'name', r.name) end,
    'perms', to_jsonb(case when m.is_master then public.org_perm_list() else coalesce(r.perms, '{}') end)
  ) order by o.name), '[]'::jsonb)
  from public.org_members m join public.organizations o on o.id = m.org_id left join public.org_roles r on r.id = m.role_id
  where m.user_id = auth.uid()
$$;
grant execute on function public.my_orgs() to authenticated;

create table if not exists public.site_investor_notes (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  period     text not null check (period ~ '^\d{4}(-Q[1-4])?$'),
  note       text not null default '' check (length(note) <= 2000),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (org_id, period)
);
alter table public.site_investor_notes enable row level security;
drop policy if exists not_banned on public.site_investor_notes;
create policy not_banned on public.site_investor_notes as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned());
drop policy if exists sin_all on public.site_investor_notes;
create policy sin_all on public.site_investor_notes for all to authenticated
  using (public.org_can(org_id, 'reports.view') or public.is_admin())
  with check (public.org_can(org_id, 'reports.view'));
grant select, insert, update, delete on public.site_investor_notes to authenticated;

alter table public.mail_outbox drop constraint if exists mail_outbox_kind_check;
alter table public.mail_outbox add constraint mail_outbox_kind_check
  check (kind in ('account_deleted', 'plan_choice', 'org_master_invite', 'investor_report'));

/** "Mailime gönder": yatırımcı raporunun özeti ve bağlantısı oturumdaki kişinin e-postasına. summary: ekranda hesaplanan özet. */
create or replace function public.investor_report_mail(oid uuid, period text, summary jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare mail text; oname text; lng text;
begin
  if auth.uid() is null or not public.org_can(oid, 'reports.view') then raise exception 'Rapor yetkin yok' using errcode = '42501'; end if;
  select name into oname from public.organizations where id = oid and 'yatirimci' = any(modules);
  if not found then raise exception 'Yatırımcı raporu bu kurumda kapalı' using errcode = '42501'; end if;
  if period !~ '^\d{4}(-Q[1-4])?$' then raise exception 'Dönem geçersiz' using errcode = '22023'; end if;
  if summary is null or jsonb_typeof(summary) <> 'object' or length(summary::text) > 8000 then raise exception 'Özet geçersiz' using errcode = '22023'; end if;
  if (select count(*) from public.mail_outbox where kind = 'investor_report' and data ->> 'uid' = auth.uid()::text
        and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Saatte en çok 10 rapor gönderebilirsin' using errcode = '54000';
  end if;
  select email into mail from auth.users where id = auth.uid();
  if mail is null then raise exception 'E-posta adresin yok' using errcode = '22023'; end if;
  select coalesce(nullif(lang, ''), 'tr') into lng from public.profiles where id = auth.uid();
  insert into public.mail_outbox (kind, to_email, lang, data)
  values ('investor_report', mail, case when lng = 'en' then 'en' else 'tr' end,
          summary || jsonb_build_object('org', oname, 'oid', oid, 'period', period, 'uid', auth.uid()));
end $$;
revoke execute on function public.investor_report_mail(uuid, text, jsonb) from public, anon;
grant execute on function public.investor_report_mail(uuid, text, jsonb) to authenticated;
