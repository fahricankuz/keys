// Paketler: mülk başına fiyat (KDV dahil), 1–9 mülk, 10 ve üstü Kurumsal, ürün kimliği, özellik kilitleri, mülk sınırı önerisi.
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
  const out = join(mkdtempSync(join(tmpdir(), 'plans-')), 'domain.mjs');
  buildSync({
    stdin: { contents: `export * from '${D}plans.js'; export { roomFor } from '${D}billing.js'; export * as i18n from '${D}i18n.js'; export { CONFIG } from '${D}config.js';`, resolveDir: D, loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js' }
  });
  M = await import(pathToFileURL(out).href);
});

const tek = () => M.tierOf('tek'), bes = () => M.tierOf('bes'), kur = () => M.tierOf('kurumsal');

test('fiyatlar mülk başına: Başlangıç 99,99, Profesyonel 199,99; yıllık aylığın 10 katı; Kurumsal teklif', () => {
  M.i18n.setLang('tr');
  expect(M.priceText(tek())).toBe('₺99,99');
  expect(M.priceText(bes())).toBe('₺199,99');
  expect(M.priceText(tek(), true)).toBe('₺999,90');
  expect(M.priceText(bes(), true)).toBe('₺1.999,90');
  expect(M.priceText(kur())).toBe('Teklif alın');
  expect(tek().yearly).toBeCloseTo(tek().price * 10, 2);
  expect(bes().yearly).toBeCloseTo(bes().price * 10, 2);
});

test('yıllık kartta aylığa denk gelen mülk başı tutar yazılır', () => {
  M.i18n.setLang('tr');
  const eq = (tr) => M.monthlyEquivalent({ ...tr });
  // aylık denk gelen: yearly / 12
  expect(Math.round((tek().yearly / 12) * 100) / 100).toBe(83.33);
  expect(Math.round((bes().yearly / 12) * 100) / 100).toBe(166.66);
  expect(eq(tek())).toBe('₺83,33');
});

test('İngilizce fiyatlar dolar: $2,00 ve $4,00 mülk başına', async () => {
  await M.i18n.loadEn();
  M.i18n.setLang('en');
  await new Promise((r) => setTimeout(r, 20));
  expect(M.priceText(tek())).toBe('$2.00');
  expect(M.priceText(bes())).toBe('$4.00');
  expect(M.priceText(tek(), true)).toBe('$20.00');
  expect(M.priceText(bes(), true)).toBe('$40.00');
  M.i18n.setLang('tr');
  await new Promise((r) => setTimeout(r, 20));
});

test('toplam: mülk adedi × mülk başı fiyat; kuruş hatası yok; fiyatsız pakette null', () => {
  M.i18n.setLang('tr');
  expect(M.totalPrice(tek(), 1)).toBe(99.99);
  expect(M.totalPrice(tek(), 3)).toBe(299.97);
  expect(M.totalPrice(bes(), 9)).toBe(1799.91);
  expect(M.totalPrice(tek(), 9, true)).toBe(8999.1);
  expect(M.totalPrice(bes(), 5, true)).toBe(9999.5);
  expect(M.totalPrice(kur(), 12)).toBeNull();
  expect(M.totalText(bes(), 3)).toBe('₺599,97');
  expect(M.totalText(kur(), 12)).toBe('Teklif alın');
});

test('mülk aralığı: Başlangıç ve Profesyonel 1-9, Kurumsal 10 ve üstü', () => {
  M.i18n.setLang('tr');
  expect(M.maxUnits()).toBe(9);
  expect(M.rangeText(tek())).toBe('1-9 mülk');
  expect(M.rangeText(bes())).toBe('1-9 mülk');
  expect(M.rangeText(kur())).toBe('10 ve üstü mülk');
  expect(M.unitsText(1)).toBe('1 mülk');
  expect(M.unitsText(3)).toBe('3 mülke kadar');
});

test('ürün kimliği: paket, adet ve dönem gidiş-dönüş; geçersiz kimlik null', () => {
  expect(M.productId('tek', 3, false)).toBe('tek_3_aylik');
  expect(M.productId('bes', 9, true)).toBe('bes_9_yillik');
  expect(M.parseProduct('bes_5_yillik')).toEqual({ plan: 'bes', units: 5, yearly: true });
  expect(M.parseProduct('tek_1_aylik')).toEqual({ plan: 'tek', units: 1, yearly: false });
  for (const bad of ['tek_0_aylik', 'tek_10_aylik', 'bes_3_haftalik', 'evim_aylik', 'kurumsal_3_aylik', '', null, undefined]) expect(M.parseProduct(bad)).toBeNull();
});

test('özellik kilitleri: SMS, ekip, toplu aktarma ve rapor Başlangıç\'ta yok; Profesyonel ve Kurumsal\'da var', () => {
  for (const f of ['sms', 'team', 'import', 'report']) {
    expect(M.FEATURES[f]).not.toContain('tek');
    expect(M.FEATURES[f]).toContain('bes');
    expect(M.FEATURES[f]).toContain('kurumsal');
    expect(M.FEATURES[f]).toContain('trial');        // deneme süresince hepsi açık
  }
  expect(M.FEATURES.mailReport).not.toContain('bes');
  expect(M.FEATURES.mailReport).toContain('kurumsal');
});

test('paket maddeleri: Profesyonel Başlangıç\'ı kapsar; SMS yalnız Profesyonel ve Kurumsal listesinde', () => {
  M.i18n.setLang('tr');
  expect(M.tierPoints('tek').join('|')).not.toMatch(/SMS/);
  expect(M.tierPoints('bes')[0]).toBe('Başlangıç’taki her şey');
  expect(M.tierPoints('bes').join('|')).toMatch(/SMS hatırlatmaları/);
  expect(M.tierPoints('kurumsal')[0]).toBe('Site yönetimi · AVM · GYO · Depo ve lojistik · Emlak ofisi · Aile ofisi');   // ilk madde: sektörler (kartta kalın)
  expect(M.tierPoints('kurumsal')[1]).toBe('Profesyonel’deki her şey');
  expect(M.tierPoints('tek')).toHaveLength(6);
});

test('mülk sınırı: satın alınan adet dolunca "adet artır", 9\'u aşınca "Kurumsal" önerilir', () => {
  const a = (units) => ({ access: true, subscribed: true, plan: 'tek', units });
  expect(M.roomFor(1, 2, a(3))).toMatchObject({ ok: true });
  expect(M.roomFor(1, 3, a(3))).toMatchObject({ ok: false, need: 4, suggest: 'adet' });
  expect(M.roomFor(1, 8, a(8))).toMatchObject({ ok: false, need: 9, suggest: 'adet' });
  expect(M.roomFor(1, 9, a(9))).toMatchObject({ ok: false, need: 10, suggest: 'kurumsal' });
  expect(M.roomFor(6, 5, a(5))).toMatchObject({ ok: false, need: 11, suggest: 'kurumsal' });
  expect(M.roomFor(50, 0, { access: true, subscribed: true, plan: 'kurumsal', units: null })).toMatchObject({ ok: true });
});
