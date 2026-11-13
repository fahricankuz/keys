-- sistem mesaji kapat
-- DİKKAT: BU MIGRATION YALNIZ YENİ SİTE (post_system_message kullanan istemci) YAYINA ÇIKTIKTAN SONRA UYGULANIR.
-- Yayındaki eski web istemcisi sistem satırlarını messages tablosuna doğrudan yazar; bu migration o yolu kapatır ve eski istemcinin
-- olay satırları (talep durumu, dekont bildirimi vb.) yazılamaz hale gelir. Sıra: 1) sistem_mesaji (önceki migration) 2) site yayını
-- 3) bu migration. Uygulamadan önce yayındaki sitenin yeni sürüm olduğunu doğrula (bundle'da post_system_message geçer).
-- Sonuç: from_role = 'system' satırı yalnız post_system_message (security definer) ve sunucu işlevleriyle (accept_invite vb.) yazılır;
-- doğrudan insert yalnız kendi tarafının rolüyle (kiracı / mülk sahibi) yapılabilir.
-- Yeniden çalıştırılabilir.

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (public.member_can(property_id, 'message')
              and by_user = (select auth.uid())
              and from_role = public.msg_side(property_id));
