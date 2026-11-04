-- Kira geçmişi belgesi
-- Kiracı, bağlı olduğu mülkün onaylanmış kira ödemelerinden bir dönem için belge üretir. Belgenin anlık görüntüsü saklanır ve
-- bir doğrulama koduyla herkese açık doğrulanır (anahtar.io/belge?kod=…): yeni ev sahibi ya da banka belgenin gerçek olduğunu görür.
-- Yalnız onaylı ödemeler girer; mülk sahibi onayı gerekmez. Mülk sahibinin soyadı kısaltılır.
-- Yeni tablo ve işlevler; eski kodla uyumlu, yeniden çalıştırılabilir.

create table if not exists public.rent_certificates (
  code        text primary key,
  property_id text not null references public.properties(id) on delete cascade,
  tenant_id   uuid not null references public.profiles(id) on delete cascade,
  from_month  text not null check (from_month ~ '^\d{4}-\d{2}$'),
  to_month    text not null check (to_month ~ '^\d{4}-\d{2}$'),
  data        jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists rent_certificates_tenant on public.rent_certificates (tenant_id, created_at desc);
alter table public.rent_certificates enable row level security;
drop policy if exists rc_read on public.rent_certificates;
create policy rc_read on public.rent_certificates for select to authenticated using (tenant_id = auth.uid() or public.is_admin());
-- Yazma yalnız aşağıdaki işlevle (security definer); doğrudan insert/update/delete politikası yok.

/** "Ayşe Yılmaz" → "Ayşe Y." */
create or replace function public.short_name(n text)
returns text language sql immutable as $$
  select case when position(' ' in btrim(coalesce(n, ''))) = 0 then btrim(coalesce(n, ''))
              else regexp_replace(btrim(n), '\s+(\S)\S*$', ' \1.') end
$$;

/** Kiracı belgesini üretir: dönemdeki onaylı kira ödemeleri, zamanında ödenen ay sayısı. Dönen: { code, data }. */
create or replace function public.create_rent_certificate(pid text, from_month text, to_month text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.properties; me public.profiles; landlord text; rows jsonb; c text; d jsonb; n int; ontime int; total numeric;
begin
  if auth.uid() is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  if public.member_role(pid) is distinct from 'tenant' then raise exception 'Yalnız mülkün kiracısı belge alabilir' using errcode = '42501'; end if;
  if from_month !~ '^\d{4}-\d{2}$' or to_month !~ '^\d{4}-\d{2}$' or from_month > to_month then
    raise exception 'Dönem geçersiz' using errcode = '22023';
  end if;
  select * into p from public.properties where id = pid;
  select * into me from public.profiles where id = auth.uid();
  select public.short_name(pr.name) into landlord from public.profiles pr where pr.id = p.owner_id;
  select coalesce(jsonb_agg(jsonb_build_object('month', y.month, 'amount', y.amount, 'paid_on', y.paid_on,
           'on_time', y.paid_on is not null and y.paid_on <= (to_date(y.month, 'YYYY-MM') + (least(greatest(coalesce(p.due_day, 1), 1), 28) - 1)))
           order by y.month), '[]'::jsonb),
         count(*), count(*) filter (where y.paid_on is not null and y.paid_on <= (to_date(y.month, 'YYYY-MM') + (least(greatest(coalesce(p.due_day, 1), 1), 28) - 1))),
         coalesce(sum(y.amount), 0)
    into rows, n, ontime, total
    from public.payments y
   where y.property_id = pid and y.kind = 'kira' and y.status = 'approved' and y.month between from_month and to_month;
  d := jsonb_build_object('tenant', me.name, 'property', p.name, 'addr', p.addr, 'landlord', landlord,
         'from', from_month, 'to', to_month, 'rows', rows, 'months', n, 'on_time', ontime, 'total', total, 'issued_at', now());
  c := upper(substr(md5(gen_random_uuid()::text), 1, 10));
  insert into public.rent_certificates (code, property_id, tenant_id, from_month, to_month, data) values (c, pid, auth.uid(), from_month, to_month, d);
  return jsonb_build_object('code', c, 'data', d);
end $$;
grant execute on function public.create_rent_certificate(text, text, text) to authenticated;

/** Herkese açık doğrulama: kod geçerliyse belgenin anlık görüntüsü (kod 10 hanelidir, tahmin edilemez). */
create or replace function public.verify_rent_certificate(cert text)
returns jsonb language sql stable security definer set search_path = public as $$
  select data || jsonb_build_object('code', code) from public.rent_certificates
   where code = upper(btrim(coalesce(cert, ''))) and length(btrim(coalesce(cert, ''))) = 10
$$;
grant execute on function public.verify_rent_certificate(text) to anon, authenticated;
