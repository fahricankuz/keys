// Mağaza ürün kimlikleri ve fiyat basamakları (app/src/domain/store-ids.js): kanonik kimlik sunucunun okuduğu biçimle (plan_of,
// product_units) aynıdır; Google Play'de 2 abonelik (tek, bes) × 18 temel plan (3-aylik) olarak açılır, RevenueCat bunu `tek:3-aylik` verir.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  storeProductId, allStoreProductIds, allPlaySubscriptions, parseStoreProductId, canonicalProductId, playSubscriptionId, playBasePlanId,
  storePricePoint, storePrice, storePriceTable, changeKind, monthlyValue
} from '../app/src/domain/store-ids.js';
import { CONFIG } from '../app/src/domain/config.js';

const ROOT = new URL('../', import.meta.url).pathname;
const TIERS = CONFIG.billing.tiers;

test('kimlik: paket_adet_dönem; adet 1-9 aralığına sıkıştırılır; Google Play abonelik:temel-plan (tek:3-aylik)', () => {
  expect(storeProductId('tek', 3, false)).toBe('tek_3_aylik');
  expect(storeProductId('bes', 12, true)).toBe('bes_9_yillik');
  expect(storeProductId('tek', 0, false)).toBe('tek_1_aylik');
  expect(storeProductId('bes', 5, true, 'android')).toBe('bes:5-yillik');
  expect(storeProductId('tek', 3, false, 'android')).toBe('tek:3-aylik');
  expect(canonicalProductId('tek', 3, false)).toBe('tek_3_aylik');
  expect(playSubscriptionId('bes')).toBe('bes');
  expect(playBasePlanId(7, true)).toBe('7-yillik');
  expect(() => storeProductId('kurumsal', 1, false)).toThrow(/mağazada satılmaz/);
});

test('kimlik ayrıştırma: App Store ve Play biçimleri aynı (paket, adet, dönem) verir; tanınmayan kimlik null', () => {
  expect(parseStoreProductId('tek_3_aylik')).toEqual({ plan: 'tek', units: 3, yearly: false });
  expect(parseStoreProductId('bes:9-yillik')).toEqual({ plan: 'bes', units: 9, yearly: true });
  for (const bad of ['tek', 'tek_10_aylik', 'tek_0_aylik', 'evim_aylik', 'tek:3_aylik', 'tek_3:aylik', 'kurumsal', '', null, undefined]) expect(parseStoreProductId(bad)).toBeNull();
  for (const id of allStoreProductIds()) expect(parseStoreProductId(id)).toEqual(parseStoreProductId(allStoreProductIds('android')[allStoreProductIds().indexOf(id)]));
});

test('bütün kimlikler sunucunun ürün kimliği kuralına uyar: App Store 36 ürün, Play 2 abonelik × 18 temel plan', () => {
  const rule = /^(tek|bes)_[1-9]_(aylik|yillik)$/;
  const ios = allStoreProductIds();
  expect(ios).toHaveLength(36);
  expect(new Set(ios).size).toBe(36);
  expect(ios.every((x) => rule.test(x))).toBe(true);
  const play = allStoreProductIds('android');
  expect(play).toHaveLength(36);
  expect(play.every((x) => /^(tek|bes):[1-9]-(aylik|yillik)$/.test(x))).toBe(true);
  expect(allPlaySubscriptions()).toEqual(['tek', 'bes']);
  // Play kimliği kanonik kimliğe birebir çevrilir (sunucu billing fonksiyonu aynı dönüşümü yapar).
  expect(play.map((x) => canonicalProductId(...Object.values(parseStoreProductId(x))))).toEqual(ios);
  expect(readFileSync(ROOT + 'supabase/schema.sql', 'utf8')).toContain("product ~ '^(tek|bes)_[1-9]_(aylik|yillik)$'");
});

test('fiyat basamağı: mülk başı fiyat × adet, en yakın ",99" basamağı; kuruş hatası yok', () => {
  expect(storePricePoint(199.98)).toBe(199.99);
  expect(storePricePoint(299.97)).toBe(299.99);
  expect(storePricePoint(8999.91)).toBe(8999.99);
  expect(storePricePoint(99.99)).toBe(99.99);
  expect(storePricePoint(100.5)).toBe(100.99);          // ortada (,49 / ,50) yukarı
  expect(storePricePoint(100.48)).toBe(99.99);
  expect(storePricePoint(0)).toBe(0.99);
  expect(storePrice(99.99, 2)).toBe(199.99);
  expect(storePrice(199.99, 9)).toBe(1799.99);
  expect(storePrice(999.99, 9)).toBe(8999.99);
});

