// Abonelik istemci düzeltmeleri: backend.humanError — başka hesaba bağlı mağaza satın alması (RevenueCat 6 / 7 / 13) ve paket sınırı eşlemesi.
import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const D = new URL('../app/src/domain/', import.meta.url).pathname;
const STUBS = new URL('./stubs/', import.meta.url).pathname;

test('humanError: başka hesaba bağlı satın alma Türkçe açıklanır; RevenueCat nesnesi olmayan ve diğer hatalar etkilenmez', async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'abonelik-istemci-')), 'm.mjs');
  await build({
    stdin: { contents: `export { humanError } from '${D}backend.js';`, resolveDir: D, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js', 'expo-secure-store': STUBS + 'expo-secure-store.js' },
    external: ['@supabase/supabase-js', 'expo-crypto']
  });
  const { humanError } = await import(pathToFileURL(out).href);
  const msg = 'Bu satın alma başka bir anahtar hesabına bağlı. Satın aldığın hesapla giriş yap.';
  expect(humanError({ code: '7', message: 'The receipt is already in use by another subscriber.', underlyingErrorMessage: 'x', readableErrorCode: 'RECEIPT_ALREADY_IN_USE_ERROR' })).toBe(msg);
  expect(humanError({ code: '6', message: 'x', underlyingErrorMessage: 'y' })).toBe(msg);
  expect(humanError({ code: '13', message: 'x', underlyingErrorMessage: 'y' })).toBe(msg);
  expect(humanError({ code: '7', message: 'Başka bir hata' })).toBe('Başka bir hata');
  expect(humanError({ code: 'EV403', message: 'Paket sınırı: en fazla 2 mülk; bu mülk paketinin dışında kaldı' })).toContain('mülk sınırına');
});
