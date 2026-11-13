// Web Push uç noktası (push_subscriptions.endpoint) denetimi. Kayıt tarayıcıdan gelir; uç nokta herhangi bir adres olursa
// fonksiyon sunucu tarafında o adrese istek atardı (SSRF). Yalnız bilinen push servisleri kabul edilir.
// Saf fonksiyon: Deno'ya bağımlı değildir, testlerde doğrudan sınanır. Veritabanındaki kısıt (istek_sinirlari) ile aynı liste.

const EXACT = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com']);
const SUFFIX = ['.push.apple.com', '.notify.windows.com'];

export function allowedPushEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return false;
  let u: URL;
  try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  if (u.port && u.port !== '443') return false;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  return EXACT.has(host) || SUFFIX.some((s) => host.endsWith(s) && host.length > s.length);
}
