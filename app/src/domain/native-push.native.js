/* Telefon uygulamasına anlık bildirim (iOS: APNs, Android: FCM). Cihaz anahtarı sunucuya register_device_token ile yazılır
   (aynı cihazı başka bir hesap kullanırsa sunucu anahtarı yeni hesaba taşır); çıkışta unregister_device_token ile silinir.
   Sunucu (supabase/functions/push → native.ts) yeni bildirimi bu anahtarlara gönderir. Bildirime dokununca paneldeki ilgili ekran
   açılır (yük: url, ör. /uygulama/sitem). Web: native-push.js.

   İzin akışı: izin ilk girişte ISTENMEZ. registerDevice() izin zaten verilmişse anahtarı sessizce kaydeder; izin sorulacaksa önce kısa bir
   açıklama sayfası gösterilir (shouldPrimePush → sheet 'bildirim-izni') ve sistem penceresi yalnızca oradaki "Aç" ile açılır (enableDevicePush). */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { LIVE } from './config.js';
import { client, live } from './backend.js';
import { storage } from './storage.js';

const native = () => Platform.OS === 'ios' || Platform.OS === 'android';

let token = null, tokenSub = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('zaman aşımı')), ms))]);

/** Bu cihazın bildirim anahtarı (APNs / FCM). Yeniden başlatmadan sonra da alınabilir; bellekteki kopyaya bağlı değildir. */
async function deviceToken(){
  const r = await withTimeout(Notifications.getDevicePushTokenAsync(), 8000);
  return String(r.data);
}

/** Sunucuda register_device_token / unregister_device_token henüz yoksa (PostgREST: PGRST202, Postgres: 42883) eski tablo yolu kullanılır. */
const missingRpc = (e) => !!e && (e.code === 'PGRST202' || e.code === '42883' || /could not find the function|function .* does not exist/i.test(String(e.message || '')));

async function save(tok){
  const c = await client();
  const r = await c.rpc('register_device_token', { p_token: tok, p_platform: Platform.OS });
  if (!r.error) return;
  if (!missingRpc(r.error)) throw r.error;
  const u = await c.from('device_tokens').upsert({ token: tok, user_id: live.user.id, platform: Platform.OS }, { onConflict: 'token' });
  if (u.error) throw u.error;
}

/** Bildirim izni durumu, izin sorulmadan: 'on' (verilmiş) | 'ask' (henüz sorulmadı / yeniden sorulabilir) | 'denied' | 'off' (bu cihazda yok). */
export async function pushPermission(){
  if (!LIVE || !native()) return 'off';
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.granted ? 'on' : p.canAskAgain ? 'ask' : 'denied';
  } catch { return 'off'; }
}

/** Oturum açıkken çağrılır. İzin zaten verilmişse cihaz anahtarını sessizce kaydeder; izin YOKSA hiçbir pencere açmaz.
    Dönen: 'on' | 'ask' | 'denied' | 'off'. */
export async function registerDevice(){
  if (!LIVE || !live.user?.id || !native()) return 'off';
  try {
    if (Platform.OS === 'android') {
      // Sunucu Android bildirimlerini "evim" kanalına gönderir (native.ts → channel_id). Android 13+ izin penceresi için kanal önceden olmalı.
      await Notifications.setNotificationChannelAsync('evim', { name: 'anahtar', importance: Notifications.AndroidImportance.HIGH });
    }
    const state = await pushPermission();
    if (state !== 'on') return state;
    token = await deviceToken();
    await save(token);
    // Anahtar yenilenirse (FCM / APNs) yeni değer de kaydedilir.
    if (!tokenSub) tokenSub = Notifications.addPushTokenListener((e) => {
      token = String(e.data);
      if (live.user?.id) save(token).catch((err) => console.warn('Bildirim anahtarı güncellenemedi', err));
    });
    return 'on';
  } catch (e) {
    // Android'de Firebase dosyası (google-services.json) olmadan anahtar alınamaz; uygulama bildirimsiz çalışmayı sürdürür.
    console.warn('Bildirim kaydı yapılamadı', e);
    return 'off';
  }
}

