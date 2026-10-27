/* Ekran üstü bildirim şeridi ve olay geçmişi. */

import { t } from './i18n.js';
import { S, save } from './state.js';
import { I } from './icons.js';
import { esc, announce } from './util.js';

const timers = new WeakMap();

/**
 * Bildirim gösterir.
 * @param {{title:string, body:string, icon?:string, actions?:{label:string, run:Function}[]}} n
 * @param {boolean} [log=true] false ise geçmişe yazılmaz (yalnızca anlık bilgi).
 */
export function notify(n, log = true){
  if (log !== false){
    S.inbox.push({ title:n.title, body:n.body, at:Date.now(), read:false, go:n.go || null });
    if (S.inbox.length > 40) S.inbox.shift();
    save();
  }

  const box = document.getElementById('banners');
  if (!box) return;

  const el = document.createElement('div');
  el.className = 'banner';
  el.setAttribute('role', 'status');
  el.innerHTML =
    '<div class="ic">'+(I[n.icon] || I.bell)+'</div>' +
    '<div class="tx"><div class="tt">'+esc(n.title)+'</div><div class="bd">'+esc(n.body)+'</div>' +
    (n.actions ? '<div class="ba">'+n.actions.map((a,i) =>
      '<button class="btn small '+(i===0?'primary':'ghost')+'" data-b="'+i+'">'+esc(a.label)+'</button>').join('')+'</div>' : '') +
    ('</div><button class="x" aria-label="'+t('Bildirimi kapat')+'">')+I.x.replace('<svg','<svg width="18" height="18"')+'</button>';

  el.addEventListener('click', ev => {
    const b = ev.target.closest('[data-b]');
    if (b){ n.actions[Number(b.dataset.b)].run(); dismiss(el); return; }
    if (ev.target.closest('.x')) dismiss(el);
  });

  box.appendChild(el);
  announce(n.title + '. ' + n.body);
  timers.set(el, setTimeout(() => dismiss(el), n.actions ? 12000 : 6000));
}

function dismiss(el){
  clearTimeout(timers.get(el));
  if (el.parentNode) el.remove();
}

export function clearBanners(){
  const box = document.getElementById('banners');
  if (box) box.innerHTML = '';
}
