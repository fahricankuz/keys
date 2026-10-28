/* Site yönetimi (kurumsal yol planı Faz 2): daireler, malik ve kiracılar, tahakkuklar, giderler, duyurular, talepler.

   Yönetim tarafı kurumun rol yetkileriyle (org.js → orgCan), sakin tarafı dairesindeki kaydıyla erişir.
   Sunucu kuralları: supabase/schema.sql 17. bölüm (RLS ve guard_site_charges). */

import { t } from './i18n.js';
import { client, live, storeFile } from './backend.js';
import { storedPath } from './mapping.js';
import { emit } from './state.js';

function must(res){
  if (res.error) throw res.error;
  return res.data;
}
const db = async () => client();

/** Tahakkuk türleri. */
export const KINDS = () => [
  { key: 'aidat', label: t('Aidat') },
  { key: 'yakit', label: t('Yakıt') },
  { key: 'demirbas', label: t('Demirbaş') },
  { key: 'ozel', label: t('Özel toplama') }
];
export const kindLabel = (k, title) => (k === 'ozel' && title ? title : (KINDS().find((x) => x.key === k) || { label: k }).label);

/** Dağıtım anahtarları: daire aidatı, sabit tutar, eşit, m², arsa payı. */
export const MODES = () => [
  { key: 'unit', label: t('Dairenin aidatı') },
  { key: 'fixed', label: t('Her daireye aynı tutar') },
  { key: 'equal', label: t('Toplamı eşit böl') },
  { key: 'area', label: t('Toplamı m²’ye göre böl') },
  { key: 'share', label: t('Toplamı arsa payına göre böl') }
];

export const unitLabel = (u) => (u.block ? u.block + ' ' + t('Blok') + ' ' : '') + t('No') + ' ' + u.no;
export const sortUnits = (a, b) => String(a.block).localeCompare(String(b.block), 'tr', { numeric: true }) || String(a.no).localeCompare(String(b.no), 'tr', { numeric: true });

/**
 * Dağıtım: her daireye düşen tutar (kuruş yuvarlaması son daireye eklenir; toplam korunur).
 * @returns {{unit_id:string, amount:number}[]}
 */
export function distribute(units, mode, value){
  const list = units.slice().sort(sortUnits);
  if (!list.length) return [];
  const r2 = (x) => Math.round(x * 100) / 100;
  if (mode === 'unit') return list.filter((u) => Number(u.aidat) > 0).map((u) => ({ unit_id: u.id, amount: r2(Number(u.aidat)) }));
  if (mode === 'fixed') return list.map((u) => ({ unit_id: u.id, amount: r2(Number(value) || 0) }));
  const weight = (u) => (mode === 'area' ? Number(u.area) || 0 : mode === 'share' ? Number(u.share) || 0 : 1);
  const total = Number(value) || 0;
  const sum = list.reduce((a, u) => a + weight(u), 0);
  if (!sum) return [];
  const out = list.map((u) => ({ unit_id: u.id, amount: r2((total * weight(u)) / sum) }));
  const diff = r2(total - out.reduce((a, x) => a + x.amount, 0));
  if (diff) out[out.length - 1].amount = r2(out[out.length - 1].amount + diff);
  return out.filter((x) => x.amount > 0);
}

/** Ödenmemiş tutar. */
export const unpaidOf = (c) => (c.status === 'paid' ? 0 : Math.max(0, Number(c.amount) - (c.status === 'partial' ? Number(c.paid_amount) || 0 : 0)));

/** Kat Mülkiyeti Kanunu 20. madde: geciken her ay için ödenmeyen tutarın %5'i (bilgi amaçlı hesap; tahakkuk edilmez). */
export function lateFee(c, today = new Date()){
  const left = unpaidOf(c);
  if (!left) return 0;
  const [y, m] = String(c.month).split('-').map(Number);
  const end = new Date(y, m, 0);                     // ayın son günü vade
  if (today <= end) return 0;
  const months = (today.getFullYear() - end.getFullYear()) * 12 + (today.getMonth() - end.getMonth());
  return Math.round(left * 0.05 * Math.max(1, months) * 100) / 100;
}

/* ---- Yönetim ------------------------------------------------------ */

