/* Telefon uygulamasına anlık bildirim (iOS: APNs, Android: FCM). Cihaz anahtarı device_tokens tablosuna yazılır;
   sunucu (supabase/functions/push → native.ts) yeni bildirimi bu anahtarlara gönderir. Bildirime dokununca
   paneldeki ilgili ekran açılır (yük: url, ör. /uygulama/sitem). Web: native-push.js. */

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { LIVE } from './config.js';
import { client, live } from './backend.js';

let token = null;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** İzin ister (ilk kez), cihaz anahtarını alır ve kaydeder. Dönen: 'on' | 'denied' | 'off'. */
export async function registerDevice(){
  if (!LIVE || !live.user?.id || (Platform.OS !== 'ios' && Platform.OS !== 'android')) return 'off';
  try {
    if (Platform.OS === 'android') {
      // Sunucu Android bildirimlerini "evim" kanalına gönderir (native.ts → channel_id).
      await Notifications.setNotificationChannelAsync('evim', { name: 'anahtar', importance: Notifications.AndroidImportance.HIGH });
    }
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return 'denied';
    const t = await Notifications.getDevicePushTokenAsync();
    token = String(t.data);
    const r = await (await client()).from('device_tokens').upsert({ token, user_id: live.user.id, platform: Platform.OS }, { onConflict: 'token' });
    if (r.error) throw r.error;
    return 'on';
  } catch (e) {
    // Android'de Firebase dosyası (google-services.json) olmadan anahtar alınamaz; uygulama bildirimsiz çalışmayı sürdürür.
    console.warn('Bildirim kaydı yapılamadı', e);
    return 'off';
  }
}

/** Çıkışta bu cihazın anahtarı silinir (başka hesaba bildirim gitmesin). */
export async function unregisterDevice(){
  if (!token) return;
  try { await (await client()).from('device_tokens').delete().eq('token', token); } catch {}
  token = null;
}

const pathOf = (r) => {
  const d = r && r.notification && r.notification.request && r.notification.request.content && r.notification.request.content.data;
  const url = d && typeof d.url === 'string' ? d.url : '';
  return /^\/(?![\/\\])/.test(url) ? url : '/uygulama';
};

/** Bildirime dokunulunca (uygulama kapalıyken açıldıysa da) go(yol) çağrılır. Dinlemeyi bırakan işlevi döner. */
export function listenNotificationTaps(go){
  Notifications.getLastNotificationResponseAsync().then((r) => { if (r) go(pathOf(r)); }).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener((r) => go(pathOf(r)));
  return () => sub.remove();
}
