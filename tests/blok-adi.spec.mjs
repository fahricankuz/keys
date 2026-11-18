// Birim: blok başlığında "Blok" tekrarı olmaz (app/src/domain/blok.js). Sunucudaki unit_label ile aynı kural (blok-adi.sql.spec.mjs).
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
  const out = join(mkdtempSync(join(tmpdir(), 'blok-')), 'm.mjs');
  buildSync({
    stdin: { contents: `export * from '${D}blok.js';`, resolveDir: D, loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js' }
  });
  M = await import(pathToFileURL(out).href);
});

test('blok başlığı: "Blok" yalnız gerekiyorsa eklenir', () => {
  expect(M.blockTitle('A')).toBe('A Blok');
  expect(M.blockTitle('A Blok')).toBe('A Blok');
  expect(M.blockTitle('a blok')).toBe('a blok');
  expect(M.blockTitle('C BLOK')).toBe('C BLOK');
  expect(M.blockTitle('Gül Bloğu')).toBe('Gül Bloğu');
  expect(M.blockTitle('GÜL BLOĞU')).toBe('GÜL BLOĞU');
  expect(M.blockTitle('Blok')).toBe('Blok');
  expect(M.blockTitle('Ablok')).toBe('Ablok Blok');     // kelimenin parçası sayılmaz
  expect(M.blockTitle(' B ')).toBe('B Blok');
  expect(M.blockTitle('')).toBe('');
});
