-- Abonelik ve erişim açıkları (denetim, 2026-11-20). Yeniden çalıştırılabilir; eski istemciyle uyumlu.
-- 1. require_access: yalnız mülk sahibi/yöneticisi olarak yazan kişiyi engeller. Sonradan "mülk sahibi" rolü eklemiş bir kiracının
--    (add_landlord_role) deneme süresi bitince, kiracı olduğu evde dekont yüklemesi / talep açması artık engellenmez.
-- 2. guard_unit_limit_update: satın alınan adetten fazla mülkü olan sahibin, sınırın dışında kalan (en yeni) mülklerine yazması reddedilir
--    (EV403, "Paket sınırı"); okuma ve silme serbest. Mülk eklemeyi zaten guard_unit_limit sınırlıyordu (yalnız INSERT).
-- 3. trial_reminders: uygulama içi (30 gün) deneme bitmeden 3 gün ve 1 gün kala, bitince bildirim; her aşama bir kez.
--    Günlük billing_reminders cron'una eklendi (yeni gizli anahtar yok). E-posta ayrıca yazılmaz: bildirim eklenince push işlevi e-postayı zaten gönderir ve kullanıcının e-posta kapatma tercihine uyar (etiket trial-N; yalnız bill-/acct- etiketleri tercihi aşar).

-- ---- 1. require_access -----------------------------------------------------------------------------------------------------
create or replace function public.require_access()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  if auth.uid() is null then return new; end if;
  if (select role from public.profiles where id = auth.uid()) = 'landlord'
     and not public.has_access(auth.uid()) then
    pid := to_jsonb(new) ->> case when tg_table_name = 'properties' then 'id' else 'property_id' end;
    -- Kiracı olarak yazıyorsa (mülkün sahibi değil, o mülkte kiracı üyeliği var) mülk sahibinin aboneliği aranmaz.
    if pid is not null
       and not exists (select 1 from public.properties where id = pid and owner_id = auth.uid())
       and exists (select 1 from public.memberships where property_id = pid and user_id = auth.uid() and role = 'tenant')
       and not exists (select 1 from public.memberships where property_id = pid and user_id = auth.uid() and role = 'landlord') then
      return new;
    end if;
    raise exception 'Abonelik gerekli: deneme süren bitti' using errcode = 'EV402';
  end if;
  return new;
end $$;

-- ---- 2. Paket adedinin altına inme ---------------------------------------------------------------------------------------
create or replace function public.guard_unit_limit_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim int; o public.organizations; rnk int;
begin
  if auth.uid() is null or auth.uid() is distinct from old.owner_id or public.is_admin() then return new; end if;
  if coalesce(current_setting('anahtar.system', true), '') = '1' then return new; end if;
  o := public.master_org(old.owner_id);
  lim := case when o.id is not null then o.units else (public.access_state(old.owner_id) ->> 'units')::int end;
  if lim is null then return new; end if;
  select count(*) into rnk from public.properties p
   where (p.owner_id = old.owner_id or (o.id is not null and p.org_id = o.id))
     and (p.created_at, p.id) < (old.created_at, old.id);
  if rnk >= lim then
    raise exception 'Paket sınırı: en fazla % mülk; bu mülk paketinin dışında kaldı (salt okunur). Mülk sil ya da paketini yükselt', lim using errcode = 'EV403';
  end if;
  return new;
end $$;
drop trigger if exists guard_unit_limit_update on public.properties;
create trigger guard_unit_limit_update before update on public.properties for each row execute function public.guard_unit_limit_update();

-- ---- 3. Deneme bitişi hatırlatması ------------------------------------------------------------------------------------------
create table if not exists public.trial_reminder_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  stage   int  not null check (stage in (3, 1, 0)),
  sent_at timestamptz not null default now(),
  primary key (user_id, stage)
);
alter table public.trial_reminder_log enable row level security;   -- kural yok: yalnız sunucu yazar ve okur
revoke all on public.trial_reminder_log from anon, authenticated;

/** Aboneliği ve kurumu olmayan mülk sahiplerine deneme bitişinden 3 gün / 1 gün önce ve bitince bildirim. Kaç kişiye yazıldığını döner. */
create or replace function public.trial_reminders(today date default (now() at time zone 'Europe/Istanbul')::date)
returns int language plpgsql security definer set search_path = public as $$
declare
  r record; left_d int; stg int; ttl text; msg text; en boolean; n int := 0;
  cf timestamptz := public.card_trial_from();
