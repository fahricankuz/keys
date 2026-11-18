// Banka ekstresinden tahsilat eşleştirmesi (ekransız mantık). Akış: tablo satırları → başlık ve sütunlar → gelen ödemeler →
// açık tahakkuklarla eşleşme. Sunucu tarafı: migration ekstre_eslestirme (site_bank_apply, site_bank_txns).
// Eşleşme anahtarları (güven sırasıyla): 1) dairenin açıklama kodu (site_units.pay_code) açıklamada geçiyor;
// 2) daire sakininin adı ve soyadı açıklamada geçiyor (yalnız öneri). Hiçbir ödeme yönetici onayı olmadan işlenmez.

/** Türkçe harfleri sadeleştirir, büyük harfe çevirir: "Gül Bloğu" → "GUL BLOGU". */
export function fold(s) {
  return String(s || '').replace(/[İIıi]/g, 'I').toUpperCase()
    .replace(/[ŞşĞğÜüÖöÇç]/g, (c) => ({ Ş: 'S', ş: 'S', Ğ: 'G', ğ: 'G', Ü: 'U', ü: 'U', Ö: 'O', ö: 'O', Ç: 'C', ç: 'C' }[c]))
    .replace(/[ÂâÎîÛû]/g, (c) => ({ Â: 'A', â: 'A', Î: 'I', î: 'I', Û: 'U', û: 'U' }[c]));
}
const compact = (s) => fold(s).replace(/[^A-Z0-9]/g, '');
const words = (s) => fold(s).split(/[^A-Z0-9]+/).filter(Boolean);

/** Başlık eş anlamlıları (sadeleştirilmiş, boşluksuz). Yeni banka biçimi geldikçe buraya eklenir. */
const ALIASES = {
  date: ['TARIH', 'ISLEMTARIHI', 'VALORTARIHI', 'TARIHSAAT', 'ISLEMTARIHIVESAATI'],
  desc: ['ACIKLAMA', 'ISLEMACIKLAMASI', 'ACIKLAMALAR', 'HAREKETACIKLAMASI'],
  amount: ['TUTAR', 'ISLEMTUTARI', 'MIKTAR', 'TUTARTL'],
  credit: ['ALACAK', 'GELEN', 'ALACAKTUTARI'],
  debit: ['BORC', 'GIDEN', 'BORCTUTARI'],
  ref: ['DEKONTNO', 'REFERANS', 'REFERANSNO', 'FISNO', 'ISLEMNO']
};

/** Başlık satırını bulur: tarih + açıklama + (tutar ya da alacak) sütunları olan ilk satır. Yoksa null. */
export function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const map = {};
    (rows[i] || []).forEach((h, c) => {
      const k = compact(h);
      for (const [key, list] of Object.entries(ALIASES)) if (map[key] === undefined && list.includes(k)) map[key] = c;
    });
    if (map.date !== undefined && map.desc !== undefined && (map.amount !== undefined || map.credit !== undefined)) return { row: i, map };
  }
  return null;
}

/** Bankanın adı (üst satırlardan); bilinmiyorsa ''. */
export function bankOf(rows) {
  const top = compact(rows.slice(0, 10).map((r) => (r || []).join(' ')).join(' '));
  if (top.includes('GARANTI')) return 'Garanti BBVA';
  if (top.includes('ISBANK') || top.includes('TURKIYEISBANKASI')) return 'İş Bankası';
  if (top.includes('YAPIKREDI')) return 'Yapı Kredi';
  if (top.includes('AKBANK')) return 'Akbank';
  if (top.includes('ZIRAAT')) return 'Ziraat Bankası';
  if (top.includes('HALKBANK')) return 'Halkbank';
  if (top.includes('VAKIF')) return 'VakıfBank';
  if (top.includes('QNB') || top.includes('FINANSBANK')) return 'QNB';
  if (top.includes('DENIZBANK')) return 'DenizBank';
  if (top.includes('ENPARA')) return 'Enpara';
  return '';
}

/** "1.980,00", "1980.5", "-1443.06", "1.980,00 TL" → sayı; okunamazsa NaN. */
export function amountOf(v) {
  let s = String(v ?? '').replace(/\s|TL|TRY|₺/gi, '');
  if (!s) return NaN;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const pad = (n) => String(n).padStart(2, '0');
/** "15/11/2026", "15.11.2026 10:51", "2026-11-15" ya da Excel seri numarası → "2026-11-15"; okunamazsa null. */
export function dateOf(v) {
  const s = String(v ?? '').trim();
  let m;
  if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/.exec(s))) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if (/^\d{5}(\.\d+)?$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + 86400000 * Math.floor(Number(s))); return d.toISOString().slice(0, 10); }
  return null;
}

/** Parmak izi: tarih, tutar, açıklama ve dekont no'dan 16 haneli onaltılık özet (iki FNV-1a). Açıklama sunucuya gitmez. */
export function fingerprint(t) {
  const s = [t.date, Number(t.amount).toFixed(2), compact(t.desc), String(t.ref || '').trim()].join('|');
  const h = (seed) => { let x = seed >>> 0; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; } return x.toString(16).padStart(8, '0'); };
  return h(2166136261) + h(0x811c9dc5 ^ 0x5bd1e995);
}

