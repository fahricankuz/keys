-- site_residents.code sütununu istemciden gizle
-- DİKKAT: BU MIGRATION YALNIZ YENİ SİTE (kodu site_resident_code() ile okuyan istemci) yayına çıkıp en az 24 saat geçtikten SONRA uygulanır.
-- Yayındaki eski web istemcisi "select *" ve "insert ... returning *" ile site_residents okur; bu migration o yolları "permission denied" yapar.
-- Sıra: 1) davet_kodlari (site_resident_code işlevi ve yazma kısıtı) 2) site yayını 3) en az 24 saat sonra bu migration.
-- Uygulamadan önce doğrula: yayındaki sitenin paketinde site_resident_code geçer ve eski paket artık açılmıyor (hizmet çalışanı önbelleği güncellenmiş).
-- Sonuç: authenticated rolü code dışındaki sütunları okur; code yalnız site_resident_code(p_resident) ile ("Malik ve kiracılar" yetkisi) okunur.
-- Yazma kısıtı (code yazılamaz) davet_kodlari migrationında zaten vardır; burada yeniden verilir (yeniden çalıştırılabilir).
-- Yeni bir sütun eklenirse okuma listesine de eklenmelidir (tests/davet-kodlari.sql.spec.mjs bütün sütunların okunabildiğini denetler).
-- Yeniden çalıştırılabilir.

alter table public.site_residents add column if not exists mailed_at timestamptz;
revoke select, insert, update on public.site_residents from authenticated;
grant select (id, org_id, unit_id, user_id, role, name, phone, email, lives_here, created_at, invited_at, mailed_at) on public.site_residents to authenticated;
grant insert (org_id, unit_id, user_id, role, name, phone, email, lives_here, invited_at) on public.site_residents to authenticated;
grant update (org_id, unit_id, user_id, role, name, phone, email, lives_here, invited_at) on public.site_residents to authenticated;
