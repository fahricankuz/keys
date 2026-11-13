// Güvenli rastgele baytlar (iOS/Android): Hermes'te Web Crypto yoksa expo-crypto. Web/Node sürümü random.js.
import { getRandomBytes } from 'expo-crypto';

export function randomBytes(n) {
  const c = globalThis.crypto;
  if (c && c.getRandomValues) return c.getRandomValues(new Uint8Array(n));
  return getRandomBytes(n);
}
