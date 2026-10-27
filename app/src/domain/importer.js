/* Toplu içe aktarma: Excel (.xlsx) ya da CSV dosyasından mülk listesi.
   Şablon üretir, dosyayı okur, satırları denetler ve kaydedilecek kayıtlara çevirir.
   Hata metinleri çeviri anahtarıdır ({msg, p}); ekran t() ile gösterir. */

import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';

export const COLUMNS = [
  { key:'name', header:'Mülk adı', required:true, example:'Moda 3+1', aliases:['mulk','mulk adi','ad','name','property','property name'] },
  { key:'addr', header:'Adres', example:'Moda Cd. 12/4 Kadıköy', aliases:['address'] },
  { key:'type', header:'Tür', example:'Konut', aliases:['mulk turu','tip','type'] },
  { key:'area', header:'Alan (m²)', example:'120', aliases:['alan','m2','metrekare','area'] },
  { key:'rent', header:'Kira (₺)', required:true, example:'30000', aliases:['kira','aylik kira','kira tl','rent'] },
  { key:'dueDay', header:'Ödeme günü', example:'5', aliases:['odeme gunu','vade gunu','gun','due day'] },
  { key:'aidat', header:'Aidat (₺)', example:'1500', aliases:['aidat','aidat tl','dues'] },
  { key:'aidatPayer', header:'Aidatı kim öder', example:'Kiracı', aliases:['aidati kim oder','aidat odeyen','dues payer'] },
  { key:'deposit', header:'Depozito (₺)', example:'60000', aliases:['depozito','depozito tl','deposit'] },
  { key:'depositKind', header:'Depozito türü', example:'Nakit', aliases:['depozito turu','deposit type'] },
  { key:'startDate', header:'Başlangıç', example:'01.09.2026', aliases:['baslangic','baslangic tarihi','sozlesme baslangici','start','start date'] },
  { key:'contractEnd', header:'Bitiş', example:'01.09.2027', aliases:['bitis','bitis tarihi','sozlesme bitisi','end','end date'] },
  { key:'dask', header:'DASK bitişi', example:'15.10.2027', aliases:['dask','dask bitis','dask bitisi','dask tarihi'] },
  { key:'stopaj', header:'Stopaj', example:'Hayır', aliases:['stopaj','withholding'] },
  { key:'tenantName', header:'Kiracı adı', example:'Mehmet Yılmaz', aliases:['kiraci','kiraci adi','kiraci ad soyad','tenant','tenant name'] },
  { key:'tenantPhone', header:'Kiracı telefonu', example:'0532 000 00 00', aliases:['kiraci telefon','kiraci telefonu','telefon','phone','tenant phone'] },
  { key:'tenantEmail', header:'Kiracı e-posta', example:'kiraci@ornek.com', aliases:['kiraci eposta','kiraci e posta','eposta','e posta','email','tenant email'] },
  { key:'coName', header:'Şirket unvanı', example:'', aliases:['sirket','sirket unvani','unvan','company'] },
  { key:'coTaxNo', header:'Vergi no', example:'', aliases:['vergi no','vergi numarasi','vkn','tax no','tax number'] },
  { key:'coTaxOffice', header:'Vergi dairesi', example:'', aliases:['vergi dairesi','tax office'] }
];

