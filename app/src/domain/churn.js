/* Büyüme → ayrılan aboneler (churn) ve kohort analizi. Sunucu: admin_subscription_events (abonelik olayları),
   admin_subscriptions (bugünkü durum), admin_cohorts (kayıt ayına göre etkinlik). Hesaplar burada, saf işlevler (testli). */
import { CONFIG } from './config.js';
import { parseProduct } from './plans.js';

const ym = (v) => String(v || '').slice(0, 7);
/** 'YYYY-AA' + k ay. */
export function addMonths(m, k){
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + k, 1));
  return d.toISOString().slice(0, 7);
}

/** Ürünün aylık değeri (TL); yıllık pakette 1/12. Bilinmeyen ürün: null. */
export function productMonthly(pid, tiers = CONFIG.billing.tiers){
  const p = parseProduct(pid);
  const tier = p && tiers.find((x) => x.id === p.plan);
  if (!tier || tier.price == null) return null;
  return p.yearly && tier.yearly != null ? (tier.yearly * p.units) / 12 : tier.price * p.units;
}

/** Kullanıcı başına ödeyen olduğu aralıklar: [{from, to}] ('YYYY-AA-GG…' ISO; to null = sürüyor).
    Başlangıcı kaydedilmemiş (geçmiş doldurma) aralık kayıt tarihinden başlar. */
export function intervals(events = [], subs = []){
  const by = new Map();
  const created = new Map(subs.map((s) => [s.id, s.created_at]));
  [...events].sort((a, b) => String(a.at).localeCompare(String(b.at))).forEach((e) => {
    const list = by.get(e.user_id) || [];
    const open = list.length && list[list.length - 1].to == null ? list[list.length - 1] : null;
    if (e.kind === 'basladi' && !open) list.push({ from: e.at, to: null, product_id: e.product_id });
    if (e.kind === 'bitti'){
      if (open) { open.to = e.at; open.product_id = open.product_id || e.product_id; }
      else list.push({ from: created.get(e.user_id) || e.at, to: e.at, product_id: e.product_id, approx: true });
    }
    by.set(e.user_id, list);
  });
  // Bugün ödeyen ama başlangıç olayı olmayan (kayıt bu tablodan önce): kayıt tarihinden beri.
  subs.filter((s) => s.subscribed && !(by.get(s.id) || []).some((i) => i.to == null))
    .forEach((s) => by.set(s.id, [...(by.get(s.id) || []), { from: s.created_at, to: null, product_id: null, approx: true }]));
  return by;
}

/** Ay ay churn: dönem başı ödeyen, yeni ödeyen, ayrılan, oran ve kaybedilen aylık gelir. months: 'YYYY-AA' listesi. */
export function churnByMonth(events = [], subs = [], months = []){
  const iv = intervals(events, subs);
  const all = [...iv.values()].flat();
  return months.map((m) => {
    const start = m + '-01';
    const payersStart = all.filter((i) => String(i.from) < start && (i.to == null || String(i.to) >= start)).length;
    const started = events.filter((e) => e.kind === 'basladi' && ym(e.at) === m).length;
    const ended = events.filter((e) => e.kind === 'bitti' && ym(e.at) === m);
    const lost = ended.reduce((a, e) => a + (productMonthly(e.product_id) || 0), 0);
    return { m, payersStart, started, ended: ended.length, rate: payersStart ? ended.length / payersStart : null, lostMrr: lost };
  });
}

/** Ayrılış türleri (dönem): ödeme sorunuyla biten, iptal edip süresi biten; ayrıca denemesi bitip ödemeyenler. */
export function churnKinds(events = [], subs = [], months = [], trialDays = 30, now = new Date()){
  const set = new Set(months);
  const byUser = new Map();
  events.forEach((e) => byUser.set(e.user_id, [...(byUser.get(e.user_id) || []), e]));
  let payment = 0, cancel = 0, other = 0;
  events.filter((e) => e.kind === 'bitti' && set.has(ym(e.at))).forEach((e) => {
    const prev = (byUser.get(e.user_id) || []).filter((x) => String(x.at) <= String(e.at) && x !== e);
    const last = [...prev].reverse().find((x) => x.kind !== 'bitti');
    if (last?.kind === 'odeme_sorunu') payment++;
    else if (last?.kind === 'iptal') cancel++;
    else other++;
  });
  const trialLost = subs.filter((s) => {
    const end = s.trial_ends || new Date(Date.parse(s.created_at) + trialDays * 864e5).toISOString();
    return set.has(ym(end)) && Date.parse(end) <= now.getTime() && !s.subscribed && !byUser.has(s.id);
  }).length;
  return { payment, cancel, other, trialLost };
}

