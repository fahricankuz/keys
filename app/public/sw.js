/* Kiracım: eski uygulamanın servis çalışıcısını temizler.
   Eski sürüm telefonlara sayfaları kaydedip önce onları gösteriyordu (kiracim.online'da "bazen eski uygulama açılıyor").
   Tarayıcı bu dosyayı eski çalışıcının yerine koyar; bu da kayıtlı eski sayfaları siler, kendini kaldırır
   ve açık sekmeleri yeniler. Yeni sitede çevrimdışı önbellek yoktur; bu dosya silinmemeli. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const tabs = await self.clients.matchAll({ type: 'window' });
    tabs.forEach((c) => { try { c.navigate(c.url); } catch (e) { /* sekme kapanmış olabilir */ } });
  })());
});