test('fiyat tablosu: config.js fiyatlarıyla 36 satır; hepsi ,99 ile biter; Başlangıç 99,99 / 999,99, Profesyonel 199,99 / 1.999,99', () => {
  expect(TIERS.find((x) => x.id === 'tek')).toMatchObject({ price: 99.99, yearly: 999.99 });
  expect(TIERS.find((x) => x.id === 'bes')).toMatchObject({ price: 199.99, yearly: 1999.99 });
  const rows = storePriceTable(TIERS);
  expect(rows).toHaveLength(36);
  expect(rows.map((r) => r.productId)).toEqual(allStoreProductIds());
  expect(rows.map((r) => r.playId)).toEqual(allStoreProductIds('android'));
  expect(rows.every((r) => Math.round(r.price * 100) % 100 === 99)).toBe(true);
  const at = (id) => rows.find((r) => r.productId === id);
  expect(at('tek_1_aylik').price).toBe(99.99);
  expect(at('tek_1_yillik').price).toBe(999.99);
  expect(at('bes_1_aylik').price).toBe(199.99);
  expect(at('bes_1_yillik').price).toBe(1999.99);
  expect(at('tek_3_aylik').price).toBe(299.99);
  expect(at('bes_5_yillik').price).toBe(9999.99);
  expect(at('bes_9_yillik')).toMatchObject({ price: 17999.99, subscription: 'bes', basePlan: '9-yillik', playId: 'bes:9-yillik' });
  // Fiyat adetle ve pakete göre artar; yıllık aynı adetteki aylığın 10 katına yakındır (2 ay bedava).
  for (const plan of ['tek', 'bes']) for (let n = 1; n <= 9; n++) {
    const m = at(`${plan}_${n}_aylik`).price, y = at(`${plan}_${n}_yillik`).price;
    expect(Math.abs(y - m * 10)).toBeLessThan(0.2 * n + 0.1);
    if (n > 1) expect(m).toBeGreaterThan(at(`${plan}_${n - 1}_aylik`).price);
  }
  expect(() => storePriceTable([])).toThrow(/tiers/);
});

test('paket değişikliği türü: yükseltme hemen, düşürme ve dönem kısaltma dönem sonunda, aynı ürün engellenir', () => {
  const p = (plan, units, yearly = false) => ({ plan, units, yearly });
  expect(changeKind(TIERS, null, p('tek', 1))).toBe('new');
  expect(changeKind(TIERS, p('tek', 3), p('tek', 3))).toBe('same');
  expect(changeKind(TIERS, p('tek', 3), p('tek', 4))).toBe('upgrade');
  expect(changeKind(TIERS, p('tek', 3), p('bes', 3))).toBe('upgrade');
  expect(changeKind(TIERS, p('tek', 3), p('tek', 2))).toBe('downgrade');
  expect(changeKind(TIERS, p('bes', 3), p('tek', 3))).toBe('downgrade');
  expect(changeKind(TIERS, p('tek', 3), p('tek', 3, true))).toBe('downgrade');      // aylık → yıllık (2 ay bedava): dönem sonunda
  expect(changeKind(TIERS, p('tek', 3, true), p('tek', 3))).toBe('downgrade');      // yıllık → aylık: dönemi kısaltma, dönem sonunda
  expect(changeKind(TIERS, p('tek', 1), p('bes', 1, true))).toBe('upgrade');        // 99,99 → 166,67/ay
  expect(changeKind(TIERS, p('tek', 3, true), p('bes', 3))).toBe('downgrade');      // yıllıktan aylığa geçiş her zaman dönem sonunda
  expect(changeKind(TIERS, { plan: 'x', units: 1, yearly: false }, p('tek', 1))).toBe('downgrade');   // bilinmeyen eski ürün: güvenli yol
  expect(monthlyValue(TIERS, 'tek', 3, true)).toBeCloseTo((999.99 * 3) / 12, 4);
});

test('telefon sürümü: açılış tanıtım sayfası değil; satın alma web ödemesine gitmez; çıkışta mağaza ve cihaz kaydı bırakılır', () => {
  const index = readFileSync(ROOT + 'app/src/app/index.tsx', 'utf8');
  expect(index).toMatch(/Platform\.OS === 'web'\) return <Landing/);
  expect(index).toMatch(/user \? '\/uygulama' : '\/giris'/);
  const sheets = readFileSync(ROOT + 'app/src/app-ui/sheets.tsx', 'utf8');
  expect(sheets).toMatch(/else if \(NATIVE\) open\('magaza-satin-al'/);
  const auth = readFileSync(ROOT + 'app/src/auth/auth.tsx', 'utf8');
  expect(auth).toMatch(/logOutStore\(\)/);
  expect(auth).toMatch(/unregisterDevice\(\)/);
});

test('satın alma ekranı: mağaza denemesi metni yok (deneme yalnız sunucuda, 30 gün); fiyat ve döneme ek olarak yenileme koşulu, geri yükleme, koşul ve gizlilik bağlantıları var', () => {
  const buy = readFileSync(ROOT + 'app/src/app-ui/store-purchase.tsx', 'utf8');
  expect(buy).not.toMatch(/İlk ay ücretsiz|introductory|cardTrial/);
  for (const need of ['restoreStore', 'manageStore', 'CONFIG.legal.terms', 'CONFIG.legal.privacy', 'changeKind', 'storeReady', 'kendiliğinden yenilenir']) expect(buy).toContain(need);
  const sheets = readFileSync(ROOT + 'app/src/app-ui/sheets.tsx', 'utf8');
  expect(sheets).not.toMatch(/a\.trialPeriod|a\.cardTrial/);
  expect(sheets).toContain('useBillingPaused');
  expect(sheets).toContain("open('hesap-sil')");
});
