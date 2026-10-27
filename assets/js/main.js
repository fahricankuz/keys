/* Uygulamayı ayağa kaldırır: rota, olay dinleyicileri, klavye ve açılış bildirimleri. */

import { t } from './i18n.js';
import { S, ui, save, applyTheme, bootInfo, themeHook } from './state.js';
import { start, onChange, go, closeSheet, current, back } from './router.js';
import { render } from './render.js';
import { A, onSubmit, onInput, onChangeField, blockedAct } from './actions.js';
import { trapFocus } from './sheets.js';
import { handleKey as handleConfirmKey } from './confirm.js';
import { reminders, normalizeAll } from './logic.js';
import { notify } from './notify.js';
import { up } from './util.js';
import { isActive as tourActive } from './tour.js';
import { initPwa, pwa } from './pwa.js';
import { LIVE } from './config.js';
import * as backend from './backend.js';
import { guard as authGuard, onAuthEvent, handleJoinRoute, setRerender, markRecovery } from './auth.js';
import { guard, recheck } from './router.js';
import { softRender } from './render.js';
import { initNative, isNative, parseOpenUrl, hideSplash, listenTaps, applyStatusBar } from './native.js';

applyTheme();

// index.html'deki sabit metinler.
document.querySelector('.skip').textContent = t('İçeriğe geç');
document.getElementById('shell').setAttribute('aria-label', t('Gezinme paneli'));
document.getElementById('tabbar').setAttribute('aria-label', t('Ana menü'));

// Süresi dolan sözleşmeleri uzat, güncel kirayı geçmişten oku.
if (normalizeAll()) save();

/* ---- olay delegasyonu ---- */

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  // Scrim yalnızca kendisine tıklanınca kapanır, içeriğe tıklanınca değil.
  if (el.dataset.self && ev.target !== el) return;
  const fn = A[el.dataset.act];
  if (!fn) return;
  ev.preventDefault();
  if (blockedAct(el.dataset.act)) return;
  fn(el.dataset, el, ev);
});

document.addEventListener('submit', onSubmit);
document.addEventListener('input', onInput);
document.addEventListener('change', onChangeField);

/* ---- klavye ---- */

const TAB_KEYS = {
  tenant:['/kiraci','/kiraci/odemeler','/kiraci/talepler','/kiraci/mesajlar','/kiraci/belgeler'],
  landlord:['/mulk-sahibi','/mulk-sahibi/talepler','/mulk-sahibi/mesajlar','/mulk-sahibi/takvim','/mulk-sahibi/rapor']
};

document.addEventListener('keydown', ev => {
  if (handleConfirmKey(ev)) return;
  trapFocus(ev);

  if (ev.key === 'Escape'){
    if (current().sheet){ closeSheet(); return; }
    if (tourActive()){ A.tourEnd(); return; }
  }

  // Alt + ← geri, Alt + 1..5 sekmeler, Alt + K arama.
  if (!ev.altKey || ev.ctrlKey || ev.metaKey) return;

  if (ev.key === 'ArrowLeft'){ ev.preventDefault(); back(); return; }
  if (ev.key.toLowerCase() === 'k'){ ev.preventDefault(); A.sheet({ s:'arama' }); return; }

  const n = Number(ev.key);
  if (n >= 1 && n <= 5){
    const list = TAB_KEYS[ui.role] || TAB_KEYS.tenant;
    ev.preventDefault();
    go(list[n-1]);
  }
});

/* ---- kenardan kaydırarak geri ---- */

let touchX = null, touchY = null;
const phone = document.querySelector('.phone');

phone.addEventListener('touchstart', ev => {
  const tp = ev.touches[0];
  touchX = tp.clientX <= 28 ? tp.clientX : null;
  touchY = tp.clientY;
}, { passive:true });

phone.addEventListener('touchend', ev => {
  if (touchX == null) return;
  const tp = ev.changedTouches[0];
  const dx = tp.clientX - touchX, dy = Math.abs(tp.clientY - touchY);
  touchX = null;
  if (dx > 70 && dy < 60) back();
}, { passive:true });

