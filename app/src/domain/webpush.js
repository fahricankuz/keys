/* Tarayıcıda anlık bildirim (Web Push): izin, servis çalışıcısı (public/bildirim-sw.js) ve abonelik (push_subscriptions).
   Sunucu tarafı: supabase/functions/push (VAPID anahtarları). Anahtar tanımlı değilse özellik görünmez. */

import { Platform } from 'react-native';
import { CONFIG, LIVE } from './config.js';
import { client, live } from './backend.js';

const SW = '/bildirim-sw.js';
const b64 = (s) => {
  const p = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
};

/** 'off' (anahtar yok ya da web değil) | 'unsupported' | 'ios-home' (iPhone'da ana ekrana eklenmeli) | 'denied' | 'ready' (açılabilir) | 'on' */
export async function pushState(){
  if (!LIVE || Platform.OS !== 'web' || !CONFIG.vapidPublicKey) return 'off';
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined'){
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent || '');
    const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    return ios && !standalone ? 'ios-home' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg && reg.active && /bildirim-sw\.js$/.test(reg.active.scriptURL) ? await reg.pushManager.getSubscription() : null;
  return sub ? 'on' : 'ready';
}

export async function enablePush(){
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'ready';
  const reg = await navigator.serviceWorker.register(SW, { scope: '/' });
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(CONFIG.vapidPublicKey) });
  const j = sub.toJSON();
  const r = await (await client()).from('push_subscriptions').upsert({ endpoint: j.endpoint, user_id: live.user?.id, keys: j.keys });
  if (r.error) throw r.error;
  return 'on';
}

export async function disablePush(){
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub){
    await (await client()).from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  }
  return 'ready';
}
