-- depolama sınırları (üretim öncesi güvenlik denetimi, 2026-11-13)
-- Sorunlar: (1) evim kovasında sunucu tarafı boyut ve tür sınırı yoktu (yalnız istemci denetliyordu); (2) site klasöründe (site-<kurum>/) sakin,
-- yönetimin yüklediği her dosyayı ve başka sakinlerin dekontlarını okuyabiliyordu; salt okur kurum rolleri yazabiliyordu; (3) kullanıcı başına kota yoktu;
-- (4) evim_read/_write/_delete politikaları klasör adını mülk kimliği sayıyordu: "site-<kurum>" ya da "hukuk-<kullanıcı>" adlı bir mülk açan kişi
-- o klasörün üyesi/sahibi olurdu (yetki_duzeltmeleri kimlik önekini yasakladı; bu politikalar da öneklere artık hiç eşleşmez).
-- Yeniden çalıştırılabilir. Kova ayarı yalnız storage.buckets'ta sütunlar varsa yazılır (yerel testlerdeki yalın şemada yok).

-- ---------------------------------------------------------------------
-- 1. Kova sınırları: dosya başına 10 MB; uygulamanın yüklediği türler (app-ui/media.ts, backend.js → extOf):
--    görseller (jpeg, png, webp; heic/heif telefon fotoğrafı yedeği), PDF, talep ekleri için videolar (mp4, m4v, mov, webm).
--    Genel (global) dosya sınırı Storage ayarlarında 10 MB'tan büyük olmalıdır (varsayılan 50 MB). Kova sınırı genel sınırdan küçük olmalıdır.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit')
     and exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    update storage.buckets
       set file_size_limit = 10485760,
           allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
                                      'video/mp4', 'video/x-m4v', 'video/quicktime', 'video/webm']
     where id = 'evim';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Mülk klasörleri: kimliği "site-" ya da "hukuk-" ile başlayan klasörler mülk sayılmaz
--    (üyelik/sahiplik denetimi bu öneklerde hiçbir zaman doğru dönmez; kendi yüklediğin dosyayı okuma ve yönetici okuması aynı kalır).
-- ---------------------------------------------------------------------
drop policy if exists evim_read on storage.objects;
create policy evim_read on storage.objects for select to authenticated
  using (bucket_id = 'evim' and (public.is_admin() or owner = (select auth.uid())
    or ((storage.foldername(name))[1] !~* '^(site|hukuk)-'
        and public.is_member((storage.foldername(name))[1])
        and public.file_review_ok(storage.objects.name))));

drop policy if exists evim_write on storage.objects;
create policy evim_write on storage.objects for insert to authenticated
  with check (bucket_id = 'evim' and (storage.foldername(name))[1] !~* '^(site|hukuk)-' and public.is_member((storage.foldername(name))[1]));

drop policy if exists evim_delete on storage.objects;
create policy evim_delete on storage.objects for delete to authenticated
  using (bucket_id = 'evim' and (storage.foldername(name))[1] !~* '^(site|hukuk)-'
         and public.is_owner((storage.foldername(name))[1]) and not public.file_in_locked_inspect(name));

