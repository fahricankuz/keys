/* Site yönetimi (kurumsal yol planı Faz 2): daireler, malik ve kiracılar, tahakkuklar, giderler, duyurular, talepler.

   Yönetim tarafı kurumun rol yetkileriyle (org.js → orgCan), sakin tarafı dairesindeki kaydıyla erişir.
   Sunucu kuralları: supabase/schema.sql 17. bölüm (RLS ve guard_site_charges). */

import { t } from './i18n.js';
import { logCaught } from './logs.js';
import { client, live, storeFile, inviteLink } from './backend.js';
import { waLink } from './wa.js';
import { storedPath } from './mapping.js';
import { emit, S, ui } from './state.js';
import { iso, mkey } from './util.js';
import { CONFIG } from './config.js';
import { amountIn, chargeIn } from './fx-report.js';

function must(res){
  if (res.error) throw res.error;
  return res.data;
}
const db = async () => client();

/** Sitede mi, ticari portföyde mi (AVM, depo, GYO)? Ticari kurumda birimin kira sözleşmesi vardır. */
export const isCommercial = (sector) => !!sector && sector !== 'site';

const KIND_LABEL = () => ({ aidat: t('Aidat'), yakit: t('Yakıt'), demirbas: t('Demirbaş'), ozel: t('Özel toplama'),
  kira: t('Kira'), ortak_gider: t('Ortak alan gideri'), ciro: t('Ciro farkı') });
/** Tahakkuk türleri (sektöre göre). Ciro farkı elle değil, ciro onayıyla tahakkuk edilir. */
export const KINDS = (sector) => (isCommercial(sector) ? ['kira', 'ortak_gider', 'ozel'] : ['aidat', 'yakit', 'demirbas', 'ozel'])
  .map((key) => ({ key, label: KIND_LABEL()[key] }));
export const kindLabel = (k, title) => (k === 'ozel' && title ? title : KIND_LABEL()[k] || k);

/** Dağıtım anahtarları. Sitede: dairenin aidatı, sabit, eşit, m², arsa payı. Ticaride: birimin kirası, ortak gider avansı, sabit, eşit, m². */
export const MODES = (sector) => (isCommercial(sector) ? [
  { key: 'rent', label: t('Birimin kirası') },
  { key: 'unit', label: t('Birimin ortak gider avansı') },
  { key: 'fixed', label: t('Her birime aynı tutar') },
  { key: 'equal', label: t('Toplamı eşit böl') },
  { key: 'area', label: t('Toplamı m²’ye göre böl') }
] : [
  { key: 'unit', label: t('Dairenin aidatı') },
  { key: 'fixed', label: t('Her daireye aynı tutar') },
  { key: 'equal', label: t('Toplamı eşit böl') },
  { key: 'area', label: t('Toplamı m²’ye göre böl') },
  { key: 'share', label: t('Toplamı arsa payına göre böl') }
]);

/** Birim etiketi: sitede "A Blok No 3" (villada "Villa 3"), ticaride "Zemin kat · Z-12" (schema.sql → unit_label ile aynı). */
export const unitLabel = (u) => (isCommercial(u.sector)
  ? (u.block ? u.block + ' · ' : '') + u.no
  : (u.block ? u.block + ' ' + t('Blok') + ' ' : '') + (/^\d/.test(String(u.no)) ? t('No') + ' ' : '') + u.no);
export const sortUnits = (a, b) => String(a.block).localeCompare(String(b.block), 'tr', { numeric: true }) || String(a.no).localeCompare(String(b.no), 'tr', { numeric: true });

/**
 * Dağıtım: her daireye düşen tutar (kuruş yuvarlaması son daireye eklenir; toplam korunur).
 * @returns {{unit_id:string, amount:number}[]}
 */
