-- yetki düzeltmeleri (üretim öncesi güvenlik denetimi, 2026-11-13)
-- Yeniden çalıştırılabilir. Eski istemciyle de çalışır: istemci yalnızca memberships.display_name/phone günceller, system mesajı yazmaya devam eder.
-- Bu dosyadaki her delik için tests/yetki-duzeltmeleri.sql.spec.mjs rol rol (kiracı, mülk sahibi, yönetici ekip üyesi, site sakini, anon) deneme yapar.

-- ---------------------------------------------------------------------
-- 1. Üyelik rolü yükseltme: kiracı kendi memberships satırını "landlord" yapabiliyordu.
--    Satırı kendi güncelleyebilir (politika aynı kaldı) ama yalnız ad ve telefon sütunlarını; rol, mülk, kullanıcı ve e-posta
--    istemciden değişmez. Tetikleyici ikinci kat: sunucu işlevleri (accept_invite vb., security definer) ve service_role geçer.
-- ---------------------------------------------------------------------
drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.memberships from authenticated;
grant update (display_name, phone) on public.memberships to authenticated;

create or replace function public.guard_membership() returns trigger
language plpgsql set search_path = public as $$
begin
  -- current_user: istemci isteğinde 'authenticated'; security definer işlevlerde işlevin sahibi; service_role'de 'service_role'.
  if current_user in ('authenticated', 'anon')
     and (new.role is distinct from old.role or new.property_id is distinct from old.property_id or new.user_id is distinct from old.user_id
          or new.email is distinct from old.email or new.created_at is distinct from old.created_at) then
    raise exception 'Üyelik rolü, mülkü ve kullanıcısı değiştirilemez' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.guard_membership() from public, anon;
drop trigger if exists guard_membership on public.memberships;
create trigger guard_membership before update on public.memberships for each row execute function public.guard_membership();

-- ---------------------------------------------------------------------
-- 2. site_report: oturumsuz çağrı yönetim denetimini atlıyordu (auth.uid() boşsa denetim yoktu).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.site_report(oid uuid, period text, ref date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d0 date := case when period = 'year' then date_trunc('year', ref)::date else date_trunc('month', ref)::date end;
  d1 date := case when period = 'year' then (date_trunc('year', ref) + interval '1 year')::date else (date_trunc('month', ref) + interval '1 month')::date end;
  m0 text := to_char(d0, 'YYYY-MM');
  m1 text := to_char(d1 - 1, 'YYYY-MM');
  yr int := extract(year from d0)::int;
begin
  -- Oturum şart: oturumsuz (anon) çağrı geçemez. Yalnız sunucu içi çağrılar (service_role, pg_cron, SQL) oturumsuz çalışır.
  if auth.uid() is null then
    if coalesce(nullif(current_setting('role', true), 'none'), session_user) not in ('service_role', 'postgres', 'supabase_admin')
       and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
      raise exception 'Oturum açılmamış' using errcode = '42501';
    end if;
  elsif not public.org_can(oid, 'reports.view') and not public.is_admin() then
    raise exception 'Rapor yetkin yok' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'org', (select name from public.organizations where id = oid),
    'sector', (select sector from public.organizations where id = oid),
    'period', period, 'from', d0, 'to', d1 - 1,
    'units', (select count(*) from public.site_units where org_id = oid),
    'charges', (select coalesce(jsonb_agg(x order by x.kind), '[]'::jsonb) from (
        select kind, sum(amount) as charged,
               sum(case when status = 'paid' then amount when status in ('partial') then paid_amount else 0 end) as collected
        from public.site_charges where org_id = oid and month between m0 and m1 group by kind) x),
    'expenses', (select coalesce(jsonb_agg(x order by x.total desc), '[]'::jsonb) from (
        select cat, sum(amount) as total from public.site_expenses where org_id = oid and spent_on >= d0 and spent_on < d1 group by cat) x),
    'budget', (select case when b.org_id is null then null else jsonb_build_object('year', b.year, 'approved_on', b.approved_on,
                 'items', b.items, 'total', (select coalesce(sum((i ->> 'amount')::numeric), 0) from jsonb_array_elements(b.items) i)) end
               from (select 1) one left join public.site_budgets b on b.org_id = oid and b.year = yr),
    'debtors', (select coalesce(jsonb_agg(x order by x.unpaid desc), '[]'::jsonb) from (
        select public.unit_label(unit_id) as unit, sum(amount - case when status = 'partial' then paid_amount else 0 end) as unpaid
        from public.site_charges where org_id = oid and status <> 'paid' and month <= m1
          and (date_trunc('month', to_date(month, 'YYYY-MM')) + interval '1 month')::date <= least(d1, current_date)
        group by unit_id order by 2 desc limit 20) x),
    'requests', jsonb_build_object(
        'opened', (select count(*) from public.site_requests where org_id = oid and created_at >= d0 and created_at < d1),
        'open', (select count(*) from public.site_requests where org_id = oid and status < 3)),
    -- Dolar karşılıkları (rapor_dolar_karsiligi): her işlem kendi gününün TCMB satış kuruyla; TL kur farkı bilgi satırı.
    'usd', public.site_report_fx(oid, m0, m1, d0, d1, 'USD'),
    'fx_diff_try', (public.site_report_fx(oid, m0, m1, d0, d1, 'TRY') ->> 'fx_diff')::numeric);
