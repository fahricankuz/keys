-- Kurumsal ödeme: yönetici panelinde banka hesapları, "Paket ver"de Havale/EFT ve Sanal POS ile ödeme isteği.
-- pay_accounts: anahtar'ın banka hesapları (yalnız yönetici okur/yazar). corp_payments: ödeme istekleri; ödeme alınınca paket tanımlanır.
-- Havale/EFT isteği müşterinin e-postasına tutar, banka bilgisi ve açıklama koduyla gider (mail_outbox 'havale_bilgi').
-- Sanal POS: ödeme bağlantısı "pos" Edge Function'ında sağlayıcıdan (Moka) alınır; ödeme onayı yalnız sunucudan pay_confirm ile işlenir.
-- Paket tanımlama gövdesi grant_plan'a taşındı (yetki denetimsiz iç işlev); admin_set_plan yetkiyi denetleyip onu çağırır (davranış aynı).
-- 7 gün içinde ödenmeyen istek için yöneticilere bir kez hatırlatma. Yeni tablolar ve işlevler; eski istemciyle uyumlu, yeniden çalıştırılabilir.

create table if not exists public.pay_accounts (
  id         uuid primary key default gen_random_uuid(),
  bank       text not null check (length(btrim(bank)) between 2 and 80),
  holder     text not null check (length(btrim(holder)) between 2 and 120),
  iban       text not null check (iban ~ '^TR[0-9]{24}$'),
  note       text not null default '' check (length(note) <= 300),
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.pay_accounts enable row level security;
drop policy if exists pay_accounts_admin on public.pay_accounts;
create policy pay_accounts_admin on public.pay_accounts for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.pay_accounts to authenticated;
create unique index if not exists pay_accounts_one_default on public.pay_accounts (is_default) where is_default;

create table if not exists public.corp_payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  method       text not null check (method in ('havale','pos')),
  plan         text not null check (plan in ('tek','bes','kurumsal')),
  units        int not null check (units >= 1),
  sector       text,
  until        timestamptz,
  amount       numeric not null check (amount > 0),
  ref          text not null unique default ('ANH-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  status       text not null default 'pending' check (status in ('pending','paid','cancelled')),
  account      jsonb,
  provider     text,
  provider_ref text,
  pay_url      text,
  why          text not null default '',
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);
create index if not exists corp_payments_user on public.corp_payments (user_id);
alter table public.corp_payments enable row level security;
drop policy if exists corp_payments_admin_read on public.corp_payments;
create policy corp_payments_admin_read on public.corp_payments for select to authenticated using (public.is_admin());
grant select on public.corp_payments to authenticated;

alter table public.mail_outbox drop constraint if exists mail_outbox_kind_check;
alter table public.mail_outbox add constraint mail_outbox_kind_check
  check (kind in ('account_deleted', 'plan_choice', 'org_master_invite', 'investor_report', 'admin_message', 'havale_bilgi'));

/** Paketi tanımlar (yetki denetimsiz iç işlev: admin_set_plan ve pay_confirm çağırır). */
create or replace function public.grant_plan(uid uuid, plan text, until timestamptz, why text, unit_count int default null, sec text default null)
returns void language plpgsql security definer set search_path = public as $$
declare pid text; nm text; gone int; msg text;
begin
  if coalesce(plan, '') = '' then
    delete from public.subscriptions where user_id = uid and store = 'admin';
    get diagnostics gone = row_count;
    if gone > 0 then
      insert into public.notifications (user_id, title, body, url, tag)
      values (uid, 'Paketin kaldırıldı', 'Hesabına tanımlanan paket kaldırıldı. Sorun olduğunu düşünüyorsan info@anahtar.io adresine yazabilirsin.',
              '/uygulama/ayarlar', 'bill-planoff-' || floor(extract(epoch from clock_timestamp()))::text)
      on conflict do nothing;
    end if;
  elsif plan not in ('tek','bes','kurumsal') then
    raise exception 'Geçersiz paket' using errcode = '22023';
  else
    if plan in ('tek','bes') then
      if unit_count is null or unit_count < 1 or unit_count > 9 then
        raise exception 'Mülk adedi 1-9 olmalı' using errcode = '22023';
      end if;
      sec := null;
      pid := plan || '_' || unit_count || '_aylik';
    else
      if unit_count is null or unit_count < 1 or unit_count > 1000000 then
        raise exception 'Mülk adedi gerekli' using errcode = '22023';
      end if;
      if sec is null or sec not in ('site','avm','gyo','depo','emlak','family','diger') then
        raise exception 'Sektör gerekli' using errcode = '22023';
      end if;
      pid := 'kurumsal';
    end if;
    insert into public.subscriptions (user_id, entitlement, product_id, store, expires_at, active, will_renew, units, sector, updated_at)
    values (uid, 'pro', pid, 'admin', until, true, false, unit_count, sec, now())
    on conflict (user_id) do update set product_id = excluded.product_id, store = 'admin', expires_at = excluded.expires_at,
      active = true, will_renew = false, billing_issue = false, units = excluded.units, sector = excluded.sector, updated_at = now();
    nm := case plan when 'tek' then 'Başlangıç' when 'bes' then 'Profesyonel' else 'Kurumsal' end;
    msg := 'Hesabına ' || nm || ' paketi tanımlandı · ' || unit_count || ' mülk'
              || case when until is null then ' · süresiz' else ' · bitiş ' || to_char(until at time zone 'Europe/Istanbul', 'DD.MM.YYYY') end || '.';
    -- Aynı paket kısa sürede yeniden tanımlanırsa (çift tıklama, tekrar deneme) aynı bildirim ikinci kez eklenmez.
    if not exists (select 1 from public.notifications where user_id = uid and title = 'Paketin tanımlandı' and body = msg
                   and created_at > now() - interval '10 minutes') then
    insert into public.notifications (user_id, title, body, url, tag)
    values (uid, 'Paketin tanımlandı',
            msg,
            '/uygulama/ayarlar', 'bill-plan-' || floor(extract(epoch from clock_timestamp()))::text || '-' || substr(md5(msg), 1, 6))
    on conflict do nothing;
    end if;
  end if;
  perform public.audit('plan.set', uid::text, jsonb_build_object('plan', nullif(plan, ''), 'until', until, 'reason', why,
    'units', unit_count, 'sector', sec));
end $$;
revoke execute on function public.grant_plan(uuid, text, timestamptz, text, int, text) from public, anon, authenticated;

create or replace function public.admin_set_plan(uid uuid, plan text, until timestamptz, why text, unit_count int default null, sec text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  perform public.grant_plan(uid, plan, until, why, unit_count, sec);
end $$;
grant execute on function public.admin_set_plan(uuid, text, timestamptz, text, int, text) to authenticated;

/** Yönetici: ödeme isteği. p: {method: 'havale'|'pos', plan, units, sector?, until?, amount, account_id?, why}.
    Havale: seçilen (yoksa varsayılan) hesabın bilgisi istekte saklanır, müşteriye e-posta kuyruğa girer.
    Döner: {id, ref, email, phone, account}. Sanal POS bağlantısını "pos" fonksiyonu ekler. */
create or replace function public.admin_pay_request(uid uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  m text := p ->> 'method'; pl text := p ->> 'plan'; n int := nullif(p ->> 'units', '')::int; sec text := nullif(p ->> 'sector', '');
  amt numeric := nullif(p ->> 'amount', '')::numeric; til timestamptz := nullif(p ->> 'until', '')::timestamptz;
  acc public.pay_accounts; r public.corp_payments; mail text; ph text; nm text;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  if m is null or m not in ('havale','pos') then raise exception 'Ödeme yöntemi seç' using errcode = '22023'; end if;
  if pl is null or pl not in ('tek','bes','kurumsal') then raise exception 'Geçersiz paket' using errcode = '22023'; end if;
  if n is null or n < 1 or (pl <> 'kurumsal' and n > 9) then raise exception 'Mülk adedi geçersiz' using errcode = '22023'; end if;
  if pl = 'kurumsal' and (sec is null or sec not in ('site','avm','gyo','depo','emlak','family','diger')) then raise exception 'Sektör gerekli' using errcode = '22023'; end if;
  if amt is null or amt <= 0 then raise exception 'Tutarı yaz' using errcode = '22023'; end if;
  if length(btrim(coalesce(p ->> 'why', ''))) = 0 then raise exception 'Gerekçe yaz' using errcode = '22023'; end if;
  select lower(email) into mail from auth.users where id = uid;
  if mail is null then raise exception 'Hesap bulunamadı' using errcode = 'P0002'; end if;
  select phone, name into ph, nm from public.profiles where id = uid;
  if m = 'havale' then
    select * into acc from public.pay_accounts where id = nullif(p ->> 'account_id', '')::uuid;
    if acc.id is null then select * into acc from public.pay_accounts where is_default; end if;
    if acc.id is null then select * into acc from public.pay_accounts order by created_at limit 1; end if;
    if acc.id is null then raise exception 'Önce Ödeme ayarlarından banka hesabı ekle' using errcode = '22023'; end if;
  end if;
  insert into public.corp_payments (user_id, method, plan, units, sector, until, amount, account, why, created_by)
  values (uid, m, pl, n, case when pl = 'kurumsal' then sec end, til, round(amt, 2),
          case when m = 'havale' then jsonb_build_object('bank', acc.bank, 'holder', acc.holder, 'iban', acc.iban, 'note', acc.note) end,
          btrim(p ->> 'why'), auth.uid())
  returning * into r;
  if m = 'havale' then
    insert into public.mail_outbox (kind, to_email, lang, data, dedupe)
    values ('havale_bilgi', mail, 'tr', jsonb_build_object('name', nm, 'plan', pl, 'units', n, 'amount', r.amount, 'ref', r.ref,
            'until', til, 'bank', acc.bank, 'holder', acc.holder, 'iban', acc.iban, 'note', acc.note), 'havale-' || r.ref)
    on conflict do nothing;
  end if;
  perform public.audit('pay.request', uid::text, jsonb_build_object('ref', r.ref, 'method', m, 'plan', pl, 'units', n, 'amount', r.amount));
  return jsonb_build_object('id', r.id, 'ref', r.ref, 'email', mail, 'phone', coalesce(ph, ''), 'name', coalesce(nm, ''), 'account', r.account);
end $$;
grant execute on function public.admin_pay_request(uuid, jsonb) to authenticated;

/** İç işlev: ödeme alındı. Bekleyen isteği ödendi yapar ve paketi tanımlar (aynı istek ikinci kez işlenmez). */
create or replace function public.pay_confirm(pref text, provider_ref text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare r public.corp_payments;
begin
  select * into r from public.corp_payments where ref = pref for update;
  if r.id is null or r.status <> 'pending' then return false; end if;
  update public.corp_payments set status = 'paid', paid_at = now(), provider_ref = coalesce(pay_confirm.provider_ref, corp_payments.provider_ref) where id = r.id;
  perform public.grant_plan(r.user_id, r.plan, r.until, 'Ödeme ' || r.ref || ' (' || r.method || ')', r.units, r.sector);
  return true;
end $$;
revoke execute on function public.pay_confirm(text, text) from public, anon, authenticated;

/** Yönetici: ödeme alındı (havale) ya da iptal. */
create or replace function public.admin_pay_set(pid uuid, st text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.corp_payments;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  select * into r from public.corp_payments where id = pid;
  if r.id is null then raise exception 'Ödeme bulunamadı' using errcode = 'P0002'; end if;
  if r.status <> 'pending' then raise exception 'Bu ödeme zaten sonuçlandı' using errcode = '22023'; end if;
  if st = 'paid' then perform public.pay_confirm(r.ref);
  elsif st = 'cancelled' then update public.corp_payments set status = 'cancelled' where id = pid;
  else raise exception 'Geçersiz durum' using errcode = '22023'; end if;
  perform public.audit('pay.' || st, r.user_id::text, jsonb_build_object('ref', r.ref));
end $$;
grant execute on function public.admin_pay_set(uuid, text) to authenticated;

/** İç işlev ("pos" fonksiyonu): sağlayıcıdan alınan ödeme bağlantısını isteğe yazar. */
create or replace function public.pay_set_link(pid uuid, prov text, url text, pref text default null)
returns void language sql security definer set search_path = public as $$
  update public.corp_payments set provider = prov, pay_url = url, provider_ref = coalesce(pref, provider_ref) where id = pid and method = 'pos' and status = 'pending'
$$;
revoke execute on function public.pay_set_link(uuid, text, text, text) from public, anon, authenticated;

/** 7 gün içinde ödenmeyen istek için yöneticilere bir kez hatırlatma. */
create or replace function public.pay_reminders()
returns int language plpgsql security definer set search_path = public as $$
declare before int;
begin
  select count(*) into before from public.notifications;
  insert into public.notifications (user_id, title, body, url, tag)
  select a.user_id, 'Ödeme bekleniyor: ' || c.ref,
         coalesce(nullif(p.name, ''), 'Müşteri') || ' · ' || public.fmt_tl(c.amount) || ' · ' || case c.method when 'havale' then 'Havale/EFT' else 'Sanal POS' end
           || ' · 7 gündür ödenmedi.', '/admin', 'corp-pay-' || c.id
  from public.corp_payments c join public.profiles p on p.id = c.user_id cross join public.admins a
  where c.status = 'pending' and c.created_at < now() - interval '7 days'
    and not exists (select 1 from public.notifications n where n.user_id = a.user_id and n.tag = 'corp-pay-' || c.id)
  on conflict do nothing;
  return (select count(*) from public.notifications) - before;
end $$;
revoke execute on function public.pay_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'anahtar-pay-reminders';
    perform cron.schedule('anahtar-pay-reminders', '30 6 * * *', 'select public.pay_reminders()');
  end if;
end $$;
