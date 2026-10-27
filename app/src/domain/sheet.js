/* Tablo dışa aktarma: CSV (Excel'in Türkçe ayarıyla açılır, ";" ayraçlı) ve gerçek .xlsx.
   sheets: [{ name, columns:[{ header, type:'text'|'money'|'date' }], rows:[[...]], totals?:[sütun], totalLabel? }] */

import { zipSync, strToU8 } from 'fflate';

export function money(v, lang = 'tr'){
  return (Number(v) || 0).toLocaleString(lang === 'en' ? 'en-GB' : 'tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** YYYY-AA-GG → GG.AA.YYYY (İngilizcede GG/AA/YYYY). */
export function day(v, lang = 'tr'){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  if (!m) return String(v || '');
  return lang === 'en' ? m[3] + '/' + m[2] + '/' + m[1] : m[3] + '.' + m[2] + '.' + m[1];
}

const colSum = (sheet, i) => sheet.rows.reduce((a, r) => a + (Number(r[i]) || 0), 0);

export function toCsv(sheets, lang = 'tr'){
  const cell = v => { const s = String(v ?? ''); return /[;"\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const fmt = (v, type) => v == null || v === '' ? '' : type === 'money' ? money(v, lang) : type === 'date' ? day(v, lang) : v;
  const out = [];
  sheets.forEach((sh, n) => {
    if (n) out.push('');
    out.push(cell(sh.name));
    out.push(sh.columns.map(c => cell(c.header)).join(';'));
    sh.rows.forEach(r => out.push(sh.columns.map((c, i) => cell(fmt(r[i], c.type))).join(';')));
    if (sh.totals && sh.totals.length)
      out.push(sh.columns.map((c, i) => cell(i === 0 ? sh.totalLabel || '' : sh.totals.includes(i) ? money(colSum(sh, i), lang) : '')).join(';'));
  });
  return '﻿' + out.join('\r\n') + '\r\n';
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** 0 → A, 26 → AA */
const col = i => { let s = ''; for (i++; i; ) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };

/** Excel tarih seri numarası (1899-12-30 tabanlı). */
const serial = v => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000) : null;
};

/** Sayfa adı: en fazla 31 karakter, yasak karakter yok, benzersiz. */
const sheetName = (name, used) => {
  let n = String(name).replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sayfa', k = 2;
  const base = n;
  while (used.has(n)) n = base.slice(0, 28) + ' ' + k++;
  used.add(n);
  return n;
};

// Stiller: 1 kalın başlık, 2 para (#,##0.00), 3 tarih, 4 kalın para (toplam).
const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="5"><xf/><xf fontId="1" applyFont="1"/><xf numFmtId="4" applyNumberFormat="1"/><xf numFmtId="14" applyNumberFormat="1"/><xf numFmtId="4" fontId="1" applyNumberFormat="1" applyFont="1"/></cellXfs></styleSheet>';

function worksheet(sh){
  const rows = [];
  const text = (ref, v, s) => '<c r="' + ref + '" t="inlineStr"' + (s ? ' s="' + s + '"' : '') + '><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  rows.push('<row r="1">' + sh.columns.map((c, i) => text(col(i) + 1, c.header, 1)).join('') + '</row>');
  sh.rows.forEach((r, n) => {
    const line = n + 2;
    rows.push('<row r="' + line + '">' + sh.columns.map((c, i) => {
      const v = r[i], ref = col(i) + line;
      if (v == null || v === '') return '';
      if (c.type === 'money' && Number.isFinite(Number(v))) return '<c r="' + ref + '" s="2"><v>' + Number(v) + '</v></c>';
      if (c.type === 'date' && serial(v) != null) return '<c r="' + ref + '" s="3"><v>' + serial(v) + '</v></c>';
      return text(ref, v);
    }).join('') + '</row>');
  });
  if (sh.totals && sh.totals.length){
    const line = sh.rows.length + 2;
    rows.push('<row r="' + line + '">' + sh.columns.map((c, i) => {
      const ref = col(i) + line;
      if (i === 0) return text(ref, sh.totalLabel || '', 1);
      if (!sh.totals.includes(i)) return '';
      return '<c r="' + ref + '" s="4"><f>' + (sh.rows.length ? 'SUM(' + col(i) + '2:' + col(i) + (line - 1) + ')' : '0') + '</f><v>' + colSum(sh, i) + '</v></c>';
    }).join('') + '</row>');
  }
  const widths = sh.columns.map((c, i) => Math.min(48, Math.max(10, String(c.header).length + 2, ...sh.rows.map(r => String(r[i] ?? '').length + 2))));
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>'
    + widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('')
    + '</cols><sheetData>' + rows.join('') + '</sheetData></worksheet>';
}

/** Çok sayfalı .xlsx dosyası (Uint8Array). */
export function toXlsx(sheets){
  const used = new Set();
  const names = sheets.map(s => sheetName(s.name, used));
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') + '</Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>'
      + names.map((n, i) => '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + sheets.map((s, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('')
      + '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': STYLES
  };
  sheets.forEach((s, i) => { files['xl/worksheets/sheet' + (i + 1) + '.xml'] = worksheet(s); });
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])));
}
