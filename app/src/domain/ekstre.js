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

/** Para birimi yazımları → ISO kodu. */
const CUR = { TL: 'TRY', TRY: 'TRY', YTL: 'TRY', USD: 'USD', DOLAR: 'USD', EUR: 'EUR', EURO: 'EUR', AVRO: 'EUR', GBP: 'GBP', STERLIN: 'GBP', CHF: 'CHF' };
/** Başlığın sonundaki parantezli para birimi: "Tutar (TRY)", "TUTAR(USD)" → kod; yoksa ''. */
const parenCur = (h) => { const m = /\(([^)]*)\)[\s*]*$/.exec(String(h ?? '')); return m ? CUR[compact(m[1])] || '' : ''; };
/** Başlık anahtarı: sondaki para birimi atılır ("TUTAR (TRY)" → "TUTAR"), sonra sadeleştirilir. */
const headerKey = (h) => compact(parenCur(h) ? String(h).replace(/\([^)]*\)[\s*]*$/, '') : h);

/** Başlık satırını bulur: tarih + açıklama + (tutar ya da alacak) sütunları olan ilk satır. Yoksa null. */
export function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const map = {};
    (rows[i] || []).forEach((h, c) => {
      const k = headerKey(h);
      for (const [key, list] of Object.entries(ALIASES)) if (map[key] === undefined && list.includes(k)) map[key] = c;
    });
    if (map.date !== undefined && map.desc !== undefined && (map.amount !== undefined || map.credit !== undefined)) return { row: i, map };
  }
  return null;
}

/** Hesabın para birimi ('TRY', 'USD', 'EUR', …; dosya adı yalnız "döviz" diyorsa 'YP'). Sıra: tutar sütununun başlığı ("Tutar (USD)"),
    başlığın üstündeki hesap bilgileri ("VADESİZ USD", "Döviz cinsi: TL"), dosya adı ("… USD HESAP.xls"). Hiçbiri yoksa 'TRY'.
    Hareket açıklamaları okunmaz ("DÖVİZ ALIŞ USD" gibi satırlar TL hesabı döviz sanılmasın diye).
    @param {any[][]} rows
    @param {{ row: number, map: any } | null} header
    @param {string} [name] dosya adı */
export function currencyOf(rows, header, name = '') {
  if (header) for (const k of ['amount', 'credit']) {
    const c = header.map?.[k];
    const x = c === undefined ? '' : parenCur(rows[header.row]?.[c]);
    if (x) return x;
  }
  const top = header ? header.row : Math.min(rows.length, 10);
  for (let i = 0; i < top; i++) for (const cell of rows[i] || []) for (const w of words(cell)) if (CUR[w]) return CUR[w];
  const fw = words(String(name).replace(/\.[a-z0-9]+$/i, ''));
  const hit = fw.find((w) => CUR[w]);
  if (hit) return CUR[hit];
  return fw.some((w) => w === 'YP' || w === 'DOVIZ') ? 'YP' : 'TRY';
}