end $function$;

-- ---------------------------------------------------------------------
-- 3. Engelleme: "system" mesajı engelleyen kişinin ekranında süzülmüyordu; engellenen kişi system rolüyle mesaj yazıp engeli aşabiliyordu.
--    Uygulama system mesajlarını (talep durumu, ödeme onayı vb.) hâlâ istemciden yazar; bu yüzden ekleme politikası aynı kalır,
--    okuma politikası ise artık by_user dolu her satırı (system dahil) engelleyen için gizler. Sunucunun yazdığı system mesajı
--    (by_user boş) herkese görünür.
-- ---------------------------------------------------------------------
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.is_member(property_id) and public.member_role(property_id) <> 'accountant'
         and (by_user is null or not exists (select 1 from public.user_blocks b where b.user_id = (select auth.uid()) and b.blocked = messages.by_user)));

-- ---------------------------------------------------------------------
-- 4. Belge: güncellemede WITH CHECK yoktu ve property_id değiştirilebiliyordu (belgeyi başkasının mülküne taşıyıp listesine sızdırma).
-- ---------------------------------------------------------------------
create or replace function public.guard_document_property() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.property_id is distinct from old.property_id then
    raise exception 'Belge başka bir mülke taşınamaz' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.guard_document_property() from public, anon;
drop trigger if exists guard_document_property on public.documents;
create trigger guard_document_property before update on public.documents for each row execute function public.guard_document_property();

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated
  using ((uploaded_by = (select auth.uid()))
         or ((public.is_owner(property_id) or public.member_role(property_id) = 'agent') and public.review_ok('document', property_id, id)))
  with check ((uploaded_by = (select auth.uid()) and public.is_member(property_id))
         or ((public.is_owner(property_id) or public.member_role(property_id) = 'agent') and public.review_ok('document', property_id, id)));

-- ---------------------------------------------------------------------
-- 5. Mülk kimliği: "site-<kurum>" ve "hukuk-<kullanıcı>" depolama klasörleriyle çakışabiliyordu (mülk kimliği = klasör adı;
--    böyle bir mülk açan kişi o klasörün "üyesi/sahibi" sayılıp dosyaları okuyup silebilirdi). Büyük/küçük harf duyarsız yasak.
--    Üretimde eşleşen satır yok (denetlendi); satır yoksa kural doğrulanır, varsa yalnız yeni ve değişen satırlara uygulanır.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'properties_id_onek' and conrelid = 'public.properties'::regclass) then
    alter table public.properties add constraint properties_id_onek check (id !~* '^(site|hukuk)-') not valid;
  end if;
  if not exists (select 1 from public.properties where id ~* '^(site|hukuk)-') then
    alter table public.properties validate constraint properties_id_onek;
  end if;
end $$;

-- properties.org_id istemciden verilebiliyordu: başkasının kurumuna mülk bağlanıp kurumun mülk sayısı/bildirimleri kirletilebilirdi.
-- İstemci yalnız kendisinin yöneticisi (master) olduğu etkin kuruma bağlayabilir; sunucu işlevleri ve service_role geçer.
create or replace function public.guard_property_org() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if new.org_id is null or (tg_op = 'UPDATE' and new.org_id is not distinct from old.org_id) then return new; end if;
  if exists (select 1 from public.org_members m join public.organizations o on o.id = m.org_id
              where m.user_id = new.owner_id and m.is_master and o.id = new.org_id and o.status = 'active') then
    return new;
  end if;
  raise exception 'Mülk bu kuruma bağlanamaz' using errcode = '42501';
end $$;
revoke execute on function public.guard_property_org() from public, anon;
drop trigger if exists guard_property_org on public.properties;
create trigger guard_property_org before insert or update of org_id on public.properties for each row execute function public.guard_property_org();

-- ---------------------------------------------------------------------
-- 6. team_remove: kendi kimliğini "member" verip başkasının "owner" kimliğini yazan kişi, o mülk sahibinin etkinlik akışına sahte
--    "ekip üyesi çıkarıldı" kaydı ekleyebiliyordu (hiçbir üyelik silinmese de). Kayıt artık yalnız gerçek bir silmede yazılır.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.team_remove(member uuid, owner uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare own uuid := coalesce(owner, auth.uid()); gone int;
begin
  if auth.uid() is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  if own <> auth.uid() and member <> auth.uid() then raise exception 'Yetki yok' using errcode = '42501'; end if;
  delete from public.team_members where owner_id = own and member_id = member;
  get diagnostics gone = row_count;
  delete from public.memberships m using public.properties p
   where m.property_id = p.id and p.owner_id = own and m.user_id = member and m.role in ('agent','accountant','staff');
  -- Etkinlik kaydı yalnız gerçekten bir ekip üyeliği kaldırıldıysa yazılır (başkasının akışına sahte kayıt eklenemez).
  if gone > 0 then
    perform public.log_activity(null, 'team', 'remove', member::text, '{}'::jsonb, own);
  end if;
end $function$;
