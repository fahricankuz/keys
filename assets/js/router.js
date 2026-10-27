/* Hash tabanlı yönlendirme.
   Her ekranın bir adresi var; geri/ileri, yenileme ve derin link çalışır.
   Örnek: #/mulk-sahibi/mulk/moda/odeme?s=dekont&key=2026-09
   Eski adresler (#/ev-sahibi/ev/…) yeni karşılıklarına yönlenir. */

import { t } from './i18n.js';
import { S, ui } from './state.js';

/** Hesap ekranları (giriş, kayıt…) — rol sekmelerinin dışında. */
const AUTH = ['giris', 'kayit', 'sifre', 'yeni-sifre', 'katil', 'davet'];

/** Gerçek hesap modunda main.js tarafından ayarlanır: yönlendirilecek adresi döndürür. */
export const guard = { fn: null };

const listeners = [];

/** Kiracı sekmeleri: yol parçası ↔ sekme kimliği. */
const TENANT_TABS = {
  '': 'panel',
  'odemeler': 'pay',
  'talepler': 'req',
  'mesajlar': 'msg',
  'belgeler': 'docs',
  'takvim': 'agenda'
};
const LANDLORD_TABS = {
  '': 'portfolio',
  'talepler': 'lreq',
  'mesajlar': 'lmsg',
  'rapor': 'report',
  'takvim': 'agenda'
};

export const TENANT_PATH = { panel:'/kiraci', pay:'/kiraci/odemeler', req:'/kiraci/talepler', msg:'/kiraci/mesajlar', docs:'/kiraci/belgeler', agenda:'/kiraci/takvim' };
export const LANDLORD_PATH = { portfolio:'/mulk-sahibi', lreq:'/mulk-sahibi/talepler', lmsg:'/mulk-sahibi/mesajlar', report:'/mulk-sahibi/rapor', agenda:'/mulk-sahibi/takvim' };

export const PROP_SUBS = [['ozet',t('Özet')],['odeme',t('Ödemeler')],['talep',t('Talepler')],['mesaj',t('Mesajlar')],['belge',t('Belgeler')],['tutanak',t('Tutanak')],['gider',t('Giderler')]];
/** Şeritte görünmeyen ama adresle açılan bölümler. */
const EXTRA_SUBS = ['cikis'];

function parseQuery(s){
  const out = {};
  if (!s) return out;
  s.replace(/^\?/,'').split('&').forEach(pair => {
    if (!pair) return;
    const i = pair.indexOf('=');
    const k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i));
    out[k] = i < 0 ? '' : decodeURIComponent(pair.slice(i+1).replace(/\+/g,' '));
  });
  return out;
}

function buildQuery(params){
  const keys = Object.keys(params || {}).filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '');
  if (!keys.length) return '';
  return '?' + keys.map(k => encodeURIComponent(k)+'='+encodeURIComponent(params[k])).join('&');
}

/** Geçerli hash'i rota nesnesine çevirir; tanınmayan adres kiracı paneline düşer. */
/** Eski (v3) adresleri yenisine çevirir: /ev-sahibi/ev/x → /mulk-sahibi/mulk/x */
export function canonical(h){
  return h.replace(/^\/ev-sahibi(\/ev(?=\/|$))?/, (m, e) => '/mulk-sahibi' + (e ? '/mulk' : ''));
}

