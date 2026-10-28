/* Yapılandırılmış adres: ülke → il → ilçe → mahalle seçilir; sokak, bina, daire ve tarif elle yazılır.
   Türkiye il/ilçe listesi uygulamada (places-tr.json); mahalleler il seçilince /adres/<il kodu>.json'dan gelir. */
import PLACES from './places-tr.json';
import { CONFIG } from './config.js';

export const COUNTRIES = ['Türkiye', 'KKTC', 'Almanya', 'Azerbaycan', 'Birleşik Krallık', 'Fransa', 'Hollanda', 'ABD', 'Diğer'];
export const CITIES = PLACES.cities;
export const districtsOf = (cityCode) => PLACES.districts[cityCode] || [];
export const cityCodeOf = (name) => (CITIES.find((c) => c.name === name) || {}).code || '';

const cache = {};
/** İlin ilçe → mahalle listesi; ağ yoksa boş döner (mahalle elle yazılabilir). */
export async function hoodsOf(cityCode) {
  if (!cityCode) return {};
  if (cache[cityCode]) return cache[cityCode];
  const base = typeof window !== 'undefined' && window.location ? '' : (CONFIG.publicUrl || '').replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/adres/${cityCode}.json`);
    cache[cityCode] = res.ok ? await res.json() : {};
  } catch { cache[cityCode] = {}; }
  return cache[cityCode];
}

/** Adresin tek satırlık hali (listelerde, raporlarda ve eski "addr" alanında kullanılır). */
export function formatAddress(a) {
  if (!a) return '';
  const line1 = [a.street, a.no ? 'No:' + a.no : '', a.unit ? 'D:' + a.unit : ''].filter(Boolean).join(' ');
  const place = [a.district, a.city].filter(Boolean).join('/');
  return [line1, a.hood, place, a.country && a.country !== 'Türkiye' ? a.country : ''].filter(Boolean).join(', ');
}

export const emptyAddress = () => ({ country: 'Türkiye', city: '', district: '', hood: '', street: '', no: '', unit: '', note: '' });
