// Toplu birim ekleme dosyası (app/src/domain/unit-import.js): başlık eşleme, örnek satır, m², aynı kayıt, e-posta ve ticari kira.
import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const D = new URL('../app/src/domain/', import.meta.url).pathname;
const STUBS = new URL('./stubs/', import.meta.url).pathname;
let M;
test.beforeAll(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'toplu-')), 'm.mjs');
  buildSync({ stdin: { contents: `export * from '${D}unit-import.js';`, resolveDir: D, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js' } });
  M = await import(pathToFileURL(out).href);
});

test('site: başlıklar eşanlamlıyla eşlenir; hatalı satır işaretlenir, aynı daire iki kez yazılamaz', () => {
  const r = M.validateUnits([
    ['blok', 'daire no', 'metrekare', 'arsa payi', 'aidat', 'malik', 'malik e-posta', 'kiraci', 'kiraci telefonu', 'aidati kim oder'],
    ['A', '1', '120', '2', '1.500', 'Ayşe', 'ayse@ornek.com', 'Can', '0532 111 22 33', 'Malik'],
    ['A', '1', '90', '', '', '', '', '', '', ''],
    ['B', '2', '', '1', '1000', 'Veli', 'bozuk-eposta', '', '', ''],
    ['B', '3', '80', 'x', '', '', '', '', '', '']
  ], false, [{ block: 'C', no: '9' }]);
  expect(r.fatal).toEqual([]);
  const [a, dup, bad, share] = r.items;
  expect(a).toMatchObject({ line: 2, errors: [], unit: { block: 'A', no: '1', area: 120, share: 2, aidat: 1500, payer: 'malik' } });
  expect(a.people).toEqual([{ role: 'malik', name: 'Ayşe', phone: '', email: 'ayse@ornek.com' }, { role: 'kiraci', name: 'Can', phone: '0532 111 22 33', email: '' }]);
  expect(dup.errors.map((e) => e.msg)).toContain('Bu kayıt zaten var ya da dosyada iki kez yazılmış');
  expect(bad.errors.map((e) => e.msg)).toEqual(expect.arrayContaining(['m² eksik ya da hatalı', '{who} e-postası hatalı']));
  expect(share.errors.map((e) => e.msg)).toContain('Arsa payı okunamadı');
});

test('zorunlu sütun yoksa dosya reddedilir; yalnız başlık varsa satır yok uyarısı', () => {
  expect(M.validateUnits([['Blok', 'Aidat'], ['A', '100']]).fatal[0].p.list).toBe('Daire no, m²');
  expect(M.validateUnits([['Blok', 'Daire no', 'm²']]).fatal[0].msg).toMatch(/kayıt satırı yok/);
});

test('ticari: kira ve para birimi; mevcut birimle çakışma', () => {
  const r = M.validateUnits([['Kat / bölüm', 'Birim no', 'm²', 'Aylık kira', 'Para birimi', 'Kiracı', 'Kiracı e-posta'],
    ['Zemin', 'Z-1', '200', '2.000', 'usd', 'Moda A.Ş.', 'muhasebe@moda.com'], ['Zemin', 'Z-2', '150', '', '', '', '']], true, [{ block: 'zemin', no: 'z-2' }]);
  expect(r.items[0]).toMatchObject({ errors: [], unit: { rent: 2000, currency: 'USD' }, people: [{ role: 'kiraci', name: 'Moda A.Ş.', email: 'muhasebe@moda.com' }] });
  expect(r.items[1].errors.length).toBe(1);
});
