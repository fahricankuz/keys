-- sistem mesaji
-- Sorun: sohbetteki olay satırları ("Talep durumu: …", "… kirası onaylandı") from_role = 'system' ile istemciden doğrudan yazılıyordu; ekleme
-- politikası system satırına her üyeye izin verdiği için üyenin herkese "sistem" görünümlü, istediği metni yazabilmesi mümkündü.
-- Bu migration: post_system_message(p_property, p_kind, p_payload). İşlev (1) oturum ve askı denetler, (2) çağıranın mülkte mesaj yazma yetkisini
-- (member_can 'message', eski ekleme politikasıyla aynı), (3) türün bilinen 23 türden biri olduğunu, (4) olayı çağıranın tarafının yapabildiğini
-- (ör. kiracı ekleme / çıkarma, yenileme teklifi mülk sahibi tarafının; talebi kapatma ve teklifi kabul kiracının), (5) metnin türün kalıbına
-- (Türkçe ya da İngilizce) uyduğunu denetler ve satırı çağıranın kimliğiyle (by_user) yazar: engelleyen kişi engellediğinin satırını göremez
-- (messages_select, migration yetki_duzeltmeleri). Kalıplar app/src/domain/system-message.js ile birebir aynıdır.
-- Eski istemci (doğrudan insert) çalışmaya devam eder: messages_insert'teki system dalı bu migrationda KALIR; yeni istemci yalnız bu işlevi kullanır.
-- Dal, bu PR'ın DIŞINDA bekleyen specs/followup-migrations/20261113141559_sistem_mesaji_kapat.sql ile kaldırılır; o migration yeni site yayına çıktıktan en az 24 saat sonra,
-- ikinci bir PR'la uygulanır (README.md orada).
-- Yeniden çalıştırılabilir.

create or replace function public.post_system_message(p_property text, p_kind text, p_payload jsonb default '{}'::jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  d constant text := '[^\n\r]{1,240}';        -- olaya bağlı değişken parça (başlık, ad, tutar, ay)
  v_side text;
  v_pat text;
  v_text text := p_payload ->> 'text';
  v_id text := coalesce(nullif(p_payload ->> 'id', ''), gen_random_uuid()::text);
  v_req text := nullif(p_payload ->> 'req', '');
  v_at timestamptz;
begin
  if uid is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  if public.is_banned() then raise exception 'Hesap askıya alındı' using errcode = '42501'; end if;
  if p_property is null or not public.member_can(p_property, 'message') then
    raise exception 'Bu mülkte mesaj yazma yetkin yok' using errcode = '42501';
  end if;

  select k.side, replace(k.pattern, '{D}', d) into v_side, v_pat
    from (values
      ('request_status',    null,       '^(Talep durumu|Request status): {D}$'),
      ('request_decision',  null,       '^(Ek talep|Extra request): {D}$'),
      ('cost_approved',     null,       '^(Masraf paylaşımı onaylandı|Cost split approved): {D}$'),
      ('cost_proposed',     null,       '^(Masraf önerisi|Cost proposal): {D}$'),
      ('request_closed',    'tenant',   '^(Talep kapatıldı|Request closed): {D}$'),
      ('request_opened',    null,       '^(Yeni talep açıldı|New request opened): {D}$'),
      ('payment_approved',  'landlord', '^{D} (aidatı onaylandı|kirası onaylandı|dues approved|rent approved)$'),
      ('payment_uploaded',  null,       '^{D} (aidatı için dekont yüklendi|kirası için dekont yüklendi|dues receipt uploaded|rent: receipt uploaded)( (\(kısmi|\(partial): {D}\))?$'),
      ('payment_rejected',  'landlord', '^{D} (dekontu reddedildi|receipt rejected): {D}$'),
      ('document_uploaded', null,       '^{D} (yüklendi|uploaded): {D}$'),
      ('tenant_added',      'landlord', '^{D} (mülke kiracı olarak eklendi|was added as a tenant)$'),
      ('tenant_removed',    'landlord', '^{D} (mülkten çıkarıldı|was removed from the property)$'),
      ('quote_added',       null,       '^(Yeni usta teklifi|New contractor quote): {D}$'),
      ('vendor_chosen',     null,       '^(Talep için usta seçildi|Tradesperson chosen for request): {D}$'),
      ('invoice_added',     null,       '^(Talep faturası|Request invoice): {D}$'),
      ('renewal_offer',     'landlord', '^(Yenileme teklifi|Renewal offer): {D}$'),
      ('renewal_accepted',  'tenant',   '^(Yenileme teklifi kabul edildi|Renewal offer accepted): {D}$'),
      ('renewal_withdrawn', 'landlord', '^(Yenileme teklifi geri çekildi|Renewal offer withdrawn)$'),
      ('inspect_approved',  null,       '^(Giriş tutanağı (kiracı|mülk sahibi) tarafından onaylandı|Move-in report approved by the (tenant|landlord))$'),
      ('moveout_started',   null,       '^(Çıkış süreci başlatıldı ·|Move-out started ·) {D}$'),
      ('moveout_approved',  null,       '^(Çıkış hesabı (kiracı|mülk sahibi) tarafından onaylandı|Move-out settlement approved by the (tenant|landlord))( (· iade|· refund): {D})?$'),
      ('moveout_cancelled', null,       '^(Çıkış süreci iptal edildi|Move-out cancelled)$'),
      ('deposit_refunded',  'landlord', '^(Depozito iadesi yapıldı|Deposit refunded): {D}$')
    ) as k(kind, side, pattern)
   where k.kind = p_kind;
  if v_pat is null then raise exception 'Bilinmeyen sistem mesajı türü' using errcode = '22023'; end if;
  if v_side is not null and v_side <> public.msg_side(p_property) then
    raise exception 'Bu olayı bu taraf yapamaz' using errcode = '42501';
  end if;
  if v_text is null or v_text !~ v_pat then raise exception 'Sistem mesajı metni türüne uymuyor' using errcode = '22023'; end if;
  if v_id !~ '^[A-Za-z0-9_.:-]{1,64}$' then raise exception 'Geçersiz mesaj kimliği' using errcode = '22023'; end if;

  if v_req is not null and not exists (select 1 from public.requests r where r.id = v_req and r.property_id = p_property) then v_req := null; end if;
  begin v_at := (p_payload ->> 'at')::timestamptz; exception when others then v_at := null; end;
  if v_at is null or v_at > now() + interval '5 minutes' or v_at < now() - interval '7 days' then v_at := now(); end if;

  -- Aynı kimlik ikinci kez gelirse (eşitleme yarıda kesilip yeniden denenir) atlanır.
  insert into public.messages (id, property_id, from_role, by_user, body, at, req_id)
  values (v_id, p_property, 'system', uid, v_text, v_at, v_req)
  on conflict (id) do nothing;
  return v_id;
end $$;

revoke execute on function public.post_system_message(text, text, jsonb) from public, anon;
grant execute on function public.post_system_message(text, text, jsonb) to authenticated;
