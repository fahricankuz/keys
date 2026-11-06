// Mağaza ürün kimlikleri (app/src/domain/store-ids.js): sunucunun okuduğu biçimle (plan_of, product_units) aynı;
// Google Play kimliği billing fonksiyonunda aynı biçime çevrilir (billing.spec.mjs).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { storeProductId, allStoreProductIds } from '../app/src/domain/store-ids.js';

const ROOT = new URL('../', import.meta.url).pathname;

test('kimlik: paket_adet_dönem; adet 1-9 aralığına sıkıştırılır; Google Play biçimi abonelik:temel-plan', () => {
  expect(storeProductId('tek', 3, false)).toBe('tek_3_aylik');
  expect(storeProductId('bes', 12, true)).toBe('bes_9_yillik');
  expect(storeProductId('tek', 0, false)).toBe('tek_1_aylik');
  expect(storeProductId('bes', 5, true, 'android')).toBe('bes_5:yillik');
  expect(() => storeProductId('kurumsal', 1, false)).toThrow(/mağazada satılmaz/);
});

test('bütün kimlikler sunucunun ürün kimliği kuralına uyar (36 ürün)', () => {
  const rule = /^(tek|bes)_[1-9]_(aylik|yillik)$/;
  const ios = allStoreProductIds();
  expect(ios).toHaveLength(36);
  expect(ios.every((x) => rule.test(x))).toBe(true);
  expect(allStoreProductIds('android').every((x) => rule.test(x.replace(':', '_')))).toBe(true);
  expect(readFileSync(ROOT + 'supabase/schema.sql', 'utf8')).toContain("product ~ '^(tek|bes)_[1-9]_(aylik|yillik)$'");
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
