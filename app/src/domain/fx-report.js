/* Raporu seçilen para biriminde (₺ / $ / €) göstermek için çevirme kuralları. Her işlem kendi gününün TCMB satış kuruyla:
   tahsilat → ödeme günü, istenen → son ödeme günü, gider → harcama günü (hafta sonu / tatilde son iş günü, fx.js).
   Dövizli sözleşmede sözleşmedeki döviz tutarı esas alınır; TL'nin değer kaybı "kur farkı" olarak ayrı tutulur.
   ₺ görünümünde tutarlar kayıtlı TL değerleridir (eski raporla aynı); kur farkı yalnız bilgi satırıdır. */
import { rateOn } from './fx.js';

const lastDay = (month) => { const [y, m] = String(month).split('-').map(Number); return y + '-' + String(m).padStart(2, '0') + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0'); };
export const chargeDue = (x) => (x.due_on ? String(x.due_on).slice(0, 10) : lastDay(x.month));
export const chargePaidTl = (x) => (x.status === 'paid' ? Number(x.amount) : x.status === 'partial' ? Number(x.paid_amount) || 0 : 0);
const foreign = (x) => x.currency && x.currency !== 'TRY' && x.orig_amount != null && Number(x.amount) > 0;

/** Tek tahakkuk, seçilen para biriminde: { charged, collected, unpaid, diff, missing }. Kur yoksa missing true, tutarlar 0. */
export function chargeIn(x, cur, table){
  const amount = Number(x.amount) || 0, paid = chargePaidTl(x), due = chargeDue(x);
  const pd = x.paid_on ? String(x.paid_on).slice(0, 10) : due;
  const share = amount > 0 ? Math.min(1, paid / amount) : 0;
  const orig = Number(x.orig_amount) || 0;
  const fx = foreign(x);
  const rC = (d) => (fx ? rateOn(table, x.currency, d) : 1);
  if (!cur || cur === 'TRY'){
    const r = paid ? rC(pd) : 1;
    return { charged: amount, collected: paid, unpaid: Math.max(0, amount - paid), diff: fx && paid && r != null ? paid - orig * share * r : 0, missing: fx && !!paid && r == null };
  }
  const rDue = rateOn(table, cur, due), rPd = rateOn(table, cur, pd), cDue = rC(due), cPd = rC(pd);
  if (rDue == null || cDue == null || (paid && (rPd == null || cPd == null))) return { charged: 0, collected: 0, unpaid: 0, diff: 0, missing: true };
  if (fx){
    const charged = orig * cDue / rDue;
    const collected = paid ? orig * share * cPd / rPd : 0;
    return { charged, collected, unpaid: orig * (1 - share) * cDue / rDue, diff: paid ? (paid - orig * share * cPd) / rPd : 0, missing: false };
  }
  return { charged: amount / rDue, collected: paid ? paid / rPd : 0, unpaid: Math.max(0, amount - paid) / rDue, diff: 0, missing: false };
}

/** TL tutarı o günün kuruyla seçilen para birimine; kur yoksa null. */
export function amountIn(tl, day, cur, table){
  if (!cur || cur === 'TRY') return Number(tl) || 0;
  const r = rateOn(table, cur, String(day).slice(0, 10));
  return r == null ? null : (Number(tl) || 0) / r;
}

/** Son 12 ayın istenen geliri (bitiş ayı dahil), seçilen para biriminde: [{ month, value, missing }]. */
export function monthlyRevenue(charges, endMonth, cur, table){
  const [y, m] = String(endMonth).split('-').map(Number);
  const months = Array.from({ length: 12 }, (_, i) => { const d = new Date(y, m - 12 + i, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); });
  return months.map((month) => {
    let value = 0, missing = false;
    charges.filter((x) => x.month === month).forEach((x) => { const v = chargeIn(x, cur, table); value += v.charged; missing = missing || v.missing; });
    return { month, value, missing };
  });
}
