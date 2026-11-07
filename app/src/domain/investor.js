/* Yatırımcı raporu (GYO; AVM ve depoda anahtar yöneticisi açar): çeyrek ya da yıl için kurumun rapor para biriminde
   (USD / EUR) gösterge, özet ve ayrıntılar. Para çevirme kuralları fx-report.js ile aynı (her işlem kendi gününün TCMB
   satış kuru). Doluluk, WALE, sözleşme ve kiracı bilgileri dönem sonunun (dönem sürüyorsa bugünün) durumudur.
   Tanımlar:
     brüt kira       = kira + ciro farkı tahakkuku
     ortak gider     = kiracılara yansıtılan ortak alan gideri tahakkuku (gelir) ve "ortak" türündeki giderler (harcama)
     işletme gideri  = "işletme" türündeki giderler (türü seçilmemiş eski giderler dahil)
     NOI             = brüt kira + ortak gider tahakkuku − ortak gider harcaması − işletme gideri
     dönem geliri    = brüt kira + ortak gider tahakkuku;  NOI marjı = NOI ÷ dönem geliri
     tahsilat oranı  = tahsil edilen ÷ istenen (dönemin bütün tahakkukları)
     WALE            = kira ağırlıklı ortalama kalan sözleşme süresi (yıl); m² ağırlıklısı da verilir */
import { t } from './i18n.js';
import { rateOn } from './fx.js';
import { amountIn, chargeDue, chargeIn, monthlyRevenue } from './fx-report.js';
import { unitLabel } from './site.js';

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const YEAR = 365.25 * 864e5;

/** 'YYYY-Qn' ya da 'YYYY'. */
export const isPeriod = (k) => /^\d{4}(-Q[1-4])?$/.test(String(k || ''));

/** Son tamamlanan çeyrek (rapor ekranının varsayılanı). */
export function lastQuarter(now = new Date()){
  const q = Math.floor(now.getMonth() / 3);
  return q === 0 ? (now.getFullYear() - 1) + '-Q4' : now.getFullYear() + '-Q' + q;
}

/** Dönemin ayları, ilk ve son günü, adı ve bir önceki dönem. */
export function periodRange(key){
  const y = Number(String(key).slice(0, 4));
  const q = /-Q([1-4])$/.exec(key);
  const m0 = q ? (Number(q[1]) - 1) * 3 : 0, n = q ? 3 : 12;
  const months = Array.from({ length: n }, (_, i) => y + '-' + pad(m0 + i + 1));
  const from = months[0] + '-01';
  const to = isoDay(new Date(y, m0 + n, 0));
  const prev = q ? (Number(q[1]) === 1 ? (y - 1) + '-Q4' : y + '-Q' + (Number(q[1]) - 1)) : String(y - 1);
  const label = q ? t('{q}. çeyrek {y}', { q: q[1], y }) : t('{y} yılı', { y });
  return { key, months, from, to, prev, label, quarter: !!q };
}

/** Dönemin gelir-gider özeti (cur: TRY | USD | EUR). */
function totals(d, range, cur, table){
  const inP = (x) => range.months.includes(x.month);
  let gross = 0, service = 0, charged = 0, collected = 0, diff = 0, missing = false;
  d.charges.filter(inP).forEach((x) => {
    const v = chargeIn(x, cur, table);
    missing = missing || v.missing;
    charged += v.charged; collected += v.collected; diff += v.diff;
    if (x.kind === 'kira' || x.kind === 'ciro') gross += v.charged;
    else if (x.kind === 'ortak_gider') service += v.charged;
  });
  let serviceCost = 0, opex = 0;
  d.expenses.filter((e) => e.spent_on >= range.from && e.spent_on <= range.to).forEach((e) => {
    const v = amountIn(e.amount, e.spent_on, cur, table);
    if (v == null){ missing = true; return; }
    if (e.kind === 'ortak') serviceCost += v; else opex += v;
  });
  const revenue = gross + service;
  const noi = revenue - serviceCost - opex;
  return { gross, service, serviceCost, opex, noi, revenue, margin: revenue ? noi / revenue : null,
           collection: charged ? collected / charged : null, charged, collected, diff, missing };
}

