-- Kurum sözleşmesi sektöre göre sayılır; portföy sektörlerinde birim eklemeye sunucu sınırı.
-- Sorun (GYO incelemesi): kurumun master'ının KİŞİSEL mülkleri (Mülk sahibi tarafı) her sektörde kurumun sözleşmesine bağlıydı;
-- GYO, AVM, depo ve site kurumlarının portföyü ise birimlerde (site_units) duruyor ve birimlerde sunucu sınırı yoktu. Ekranda
-- kurumsal müşteriye "Ücretsiz deneme · 500 mülk" ve mağaza satın alması çıkıyordu.
-- Kural:
--  * GYO, AVM, depo, site (portföy sektörleri): sözleşme adedi BİRİMLERİ sayar (site_units; yönetici dışında aşılamaz).
--    Master'ın kişisel mülkleri kendi kişisel paketine tabidir (deneme / Başlangıç / Profesyonel); kurum üyeliği erişimi sürdürür.
--  * Emlak ofisi, aile ofisi, diğer: sözleşme adedi master'ın mülklerini sayar (bugünkü gibi); kişisel deneme gösterilmez.
-- master_org yalnız mülkleri kurum sözleşmesinde olan kurumları döndürür; access_state, guard_unit_limit ve admin_add_property
-- bunun üzerinden doğru sınırı kullanır. Mevcut kayıtlar silinmez. Eski istemciyle uyumlu, yeniden çalıştırılabilir.

/** Hesabın mülklerini sözleşmesine bağlayan kurum: master'ı olduğu, etkin, sözleşmesi süren ve portföyü mülklerde olan
    (emlak ofisi, aile ofisi, diğer) kurum. GYO, AVM, depo ve site kurumlarının portföyü birimlerdedir; burada sayılmaz. */
create or replace function public.master_org(uid uuid)
returns public.organizations language sql stable security definer set search_path = public as $$
  select o.* from public.organizations o join public.org_members m on m.org_id = o.id
   where m.user_id = uid and m.is_master and o.status = 'active' and (o.contract_until is null or o.contract_until >= current_date)
     and o.sector not in ('site','avm','depo','gyo')
   order by o.created_at limit 1
$$;

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
    -- Portföyü kurumun sözleşmesinde olan hesapta (emlak ofisi, aile ofisi, diğer) kişisel deneme yoktur.
    'inTrial', o.id is null and not subscribed and coalesce(now() < trial_end, false),
    'trialEnds', case when o.id is null then trial_end end,
    'trialDays', public.trial_days(),
    'cardTrial', card,
    'plan', plan,
    'units', case when o.id is not null then o.units
                  when subscribed and public.product_units(s.product_id) is not null then public.product_units(s.product_id)
                  -- Yönetici panelinden "Kurumsal · N mülk" olarak tanımlanan paket (Paket ver / Havale / Sanal POS): adet sınırdır.
                  when subscribed and s.product_id = 'kurumsal' and s.units is not null then s.units
                  else public.plan_units(plan) end,
    'org', o.id,
    'orgName', o.name,
    'orgUntil', o.contract_until,
    'orgUsed', case when o.id is not null then (select count(*) from public.properties x where x.org_id = o.id or x.owner_id = uid) end,
    'trialPeriod', coalesce(subscribed and s.period_type in ('trial','intro'), false),
    'expiresAt', s.expires_at,
    'store', s.store,
    'productId', s.product_id,
    'willRenew', coalesce(s.will_renew, false),
    'billingIssue', coalesce(s.billing_issue, false)
  );
end $$;

/** Portföy kurumlarında birim sayısı sözleşme adedini aşamaz (anahtar yöneticisi ve sunucu işleri aşabilir; ekran uyarır). */
create or replace function public.guard_site_unit_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim int; n int;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  select units into lim from public.organizations where id = new.org_id;
  if lim is not null then
    select count(*) into n from public.site_units where org_id = new.org_id;
    if n >= lim then raise exception 'Sözleşme sınırı: en fazla % birim', lim using errcode = 'EV403'; end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_site_unit_limit() from public, anon, authenticated;
drop trigger if exists guard_site_unit_limit on public.site_units;
create trigger guard_site_unit_limit before insert on public.site_units for each row execute function public.guard_site_unit_limit();