export function distribute(units, mode, value, fx = {}){
  const list = units.slice().sort(sortUnits);
  if (!list.length) return [];
  const r2 = (x) => Math.round(x * 100) / 100;
  if (mode === 'rent') return list.filter((u) => Number(u.rent) > 0).map((u) => Object.assign({ unit_id: u.id }, rentCharge(u, fx)))
    .filter((x) => x.amount > 0);
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
/** Aidatı fiilen kim öder (sunucudaki public.site_payer ile aynı kural): dairede seçilen rol; o rolde hesabı bağlı kimse yoksa
    ve diğer rolde varsa diğer rol. residents: dairenin kayıtları (user_id dolu olan hesabı bağlı), linked: bağlı mülkün kiracıları. */
export function effectivePayer(u, residents = [], linked = []){
  const roles = new Set([
    ...residents.filter((r) => r.unit_id === u.id && r.user_id).map((r) => r.role),
    ...linked.filter((x) => x.unit_id === u.id).map(() => 'kiraci')
  ]);
  const p = u.payer === 'malik' ? 'malik' : 'kiraci';
  if (roles.has(p) || !roles.size) return p;
  return p === 'kiraci' ? 'malik' : 'kiraci';
}

/** Sakinin ekranı: bu dairede aidatı ben mi öderim? (Eski sunucuda "pays" yoksa seçilen role bakılır.) */
export const unitPays = (u) => (u.pays != null ? !!u.pays : u.payer === u.role);

/** "Aidatı kiracı öder" / "Kiracı olmadığı için aidatı malik öder"… effective: fiilen ödeyen rol. */
export function payerText(payer, effective){
  const eff = effective || payer;
  if (eff !== payer) return eff === 'malik' ? t('Kiracı olmadığı için aidatı malik öder') : t('Malik olmadığı için aidatı kiracı öder');
  return payer === 'malik' ? t('Aidatı malik öder') : t('Aidatı kiracı öder');
}

export const unpaidOf = (c) => (c.status === 'paid' ? 0 : Math.max(0, Number(c.amount) - (c.status === 'partial' ? Number(c.paid_amount) || 0 : 0)));

/** Birimin bir aylık kira tahakkuku (TL): döviz kirası girilen kurla çevrilir; KDV'li sözleşmede %20 eklenir,
    stopajlı sözleşmede kiracının keseceği %20 düşülür (kiraya verene yatacak net tutar). */
export function rentCharge(u, fx = {}){
  const cur = u.currency || 'TRY';
  const rate = cur === 'TRY' ? 1 : Number(fx[cur]) || 0;
  const base = Number(u.rent) || 0;
  let amount = base * rate;
  if (u.vat) amount *= 1.2;
  else if (u.stopaj) amount *= 0.8;
  return { amount: Math.round(amount * 100) / 100, currency: cur, fx: cur === 'TRY' ? null : rate || null, orig_amount: cur === 'TRY' ? null : base };
}

/** Vade: tahakkuktaki ödeme günü, yoksa ayın son günü. */
export function dueOf(c){
  if (c.due_on) return new Date(c.due_on + 'T23:59:59');
  const [y, m] = String(c.month).split('-').map(Number);
  return new Date(y, m, 0, 23, 59, 59);
}
export const overdue = (c, today = new Date()) => unpaidOf(c) > 0 && today > dueOf(c);

/** Kat Mülkiyeti Kanunu 20. madde: geciken her ay için ödenmeyen tutarın %5'i (bilgi amaçlı hesap; tahakkuk edilmez). */
export function lateFee(c, today = new Date()){
  const left = unpaidOf(c);
  if (!left) return 0;
  const end = dueOf(c);
  if (today <= end) return 0;
  const months = (today.getFullYear() - end.getFullYear()) * 12 + (today.getMonth() - end.getMonth());
  return Math.round(left * 0.05 * Math.max(1, months) * 100) / 100;
}

/* ---- Yönetim ------------------------------------------------------ */

/** Yönetim ekranının tüm verisi (son 13 ayın tahakkukları). */
/** Site giderlerinin kategorileri (kalem). Eski serbest yazılmış kalemler olduğu gibi kalır. İşletme projesi de bu listeyi kullanır. */
export const SITE_EXPENSE_CATS = () => [t('Personel'), t('Temizlik'), t('Elektrik ve su (ortak alan)'), t('Asansör'), t('Jeneratör ve bakım'),
  t('Bahçe'), t('Sigorta'), t('Onarım ve tadilat'), t('Yönetim ve muhasebe'), t('Diğer')];
/** Kasaya giren tahsilatlar: aidat ve site toplamaları (yakıt, demirbaş, özel toplama). */
export const COLLECTED_KINDS = ['aidat', 'yakit', 'demirbas', 'ozel'];
const lastDayOfMonth = (m) => { const [y, mo] = String(m).split('-').map(Number); return m + '-' + String(new Date(y, mo, 0).getDate()).padStart(2, '0'); };

/** Kasa (aidat havuzu), from–to (YYYY-AA-GG, dahil): devreden + tahsilat − gider = kalan. Açılış gününden önceki işlemler sayılmaz.
    { carry, income, spent, left, opening, openingOn, byCat }. */
export function cashbook(d, from, to){
  const opening = Number(d.cash?.opening) || 0, start = d.cash?.opening_on ? String(d.cash.opening_on).slice(0, 10) : '0000-00-00';
  let carry = opening, income = 0, spent = 0;
  const byCat = {};
  (d.collections || []).forEach((x) => {
    if (x.day < start) return;
    if (x.day < from) carry += x.amount; else if (x.day <= to) income += x.amount;
  });
  (d.expenses || []).forEach((e) => {
    const day = String(e.spent_on).slice(0, 10), v = Number(e.amount) || 0;
    if (day < start) return;
    if (day < from) carry -= v;
    else if (day <= to){ spent += v; byCat[e.cat] = (byCat[e.cat] || 0) + v; }
  });
  return { carry, income, spent, left: carry + income - spent, opening, openingOn: d.cash?.opening_on || null, byCat };
}

/** Düzenli gider (migration duzenli_gider_seffaflik): her ay `day` günü kayda düşer. r: { cat, amount, day, note, start_month, end_month }. */
export async function saveRecurring(oid, r){
  must(await (await db()).from('site_recurring_expenses').insert({ org_id: oid, cat: r.cat, amount: Number(r.amount) || 0,
    day: Math.min(28, Math.max(1, Number(r.day) || 1)), note: r.note || '', start_month: r.start_month || mkey(new Date()), end_month: r.end_month || null, active: true }));
}
export async function setRecurringActive(id, active){ must(await (await db()).from('site_recurring_expenses').update({ active: !!active }).eq('id', id)); }
export async function deleteRecurring(id){ must(await (await db()).from('site_recurring_expenses').delete().eq('id', id)); }

/** Sakinlere kasa özeti ve fatura paylaşımı (yönetim açar; varsayılan kapalı). Açılış bakiyesine dokunmaz. */
export async function setCashSharing(oid, cash, flags){
  const c = await db();
  if (cash) must(await c.from('site_cash').update(flags).eq('org_id', oid));
  else must(await c.from('site_cash').insert({ org_id: oid, opening: 0, opening_on: iso(new Date()), ...flags }));
}

/** Ayın kasa özeti (sunucu): yönetim her zaman, sakin yalnız yönetim paylaştıysa; paylaşılmıyorsa null. */
export async function loadCashSummary(oid, month){
  const r = await (await db()).rpc('site_cash_summary', { oid, m: month });
  return r.error ? null : r.data;
}

/** Kasanın açılış bakiyesi (sitenin anahtar'a geçtiği gün kasadaki tutar). */
export async function saveCash(oid, opening, on){
  must(await (await db()).from('site_cash').upsert({ org_id: oid, opening: Number(opening) || 0, opening_on: on || iso(new Date()), updated_at: new Date().toISOString() }));
}

export async function loadSiteAdmin(oid){
  const c = await db();
  const since = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 12); return mkey(d); })();
  const [units, residents, charges, expenses, notes, requests, budgets, linked, turnovers, rentChanges, orgRow, auto, documents, cash, recurring] = await Promise.all([
    c.from('site_units').select('*').eq('org_id', oid),
    c.from('site_residents').select('*').eq('org_id', oid),
    c.from('site_charges').select('*').eq('org_id', oid),
    c.from('site_expenses').select('*').eq('org_id', oid),
    c.from('site_announcements').select('*').eq('org_id', oid),
    c.from('site_requests').select('*').eq('org_id', oid),
    c.from('site_budgets').select('*').eq('org_id', oid),
    c.rpc('site_linked_tenants', { oid }),
    c.from('site_turnovers').select('*').eq('org_id', oid),
    c.from('site_rent_changes').select('*').eq('org_id', oid),
    c.from('organizations').select('sector').eq('id', oid),
    c.from('site_auto').select('*').eq('org_id', oid),
    c.from('site_documents').select('*').eq('org_id', oid),
    c.from('site_cash').select('*').eq('org_id', oid),
    c.from('site_recurring_expenses').select('*').eq('org_id', oid)
  ].map((p) => p.then((r) => (r.error ? [] : r.data || []))));
  const sector = (orgRow[0] || {}).sector || 'site';
  return {
    sector, units: units.map((u) => Object.assign(u, { sector })).sort(sortUnits), residents, budgets, linked, auto: auto[0] || null,
    // Kasa: açılış bakiyesi ve bütün tahsilatlar (12 ayla sınırlı değil; devreden bakiye için).
    cash: cash[0] || null,
    recurring: recurring.sort((a, b) => Number(b.active) - Number(a.active) || String(a.cat).localeCompare(String(b.cat))),
    collections: charges.filter((x) => COLLECTED_KINDS.includes(x.kind) && (x.status === 'paid' || x.status === 'partial'))
      .map((x) => ({ day: x.paid_on ? String(x.paid_on).slice(0, 10) : lastDayOfMonth(x.month), amount: x.status === 'paid' ? Number(x.amount) : Number(x.paid_amount) || 0 })),
    documents: documents.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    turnovers: turnovers.sort((a, b) => b.month.localeCompare(a.month)),
    rentChanges: rentChanges.sort((a, b) => String(b.from_date).localeCompare(String(a.from_date))),
    charges: charges.filter((x) => x.month >= since).sort((a, b) => b.month.localeCompare(a.month)),
    expenses: expenses.sort((a, b) => String(b.spent_on).localeCompare(String(a.spent_on))),
    notes: notes.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    requests: requests.sort((a, b) => (a.status - b.status) || String(b.created_at).localeCompare(String(a.created_at)))
  };
}