/** Açıklama sayfasındaki "Aç" (ve Ayarlar → Bildirimler): sistem izin penceresini açar, verilirse cihazı kaydeder. Dönen: 'on' | 'denied' | 'off'. */
export async function enableDevicePush(){
  if (!LIVE || !live.user?.id || !native()) return 'off';
  try {
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return 'denied';
    return await registerDevice();
  } catch (e) {
    console.warn('Bildirim izni alınamadı', e);
    return 'off';
  }
}

/** Çıkışta bu cihazın anahtarı sunucudan silinir (başka hesaba bildirim gitmesin). Uygulama yeniden başlatılmış olsa da çalışır:
    anahtar bellekte yoksa cihazdan yeniden okunur. Oturum kapanmadan ÖNCE çağrılmalıdır (auth.tsx → signOut). */
export async function unregisterDevice(){
  if (!LIVE || !native()) return;
  let tok = token;
  token = null;
  if (tokenSub){ try { tokenSub.remove(); } catch {} tokenSub = null; }
  if (!tok){ try { tok = await deviceToken(); } catch { tok = null; } }
  if (!tok) return;
  try {
    const c = await client();
    const r = await c.rpc('unregister_device_token', { p_token: tok });
    if (r.error){
      if (!missingRpc(r.error)) throw r.error;
      await c.from('device_tokens').delete().eq('token', tok);
    }
  } catch (e) { console.warn('Bildirim anahtarı silinemedi', e); }
}

/* ---- İzin açıklaması ne zaman gösterilir ------------------------------------------------------------------------- */

const DAY = 86400000;
const k = (name) => 'anahtar-bildirim-' + name + ':' + (live.user?.id || '');
let counted = null;

/** Bu uygulama açılışını (oturumu) sayar; açılış başına bir kez. */
export function noteSession(){
  const id = live.user?.id;
  if (!id || counted === id) return;
  counted = id;
  try { storage.setItem(k('oturum'), String((Number(storage.getItem(k('oturum'))) || 0) + 1)); } catch {}
}

/** İzin açıklama sayfası şimdi gösterilsin mi? İzin sorulabilir durumdaysa, ikinci oturumdan itibaren, reddedilirse 14 günde bir, en çok 3 kez. */
export async function shouldPrimePush(){
  if (!LIVE || !native() || !live.user?.id) return false;
  if ((await pushPermission()) !== 'ask') return false;
  if ((Number(storage.getItem(k('oturum'))) || 0) < 2) return false;
  if ((Number(storage.getItem(k('sorulan'))) || 0) >= 3) return false;
  const at = Number(storage.getItem(k('sorulan-at'))) || 0;
  return !at || Date.now() - at >= 14 * DAY;
}

/** Açıklama sayfası gösterildi: sayaç artar (kullanıcı "Şimdi değil" derse 14 gün sorulmaz). */
export function markPrimed(){
  try {
    storage.setItem(k('sorulan'), String((Number(storage.getItem(k('sorulan'))) || 0) + 1));
    storage.setItem(k('sorulan-at'), String(Date.now()));
  } catch {}
}

/* ---- Bildirime dokunma ------------------------------------------------------------------------------------------- */

const obj = (v) => {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string'){ try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : null; } catch { return null; } }
  return null;
};
/** Yükte url kökte ya da body içinde (iOS expo-notifications özel alanları userInfo.body altında verir) olabilir. */
const urlIn = (v) => {
  const o = obj(v);
  if (!o) return '';
  if (typeof o.url === 'string') return o.url;
  const b = obj(o.body);
  return b && typeof b.url === 'string' ? b.url : '';
};

/** Dokunulan bildirimin paneldeki yolu; yalnız uygulama içi (/ ile başlayan) yollar kabul edilir, aksi halde panel. */
export const pathOf = (r) => {
  const req = r && r.notification && r.notification.request;
  const trig = req && req.trigger;
  const url = urlIn(req && req.content && req.content.data) || urlIn(trig && trig.payload) || urlIn(trig && trig.remoteMessage && trig.remoteMessage.data);
  return /^\/(?![\/\\])/.test(url) ? url : '/uygulama';
};

/** Bildirime dokunulunca (uygulama kapalıyken açıldıysa da) go(yol) çağrılır. Dinlemeyi bırakan işlevi döner. */
export function listenNotificationTaps(go){
  Notifications.getLastNotificationResponseAsync().then((r) => { if (r) go(pathOf(r)); }).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener((r) => go(pathOf(r)));
  return () => sub.remove();
}
