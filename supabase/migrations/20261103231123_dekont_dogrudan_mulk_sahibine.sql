-- Dekont doğrudan mülk sahibine
-- Kiracının yüklediği kira ve aidat dekontu artık anahtar yöneticisinin denetimine (reviews) düşmez; yüklendiği anda mülk
-- sahibi (ve yetkili ekip) görür, "dekont geldi" bildirimi hemen gider, onay ya da ret kararını mülk sahibi verir.
-- Belge ve fatura denetimi değişmedi.
-- Açıkta kalan dekont denetimleri: bekleyenler onaylanır (mülk sahibi o an görür ve bildirim alır), reddedilmişler silinir
-- (kiracı yeniden yüklediğinde mülk sahibinden gizlenmesin). Eski kodla uyumludur; yeniden çalıştırılabilir.

-- 1. Dekont yüklemesi denetim kaydı açmaz.
create or replace function public.track_payment_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  return new;
end $$;

-- 2. "Dekont geldi" bildirimi yükleme anında mülk sahibine (önceden yönetici onayından sonra gidiyordu).
create or replace function public.on_payment_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pname text := public.prop_name(new.property_id);
  lurl  text := '#/mulk-sahibi/mulk/' || new.property_id || '/odeme';
begin
  if new.status in ('review','partial') and public.member_role(new.property_id) is distinct from 'landlord'
     and (tg_op = 'INSERT'
          or old.status is distinct from new.status
          or new.receipt_path is distinct from old.receipt_path
          or new.receipt_name is distinct from old.receipt_name
          or new.amount is distinct from old.amount) then
    perform public.notify_members(new.property_id, 'landlord', pname || ': dekont geldi',
      new.month || case when new.kind = 'aidat' then ' aidatı' else ' kirası' end
        || ' için ' || public.fmt_tl(coalesce(new.amount, 0)) || ' ödendi.',
      '#/kiraci/odemeler', lurl);
  elsif new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    perform public.notify_members(new.property_id, 'tenant', 'Ödemen onaylandı',
      new.month || case when new.kind = 'aidat' then ' aidatı' else ' kirası' end || ' onaylandı.', '#/kiraci/odemeler', lurl);
  elsif new.status = 'rejected' and (tg_op = 'INSERT' or old.status is distinct from 'rejected') then
    perform public.notify_members(new.property_id, 'tenant', 'Dekont reddedildi',
      coalesce(new.reject_reason, 'Mülk sahibi dekontu onaylamadı.'), '#/kiraci/odemeler', lurl);
  end if;
  return new;
end $$;

-- 3. Açıkta kalan dekont denetimleri.
update public.reviews set status = 'approved', note = null where kind = 'payment' and status = 'pending';
delete from public.reviews where kind = 'payment' and status = 'rejected';
