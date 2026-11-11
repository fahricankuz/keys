// Tarih biçimlendirme (app/src/domain/util.js): eksik ya da bozuk tarih "Invalid Date" yerine "—" gösterir; geçerli tarih aynen biçimlenir.
import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const D = new URL('../app/src/domain/', import.meta.url).pathname;
const STUBS = new URL('./stubs/', import.meta.url).pathname;
let U;
test.beforeAll(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'tarih-')), 'm.mjs');
  buildSync({ stdin: { contents: `export * from '${D}util.js';`, resolveDir: D, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js' }, external: ['@supabase/supabase-js', 'expo-*', '@capacitor/*'] });
  U = await import(pathToFileURL(out).href);
});

test('eksik ya da bozuk tarih "—"; geçerli tarih biçimlenir', () => {
  for (const bad of [undefined, null, '', 'abc', NaN]) {
    expect(U.fmt(bad)).toBe('—'); expect(U.fmtFull(bad)).toBe('—'); expect(U.tm(bad)).toBe('—');
  }
  expect(U.monthYear('abc')).toBe('—');
  expect(U.ago(NaN)).toBe('—');
  expect(U.fmtFull('2026-11-11')).toMatch(/2026/);
  expect(U.monthYear('2026-11')).toMatch(/2026$/);
});