/** Gelen ödemeler (artı tutar ya da alacak sütunu). Aynı dosyada aynı satır iki kez varsa ikincisine sıra eklenir. */
export function incoming(rows, header) {
  const { row, map } = header, out = [], seen = {};
  for (let i = row + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const date = dateOf(r[map.date]);
    if (!date) continue;
    let amount = map.credit !== undefined ? amountOf(r[map.credit]) : amountOf(r[map.amount]);
    if (map.credit !== undefined && !(amount > 0) && map.amount !== undefined) amount = amountOf(r[map.amount]);
    if (!(amount > 0)) continue;
    const t = { date, amount: Math.round(amount * 100) / 100, desc: String(r[map.desc] || '').trim(), ref: map.ref !== undefined ? String(r[map.ref] || '').trim() : '' };
    const base = fingerprint(t);
    const n = (seen[base] = (seen[base] || 0) + 1);
    out.push({ ...t, line: i + 1, fp: n === 1 ? base : fingerprint({ ...t, ref: t.ref + '#' + n }) });
  }
  return out;
}

const OPEN = ['open', 'partial', 'rejected', 'review'];
const unpaid = (c) => Math.max(0, Number(c.amount) - (c.status === 'partial' ? Number(c.paid_amount) || 0 : 0));

/** Tutarı dairenin en eski açık tahakkuklarından başlayarak dağıtır. exact: tutar tam olarak k tahakkuku kapatıyor. */
function allocate(amount, charges, left) {
  const list = charges.filter((c) => (left.get(c.id) ?? unpaid(c)) > 0.005).sort((a, b) => String(a.month).localeCompare(String(b.month)) || String(a.kind).localeCompare(String(b.kind)));
  const parts = []; let rest = amount;
  for (const c of list) {
    if (rest <= 0.005) break;
    const due = left.get(c.id) ?? unpaid(c), pay = Math.min(due, rest);
    parts.push({ charge: c, amount: Math.round(pay * 100) / 100 });
    rest = Math.round((rest - pay) * 100) / 100;
  }
  const exact = parts.length > 0 && rest <= 0.005 && parts.every((p) => Math.abs(p.amount - (left.get(p.charge.id) ?? unpaid(p.charge))) <= 0.005);
  return { parts, exact, rest };
}

/**
 * Eşleştirme. units: [{ id, pay_code, label }], residents: [{ unit_id, name }], charges: site_charges satırları.
 * Dönen her hareket için { txn, kind: 'exact' | 'suggest' | 'none', unit, parts: [{ charge, amount }], why }.
 * exact: açıklama kodu bulundu ve tutar en eski açık tahakkukları tam kapatıyor. suggest: kod bulundu ama tutar farklı, ya da
 * yalnız ad-soyad eşleşti. Aynı dosyadaki hareketler aynı tahakkuku iki kez kapatamaz (tarih sırasıyla dağıtılır).
 */
export function matchTxns(txns, { units, residents, charges }) {
  const open = charges.filter((c) => OPEN.includes(c.status));
  const byUnit = new Map(); open.forEach((c) => { if (!byUnit.has(c.unit_id)) byUnit.set(c.unit_id, []); byUnit.get(c.unit_id).push(c); });
  const codes = units.filter((u) => u.pay_code).map((u) => ({ u, code: compact(u.pay_code) }));
  const names = new Map(); residents.forEach((r) => {
    const w = words(r.name).filter((x) => x.length >= 2);
    if (w.length >= 2) { if (!names.has(r.unit_id)) names.set(r.unit_id, []); names.get(r.unit_id).push(w); }
  });
  const left = new Map();
  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date) || a.line - b.line);
  const res = [];
  for (const t of sorted) {
    const flat = compact(t.desc), dw = new Set(words(t.desc));
    const hit = codes.filter((x) => flat.includes(x.code));
    let unit = null, how = '';
    if (hit.length === 1) { unit = hit[0].u; how = 'code'; }
    else {
      const byName = units.filter((u) => (names.get(u.id) || []).some((w) => w.every((x) => dw.has(x))));
      if (byName.length === 1) { unit = byName[0]; how = 'name'; }
      else if (byName.length > 1) { res.push({ txn: t, kind: 'none', unit: null, parts: [], why: 'Birden çok daireyle aynı ad' }); continue; }
    }
    if (!unit) { res.push({ txn: t, kind: 'none', unit: null, parts: [], why: hit.length > 1 ? 'Birden çok açıklama kodu' : 'Kod ya da ad bulunamadı' }); continue; }
    const a = allocate(t.amount, byUnit.get(unit.id) || [], left);
    if (!a.parts.length) { res.push({ txn: t, kind: 'none', unit, parts: [], why: 'Dairenin açık borcu yok' }); continue; }
    a.parts.forEach((p) => left.set(p.charge.id, Math.round(((left.get(p.charge.id) ?? unpaid(p.charge)) - p.amount) * 100) / 100));
    const kind = how === 'code' && a.exact ? 'exact' : 'suggest';
    const why = how === 'code' ? (a.exact ? 'Açıklama kodu ve tutar' : a.rest > 0.005 ? 'Açıklama kodu; tutar borçtan fazla' : 'Açıklama kodu; kısmi ödeme') : 'Ad soyad eşleşti';
    res.push({ txn: t, kind, unit, parts: a.parts, why, extra: a.rest > 0.005 ? a.rest : 0 });
  }
  return res;
}