const numOrNull = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));
export async function saveUnit(oid, u){
  const c = await db();
  const row = { org_id: oid, block: String(u.block || '').trim(), no: String(u.no || '').trim(), area: Number(u.area) || null,
    share: Number(u.share) || null, aidat: numOrNull(u.aidat), payer: u.payer === 'malik' ? 'malik' : 'kiraci', note: u.note || '',
    rent: numOrNull(u.rent), currency: ['USD', 'EUR'].includes(u.currency) ? u.currency : 'TRY', turnover_rate: numOrNull(u.turnover_rate),
    lease_start: u.lease_start || null, lease_end: u.lease_end || null, index_kind: ['sabit', 'yok'].includes(u.index_kind) ? u.index_kind : 'tufe',
    index_rate: numOrNull(u.index_rate), vat: !!u.vat, stopaj: !u.vat && !!u.stopaj, due_day: numOrNull(u.due_day), ...depositRow(u) };
  if (u.id) return must(await c.from('site_units').update(row).eq('id', u.id));
  return must(await c.from('site_units').insert(row).select().single());
}
/** Depozito alanları (migration depozito_otomatik_kira): yalnız depozito girilmişse ya da önceden varsa yazılır; böylece
    migration'dan önce yayınlanan sürüm eski veritabanında sözleşme kaydederken hata vermez. */
export function depositRow(u){
  const any = u.deposit_amount != null && u.deposit_amount !== '' || u.deposit_returned_on || u.deposit_until;
  if (!any) return {};
  const d = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);
  return {
    deposit_amount: numOrNull(u.deposit_amount), deposit_currency: ['USD', 'EUR'].includes(u.deposit_currency) ? u.deposit_currency : 'TRY',
    deposit_kind: ['teminat', 'bloke'].includes(u.deposit_kind) ? u.deposit_kind : 'nakit', deposit_on: d(u.deposit_on),
    deposit_bank: String(u.deposit_bank || '').trim().slice(0, 120), deposit_until: u.deposit_kind === 'teminat' ? d(u.deposit_until) : null,
    deposit_returned_on: d(u.deposit_returned_on), deposit_returned: numOrNull(u.deposit_returned),
    deposit_cut_reason: String(u.deposit_cut_reason || '').trim().slice(0, 300)
  };
}

export const depositKindLabel = (k) => (k === 'teminat' ? t('Teminat mektubu') : k === 'bloke' ? t('Banka blokesi') : t('Nakit'));

/** Depozitosu olan ve iade edilmemiş birimlerin para birimine göre toplamı: { TRY: n, USD: n, EUR: n }. */
export function depositTotals(units){
  const out = {};
  units.filter((u) => Number(u.deposit_amount) > 0 && !u.deposit_returned_on).forEach((u) => {
    const k = u.deposit_currency || 'TRY';
    out[k] = (out[k] || 0) + Number(u.deposit_amount);
  });
  return out;
}

/** Süresi yaklaşan (ya da geçmiş) teminat mektupları: bitişi `days` gün içinde olanlar, tarih sırasıyla. */
export function expiringGuarantees(units, today = new Date(), days = 60){
  const from = iso(today), to = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days));
  return units.filter((u) => u.deposit_kind === 'teminat' && u.deposit_until && !u.deposit_returned_on && u.deposit_until <= to)
    .map((u) => ({ unit: u, until: u.deposit_until, late: u.deposit_until < from }))
    .sort((a, b) => a.until.localeCompare(b.until));
}

export async function deleteUnit(id){ must(await (await db()).from('site_units').delete().eq('id', id)); }

/**
 * Toplu daire ekleme. Her satır: Blok; No; m²; Arsa payı; Aidat; Malik adı; Malik telefonu (sekme, noktalı virgül ya da virgülle ayrılmış).
 * Başlık satırı ve boş satırlar atlanır. Dönen: { units, residents, skipped }.
 */