/** Yönetim ekranının tüm verisi (son 13 ayın tahakkukları). */
export async function loadSiteAdmin(oid){
  const c = await db();
  const since = (() => { const d = new Date(); d.setMonth(d.getMonth() - 12); return d.toISOString().slice(0, 7); })();
  const [units, residents, charges, expenses, notes, requests, budgets, linked] = await Promise.all([
    c.from('site_units').select('*').eq('org_id', oid),
    c.from('site_residents').select('*').eq('org_id', oid),
    c.from('site_charges').select('*').eq('org_id', oid),
    c.from('site_expenses').select('*').eq('org_id', oid),
    c.from('site_announcements').select('*').eq('org_id', oid),
    c.from('site_requests').select('*').eq('org_id', oid),
    c.from('site_budgets').select('*').eq('org_id', oid),
    c.rpc('site_linked_tenants', { oid })
  ].map((p) => p.then((r) => (r.error ? [] : r.data || []))));
  return {
    units: units.sort(sortUnits), residents, budgets, linked,
    charges: charges.filter((x) => x.month >= since).sort((a, b) => b.month.localeCompare(a.month)),
    expenses: expenses.sort((a, b) => String(b.spent_on).localeCompare(String(a.spent_on))),
    notes: notes.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    requests: requests.sort((a, b) => (a.status - b.status) || String(b.created_at).localeCompare(String(a.created_at)))
  };
}

export async function saveUnit(oid, u){
  const c = await db();
  const row = { org_id: oid, block: String(u.block || '').trim(), no: String(u.no || '').trim(), area: Number(u.area) || null,
    share: Number(u.share) || null, aidat: u.aidat === '' || u.aidat == null ? null : Number(u.aidat), payer: u.payer === 'malik' ? 'malik' : 'kiraci', note: u.note || '' };
  if (u.id) return must(await c.from('site_units').update(row).eq('id', u.id));
  return must(await c.from('site_units').insert(row).select().single());
}
export async function deleteUnit(id){ must(await (await db()).from('site_units').delete().eq('id', id)); }

/**
 * Toplu daire ekleme. Her satır: Blok; No; m²; Arsa payı; Aidat; Malik adı; Malik telefonu (sekme, noktalı virgül ya da virgülle ayrılmış).
 * Başlık satırı ve boş satırlar atlanır. Dönen: { units, residents, skipped }.
 */
export function parseUnits(text){
  const out = [], skipped = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cells = line.split(/\t|;|,(?=\s*\S)/).map((x) => x.trim());
    if (i === 0 && /blok|block/i.test(cells[0] || '')) return;
    const [block, no, area, share, aidat, owner, phone] = cells;
    const num = (v) => (v ? Number(String(v).replace(/\./g, '').replace(',', '.')) || null : null);
    if (!no){ skipped.push(i + 1); return; }
    out.push({ block: block || '', no, area: num(area), share: num(share), aidat: num(aidat), owner: owner || '', phone: phone || '' });
  });
  return { rows: out, skipped };
}
export async function importUnits(oid, rows){
  const c = await db();
  const made = must(await c.from('site_units').insert(rows.map((r) => ({ org_id: oid, block: r.block, no: r.no, area: r.area, share: r.share, aidat: r.aidat }))).select());
  const owners = rows.map((r, i) => (r.owner ? { org_id: oid, unit_id: made[i].id, role: 'malik', name: r.owner, phone: r.phone || '' } : null)).filter(Boolean);
  if (owners.length) must(await c.from('site_residents').insert(owners));
  return made.length;
}

export async function saveResident(oid, r){
  const c = await db();
  const row = { org_id: oid, unit_id: r.unit_id, role: r.role === 'malik' ? 'malik' : 'kiraci', name: String(r.name || '').trim(),
    phone: String(r.phone || '').trim(), email: String(r.email || '').trim().toLowerCase(), lives_here: r.lives_here !== false };
  if (r.id) return must(await c.from('site_residents').update(row).eq('id', r.id));
  return must(await c.from('site_residents').insert(row).select().single());
}
export async function deleteResident(id){ must(await (await db()).from('site_residents').delete().eq('id', id)); }

/** Toplu tahakkuk: seçilen aya ve türe dağıtılan tutarlar (aynı ay/tür/başlık için daha önce girilmiş daireler atlanır). */
export async function createCharges(oid, { month, kind, title = '', mode, value, units, existing = [] }){
  const taken = new Set(existing.filter((x) => x.month === month && x.kind === kind && (x.title || '') === (title || '')).map((x) => x.unit_id));
  const rows = distribute(units, mode, value).filter((x) => !taken.has(x.unit_id))
    .map((x) => ({ org_id: oid, unit_id: x.unit_id, month, kind, title: kind === 'ozel' ? title : '', amount: x.amount }));
  if (!rows.length) return 0;
  must(await (await db()).from('site_charges').insert(rows));
  return rows.length;
}
export async function deleteCharge(id){ must(await (await db()).from('site_charges').delete().eq('id', id)); }

