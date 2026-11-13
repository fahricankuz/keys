// App Store Connect API yardımcıları: ES256 JWT (node:crypto), istek, sayfalama, hata iletisi.
// Ortam: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH (.p8 dosyasının yolu), ASC_APP_ID (varsayılan 6834434284).
// Anahtar dosyası yalnızca bellekte imzalamak için okunur; içeriği ve token yazdırılmaz.

import { createPrivateKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { b64url, ortam, tekrarliFetch } from './ortak.mjs';

const TABAN = 'https://api.appstoreconnect.apple.com';
export const VARSAYILAN_UYGULAMA = '6834434284';

/** ES256 JWT üretir (Apple: en çok 20 dk geçerli). DER değil ham r||s imza (ieee-p1363) gerekir. */
export function jwtUret({ keyId, issuerId, pem, simdi = Math.floor(Date.now() / 1000) }) {
  const baslik = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
  const yuk = b64url(JSON.stringify({ iss: issuerId, iat: simdi, exp: simdi + 1100, aud: 'appstoreconnect-v1' }));
  const imza = sign('sha256', Buffer.from(`${baslik}.${yuk}`), { key: createPrivateKey(pem), dsaEncoding: 'ieee-p1363' });
  return `${baslik}.${yuk}.${b64url(imza)}`;
}

export function ascAyar() {
  const keyPath = ortam('ASC_KEY_PATH');
  let pem;
  try { pem = readFileSync(keyPath, 'utf8'); } catch { throw new Error('ASC_KEY_PATH okunamadı: dosya yolu yanlış ya da izin yok.'); }
  return { keyId: ortam('ASC_KEY_ID'), issuerId: ortam('ASC_ISSUER_ID'), pem, appId: ortam('ASC_APP_ID', VARSAYILAN_UYGULAMA) };
}

export function ascIstemci(ayar = ascAyar()) {
  let token = null, alinma = 0;
  const jeton = () => {
    if (!token || Date.now() - alinma > 600_000) { token = jwtUret(ayar); alinma = Date.now(); }
    return token;
  };
  const hata = (d) => (d?.errors || []).map((e) => `${e.code}: ${e.title}${e.detail ? ' - ' + e.detail : ''}`).join('; ') || JSON.stringify(d).slice(0, 300);

  /** { durum, veri } döner; 4xx'te fırlatmaz (çağıran karar verir). */
  async function istek(yontem, yol, govde) {
    const r = await tekrarliFetch(TABAN + yol, {
      method: yontem,
      headers: { Authorization: 'Bearer ' + jeton(), 'Content-Type': 'application/json' },
      body: govde === undefined ? undefined : JSON.stringify(govde)
    }, { ad: `${yontem} ${yol.slice(0, 60)}` });
    const metin = await r.text();
    let veri = {};
    try { veri = metin ? JSON.parse(metin) : {}; } catch { veri = { raw: metin.slice(0, 200) }; }
    if (r.status === 401) throw new Error('App Store Connect 401: anahtar kimliği, issuer ya da .p8 dosyası uyuşmuyor (ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_PATH).');
    return { durum: r.status, veri };
  }
  /** GET; 200 değilse anlaşılır hatayla fırlatır. */
  async function al(yol) {
    const { durum, veri } = await istek('GET', yol);
    if (durum === 403) throw new Error(`GET ${yol.split('?')[0]} 403: bu API anahtarının rolü yetmiyor (${hata(veri)}). App Manager ya da Admin gerekir.`);
    if (durum !== 200) throw new Error(`GET ${yol.split('?')[0]} ${durum}: ${hata(veri)}`);
    return veri;
  }
  /** Sayfalı GET: { data, included } birleştirir. */
  async function hepsi(yol) {
    const data = [], included = [];
    for (let y = yol; y;) {
      const d = await al(y);
      data.push(...(d.data || [])); included.push(...(d.included || []));
      y = d.links?.next ? d.links.next.replace(TABAN, '') : null;
    }
    return { data, included };
  }
  return { ayar, istek, al, hepsi, hata };
}