/* ---- açılış ---- */

onChange(route => {
  render();
  if (LIVE) handleJoinRoute(route);
});

pwa.onChange = () => render();
initPwa();

/* ---- iOS / Android ---- */

/** Uygulamayı açan bağlantı: e-posta dönüşü (PKCE kodu) ya da uygulama içi adres. */
async function openAppUrl(url){
  const { code, route } = parseOpenUrl(url);
  if (code && LIVE){
    try {
      // Kod değişimi "oturum açıldı" olayını da tetikler; şifre sıfırlamada yeni şifre ekranı kazanmalı.
      const d = await backend.exchangeCode(code);
      if (d && d.redirectType === 'recovery'){ markRecovery(); onAuthEvent('recovery'); }
    } catch(e){
      notify({ title:t('Bağlantı açılamadı'), body: backend.humanError(e), icon:'bell' }, false);
    }
  }
  if (route) go(route);
}

const ROOTS = ['/kiraci', '/mulk-sahibi', '/giris'];
initNative({
  theme: () => S.theme,
  onUrl: openAppUrl,
  // Android geri tuşu: önce açık pencere, sonra alt sayfa, sonra geçmiş; kökte uygulamayı küçült.
  onBack: () => {
    if (handleConfirmKey({ key:'Escape', preventDefault(){} })) return true;
    if (current().sheet){ closeSheet(); return true; }
    if (tourActive()){ A.tourEnd(); return true; }
    if (ROOTS.includes(current().path)) return false;
    back();
    return true;
  }
});
themeHook.fn = applyStatusBar;
const goNote = url => go(String(url).replace(/^.*#/, '') || '/');
backend.setPushTap(goNote);
if (isNative) listenTaps(goNote);

if (LIVE){
  guard.fn = authGuard;
  setRerender(() => render());
  backend.setHandlers({
    onData: (info = {}) => {
      if (info.notification){
        const n = info.notification;
        notify({ title:n.title, body:n.body, icon:'bell', actions: n.go ? [{ label:t('Git'), run:() => go(n.go) }] : undefined }, false);
      }
      if (info.soft) softRender(); else render();
    },
    onAuth: evt => onAuthEvent(evt)
  });
  start();                       // yükleniyor ya da giriş ekranı
  try {
    await backend.init();
    if (backend.live.user){
      ui.meTenant = backend.live.user.id;
      await backend.openSession();
    }
  } catch(e){
    console.error(e);
    notify({ title:t('Sunucuya bağlanılamadı'), body: backend.humanError(e), icon:'bell',
      actions:[{ label:t('Tekrar dene'), run:() => location.reload() }] }, false);
  }
  recheck();
} else {
  start();
}
hideSplash();

if (bootInfo.migratedFrom){
  setTimeout(() => notify({ title:t('Verin güncellendi'), body:t('Kayıtlı verin yeni sürüme taşındı; eski hali yedek olarak saklandı.'), icon:'doc' }, false), 400);
} else if (bootInfo.newer){
  setTimeout(() => notify({ title:t('Salt okunur mod'), body:t('Bu veri uygulamanın daha yeni bir sürümüyle kaydedilmiş. Değişiklikler kaydedilmeyecek.'), icon:'doc' }, false), 400);
}

if (!LIVE && !S.seenHint){
  S.seenHint = true;
  save();
  setTimeout(() => notify({
    title:t('Hoş geldin'),
    body:t('Üstteki hapla kiracı ve mülk sahibi görünümleri arasında geçebilirsin. Rehberli tur için ayarlara bak.'),
    icon:'home',
    actions:[{ label:t('Rehberli tur'), run:() => A.startTour() }]
  }, false), 700);
}

setTimeout(() => {
  if (current().sheet || current().auth || tourActive() || (LIVE && !backend.live.loaded)) return;
  const r = reminders()[0];
  if (r) notify({
    title: up(r.t), body:r.b, icon:'bell',
    actions:[{ label:t('Git'), run:() => go(r.go) }]
  }, false);
}, 2200);