/** Erken uyarı: yenilemesi kapalı (süre bitmeden kurtarılabilir) ve ödeme sorunu yaşayan ödeyenler. */
export function atRisk(subs = []){
  const soon = (s) => Date.parse(s.expires_at || '') || Infinity;
  return {
    cancelled: subs.filter((s) => s.subscribed && !s.will_renew && !s.billing_issue).sort((a, b) => soon(a) - soon(b)),
    billing: subs.filter((s) => s.billing_issue).sort((a, b) => soon(a) - soon(b))
  };
}

/** Kohort tablosu. rows: admin_cohorts satırları; role: 'all' | 'landlord' | 'tenant'.
    Dönen: [{cohort, size, cells: [oran|null, ...]}] — cells[k] = kayıttan k ay sonra etkin olanların oranı (gelmemiş ay: null). */
export function cohortGrid(rows = [], role = 'all', now = new Date(), maxK = 12){
  const cur = now.toISOString().slice(0, 7);
  const by = new Map();
  rows.filter((r) => role === 'all' || r.role === role).forEach((r) => {
    const g = by.get(r.cohort) || { cohort: r.cohort, size: 0, active: {} };
    g.size += Number(r.size) || 0;
    Object.entries(r.active || {}).forEach(([m, n]) => { g.active[m] = (g.active[m] || 0) + Number(n); });
    by.set(r.cohort, g);
  });
  return [...by.values()].sort((a, b) => b.cohort.localeCompare(a.cohort)).map((g) => ({
    cohort: g.cohort, size: g.size,
    cells: Array.from({ length: maxK }, (_, k) => {
      const m = addMonths(g.cohort, k);
      return m > cur || !g.size ? null : (g.active[m] || 0) / g.size;
    })
  }));
}

/** Ödeme kohortu: kayıt ayına göre, kayıttan k ay sonra ödeyen olanların oranı (abonelik aralıklarından). Yalnız mülk sahipleri. */
export function payingGrid(events = [], subs = [], now = new Date(), maxK = 12, months = 12){
  const cur = now.toISOString().slice(0, 7);
  const iv = intervals(events, subs);
  const first = addMonths(cur, -(months - 1));
  const groups = new Map();
  subs.forEach((s) => { const c = ym(s.created_at); if (c >= first) groups.set(c, [...(groups.get(c) || []), s.id]); });
  const payingIn = (id, m) => (iv.get(id) || []).some((i) => String(i.from) < addMonths(m, 1) + '-01' && (i.to == null || String(i.to) >= m + '-01'));
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([cohort, ids]) => ({
    cohort, size: ids.length,
    cells: Array.from({ length: maxK }, (_, k) => { const m = addMonths(cohort, k); return m > cur ? null : ids.filter((id) => payingIn(id, m)).length / ids.length; })
  }));
}

/** Kohort okuma notu: k. aydaki ağırlıklı ortalama tutunma ve en büyük düşüş. */
export function cohortSummary(grid = []){
  const avg = (k) => {
    let n = 0, w = 0;
    grid.forEach((r) => { if (r.cells[k] != null && r.size) { n += r.cells[k] * r.size; w += r.size; } });
    return w ? n / w : null;
  };
  const curve = Array.from({ length: 12 }, (_, k) => avg(k));
  let drop = null;
  for (let k = 1; k < curve.length; k++) if (curve[k] != null && curve[k - 1] != null) {
    const d = curve[k - 1] - curve[k];
    if (!drop || d > drop.d) drop = { k, d };
  }
  return { curve, drop };
}

/* ---- sunucu ---- */
async function rpc(name, args){ const { client } = await import('./backend.js'); const r = await (await client()).rpc(name, args); if (r.error) throw r.error; return r.data; }
export async function loadChurn(){
  const [events, subs, cohorts] = await Promise.all([rpc('admin_subscription_events'), rpc('admin_subscriptions'), rpc('admin_cohorts', { n: 12 })]);
  return { events: events || [], subs: subs || [], cohorts: cohorts || [] };
}
