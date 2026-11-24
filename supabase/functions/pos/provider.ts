// anahtar — Sanal POS sağlayıcıları (saf; Deno ve Node'da çalışır, testler doğrudan içe aktarır).
// Sağlayıcıdan bağımsız arayüz: ödeme bağlantısı oluştur, ödemenin durumunu sağlayıcıdan sorgula. Ödeme onayı ASLA yalnız geri
// çağrıya (callback) güvenilerek verilmez: index.ts geri çağrı gelince durumu sağlayıcıdan yeniden sorar.
//
// Moka (Moka United) — sözleşme imzalanınca etkinleşir. Gizli değerler (Supabase → Edge Functions → Secrets; değerleri depoya yazılmaz):
//   MOKA_DEALER_CODE, MOKA_USERNAME, MOKA_PASSWORD   — üye işyeri bilgileri
//   MOKA_ENV                                         — 'test' (varsayılan) ya da 'live'
//   MOKA_LINK_PATH, MOKA_STATUS_PATH                 — ödeme bağlantısı ve durum sorgusu uç noktaları (Moka teknik belgesiyle doğrulanıp girilir)
// DOĞRULANMADI: istek/yanıt alan adları Moka'nın genel API kalıbına (DealerPaymentServiceRequest + PaymentDealerAuthentication,
// CheckKey = SHA-256(DealerCode + "MK" + Username + "PD" + Password)) göre yazıldı. Test hesabı gelince mokaLinkBody / mokaParse*
// Moka belgesine göre son kez ayarlanır ve test ortamında bir deneme ödemesiyle doğrulanır.

export type LinkInput = { ref: string; amount: number; description: string; email: string; name?: string; phone?: string; returnUrl: string; callbackUrl: string };
export type LinkResult = { url: string; providerRef?: string };
export type Status = { paid: boolean; providerRef?: string };
export type Env = (k: string) => string;

export interface PosProvider {
  id: string;
  configured(): boolean;
  createLink(i: LinkInput): Promise<LinkResult>;
  status(ref: string): Promise<Status>;
}

const MOKA_BASE: Record<string, string> = { test: 'https://service.refmoka.com', live: 'https://service.moka.com' };

async function sha256Hex(s: string): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Moka kimlik doğrulama bloğu. */
export async function mokaAuth(env: Env) {
  const dealer = env('MOKA_DEALER_CODE'), user = env('MOKA_USERNAME'), pass = env('MOKA_PASSWORD');
  return { DealerCode: dealer, Username: user, Password: pass, CheckKey: await sha256Hex(dealer + 'MK' + user + 'PD' + pass) };
}

/** Moka ödeme bağlantısı isteği gövdesi (tutar kuruş değil TL, iki ondalık). */
export async function mokaLinkBody(env: Env, i: LinkInput) {
  return {
    PaymentDealerAuthentication: await mokaAuth(env),
    PaymentDealerRequest: {
      Amount: Number(i.amount.toFixed(2)), Currency: 'TL', OtherTrxCode: i.ref, Description: i.description.slice(0, 200),
      CustomerInformation: { Name: i.name || '', Email: i.email, Phone: i.phone || '' },
      ReturnUrl: i.returnUrl, CallbackUrl: i.callbackUrl,
    },
  };
}

/** Moka yanıtı: ResultCode 'Success' ve Data içinde bağlantı. */
export function mokaParseLink(j: any): LinkResult {
  if (!j || j.ResultCode !== 'Success' || !j.Data) throw new Error('Moka bağlantı oluşturmadı: ' + String(j?.ResultCode ?? 'yanıt yok'));
  const url = typeof j.Data === 'string' ? j.Data : j.Data.Url || j.Data.PaymentUrl || j.Data.Link;
  if (!url || !/^https:\/\//.test(url)) throw new Error('Moka yanıtında bağlantı yok');
  return { url, providerRef: String(j.Data.PaymentId ?? j.Data.DealerPaymentId ?? '') || undefined };
}

/** Moka durum yanıtı: ödeme tamamlandı mı. */
export function mokaParseStatus(j: any): Status {
  const d = j?.ResultCode === 'Success' ? j.Data : null;
  const row = Array.isArray(d?.PaymentDetail) ? d.PaymentDetail[0] : d?.PaymentDetail ?? d;
  const paid = !!row && (row.PaymentStatus === 2 || row.PaymentStatus === '2' || row.TrxStatus === 1 || row.TrxStatus === '1' || row.IsSuccessful === true);
  return { paid, providerRef: row ? String(row.DealerPaymentId ?? row.PaymentId ?? '') || undefined : undefined };
}

export function moka(env: Env, fetcher: typeof fetch = fetch): PosProvider {
  const base = MOKA_BASE[env('MOKA_ENV') === 'live' ? 'live' : 'test'];
  const post = async (path: string, body: unknown) => {
    const r = await fetcher(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error('Moka HTTP ' + r.status);
    return r.json();
  };
  return {
    id: 'moka',
    configured: () => !!(env('MOKA_DEALER_CODE') && env('MOKA_USERNAME') && env('MOKA_PASSWORD') && env('MOKA_LINK_PATH') && env('MOKA_STATUS_PATH')),
    createLink: async (i) => mokaParseLink(await post(env('MOKA_LINK_PATH'), await mokaLinkBody(env, i))),
    status: async (ref) => mokaParseStatus(await post(env('MOKA_STATUS_PATH'), { PaymentDealerAuthentication: await mokaAuth(env), PaymentDealerRequest: { OtherTrxCode: ref } })),
  };
}

/** Etkin sağlayıcı: POS_PROVIDER (varsayılan moka). Yapılandırılmamışsa configured() false döner. */
export function provider(env: Env, fetcher: typeof fetch = fetch): PosProvider {
  const id = env('POS_PROVIDER') || 'moka';
  if (id === 'moka') return moka(env, fetcher);
  return { id, configured: () => false, createLink: () => Promise.reject(new Error('Bilinmeyen sağlayıcı')), status: () => Promise.resolve({ paid: false }) };
}
