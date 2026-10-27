/* Sunucu satırları ↔ uygulama verisi eşlemesi ve fark hesabı.
   Saf modül: DOM'a, duruma ya da ağa dokunmaz; tarayıcısız test edilir.

   Uygulama bir evi tek nesne olarak tutar (bkz. state.js). Sunucuda aynı veri
   normalleştirilmiş tablolara dağılır. Kaydederken önceki ve sonraki hal
   karşılaştırılır; yalnızca değişen satırlar yazılır. */

const num = v => v == null || v === '' ? null : Number(v);
const ms = v => v == null ? null : (typeof v === 'number' ? v : Date.parse(v));
const isoTs = v => v == null ? null : new Date(v).toISOString();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Depodaki dosyalar uygulamada "sb:<yol>" olarak tutulur. */
export const SB = 'sb:';
export const isStored = v => typeof v === 'string' && v.startsWith(SB);
export const storedPath = v => isStored(v) ? v.slice(SB.length) : null;

/* ------------------------------------------------------------------ */
/* Satırlar → uygulama                                                 */
/* ------------------------------------------------------------------ */

/**
 * @param {object} d  bir evin tüm satırları
 * @param {object} d.prop, d.shared, d.members[], d.profiles{id→profile}, d.invites[],
 *                 d.payments[], d.history[], d.requests[], d.messages[], d.documents[], d.expenses[]
 */
export function buildProperty(d){
  const pr = d.prop, sh = d.shared || {};
  const profiles = d.profiles || {};
  const nameOf = m => m.display_name || profiles[m.user_id]?.name || 'Kiracı';

  const ownerMember = (d.members || []).find(m => m.user_id === pr.owner_id);
  const ownerProfile = profiles[pr.owner_id] || {};

  const tenants = (d.members || []).filter(m => m.role === 'tenant').map(m => ({
    id: m.user_id, name: nameOf(m), phone: m.phone || profiles[m.user_id]?.phone || '', email: m.email || ''
  }));
  (d.invites || []).filter(i => !i.accepted_by).forEach(i => tenants.push({
    id: 'inv:' + i.code, name: i.name || 'Davet bekleniyor', phone: i.phone || '', email: i.email || '',
    pending: true, code: i.code
  }));

  const pay = {};
  (d.payments || []).forEach(r => {
    pay[r.month] = clean({
      status: r.status, date: r.paid_on || null, amount: num(r.amount), receipt: r.receipt_name || '',
      photo: r.receipt_path ? SB + r.receipt_path : undefined,
      note: r.note || undefined, rejectReason: r.reject_reason || undefined,
      approvedAt: r.approved_at ? ms(r.approved_at) : undefined
    });
  });

  return {
    id: pr.id,
    ownerId: pr.owner_id,
    name: pr.name, addr: pr.addr || '',
    type: pr.prop_type || 'Konut', area: num(pr.area),
    company: pr.company || null, stopaj: !!pr.stopaj, depositKind: pr.deposit_kind || 'Nakit',
    landlord: { name: (ownerMember && nameOf(ownerMember)) || ownerProfile.name || 'Mülk sahibi', phone: ownerMember?.phone || ownerProfile.phone || '' },
    tenants,
    rent: num(pr.rent), dueDay: pr.due_day,
    aidat: num(pr.aidat) || 0, aidatPayer: owner(pr.aidat_payer) || 'Kiracı',
    deposit: num(pr.deposit) || 0, depositNote: pr.deposit_note || '',
    startDate: pr.start_date, contractEnd: pr.contract_end, dask: pr.dask || null,
    value: num(pr.value),
    bills: (pr.bills || []).map(b => Object.assign({}, b, { who: owner(b.who) })),
    pay,
    rentHistory: (d.history || []).map(h => ({ from: h.from_date, amount: num(h.amount), note: h.note || '' }))
      .sort((a, b) => a.from < b.from ? -1 : 1),
    requests: (d.requests || []).map(r => ({
      id: r.id, cat: r.cat, title: r.title, desc: r.descr || '', urgency: r.urgency, status: r.status,
      cost: owner(r.cost), costOk: !!r.cost_ok, decision: r.decision || null, date: r.req_date,
      photos: r.photos || 0, shots: r.shots || [], log: r.log || [], quotes: r.quotes || [], invoice: r.invoice || null
    })).sort((a, b) => a.date === b.date ? (a.id < b.id ? 1 : -1) : (a.date < b.date ? 1 : -1)),
    msgs: (d.messages || []).map(m => clean({
      id: m.id, from: m.from_role, by: m.by_user || undefined, text: m.body, at: ms(m.at)
    })).sort((a, b) => a.at - b.at),
    docs: (d.documents || []).map(x => clean({
      id: x.id, cat: x.cat, name: x.name, at: x.uploaded_on, until: x.until || undefined, path: x.path || undefined
    })),
    expenses: (d.expenses || []).map(e => clean({
      id: e.id, cat: e.cat, amount: num(e.amount), date: e.spent_on, note: e.note || '', reqId: e.req_id || undefined
    })),
    inspect: sh.inspect || { tenantOk:false, landlordOk:false, rooms:[] },
    moveOut: sh.move_out || null,
    renewal: sh.renewal || null
  };
}

