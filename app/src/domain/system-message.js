/* Sistem mesajı türleri (sohbette "Talep durumu: …", "… kirası onaylandı" gibi olay satırları).

   Sunucu bu satırların istemciden doğrudan yazılmasını (sistem_mesaji_kapat migration'ından sonra) reddeder: istemci post_system_message(p_property, p_kind, p_payload) işlevini
   çağırır; işlev çağıranın mülk üyesi olduğunu, türün bilinen bir tür olduğunu, çağıranın tarafının o olayı yapabileceğini ve metnin
   o türün kalıbına uyduğunu (Türkçe ya da İngilizce) denetler, satırı çağıranın kimliğiyle (by_user) yazar. Böylece engellenen kişi
   sistem satırı olarak engelleyene ulaşamaz. Kalıplar supabase/migrations → sistem_mesaji ile birebir aynıdır
   (tests/sistem-mesaji.sql.spec.mjs her türün örneklerini sunucuya gönderip karşılaştırır). */

import { isMissingRpc, rpcKnownMissing, markRpcMissing, forgetMissingRpc } from './rpc-missing.js';

const D = '[^\\n\\r]{1,240}';                      // olaya bağlı değişken parça (başlık, ad, tutar, ay)
const re = (s) => s.split('{D}').join(D);

/** side: olayı yapabilen taraf ('landlord': mülk sahibi/vekil, 'tenant': kiracı, yoksa ikisi de). examples: sunucu testinde kullanılır. */
export const SYSTEM_KINDS = {
  request_status:    { side: null, pattern: re('^(Talep durumu|Request status): {D}$'), examples: ['Talep durumu: Musluk · İşlemde', 'Request status: Tap · In progress'] },
  request_decision:  { side: null, pattern: re('^(Ek talep|Extra request): {D}$'), examples: ['Ek talep: Boya · Evet'] },
  cost_approved:     { side: null, pattern: re('^(Masraf paylaşımı onaylandı|Cost split approved): {D}$'), examples: ['Masraf paylaşımı onaylandı: Kiracı'] },
  cost_proposed:     { side: null, pattern: re('^(Masraf önerisi|Cost proposal): {D}$'), examples: ['Masraf önerisi: Paylaşımlı (Musluk)'] },
  request_closed:    { side: 'tenant', pattern: re('^(Talep kapatıldı|Request closed): {D}$'), examples: ['Talep kapatıldı: Musluk'] },
  request_opened:    { side: null, pattern: re('^(Yeni talep açıldı|New request opened): {D}$'), examples: ['Yeni talep açıldı: Musluk damlıyor'] },
  payment_approved:  { side: 'landlord', pattern: re('^{D} (aidatı onaylandı|kirası onaylandı|dues approved|rent approved)$'), examples: ['Kasım 2026 kirası onaylandı', 'Nov 2026 dues approved'] },
  payment_uploaded:  { side: null, pattern: re('^{D} (aidatı için dekont yüklendi|kirası için dekont yüklendi|dues receipt uploaded|rent: receipt uploaded)( (\\(kısmi|\\(partial): {D}\\))?$'),
                       examples: ['Kasım 2026 kirası için dekont yüklendi', 'Kasım 2026 kirası için dekont yüklendi (kısmi: ₺500,00)'] },
  payment_rejected:  { side: 'landlord', pattern: re('^{D} (dekontu reddedildi|receipt rejected): {D}$'), examples: ['Kasım 2026 dekontu reddedildi: Tutar eksik · not'] },
  document_uploaded: { side: null, pattern: re('^{D} (yüklendi|uploaded): {D}$'), examples: ['Kira sözleşmesi yüklendi: ev-kira-2026.pdf'] },
  tenant_added:      { side: 'landlord', pattern: re('^{D} (mülke kiracı olarak eklendi|was added as a tenant)$'), examples: ['Ayşe Yılmaz mülke kiracı olarak eklendi'] },
  tenant_removed:    { side: 'landlord', pattern: re('^{D} (mülkten çıkarıldı|was removed from the property)$'), examples: ['Ayşe Yılmaz mülkten çıkarıldı'] },
  quote_added:       { side: null, pattern: re('^(Yeni usta teklifi|New contractor quote): {D}$'), examples: ['Yeni usta teklifi: Usta Ali (₺1.200,00) · Musluk'] },
  vendor_chosen:     { side: null, pattern: re('^(Talep için usta seçildi|Tradesperson chosen for request): {D}$'), examples: ['Talep için usta seçildi: Usta Ali (₺1.200,00) · Musluk'] },
  invoice_added:     { side: null, pattern: re('^(Talep faturası|Request invoice): {D}$'), examples: ['Talep faturası: Musluk · ₺1.200,00'] },
  renewal_offer:     { side: 'landlord', pattern: re('^(Yenileme teklifi|Renewal offer): {D}$'), examples: ['Yenileme teklifi: ₺12.000,00 (yasal üst sınır ₺12.500,00)'] },
  renewal_accepted:  { side: 'tenant', pattern: re('^(Yenileme teklifi kabul edildi|Renewal offer accepted): {D}$'), examples: ['Yenileme teklifi kabul edildi: ₺12.000,00'] },
  renewal_withdrawn: { side: 'landlord', pattern: '^(Yenileme teklifi geri çekildi|Renewal offer withdrawn)$', examples: ['Yenileme teklifi geri çekildi'] },
  inspect_approved:  { side: null, pattern: '^(Giriş tutanağı (kiracı|mülk sahibi) tarafından onaylandı|Move-in report approved by the (tenant|landlord))$', examples: ['Giriş tutanağı kiracı tarafından onaylandı', 'Move-in report approved by the landlord'] },
  moveout_started:   { side: null, pattern: re('^(Çıkış süreci başlatıldı ·|Move-out started ·) {D}$'), examples: ['Çıkış süreci başlatıldı · 1 Aralık 2026'] },
  moveout_approved:  { side: null, pattern: re('^(Çıkış hesabı (kiracı|mülk sahibi) tarafından onaylandı|Move-out settlement approved by the (tenant|landlord))( (· iade|· refund): {D})?$'),
                       examples: ['Çıkış hesabı kiracı tarafından onaylandı', 'Çıkış hesabı mülk sahibi tarafından onaylandı · iade: ₺9.000,00'] },
  moveout_cancelled: { side: null, pattern: '^(Çıkış süreci iptal edildi|Move-out cancelled)$', examples: ['Çıkış süreci iptal edildi'] },
  deposit_refunded:  { side: 'landlord', pattern: re('^(Depozito iadesi yapıldı|Deposit refunded): {D}$'), examples: ['Depozito iadesi yapıldı: ₺9.000,00'] }
};

