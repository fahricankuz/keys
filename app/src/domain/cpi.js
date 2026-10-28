/* Yasal kira artış oranı: TÜFE 12 aylık ortalamalara göre değişim (TBK 344). Oranlar public.cpi_rates
   tablosundan (tufe-sync fonksiyonu ya da yönetici doldurur); sunucu yoksa /data/tufe.json'dan okunur. */
import { LIVE } from './config.js';
import { client } from './backend.js';

let cache = null;

/** { 'YYYY-AA': oran } — yeni aydan eskiye. Hata olursa boş döner; oran elle girilebilir. */
export async function loadRates(force = false) {
  if (cache && !force) return cache;
  try {
    if (LIVE) {
      const c = await client();
      const { data } = await c.from('cpi_rates').select('month, avg12').order('month', { ascending: false }).limit(72);
      cache = Object.fromEntries((data || []).map((r) => [r.month, Number(r.avg12)]));
    } else {
      const res = await fetch('/data/tufe.json');
      cache = res.ok ? ((await res.json()).rates || {}) : {};
    }
  } catch { cache = {}; }
  return cache;
}

const key = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

/** Yenileme tarihinde uygulanacak oran: yenilemeden önceki ayın verisi (o ayın başında açıklanan son bülten). */
export function rateFor(rates, renewal) {
  const d = new Date(renewal);
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const k = key(prev);
  return rates && rates[k] != null ? { month: k, rate: rates[k] } : null;
}
