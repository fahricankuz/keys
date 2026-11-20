// Birim: IBAN yardımcıları (app/src/domain/iban.js). Örnek IBAN'lar uydurmadır (mod-97 tutarlı), gerçek hesap değildir.
import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const D = new URL('../app/src/domain/', import.meta.url).pathname;
let M;

test.beforeAll(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'iban-')), 'm.mjs');
  buildSync({ stdin: { contents: `export * from '${D}iban.js';`, resolveDir: D, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent' });
  M = await import(pathToFileURL(out).href);
});

test('IBAN: boşluk ve küçük harf temizlenir, dörtlü gruplanır', () => {
  expect(M.normalizeIban(' tr42 0001 0000 0000 0000 0000 01 ')).toBe('TR420001000000000000000001');
  expect(M.formatIban('TR420001000000000000000001')).toBe('TR42 0001 0000 0000 0000 0000 01');
});

test('IBAN: TR + 24 rakam ve mod-97 denetimi', () => {
  expect(M.validIban('TR42 0001 0000 0000 0000 0000 01')).toBe(true);
  expect(M.validIban('TR430001000000000000000001')).toBe(false);   // kontrol basamağı yanlış
  expect(M.validIban('TR42000100000000000000001')).toBe(false);    // 25 karakter
  expect(M.validIban('DE89370400440532013000')).toBe(false);        // yalnız TR
  expect(M.validIban('')).toBe(false);
});
