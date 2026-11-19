-- ekstre kira
-- Bireysel mülk sahibi için banka ekstresinden kira (ve kiracının ödediği aidat) tahsilatı: kurum panelindeki ekstre_eslestirme'nin
-- mülk sahibi karşılığı. Eşleşen ödeme payments satırına "havale" olarak yazılır (tam ise onaylı, değilse kısmi).
-- Dosya ve açıklama saklanmaz: yalnız parmak izi, tarih, tutar ve kapatılan aylar. Aynı hareket aynı mülk sahibinde ikinci kez işlenmez.
-- Yeni tablo ve işlev; eski kodla uyumlu, yeniden çalıştırılabilir.

create table if not exists public.rent_bank_txns (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  property_id text not null references public.properties(id) on delete cascade,
  fp          text not null check (fp ~ '^[0-9a-f]{16}$'),
  txn_date    date not null,
  amount      numeric not null check (amount > 0),
  bank        text not null default '' check (length(bank) <= 40),
  refs        text[] not null default '{}',
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  unique (owner_id, fp)
);
create index if not exists rent_bank_txns_prop on public.rent_bank_txns (property_id);
alter table public.rent_bank_txns enable row level security;
drop policy if exists not_banned on public.rent_bank_txns;
create policy not_banned on public.rent_bank_txns as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned());
drop policy if exists rbt_read on public.rent_bank_txns;
create policy rbt_read on public.rent_bank_txns for select to authenticated
  using (owner_id = (select auth.uid()) or public.member_can(property_id, 'decide') or public.is_admin());
grant select on public.rent_bank_txns to authenticated;

/** Ekstredeki bir gelen ödemeyi mülkün kira / aidat aylarına işler. Yetki: mülkte karar yetkisi (mülk sahibi ya da emlakçı).
    kinds[i] 'kira' | 'aidat', months[i] 'YYYY-MM', amounts[i] bu harekette o aya düşen tutar, complete[i] ay tamamlanıyor mu
    (beklenen tutarı uygulama hesaplar: kira artışı, stopaj). Onaylanmış ay değiştirilemez; dağıtılan toplam hareketi aşamaz.
    Aynı parmak izi ikinci kez gelirse hiçbir şey değişmez ve false döner. */
create or replace function public.rent_bank_apply(pid text, fp text, txn_date date, amount numeric, bank text,
                                                  kinds text[], months text[], amounts numeric[], complete boolean[])
returns boolean language plpgsql security definer set search_path = public as $$
declare i int; n int := coalesce(array_length(months, 1), 0); owner uuid; total numeric := 0; cur public.payments; base numeric; rlist text[] := '{}';
begin
  if not public.member_can(pid, 'decide') then raise exception 'Bu işlem için yetkin yok' using errcode = '42501'; end if;
  if n = 0 or coalesce(array_length(kinds, 1), 0) <> n or coalesce(array_length(amounts, 1), 0) <> n or coalesce(array_length(complete, 1), 0) <> n then
    raise exception 'Eşleşen ay yok' using errcode = '22023'; end if;
  if amount is null or amount <= 0 then raise exception 'Tutar geçersiz' using errcode = '22023'; end if;
  for i in 1 .. n loop
    if kinds[i] not in ('kira','aidat') or months[i] !~ '^\d{4}-(0[1-9]|1[0-2])$' or amounts[i] is null or amounts[i] <= 0 then
      raise exception 'Ay ya da tutar geçersiz' using errcode = '22023'; end if;
    total := total + amounts[i];
    rlist := rlist || (kinds[i] || ':' || months[i]);
  end loop;
  if total > amount + 0.005 then raise exception 'Dağıtılan tutar ödemeyi aşıyor' using errcode = '22023'; end if;
  select owner_id into owner from public.properties where id = pid;
  insert into public.rent_bank_txns (owner_id, property_id, fp, txn_date, amount, bank, refs)
  values (owner, pid, rent_bank_apply.fp, rent_bank_apply.txn_date, rent_bank_apply.amount, left(coalesce(bank, ''), 40), rlist)
  on conflict on constraint rent_bank_txns_owner_id_fp_key do nothing;
  if not found then return false; end if;
  for i in 1 .. n loop
    select * into cur from public.payments p where p.property_id = pid and p.month = months[i] and p.kind = kinds[i] for update;
    if found and cur.status = 'approved' then raise exception 'Bu ay zaten onaylanmış' using errcode = '22023'; end if;
    base := case when found and cur.status = 'partial' then coalesce(cur.amount, 0) else 0 end;
    insert into public.payments (property_id, month, kind, status, amount, paid_on, method, approved_at, reject_reason, updated_at)
    values (pid, months[i], kinds[i], case when complete[i] then 'approved' else 'partial' end, base + amounts[i], rent_bank_apply.txn_date, 'havale',
            case when complete[i] then now() end, null, now())
    on conflict (property_id, month, kind) do update set status = excluded.status, amount = excluded.amount, paid_on = excluded.paid_on,
      method = 'havale', approved_at = excluded.approved_at, reject_reason = null, updated_at = now();
  end loop;
  return true;
end $$;
revoke execute on function public.rent_bank_apply(text, text, date, numeric, text, text[], text[], numeric[], boolean[]) from public, anon;
grant execute on function public.rent_bank_apply(text, text, date, numeric, text, text[], text[], numeric[], boolean[]) to authenticated;
