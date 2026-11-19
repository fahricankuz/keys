// Bireysel mülk sahibi için banka ekstresinden kira tahsilatı: mülkler ve kira ayları, kurumdaki eşleştirmenin (ekstre.js → matchTxns)
// beklediği biçime çevrilir. Sunucu tarafı: migration ekstre_kira (rent_bank_apply, rent_bank_txns).
// Beklenen tutar uygulamada hesaplanır (kira artışı, stopaj: logic.dueOf); aidat yalnız kiracı ödüyorsa eklenir.
import { client } from './backend.js';
import { aidatByTenant, dueOf, payMap, statusFor } from './logic.js';
import { addM, mkey, parse, t0 } from './util.js';

const STATUS = { approved: 'approved', partial: 'partial', review: 'review', rejected: 'rejected' };

/** Mülklerin son 12 ayı ve gelecek ay (peşin ödeme), kira + kiracının ödediği aidat. */
export function rentSource(props, today = t0()) {
  const units = [], residents = [], charges = [];
  const last = mkey(addM(new Date(today.getFullYear(), today.getMonth(), 1), 1));
  for (const p of props) {
    if (!p) continue;
    units.push({ id: p.id, pay_code: p.payCode || '', name: p.name });
    (p.tenants || []).filter((x) => !x.pending && x.name).forEach((x) => residents.push({ unit_id: p.id, name: x.name }));
    const startKey = p.startDate ? mkey(parse(p.startDate)) : '';
    const kinds = ['kira', ...(aidatByTenant(p) ? ['aidat'] : [])];
    for (let i = 12; i >= -1; i--) {
      const key = mkey(addM(new Date(today.getFullYear(), today.getMonth(), 1), -i));
      if ((startKey && key < startKey) || key > last) continue;
      for (const kind of kinds) {
        const amount = Number(dueOf(p, kind, key)) || 0;
        if (!(amount > 0)) continue;
        const rec = payMap(p, kind)[key];
        const st = STATUS[statusFor(p, kind, key)] || 'open';
        charges.push({ id: p.id + '|' + kind + '|' + key, unit_id: p.id, month: key, kind, title: '', amount, status: st,
          paid_amount: rec ? Number(rec.amount) || 0 : 0, paid_on: rec?.date || null });
      }
    }
  }
  return { units, residents, charges };
}

/** Daha önce işlenmiş hareketlerin parmak izleri (yalnız kendi kayıtları; RLS). */
export async function seenRentTxns(fps) {
  const c = await client(), seen = new Set();
  for (let i = 0; i < fps.length; i += 200) {
    const { data, error } = await c.from('rent_bank_txns').select('fp').in('fp', fps.slice(i, i + 200));
    if (error) throw error;
    (data || []).forEach((r) => seen.add(r.fp));
  }
  return seen;
}

/** Eşleşen ödemeyi işler; ay tamamlanıyorsa onaylı, değilse kısmi. Aynı hareket daha önce işlendiyse false. */
export async function applyRentTxn(m, bank) {
  const parts = m.parts.map((x) => {
    const [pid, kind, month] = x.charge.id.split('|');
    const base = x.charge.status === 'partial' ? Number(x.charge.paid_amount) || 0 : 0;
    return { pid, kind, month, amount: x.amount, complete: base + x.amount >= Number(x.charge.amount) - 0.005 };
  });
  const c = await client();
  const { data, error } = await c.rpc('rent_bank_apply', { pid: parts[0].pid, fp: m.txn.fp, txn_date: m.txn.date, amount: m.txn.amount, bank: bank || '',
    kinds: parts.map((x) => x.kind), months: parts.map((x) => x.month), amounts: parts.map((x) => x.amount), complete: parts.map((x) => x.complete) });
  if (error) throw error;
  return data;
}
