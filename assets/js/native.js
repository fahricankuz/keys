/* iOS / Android (Capacitor) uyarlaması. Web'de hiçbir şey yapmaz.

   Yerel eklentiler www/native.js paketinde toplanır (scripts/build.mjs,
   native/entry.js) ve window.EvimNative olarak açılır. Bu modül onları
   uygulamanın geri kalanına bağlar:
   - Android geri tuşu, durum çubuğu, açılış ekranı
   - Uygulamayı açan bağlantılar (davet, e-posta doğrulama, şifre sıfırlama)
   - Anlık bildirim (APNs / FCM) izni ve cihaz anahtarı
   - İsteğe bağlı Face ID / parmak izi kilidi
   - Oturumun cihazın güvenli deposunda (Keychain / Keystore) saklanması */

import { t } from './i18n.js';

/** Yerel eklentiler; web'de null. */
export const N = globalThis.EvimNative || null;
export const isNative = !!(N && N.platform && N.platform !== 'web');
export const nativePlatform = isNative ? N.platform : 'web';

/* ---- güvenli oturum deposu ---- */

/** supabase-js'in oturumu yazdığı depo: Keychain (iOS) / Keystore (Android). */
export function secureStorage(){
  if (!isNative || !N.SecureStorage) return null;
  const S = N.SecureStorage;
  return {
    getItem: k => S.getItem(k),
    setItem: (k, v) => S.setItem(k, v),
    removeItem: k => S.removeItem(k)
  };
}

/* ---- açılış ---- */

let handlers = {};

/**
 * @param {{ onBack:()=>boolean|void, onUrl:(url:string)=>void, theme:()=>string }} h
 *   onBack true dönerse geri tuşu uygulama içinde karşılandı demektir.
 */
export function initNative(h){
  if (!isNative) return;
  handlers = h;
  document.documentElement.classList.add('native', 'native-' + N.platform);

  N.App.addListener('backButton', () => {
    if (handlers.onBack && handlers.onBack()) return;
    N.App.minimizeApp().catch(() => N.App.exitApp());
  });
  N.App.addListener('appUrlOpen', ev => { if (ev && ev.url && handlers.onUrl) handlers.onUrl(ev.url); });
  N.App.addListener('resume', () => maybeLock('resume'));
  N.App.addListener('pause', () => { pausedAt = Date.now(); });

  // Soğuk açılışta uygulamayı açan bağlantı.
  N.App.getLaunchUrl?.().then(r => { if (r && r.url && handlers.onUrl) handlers.onUrl(r.url); }).catch(() => {});

  applyStatusBar();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyStatusBar);
  maybeLock('launch');
}

/** Durum çubuğu metin rengi temaya uyar. */
export function applyStatusBar(){
  if (!isNative || !N.StatusBar) return;
  const theme = handlers.theme ? handlers.theme() : 'system';
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  N.StatusBar.setStyle({ style: dark ? N.Style.Dark : N.Style.Light }).catch(() => {});
  if (N.platform === 'android'){
    N.StatusBar.setBackgroundColor({ color: dark ? '#171512' : '#F7F1E8' }).catch(() => {});
  }
}

/** İlk çizimden sonra açılış ekranını kaldır. */
export function hideSplash(){
  if (isNative && N.SplashScreen) N.SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {});
}

/* ---- uygulamayı açan bağlantılar ---- */

/**
 * Bağlantıyı çözümler: e-posta dönüşündeki PKCE kodu ve uygulama içi adres.
 * Desteklenenler: https://<site>/katil/KOD, https://<site>/#/…, evim://auth?code=…
 * @returns {{ code:string|null, route:string|null }}
 */
export function parseOpenUrl(url){
  let u;
  try { u = new URL(url); } catch(e){ return { code:null, route:null }; }
  const code = u.searchParams.get('code');
  let route = null;
  if (u.hash && u.hash.length > 1) route = u.hash.slice(1);
  else {
    // evim://katil/KOD → host "katil"; https://site/katil/KOD → yol
    const path = (u.protocol === 'evim:' ? '/' + u.host + u.pathname : u.pathname).replace(/\/+$/, '');
    const m = path.match(/\/(katil|davet|giris|kayit|yeni-sifre)(\/[^/]+)?$/);
    if (m) route = '/' + m[1] + (m[2] || '');
  }
  return { code, route };
}

