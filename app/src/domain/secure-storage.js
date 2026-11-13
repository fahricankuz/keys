/* Oturum deposu: web sürümü. Tarayıcıda oturum, supabase-js'in her zamanki yeri olan localStorage'da (AsyncStorage'ın web
   karşılığı) kalır; davranış PKCE öncesiyle aynıdır. Telefon sürümü (secure-storage.native.js) oturumu iOS Keychain /
   Android Keystore'da (expo-secure-store) tutar ve aynı arayüzü verir. */
import AsyncStorage from '@react-native-async-storage/async-storage';

/** supabase-js'in `auth.storage` arayüzü (getItem / setItem / removeItem; hepsi asenkron). */
// Statik derlemede (Node, window yok) supabase-js oturumu okumaya çalışır; o sırada depo boş davranır.
const ssrStorage = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
export const authStorage = typeof window === 'undefined' ? ssrStorage : AsyncStorage;

/** Telefonda eski AsyncStorage oturumunu güvenli depoya taşır; web'de yapılacak bir şey yok. */
export async function migrateAuthStorage(key) { void key; }