/** Karşılaştırma için sadeleştirir: küçük harf, Türkçe karakter yok, yalnız harf/rakam. */
export function norm(s){
  return String(s ?? '').toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/i̇/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/²/g, '2').replace(/₺/g, ' tl ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const col = i => { let s = ''; for (i++; i; ) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };

export function templateCsv(){
  const cell = s => /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  return '﻿' + [COLUMNS.map(c => c.header), COLUMNS.map(c => c.example)].map(r => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

export function templateXlsx(){
  const rows = [COLUMNS.map(c => c.header), COLUMNS.map(c => c.example)];
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Mülkler" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      + rows.map((r, y) => '<row r="' + (y + 1) + '">' + r.map((v, x) => v === '' ? '' : '<c r="' + col(x) + (y + 1) + '" t="inlineStr"' + (y === 0 ? ' s="1"' : '') + '><is><t>' + esc(v) + '</t></is></c>').join('') + '</row>').join('')
      + '</sheetData></worksheet>'
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}

/** CSV: ayraç ilk satırdan bulunur (; , ya da sekme); tırnaklı alanlar desteklenir. */
export function parseCsv(text){
  const s = String(text || '').replace(/^﻿/, '');
  const head = (s.split(/\r?\n/, 1)[0] || '').replace(/"[^"]*"/g, '');
  const counts = [';', ',', '\t'].map(d => [d, head.split(d).length - 1]);
  const sep = counts.sort((a, b) => b[1] - a[1])[0][1] > 0 ? counts[0][0] : ';';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < s.length; i++){
    const ch = s[i];
    if (quoted){
      if (ch === '"' && s[i + 1] === '"'){ cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === sep){ row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r'){
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length){ row.push(cell); rows.push(row); }
  return rows.map(r => r.map(c => c.trim()));
}

const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
const colIndex = ref => {
  const m = /^([A-Z]+)/.exec(ref || '');
  if (!m) return -1;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
};
const runText = xml => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(m => unxml(m[1])).join('');

/** .xlsx: ilk sayfayı satır satır okur (paylaşılan metinler, satır içi metin, sayı, doğru/yanlış). */
export function parseXlsx(bytes){
  const zip = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  const read = p => zip[p] ? strFromU8(zip[p]) : '';
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => runText(m[1]));
  let path = 'xl/worksheets/sheet1.xml';
  const rid = (/<sheet\b[^>]*r:id="([^"]+)"/.exec(read('xl/workbook.xml')) || [])[1];
  if (rid){
    const rels = read('xl/_rels/workbook.xml.rels');
    const m = new RegExp('<Relationship\\b[^>]*Id="' + rid + '"[^>]*Target="([^"]+)"').exec(rels)
      || new RegExp('<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="' + rid + '"').exec(rels);
    if (m) path = m[1].startsWith('/') ? m[1].slice(1) : 'xl/' + m[1].replace(/^\.\//, '');
  }
  const sheet = read(path);
  if (!sheet) throw new Error('Dosyada sayfa bulunamadı');
  const rows = [];
  for (const r of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>|<row\b[^>]*\/>/g)){
    const cells = [];
    for (const c of (r[1] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
      const attrs = c[1], inner = c[2] || '';
      const x = colIndex((/\br="([A-Z]+\d+)"/.exec(attrs) || [])[1]);
      const type = (/\bt="([^"]+)"/.exec(attrs) || [])[1];
      const v = (/<v>([\s\S]*?)<\/v>/.exec(inner) || [])[1];
      let val = '';
      if (type === 's') val = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') val = runText(inner);
      else if (type === 'b') val = v === '1' ? 'Evet' : 'Hayır';
      else if (v !== undefined) val = unxml(v);
      cells[x >= 0 ? x : cells.length] = val.trim();
    }
    rows.push(Array.from(cells, v => v ?? ''));
  }
  return rows;
}

/** Dosya türünü içerikten anlar: "PK" ile başlıyorsa xlsx, değilse UTF-8 CSV. */
export function readTable(bytes){
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return b[0] === 80 && b[1] === 75 ? parseXlsx(b) : parseCsv(new TextDecoder('utf-8').decode(b));
}

/** Başlık satırı → { anahtar: sütun no }. Başlıklar ve eş anlamlılar sadeleştirilerek eşlenir. */
export function mapHeaders(header){
  const map = {};
  (header || []).forEach((h, i) => {
    const n = norm(h);
    if (!n) return;
    const c = COLUMNS.find(x => norm(x.header) === n || x.aliases.includes(n));
    if (c && map[c.key] === undefined) map[c.key] = i;
  });
  return map;
}

/** "30.000,50", "30,000.50", "₺30000" → sayı; boşsa null, okunamazsa NaN. */
export function num(v){
  let s = String(v ?? '').replace(/[₺\s]|TL/gi, '');
  if (!s) return null;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^\d+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const pad = n => String(n).padStart(2, '0');
const ymd = (y, m, d) => {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? y + '-' + pad(m) + '-' + pad(d) : null;
};

/** GG.AA.YYYY, YYYY-AA-GG ya da Excel seri numarası → YYYY-AA-GG; boşsa null, okunamazsa false. */
export function date(v){
  const s = String(v ?? '').trim();
  if (!s) return null;
  let m;
  if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s))) return ymd(+m[3], +m[2], +m[1]) || false;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return ymd(+m[1], +m[2], +m[3]) || false;
  if (/^\d{4,5}(\.\d+)?$/.test(s)){
    const d = new Date(Date.UTC(1899, 11, 30) + 86400000 * Math.floor(Number(s)));
    return d.getUTCFullYear() > 1950 && d.getUTCFullYear() < 2200 && d.toISOString().slice(0, 10);
  }
  return false;
}

