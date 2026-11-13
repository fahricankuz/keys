// Statik derleme (Node, window yok) gerçek Supabase ayarlarıyla yapılırken supabase-js oturumu okumaya çalışır.
// Web oturum deposu bu sırada window'a dokunmamalı; yoksa site derlemesi "window is not defined" ile durur.
import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const D = new URL('../app/src/domain/', import.meta.url).pathname;

test('web oturum deposu window yokken boş davranır ve hata vermez', async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'ssr-')), 'depo.mjs');
  buildSync({ stdin: { contents: `export * from '${D}secure-storage.js';`, resolveDir: D, loader: 'js' }, bundle: true, format: 'esm',
    platform: 'node', outfile: out, logLevel: 'silent',
    alias: { '@react-native-async-storage/async-storage': new URL('./stubs/async-storage-throws.js', import.meta.url).pathname } });
  expect(typeof globalThis.window).toBe('undefined');
  const { authStorage } = await import(out);
  await expect(authStorage.getItem('sb-oturum')).resolves.toBeNull();
  await expect(authStorage.setItem('sb-oturum', 'x')).resolves.toBeUndefined();
  await expect(authStorage.removeItem('sb-oturum')).resolves.toBeUndefined();
});
