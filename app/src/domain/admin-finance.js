/* Yönetici paneli: tahmini gelir (paket fiyatlarından) ve giderler (public.admin_costs, elle giriş).
   Gelir: ödeyen mülk sahiplerinin paketi, dönemi ve mülk adedi (admin_kpis → revenueBase) × paket fiyatı (CONFIG.billing.tiers,
   mülk başına). Yıllık paket aylığa 1/12 olarak yansır. Fiyatı tanımsız paket (Kurumsal: sözleşmeye göre) tahmine girmez.
   Gider: tek seferlik (başlangıç ayında), aylık (her ay, başlangıç gününde; ay kısaysa ayın son günü) ya da yıllık (her yıl
   başlangıç ayında); bitiş tarihinden sonra sayılmaz. Dövizli gider o günün TCMB satış kuruyla TL'ye çevrilir (fx.js). */
import { CONFIG } from './config.js';
import { rateOn } from './fx.js';

export const COST_CATEGORIES = ['altyapi', 'magaza', 'odeme', 'vergi', 'pazarlama', 'hizmet', 'diger'];

const pad = (n) => String(n).padStart(2, '0');
const lastDayOf = (y, m) => new Date(y, m, 0).getDate();

/** Paket fiyatlarından tahmini aylık gelir: { mrr, arr, rows: [{ plan, yearly, owners, units, monthly }], unpriced }. */
export function revenueEstimate(base = [], tiers = CONFIG.billing.tiers){
  let mrr = 0, unpriced = 0;
  const rows = base.map((x) => {
    const tier = tiers.find((t) => t.id === x.plan);
    const units = Number(x.units) || 0, owners = Number(x.owners) || 0;
    let monthly = null;
    if (tier && tier.price != null) monthly = x.yearly && tier.yearly != null ? (tier.yearly * units) / 12 : tier.price * units;
    if (monthly == null) unpriced += owners; else mrr += monthly;
    return { plan: x.plan, yearly: !!x.yearly, owners, units, monthly };
  });
  return { mrr: Math.round(mrr * 100) / 100, arr: Math.round(mrr * 12 * 100) / 100, rows, unpriced };
}

/** Giderin o aydaki günü ('YYYY-AA-GG'); o ay yoksa null. month: 'YYYY-AA'. */
export function occurrence(cost, month){
  const [y, m] = month.split('-').map(Number);
  const s = String(cost.start_on).slice(0, 10), e = cost.end_on ? String(cost.end_on).slice(0, 10) : null;
  const sy = Number(s.slice(0, 4)), sm = Number(s.slice(5, 7)), sd = Number(s.slice(8, 10));
  const monthKey = y * 12 + m, startKey = sy * 12 + sm;
  if (monthKey < startKey) return null;
  let day;
  if (cost.recurrence === 'monthly') day = Math.min(sd, lastDayOf(y, m));
  else if (cost.recurrence === 'yearly') { if (m !== sm) return null; day = Math.min(sd, lastDayOf(y, m)); }
  else { if (monthKey !== startKey) return null; day = sd; }
  const iso = y + '-' + pad(m) + '-' + pad(day);
  if (e && iso > e) return null;
  return iso;
}

/** KDV ayrımı (TL): girilen tutar KDV dahilse içinden, hariçse üstüne. { gross, net, vat }. */
export function splitVat(amount, included, rate){
  const r = Math.max(0, Number(rate) || 0) / 100;
  const a = Number(amount) || 0;
  const net = included ? a / (1 + r) : a;
  const gross = included ? a : a * (1 + r);
  return { gross, net, vat: gross - net };
}

/** Ayın giderleri (TL): { total (KDV dahil), net, vat, byCat, items: [{ cost, day, gross, net, vat, rate, missing }], missing }. */
export function monthCosts(costs = [], month, table){
  const items = [];
  let total = 0, net = 0, vat = 0, missing = false;
  const byCat = {};
  costs.forEach((c) => {
    const day = occurrence(c, month);
    if (!day) return;
    const rate = rateOn(table, c.currency || 'TRY', day);
    if (rate == null){ missing = true; items.push({ cost: c, day, gross: null, net: null, vat: null, rate: null, missing: true }); return; }
    const v = splitVat(Number(c.amount) * rate, c.vat_included !== false, c.vat_rate ?? 20);
    total += v.gross; net += v.net; vat += v.vat;
    byCat[c.category] = (byCat[c.category] || 0) + v.gross;
    items.push({ cost: c, day, ...v, rate, missing: false });
  });
  items.sort((a, b) => a.day.localeCompare(b.day));
  return { total, net, vat, byCat, items, missing };
}

/** Önümüzdeki günlerde (varsayılan 30) gelecek düzenli giderler: [{ cost, day }] tarih sırasıyla. */
export function upcoming(costs = [], today = new Date(), days = 30){
  const from = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
  const until = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  const to = until.getFullYear() + '-' + pad(until.getMonth() + 1) + '-' + pad(until.getDate());
  const months = [from.slice(0, 7), to.slice(0, 7)].filter((x, i, a) => a.indexOf(x) === i);
  const out = [];
  costs.filter((c) => c.recurrence !== 'once').forEach((c) => months.forEach((m) => {
    const d = occurrence(c, m);
    if (d && d >= from && d <= to) out.push({ cost: c, day: d });
  }));
  return out.sort((a, b) => a.day.localeCompare(b.day));
}

/* ---- sunucu ---- */

async function rpc(name, args){
  const { client } = await import('./backend.js');
  const { data, error } = await (await client()).rpc(name, args);
  if (error) throw error;
  return data;
}
export async function loadCosts(){
  const { client } = await import('./backend.js');
  const { data, error } = await (await client()).from('admin_costs').select('*').order('start_on', { ascending: false });
  if (error) throw error;
  return data || [];
}
export const saveCost = (p) => rpc('admin_cost_save', { p });
export const deleteCost = (id) => rpc('admin_cost_delete', { cid: id });
