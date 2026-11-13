/* Telefon uygulamasına anlık bildirim: web sürümü. Web'de tarayıcı bildirimi webpush.js ile çalışır;
   bu dosya telefon sürümüyle (native-push.native.js) aynı arayüzü verir. */
export async function pushPermission(){ return 'off'; }
export async function registerDevice(){ return 'off'; }
export async function enableDevicePush(){ return 'off'; }
export async function unregisterDevice(){}
export function noteSession(){}
export async function shouldPrimePush(){ return false; }
export function markPrimed(){}
export const pathOf = () => '/uygulama';
export function listenNotificationTaps(go){ void go; return () => {}; }
