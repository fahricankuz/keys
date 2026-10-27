/* Tarih, biçimlendirme ve küçük yardımcılar. */

import { locale, t } from './i18n.js';

export const DAY = 864e5;

export function t0(){ const d = new Date(); d.setHours(0,0,0,0); return d; }
export function iso(d){ d = new Date(d); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
export function parse(s){ const p = String(s).split('-').map(Number); return new Date(p[0], p[1]-1, p[2]||1); }
export function add(d,n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
export function addM(d,n){ const x = new Date(d); x.setMonth(x.getMonth()+n); return x; }
export function mkey(d){ d = new Date(d); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
export function between(a,b){ return Math.round((b-a)/DAY); }
export function daysTo(s){ return between(t0(), parse(s)); }

export function fmt(d){ return new Date(d).toLocaleDateString(locale(),{day:'numeric',month:'long'}); }
export function fmtFull(d){ return new Date(d).toLocaleDateString(locale(),{day:'numeric',month:'long',year:'numeric'}); }
export function monthName(k){
  const s = parse(k+'-01').toLocaleDateString(locale(),{month:'long'});
  return up(s);
}
export function monthYear(k){
  const d = parse(k+'-01');
  return up(d.toLocaleDateString(locale(),{month:'long'})) + ' ' + d.getFullYear();
}
export function up(s){ s = String(s); return s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1); }
// Yüzde: Türkçede işaret önde (%4,4), İngilizcede sonda (4.4%). v zaten yüzde cinsinden.
export function percent(v, digits = 1){
  const n = Number(v).toLocaleString(locale(), { maximumFractionDigits:digits });
  return locale().startsWith('tr') ? '%' + n : n + '%';
}
export function tl(n){ return '₺' + Math.round(Number(n)||0).toLocaleString(locale()); }
export function tm(ts){ return new Date(ts).toLocaleTimeString(locale(),{hour:'2-digit',minute:'2-digit'}); }

/** Bugün / dün / tarih — sohbet gün ayraçları için. */
export function dayLabel(ts){
  const d = new Date(ts); d.setHours(0,0,0,0);
  const diff = between(d, t0());
  if (diff === 0) return t('Bugün');
  if (diff === 1) return t('Dün');
  return fmtFull(d);
}

/** Göreli zaman: "3 gün önce", "az önce". */
export function ago(ts){
  const m = Math.round((Date.now()-ts)/60000);
  if (m < 1) return t('az önce');
  if (m < 60) return t('{n} dk önce', { n:m });
  const h = Math.round(m/60);
  if (h < 24) return t('{n} saat önce', { n:h });
  const d = Math.round(h/24);
  if (d < 30) return t('{n} gün önce', { n:d });
  return fmtFull(ts);
}

const ESCAPES = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
export function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ESCAPES[c]); }

/** Seçenekler: değer Türkçe saklanır, etiket çevrilir. */
export function opts(list, v){
  return list.map(o => '<option'+(o===v?' selected':'')+' value="'+esc(o)+'">'+esc(t(o))+'</option>').join('');
}

/** Türkçe duyarsız arama karşılaştırması. */
export function norm(s){
  return String(s||'').toLocaleLowerCase(locale())
    .replace(/ı/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g')
    .replace(/ü/g,'u').replace(/ö/g,'o').replace(/ç/g,'c');
}
export function match(hay, q){ return norm(hay).includes(norm(q)); }

/**
 * Görseli küçültüp dataURL'e çevirir; localStorage'a sığsın diye
 * uzun kenarı `max` pikselle sınırlanır.
 */
export function shrink(file, max = 640){
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) return reject(new Error('not an image'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      try { resolve(c.toDataURL('image/jpeg', 0.62)); }
      catch(e){ reject(e); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode failed')); };
    img.src = url;
  });
}

/** Tarayıcıdan dosya indirir. */
export function download(name, text, type = 'application/json'){
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Ekran okuyucuya tek satırlık durum bildirir. */
export function announce(text){
  const el = document.getElementById('live');
  if (el) el.textContent = text;
}

/** Çakışmasız kimlik: sunucuda birincil anahtar olarak da kullanılır. */
export function uid(prefix = ''){
  if (globalThis.crypto && crypto.randomUUID) return prefix + crypto.randomUUID();
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
