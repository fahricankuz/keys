/* Dil desteği.

   Anahtar, Türkçe metnin kendisidir: t('Ödemeler') Türkçede aynen döner,
   İngilizcede en.js sözlüğünden gelir. Sözlükte olmayan metin Türkçe
   gösterilir ve __i18nMissing kümesine yazılır (testler bunu denetler).

   Dil, modüller yüklenirken bir kez belirlenir; değiştirilince sayfa yeniden
   yüklenir. Böylece modül düzeyindeki metinler de doğru dilde oluşur.

   Kayıtlı veri değerleri (talep türü, masraf sahibi, belge kategorisi…)
   Türkçe saklanır ve yalnızca gösterilirken çevrilir; dil değişince veri
   bozulmaz. */

import { EN } from './en.js';

export const LANGS = [['tr', 'Türkçe'], ['en', 'English']];

function detect(){
  try {
    const pref = JSON.parse(localStorage.getItem('evim-tercih') || 'null');
    if (pref && pref.lang) return pref.lang;
    const demo = JSON.parse(localStorage.getItem('evim') || 'null');
    if (demo && demo.lang) return demo.lang;
  } catch(e){}
  return /^tr\b/i.test(navigator.language || 'tr') ? 'tr' : 'en';
}

let lang = detect();
if (!LANGS.some(l => l[0] === lang)) lang = 'tr';

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
  if (lang !== 'tr' && s){
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

/** Dili kaydeder ve uygulamayı yeniden yükler. */
export function setLang(next){
  try {
    const pref = JSON.parse(localStorage.getItem('evim-tercih') || '{}') || {};
    pref.lang = next;
    localStorage.setItem('evim-tercih', JSON.stringify(pref));
  } catch(e){}
  location.reload();
}

document.documentElement.lang = lang;
