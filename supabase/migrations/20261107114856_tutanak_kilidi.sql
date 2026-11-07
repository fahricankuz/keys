-- Giriş tutanağı: iki taraf onaylayınca sistem tarafında kilitlenir.
--   * İki onaydan sonra property_shared.inspect (odalar, fotoğraflar, açıklamalar, onaylar) hiçbir kullanıcı tarafından değiştirilemez.
--   * Onay zamanı ve onaylayanın adı sunucuda yazılır (istemci gönderse de ezilir): tenantAt/tenantBy, landlordAt/landlordBy.
--   * İkisi de onaylayınca lockedAt (kilit zamanı) ve hash (içeriğin SHA-256 özeti) yazılır; onay geri alınırsa (kilit öncesi) silinir.
--   * Kilitli tutanaktaki fotoğraf dosyaları depodan silinemez.
-- Eski kodla uyumludur: yalnızca işlev ve politika günceller; eski onaylı (zaman damgasız) tutanaklar da kilitlenir.
-- Yeniden çalıştırılabilir.

/** İki taraf da onaylamış mı (kilitli tutanak). */
create or replace function public.inspect_locked(j jsonb)
returns boolean language sql immutable set search_path = public as $$
  select coalesce((j ->> 'tenantOk')::boolean, false) and coalesce((j ->> 'landlordOk')::boolean, false)
$$;

/** Depo yolu, kilitli bir giriş tutanağının fotoğrafıysa true (dosya silinemez). Yol: <ev kimliği>/<dosya>. */
create or replace function public.file_in_locked_inspect(fname text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.property_shared s
                  where s.property_id = split_part(fname, '/', 1)
                    and public.inspect_locked(s.inspect)
                    and position(fname in s.inspect::text) > 0)
$$;

drop policy if exists evim_delete on storage.objects;
create policy evim_delete on storage.objects for delete to authenticated
  using (bucket_id = 'evim' and public.is_owner((storage.foldername(name))[1]) and not public.file_in_locked_inspect(name));

-- Ortak alan koruması (önceki sürüm: baseline) + tutanak kilidi, onay zamanı ve özeti.
create or replace function public.guard_shared()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r text := case when public.member_role(new.property_id) = 'tenant' then 'tenant' else 'landlord' end;
  other_flag text;
  ins jsonb;
  side text;
  nm text;
begin
  if auth.uid() is null then new.updated_at := now(); return new; end if;
  if not public.member_can(new.property_id, 'shared') then
    raise exception 'Bu rol tutanak ve çıkış kaydını değiştiremez' using errcode = '42501';
  end if;
  if public.inspect_locked(old.inspect) and new.inspect is distinct from old.inspect then
    raise exception 'Giriş tutanağı iki tarafın onayıyla kilitlendi; değiştirilemez' using errcode = '42501';
  end if;
  other_flag := case when r = 'tenant' then 'landlordOk' else 'tenantOk' end;
  if coalesce((new.inspect ->> other_flag)::boolean, false)
     and not coalesce((old.inspect ->> other_flag)::boolean, false) then
    raise exception 'Karşı tarafın tutanak onayı verilemez' using errcode = '42501';
  end if;
  if new.move_out is not null then
    if coalesce((new.move_out ->> other_flag)::boolean, false)
       and not coalesce((old.move_out ->> other_flag)::boolean, false) then
      raise exception 'Karşı tarafın çıkış onayı verilemez' using errcode = '42501';
    end if;
    if r = 'tenant' and ((new.move_out -> 'deductions') is distinct from (old.move_out -> 'deductions')
                         or (new.move_out -> 'refunded') is distinct from (old.move_out -> 'refunded')) then
      raise exception 'Kesinti ve iadeyi yalnızca mülk sahibi girebilir' using errcode = '42501';
    end if;
  end if;
  if r = 'tenant' and old.move_out is not null and new.move_out is null then
    raise exception 'Çıkış sürecini yalnızca mülk sahibi iptal edebilir' using errcode = '42501';
  end if;
  if r = 'tenant' and new.renewal is distinct from old.renewal then
    if old.renewal is null or (old.renewal ->> 'status') <> 'sent' or (new.renewal ->> 'status') <> 'accepted'
       or (new.renewal - 'status') is distinct from (old.renewal - 'status') then
      raise exception 'Kiracı yenileme teklifini yalnızca kabul edebilir' using errcode = '42501';
    end if;
  end if;

  -- Onay zamanı ve adı: yalnızca kendi tarafının onayı yeni verildiğinde şimdi yazılır; eski onayların değeri korunur, geri alınanlar silinir.
  if not public.inspect_locked(old.inspect) then
    ins := coalesce(new.inspect, '{}'::jsonb);
    select coalesce(m.display_name, '') into nm from public.memberships m where m.property_id = new.property_id and m.user_id = auth.uid();
    foreach side in array array['tenant', 'landlord'] loop
      ins := ins - (side || 'At') - (side || 'By');
      if coalesce((ins ->> (side || 'Ok'))::boolean, false) then
        if coalesce((old.inspect ->> (side || 'Ok'))::boolean, false) then
          ins := ins || jsonb_strip_nulls(jsonb_build_object(side || 'At', old.inspect -> (side || 'At'), side || 'By', old.inspect -> (side || 'By')));
        elsif side = r then
          ins := ins || jsonb_build_object(side || 'At', to_jsonb(now()), side || 'By', coalesce(nm, ''));
        end if;
      end if;
    end loop;
    ins := ins - 'lockedAt' - 'hash';
    if public.inspect_locked(ins) then
      ins := ins || jsonb_build_object('lockedAt', to_jsonb(now()),
        'hash', encode(sha256(convert_to((ins - 'tenantAt' - 'tenantBy' - 'landlordAt' - 'landlordBy')::text, 'UTF8')), 'hex'));
    end if;
    new.inspect := ins;
  end if;
  new.updated_at := now();
  return new;
end $$;
