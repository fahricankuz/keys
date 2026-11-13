// anahtar — Supabase API anahtarlarının ortamdan okunması (Edge Function'lar). Saf modül: npm bağımlılığı yoktur,
// _shared/log.ts de bunu kullanır (log.ts testlerde npm: içe aktarmasız derlenir). İstemci üreten kısım: _shared/keys.ts.
//
// Supabase fonksiyon ortamına iki yeni değişken ekler: SUPABASE_SECRET_KEYS ve SUPABASE_PUBLISHABLE_KEYS. Değerleri düz
// metin değil, ada göre anahtar tutan JSON nesnesidir ({"default":"sb_secret_…"}); eski SUPABASE_SERVICE_ROLE_KEY ve
// SUPABASE_ANON_KEY düz metindi. Yeni değişken yoksa ya da boşsa eskisine düşülür, böylece eski JWT anahtarları
// kapatılmadan önce de kapatıldıktan sonra da aynı kod çalışır. Kaynak: Supabase "Migrating to publishable and secret API keys", 4. adım.

const env = (k: string) => Deno.env.get(k) ?? '';

/** JSON eşlemeden "default" girdisini, yoksa ilk dolu girdiyi alır; düz metin verilmişse onu döndürür; okunamazsa ''. */
function fromMap(raw: string): string {
  const s = raw.trim();
  if (!s) return '';
  if (!s.startsWith('{')) return /^(sb_|eyJ)/.test(s) ? s : '';   // düz metin yalnız anahtar biçimindeyse kabul edilir
  try {
    const m = JSON.parse(s) as Record<string, unknown>;
    if (typeof m.default === 'string' && m.default) return m.default;
    for (const v of Object.values(m)) if (typeof v === 'string' && v) return v;
  } catch { /* bozuk JSON: eski değişkene düşülür */ }
  return '';
}

/** Gizli (service) anahtar: SUPABASE_SECRET_KEYS, yoksa SUPABASE_SERVICE_ROLE_KEY. Her çağrıda okunur (testler ortamı değiştirir). */
export function secretKey(): string {
  return fromMap(env('SUPABASE_SECRET_KEYS')) || env('SUPABASE_SERVICE_ROLE_KEY');
}

/** Yayınlanabilir (anon) anahtar: SUPABASE_PUBLISHABLE_KEYS, yoksa SUPABASE_ANON_KEY. */
export function publishableKey(): string {
  return fromMap(env('SUPABASE_PUBLISHABLE_KEYS')) || env('SUPABASE_ANON_KEY');
}

/** Yeni biçimli anahtarlar (sb_secret_…, sb_publishable_…) JWT değildir. */
export const isOpaqueKey = (key: string) => key.startsWith('sb_');

/**
 * Ham fetch ile REST çağrısı yapılırken başlıklar. Yeni biçimli anahtar yalnız `apikey` başlığında gider
 * (Authorization: Bearer olarak JWT sanılıp reddedilir); eski JWT anahtarı iki başlıkta da gider.
 */
export function apiKeyHeaders(key: string): Record<string, string> {
  return isOpaqueKey(key) ? { apikey: key } : { apikey: key, authorization: `Bearer ${key}` };
}
