/* Sunucudan okunan herkese açık uygulama ayarları (public.app_config; anon ve oturum açmış herkes okuyabilir, yazamaz).
   Şimdilik tek ayar: billing_paused (satın alma kapalı mı). Mağazalar onaylayınca değer veritabanında false yapılır,
   yeni sürüm gerekmez. Okunamazsa (çevrimdışı, tablo yok, sunucu hatası) config.js → billing.paused yedeği kullanılır.

   paused() eşzamanlıdır: önbellekteki değeri (yoksa yedeği) döner ve önbellek eskidiyse arka planda tazeler.
   Ekranlar değer gelince yeniden çizilsin diye useBillingPaused() kullanır. */

import { useEffect, useSyncExternalStore } from 'react';
import { CONFIG, LIVE } from './config.js';
import { client } from './backend.js';

const TTL = 5 * 60 * 1000;          // başarılı okuma bu kadar süre geçerli
const RETRY = 30 * 1000;            // başarısız okuma bu kadar süre sonra yeniden denenir
const TIMEOUT = 6000;               // sunucu yanıtı beklenmez; yedek değerle devam edilir

/** @type {{ paused: boolean } | null} */
let cache = null;
let freshUntil = 0;
let inflight = null;
let version = 0;
const subs = new Set();

const bump = () => { version++; subs.forEach((fn) => fn()); };
const subscribe = (fn) => { subs.add(fn); return () => { subs.delete(fn); }; };
const snapshot = () => version;

/** app_config.value jsonb: true/false ya da "true"/"false" ya da { paused: true }. Anlaşılmazsa null (yedek kullanılır). */
export function parsePaused(v){
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string'){
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
    return null;
  }
  if (v && typeof v === 'object'){
    for (const k of ['paused', 'value', 'enabled']) if (k in v) return parsePaused(v[k]);
  }
  return null;
}

async function fetchConfig(){
  const c = await client();
  let timer;
  const guard = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('app_config zaman aşımı')), TIMEOUT); });
  let res;
  try { res = await Promise.race([c.from('app_config').select('key, value').eq('key', 'billing_paused').maybeSingle(), guard]); }
  finally { clearTimeout(timer); }
  if (res.error) throw res.error;
  const v = res.data ? parsePaused(res.data.value) : null;
  if (v == null) throw new Error('billing_paused satırı yok ya da anlaşılmadı');
  return { paused: v };
}

/** Sunucudan okur ve önbelleğe alır. Hata olursa eski önbellek (yoksa yedek) kalır; asla fırlatmaz.
    force: önbellek taze olsa da yeniden okur. Dönen: güncel paused değeri. */
export function loadAppConfig(force = false){
  if (!LIVE) return Promise.resolve(billingPaused());
  if (!force && cache && Date.now() < freshUntil) return Promise.resolve(cache.paused);
  if (inflight) return inflight;
  inflight = fetchConfig()
    .then((c) => { const changed = !cache || cache.paused !== c.paused; cache = c; freshUntil = Date.now() + TTL; if (changed) bump(); })
    .catch(() => { freshUntil = Date.now() + RETRY; })
    .then(() => { inflight = null; return billingPaused(); });
  return inflight;
}

/** Satın alma kapalı mı: sunucudaki değer (önbellekten), okunamadıysa config.js yedeği. */
export function billingPaused(){
  if (LIVE && Date.now() >= freshUntil) loadAppConfig();   // eskiyse arka planda tazele (sonuç bir sonraki çizimde görünür)
  return cache ? cache.paused : !!CONFIG.billing.paused;
}

/** Ekranlar için: değer sunucudan gelince bileşeni yeniden çizer ve güncel paused değerini döner. */
export function useBillingPaused(){
  useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => { loadAppConfig(); }, []);
  return billingPaused();
}

/** Testler ve çıkış için: önbelleği sıfırlar. */
export function resetAppConfig(){ cache = null; freshUntil = 0; inflight = null; bump(); }
