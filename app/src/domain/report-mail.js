/* Kurumsal: aylık / yıllık rapor e-postası. Uygulamadaki önizleme için yerel veriden, sunucudaki
   public.owner_report ile aynı özet çıkarılır (gönderimi supabase/functions/report yapar). */
import { S } from './state.js';
import { P, expectedAt, sum } from './logic.js';
import { iso, parse } from './util.js';

const mk = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

/** E-postada raporlanacak varsayılan dönem: aylıkta geçen ay, yıllıkta geçen yıl. */
export function lastPeriod(period, now = new Date()){
  if (period === 'year') return new Date(now.getFullYear() - 1, 0, 1);
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

export function localReport(period, ref = lastPeriod(period), ids = S.order){
  const d0 = period === 'year' ? new Date(ref.getFullYear(), 0, 1) : new Date(ref.getFullYear(), ref.getMonth(), 1);
  const d1 = period === 'year' ? new Date(ref.getFullYear() + 1, 0, 1) : new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
  const months = [];
  for (let d = new Date(d0); d < d1; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(mk(d));
  const from = iso(d0), to = iso(new Date(d1.getFullYear(), d1.getMonth(), 0));
  const in90 = iso(new Date(d1.getFullYear(), d1.getMonth(), d1.getDate() + 90));
  const properties = ids.map(id => {
    const p = P(id);
    const start = p.startDate ? mk(parse(p.startDate)) : months[0];
    const active = months.filter(m => m >= start && (!p.contractEnd || m + '-01' <= p.contractEnd));
    const recs = months.map(m => p.pay[m]).filter(Boolean);
    return {
      name: p.name, rent: p.rent,
      expected: sum(active, m => expectedAt(p, m)),
      collected: sum(recs.filter(r => r.status === 'approved' || r.status === 'partial')),
      spent: sum((p.expenses || []).filter(e => e.date >= from && e.date <= to)),
      paidMonths: recs.filter(r => r.status === 'approved').length,
      activeMonths: active.length,
      hasTenant: (p.tenants || []).length > 0
    };
  });
  const reqs = ids.flatMap(id => P(id).requests || []);
  return {
    period, from, to, properties,
    units: properties.length, occupied: properties.filter(x => x.hasTenant).length,
    expected: sum(properties, x => x.expected), collected: sum(properties, x => x.collected), spent: sum(properties, x => x.spent),
    requests: {
      opened: reqs.filter(r => r.date >= from && r.date <= to).length,
      done: reqs.filter(r => r.status === 3 && r.date >= from && r.date <= to).length,
      open: reqs.filter(r => r.status < 3).length
    },
    renewals: ids.filter(id => { const e = P(id).contractEnd; return e && e > to && e <= in90; }).length
  };
}
