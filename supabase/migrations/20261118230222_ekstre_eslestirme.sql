-- ekstre eslestirme
-- Banka ekstresinden aidat ve kira tahsilatı: yönetici ekstreyi yükler, uygulama gelen ödemeleri dairelerin açıklama koduna
-- (havale_bilgileri → site_units.pay_code) ve kişi adına göre eşleştirir; yönetici onaylayınca ödeme işlenir.
-- Dosya ve açıklama metni saklanmaz: yalnız hareketin parmak izi (tarih, tutar, açıklama ve dekont no'dan istemcide üretilen özet),
-- tarihi, tutarı ve kapattığı tahakkuklar tutulur; aynı hareket ikinci kez işlenemez.
-- Yeni tablo ve işlev; eski kodla uyumlu, yeniden çalıştırılabilir.

create table if not exists public.site_bank_txns (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  fp          text not null check (fp ~ '^[0-9a-f]{16}$'),
  txn_date    date not null,
  amount      numeric not null check (amount > 0),
  bank        text not null default '' check (length(bank) <= 40),
  charge_ids  uuid[] not null default '{}',
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (org_id, fp)
);
alter table public.site_bank_txns enable row level security;
drop policy if exists not_banned on public.site_bank_txns;
create policy not_banned on public.site_bank_txns as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned());
drop policy if exists sbt_read on public.site_bank_txns;
create policy sbt_read on public.site_bank_txns for select to authenticated
  using (public.org_can(org_id, 'payments.approve') or public.is_admin());
-- Yazma yalnız site_bank_apply ile (tahakkuk güncellemesiyle aynı işlemde).
grant select on public.site_bank_txns to authenticated;

/** Ekstredeki bir gelen ödemeyi işler: tahakkukların ödenen tutarına ekler (tamamlanırsa "ödendi"), ödeme tarihi işlem tarihi,
    yöntem havale. Yetki: "Dekont onayı". Tahakkuklar kurumun olmalı ve açık (open / partial / rejected / review) olmalı;
    dağıtılan toplam hareket tutarını aşamaz. Aynı parmak izi ikinci kez gelirse hiçbir şey değişmez ve false döner. */
create or replace function public.site_bank_apply(oid uuid, fp text, txn_date date, amount numeric, bank text, charge_ids uuid[], amounts numeric[])
returns boolean language plpgsql security definer set search_path = public as $$
declare i int; ch public.site_charges; total numeric := 0; newpaid numeric;
begin
  if not public.org_can(oid, 'payments.approve') then raise exception 'Bu işlem için yetkin yok' using errcode = '42501'; end if;
  if coalesce(array_length(charge_ids, 1), 0) = 0 or array_length(charge_ids, 1) <> coalesce(array_length(amounts, 1), 0) then
    raise exception 'Eşleşen tahakkuk yok' using errcode = '22023'; end if;
  if amount is null or amount <= 0 then raise exception 'Tutar geçersiz' using errcode = '22023'; end if;
  for i in 1 .. array_length(amounts, 1) loop
    if amounts[i] is null or amounts[i] <= 0 then raise exception 'Tutar geçersiz' using errcode = '22023'; end if;
    total := total + amounts[i];
  end loop;
  if total > amount + 0.005 then raise exception 'Dağıtılan tutar ödemeyi aşıyor' using errcode = '22023'; end if;
  insert into public.site_bank_txns (org_id, fp, txn_date, amount, bank, charge_ids)
  values (oid, site_bank_apply.fp, site_bank_apply.txn_date, site_bank_apply.amount, left(coalesce(bank, ''), 40), site_bank_apply.charge_ids)
  on conflict on constraint site_bank_txns_org_id_fp_key do nothing;
  if not found then return false; end if;
  for i in 1 .. array_length(charge_ids, 1) loop
    select * into ch from public.site_charges c where c.id = charge_ids[i] and c.org_id = oid for update;
    if not found or ch.status not in ('open','partial','rejected','review') then
      raise exception 'Tahakkuk bulunamadı ya da zaten ödenmiş' using errcode = '22023'; end if;
    newpaid := case when ch.status = 'partial' then ch.paid_amount else 0 end + amounts[i];
    update public.site_charges set status = case when newpaid >= ch.amount then 'paid' else 'partial' end, paid_amount = newpaid,
           paid_on = site_bank_apply.txn_date, method = 'havale', reject_reason = null, updated_at = now()
     where id = ch.id;
  end loop;
  return true;
end $$;
revoke execute on function public.site_bank_apply(uuid, text, date, numeric, text, uuid[], numeric[]) from public, anon;
grant execute on function public.site_bank_apply(uuid, text, date, numeric, text, uuid[], numeric[]) to authenticated;