export function parseRoute(hash){
  let h = canonical(String(hash || '').replace(/^#/, ''));
  if (!h || h === '/') h = '/kiraci';
  const qi = h.indexOf('?');
  const path = (qi < 0 ? h : h.slice(0, qi)).replace(/\/+$/,'') || '/kiraci';
  const params = parseQuery(qi < 0 ? '' : h.slice(qi));
  const seg = path.split('/').filter(Boolean);

  // base: sheet kapandığında dönülecek adres (derin linkteki kimlik parçası hariç).
  const r = { path, base: path, params, sheet: params.s || null, role:'tenant', tab:'panel', pid:null, sub:null, reqId: params.req || null, auth:null, code:null };

  if (AUTH.includes(seg[0])){
    r.auth = seg[0];
    r.code = seg[1] ? decodeURIComponent(seg[1]) : null;
    r.role = ui.role || 'tenant';
    r.tab = null;
    return r;
  }

  if (seg[0] === 'mulk-sahibi'){
    r.role = 'landlord';
    if (seg[1] === 'mulk'){
      r.tab = 'portfolio';
      r.pid = S.props[seg[2]] ? seg[2] : S.order[0];
      r.sub = PROP_SUBS.some(s => s[0] === seg[3]) || EXTRA_SUBS.includes(seg[3]) ? seg[3] : 'ozet';
    } else {
      r.tab = LANDLORD_TABS[seg[1] || ''] || 'portfolio';
    }
  } else {
    r.role = 'tenant';
    r.tab = TENANT_TABS[seg[1] || ''] || 'panel';
    if (r.tab === 'docs' && (seg[2] === 'tutanak' || seg[2] === 'cikis')) r.sub = seg[2];
    // /kiraci/talepler/<id> doğrudan talep detayını açar.
    if (r.tab === 'req' && seg[2]){ r.reqId = seg[2]; r.base = '/kiraci/talepler'; if (!r.sheet) r.sheet = 'talep'; }
  }
  return r;
}

let route = parseRoute(location.hash);
let pushes = 0;          // bu oturumda kendi eklediğimiz geçmiş kaydı sayısı
let sheetPushed = false; // açık sheet geçmişe kayıt bıraktı mı (derin linkte bırakmaz)

export function current(){ return route; }

/** Adrese gider. replace=true geçmişe kayıt bırakmaz. */
export function go(path, opts = {}){
  const target = '#' + (path.startsWith('/') ? path : '/'+path);
  if (location.hash === target){ sync(); return; }
  if (opts.replace){
    history.replaceState(null, '', target);
    sync();
  } else {
    pushes++;
    location.hash = target;   // akışı hashchange devralır
  }
}

/** Geçerli sayfanın üstünde bir sayfa (sheet) açar. */
export function openSheet(name, params = {}){
  const r = current();
  const willPush = !r.sheet;
  go(r.base + buildQuery(Object.assign({}, params, { s: name })));
  if (willPush) sheetPushed = true;
}

/**
 * Açık sheet'i kapatır. Sheet'i biz açtıysak geri giderek geçmişi temiz tutar;
 * doğrudan link ile açılmışsa adresi değiştirerek kapatır.
 * Sheet açık değilse hiçbir şey yapmaz — böylece normal ekrandaki bir düğme
 * yanlışlıkla geçmişte geri gitmez.
 */
export function closeSheet(){
  const r = current();
  if (!r.sheet) return;
  if (sheetPushed && pushes > 0){
    sheetPushed = false;
    pushes--;
    history.back();
    return;
  }
  sheetPushed = false;
  go(r.base, { replace:true });
}

/** Rotayı değiştirmeden query parametrelerini günceller. */
export function setParams(patch, opts = { replace:true }){
  const r = current();
  go(r.path + buildQuery(Object.assign({}, r.params, patch)), opts);
}

export function back(){
  if (pushes > 0){ pushes--; history.back(); }
  else go(ui.role === 'landlord' ? '/mulk-sahibi' : '/kiraci', { replace:true });
}

export function onChange(fn){ listeners.push(fn); }

function sync(){
  const legacy = canonical(location.hash.slice(1));
  if ('#' + legacy !== location.hash) history.replaceState(null, '', '#' + legacy);
  route = parseRoute(location.hash);
  const redirect = guard.fn && guard.fn(route);
  if (redirect && redirect !== route.path){
    history.replaceState(null, '', '#' + redirect);
    route = parseRoute(location.hash);
  }
  if (!route.sheet) sheetPushed = false;
  if (!route.auth) ui.role = route.role;
  listeners.forEach(fn => fn(route));
}

/** Koruma kurallarını geçerli adrese yeniden uygular (ör. oturum açılınca). */
export function recheck(){ sync(); }

export function start(){
  addEventListener('hashchange', sync);
  if (!location.hash) history.replaceState(null, '', '#/kiraci');
  sync();
}

/** Ekran haritası — masaüstü gezinme panelinde ve harita sheet'inde kullanılır. */
export function screenMap(){
  const tenant = [
    { label:t('Panel'), path:'/kiraci', icon:'home' },
    { label:t('Ödemeler'), path:'/kiraci/odemeler', icon:'card' },
    { label:t('Talepler'), path:'/kiraci/talepler', icon:'wrench' },
    { label:t('Mesajlar'), path:'/kiraci/mesajlar', icon:'chat' },
    { label:t('Belgeler'), path:'/kiraci/belgeler', icon:'doc' },
    { label:t('Giriş tutanağı'), path:'/kiraci/belgeler/tutanak', icon:'key', depth:1 },
    { label:t('Çıkış ve depozito'), path:'/kiraci/belgeler/cikis', icon:'key', depth:1 },
    { label:t('Takvim'), path:'/kiraci/takvim', icon:'calendar' }
  ];
  const landlord = [
    { label:t('Portföy'), path:'/mulk-sahibi', icon:'grid' },
    ...S.order.map(id => ({ label:S.props[id].name, path:'/mulk-sahibi/mulk/'+id, icon:'home', depth:1 })),
    { label:t('Tüm talepler'), path:'/mulk-sahibi/talepler', icon:'wrench' },
    { label:t('Mesajlar'), path:'/mulk-sahibi/mesajlar', icon:'chat' },
    { label:t('Takvim'), path:'/mulk-sahibi/takvim', icon:'calendar' },
    { label:t('Rapor'), path:'/mulk-sahibi/rapor', icon:'chart' }
  ];
  return { tenant, landlord };
}