export function parseUnits(text, commercial = false){
  const out = [], skipped = [];
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cells = line.split(/\t|;|,(?=\s*\S)/).map((x) => x.trim());
    if (i === 0 && /blok|block|kat/i.test(cells[0] || '') && !/\d/.test(cells[1] || '')) return;
    const num = (v) => (v ? Number(String(v).replace(/\./g, '').replace(',', '.')) || null : null);
    if (!cells[1]){ skipped.push(i + 1); return; }
    if (commercial){
      // Ticari: Kat; No; m²; Aylık kira; Para birimi; Kiracı; Telefon
      const [block, no, area, rent, cur, owner, phone] = cells;
      const currency = /usd|\$/i.test(cur || '') ? 'USD' : /eur|€/i.test(cur || '') ? 'EUR' : 'TRY';
      out.push({ block: block || '', no, area: num(area), rent: num(rent), currency, owner: owner || '', phone: phone || '' });
      return;
    }
    const [block, no, area, share, aidat, owner, phone] = cells;
    out.push({ block: block || '', no, area: num(area), share: num(share), aidat: num(aidat), owner: owner || '', phone: phone || '' });
  });
  return { rows: out, skipped };
}
/** Toplu ekleme; sitede satırdaki kişi malik, ticaride kiracı olarak eklenir. */
export async function importUnits(oid, rows, commercial = false){
  const c = await db();
  const made = must(await c.from('site_units').insert(rows.map((r) => Object.assign({ org_id: oid, block: r.block, no: r.no, area: r.area },
    commercial ? { rent: r.rent, currency: r.currency || 'TRY' } : { share: r.share, aidat: r.aidat }))).select());
  const people = rows.map((r, i) => (r.owner ? { org_id: oid, unit_id: made[i].id, role: commercial ? 'kiraci' : 'malik', name: r.owner, phone: r.phone || '' } : null)).filter(Boolean);
  if (people.length) must(await c.from('site_residents').insert(people));
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

/* ---- Davet: e-posta (site-invite fonksiyonu) ve WhatsApp ---------- */

/** Kişinin davet durumu: hesabı bağlı, davet gönderildi ya da henüz davet edilmedi. */
export const inviteState = (r) => (r.user_id ? 'linked' : r.invited_at ? 'invited' : 'none');
export function inviteText(org, unit, code, commercial = false){
  if (commercial) return t('{org} yönetimi seni {unit} için anahtar’a davet etti. Kiranı, faturalarını ve taleplerini buradan izleyeceksin. Ücretsiz hesabını aç: {url} (davet kodu: {code})', { org, unit, url: inviteLink(code), code });
  return t('{org} sitesindeki {unit} dairen için anahtar daveti. Bağlantıdan ücretsiz hesabını aç: {url} (davet kodu: {code})', { org, unit, url: inviteLink(code), code });
}
export const inviteWa = (r, org, unit, commercial = false) => waLink(r.phone, inviteText(org, unit, r.code, commercial));
/** Davet e-postası (e-posta girildiyse) gönderilir ve davet "gönderildi" olarak işaretlenir. E-posta gönderilemezse WhatsApp yine çalışır. */
export async function sendSiteInvite(r){
  const c = await db();
  let mailed = false;
  if (r.email){
    try {
      const res = await c.functions.invoke('site-invite', { body: { resident: r.id } });
      mailed = !res.error;
    } catch(e){ logCaught('Davet e-postası gönderilemedi', e); }
  }
  await markInvited(r.id);
  return mailed;
}
export async function markInvited(id){
  try { await (await db()).from('site_residents').update({ invited_at: new Date().toISOString() }).eq('id', id); } catch(e){}
}
/** /katil sayfası: kodun sitesi ve dairesi; kullanılmamışsa yönetimin girdiği ad, telefon ve e-posta (kayıt formunu doldurmak için). */
export async function siteInviteInfo(code){
  return must(await (await db()).rpc('site_invite_info', { invite_code: String(code || '').trim().toUpperCase() }));
}

/* ---- Otomatik aidat (schema.sql 29. bölüm → site_auto_run) -------- */

const nextMonthKey = (d) => mkey(new Date(d.getFullYear(), d.getMonth() + 1, 1));
/** Ayar kaydı. Açılırken (ya da gün değişirken) ilk ay seçilir: tahakkuk günü bu ay geçtiyse ilk otomatik tahakkuk gelecek ay. */
export async function saveAuto(oid, a, prev = null, today = new Date()){
  const run = Math.min(28, Math.max(1, Number(a.run_day) || 1)), due = Math.min(28, Math.max(1, Number(a.due_day) || 10));
  const fresh = a.enabled && (!prev || !prev.enabled || Number(prev.run_day) !== run);
  const start = fresh ? (today.getDate() <= run ? mkey(today) : nextMonthKey(today)) : prev ? prev.start_month : null;
  must(await (await db()).from('site_auto').upsert({ org_id: oid, enabled: !!a.enabled, run_day: run, due_day: due, start_month: start, updated_at: new Date().toISOString() }));
}
/** Sonraki otomatik tahakkuk: { date, due } (kapalıysa null). */
export function nextAuto(a, today = new Date()){
  if (!a || !a.enabled) return null;
  const run = Number(a.run_day) || 1, due = Number(a.due_day) || 10;
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let d = new Date(today.getFullYear(), today.getMonth(), run);
  const doneThis = a.last_month === mkey(today) || (a.start_month && a.start_month > mkey(today));
  if (d < t0 || doneThis) d = new Date(today.getFullYear(), today.getMonth() + 1, run);
  if (a.start_month && mkey(d) < a.start_month) { const [y, m] = a.start_month.split('-').map(Number); d = new Date(y, m - 1, run); }
  const dd = new Date(d.getFullYear(), d.getMonth() + (due < run ? 1 : 0), due);
  return { date: iso(d), due: iso(dd), month: mkey(d) };
}

/* ---- Kartla ödeme (sanal POS; ödeme kuruluşu bağlanınca açılır) ---- */

const r2 = (x) => Math.round(x * 100) / 100;
export const cardReady = () => !!(CONFIG.cardPay && CONFIG.cardPay.provider);
/** Kartla ödenecek toplam: tutar + işlem ücreti (%2,5; %2 ödeme kuruluşu, %0,5 anahtar). */
export function cardTotal(amount){
  const fee = r2((Number(amount) || 0) * CONFIG.cardPay.feeRate);
  return { amount: r2(Number(amount) || 0), fee, total: r2((Number(amount) || 0) + fee) };
}

/** Vade günü: birimin sözleşmesindeki ödeme günü (yoksa vade ay sonu). */
const dueOn = (u, month) => (u && Number(u.due_day) ? month + '-' + String(u.due_day).padStart(2, '0') : null);

/** Toplu tahakkuk: seçilen aya ve türe dağıtılan tutarlar (aynı ay/tür/başlık için daha önce girilmiş birimler atlanır). */
export async function createCharges(oid, { month, kind, title = '', mode, value, units, existing = [], fx = {} }){
  const taken = new Set(existing.filter((x) => x.month === month && x.kind === kind && (x.title || '') === (title || '')).map((x) => x.unit_id));
  const unitBy = Object.fromEntries(units.map((u) => [u.id, u]));
  const rows = distribute(units, mode, value, fx).filter((x) => !taken.has(x.unit_id))
    .map((x) => Object.assign({ org_id: oid, unit_id: x.unit_id, month, kind, title: kind === 'ozel' ? title : '', amount: x.amount,
      due_on: dueOn(unitBy[x.unit_id], month) }, x.currency && x.currency !== 'TRY' ? { currency: x.currency, fx: x.fx, orig_amount: x.orig_amount } : {}));
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
    status: paid >= Number(ch.amount) ? 'paid' : 'partial', paid_amount: paid, paid_on: iso(new Date()), method, reject_reason: null
  }).eq('id', ch.id));
}

