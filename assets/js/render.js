/* Tek giriş noktalı çizim: rota değişince ekran, sekmeler, panel ve katman yenilenir. */

import { t } from './i18n.js';
import { S, ui } from './state.js';
import { current } from './router.js';
import { tenantScreen, landlordScreen, tabbar, shell } from './views.js';
import { renderLayer } from './sheets.js';
import { tourBar } from './tour.js';
import { authScreen } from './auth.js';
import { LIVE } from './config.js';
import { live } from './backend.js';

let lastKey = null;

export function render(){
  const route = current();
  const screen = document.getElementById('screen');
  const phone = document.querySelector('.phone');

  const key = route.role + '|' + route.path;
  const keepScroll = key === lastKey ? screen.scrollTop : 0;

  const authView = !!route.auth || (LIVE && !live.user);
  const loading = LIVE && live.user && !live.loaded && !route.auth;
  phone.classList.toggle('bare', authView || loading);

  if (loading) screen.innerHTML = loadingScreen();
  else if (authView) screen.innerHTML = authScreen(route);
  else screen.innerHTML = route.role === 'tenant' ? tenantScreen(route) : landlordScreen(route);
  screen.scrollTop = keepScroll;
  lastKey = key;

  document.getElementById('tabbar').innerHTML = authView || loading ? '' : tabbar(route);
  document.getElementById('shell').innerHTML = shell(route, authView || loading);
  document.getElementById('tour').innerHTML = authView || loading ? '' : tourBar();

  // Sohbet ekranı ilk açılışta en alta kaydırılır.
  const chat = document.getElementById('chat');
  if (chat && ui.lastChatKey !== key){
    screen.scrollTop = screen.scrollHeight;
    ui.lastChatKey = key;
  }
  if (!chat) ui.lastChatKey = null;

  renderLayer(authView || loading ? { sheet:null, params:{} } : route);
  document.title = titleFor(route, authView);
}

function loadingScreen(){
  return ('<div class="auth center"><div class="spinner" role="status" aria-label="'+t('Yükleniyor')+'"></div>') +
    ('<div class="muted">'+t('Verilerin yükleniyor…')+'</div></div>');
}

let deferred = false;

/**
 * Arka planda gelen değişiklikler için çizim. Kullanıcı bir alana yazıyorsa
 * odağı kaybetmemesi için çizim alan bırakılana kadar ertelenir.
 */
export function softRender(){
  const a = document.activeElement;
  const typing = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT') &&
    (a.closest('#screen') || a.closest('#layer'));
  if (typing){
    if (!deferred){
      deferred = true;
      a.addEventListener('blur', () => { deferred = false; setTimeout(render, 0); }, { once:true });
    }
    return;
  }
  render();
}

const TENANT_TITLES = { panel:t('Panel'), pay:t('Ödemeler'), req:t('Talepler'), msg:t('Mesajlar'), docs:t('Belgeler'), agenda:t('Takvim') };
const LANDLORD_TITLES = { portfolio:t('Portföy'), lreq:t('Talepler'), lmsg:t('Mesajlar'), report:t('Rapor'), agenda:t('Takvim') };
const AUTH_TITLES = { giris:t('Giriş yap'), kayit:t('Kayıt'), sifre:t('Şifre sıfırlama'), 'yeni-sifre':t('Yeni şifre'), katil:t('Davet'), davet:t('Mülke bağlan') };

function titleFor(route, authView){
  if (authView) return (AUTH_TITLES[route.auth] || t('Giriş yap')) + (' '+t('· Kiracım'));
  if (route.role === 'landlord'){
    if (route.pid && S.props[route.pid]) return S.props[route.pid].name + (' '+t('· Kiracım'));
    return (LANDLORD_TITLES[route.tab] || t('Kiracım')) + (' '+t('· Kiracım'));
  }
  return (TENANT_TITLES[route.tab] || t('Kiracım')) + (' '+t('· Kiracım'));
}

/** Yalnızca katmanı yeniler (form içi anlık güncellemeler için). */
export function refreshLayer(){ renderLayer(current()); }
