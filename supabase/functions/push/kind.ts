// Bildirim türü (sunucu kopyası). Uygulamadaki app/src/domain/notify-kind.js ile AYNI kurallar; tests/bildirim-turu.spec.mjs ikisini aynı örneklerle dener.
// Tür; telefonda çalan sesi (iOS: aps.sound) ve Android bildirim kanalını seçer. Uymayan bildirim 'genel': varsayılan ses ve 'evim' kanalı.
export const NOTIFY_KINDS = ['odeme', 'mesaj', 'talep', 'duyuru', 'hatirlatma', 'belge'];

const TAG: [RegExp, string][] = [
  [/^(rent-(soon|due|late)|aidat-|site-late-|trial-|renew-|contract-|deposit-due|dask-|evict-|bill-(issue|end|cancel)|sessiz-)/, 'hatirlatma'],
  [/^(pay-|paid-|receipt-|dekont-|bill-plan)/, 'odeme'],
  [/^(msg-|chat-|mesaj-)/, 'mesaj'],
  [/^(req-|talep-|hukuk-)/, 'talep'],
  [/^(duyuru-|poll-|oylama-|kurul-|proje-|ann-)/, 'duyuru'],
  [/^(doc-|belge-|rapor-|report-)/, 'belge'],
];
const URLS: [RegExp, string][] = [
  [/\/(mesajlar|sohbet)/, 'mesaj'],
  [/\/(odemeler|tahakkuk)/, 'odeme'],
  [/\/talepler/, 'talep'],
  [/\/(belgeler|sozlesmeler|rapor)/, 'belge'],
];
// Başlık sırası önemli: "Ödeme gecikti" hatırlatmadır, "Ödemen onaylandı" ödemedir.
const TITLE: [RegExp, string][] = [
  [/(yaklaşıyor|gecik|hatırlat|son gün|bitiyor|sona eriyor|günü geldi|vadesi|ödenmedi|bekleniyor)/i, 'hatirlatma'],
  [/(mesaj|yazdı)/i, 'mesaj'],
  [/(dekont|ödeme|ödendi|ödedi|tahsil|onaylandı|iade)/i, 'odeme'],
  [/(talep|arıza|şikâyet|şikayet)/i, 'talep'],
  [/(duyuru|genel kurul|oylama|yoklama|proje|toplantı)/i, 'duyuru'],
  [/(belge|sözleşme|tutanak|rapor|makbuz)/i, 'belge'],
];

/** Bildirimin türü: { tag, url, title } → 'odeme' | 'mesaj' | 'talep' | 'duyuru' | 'hatirlatma' | 'belge' | 'genel'. */
export function notifyKind(n: { tag?: string | null; url?: string | null; title?: string | null } | null | undefined): string {
  const tag = String(n?.tag || ''), url = String(n?.url || ''), title = String(n?.title || '');
  for (const [re, k] of TAG) if (re.test(tag)) return k;
  for (const [re, k] of URLS) if (re.test(url)) return k;
  for (const [re, k] of TITLE) if (re.test(title)) return k;
  return 'genel';
}

/** iOS ses dosyası adı (uygulama paketine gömülü) ya da varsayılan. */
export const apnsSound = (kind: string) => (NOTIFY_KINDS.includes(kind) ? kind + '.wav' : 'default');
/** Android kanalı: türün kanalı; eski sürüm uygulamada kanal yoksa Android varsayılan kanala ('evim') düşer. */
export const fcmChannel = (kind: string) => (NOTIFY_KINDS.includes(kind) ? kind : 'evim');
