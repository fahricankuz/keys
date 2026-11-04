-- Belge ve fatura denetimsiz
-- Belgeler (sözleşme, DASK, poliçe…) ve talep faturaları artık anahtar yöneticisinin denetimine (reviews) düşmez: yüklendiği anda
-- mülkün diğer üyeleri görür ve bildirim hemen gider. Kötüye kullanım şikâyetle (content_reports) bildirilir.
-- Dosya değişince eski denetim kaydı silinir (önceden reddedilmiş bir belge ya da fatura yeniden yüklenince gizli kalmasın).
-- Açıkta bekleyen belge ve fatura denetimleri onaylanır (karşı taraf o an görür, bildirim alır); reddedilmişler gizli kalır.
-- Eski kodla uyumludur; yeniden çalıştırılabilir.

create or replace function public.track_document_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.path is distinct from old.path or new.name is distinct from old.name then
    delete from public.reviews where kind = 'document' and property_id = new.property_id and ref_id = new.id;
    perform public.notify_members(new.property_id, null, public.prop_name(new.property_id) || ': yeni belge', new.name,
      '#/kiraci/belgeler', '#/mulk-sahibi/mulk/' || new.property_id || '/belge', coalesce(new.uploaded_by, auth.uid()));
  end if;
  return new;
end $$;

create or replace function public.track_invoice_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.invoice is null then return new; end if;
  if tg_op = 'INSERT' or (new.invoice -> 'path') is distinct from (old.invoice -> 'path')
     or (new.invoice -> 'amount') is distinct from (old.invoice -> 'amount') then
    delete from public.reviews where kind = 'invoice' and property_id = new.property_id and ref_id = new.id;
    -- Faturayı mülk sahibi ya da (talep akışında) kiracı ekleyebilir: ekleyen dışındaki üyelere gider.
    perform public.notify_members(new.property_id, null, public.prop_name(new.property_id) || ': fatura eklendi',
      coalesce(new.invoice ->> 'name', 'fatura'), '#/kiraci/talepler/' || new.id, '#/mulk-sahibi/mulk/' || new.property_id || '/talep');
  end if;
  return new;
end $$;

update public.reviews set status = 'approved', note = null where kind in ('document', 'invoice') and status = 'pending';