/** Yönetim kararı: onay (tutar tamamsa ödendi, eksikse kısmi) ya da gerekçeli red. */
export async function decideCharge(ch, ok, reason = ''){
  const c = await db();
  const values = ok
    ? { status: Number(ch.paid_amount) >= Number(ch.amount) ? 'paid' : 'partial', reject_reason: null }
    : { status: 'rejected', reject_reason: String(reason || '').trim() || t('Dekont uygun değil') };
  must(await c.from('site_charges').update(values).eq('id', ch.id));
}
/** Yönetim, dekontsuz gelen ödemeyi (elden, havale) işler. */
export async function markPaid(ch, amount, method = 'havale'){
  const paid = Number(amount) || Number(ch.amount);
  must(await (await db()).from('site_charges').update({
    status: paid >= Number(ch.amount) ? 'paid' : 'partial', paid_amount: paid, paid_on: new Date().toISOString().slice(0, 10), method, reject_reason: null
  }).eq('id', ch.id));
}

export async function addExpense(oid, e){
  must(await (await db()).from('site_expenses').insert({ org_id: oid, cat: e.cat, amount: Number(e.amount) || 0, spent_on: e.spent_on || new Date().toISOString().slice(0, 10), note: e.note || '' }));
}
export async function deleteExpense(id){ must(await (await db()).from('site_expenses').delete().eq('id', id)); }
export async function announce(oid, title, body){
  must(await (await db()).from('site_announcements').insert({ org_id: oid, title: String(title).trim(), body: String(body || '').trim(), created_by: live.user?.id }));
}
export async function deleteAnnouncement(id){ must(await (await db()).from('site_announcements').delete().eq('id', id)); }
export async function answerRequest(id, status, reply){
  must(await (await db()).from('site_requests').update({ status, reply: String(reply || '').trim() }).eq('id', id));
}

/* ---- Sakin (malik ya da kiracı) ----------------------------------- */

/** Site davet kodu "S" ile başlar (mülk kodları 0-9 ve A-F; kurum kodları "K"). */
export const isSiteCode = (code) => /^S[0-9A-F]{7}$/.test(String(code || '').trim().toUpperCase());

export const mySiteUnits = () => live.siteUnits || [];
export async function refreshSiteUnits(redraw = true){
  try { live.siteUnits = must(await (await db()).rpc('my_site_units')) || []; } catch(e){ console.warn('Site daireleri okunamadı', e); }
  if (redraw) emit();
  return live.siteUnits || [];
}
export async function acceptSiteInvite(code){
  const unit = must(await (await db()).rpc('accept_site_invite', { invite_code: String(code).trim().toUpperCase() }));
  await refreshSiteUnits();
  return unit;
}

