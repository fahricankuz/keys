// Güvenli rastgele baytlar (web ve Node): Web Crypto. Telefon sürümü random.native.js (expo-crypto).
// Math.random kimlik ya da jeton üretmez.
export function randomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}
