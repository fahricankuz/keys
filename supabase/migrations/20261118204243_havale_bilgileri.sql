-- havale bilgileri
-- "Havale / EFT ile öde" ekranı: alıcı adı, IBAN, tutar ve açıklama kodu kopyalanabilir gösterilir.
--   * Mülk (kira): properties.bank_iban / bank_holder (mülk sahibi girer), properties.pay_code (açıklama kodu).
--   * Site (aidat): organizations.bank_iban / bank_holder ("Kurum bilgileri" yetkisiyle org_bank_save), site_units.pay_code.
-- Açıklama kodu: 6 karakter, büyük harf + rakam, karışan karakterler yok (0/O, 1/I). Ekstre eşleştirmesinde anahtar olarak kullanılacak.
-- Eski istemciyle uyumlu: yalnız sütun ekler; my_site_units yalnız yeni alan döndürür.

create or replace function public.gen_pay_code()
returns text language sql volatile set search_path = public as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') from generate_series(1, 6)
$$;

alter table public.properties add column if not exists bank_iban text;
alter table public.properties add column if not exists bank_holder text;
alter table public.properties add column if not exists pay_code text default public.gen_pay_code();
alter table public.properties drop constraint if exists properties_bank_iban_check;
alter table public.properties add constraint properties_bank_iban_check check (bank_iban is null or bank_iban ~ '^TR[0-9]{24}$');
alter table public.properties drop constraint if exists properties_bank_holder_check;
alter table public.properties add constraint properties_bank_holder_check check (bank_holder is null or length(bank_holder) <= 120);
create unique index if not exists properties_pay_code_key on public.properties (pay_code);

alter table public.site_units add column if not exists pay_code text default public.gen_pay_code();
create unique index if not exists site_units_pay_code_key on public.site_units (pay_code);

alter table public.organizations add column if not exists bank_iban text;
alter table public.organizations add column if not exists bank_holder text;
alter table public.organizations drop constraint if exists organizations_bank_iban_check;
alter table public.organizations add constraint organizations_bank_iban_check check (bank_iban is null or bank_iban ~ '^TR[0-9]{24}$');
alter table public.organizations drop constraint if exists organizations_bank_holder_check;
alter table public.organizations add constraint organizations_bank_holder_check check (bank_holder is null or length(bank_holder) <= 120);

/** Kurumun banka hesabı (sakinlere gösterilen havale bilgileri). Yalnız "Kurum bilgileri" (org.settings) yetkisi. Boş IBAN → kaldırır. */
create or replace function public.org_bank_save(oid uuid, iban text, holder text)
returns void language plpgsql security definer set search_path = public as $$
declare i text := upper(regexp_replace(coalesce(iban, ''), '[[:space:]]', '', 'g'));
begin
  if not public.org_can(oid, 'org.settings') then raise exception 'Bu işlem için yetkin yok' using errcode = '42501'; end if;
  if i <> '' and i !~ '^TR[0-9]{24}$' then raise exception 'IBAN geçersiz: TR ile başlayan 26 karakter olmalı' using errcode = '22023'; end if;
  update public.organizations set bank_iban = nullif(i, ''), bank_holder = nullif(btrim(coalesce(holder, '')), '') where id = oid;
end $$;
revoke execute on function public.org_bank_save(uuid, text, text) from public, anon;
grant execute on function public.org_bank_save(uuid, text, text) to authenticated;

create or replace function public.my_site_units()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'unit_id', u.id, 'org_id', o.id, 'org', o.name, 'sector', o.sector, 'block', u.block, 'no', u.no, 'area', u.area, 'aidat', u.aidat,
    'payer', u.payer, 'role', l.role, 'rent', u.rent,
    'payer_effective', public.site_payer(u.id), 'pays', public.site_payer(u.id) = l.role, 'currency', u.currency, 'turnover_rate', u.turnover_rate,
    'lease_start', u.lease_start, 'lease_end', u.lease_end,
    -- havale_bilgileri: yönetimin banka hesabı ve dairenin açıklama kodu (Havale / EFT bilgileri ekranı)
    'bank_iban', o.bank_iban, 'bank_holder', coalesce(nullif(o.bank_holder, ''), o.name), 'pay_code', u.pay_code,
    'deposit', case when u.deposit_amount is null then null else jsonb_build_object('amount', u.deposit_amount, 'currency', u.deposit_currency,
      'kind', u.deposit_kind, 'on', u.deposit_on, 'bank', u.deposit_bank, 'until', u.deposit_until,
      'returned_on', u.deposit_returned_on, 'returned', u.deposit_returned, 'cut_reason', u.deposit_cut_reason) end,
    'property_id', (select p.id from public.properties p where p.site_unit_id = u.id
                     and (p.owner_id = auth.uid() or exists (select 1 from public.memberships m where m.property_id = p.id and m.user_id = auth.uid()))
                     limit 1)) order by o.name, u.block, u.no), '[]'::jsonb)
  from (select unit_id, case when bool_or(role = 'malik') then 'malik' else 'kiraci' end as role
          from public.site_links(auth.uid()) group by unit_id) l
  join public.site_units u on u.id = l.unit_id join public.organizations o on o.id = u.org_id
$$;
grant execute on function public.my_site_units() to authenticated;
