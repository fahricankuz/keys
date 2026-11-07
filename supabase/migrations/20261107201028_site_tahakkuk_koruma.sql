-- Site tahakkuk koruması ve bildirimi
-- 1) Tutarı sıfır ya da eksi olan tahakkuk yazılamaz (boş tutarla "Ek ödeme iste" 30 daireye ₺0'lık, hiç ödenemeyecek kayıt
--    açıyordu). Otomatik aidat ve kira işleri zaten yalnız sıfırdan büyük tutar yazar; eski kayıtlar etkilenmez (yalnız INSERT).
-- 2) Yönetim elle tahakkuk yazınca (ek ödeme, elle aidat) dairenin sakinlerine bildirim gider; formdaki "sakinler bildirim alır"
--    sözü bugüne kadar karşılanmıyordu. Otomatik aidat (oturumsuz zamanlanmış iş) bildirim üretmez; onun hatırlatmaları ayrıdır.
-- Yeni işlev ve tetikleyiciler; eski kodla uyumlu, yeniden çalıştırılabilir.

/** "2026-11" → "Kasım 2026" (bildirim metinleri için). */
create or replace function public.month_tr(m text)
returns text language sql immutable as $$
  select case when m ~ '^\d{4}-(0[1-9]|1[0-2])$'
    then (array['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'])[substr(m, 6, 2)::int]
         || ' ' || substr(m, 1, 4)
    else coalesce(m, '') end
$$;
revoke execute on function public.month_tr(text) from public, anon, authenticated;

/** Dairenin hesabı bağlı sakinleri: malik ve kiracı kayıtları ile daireye bağlı mülkün kiracısı (bildirim alıcıları). */
create or replace function public.site_unit_people(unit uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select r.user_id from public.site_residents r where r.unit_id = unit and r.user_id is not null
  union
  select m.user_id from public.properties p join public.memberships m on m.property_id = p.id and m.role = 'tenant'
   where p.site_unit_id = unit
$$;
revoke execute on function public.site_unit_people(uuid) from public, anon, authenticated;

/** Yeni tahakkukta tutar sıfırdan büyük olmalı. */
create or replace function public.guard_site_charge_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.amount is null or new.amount <= 0 then
    raise exception 'Tutar sıfırdan büyük olmalı' using errcode = '22023';
  end if;
  return new;
end $$;
revoke execute on function public.guard_site_charge_insert() from public, anon, authenticated;
drop trigger if exists guard_site_charge_insert on public.site_charges;
create trigger guard_site_charge_insert before insert on public.site_charges for each row execute function public.guard_site_charge_insert();

/** Yönetimin elle yazdığı tahakkuk: dairenin sakinlerine "yeni ödeme" bildirimi (yazan kişi hariç). */
create or replace function public.on_site_charge_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return null; end if;   -- zamanlanmış otomatik aidat ve kira
  insert into public.notifications (user_id, title, body, url)
  select u, 'Yeni ödeme: ' || public.unit_label(new.unit_id),
         public.month_tr(new.month) || ' ' || public.charge_word(new.kind, new.title) || ': ' || public.fmt_tl(new.amount),
         '/uygulama/odemeler'
  from public.site_unit_people(new.unit_id) u
  where u is distinct from auth.uid();
  return null;
end $$;
revoke execute on function public.on_site_charge_insert() from public, anon, authenticated;
drop trigger if exists on_site_charge_insert on public.site_charges;
create trigger on_site_charge_insert after insert on public.site_charges for each row execute function public.on_site_charge_insert();