/** Metne uyan ilk tür (eski sürümden kalan, türü yazılmamış bekleyen mesajlar için). Uyan yoksa null. */
export function kindOfText(text){
  const s = String(text == null ? '' : text);
  for (const [kind, k] of Object.entries(SYSTEM_KINDS)) if (new RegExp(k.pattern).test(s)) return kind;
  return null;
}

/** Bekleyen sistem mesajlarını sunucuya yazar (mapping.js'in "rpc" işlemi; backend.js apply çağırır).
    Yeni şema: her mesaj post_system_message ile. Sunucuda işlev yoksa (yeni site migration'dan önce yayına çıkar) önceki yola düşülür:
    from_role = 'system' satırı doğrudan eklenir (op.fallbackRows: eski istemcinin yazdığı satır biçimi, aynı kimlik ikinci kez eklenmez).
    İşlevin yokluğu oturum boyunca hatırlanır. Doğrudan ekleme sonradan kapatılırsa (sistem_mesaji_kapat migration'ı) bir kez işlev yeniden denenir. */
export async function writeSystemMessages(sb, op){
  for (let pass = 0; pass < 2; pass++){
    if (!rpcKnownMissing(op.fn)){
      let gone = false;
      for (const call of op.calls){
        const res = await sb.rpc(op.fn, call);
        if (isMissingRpc(res)){ markRpcMissing(op.fn); gone = true; break; }
        if (res.error) throw res.error;
      }
      if (!gone) return;
    }
    if (!op.fallbackRows || !op.fallbackRows.length) return;
    const res = await sb.from('messages').upsert(op.fallbackRows, { ignoreDuplicates: true });
    if (!res.error) return;
    const denied = res.error.code === '42501' || /row-level security/i.test(String(res.error.message || ''));
    if (denied && pass === 0){ forgetMissingRpc(op.fn); continue; }
    throw res.error;
  }
}
