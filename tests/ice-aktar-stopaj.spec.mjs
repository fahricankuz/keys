// Toplu mülk içe aktarma (app/src/domain/importer.js): kira stopajını şirket ya da esnaf kiracı keser (GVK md. 94/5-a);
// konut kirasında da geçerlidir. Kiracı şahıssa (unvan ve vergi no yoksa) stopaj satırı reddedilir.
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
  const out = join(mkdtempSync(join(tmpdir(), 'ice-aktar-')), 'm.mjs');
  buildSync({ stdin: { contents: `export * from '${D}importer.js';`, resolveDir: D, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    external: ['fflate'], alias: { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js' } });
  M = await import(pathToFileURL(out).href);
});

const HEAD = ['Mülk adı', 'Tür', 'Kira (₺)', 'Başlangıç', 'Stopaj', 'Şirket unvanı', 'Vergi no'];
const row = (name, type, stopaj, co = '', vkn = '') => [name, type, '30000', '01.09.2026', stopaj, co, vkn];
const msgs = (it) => it.errors.map((e) => e.msg);

test('stopaj: şirket kiracılı konut ve işyeri kabul edilir; şahıs kiracıda reddedilir; stopajsız satır serbest', () => {
  const r = M.validate([HEAD,
    row('Moda Konut', 'Konut', 'Evet', 'Örnek Ltd. Şti.', '1234567890'),
    row('Kadıköy Ofis', 'Ofis', 'Evet', '', '1234567890'),
    row('Bebek Konut', 'Konut', 'Evet'),
    row('Şişli Mağaza', 'Mağaza', 'Evet'),
    row('Ataşehir Konut', 'Konut', 'Hayır')
  ], [], '2026-08-01');
  expect(r.fatal).toEqual([]);
  const [konutSirket, ofisVkn, konutSahis, magazaSahis, stopajsiz] = r.items;
  expect(konutSirket.errors).toEqual([]);
  expect(konutSirket.data).toMatchObject({ type: 'Konut', stopaj: true, company: { name: 'Örnek Ltd. Şti.', taxNo: '1234567890' } });
  expect(ofisVkn.errors).toEqual([]);
  expect(ofisVkn.data.stopaj).toBe(true);
  const why = 'Stopajı şirket ya da esnaf kiracı keser; şirket unvanını ya da vergi numarasını yaz';
  expect(msgs(konutSahis)).toContain(why);
  expect(msgs(magazaSahis)).toContain(why);
  expect(msgs(konutSirket)).not.toContain('Stopaj yalnızca işyeri kiralarında uygulanır');
  expect(stopajsiz.errors).toEqual([]);
  expect(stopajsiz.data.stopaj).toBe(false);
});
