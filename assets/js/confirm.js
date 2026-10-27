/* Uygulama içi onay penceresi.
   Tarayıcının confirm() penceresi iframe içinde (ör. artifact) engellenebildiği
   için onaylar uygulamanın kendi katmanında sorulur. */

import { t } from './i18n.js';
import { esc } from './util.js';

let pending = null;

/**
 * Kullanıcıya onay sorar.
 * @param {{title:string, body?:string, ok?:string, cancel?:string, danger?:boolean}} o
 * @returns {Promise<boolean>}
 */
export function ask(o){
  if (pending) pending.resolve(false);
  const host = document.getElementById('confirm');
  const prevFocus = document.activeElement;

  return new Promise(resolve => {
    const done = v => {
      host.innerHTML = '';
      pending = null;
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus();
      resolve(v);
    };
    pending = { resolve: done };

    host.innerHTML =
      '<div class="scrim center" data-confirm="cancel">' +
        '<div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="cfT" aria-describedby="cfB">' +
          '<h3 id="cfT">'+esc(o.title)+'</h3>' +
          (o.body ? '<p id="cfB" class="muted">'+esc(o.body)+'</p>' : '') +
          '<div class="row"><button class="btn ghost" style="flex:1" data-confirm="cancel">'+esc(o.cancel || t('Vazgeç'))+'</button>' +
          '<button class="btn '+(o.danger ? 'danger' : 'primary')+'" style="flex:1" data-confirm="ok">'+esc(o.ok || t('Tamam'))+'</button></div>' +
        '</div></div>';

    host.querySelector('[data-confirm="cancel"].btn').focus();
    host.onclick = ev => {
      const b = ev.target.closest('[data-confirm]');
      if (!b) return;
      // Arka plana tıklama yalnızca doğrudan scrim'e ise iptal sayılır.
      if (b.classList.contains('scrim') && ev.target !== b) return;
      ev.stopPropagation();
      done(b.dataset.confirm === 'ok');
    };
  });
}

export function isOpen(){ return pending != null; }

/** Esc ve Tab'ı onay penceresi açıkken yakalar. true dönerse olay tüketildi. */
export function handleKey(ev){
  if (!pending) return false;
  if (ev.key === 'Escape'){ ev.preventDefault(); pending.resolve(false); return true; }
  if (ev.key === 'Tab'){
    const btns = [...document.querySelectorAll('#confirm .btn')];
    const i = btns.indexOf(document.activeElement);
    ev.preventDefault();
    btns[(i + (ev.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
    return true;
  }
  return false;
}