-- ---------------------------------------------------------------------
-- 3. Site klasörü (site-<kurum>/<dosya>)
--    Okuma: kurum üyeleri klasörün tamamını (tablolardaki okuma kurallarıyla aynı); sakin yalnız kendi yüklediklerini (evim_read: sahibi) ve
--    kendisine görünen kayıtlara bağlı dosyaları: herkese açık / kendi dairesine açık belgeler, kendi dairesinin dekontları, proje belgeleri ve
--    fotoğrafları, kendi talebinin ekleri, yönetimin kendi talebine yazdığı ekler, paylaşıma açılmış gider belgeleri. Küçük kopya (".k") asıl dosyanın kuralına bağlıdır.
--    Yazma: yönetimde dosya yükleyen bir yetkiye (belge, tahakkuk, ödeme onayı, gider, proje, talep) sahip kişi ve siteye bağlı sakin;
--    tek seviyeli yol (site-<kurum>/<ad>); salt okur kurum rolleri yükleyemez.
-- ---------------------------------------------------------------------
create or replace function public.site_file_read_ok(fname text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare folder text := split_part(coalesce(fname, ''), '/', 1); oid uuid; base text;
begin
  if auth.uid() is null or folder !~ '^site-[0-9a-f-]{36}$' or position('/' in fname) = 0 then return false; end if;
  oid := substr(folder, 6)::uuid;
  base := regexp_replace(fname, '\.k$', '');
  if public.is_org_member(oid) then return true; end if;
  if not public.is_site_resident(oid) then return false; end if;
  return exists (select 1 from public.site_documents d where d.org_id = oid and d.path in (fname, base)
                  and (d.audience = 'herkes' or (d.audience = 'daire' and public.site_linked(oid, d.unit_id))))
      or exists (select 1 from public.site_charges c where c.org_id = oid and c.receipt_path in (fname, base) and public.site_role(c.unit_id) is not null)
      or exists (select 1 from public.site_project_costs c where c.org_id = oid and c.file in (fname, base))
      or exists (select 1 from public.site_project_updates u where u.org_id = oid and (fname = any (u.photos) or base = any (u.photos)))
      or exists (select 1 from public.site_projects p where p.org_id = oid and p.cover in (fname, base) and not (p.kind <> 'proje' and p.status = 'acildi'))
      or exists (select 1 from public.site_requests r where r.org_id = oid and r.user_id = auth.uid() and (fname = any (r.media) or base = any (r.media)))
      or exists (select 1 from public.site_request_messages m join public.site_requests r on r.id = m.request_id
                  where m.org_id = oid and r.user_id = auth.uid() and (fname = any (m.media) or base = any (m.media)))
      or exists (select 1 from public.site_expenses e join public.site_cash c on c.org_id = e.org_id
                  where e.org_id = oid and e.receipt_path in (fname, base) and coalesce(c.share_summary, false) and coalesce(c.share_receipts, false));
end $$;

create or replace function public.site_file_write_ok(fname text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare oid uuid;
begin
  if auth.uid() is null or coalesce(fname, '') !~ '^site-[0-9a-f-]{36}/[^/]+$' then return false; end if;
  oid := substr(split_part(fname, '/', 1), 6)::uuid;
  return public.org_can(oid, 'documents.manage') or public.org_can(oid, 'charges.manage') or public.org_can(oid, 'payments.approve')
      or public.org_can(oid, 'expenses.manage') or public.org_can(oid, 'projects.manage') or public.org_can(oid, 'requests.manage')
      or public.is_site_resident(oid);
end $$;

drop policy if exists site_files_read on storage.objects;
create policy site_files_read on storage.objects for select to authenticated
  using (bucket_id = 'evim' and public.site_file_read_ok(name));
drop policy if exists site_files_write on storage.objects;
create policy site_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'evim' and public.site_file_write_ok(name));

-- ---------------------------------------------------------------------
-- 4. Kullanıcı başına kota: yüklediği (owner) dosyaların toplamı 1 GiB ya da 3000 dosya olunca yeni yükleme reddedilir.
--    Yumuşak sınırdır: denetim yükleme başlarken var olan toplam üzerinden yapılır (yeni dosyanın boyutu o an bilinmez); aşım en çok
--    eşzamanlı yükleme sayısı × 10 MB kadardır. storage.objects'ta tetikleyici kurulamaz (tablo supabase_storage_admin'in), bu yüzden politika.
--    Bedel: yükleme başına kullanıcının dosyaları üzerinde bir toplama (indeks yok; bugün 44 dosya).
-- ---------------------------------------------------------------------
create or replace function public.storage_quota_ok() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare n int; used bigint;
begin
  if auth.uid() is null then return true; end if;
  select count(*), coalesce(sum(coalesce((to_jsonb(o) -> 'metadata' ->> 'size')::bigint, 0)), 0) into n, used
    from storage.objects o where o.bucket_id = 'evim' and o.owner = auth.uid();
  return n < 3000 and used < 1073741824;
end $$;

drop policy if exists evim_quota on storage.objects;
create policy evim_quota on storage.objects as restrictive for insert to authenticated
  with check (bucket_id <> 'evim' or public.storage_quota_ok());
