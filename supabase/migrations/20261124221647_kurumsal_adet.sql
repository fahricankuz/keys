-- Kurumsal paketin mülk adedi sınır olarak uygulanır.
-- Sorun: yönetici panelinden "Paket ver → Kurumsal · N mülk" (ücretsiz, Havale/EFT ya da Sanal POS ile) tanımlanan pakette adet
-- subscriptions.units'e yazılıyor ama erişim durumu (access_state) bunu okumuyordu: kurumsal paketin varsayılan sınırı olmadığı için
-- hesap sınırsız mülk ekleyebiliyordu. Artık adet sınırdır; mülk ekleme tetikleyicisi (guard_unit_limit) bunu uygular.
-- Sınırın üstünde zaten mülkü olan hesapta kayıt silinmez; yalnız yeni ekleme durur. Kurum (organizasyon) sınırı değişmedi.
-- Eski istemciyle uyumlu, yeniden çalıştırılabilir.

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
                  -- Yönetici panelinden "Kurumsal · N mülk" olarak tanımlanan paket (Paket ver / Havale / Sanal POS): adet sınırdır.
                  when subscribed and s.product_id = 'kurumsal' and s.units is not null then s.units
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