export async function addExpense(oid, e){
  // Tür yalnız "ortak" seçilince yazılır (varsayılan işletme gideri; sütun migration yatirimci_raporu ile gelir).
  // Fatura / fiş eki sitenin klasörüne yüklenir (migration site_kasa); ek yoksa alan hiç gönderilmez.
  let receipt = {};
  if (e.file){
    const stored = await storeFile('site-' + oid, e.file);
    const path = stored ? storedPath(stored) : null;
    if (!path) throw new Error(t('Dosya yüklenemedi'));
    receipt = { receipt_path: path, receipt_name: String(e.file.name || 'fatura').slice(0, 200) };
  }
  must(await (await db()).from('site_expenses').insert({ org_id: oid, cat: e.cat, amount: Number(e.amount) || 0, spent_on: e.spent_on || iso(new Date()), note: e.note || '',
    ...(e.kind === 'ortak' ? { kind: 'ortak' } : {}), ...receipt }));
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
/** Yalnız site (ya da AVM/depo) sakini, mülke bağlı kiracı değil: uygulamanın sekmeleri site ekranlarıdır, "Mülküne bağlan" gösterilmez. */
export const siteResidentOnly = () => ui.role === 'tenant' && !S.myHome && mySiteUnits().length > 0;
/** Yalnız siteye bağlı kişinin etiketi: dairedeki rolünden ("Malik · A Blok No 1", birden çok dairede "+1"). */
export function residentRoleLabel(units = mySiteUnits()){
  if (!units.length) return '';
  const u = units[0];
  return (u.role === 'malik' ? t('Malik') : t('Kiracı')) + ' · ' + unitLabel(u) + (units.length > 1 ? ' +' + (units.length - 1) : '');
}
export async function refreshSiteUnits(redraw = true){
  try { live.siteUnits = must(await (await db()).rpc('my_site_units')) || []; } catch(e){ logCaught('Site daireleri okunamadı', e); }
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
    paid_on: date || iso(new Date()), note: note || null,
    receipt_name: file ? file.name || 'dekont' : '', receipt_path: path
  }).eq('id', ch.id));
}

/* ---- Site belgeleri (migration site_belgeleri) ------------------- */