/* ---- anlık bildirim ---- */

let pushToken = null;

/** İzin durumu: 'on' | 'off' | 'denied'. */
export async function nativePushState(hasToken){
  const p = await N.PushNotifications.checkPermissions();
  if (p.receive === 'denied') return 'denied';
  return p.receive === 'granted' && hasToken ? 'on' : 'off';
}

/** İzin ister ve cihaz anahtarını döndürür (iOS: APNs, Android: FCM). */
export async function nativePushRegister(onTap){
  let p = await N.PushNotifications.checkPermissions();
  if (p.receive === 'prompt' || p.receive === 'prompt-with-rationale') p = await N.PushNotifications.requestPermissions();
  if (p.receive !== 'granted') return null;
  if (N.platform === 'android'){
    await N.PushNotifications.createChannel({ id:'evim', name:'Kiracım', description:t('Kira, dekont, talep ve mesaj bildirimleri'), importance:4 }).catch(() => {});
  }

  const token = await new Promise((resolve, reject) => {
    let done = false;
    N.PushNotifications.addListener('registration', r => { if (!done){ done = true; resolve(r.value); } });
    N.PushNotifications.addListener('registrationError', e => { if (!done){ done = true; reject(new Error(e && e.error || 'push')); } });
    N.PushNotifications.register();
    setTimeout(() => { if (!done){ done = true; reject(new Error(t('Bildirim kaydı zaman aşımına uğradı.'))); } }, 15000);
  });
  pushToken = token;
  listenTaps(onTap);
  return token;
}

let tapsBound = false;
/** Bildirime dokununca ilgili ekrana git. */
export function listenTaps(onTap){
  if (!isNative || tapsBound || !onTap) return;
  tapsBound = true;
  N.PushNotifications.addListener('pushNotificationActionPerformed', a => {
    const url = a && a.notification && a.notification.data && a.notification.data.url;
    if (url) onTap(String(url));
  });
}

export async function nativePushUnregister(){
  pushToken = null;
  await N.PushNotifications.unregister().catch(() => {});
}

/* ---- biyometrik kilit ---- */

const LOCK_KEY = 'evim-kilit';
const LOCK_AFTER = 60000;   // arka planda 1 dakikadan uzun kalınca sorar
let pausedAt = 0;
let unlocking = false;

export function lockEnabled(){
  try { return localStorage.getItem(LOCK_KEY) === '1'; } catch(e){ return false; }
}

/** Cihaz Face ID / Touch ID / parmak izi destekliyor mu? */
export async function biometryAvailable(){
  if (!isNative || !N.BiometricAuth) return false;
  try {
    const r = await N.BiometricAuth.checkBiometry();
    return !!(r.isAvailable || r.deviceIsSecure);
  } catch(e){ return false; }
}

/** Kilidi açar/kapatır; açarken bir kez doğrulama ister. */
export async function setLock(on){
  if (on && !(await authenticate())) return false;
  try { localStorage.setItem(LOCK_KEY, on ? '1' : '0'); } catch(e){}
  return true;
}

async function authenticate(){
  try {
    await N.BiometricAuth.authenticate({
      reason: t('Kiracım’ı açmak için kimliğini doğrula'),
      cancelTitle: t('Vazgeç'),
      allowDeviceCredential: true,
      androidTitle: t('Kiracım kilidi')
    });
    return true;
  } catch(e){ return false; }
}

function maybeLock(why){
  if (!lockEnabled()) return;
  if (why === 'resume' && Date.now() - pausedAt < LOCK_AFTER) return;
  showLock();
}

function showLock(){
  let el = document.getElementById('lock');
  if (!el){
    el = document.createElement('div');
    el.id = 'lock';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    document.body.appendChild(el);
  }
  el.innerHTML = '<div class="lockbox"><b>'+t('Kiracım kilitli')+'</b>' +
    '<button class="btn primary" type="button" id="unlockBtn">'+t('Kilidi aç')+'</button></div>';
  el.hidden = false;
  const go = async () => {
    if (unlocking) return;
    unlocking = true;
    const ok = await authenticate();
    unlocking = false;
    if (ok) el.hidden = true;
  };
  el.querySelector('#unlockBtn').onclick = go;
  go();
}
