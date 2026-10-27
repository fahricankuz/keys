/* PWA: service worker kaydı, kurulum düğmesi, güncelleme ve çevrimdışı bildirimi. */

import { t } from './i18n.js';
import { notify } from './notify.js';
import { isNative } from './native.js';

export const pwa = {
  installable: false,     // tarayıcı kurulum penceresi sunabiliyor mu
  installed: false,       // ana ekrandan açıldı mı
  ios: /iphone|ipad|ipod/i.test(navigator.userAgent),
  registration: null,
  onChange: () => {}
};

let deferredPrompt = null;

export function initPwa(){
  pwa.installed = isNative || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    pwa.installable = true;
    pwa.onChange();
  });
  addEventListener('appinstalled', () => {
    deferredPrompt = null;
    pwa.installable = false;
    pwa.installed = true;
    pwa.onChange();
    notify({ title:t('Kiracım yüklendi'), body:t('Artık ana ekrandan açabilirsin.'), icon:'home' }, false);
  });

  addEventListener('offline', () => notify({ title:t('Çevrimdışısın'), body:t('Uygulama çalışmaya devam eder; değişiklikler bu cihazda saklanır.'), icon:'bell' }, false));
  addEventListener('online', () => notify({ title:t('Yeniden bağlandın'), body:t('Bağlantı geri geldi.'), icon:'bell' }, false));

  // Mağaza uygulamasında dosyalar zaten cihazda: service worker ve kurulum önerisi yok.
  if (!isNative) registerWorker();
}

async function registerWorker(){
  // Artifact gibi iframe ortamlarında ya da güvenli olmayan bağlantıda çalışmaz; sessizce geç.
  if (!('serviceWorker' in navigator)) return;
  const secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!secure) return;
  try {
    const reg = await navigator.serviceWorker.register('sw.js', { scope: './' });
    pwa.registration = reg;

    // Yalnızca kullanıcı "Yenile" dediğinde sayfa yenilenir; ilk kurulumda
    // clients.claim() da controllerchange tetikler ve o zaman yenilenmemeli.
    let updateRequested = false;
    const offerUpdate = worker => notify({
      title:t('Yeni sürüm hazır'), body:t('Güncellemek için yenile.'), icon:'home',
      actions:[{ label:t('Yenile'), run:() => { updateRequested = true; worker.postMessage('skipWaiting'); } }]
    }, false);

    if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!updateRequested) return;
      updateRequested = false;
      location.reload();
    });
  } catch(e){
    console.warn('Service worker kaydedilemedi', e);
  }
}

/** Kurulum penceresini açar. iOS'ta tarayıcı penceresi olmadığı için talimat döner. */
export async function install(){
  if (deferredPrompt){
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    pwa.installable = false;
    pwa.onChange();
    return choice && choice.outcome === 'accepted';
  }
  return false;
}