/** Eski kayıtlardaki "Ev sahibi" değeri (v3 öncesi) yeni adıyla okunur. */
function owner(v){ return v === 'Ev sahibi' ? 'Mülk sahibi' : v; }

function clean(o){
  Object.keys(o).forEach(k => o[k] === undefined && delete o[k]);
  return o;
}

/* ------------------------------------------------------------------ */
/* Uygulama → satırlar                                                 */
/* ------------------------------------------------------------------ */

export function propertyRow(p, ownerId){
  return {
    id: p.id, owner_id: ownerId || p.ownerId, name: p.name, addr: p.addr || '',
    prop_type: p.type || 'Konut', area: p.area ?? null, company: p.company || null,
    stopaj: !!p.stopaj, deposit_kind: p.depositKind || 'Nakit',
    rent: p.rent, due_day: p.dueDay, aidat: p.aidat || 0, aidat_payer: p.aidatPayer || 'Kiracı',
    deposit: p.deposit || 0, deposit_note: p.depositNote || '',
    start_date: p.startDate, contract_end: p.contractEnd, dask: p.dask || null,
    value: p.value ?? null, bills: p.bills || []
  };
}

export function sharedRow(p){
  return { property_id: p.id, inspect: p.inspect, move_out: p.moveOut || null, renewal: p.renewal || null };
}

export function paymentRow(pid, month, r){
  return {
    property_id: pid, month, status: r.status, amount: Number(r.amount) || 0,
    paid_on: r.date || null, receipt_name: r.receipt || '', receipt_path: storedPath(r.photo),
    note: r.note || null, reject_reason: r.rejectReason || null,
    approved_at: r.approvedAt ? isoTs(r.approvedAt) : null
  };
}

export function historyRow(pid, h){
  return { id: pid + ':' + h.from, property_id: pid, from_date: h.from, amount: h.amount, note: h.note || '' };
}

export function requestRow(pid, r){
  return {
    id: r.id, property_id: pid, cat: r.cat, title: r.title, descr: r.desc || '', urgency: r.urgency || 'Normal',
    status: r.status, cost: r.cost, cost_ok: !!r.costOk, decision: r.decision || null, req_date: r.date,
    photos: r.photos || 0, shots: r.shots || [], log: r.log || [], quotes: r.quotes || [], invoice: r.invoice || null
  };
}

export function messageRow(pid, m, meId){
  return { id: m.id, property_id: pid, from_role: m.from, by_user: meId, body: m.text, at: isoTs(m.at) };
}

export function documentRow(pid, d){
  return { id: d.id, property_id: pid, cat: d.cat, name: d.name, path: d.path || null, uploaded_on: d.at, until: d.until || null };
}

export function expenseRow(pid, e){
  return { id: e.id, property_id: pid, cat: e.cat, amount: Number(e.amount) || 0, spent_on: e.date, note: e.note || '', req_id: e.reqId || null };
}

/* ------------------------------------------------------------------ */
/* Fark                                                                */
/* ------------------------------------------------------------------ */

const EMPTY = { pay:{}, requests:[], msgs:[], docs:[], expenses:[], rentHistory:[], inspect:null, moveOut:null, renewal:null };

/**
 * Bir evin önceki ve sonraki halinden yazma işlemlerini çıkarır.
 * Rolün izin vermediği alanlar hiç gönderilmez (sunucu da ayrıca reddeder).
 *
 * @returns {{table:string, kind:'insert'|'upsert'|'update'|'delete', rows?:object[], values?:object, match?:object, onConflict?:string}[]}
 */
