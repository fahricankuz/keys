// Google Play Android Publisher API yardımcıları: hizmet hesabı JWT (RS256, node:crypto) → erişim jetonu, istek, yükleme.
// Ortam: PLAY_SA_PATH (hizmet hesabı JSON dosyasının yolu), PLAY_PACKAGE (varsayılan io.anahtar.app).
// JSON dosyası yalnızca bellekte okunur; özel anahtar ve jeton yazdırılmaz.

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { b64url, ortam, tekrarliFetch } from './ortak.mjs';

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const YUKLEME = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications';
const KAPSAM = 'https://www.googleapis.com/auth/androidpublisher';
export const VARSAYILAN_PAKET = 'io.anahtar.app';

/** Hizmet hesabı için RS256 imzalı JWT (OAuth2 jwt-bearer isteği). */
export function jwtUret({ email, privateKey, tokenUri, simdi = Math.floor(Date.now() / 1000) }) {
  const baslik = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const yuk = b64url(JSON.stringify({ iss: email, scope: KAPSAM, aud: tokenUri, iat: simdi, exp: simdi + 3000 }));
  return `${baslik}.${yuk}.${b64url(createSign('RSA-SHA256').update(`${baslik}.${yuk}`).sign(privateKey))}`;
}

export function playAyar() {
  const yol = ortam('PLAY_SA_PATH');
  let sa;
  try { sa = JSON.parse(readFileSync(yol, 'utf8')); } catch { throw new Error('PLAY_SA_PATH okunamadı ya da geçerli JSON değil.'); }
  if (!sa.client_email || !sa.private_key) throw new Error('PLAY_SA_PATH bir hizmet hesabı anahtarı değil (client_email / private_key yok).');
  return { sa, paket: ortam('PLAY_PACKAGE', VARSAYILAN_PAKET) };
}

export function playIstemci(ayar = playAyar()) {
  const { sa, paket } = ayar;
  const tabanUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  let jeton = null, bitis = 0;
  async function erisimJetonu() {
    if (jeton && Date.now() < bitis) return jeton;
    const assertion = jwtUret({ email: sa.client_email, privateKey: sa.private_key, tokenUri: tabanUri });
    const r = await tekrarliFetch(tabanUri, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion })
    }, { ad: 'Google jeton' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Google jeton ${r.status}: ${d.error || ''} ${d.error_description || ''}`.trim());
    jeton = d.access_token; bitis = Date.now() + (d.expires_in - 120) * 1000;
    return jeton;
  }
  const hata = (d) => d?.error ? `${d.error.code} ${d.error.status || ''}: ${d.error.message}` : JSON.stringify(d).slice(0, 300);
  const IZIN_IPUCU = ' | Hizmet hesabına izin verildikten hemen sonra 403 PERMISSION_DENIED normaldir: yayılması 24-36 saat sürebilir. Play Console → Kullanıcılar ve izinler → hizmet hesabında uygulama izinlerini de kontrol et.';

  /** { durum, veri }; 4xx'te fırlatmaz. yol, uygulamaya göre göreli ("/subscriptions") ya da mutlak (https://...). */
  async function istek(yontem, yol, govde, { ham = false, tur = 'application/json' } = {}) {
    const url = yol.startsWith('http') ? yol : `${API}/${paket}${yol}`;
    const r = await tekrarliFetch(url, {
      method: yontem, headers: { Authorization: 'Bearer ' + (await erisimJetonu()), 'Content-Type': tur },
      body: govde === undefined ? undefined : ham ? govde : JSON.stringify(govde)
    }, { ad: `${yontem} ${yol.split('?')[0].slice(0, 60)}` });
    const metin = await r.text();
    let veri = {};
    try { veri = metin ? JSON.parse(metin) : {}; } catch { veri = { raw: metin.slice(0, 200) }; }
    return { durum: r.status, veri };
  }
  /** Başarısızsa anlaşılır hatayla fırlatır (404'ü çağıran yönetsin diye { durum:404 } olarak döner). */
  async function iste(yontem, yol, govde, secenek) {
    const s = await istek(yontem, yol, govde, secenek);
    if (s.durum === 403) throw new Error(`${yontem} ${yol.split('?')[0]} 403: ${hata(s.veri)}${IZIN_IPUCU}`);
    if (s.durum >= 300 && s.durum !== 404) throw new Error(`${yontem} ${yol.split('?')[0]} ${s.durum}: ${hata(s.veri)}`);
    return s;
  }
  return { paket, erisimJetonu, istek, iste, hata, yuklemeTabani: `${YUKLEME}/${paket}` };
}
