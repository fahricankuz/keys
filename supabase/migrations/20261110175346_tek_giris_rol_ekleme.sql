-- tek giris rol ekleme
-- 1) Kiracı ve site sakini hesabı yalnız geçerli davet koduyla açılır (boş/sahte hesapların önüne geçer).
-- 2) Hesap içinden "mülk sahibi özelliğini ekle": kiracı hesabı mülk sahibi olur; deneme süresi o andan başlar (hesap başına bir kez).
-- Eski kodla uyumlu: yeni sütun boş kalır, yeni işlevleri yalnız yeni arayüz çağırır. Kayıt kuralı yalnız Auth servisi üzerinden gelen
-- kayıtlara uygulanır; acil durumda kapatmak için: alter database postgres set anahtar.signup_code = 'off';

alter table public.profiles add column if not exists landlord_since timestamptz;

/** Kayıt için geçerli davet kodu mu? Kiracı daveti (kullanılmamış, süresi dolmamış) ya da site dairesi kodu (kullanılmamış). */
create or replace function public.signup_code_ok(invite_code text)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(length(btrim(coalesce(invite_code, ''))) between 6 and 12 and (
    exists (select 1 from public.invites i where i.code = upper(btrim(invite_code)) and i.role = 'tenant'
            and i.accepted_by is null and i.expires_at > now())
    or exists (select 1 from public.site_residents r where r.code = upper(btrim(invite_code)) and r.user_id is null)), false)
$$;
grant execute on function public.signup_code_ok(text) to anon, authenticated;

/** Kayıt kuralı açık mı? (Veritabanı ayarı 'off' ise kapalı.) */
create or replace function public.signup_code_required()
returns boolean language sql stable as $$
  select coalesce(current_setting('anahtar.signup_code', true), '') <> 'off'
$$;

-- Yeni hesap: profil satırı. Kiracı (ve site sakini) hesabı için üst veride geçerli davet kodu (invite) aranır.
-- Denetim yalnız Auth servisinin açtığı kayıtlarda yapılır (session_user = supabase_auth_admin); SQL ile elle eklenen satırlar etkilenmez.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r text := case new.raw_user_meta_data ->> 'role' when 'landlord' then 'landlord' when 'team' then 'team' else 'tenant' end;
begin
  if r = 'tenant' and session_user = 'supabase_auth_admin' and public.signup_code_required()
     and not public.signup_code_ok(new.raw_user_meta_data ->> 'invite') then
    raise exception 'Kiracı ve site sakini hesabı için geçerli bir davet kodu gerekir' using errcode = '42501';
  end if;
  insert into public.profiles (id, role, name, lang)
  values (
    new.id, r,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'lang', 'tr')
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Rol, ek deneme günü ve mülk sahipliği başlangıcı kullanıcı tarafından değiştirilemez (yalnız sunucu içi işlemler).
create or replace function public.guard_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and coalesce(current_setting('anahtar.system', true), '') <> '1'
     and (new.role is distinct from old.role or new.landlord_since is distinct from old.landlord_since) then
    raise exception 'Hesap rolü değiştirilemez' using errcode = '42501';
  end if;
  if auth.uid() is not null and not public.is_admin() and new.extra_trial_days is distinct from old.extra_trial_days then
    raise exception 'Deneme süresi değiştirilemez' using errcode = '42501';
  end if;
  return new;
end $$;

/** Hesaba mülk sahibi özelliğini ekler: kiracı (ya da site sakini) hesabı mülk sahibi olur, kiracı ve site bağları aynen kalır.
    Deneme süresi bu andan başlar ve hesap başına bir kez verilir. Ekip hesabı mülk sahibine dönüşmez. */
create or replace function public.add_landlord_role()
returns text language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  if public.is_banned() then raise exception 'Hesap askıya alındı' using errcode = '42501'; end if;
  if p.role = 'landlord' then return 'landlord'; end if;
  if p.role = 'team' then raise exception 'Ekip hesabı mülk sahibi hesabına dönüştürülemez' using errcode = '22023'; end if;
  perform set_config('anahtar.system', '1', true);
  update public.profiles set role = 'landlord', landlord_since = coalesce(landlord_since, now()) where id = p.id;
  perform set_config('anahtar.system', '', true);
  return 'landlord';
end $$;
revoke execute on function public.add_landlord_role() from public, anon;
grant execute on function public.add_landlord_role() to authenticated;

-- Erişim durumu: deneme başlangıcı landlord_since (varsa). Geri kalanı önceki sürümle aynı.
create or replace function public.access_state(uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
  s public.subscriptions;
  o public.organizations;
  subscribed boolean;
  trial_end timestamptz;
  plan text;
  cf timestamptz := public.card_trial_from();
  card boolean;
  started timestamptz;
begin
  select * into p from public.profiles where id = uid;
  if p.id is null then return jsonb_build_object('access', false); end if;
  select * into s from public.subscriptions where user_id = uid;
  -- Deneme başlangıcı: hesap sonradan mülk sahibi olduysa o an (landlord_since), değilse hesabın açılışı.
  started := coalesce(p.landlord_since, p.created_at);
  o := public.master_org(uid);
  subscribed := s.user_id is not null and s.active and (s.expires_at is null or s.expires_at > now());
  -- Kartlı deneme: kesimden sonra açılan hesapların uygulama içi denemesi yoktur.
  card := cf is not null and started >= cf;
  trial_end := case when card then null else started + make_interval(days => public.trial_days() + coalesce(p.extra_trial_days, 0)) end;
  plan := case when o.id is not null then 'kurumsal' when subscribed then public.plan_of(s.product_id)
                when coalesce(now() < trial_end, false) then 'trial' else null end;
  return jsonb_build_object(
    'role', p.role,
    'access', p.role in ('tenant','team') or subscribed or coalesce(now() < trial_end, false)
              or exists (select 1 from public.org_members m join public.organizations x on x.id = m.org_id
                         where m.user_id = uid and x.status = 'active' and (x.contract_until is null or x.contract_until >= current_date)),
    'subscribed', subscribed,
    'inTrial', not subscribed and coalesce(now() < trial_end, false),
    'trialEnds', trial_end,
    'trialDays', public.trial_days(),
    'cardTrial', card,
    'plan', plan,
    'units', case when o.id is not null then o.units
                  when subscribed and public.product_units(s.product_id) is not null then public.product_units(s.product_id)
                  else public.plan_units(plan) end,
    'org', o.id,
    'trialPeriod', coalesce(subscribed and s.period_type in ('trial','intro'), false),
    'expiresAt', s.expires_at,
    'store', s.store,
    'productId', s.product_id,
    'willRenew', coalesce(s.will_renew, false),
    'billingIssue', coalesce(s.billing_issue, false)
  );
end $$;
