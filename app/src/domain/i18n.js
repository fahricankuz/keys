/* Dil desteği.

   Anahtar, Türkçe metnin kendisidir: t('Ödemeler') Türkçede aynen döner,
   İngilizcede en.js sözlüğünden gelir. Sözlükte olmayan metin Türkçe
   gösterilir ve __i18nMissing kümesine yazılır (testler bunu denetler).

   Dil, modüller yüklenirken bir kez belirlenir; değiştirilince sayfa yeniden
   yüklenir. Böylece modül düzeyindeki metinler de doğru dilde oluşur.

   Kayıtlı veri değerleri (talep türü, masraf sahibi, belge kategorisi…)
   Türkçe saklanır ve yalnızca gösterilirken çevrilir; dil değişince veri
   bozulmaz. */

import { storage } from './storage.js';

// İngilizce sözlük (~170 KB) ayrı parçada; yalnız dil İngilizceyse indirilir (Türkçe ziyaretçi hiç yüklemez).
let EN = null;
let loading = null;
export function loadEn(){
  if (EN) return Promise.resolve();
  loading = loading || Promise.all([import('./en.js'), import('./en-extra.js'), import('./en-mulk.js'), import('./en-paket.js')])
    .then(([a, b, m, pk]) => { EN = Object.assign({}, b.EN_EXTRA, m.EN_MULK, pk.EN_PAKET, a.EN); });
  return loading;
}

export const LANGS = [['tr', 'Türkçe'], ['en', 'English']];

function detect(){
  try {
    const pref = JSON.parse(storage.getItem('evim-tercih') || 'null');
    if (pref && pref.lang) return pref.lang;
    const demo = JSON.parse(storage.getItem('evim') || 'null');
    if (demo && demo.lang) return demo.lang;
  } catch(e){}
  // Ürün Türkçe öncelikli: tarayıcı dili değil, açık seçim belirler.
  return 'tr';
}

let lang = 'tr';
const listeners = new Set();
/** Depo okunabilir olunca çağrılır (hydrate sonrası). */
export async function initLang(){
  const d = detect();
  const next = LANGS.some(l => l[0] === d) ? d : 'tr';
  if (next === 'en') await loadEn().catch(() => {});
  lang = next;
}
export function onLang(fn){ listeners.add(fn); return () => listeners.delete(fn); }

const missing = new Set();
globalThis.__i18nMissing = missing;

export function getLang(){ return lang; }

/** Tarih ve sayı biçimleri için yerel ayar. */
export function locale(){ return lang === 'en' ? 'en-GB' : 'tr-TR'; }

/**
 * Metni çevirir. {ad} biçimindeki yer tutucular vars ile doldurulur.
 * @param {string} s  Türkçe kaynak metin
 * @param {object} [vars]
 */
export function t(s, vars){
  if (s == null) return '';
  s = String(s);
  // 'Ara|telefon': aynı Türkçe metnin farklı anlamları için bağlam etiketi.
  let out = s.includes('|') ? s.slice(0, s.indexOf('|')) : s;
  if (lang !== 'tr' && s && EN){
    const hit = EN[s];
    if (hit === undefined) missing.add(s);
    else out = hit;
  }
  // Tekil/çoğul: "{n} day||{n} days" — vars.n 1 ise ilki, değilse ikincisi.
  if (out.includes('||')){
    const [one, many] = out.split('||');
    out = vars && Math.abs(Number(vars.n)) === 1 ? one : many;
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => vars[k] != null ? vars[k] : '');
  return out;
}

/** Dili kaydeder; dinleyenler yeniden çizer. */
export function setLang(next){
  try {
    const pref = JSON.parse(storage.getItem('evim-tercih') || '{}') || {};
    pref.lang = next;
    storage.setItem('evim-tercih', JSON.stringify(pref));
  } catch(e){}
  const done = () => { lang = next; listeners.forEach(fn => fn(next)); };
  if (next === 'en' && !EN) loadEn().then(done, done); else done();
}