/** Belge yükler. audience: 'herkes' (yönetimden bütün siteye), 'daire' (yönetimden bir daireye), 'yonetim' (sakinden yönetime). */
export async function uploadSiteDoc(oid, { title, file, audience = 'herkes', unitId = null }){
  const stored = await storeFile('site-' + oid, file);
  const path = stored ? storedPath(stored) : null;
  if (!path) throw new Error(t('Dosya yüklenemedi'));
  must(await (await db()).from('site_documents').insert({ org_id: oid, unit_id: audience === 'herkes' ? null : unitId, audience,
    title: String(title || file.name || '').trim().slice(0, 160), name: file.name || '', path, uploaded_by: live.user?.id }));
}
export async function deleteSiteDoc(id){ must(await (await db()).from('site_documents').delete().eq('id', id)); }
/** Görebildiği belgeler (RLS süzer), yeniden eskiye. */
export async function loadSiteDocs(oids){
  if (!oids.length) return [];
  const r = await (await db()).from('site_documents').select('*').in('org_id', oids);
  return (r.error ? [] : r.data || []).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

/* ---- Site projeleri (migration site_projeleri) -------------------
   Proje açılır, aşama aşama ilerler (teklif → yapım → tamamlandı); her aşamada fotoğraf ve sakinlere bildirim. */

/** Proje aşamaları (sırası ilerleme sırasıdır; "askıda" yan durum). Aşama yalnız güncelleme kaydıyla ilerler (sunucu kuralı).
    Oylama isteğe bağlıdır: Oylamada → Onaylandı / Reddedildi (migration site_proje_oylama_maliyet). */
export const PROJECT_STATUS = () => [
  { key: 'acildi', label: t('Proje açıldı') },
  { key: 'oylama', label: t('Oylamada') },
  { key: 'onay', label: t('Sakinler onayladı') },
  { key: 'red', label: t('Sakinler reddetti') },
  { key: 'teklif', label: t('Teklif alındı') },
  { key: 'yapim', label: t('Yapıma başlandı') },
  { key: 'tamam', label: t('Tamamlandı') },
  { key: 'askida', label: t('Askıda') }
];
/** Ana aşamalar (adım çizgisi). Oylamaya sunulmuş projede oylama adımları da görünür (projectSteps). */
export const PROJECT_STAGES = ['acildi', 'teklif', 'yapim', 'tamam'];
export const projectSteps = (p) => (p && p.poll_id ? ['acildi', 'oylama', 'onay', 'teklif', 'yapim', 'tamam'] : PROJECT_STAGES);
/** Adım çizgisindeki yeri: oylamada olan "oylama"da, reddedilen de orada durur; askıdaki yapımda. */
export const projectStepAt = (p) => projectSteps(p).indexOf(p.status === 'askida' ? 'yapim' : p.status === 'red' ? 'oylama' : p.status);
export const projectStatusLabel = (k) => (PROJECT_STATUS().find((s) => s.key === k) || PROJECT_STATUS()[0]).label;
/** Sonraki aşama (askıdaki proje yapıma döner; oylama süren ya da reddedilen proje ilerletilmez; tamamlanmışın sonrası yok). */
export function nextStage(k){
  if (k === 'tamam' || k === 'oylama' || k === 'red') return null;
  if (k === 'askida') return 'yapim';
  if (k === 'onay') return 'teklif';
  const i = PROJECT_STAGES.indexOf(k);
  return PROJECT_STAGES[Math.max(0, i) + 1] || null;
}
/** Bütçenin harcanan kısmı (yüzde, 0–100+; bütçe yoksa null). */
export const projectSpentPct = (p) => (Number(p?.budget) > 0 && p?.spent != null ? Math.round((Number(p.spent) / Number(p.budget)) * 100) : null);

/** Oylamaya sunulan projenin yoklama sorusu bu metinle başlar (genel yoklama listelerinde ayrı gösterilmez). */
export const PROJECT_POLL_PREFIX = 'Proje yapılsın mı: ';
export const isProjectPoll = (q) => String(q?.question || '').startsWith(PROJECT_POLL_PREFIX);

/** Sitelerin projeleri, güncellemeleri, teklif/faturaları ve oylamaları (RLS süzer). Süresi dolan oylamaların sonucu önce uygulanır.
    Tablo henüz yoksa (migration öncesi) boş döner. polls: yoklama kimliği → { poll, results }; votes: kendi oylarım. */
export async function loadProjects(oids){
  if (!oids.length) return { projects: [], updates: [], costs: [], polls: {}, votes: [] };
  const c = await db();
  await Promise.all(oids.map((oid) => Promise.resolve(c.rpc('site_project_vote_sync', { oid })).then(() => null, () => null)));
  const [projects, updates, costs] = await Promise.all([
    c.from('site_projects').select('*').in('org_id', oids),
    c.from('site_project_updates').select('*').in('org_id', oids),
    c.from('site_project_costs').select('*').in('org_id', oids)
  ].map((p) => p.then((r) => (r.error ? [] : r.data || []))));
  const pollIds = projects.map((p) => p.poll_id).filter(Boolean);
  const polls = {};
  let votes = [];
  if (pollIds.length){
    const [pl, vs] = await Promise.all([c.from('site_polls').select('*').in('id', pollIds), c.from('site_votes').select('*').in('poll_id', pollIds)]
      .map((p) => p.then((r) => (r.error ? [] : r.data || []))));
    await Promise.all(pl.map(async (x) => { const r = await c.rpc('site_poll_results', { pid: x.id }); polls[x.id] = { poll: x, results: r.error ? null : r.data }; }));
    votes = vs.filter((v) => v.user_id === live.user?.id);
  }
  // Sürenler önce (askıda ve tamamlananlar sonda), sonra en son güncellenen.
  const rank = (p) => (p.status === 'tamam' ? 2 : p.status === 'askida' ? 1 : 0);
  return {
    projects: projects.sort((a, b) => rank(a) - rank(b) || String(b.updated_at).localeCompare(String(a.updated_at))),
    updates: updates.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    costs: costs.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
    polls, votes
  };
}

/** Projeyi oylamaya sunar: days gün, pct kabul eşiği (50–100, tüm arsa payına göre), voters: 'malik' | 'herkes'. */
export async function openProjectVote(pid, { days = 5, pct = 50, voters = 'malik' } = {}){
  must(await (await db()).rpc('site_project_vote_open', { pid, days, pct, voters }));
}
/** Oylamayı süresi dolmadan bitirir ve sonucu uygular. */
export async function closeProjectVote(pid){ must(await (await db()).rpc('site_project_vote_close', { pid })); }

/** Dosyayı (fatura ya da teklif belgesi: PDF ya da görsel) sitenin klasörüne yükler; depodaki yolu döner. */
async function storeDoc(oid, f){
  const stored = await storeFile('site-' + oid, f);
  const path = stored ? storedPath(stored) : null;
  if (!path) throw new Error(t('Dosya yüklenemedi'));
  return path;
}
/** Teklif (kind 'teklif'; chosen: seçilen) ya da fatura (kind 'fatura') ekler. Fatura gider defterine de yazılır ve harcananı günceller. */
export async function addProjectCost(oid, projectId, { kind, vendor, amount, spent_on = '', note = '', file = /** @type {any} */ (null), chosen = false }){
  const path = file ? await storeDoc(oid, file) : null;
  must(await (await db()).from('site_project_costs').insert({
    project_id: projectId, org_id: oid, kind, vendor: String(vendor || '').trim(), amount: Number(String(amount).replace(',', '.')),
    ...(kind === 'fatura' && spent_on ? { spent_on } : {}), note: String(note || '').trim(), file: path, file_name: file?.name || '',
    chosen: kind === 'teklif' && !!chosen, created_by: live.user?.id
  }));
}
export async function chooseProjectQuote(id){ must(await (await db()).from('site_project_costs').update({ chosen: true }).eq('id', id)); }
export async function deleteProjectCost(id){ must(await (await db()).from('site_project_costs').delete().eq('id', id)); }

/** Depo yolu video mu? (talep ve yazışma ekleri: mp4, m4v, mov, webm) */
export const isVideoPath = (p) => /\.(mp4|m4v|mov|webm)$/i.test(String(p || ''));

/** Talep eki olarak fotoğraf ve videoları sitenin klasörüne yükler (en çok 6); depodaki yolları döner. */
export async function storeMedia(oid, files = []){
  const out = [];
  for (const f of files.slice(0, 6)){
    const stored = await storeFile('site-' + oid, f);
    const path = stored ? storedPath(stored) : null;
    if (!path) throw new Error(t(f.isVideo ? 'Video yüklenemedi' : 'Fotoğraf yüklenemedi'));
    out.push(path);
  }
  return out;
}

/** Fotoğrafları sitenin klasörüne yükler; depodaki yolları döner. */
async function storePhotos(oid, files = []){
  const out = [];
  for (const f of files){
    const stored = await storeFile('site-' + oid, f);
    const path = stored ? storedPath(stored) : null;
    if (!path) throw new Error(t('Fotoğraf yüklenemedi'));
    out.push(path);
  }
  return out;
}

/**
 * Proje ekler ya da düzenler. cover: yeni kapak fotoğrafı (seçildiyse).
 * @param {string} oid @param {any} p @param {any} [cover]
 */
export async function saveProject(oid, p, cover = null){
  const [coverPath] = cover ? await storePhotos(oid, [cover]) : [];
  const num = (v) => (v === '' || v == null ? null : Number(String(v).replace(',', '.')));
  // Aşama burada yazılmaz: yeni proje "Proje açıldı"da başlar, sonra yalnız güncellemeyle ilerler (bildirimli kayıt).
  const row = { org_id: oid, title: String(p.title || '').trim(), body: String(p.body || '').trim(),
    progress: Math.max(0, Math.min(100, Math.round(Number(p.progress) || 0))), budget: num(p.budget), spent: num(p.spent),
    start_on: p.start_on || null, end_on: p.end_on || null, ...(coverPath ? { cover: coverPath } : {}) };
  const c = await db();
  if (p.id) must(await c.from('site_projects').update(row).eq('id', p.id));
  else must(await c.from('site_projects').insert(row));
}
export async function deleteProject(id){ must(await (await db()).from('site_projects').delete().eq('id', id)); }

/**
 * İlerleme güncellemesi: not, yeni durum ve yüzde (verildiyse), fotoğraflar. Sunucu projenin durumunu ve yüzdesini taşır.
 * @param {string} oid @param {string} projectId
 * @param {{ body?: string, status?: string | null, progress?: string | number | null, photos?: any[] }} u
 */
export async function addProjectUpdate(oid, projectId, { body = '', status = null, progress = null, photos = [] }){
  const paths = await storePhotos(oid, photos);
  must(await (await db()).from('site_project_updates').insert({ project_id: projectId, org_id: oid, body: String(body || '').trim(),
    status: status || null, progress: progress === '' || progress == null ? null : Math.max(0, Math.min(100, Math.round(Number(progress)))),
    photos: paths, created_by: live.user?.id }));
}
export async function deleteProjectUpdate(id){ must(await (await db()).from('site_project_updates').delete().eq('id', id)); }

/* ---- Talep yazışması (migration site_talep_yazisma) -------------- */

/** Taleplerin yazışmaları (eskiden yeniye), talep kimliğine göre. Tablo henüz yoksa boş döner. */
export async function loadRequestMessages(requestIds){
  if (!requestIds.length) return {};
  const r = await (await db()).from('site_request_messages').select('*').in('request_id', requestIds);
  const out = {};
  (r.error ? [] : r.data || []).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .forEach((m) => { (out[m.request_id] = out[m.request_id] || []).push(m); });
  return out;
}
/** Talebe mesaj yazar (gönderen ve tarafı sunucu belirler). */
export async function sendRequestMessage(req, body, files = []){
  const media = await storeMedia(req.org_id, files);
  must(await (await db()).from('site_request_messages').insert({ request_id: req.id, org_id: req.org_id, user_id: live.user?.id, body: String(body || '').trim(), media }));
}

/** Talep açar; files: fotoğraf ve video ekleri (en çok 6). */
export async function openSiteRequest(oid, unitId, { cat, title, body, files = [] }){
  const media = await storeMedia(oid, files);
  must(await (await db()).from('site_requests').insert({ org_id: oid, unit_id: unitId || null, user_id: live.user?.id, cat, title: String(title).trim(), body: String(body || '').trim(), media }));
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

/** Dönem raporu. cur ve table verilirse tutarlar o para biriminde, her işlem kendi gününün kuruyla (fx-report.js);
    verilmezse kayıtlı TL. fxDiff: dövizli sözleşmelerde kur farkı; fxMissing: kuru olmayan işlem toplama katılmadı. */
export function siteReport(d, period, ref, cur = 'TRY', table = null){
  const y = Number(String(ref).slice(0, 4)), mo = Number(String(ref).slice(5, 7));
  const m0 = period === 'year' ? y + '-01' : ref.slice(0, 7), m1 = period === 'year' ? y + '-12' : ref.slice(0, 7);
  const d0 = m0 + '-01', d1 = nextMonthStart(m1);
  const inP = (x) => x.month >= m0 && x.month <= m1;
  const kinds = {};
  let fxDiff = 0, fxMissing = false;
  d.charges.filter(inP).forEach((x) => {
    const v = chargeIn(x, cur, table);
    const k = kinds[x.kind] || (kinds[x.kind] = { kind: x.kind, charged: 0, collected: 0 });
    k.charged += v.charged;
    k.collected += v.collected;
    fxDiff += v.diff; fxMissing = fxMissing || v.missing;
  });
  const cats = {};
  d.expenses.filter((e) => e.spent_on >= d0 && e.spent_on < d1).forEach((e) => {
    const v = amountIn(e.amount, e.spent_on, cur, table);
    if (v == null){ fxMissing = true; return; }
    cats[e.cat] = (cats[e.cat] || 0) + v;
  });
  const unitBy = Object.fromEntries(d.units.map((u) => [u.id, u]));
  const now = iso(new Date());
  const debt = {};
  d.charges.filter((x) => x.status !== 'paid' && x.month <= m1).forEach((x) => {
    const due = nextMonthStart(x.month);                         // ay sonundan sonraki gün
    if (due > (d1 < now ? d1 : now)) return;
    debt[x.unit_id] = (debt[x.unit_id] || 0) + (cur === 'TRY' ? unpaidOf(x) : chargeIn(x, cur, table).unpaid);
  });
  const budget = (d.budgets || []).find((b) => Number(b.year) === y) || null;
  return {
    period, from: d0, to: d1, units: d.units.length, month: mo, cur, fxDiff, fxMissing,
    charges: Object.values(kinds),
    expenses: Object.entries(cats).map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total),
    budget: budget ? { ...budget, total: budgetTotal(budget) } : null,
    debtors: Object.entries(debt).filter(([, v]) => v > 0).map(([id, unpaid]) => ({ unit: unitBy[id] ? unitLabel(unitBy[id]) : '—', unpaid }))
      .sort((a, b) => b.unpaid - a.unpaid).slice(0, 20),
    requests: { opened: d.requests.filter((r) => String(r.created_at).slice(0, 10) >= d0 && String(r.created_at).slice(0, 10) < d1).length,
                open: d.requests.filter((r) => r.status < 3).length }
  };
}

/* ---- Ticari portföy: ciro, kira artışı, doluluk (Faz 3) ----------- */

/** Ciroya bağlı kira farkı (TL): cironun %oranı birimin aylık kirasını (TL karşılığı) aşarsa aradaki fark. */
export function ciroDiff(u, turnover, fx = {}){
  const rate = Number(u.turnover_rate) || 0;
  if (!rate) return 0;
  const base = rentCharge({ ...u, vat: false, stopaj: false }, fx).amount;
  return Math.max(0, Math.round((Number(turnover) * rate / 100 - base) * 100) / 100);
}

/** Kiracı (ya da yönetim) aylık ciroyu bildirir; aynı ay için ikinci bildirim düzeltme sayılır. */
export async function reportTurnover(u, month, amount, note = ''){
  must(await (await db()).from('site_turnovers').upsert({ org_id: u.org_id, unit_id: u.unit_id || u.id, month, amount: Number(amount) || 0, note, status: 'reported' },
    { onConflict: 'unit_id,month' }));
}
export async function loadTurnovers(unitId){
  const r = await (await db()).from('site_turnovers').select('*').eq('unit_id', unitId);
  return (r.error ? [] : r.data || []).sort((a, b) => b.month.localeCompare(a.month));
}
/** Yönetim kararı: onayda ciro farkı (varsa) o ayın "ciro" tahakkuku olarak yazılır. */
export async function decideTurnover(tv, ok, { unit = null, fx = {}, reason = '' } = {}){
  const c = await db();
  if (ok){
    const diff = ciroDiff(unit, tv.amount, fx);
    if (diff > 0) must(await c.from('site_charges').insert({ org_id: tv.org_id, unit_id: tv.unit_id, month: tv.month, kind: 'ciro', title: '', amount: diff,
      due_on: dueOn(unit, tv.month) }));
    must(await c.from('site_turnovers').update({ status: 'approved', reject_reason: null }).eq('id', tv.id));
    return diff;
  }
  must(await c.from('site_turnovers').update({ status: 'rejected', reject_reason: String(reason || '').trim() || t('Ciro bilgisi uygun değil') }).eq('id', tv.id));
  return 0;
}

/**
 * Sözleşme yıldönümünde kira artışı önerileri: önümüzdeki 30 gün içinde ya da geçmişte uygulanmamış yıldönümleri.
 * Oran: TÜFE (yıldönümünden önceki ayın 12 aylık ortalaması; rates = { 'YYYY-AA': oran }) ya da sözleşmedeki sabit oran.
 */
export function dueIncreases(units, changes, rates, today = new Date()){
  const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
  const out = [];
  units.forEach((u) => {
    if (!u.lease_start || !(Number(u.rent) > 0) || u.index_kind === 'yok') return;
    const s = new Date(u.lease_start + 'T12:00:00');
    let ann = null;
    for (let y = s.getFullYear() + 1; ; y++){
      const d = new Date(y, s.getMonth(), s.getDate(), 12);
      if (d > horizon || (u.lease_end && iso(d) > u.lease_end)) break;
      ann = d;
    }
    if (!ann) return;
    const date = iso(ann);
    if (changes.some((x) => x.unit_id === u.id && x.from_date >= date)) return;
    const prev = new Date(ann.getFullYear(), ann.getMonth() - 1, 1);
    const key = prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0');
    const rate = u.index_kind === 'sabit' ? Number(u.index_rate) || 0 : rates && rates[key] != null ? Number(rates[key]) : null;
    out.push({ unit: u, date, rate, source: u.index_kind === 'sabit' ? 'sabit' : key,
      next: rate == null ? null : Math.round(Number(u.rent) * (1 + rate / 100) * 100) / 100 });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
export async function applyIncrease(oid, inc, amount, reason){
  const c = await db();
  const u = inc.unit;
  must(await c.from('site_rent_changes').insert({ org_id: oid, unit_id: u.id, from_date: inc.date, old_amount: Number(u.rent), new_amount: Number(amount),
    currency: u.currency || 'TRY', reason: reason || '' }));
  must(await c.from('site_units').update({ rent: Number(amount) }).eq('id', u.id));
}

/** Kiracısı olan birim: kiracı kaydı (ya da ev sahibi üzerinden bağlı kiracı) var ve sözleşmesi bitmemiş. */
export function occupancy(d, today = new Date()){
  const day = iso(today);
  const soon = iso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 90));
  const tenantOf = (u) => d.residents.some((r) => r.unit_id === u.id && r.role === 'kiraci') || (d.linked || []).some((x) => x.unit_id === u.id);
  const full = (u) => tenantOf(u) && (!u.lease_end || u.lease_end >= day);
  const units = d.units, occ = units.filter(full);
  const area = units.reduce((a, u) => a + (Number(u.area) || 0), 0), occArea = occ.reduce((a, u) => a + (Number(u.area) || 0), 0);
  // WALT: kira ağırlıklı kalan sözleşme süresi (yıl).
  const leased = occ.filter((u) => u.lease_end && Number(u.rent) > 0);
  const w = leased.reduce((a, u) => a + Number(u.rent), 0);
  const walt = w ? leased.reduce((a, u) => a + Number(u.rent) * Math.max(0, (Date.parse(u.lease_end) - today.getTime()) / (365.25 * 864e5)), 0) / w : null;
  return {
    total: units.length, occupied: occ.length, area, occArea,
    rate: units.length ? occ.length / units.length : 0, areaRate: area ? occArea / area : null,
    vacant: units.filter((u) => !full(u)),
    expiring: occ.filter((u) => u.lease_end && u.lease_end <= soon).sort((a, b) => a.lease_end.localeCompare(b.lease_end)),
    walt
  };
}

/* ---- Kurulum sihirbazı ------------------------------------------- */

/**
 * Sözleşmedeki birim sayısına göre birim listesi üretir (kaydetmeden önce önizleme için).
 * groups: [{ name, floors, perFloor, custom }] — sitede blok, AVM'de kat, depoda bölge, GYO'da varlık.
 *   custom: katlardaki birim sayıları sırayla ("4,4,4,2"); verilirse kat × kattaki yerine bu kullanılır (katlar eşit değilse).
 * numbering: 'seq' (1, 2, 3… grup içinde) | 'floor' (kat + sıra: 101, 102, 201…) | 'block' (A-1, A-2…).
 * Dönen satırlar importUnits'e verilir.
 */
/** villas: { count, naming: 'villa' (Villa 1, Villa 2…) | 'v' (V-1, V-2…) } — blok yerine (ya da bloklara ek) müstakil villalar. */
/** @param {{ groups?: any[], numbering?: string, area?: number | null, aidat?: number | null, commercial?: boolean, villas?: { count?: any, naming?: string } | null }} o */
export function unitPlan(o){
  const { groups = [], numbering = 'seq', area = null, aidat = null, commercial = false, villas = null } = o;
  const rows = [];
  const int = (v) => Math.max(0, parseInt(String(v || '').replace(/\D/g, ''), 10) || 0);
  groups.forEach((g) => {
    const name = String(g.name || '').trim();
    let floors = String(g.custom || '').split(/[,;\s]+/).map(int).filter((n) => n > 0);
    if (!floors.length) floors = Array.from({ length: int(g.floors) }, () => int(g.perFloor));
    let seq = 0;
    floors.forEach((count, f) => {
      for (let k = 1; k <= count; k++){
        seq++;
        const no = numbering === 'floor' ? String((f + 1) * 100 + k) : numbering === 'block' && name ? name + '-' + seq : String(seq);
        rows.push(Object.assign({ block: name, no, area: Number(area) > 0 ? Number(area) : null },
          commercial ? { rent: null, currency: 'TRY' } : { share: null, aidat: aidat === '' || aidat == null ? null : Number(aidat) }));
      }
    });
  });
  const vc = villas ? int(villas.count) : 0;
  for (let k = 1; k <= vc; k++){
    rows.push({ block: '', no: villas && villas.naming === 'v' ? 'V-' + k : t('Villa') + ' ' + k, area: Number(area) > 0 ? Number(area) : null,
      share: null, aidat: aidat === '' || aidat == null ? null : Number(aidat) });
  }
  return rows;
}
