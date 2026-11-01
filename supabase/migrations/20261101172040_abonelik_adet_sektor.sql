-- Yönetici elle paket verirken mülk adedi (Başlangıç/Profesyonel: 1-9, mülk sınırı olur) ve Kurumsal için adet + sektör alınır.
-- Adet ve sektör abonelik satırında saklanır; yönetici listesinde görünür, denetim kaydına yazılır.
-- Başlangıç/Profesyonel: ürün kimliği tek_3_aylik biçimine yazılır, böylece mevcut mülk sınırı (product_units) kendiliğinden uygulanır.
-- Yeniden çalıştırılabilir: if not exists / drop ... if exists / create or replace.

alter table public.subscriptions add column if not exists units int;
alter table public.subscriptions add column if not exists sector text;
alter table public.subscriptions drop constraint if exists subscriptions_units_check;
alter table public.subscriptions add constraint subscriptions_units_check check (units is null or units between 1 and 1000000);
alter table public.subscriptions drop constraint if exists subscriptions_sector_check;
alter table public.subscriptions add constraint subscriptions_sector_check
  check (sector is null or sector in ('site','avm','gyo','depo','emlak','family','diger'));

/** Paket ver (plan: tek | bes | kurumsal) ya da kaldır (plan boş). until boşsa süresiz.
    tek / bes: unit_count 1-9 zorunlu. kurumsal: unit_count ve sec (sektör) zorunlu. */
drop function if exists public.admin_set_plan(uuid, text, timestamptz, text);
drop function if exists public.admin_set_plan(uuid, text, timestamptz, text, int, text);
create or replace function public.admin_set_plan(uid uuid, plan text, until timestamptz, why text, unit_count int default null, sec text default null)
returns void language plpgsql security definer set search_path = public as $$
declare pid text;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  if coalesce(plan, '') = '' then
    delete from public.subscriptions where user_id = uid and store = 'admin';
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
  end if;
  perform public.audit('plan.set', uid::text, jsonb_build_object('plan', nullif(plan, ''), 'until', until, 'reason', why,
    'units', unit_count, 'sector', sec));
end $$;
grant execute on function public.admin_set_plan(uuid, text, timestamptz, text, int, text) to authenticated;

-- Abonelik listesi: pakette tanımlı mülk adedi (plan_units) ve sektör (plan_sector) da döner.
drop function if exists public.admin_subscriptions();
create or replace function public.admin_subscriptions()
returns table (id uuid, name text, email text, created_at timestamptz, subscribed boolean, in_trial boolean, trial_ends timestamptz,
               extra_days int, plan text, store text, expires_at timestamptz, will_renew boolean, billing_issue boolean,
               banned boolean, units bigint, tenants bigint, choice jsonb, plan_units int, plan_sector text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  return query
    select p.id, p.name, u.email::text, p.created_at,
           (a ->> 'subscribed')::boolean, (a ->> 'inTrial')::boolean, (a ->> 'trialEnds')::timestamptz,
           p.extra_trial_days, a ->> 'plan', s.store, s.expires_at, coalesce(s.will_renew, false), coalesce(s.billing_issue, false),
           exists (select 1 from public.bans b where b.user_id = p.id),
           (select count(*) from public.properties pr where pr.owner_id = p.id),
           (select count(*) from public.memberships m join public.properties pr on pr.id = m.property_id
             where pr.owner_id = p.id and m.role = 'tenant'),
           p.settings -> 'planChoice',
           s.units, s.sector
    from public.profiles p
    cross join lateral (select public.access_state(p.id) a) st
    left join auth.users u on u.id = p.id
    left join public.subscriptions s on s.user_id = p.id
    where p.role = 'landlord'
    order by p.created_at desc;
end $$;
grant execute on function public.admin_subscriptions() to authenticated;
