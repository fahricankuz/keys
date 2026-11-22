/* Bildirim türü: ses, Android kanalı ve uygulama içi simge bu türe göre seçilir.
   Tür sunucuda ayrı bir alan olarak tutulmaz; bildirimin etiketinden (tag), bağlantısından (url) ve başlığından çıkarılır.
   Aynı kurallar sunucuda da var (supabase/functions/_shared/notify-kind.ts); ikisi tests/bildirim-turu.spec.mjs ile birlikte denenir.
   Türler: odeme, mesaj, talep, duyuru, hatirlatma, belge; hiçbirine uymayan 'genel' (telefonun varsayılan sesi). */

export const NOTIFY_KINDS = ['odeme', 'mesaj', 'talep', 'duyuru', 'hatirlatma', 'belge'];

const TAG = [
  [/^(rent-(soon|due|late)|aidat-|site-late-|trial-|renew-|contract-|deposit-due|dask-|evict-|bill-(issue|end|cancel)|sessiz-)/, 'hatirlatma'],
  [/^(pay-|paid-|receipt-|dekont-|bill-plan)/, 'odeme'],
  [/^(msg-|chat-|mesaj-)/, 'mesaj'],
  [/^(req-|talep-|hukuk-)/, 'talep'],
  [/^(duyuru-|poll-|oylama-|kurul-|proje-|ann-)/, 'duyuru'],
  [/^(doc-|belge-|rapor-|report-)/, 'belge'],
];
const URLS = [
  [/\/(mesajlar|sohbet)/, 'mesaj'],
  [/\/(odemeler|tahakkuk)/, 'odeme'],
  [/\/talepler/, 'talep'],
  [/\/(belgeler|sozlesmeler|rapor)/, 'belge'],
];
// Başlık sırası önemli: "Ödeme gecikti" hatırlatmadır, "Ödemen onaylandı" ödemedir.
const TITLE = [
  [/(yaklaşıyor|gecik|hatırlat|son gün|bitiyor|sona eriyor|günü geldi|vadesi|ödenmedi|bekleniyor)/i, 'hatirlatma'],
  [/(mesaj|yazdı)/i, 'mesaj'],
  [/(dekont|ödeme|ödendi|ödedi|tahsil|onaylandı|iade)/i, 'odeme'],
  [/(talep|arıza|şikâyet|şikayet)/i, 'talep'],
  [/(duyuru|genel kurul|oylama|yoklama|proje|toplantı)/i, 'duyuru'],
  [/(belge|sözleşme|tutanak|rapor|makbuz)/i, 'belge'],
];

/** Bildirimin türü: { tag, url, title } → 'odeme' | 'mesaj' | 'talep' | 'duyuru' | 'hatirlatma' | 'belge' | 'genel'. */
export function notifyKind(n) {
  const tag = String(n?.tag || ''), url = String(n?.url || ''), title = String(n?.title || '');
  for (const [re, k] of TAG) if (re.test(tag)) return k;
  for (const [re, k] of URLS) if (re.test(url)) return k;
  for (const [re, k] of TITLE) if (re.test(title)) return k;
  return 'genel';
}
