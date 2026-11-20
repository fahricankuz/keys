-- site_residents.code sütununu istemciden gizle
-- Yeni istemci (post_system_message / site_resident_code kullanan) yayında; bu migration eski istemci yollarını kapatır.
-- Sonuç: authenticated rolü code dışındaki sütunları okur; code yalnız site_resident_code(p_resident) ile ("Malik ve kiracılar" yetkisi) okunur.
-- Yazma kısıtı (code yazılamaz) davet_kodlari migrationında zaten vardır; burada yeniden verilir (yeniden çalıştırılabilir).
-- Yeni bir sütun eklenirse okuma listesine de eklenmelidir (tests/davet-kodlari.sql.spec.mjs bütün sütunların okunabildiğini denetler).
-- Yeniden çalıştırılabilir.

alter table public.site_residents add column if not exists mailed_at timestamptz;
revoke select, insert, update on public.site_residents from authenticated;
grant select (id, org_id, unit_id, user_id, role, name, phone, email, lives_here, created_at, invited_at, mailed_at) on public.site_residents to authenticated;
grant insert (org_id, unit_id, user_id, role, name, phone, email, lives_here, invited_at) on public.site_residents to authenticated;
grant update (org_id, unit_id, user_id, role, name, phone, email, lives_here, invited_at) on public.site_residents to authenticated;
