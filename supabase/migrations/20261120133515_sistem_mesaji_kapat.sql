-- sistem mesaji kapat
-- Yeni istemci (post_system_message / site_resident_code kullanan) yayında; bu migration eski istemci yollarını kapatır.
-- Sonuç: from_role = 'system' satırı yalnız post_system_message (security definer) ve sunucu işlevleriyle (accept_invite vb.) yazılır;
-- Yeniden çalıştırılabilir.

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (public.member_can(property_id, 'message')
              and by_user = (select auth.uid())
              and from_role = public.msg_side(property_id));
