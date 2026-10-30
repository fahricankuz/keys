/* Üretim hata kaydı: yakalanmamış hata, söz (promise) reddi ve ekran hatası (ErrorBoundary) sunucuya yazılır
   (supabase/schema.sql 25. bölüm → report_error; yönetici paneli → Hatalar). Kişisel veri gönderilmez: yalnız hata metni,
   ekran yolu, sürüm ve platform. Aynı hata bir oturumda bir kez, en çok 20 farklı hata gönderilir; sunucu da sınırlar.
   Oturumu olmayan ziyaretçide sunucu kütüphanesi yüklenmeden doğrudan REST ucuna gider. */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { CONFIG, LIVE } from './config.js';
import { live, client } from './backend.js';

const FAKE = process.env.EXPO_PUBLIC_SUPABASE_URL === 'fake:';
// Beklenen ya da bizim dışımızdaki gürültü: ağ kopması, tarayıcı eklentileri, ResizeObserver uyarısı.
const NOISE = /Failed to fetch|NetworkError|Load failed|ResizeObserver loop|chrome-extension:|moz-extension:|safari-extension:|AbortError/i;
const seen = new Set();
let sent = 0;

export function reportError(err, kind = 'error'){
  try {
    if (!LIVE) return;
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
      agent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 300) : ''
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