/** IBAN'daki banka kodu (TR + 2 kontrol + 5 hane) → banka. */
const BANK_CODES = {
  '00010': 'Ziraat Bankası', '00012': 'Halkbank', '00015': 'VakıfBank', '00032': 'TEB', '00046': 'Akbank', '00059': 'Şekerbank',
  '00062': 'Garanti BBVA', '00064': 'İş Bankası', '00067': 'Yapı Kredi', '00099': 'ING', '00103': 'Fibabanka', '00111': 'QNB',
  '00123': 'HSBC', '00124': 'Alternatif Bank', '00134': 'DenizBank', '00135': 'Anadolubank', '00146': 'Odeabank',
  '00203': 'Albaraka Türk', '00205': 'Kuveyt Türk', '00206': 'Türkiye Finans', '00209': 'Ziraat Katılım', '00210': 'Vakıf Katılım',
  '00211': 'Emlak Katılım'
};
/** Adla tanıma (sadeleştirilmiş, boşluksuz; özelden genele: "Ziraat Katılım" "Ziraat"ten önce). */
const BANK_NAMES = [
  ['ZIRAATKATILIM', 'Ziraat Katılım'], ['VAKIFKATILIM', 'Vakıf Katılım'], ['EMLAKKATILIM', 'Emlak Katılım'], ['KUVEYTTURK', 'Kuveyt Türk'],
  ['TURKIYEFINANS', 'Türkiye Finans'], ['ALBARAKA', 'Albaraka Türk'], ['GARANTI', 'Garanti BBVA'], ['ISBANK', 'İş Bankası'],
  ['YAPIKREDI', 'Yapı Kredi'], ['AKBANK', 'Akbank'], ['ZIRAAT', 'Ziraat Bankası'], ['HALKBANK', 'Halkbank'], ['VAKIF', 'VakıfBank'],
  ['FINANSBANK', 'QNB'], ['DENIZBANK', 'DenizBank'], ['ENPARA', 'Enpara'], ['ANADOLUBANK', 'Anadolubank'], ['FIBA', 'Fibabanka'],
  ['SEKERBANK', 'Şekerbank'], ['ODEABANK', 'Odeabank'], ['TURKEKONOMI', 'TEB'], ['ALTERNATIFBANK', 'Alternatif Bank']
];
/** Kısa adlar yalnız ayrı sözcük olarak ("TEB", başka bir sözcüğün içinde değil). */
const BANK_WORDS = { TEB: 'TEB', ING: 'ING', QNB: 'QNB', YKB: 'Yapı Kredi', HSBC: 'HSBC' };
const bankIn = (text) => {
  const flat = compact(text), w = new Set(words(text));
  return (BANK_NAMES.find(([k]) => flat.includes(k)) || [])[1] || Object.entries(BANK_WORDS).find(([k]) => w.has(k))?.[1] || '';
};

/** Bankanın adı; bilinmiyorsa ''. Sıra: başlığın üstündeki hesap IBAN'ının banka kodu, başlığın üstündeki banka adı, dosya adı.
    Hareket satırlarına bakılmaz (karşı tarafın bankası, ör. "GARANTİ'DEN GELEN EFT", ekstrenin bankası sanılmasın).
    @param {any[][]} rows
    @param {{ name?: string, upto?: number }} [opts] name: dosya adı; upto: başlık satırının sırası (üstündeki satırlar hesap bilgisidir) */
export function bankOf(rows, { name = '', upto } = {}) {
  const top = rows.slice(0, upto ?? 10);
  for (const r of top) for (const cell of r || []) {
    const m = /TR\d{2}(\d{5})\d{17}/.exec(String(cell ?? '').replace(/\s/g, '').toUpperCase());
    if (m && BANK_CODES[m[1]]) return BANK_CODES[m[1]];
  }
  return bankIn(top.map((r) => (r || []).join(' ')).join(' ')) || bankIn(String(name).replace(/\.[a-z0-9]+$/i, ''));
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
const PAID = ['paid', 'partial', 'approved'];

/** Kart tahsilatı aktarımı: ödeme kuruluşu ya da POS'tan gelen toplu (komisyonu düşülmüş) tutar. Kart ödemeleri uygulamada tek tek
    işlendiği için bu satırlar hiçbir zaman bir daireye yazılmaz. */
const CARD_WORDS = ['POS', 'SANALPOS', 'VPOS'];
const CARD_PARTS = ['IYZICO', 'IYZIPAY', 'PAYTR', 'PARAMPOS', 'PARAODEME', 'SIPAY', 'PAYU', 'CRAFTGATE', 'STRIPE', 'UYEISYERI', 'KREDIKARTI', 'BANKAKARTI', 'POSBLOKE', 'POSTAHSILAT'];
export function isCardSettlement(desc) {
  const flat = compact(desc), w = new Set(words(desc));
  return CARD_WORDS.some((x) => w.has(x)) || CARD_PARTS.some((x) => flat.includes(x));
}

const daysApart = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 86400000);
/** Başka yolla (dekont onayı, "Ödendi işaretle", kart) zaten işlenmiş ödeme: aynı tutar, ödeme tarihi işlem tarihine ±7 gün.
    Böyle bir satır sonraki açık aya yazılmaz (çift sayım). used: bu dosyada başka bir satırla eşleşmiş kayıtlar. */
