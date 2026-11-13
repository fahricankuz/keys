// İngilizce seçiliyken: ödeme durumu etiketleri çevrilir; açılışta kayıtlı dil Türkçeye sıfırlanmaz.
// Alan mantığı (app/src/domain) esbuild ile paketlenip Node'da çalışır; localStorage yerine bellek deposu kullanılır.
import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const D = new URL('../app/src/domain/', import.meta.url).pathname;
const STUBS = new URL('./stubs/', import.meta.url).pathname;

async function yukle() {
  const ls = new Map();
  globalThis.localStorage = { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, String(v)); }, removeItem: k => { ls.delete(k); }, key: i => [...ls.keys()][i], get length() { return ls.size; } };
  const out = join(mkdtempSync(join(tmpdir(), 'dil-durum-')), 'm.mjs');
  buildSync({
    stdin: { contents: `export * as logic from '${D}logic.js'; export * as i18n from '${D}i18n.js'; export * as state from '${D}state.js'; export { storage } from '${D}storage.js';`, resolveDir: D, loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js' }
  });
  return import(pathToFileURL(out).href + '?' + Math.random());
}

test('ödeme durumu etiketleri dil belirlendikten sonra İngilizce gelir (modül yüklenirken donmaz)', async () => {
  const M = await yukle();              // dil henüz 'tr' iken modül yüklendi
  expect(M.logic.ST.review[0]).toBe('Onay bekliyor');
  await M.i18n.initLangFor?.('en');
  M.i18n.setLang('en');
  await new Promise(r => setTimeout(r, 50));
  expect(M.i18n.getLang()).toBe('en');
  expect(M.logic.ST.review[0]).toBe('Awaiting approval');
  expect(M.logic.ST.approved[0]).not.toBe('Ödendi');
  expect(M.logic.chip('review')).toContain('Awaiting approval');
  for (const k of ['approved', 'review', 'partial', 'rejected', 'pending', 'late']) expect(M.logic.ST[k][0], k).not.toMatch(/[ıİşŞğĞüÜöÖçÇ]|Bekliyor|Gecikti/);
});

test('açılışta kayıtlı İngilizce seçim, depo hazır olmadan yapılan kayıtla Türkçeye sıfırlanmaz', async () => {
  const M = await yukle();
  // Depo hazır olmadan (hydrate öncesi) bir kayıt: eskiden evim-tercih {lang:'tr'} yazıp seçimi siliyordu.
  M.state.saveLocal();
  M.storage.setItem('evim-tercih', JSON.stringify({ lang: 'en', theme: 'system' }));   // hydrate: diskteki tercih belleğe gelir
  M.state.saveLocal();                                                                      // boot() öncesi kayıt
  expect(JSON.parse(M.storage.getItem('evim-tercih')).lang).toBe('en');
  await M.i18n.initLang();
  expect(M.i18n.getLang()).toBe('en');
  M.state.boot();
  expect(M.state.S.lang).toBe('en');
  M.state.saveLocal();
  expect(JSON.parse(M.storage.getItem('evim-tercih')).lang).toBe('en');
  expect(M.state.savedLang()).toBe('en');
});

test('dil değişince S.lang eşitlenir; sonraki kayıt seçimi ezmez', async () => {
  const M = await yukle();
  M.state.boot();
  M.i18n.setLang('en');
  await new Promise(r => setTimeout(r, 50));
  M.state.saveLocal();
  expect(JSON.parse(M.storage.getItem('evim-tercih')).lang).toBe('en');
});
