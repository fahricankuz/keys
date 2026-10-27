/* Kiracım service worker: çevrimdışı çalışma ve anlık bildirimler.
   Yeni sürüm yayınlarken CACHE sürümünü artırın; testler SHELL listesinin
   assets/ klasörüyle eşleştiğini denetler. */

const CACHE = 'evim-v7';

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/js/actions.js',
  './assets/js/auth.js',
  './assets/js/backend.js',
  './assets/js/billing.js',
  './assets/js/config.js',
  './assets/js/confirm.js',
  './assets/js/en.js',
  './assets/js/i18n.js',
  './assets/js/icons.js',
  './assets/js/logic.js',
  './assets/js/main.js',
  './assets/js/mapping.js',
  './assets/js/migrate.js',
  './assets/js/native.js',
  './assets/js/notify.js',
  './assets/js/pwa.js',
  './assets/js/render.js',
  './assets/js/router.js',
  './assets/js/sheets.js',
  './assets/js/state.js',
  './assets/js/tax.js',
  './assets/js/tour.js',
  './assets/js/util.js',
  './assets/js/views.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('evim-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Sayfa "yenile" dediğinde bekleyen sürüm hemen devreye girer.
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Yalnızca kendi dosyalarımız ve yazı tipleri önbelleğe alınır;
  // sunucu (Supabase) istekleri her zaman ağa gider.
  const sameOrigin = url.origin === self.location.origin;
  // Yazı tipleri ve supabase-js modülü (jsDelivr) çevrimdışı açılış için önbelleğe alınır.
  const cdn = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname) || url.hostname === 'cdn.jsdelivr.net';
  if (!sameOrigin && !cdn) return;

  // Önce önbellek, arka planda güncelle (stale-while-revalidate).
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: sameOrigin });
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit){ event.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    // Çevrimdışı ve önbellekte yok: sayfa istekleri için uygulama kabuğu.
    if (req.mode === 'navigate') return cache.match('./index.html');
    return new Response('', { status: 504, statusText: 'Çevrimdışı' });
  })());
});

/* ---- anlık bildirimler ---- */

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch(e){ data = { title:'Kiracım', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Kiracım', {
    body: data.body || '',
    icon: './assets/icons/icon-192.png',
    badge: './assets/icons/icon-192.png',
    tag: data.tag || undefined,
    data: { url: data.url || './#/' }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './#/', self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
    for (const w of wins){
      if (w.url.startsWith(self.registration.scope)){
        await w.focus();
        w.navigate(target);
        return;
      }
    }
    await self.clients.openWindow(target);
  })());
});