function knownPayment(t, list, used) {
  return list.find((c) => !used.has(c.id) && PAID.includes(c.status) && c.paid_on && daysApart(t.date, String(c.paid_on).slice(0, 10)) <= 7
    && Math.abs((Number(c.paid_amount) || 0) - t.amount) <= 0.005) || null;
}
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
 * Dönen her hareket için { txn, kind: 'exact' | 'suggest' | 'none' | 'known' | 'card', unit, parts: [{ charge, amount }], why }.
 * known: aynı tutarda ve tarihte zaten işlenmiş bir ödeme var (dekont, elle, kart); card: kart tahsilatı toplu aktarımı. İkisi de işlenmez.
 * separate: yöneticinin "bu ayrı bir ödeme" dediği hareketlerin parmak izleri (known denetimi atlanır, normal eşleştirilir).
 * exact: açıklama kodu bulundu ve tutar en eski açık tahakkukları tam kapatıyor. suggest: kod bulundu ama tutar farklı, ya da
 * yalnız ad-soyad eşleşti. Aynı dosyadaki hareketler aynı tahakkuku iki kez kapatamaz (tarih sırasıyla dağıtılır).
 */
export function matchTxns(txns, { units, residents, charges }, { separate = new Set() } = {}) {
  const open = charges.filter((c) => OPEN.includes(c.status));
  const paidByUnit = new Map(); charges.filter((c) => PAID.includes(c.status)).forEach((c) => { if (!paidByUnit.has(c.unit_id)) paidByUnit.set(c.unit_id, []); paidByUnit.get(c.unit_id).push(c); });
  const allPaid = charges.filter((c) => PAID.includes(c.status));
  const used = new Set();
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
    if (isCardSettlement(t.desc)) { res.push({ txn: t, kind: 'card', unit: null, parts: [], why: 'Kart tahsilatı aktarımı' }); continue; }
    const flat = compact(t.desc), dw = new Set(words(t.desc));
    const hit = codes.filter((x) => flat.includes(x.code));
    let unit = null, how = '';
    if (hit.length === 1) { unit = hit[0].u; how = 'code'; }
    else {
      const byName = units.filter((u) => (names.get(u.id) || []).some((w) => w.every((x) => dw.has(x))));
      if (byName.length === 1) { unit = byName[0]; how = 'name'; }
      else if (byName.length > 1) { res.push({ txn: t, kind: 'none', unit: null, parts: [], why: 'Birden çok daireyle aynı ad' }); continue; }
    }
    if (!unit) {
      // Daire bilinmiyor ama aynı tutar ve tarihte kurumda tek bir işlenmiş ödeme varsa büyük olasılıkla odur: elle tekrar girilmesin.
      const same = allPaid.filter((c) => !used.has(c.id) && c.paid_on && daysApart(t.date, String(c.paid_on).slice(0, 10)) <= 3 && Math.abs((Number(c.paid_amount) || 0) - t.amount) <= 0.005);
      if (same.length === 1 && !separate.has(t.fp)) { used.add(same[0].id); res.push({ txn: t, kind: 'known', unit: { id: same[0].unit_id }, parts: [{ charge: same[0], amount: t.amount }], why: 'Aynı tutar ve tarihte kayıtlı ödeme var' }); continue; }
      res.push({ txn: t, kind: 'none', unit: null, parts: [], why: hit.length > 1 ? 'Birden çok açıklama kodu' : 'Kod ya da ad bulunamadı' }); continue;
    }
    const known = separate.has(t.fp) ? null : knownPayment(t, paidByUnit.get(unit.id) || [], used);
    if (known) { used.add(known.id); res.push({ txn: t, kind: 'known', unit, parts: [{ charge: known, amount: t.amount }], why: 'Zaten kayıtlı (dekont ya da elle işlenmiş)' }); continue; }
    const a = allocate(t.amount, byUnit.get(unit.id) || [], left);
    if (!a.parts.length) { res.push({ txn: t, kind: 'none', unit, parts: [], why: 'Dairenin açık borcu yok' }); continue; }
    a.parts.forEach((p) => left.set(p.charge.id, Math.round(((left.get(p.charge.id) ?? unpaid(p.charge)) - p.amount) * 100) / 100));
    const kind = how === 'code' && a.exact ? 'exact' : 'suggest';
    const why = how === 'code' ? (a.exact ? 'Açıklama kodu ve tutar' : a.rest > 0.005 ? 'Açıklama kodu; tutar borçtan fazla' : 'Açıklama kodu; kısmi ödeme') : 'Ad soyad eşleşti';
    res.push({ txn: t, kind, unit, parts: a.parts, why, extra: a.rest > 0.005 ? a.rest : 0 });
  }
  return res;
}
