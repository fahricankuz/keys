/* Üretim hata kaydı: yakalanmamış hata, söz (promise) reddi, ekran hatası (ErrorBoundary) ve yakalanan hata (logs.js) sunucuya yazılır
   (report_error; yönetici paneli → Hatalar). Yalnız hata metni, ekran yolu, sürüm ve platform gönderilir; metindeki e-posta,
   telefon ve jetonlar sunucuda temizlenir (log_redact), kayıtlar 90 gün saklanır. Ayrıntı: docs/loglar.md. Aynı hata bir oturumda bir kez, en çok 20 farklı hata gönderilir; sunucu da sınırlar.
   Oturumu olmayan ziyaretçide sunucu kütüphanesi yüklenmeden doğrudan REST ucuna gider. */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { CONFIG, LIVE } from './config.js';
import { live, client } from './backend.js';
import { setLogSink } from './logs.js';

const FAKE = process.env.EXPO_PUBLIC_SUPABASE_URL === 'fake:';
// Hostinger'ın geçici adresi HTML'deki alan adını kendininkiyle değiştirir; bu yüzden orada React #418 (metin uyuşmazlığı) çıkar.
// Gerçek kullanıcı o adrese gelmez: kayıtları kirletmesin.
const PREVIEW_HOST = /\.hostingersite\.com$/i;
// Beklenen ya da bizim dışımızdaki gürültü: ağ kopması, tarayıcı eklentileri, ResizeObserver uyarısı.
const NOISE = /Failed to fetch|NetworkError|Load failed|ResizeObserver loop|chrome-extension:|moz-extension:|safari-extension:|AbortError/i;
const seen = new Set();
let sent = 0;

export function reportError(err, kind = 'error'){
  try {
    if (!LIVE) return;
    // Geliştirme modu (Expo Go / yerel Metro, __DEV__) production hata kaydına yazmaz: oradaki "Requiring unknown module" gibi
    // geliştirme hataları gerçek kullanıcı hatalarıyla karışıyordu. Yayın derlemelerinde __DEV__ false'tur.
    if (typeof __DEV__ !== 'undefined' && __DEV__) return;
    if (typeof window !== 'undefined' && window.location && PREVIEW_HOST.test(window.location.hostname || '')) return;
    const message = String((err && (err.message || err.reason)) || err || '').slice(0, 1000).trim();
    const stack = String((err && err.stack) || '').slice(0, 4000);
    if (!message || NOISE.test(message) || NOISE.test(stack)) return;
    const key = kind + ':' + message;
    if (seen.has(key) || sent >= 20) return;
    seen.add(key); sent++;
    const p = {
      message, stack, kind,
      route: typeof window !== 'undefined' && window.location ? window.location.pathname : '',
      platform: Platform.OS, version: (Constants.expoConfig && Constants.expoConfig.version) || '',
      agent: (typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 280) : '')
        + (typeof document !== 'undefined' && /translated/.test(document.documentElement.className || '') ? ' [tarayıcı çevirisi açık]' : '')
    };
    send(p);
  } catch(e){ /* hata kaydı asla yeni hata üretmez */ }
}

async function send(p){
  try {
    if (FAKE || live.client){
      // Oturum varsa kişinin anahtarıyla (sunucu kişi başına sınırlar); test derlemesinde sahte sunucuya.
      await (await client()).rpc('report_error', { p });
      return;
    }
    await fetch(CONFIG.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/report_error', {
      method: 'POST', keepalive: true,
      headers: { apikey: CONFIG.supabaseAnonKey, authorization: 'Bearer ' + CONFIG.supabaseAnonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ p })
    });
  } catch(e){}
}

let installed = false;
/** Uygulama açılırken bir kez çağrılır (app/_layout.tsx). */
export function installErrorReporting(){
  if (installed || !LIVE) return;
  installed = true;
  setLogSink((context, err) => {
    const m = String((err && (err.message || err.reason)) || err || '');
    reportError({ message: context + ': ' + m, stack: err && err.stack }, 'caught');
  });
  if (Platform.OS === 'web' && typeof window !== 'undefined'){
    window.addEventListener('error', (e) => reportError(e.error || e.message, 'error'));
    window.addEventListener('unhandledrejection', (e) => reportError(e.reason, 'rejection'));
    return;
  }
  const EU = /** @type {any} */ (globalThis).ErrorUtils;
  if (EU && EU.getGlobalHandler){
    const prev = EU.getGlobalHandler();
    EU.setGlobalHandler((error, fatal) => { reportError(error, 'error'); if (prev) prev(error, fatal); });
  }
}

/* Yeni sürüm yayınlanınca eski dosya adları (içeriğe göre adlanan .js parçaları) sunucuda kalmaz; açık duran eski sekme sonraki
   sayfaya geçerken "Loading module … failed" alır. Bu durumda sayfa bir kez yenilenir (yeni sürüm gelir); dakikada en çok bir kez. */
const STALE = /Loading module .* failed|Loading chunk .* failed|ChunkLoadError|Importing a module script failed|error loading dynamically imported module|Failed to fetch dynamically imported module/i;
let staleOn = false;
export const isStaleError = (err) => STALE.test(String((err && err.message) || err || ''));
/** Eski parça hatasıysa sayfayı yeniler ve true döner; başka hatada ya da dakika içinde ikinci kez false. */
export function recoverStale(m){
  try {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !STALE.test(String(m || ''))) return false;
    const k = '__stale_reload', last = Number(window.sessionStorage.getItem(k) || 0);
    if (Date.now() - last < 60000) return false;
    window.sessionStorage.setItem(k, String(Date.now()));
    window.location.reload();
    return true;
  } catch(e){ return false; }
}
export function installStaleRecovery(){
  if (staleOn || Platform.OS !== 'web' || typeof window === 'undefined') return;
  staleOn = true;
  const go = (m) => { recoverStale(m); };
  window.addEventListener('error', (e) => go((e.error && e.error.message) || e.message));
  window.addEventListener('unhandledrejection', (e) => go((e.reason && e.reason.message) || e.reason));
}