const TYPES = { konut:'Konut', ev:'Konut', daire:'Konut', residential:'Konut', ofis:'Ofis', buro:'Ofis', office:'Ofis',
  magaza:'Mağaza', dukkan:'Mağaza', isyeri:'Mağaza', shop:'Mağaza', retail:'Mağaza', depo:'Depo', ambar:'Depo', storage:'Depo', warehouse:'Depo' };
const PAYERS = { kiraci:'Kiracı', tenant:'Kiracı', 'mulk sahibi':'Mülk sahibi', 'ev sahibi':'Mülk sahibi', owner:'Mülk sahibi', landlord:'Mülk sahibi' };
const DEPOSIT = { nakit:'Nakit', cash:'Nakit', teminat:'Teminat mektubu', 'teminat mektubu':'Teminat mektubu', 'letter of guarantee':'Teminat mektubu' };
const YES = ['evet','e','var','yes','y','1','true','dogru'];
const NO = ['hayir','h','yok','no','n','0','false','yanlis',''];

/**
 * Tabloyu denetler. existing: mevcut mülkler [{id,name,addr}] (aynı ad ya da adres "mevcut" sayılır).
 * Dönen: { fatal:[{msg,p}], items:[{ line, errors, dup, action:'new'|'skip'|'update', data }] }
 */