export function diffProperty(before, after, ctx){
  const { role, meId } = ctx;
  const owner = role === 'landlord';
  const ops = [];

  if (!after){
    if (before && owner) ops.push({ table:'properties', kind:'delete', match:{ id: before.id } });
    return ops;
  }
  const pid = after.id;
  const created = !before;
  const b = before || Object.assign({ id: pid }, EMPTY);

  // Ev bilgileri: yalnızca sahibi.
  if (owner){
    const next = propertyRow(after, created ? meId : undefined);
    if (created) ops.push({ table:'properties', kind:'insert', rows:[next] });
    else if (!same(propertyRow(b), next)) ops.push({ table:'properties', kind:'update', values:omit(next, ['id','owner_id']), match:{ id: pid } });
  }

  // Ortak alanlar: tutanak, çıkış, yenileme.
  {
    const next = sharedRow(after);
    // Kiracı yenilemeyi yalnızca "gönderildi → kabul" geçişiyle değiştirebilir;
    // başka bir değişiklik (ör. süresi dolan sözleşmenin yerelde temizlenmesi) gönderilmez.
    if (!owner){
      const accepted = b.renewal && b.renewal.status === 'sent' && after.renewal && after.renewal.status === 'accepted';
      if (!accepted) next.renewal = b.renewal || null;
    }
    const prev = sharedRow(b);
    if (created || !same(prev, next)){
      ops.push({ table:'property_shared', kind:'update', values:omit(next, ['property_id']), match:{ property_id: pid } });
    }
  }

  // Ödemeler (ay anahtarlı).
  const payRows = Object.keys(after.pay || {})
    .filter(k => !same(b.pay && b.pay[k] && paymentRow(pid, k, b.pay[k]), paymentRow(pid, k, after.pay[k])))
    .map(k => paymentRow(pid, k, after.pay[k]));
  if (payRows.length) ops.push({ table:'payments', kind:'upsert', rows:payRows, onConflict:'property_id,month' });

  // Kira tutarı geçmişi: yalnızca sahibi (kabul edilen yenileme sunucuda yazılır).
  if (owner) collection(ops, 'rent_history', b.rentHistory, after.rentHistory, h => h.from, h => historyRow(pid, h), true);

  // Talepler.
  collection(ops, 'requests', b.requests, after.requests, r => r.id, r => requestRow(pid, r), false);

  // Mesajlar: yalnızca yeni olanlar eklenir, düzenleme yok.
  const known = new Set((b.msgs || []).map(m => m.id));
  const newMsgs = (after.msgs || []).filter(m => m.id && !known.has(m.id) && (m.from === role || m.from === 'system'));
  if (newMsgs.length) ops.push({ table:'messages', kind:'insert', rows:newMsgs.map(m => messageRow(pid, m, meId)) });

  // Belgeler.
  collection(ops, 'documents', b.docs, after.docs, d => d.id, d => documentRow(pid, d), true);

  // Giderler: yalnızca sahibi.
  if (owner) collection(ops, 'expenses', b.expenses, after.expenses, e => e.id, e => expenseRow(pid, e), true);

  return ops;
}

/** Kimlikli liste: değişenleri upsert, silinenleri (izin varsa) delete. */
function collection(ops, table, before = [], after = [], key, toRow, allowDelete){
  const prev = new Map((before || []).map(x => [key(x), toRow(x)]));
  const rows = [];
  (after || []).forEach(x => {
    const row = toRow(x);
    if (!same(prev.get(key(x)), row)) rows.push(row);
    prev.delete(key(x));
  });
  if (rows.length) ops.push({ table, kind:'upsert', rows, onConflict:'id' });
  if (allowDelete && prev.size){
    ops.push({ table, kind:'delete', match:{ id: [...prev.values()].map(r => r.id) } });
  }
}

function omit(o, keys){
  const c = Object.assign({}, o);
  keys.forEach(k => delete c[k]);
  return c;
}

/** Bir evdeki henüz yüklenmemiş görseller (data: URL) — yüklenip "sb:" yoluna çevrilir. */
export function pendingMedia(p){
  const out = [];
  const visit = (obj, key) => { if (typeof obj[key] === 'string' && obj[key].startsWith('data:')) out.push({ obj, key }); };
  Object.values(p.pay || {}).forEach(r => visit(r, 'photo'));
  (p.requests || []).forEach(r => (r.shots || []).forEach((_, i) => visit(r.shots, i)));
  (p.inspect?.rooms || []).forEach(r => (r.shots || []).forEach((_, i) => visit(r.shots, i)));
  (p.moveOut?.rooms || []).forEach(r => (r.shots || []).forEach((_, i) => visit(r.shots, i)));
  return out;
}

/** Bir evdeki tüm depo yolları (imzalı bağlantı almak için). */
export function storedPaths(p){
  const out = new Set();
  const add = v => { const s = storedPath(v); if (s) out.add(s); };
  Object.values(p.pay || {}).forEach(r => add(r.photo));
  (p.requests || []).forEach(r => (r.shots || []).forEach(add));
  (p.inspect?.rooms || []).forEach(r => (r.shots || []).forEach(add));
  (p.moveOut?.rooms || []).forEach(r => (r.shots || []).forEach(add));
  return [...out];
}
