/* anahtar: anlık bildirim servis çalışıcısı (Web Push). Önbellek tutmaz, sayfaları değiştirmez; yalnız bildirimi gösterir
   ve dokununca ilgili ekranı açar. Sunucu: supabase/functions/push (VAPID). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = { body: event.data ? event.data.text() : '' }; }
  const url = typeof d.url === 'string' && /^\/(?![\/\\])/.test(d.url) ? d.url : '/uygulama';   // yalnız site içi yol; //alan ya da /\ dışarı çıkar
  event.waitUntil(self.registration.showNotification(d.title || 'anahtar', {
    body: d.body || '', tag: d.tag || undefined, icon: '/icon-192.png', badge: '/icon-192.png', data: { url }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/uygulama';
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const same = tabs.find((c) => new URL(c.url).origin === self.location.origin);
    if (same){ await same.focus(); try { await same.navigate(url); } catch (e) { /* başka kökene geçilmez */ } return; }
    await self.clients.openWindow(url);
  })());
});
