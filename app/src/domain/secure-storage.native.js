/* Oturum deposu: iOS ve Android. supabase-js oturumunu (erişim ve yenileme anahtarı) ve PKCE doğrulayıcısını AsyncStorage
   yerine iOS Keychain / Android Keystore'da (expo-secure-store) tutar.

   - SecureStore bir değer için ~2 KB'a kadar güvenilirdir; oturum JSON'u bundan büyük olabilir. Büyük değer 1800 baytlık
     parçalara bölünür: asıl anahtar "@@parca:<n>" işaretini, parçalar "<anahtar>.p0 … .p<n-1>" anahtarlarını taşır. İşaret en son
     yazılır; yarım kalan yazma eski değeri bozmaz, eksik parça okunursa değer yok sayılır (yeniden giriş istenir).
   - Eski sürümde AsyncStorage'a yazılmış oturum bir kez güvenli depoya taşınır (migrateAuthStorage) ve AsyncStorage'dan silinir.
     Taşıma başarısız olursa eski kopya yine silinir: kişi yeniden giriş yapar, açık metin oturum cihazda kalmaz.
   - Güvenli depo kullanılamazsa (nadir: Keychain hatası) oturum yalnızca bellekte tutulur; uygulama kapanınca yeniden giriş istenir. */
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const OPTS = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
const MAX_BYTES = 1800;
const MARK = '@@parca:';

/** SecureStore anahtarı: yalnız harf, rakam, ".", "-" ve "_" kabul eder; diğer karakterler "_" olur. */
const safe = (k) => String(k).replace(/[^A-Za-z0-9._-]/g, '_');
const chunkKey = (k, i) => safe(k) + '.p' + i;

const memory = new Map();

const utf8Len = (cp) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/** Metni UTF-8 olarak en çok `max` bayt olan parçalara böler (karakter ortasından kesmez). */
export function splitUtf8(value, max = MAX_BYTES) {
  const out = [];
  let cur = '', bytes = 0;
  for (const ch of String(value)) {
    const n = utf8Len(ch.codePointAt(0));
    if (bytes + n > max) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += n;
  }
  if (cur || !out.length) out.push(cur);
  return out;
}

async function readRaw(key) {
  const head = await SecureStore.getItemAsync(safe(key), OPTS);
  if (head == null || !head.startsWith(MARK)) return head;
  const n = Number(head.slice(MARK.length));
  if (!Number.isInteger(n) || n < 1 || n > 64) return null;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const p = await SecureStore.getItemAsync(chunkKey(key, i), OPTS);
    if (p == null) return null;                       // eksik parça: bozuk kayıt, yeniden giriş
    parts.push(p);
  }
  return parts.join('');
}

async function removeRaw(key) {
  const head = await SecureStore.getItemAsync(safe(key), OPTS);
  const n = head && head.startsWith(MARK) ? Number(head.slice(MARK.length)) : 0;
  if (Number.isInteger(n)) for (let i = 0; i < n && i < 64; i++) await SecureStore.deleteItemAsync(chunkKey(key, i), OPTS);
  await SecureStore.deleteItemAsync(safe(key), OPTS);
}

async function writeRaw(key, value) {
  const parts = splitUtf8(value);
  if (parts.length === 1) {
    const old = await SecureStore.getItemAsync(safe(key), OPTS);
    await SecureStore.setItemAsync(safe(key), parts[0], OPTS);
    if (old && old.startsWith(MARK)) {                // önceki değer parçalıydı: artık parçaları sil
      const n = Number(old.slice(MARK.length));
      if (Number.isInteger(n)) for (let i = 0; i < n && i < 64; i++) await SecureStore.deleteItemAsync(chunkKey(key, i), OPTS);
    }
    return;
  }
  const old = await SecureStore.getItemAsync(safe(key), OPTS);
  for (let i = 0; i < parts.length; i++) await SecureStore.setItemAsync(chunkKey(key, i), parts[i], OPTS);
  await SecureStore.setItemAsync(safe(key), MARK + parts.length, OPTS);
  const was = old && old.startsWith(MARK) ? Number(old.slice(MARK.length)) : 0;
  if (Number.isInteger(was)) for (let i = parts.length; i < was && i < 64; i++) await SecureStore.deleteItemAsync(chunkKey(key, i), OPTS);
}

/** supabase-js'in `auth.storage` arayüzü. */
export const authStorage = {
  async getItem(key) {
    try { const v = await readRaw(key); if (v != null) return v; }
    catch (e) { /* güvenli depo okunamadı: bellekteki kopya varsa o */ }
    return memory.has(key) ? memory.get(key) : null;
  },
  async setItem(key, value) {
    try { await writeRaw(key, String(value)); memory.delete(key); }
    catch (e) { memory.set(key, String(value)); }
  },
  async removeItem(key) {
    memory.delete(key);
    try { await removeRaw(key); } catch (e) { /* silinemedi: sonraki çıkışta yeniden denenir */ }
    try { await AsyncStorage.removeItem(key); } catch (e) { /* eski kopya yoksa sorun değil */ }
  }
};

let migrating = null;
/** Eski sürümde AsyncStorage'a yazılmış oturumu bir kez güvenli depoya taşır, sonra AsyncStorage'dan siler. */
export function migrateAuthStorage(key) {
  if (!migrating) migrating = migrate(key).catch(() => {});
  return migrating;
}

async function migrate(key) {
  let legacy = null;
  try { legacy = await AsyncStorage.getItem(key); } catch (e) { return; }
  if (legacy == null) return;
  try {
    const has = await readRaw(key).catch(() => null);
    if (has == null) {
      await writeRaw(key, legacy);
      if ((await readRaw(key)) !== legacy) await removeRaw(key).catch(() => {});   // yazılan okunamadı: yeniden giriş
    }
  } catch (e) { /* taşınamadı: yeniden giriş */ }
  finally { try { await AsyncStorage.removeItem(key); } catch (e) { /* yoksay */ } }
}