/** Birimin yıllık kirası (rapor para biriminde, asOf gününün kuruyla); kur yoksa null. */
function yearlyRent(u, cur, table, day){
  const rent = Number(u.rent) || 0;
  if (!rent) return 0;
  const inTl = (u.currency || 'TRY') === 'TRY' ? rent : (() => { const r = rateOn(table, u.currency, day); return r == null ? null : rent * r; })();
  if (inTl == null) return null;
  const r = rateOn(table, cur, day);
  return r == null ? null : (inTl * 12) / r;
}

/**
 * Raporun bütün verisi. d: loadSiteAdmin; org: { name, sector, report_currency }; key: dönem; table: kur tablosu (fx.js);
 * cur: raporun para birimi (TRY | USD | EUR; verilmezse kurumun varsayılanı, o da yoksa USD). TRY'de tutarlar kayıtlı TL'dir;
 * note: yönetimin notu (boşsa bölüm görünmez).
 */
export function investorReport({ d, org, key, table, note = '', today = new Date(), cur: wanted = '' }){
  const cur = ['TRY', 'USD', 'EUR'].includes(wanted) ? wanted : (org.report_currency === 'EUR' ? 'EUR' : 'USD');
  const range = periodRange(key);
  const todayIso = isoDay(today);
  const asOf = range.to < todayIso ? range.to : todayIso;
  const asOfMs = Date.parse(asOf + 'T12:00:00');
  const now = totals(d, range, cur, table), tl = totals(d, range, 'TRY', table);
  const prevRange = periodRange(range.prev);
  const prev = totals(d, prevRange, cur, table);

  // Doluluk (m²) ve sözleşmeler: kiracısı olan ve sözleşmesi asOf gününde sürmekte olan birim dolu sayılır.
  const tenantName = (u) => {
    const r = d.residents.find((x) => x.unit_id === u.id && x.role === 'kiraci');
    const l = (d.linked || []).find((x) => x.unit_id === u.id);
    return (r && r.name) || (l && (l.name || l.display_name)) || '';
  };
  const hasTenant = (u) => d.residents.some((r) => r.unit_id === u.id && r.role === 'kiraci') || (d.linked || []).some((x) => x.unit_id === u.id);
  const full = (u) => hasTenant(u) && (!u.lease_end || u.lease_end >= asOf);
  const units = d.units, occ = units.filter(full);
  const area = units.reduce((a, u) => a + (Number(u.area) || 0), 0);
  const occArea = occ.reduce((a, u) => a + (Number(u.area) || 0), 0);
  let rentMissing = false;
  const rentOf = new Map(occ.map((u) => { const r = yearlyRent(u, cur, table, asOf); if (r == null) rentMissing = true; return [u.id, r || 0]; }));
  const totalRent = [...rentOf.values()].reduce((a, x) => a + x, 0);
  const leased = occ.filter((u) => u.lease_end);
  const left = (u) => Math.max(0, (Date.parse(u.lease_end + 'T12:00:00') - asOfMs) / YEAR);
  const wRent = leased.reduce((a, u) => a + rentOf.get(u.id), 0), wArea = leased.reduce((a, u) => a + (Number(u.area) || 0), 0);
  const wale = wRent ? leased.reduce((a, u) => a + rentOf.get(u.id) * left(u), 0) / wRent : null;
  const waleArea = wArea ? leased.reduce((a, u) => a + (Number(u.area) || 0) * left(u), 0) / wArea : null;

  // Varlık bazında doluluk ("Varlık / bina" alanı).
  const noAsset = t('Varlık belirtilmedi');
  const assetMap = {};
  units.forEach((u) => {
    const g = assetMap[u.block || noAsset] = assetMap[u.block || noAsset] || { name: u.block || noAsset, units: 0, area: 0, occArea: 0, rent: 0 };
    g.units++; g.area += Number(u.area) || 0;
    if (full(u)){ g.occArea += Number(u.area) || 0; g.rent += rentOf.get(u.id) || 0; }
  });
  const assets = Object.values(assetMap).map((g) => ({ ...g, rate: g.area ? g.occArea / g.area : null })).sort((a, b) => b.area - a.area);

  // Yıllara göre biten sözleşmeler ve kira payları.
  const byYear = {};
  leased.forEach((u) => {
    const y = u.lease_end.slice(0, 4);
    const g = byYear[y] = byYear[y] || { year: y, count: 0, area: 0, rent: 0 };
    g.count++; g.area += Number(u.area) || 0; g.rent += rentOf.get(u.id);
  });
  const openEnded = occ.filter((u) => !u.lease_end);
  const expiries = Object.values(byYear).sort((a, b) => a.year.localeCompare(b.year)).map((g) => ({ ...g, share: totalRent ? g.rent / totalRent : null }));
  if (openEnded.length){
    const r = openEnded.reduce((a, u) => a + rentOf.get(u.id), 0);
    expiries.push({ year: t('Süresiz'), count: openEnded.length, area: openEnded.reduce((a, u) => a + (Number(u.area) || 0), 0), rent: r, share: totalRent ? r / totalRent : null });
  }

  // En büyük 10 kiracı (yıllık kiraya göre).
  const tenants = occ.map((u) => ({ name: tenantName(u) || unitLabel(u), unit: unitLabel(u), asset: u.block || '', area: Number(u.area) || 0,
      rent: rentOf.get(u.id), share: totalRent ? rentOf.get(u.id) / totalRent : null, end: u.lease_end || null, currency: u.currency || 'TRY' }))
    .sort((a, b) => b.rent - a.rent).slice(0, 10);

  // Dönemdeki kira artışları (TÜFE ya da sabit oran).
  const unitBy = Object.fromEntries(units.map((u) => [u.id, u]));
  const increases = (d.rentChanges || []).filter((x) => x.from_date >= range.from && x.from_date <= range.to && unitBy[x.unit_id])
    .map((x) => {
      const u = unitBy[x.unit_id];
      const old = Number(x.old_amount) || 0, nw = Number(x.new_amount) || 0;
      return { unit: unitLabel(u), tenant: tenantName(u), date: x.from_date, old, next: nw, currency: x.currency || u.currency || 'TRY',
               rate: old ? nw / old - 1 : null, kind: u.index_kind === 'sabit' ? 'sabit' : u.index_kind === 'tufe' ? 'tufe' : 'diger' };
    }).sort((a, b) => a.date.localeCompare(b.date));

  // 30 günü geçen alacaklar (asOf gününe göre, birim başına).
  const late = {};
  d.charges.forEach((x) => {
    const v = chargeIn(x, cur, table);
    if (!(v.unpaid > 0) && !(x.status !== 'paid' && v.missing)) return;
    const due = chargeDue(x);
    const days = Math.floor((asOfMs - Date.parse(due + 'T12:00:00')) / 864e5);
    if (days <= 30 || !unitBy[x.unit_id]) return;
    const g = late[x.unit_id] = late[x.unit_id] || { unit: unitLabel(unitBy[x.unit_id]), tenant: tenantName(unitBy[x.unit_id]), amount: 0, days: 0, count: 0 };
    g.amount += v.unpaid; g.days = Math.max(g.days, days); g.count++;
  });
  const receivables = Object.values(late).sort((a, b) => b.amount - a.amount);

  const endMonth = range.months[range.months.length - 1];
  const chart = monthlyRevenue(d.charges, endMonth, cur, table);
  const rate = cur === 'TRY' ? null : rateOn(table, cur, asOf);
  return {
    org: org.name, sector: org.sector, cur, range, asOf, note: String(note || '').trim(),
    kpi: { revenue: now.revenue, margin: now.margin, occupancy: area ? occArea / area : null, wale, waleArea },
    now, tl, prev, prevRange,
    occupancy: { area, occArea, units: units.length, occupied: occ.length },
    assets, expiries, tenants, increases, receivables, receivablesTotal: receivables.reduce((a, x) => a + x.amount, 0),
    chart, rate, missing: now.missing || prev.missing || rentMissing || chart.some((x) => x.missing)
  };
}

/** "Mailime gönder" özeti: e-postada gösterilecek biçimlenmiş değerler (sunucu yalnız bunları yazar). */
export function investorSummary(r, fmt){
  const pct = (x) => (x == null ? '—' : '%' + (Math.round(x * 1000) / 10).toLocaleString('tr-TR'));
  const yrs = (x) => (x == null ? '—' : t('{n} yıl', { n: x.toFixed(1).replace('.', ',') }));
  return {
    label: r.range.label, currency: r.cur,
    revenue: fmt(r.kpi.revenue), noi: fmt(r.now.noi), margin: pct(r.kpi.margin), occupancy: pct(r.kpi.occupancy), wale: yrs(r.kpi.wale),
    collection: pct(r.now.collection), receivables: fmt(r.receivablesTotal), fx_diff: fmt(r.now.diff),
    prev_revenue: fmt(r.prev.revenue), prev_label: r.prevRange.label
  };
}
