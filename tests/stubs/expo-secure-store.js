// expo-secure-store taklidi (birim testleri): bellekte tutar; gerçek depo gibi ~2 KB'tan büyük değeri reddeder.
// Testler globalThis.__ssFail = true ile yazma/okuma hatası, __ssMax ile en büyük yazılan bayt sayısını denetler.
const m = new Map();
export const AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = 1;
export const stats = { maxBytes: 0, sets: 0 };
export const dump = () => new Map(m);
const bytes = (s) => new TextEncoder().encode(s).length;
export async function getItemAsync(k) { if (globalThis.__ssFail) throw new Error('keychain'); return m.has(k) ? m.get(k) : null; }
export async function setItemAsync(k, v) {
  if (globalThis.__ssFail) throw new Error('keychain');
  if (!/^[A-Za-z0-9._-]+$/.test(k)) throw new Error('geçersiz anahtar: ' + k);
  if (bytes(v) > 2048) throw new Error('değer 2048 bayttan büyük');
  stats.maxBytes = Math.max(stats.maxBytes, bytes(v)); stats.sets++;
  m.set(k, v);
}
export async function deleteItemAsync(k) { if (globalThis.__ssFail) throw new Error('keychain'); m.delete(k); }