/** Sakinin görebildiği tahakkuklar, duyurular ve kendi talepleri. */
export async function loadMySite(){
  const c = await db();
  const ids = [...new Set(mySiteUnits().map((u) => u.org_id))];
  if (!ids.length) return { charges: [], notes: [], requests: [] };
  const [charges, notes, requests] = await Promise.all([
    c.from('site_charges').select('*').in('org_id', ids),
    c.from('site_announcements').select('*').in('org_id', ids),
    c.from('site_requests').select('*').in('org_id', ids)
  ].map((p) => p.then((r) => (r.error ? [] : r.data || []))));
  return {
    charges: charges.sort((a, b) => b.month.localeCompare(a.month)),
    notes: notes.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    requests: requests.filter((r) => r.user_id === live.user?.id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
  };
}

/** Sakin dekont yükler: dosya site klasörüne gider, tahakkuk yönetimin onayına düşer. */
export async function payCharge(ch, { amount, date, note, file }){
  const stored = file ? await storeFile('site-' + ch.org_id, file) : null;
  const path = stored ? storedPath(stored) : null;
  if (file && !path) throw new Error(t('Dosya yüklenemedi'));
  must(await (await db()).from('site_charges').update({
    status: 'review', paid_amount: (ch.status === 'partial' ? Number(ch.paid_amount) || 0 : 0) + (Number(amount) || 0),
    paid_on: date || new Date().toISOString().slice(0, 10), note: note || null,
    receipt_name: file ? file.name || 'dekont' : '', receipt_path: path
  }).eq('id', ch.id));
}

export async function openSiteRequest(oid, unitId, { cat, title, body }){
  must(await (await db()).from('site_requests').insert({ org_id: oid, unit_id: unitId || null, user_id: live.user?.id, cat, title: String(title).trim(), body: String(body || '').trim() }));
}

/* ---- Mülk ↔ daire bağlantısı -------------------------------------- */

/** Ev sahibi mülkünü sitedeki dairesine bağlar (dairenin maliki olarak kayıtlı olmalı) ya da bağı kaldırır (unit boş). */
export async function linkSiteUnit(pid, unit){
  must(await (await db()).rpc('link_site_unit', { pid, unit: unit || null }));
  await refreshSiteUnits(false);
}
/** Bir dairenin tahakkukları (yeniden eskiye). */
export async function loadUnitCharges(unitId){
  const r = await (await db()).from('site_charges').select('*').eq('unit_id', unitId);
  return (r.error ? [] : r.data || []).sort((a, b) => b.month.localeCompare(a.month));
}

/* ---- İşletme projesi (yıllık bütçe) ------------------------------- */

export const budgetTotal = (b) => (b && Array.isArray(b.items) ? b.items.reduce((a, i) => a + (Number(i.amount) || 0), 0) : 0);
/** Bütçeden dairelerin aylık aidatı: yıllık toplam, seçilen anahtara (arsa payı, m², eşit) göre bölünüp 12'ye. */
export function budgetAidat(units, b){
  const total = budgetTotal(b);
  if (!total) return [];
  return distribute(units, b.method === 'area' ? 'area' : b.method === 'equal' ? 'equal' : 'share', total)
    .map((x) => ({ unit_id: x.unit_id, monthly: Math.round((x.amount / 12) * 100) / 100 }));
}
export async function saveBudget(oid, b){
  const row = { org_id: oid, year: Number(b.year), method: b.method || 'share', note: b.note || '', approved_on: b.approved_on || null,
    items: (b.items || []).filter((i) => String(i.cat || '').trim()).map((i) => ({ cat: String(i.cat).trim(), amount: Number(String(i.amount).replace(',', '.')) || 0 })) };
  must(await (await db()).from('site_budgets').upsert(row, { onConflict: 'org_id,year' }));
}
export async function loadBudgets(oids){
  if (!oids.length) return [];
  const r = await (await db()).from('site_budgets').select('*').in('org_id', oids);
  return r.error ? [] : r.data || [];
}
/** Bütçedeki aylık aidatları dairelere yazar. */
export async function applyBudgetAidat(oid, units, b){
  const plan = budgetAidat(units, b);
  for (const x of plan){
    const u = units.find((y) => y.id === x.unit_id);
    if (u && Number(u.aidat) !== x.monthly) await saveUnit(oid, { ...u, aidat: x.monthly });
  }
  return plan.length;
}

/* ---- Yönetim kurulu raporu (ekranda; e-postadaki site_report ile aynı hesap) ---- */

/** "2026-10" → "2026-11-01" (sonraki ayın ilk günü; saat diliminden bağımsız). */
const nextMonthStart = (ym) => { const [a, b] = ym.split('-').map(Number); return b === 12 ? (a + 1) + '-01-01' : a + '-' + String(b + 1).padStart(2, '0') + '-01'; };

export function siteReport(d, period, ref){
  const y = Number(String(ref).slice(0, 4)), mo = Number(String(ref).slice(5, 7));
  const m0 = period === 'year' ? y + '-01' : ref.slice(0, 7), m1 = period === 'year' ? y + '-12' : ref.slice(0, 7);
  const d0 = m0 + '-01', d1 = nextMonthStart(m1);
  const inP = (x) => x.month >= m0 && x.month <= m1;
  const kinds = {};
  d.charges.filter(inP).forEach((x) => {
    const k = kinds[x.kind] || (kinds[x.kind] = { kind: x.kind, charged: 0, collected: 0 });
    k.charged += Number(x.amount);
    k.collected += x.status === 'paid' ? Number(x.amount) : x.status === 'partial' ? Number(x.paid_amount) : 0;
  });
  const cats = {};
  d.expenses.filter((e) => e.spent_on >= d0 && e.spent_on < d1).forEach((e) => { cats[e.cat] = (cats[e.cat] || 0) + Number(e.amount); });
  const unitBy = Object.fromEntries(d.units.map((u) => [u.id, u]));
  const now = new Date().toISOString().slice(0, 10);
  const debt = {};
  d.charges.filter((x) => x.status !== 'paid' && x.month <= m1).forEach((x) => {
    const due = nextMonthStart(x.month);                         // ay sonundan sonraki gün
    if (due > (d1 < now ? d1 : now)) return;
    debt[x.unit_id] = (debt[x.unit_id] || 0) + unpaidOf(x);
  });
  const budget = (d.budgets || []).find((b) => Number(b.year) === y) || null;
  return {
    period, from: d0, to: d1, units: d.units.length, month: mo,
    charges: Object.values(kinds),
    expenses: Object.entries(cats).map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total),
    budget: budget ? { ...budget, total: budgetTotal(budget) } : null,
    debtors: Object.entries(debt).filter(([, v]) => v > 0).map(([id, unpaid]) => ({ unit: unitBy[id] ? unitLabel(unitBy[id]) : '—', unpaid }))
      .sort((a, b) => b.unpaid - a.unpaid).slice(0, 20),
    requests: { opened: d.requests.filter((r) => String(r.created_at).slice(0, 10) >= d0 && String(r.created_at).slice(0, 10) < d1).length,
                open: d.requests.filter((r) => r.status < 3).length }
  };
}
