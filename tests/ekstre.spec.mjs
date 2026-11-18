// Birim: banka ekstresi okuma ve tahsilat eşleştirmesi (app/src/domain/xls.js, ekstre.js, importer.readTable).
// tests/fixtures/garanti-ornek.xls uydurmadır: Garanti BBVA "hesap hareketleri" düzeni, gerçek kişi/hesap yok (üretici: garanti-ornek.py).
import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const D = new URL('../app/src/domain/', import.meta.url).pathname;
const STUBS = new URL('./stubs/', import.meta.url).pathname;
const XLS = new Uint8Array(readFileSync(new URL('./fixtures/garanti-ornek.xls', import.meta.url)));
let M;

test.beforeAll(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'ekstre-')), 'm.mjs');
  buildSync({
    stdin: { contents: `export * from '${D}xls.js'; export * from '${D}ekstre.js'; export { readTable } from '${D}importer.js';`, resolveDir: D, loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js' }
  });
  M = await import(pathToFileURL(out).href);
});

test('xls: Garanti dosyası okunur (paylaşılan metin, sayı); readTable .xls tanır', async () => {
  expect(M.isXls(XLS)).toBe(true);
  const rows = M.parseXls(XLS);
  expect(rows[14]).toEqual(['Tarih', 'Açıklama', 'Etiket', 'Tutar', 'Bakiye', 'Dekont No']);
  expect(rows[15].slice(0, 4)).toEqual(['16/11/2026', 'AYŞE YILMAZ-K7MXRP KASIM AIDAT', 'Para Transferi', '1500']);
  expect(rows[17][3]).toBe('-850.25');
  expect(await M.readTable(XLS)).toEqual(rows);
});

test('başlık, banka ve gelen ödemeler: giden hareket (fatura) alınmaz; parmak izi kararlı', () => {
  const rows = M.parseXls(XLS);
  const h = M.findHeader(rows);
  expect(h).toEqual({ row: 14, map: { date: 0, desc: 1, amount: 3, ref: 5 } });
  expect(M.bankOf(rows)).toBe('Garanti BBVA');
  const tx = M.incoming(rows, h);
  expect(tx.map((x) => [x.date, x.amount])).toEqual([['2026-11-16', 1500], ['2026-11-15', 1000], ['2026-11-13', 500], ['2026-11-12', 750]]);
  expect(tx[0].fp).toMatch(/^[0-9a-f]{16}$/);
  expect(M.incoming(rows, h)[0].fp).toBe(tx[0].fp);
  expect(new Set(tx.map((x) => x.fp)).size).toBe(4);
});

test('alacak/borç sütunlu biçim ve Türkçe tutar yazımı', () => {
  const rows = [['İşlem Tarihi', 'Açıklama', 'Borç', 'Alacak'], ['01.11.2026', 'A', '', '1.250,50'], ['02.11.2026', 'B', '300,00', '']];
  const h = M.findHeader(rows);
  expect(h.map).toMatchObject({ date: 0, desc: 1, debit: 2, credit: 3 });
  expect(M.incoming(rows, h).map((x) => [x.date, x.amount])).toEqual([['2026-11-01', 1250.5]]);
  expect(M.amountOf('1.980,00 TL')).toBe(1980);
  expect(M.amountOf('-1443.06')).toBe(-1443.06);
  expect(M.dateOf('15/11/2026 10:51')).toBe('2026-11-15');
});

test('eşleştirme: kod + tam tutar kesin; kod + farklı tutar öneri; yalnız ad öneri; bilinmeyen eşleşmez; tahakkuk iki kez kapanmaz', () => {
  const rows = M.parseXls(XLS);
  const tx = M.incoming(rows, M.findHeader(rows));
  const units = [{ id: 'u1', pay_code: 'K7MXRP' }, { id: 'u2', pay_code: 'ABCDEF' }, { id: 'u3', pay_code: 'P3QWHT' }];
  const residents = [{ unit_id: 'u1', name: 'Ayşe Yılmaz' }, { unit_id: 'u2', name: 'Mehmet Demir' }, { unit_id: 'u3', name: 'Zeynep Kaya' }];
  const ch = (id, unit_id, month, amount, status = 'open', paid_amount = 0) => ({ id, unit_id, month, kind: 'aidat', amount, status, paid_amount });
  const charges = [ch('c1', 'u1', '2026-11', 1500), ch('c2', 'u2', '2026-10', 500), ch('c3', 'u2', '2026-11', 500), ch('c4', 'u3', '2026-11', 1500), ch('c5', 'u1', '2026-10', 1500, 'paid', 1500)];
  const r = Object.fromEntries(M.matchTxns(tx, { units, residents, charges }).map((x) => [x.txn.amount, x]));
  expect(r[1500]).toMatchObject({ kind: 'exact', unit: { id: 'u1' } });
  expect(r[1500].parts.map((p) => [p.charge.id, p.amount])).toEqual([['c1', 1500]]);
  expect(r[1000]).toMatchObject({ kind: 'suggest', unit: { id: 'u2' }, why: 'Ad soyad eşleşti' });   // kodsuz: iki ay birden
  expect(r[1000].parts.map((p) => [p.charge.id, p.amount])).toEqual([['c2', 500], ['c3', 500]]);
  expect(r[500]).toMatchObject({ kind: 'suggest', unit: { id: 'u3' } });                            // kod var, kısmi ödeme
  expect(r[500].parts).toEqual([{ charge: charges[3], amount: 500 }]);
  expect(r[750]).toMatchObject({ kind: 'none', unit: null });
  // Aynı daireye iki ödeme: ikincisi kalan borcu aşamaz.
  const two = M.matchTxns([{ ...tx[0], line: 1 }, { ...tx[0], line: 2, fp: 'x' }], { units, residents, charges });
  expect(two.map((x) => x.kind)).toEqual(['exact', 'none']);
  expect(two[1].why).toBe('Dairenin açık borcu yok');
  // Kısmi ödenmiş tahakkukta kalan tutar esas alınır.
  const partial = M.matchTxns([{ ...tx[0], amount: 1000 }], { units, residents, charges: [ch('c9', 'u1', '2026-11', 1500, 'partial', 500)] });
  expect(partial[0]).toMatchObject({ kind: 'exact' });
});

test('Türkçe harf sadeleştirme', () => {
  expect(M.fold('Gül Bloğu İĞÜŞÖÇ ığüşöç')).toBe('GUL BLOGU IGUSOC IGUSOC');
});