begin
  for r in
    select p.id, p.name, coalesce(p.lang, 'tr') lang,
           coalesce(p.landlord_since, p.created_at) + make_interval(days => public.trial_days() + coalesce(p.extra_trial_days, 0)) trial_end,
           coalesce(p.landlord_since, p.created_at) started, u.email::text email
      from public.profiles p join auth.users u on u.id = p.id
     where p.role = 'landlord'
       and not exists (select 1 from public.subscriptions s where s.user_id = p.id and s.active and (s.expires_at is null or s.expires_at > now()))
       and not exists (select 1 from public.org_members m where m.user_id = p.id)
       and not exists (select 1 from public.admins a where a.user_id = p.id)
       and not exists (select 1 from public.bans b where b.user_id = p.id)
  loop
    continue when cf is not null and r.started >= cf;                       -- kartlı deneme: uygulama içi deneme yok
    continue when lower(coalesce(r.email, '')) like '%@anahtar.io';          -- iç hesaplar
    left_d := (r.trial_end at time zone 'Europe/Istanbul')::date - today;
    stg := case when left_d in (2, 3) then 3 when left_d = 1 then 1 when left_d between -2 and 0 and r.trial_end <= now() then 0 end;   -- bitti: yalnız süre gerçekten dolunca
    continue when stg is null;
    continue when exists (select 1 from public.trial_reminder_log where user_id = r.id and stage = stg);
    en := r.lang = 'en';
    if stg = 0 then
      ttl := case when en then 'Your free trial has ended' else 'Deneme süren bitti' end;
      msg := case when en then 'Choose a plan to keep managing your properties. Your data is kept.'
                  else 'Mülklerini yönetmeye devam etmek için bir paket seç. Verilerin saklanır.' end;
    else
      ttl := case when en then 'Your free trial ends in ' || left_d || (case when left_d = 1 then ' day' else ' days' end)
                  else 'Deneme süren ' || left_d || ' gün sonra bitiyor' end;
      msg := case when en then 'Choose a plan before it ends to keep managing your properties without interruption.'
                  else 'Kesinti olmadan devam etmek için bitmeden bir paket seç.' end;
    end if;
    insert into public.trial_reminder_log (user_id, stage) values (r.id, stg) on conflict do nothing;
    insert into public.notifications (user_id, title, body, url, tag)
    values (r.id, ttl, msg, '/uygulama/ayarlar', 'trial-' || stg) on conflict do nothing;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.trial_reminders(date) from public, anon, authenticated;

-- Günlük cron (billing_reminders) deneme hatırlatmasını da çalıştırır; dönüş değeri (mağaza yenileme bildirimi sayısı) değişmez.
CREATE OR REPLACE FUNCTION public.billing_reminders(today date DEFAULT ((now() AT TIME ZONE 'Europe/Istanbul'::text))::date)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare n int;
begin
  with due as (
    select s.user_id, s.product_id, s.period_type, s.store, s.expires_at
      from public.subscriptions s
     where s.active and s.will_renew and coalesce(s.store, '') not in ('admin', 'promotional') and coalesce(s.environment, '') <> 'sandbox' and s.expires_at is not null
       and (s.expires_at at time zone 'Europe/Istanbul')::date = today + 1
  ), ins as (
    insert into public.notifications (user_id, title, body, url, tag)
    select d.user_id,
      case when d.period_type in ('trial','intro') then 'Ücretsiz denemen yarın bitiyor' else 'Aboneliğin yarın yenilenecek' end,
      case when d.period_type in ('trial','intro') then 'Yarın ilk ödemen alınacak.' else 'Yarın ödemen alınacak.' end
        || ' Paket: ' || case public.plan_of(d.product_id) when 'tek' then 'Başlangıç' when 'bes' then 'Profesyonel' when 'kurumsal' then 'Kurumsal' else 'Abonelik' end
        || coalesce(' · ' || public.product_units(d.product_id)::text || ' mülk', '')
        || case when d.product_id ~ '_yillik$' then ' · yıllık' when d.product_id ~ '_aylik$' then ' · aylık' else '' end
        || '. İptal etmek istersen ' || case d.store when 'app_store' then 'App Store' when 'play_store' then 'Google Play' else 'ödeme' end
        || ' abonelik ayarlarından bugün iptal edebilirsin.',
      '/uygulama/ayarlar', 'bill-' || to_char(today + 1, 'YYYYMMDD')
      from due d
    on conflict do nothing
    returning 1
  )
  select count(*) into n from ins;
  -- Deneme hatırlatması başarısız olsa da mağaza yenileme bildirimleri etkilenmez.
  begin
    perform public.trial_reminders(today);
  exception when others then
    raise warning 'trial_reminders başarısız: %', sqlerrm;
    insert into public.function_logs (fn, level, message, detail) values ('billing_reminders', 'error', 'trial_reminders başarısız', left(sqlerrm, 500));
  end;
  return n;
end $function$;
revoke execute on function public.billing_reminders(date) from public, anon, authenticated;