export function validate(rows, existing = [], today = new Date().toISOString().slice(0, 10)){
  const fatal = [];
  const [header, ...body] = rows || [];
  const map = mapHeaders(header);
  COLUMNS.filter(c => c.required && map[c.key] === undefined).forEach(c => fatal.push({ msg:'Gerekli sütun eksik: {col}', p:{ col:c.header } }));
  if (fatal.length) return { fatal, items: [] };

  const byName = new Map(existing.map(p => [norm(p.name), p]));
  const byAddr = new Map(existing.filter(p => norm(p.addr)).map(p => [norm(p.addr), p]));
  const seen = new Map();
  const items = [];
  body.forEach((r, i) => {
    const get = k => map[k] === undefined ? '' : String(r[map[k]] ?? '').trim();
    if (COLUMNS.every(c => !get(c.key))) return;          // boş satır
    const line = i + 2, errors = [];
    const err = (msg, p) => errors.push({ msg, p });

    const name = get('name');
    if (!name) err('Mülk adı boş'); else if (name.length > 60) err('Mülk adı en fazla 60 karakter olmalı');
    const tk = norm(get('type'));
    const type = tk ? TYPES[tk] : 'Konut';
    if (!type) err('Tür Konut, Ofis, Mağaza ya da Depo olmalı');
    const rent = num(get('rent'));
    if (rent == null) err('Kira boş'); else if (!(rent > 0)) err('Kira sıfırdan büyük bir sayı olmalı');
    const dd = num(get('dueDay'));
    const dueDay = dd == null ? 1 : dd;
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) err('Ödeme günü 1 ile 28 arasında olmalı');
    const number = (k, label) => {
      const n = num(get(k));
      if (Number.isNaN(n) || (n != null && n < 0)){ err('{col} sayı olmalı', { col: label }); return null; }
      return n;
    };
    const area = number('area', 'Alan (m²)');
    const aidat = number('aidat', 'Aidat (₺)') || 0;
    const deposit = number('deposit', 'Depozito (₺)') || 0;
    const pk = norm(get('aidatPayer'));
    const aidatPayer = pk ? PAYERS[pk] : 'Kiracı';
    if (!aidatPayer) err('Aidatı kim öder: Kiracı ya da Mülk sahibi olmalı');
    const dk = norm(get('depositKind'));
    const depositKind = dk ? DEPOSIT[dk] : 'Nakit';
    if (!depositKind) err('Depozito türü Nakit ya da Teminat mektubu olmalı');
    const day = (k, label) => {
      const d = date(get(k));
      if (d === false){ err('{col} tarihi okunamadı (GG.AA.YYYY)', { col: label }); return null; }
      return d;
    };
    const startDate = day('startDate', 'Başlangıç') || today;
    let contractEnd = day('contractEnd', 'Bitiş');
    if (!contractEnd){
      const d = new Date(startDate + 'T00:00:00Z');
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      contractEnd = d.toISOString().slice(0, 10);
    }
    if (contractEnd <= startDate) err('Bitiş tarihi başlangıçtan sonra olmalı');
    const dask = day('dask', 'DASK bitişi');
    const sk = norm(get('stopaj'));
    const stopaj = YES.includes(sk) ? true : NO.includes(sk) ? false : null;
    if (stopaj === null) err('Stopaj Evet ya da Hayır olmalı');
    else if (stopaj && type === 'Konut') err('Stopaj yalnızca işyeri kiralarında uygulanır');
    const phone = get('tenantPhone');
    if (phone && !/^[+\d\s().-]{7,20}$/.test(phone)) err('Kiracı telefonu okunamadı');
    const email = get('tenantEmail');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) err('Kiracı e-postası geçersiz');
    const taxNo = get('coTaxNo').replace(/\s/g, '');
    if (taxNo && !/^\d{10,11}$/.test(taxNo)) err('Vergi no 10 ya da 11 haneli olmalı');
    if (name){
      const k = norm(name);
      if (seen.has(k)) err('Bu ad dosyada {line}. satırda da var', { line: seen.get(k) });
      else seen.set(k, line);
    }
    const addr = get('addr');
    const dup = (name && byName.get(norm(name))) || (norm(addr) && byAddr.get(norm(addr))) || null;
    const coName = get('coName');
    items.push({
      line, errors,
      dup: dup ? { id: dup.id, name: dup.name } : null,
      action: dup ? 'skip' : 'new',
      data: {
        name, addr, type: type || 'Konut', area, rent, dueDay, aidat, aidatPayer: aidatPayer || 'Kiracı',
        deposit, depositKind: depositKind || 'Nakit', startDate, contractEnd, dask, stopaj: !!stopaj,
        tenantName: get('tenantName'), tenantPhone: phone, tenantEmail: email,
        company: coName || taxNo ? { name: coName, taxNo, taxOffice: get('coTaxOffice') } : null
      }
    });
  });
  if (!items.length) fatal.push({ msg:'Dosyada aktarılacak satır yok' });
  return { fatal, items };
}

/** Hatasız ve atlanmayan satırlar; "güncelle" seçilenler mevcut mülkün kimliğini taşır. */
export function toSave(items){
  return items
    .filter(it => !it.errors.length && it.action !== 'skip')
    .map(it => Object.assign({ line: it.line }, it.data, it.action === 'update' && it.dup ? { updateId: it.dup.id } : {}));
}
