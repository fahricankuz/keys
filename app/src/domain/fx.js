/* Döviz kurları (TCMB, public.fx_rates; tufe-sync her gün doldurur). Raporlarda TCMB döviz satış kuru kullanılır.
   Kural (sunucudaki public.fx_rate ile aynı): işlemin günü; o gün kur yoksa (hafta sonu, tatil) o günden önceki son iş günü.
   TL → 1. Kur bulunamazsa null döner; ekran "kur bekleniyor" der, tutarı uydurmaz. */

export const FX_CURRENCIES = ['TRY', 'USD', 'EUR'];
export const fxSymbol = (cur) => (cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₺');

/** Satırlar → { USD: { days: [...artan], sell: [...] }, EUR: … } (ikili aramaya hazır). */
export function fxTable(rows = []){
  const by = { USD: [], EUR: [] };
  rows.forEach((r) => { if (by[r.currency] && Number(r.sell) > 0) by[r.currency].push([String(r.day).slice(0, 10), Number(r.sell)]); });
  const out = {};
  for (const cur of Object.keys(by)){
    const list = by[cur].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    out[cur] = { days: list.map((x) => x[0]), sell: list.map((x) => x[1]) };
  }
  return out;
}

/** Günün (yoksa ondan önceki son iş gününün) tablodaki sırası; yoksa -1. */
function indexOn(t, day){
  const d = typeof day === 'string' ? day.slice(0, 10) : isoDay(day);
  let lo = 0, hi = t.days.length - 1, at = -1;
  while (lo <= hi){
    const mid = (lo + hi) >> 1;
    if (t.days[mid] <= d){ at = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return at;
}

/** O günün (yoksa son iş gününün) satış kuru: 1 birim döviz kaç TL. day: 'YYYY-AA-GG' ya da Date. */
export function rateOn(table, cur, day){
  if (!cur || cur === 'TRY') return 1;
  const t = table && table[cur];
  if (!t || !t.days.length) return null;
  const i = indexOn(t, day);
  return i < 0 ? null : t.sell[i];
}

/** Kurun alındığı gün (dip not için): hafta sonu ya da tatilde son iş günü. */
export function rateDay(table, cur, day){
  const t = table && table[cur];
  if (!cur || cur === 'TRY' || !t) return null;
  const i = indexOn(t, day);
  return i < 0 ? null : t.days[i];
}

/** TL tutarı o günün kuruyla dövize çevirir (TRY'de aynen döner); kur yoksa null. */
export function fromTl(table, amount, cur, day){
  const r = rateOn(table, cur, day);
  return r == null ? null : Number(amount || 0) / r;
}

/** Dövizi TL'ye çevirir; kur yoksa null. */
export function toTl(table, amount, cur, day){
  const r = rateOn(table, cur, day);
  return r == null ? null : Number(amount || 0) * r;
}

function isoDay(d){
  const x = d instanceof Date ? d : new Date(d);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
}

let cache = null;

/** Kur tablosunu sunucudan okur (from: 'YYYY-AA-GG'; bir sonraki istekte daha eski gün istenirse yeniden okur).
    Okuma 1000'er satır sayfalanır. Hata olursa boş tablo döner. */
export async function loadFx(from = '2020-01-01'){
  const start = shift(from, -10);
  if (cache && cache.from <= start) return cache.table;
  try {
    const { client } = await import('./backend.js');
    const c = await client();
    const rows = [];
    for (let i = 0; i < 20; i++){
      const { data, error } = await c.from('fx_rates').select('day, currency, sell').gte('day', start).order('day', { ascending: true }).range(i * 1000, i * 1000 + 999);
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    cache = { from: start, table: fxTable(rows) };
    return cache.table;
  } catch {
    return fxTable([]);
  }
}

function shift(day, n){
  const d = new Date(String(day).slice(0, 10) + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return isoDay(d);
}
