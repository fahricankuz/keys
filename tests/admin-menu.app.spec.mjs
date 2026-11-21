// Yönetici paneli telefonda: altta sekme çubuğu (grup sekmeleri + Diğer), üstte o grubun bölümleri şerit olarak; Diğer tüm bölümleri listeler.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, hydrated } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8242;
let server, errors;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  await page.addInitScript((d) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, seed());
});
test.afterEach(() => { expect(errors).toEqual([]); });

test('yönetici paneli telefonda alt sekmeler: grup sekmesi bölümlerini gösterir, Diğer tüm bölümleri listeler, seçince bölüm değişir @mobil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://localhost:${PORT}/giris/yonetici`);
  await hydrated(page, page.getByLabel('E-posta'));
  await page.getByLabel('E-posta').fill('admin@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Genel bakış' })).toBeVisible();
  // Özet grubundayken yalnız Özet bölümleri şeritte; başka grubun bölümü görünmez.
  await expect(page.getByRole('button', { name: 'Büyüme', exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hesaplar', exact: true })).toHaveCount(0);
  for (const tab of ['Özet', 'Müşteriler', 'Destek', 'Operasyon', 'Diğer']) await expect(page.getByRole('button', { name: new RegExp('^' + tab) })).toBeVisible();
  await page.getByRole('button', { name: /^Müşteriler/ }).click();
  await expect(page.getByRole('button', { name: 'Hesaplar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hesaplar', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Hesaplar' })).toBeVisible();
  // Diğer: tüm bölümler, tema ve çıkış.
  await page.getByRole('button', { name: 'Diğer', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Kurumlar', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /temaya geç$/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Çıkış yap' })).toBeVisible();
  await page.getByRole('button', { name: 'Kurumlar', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Kurumlar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Çıkış yap' })).toHaveCount(0);   // seçince Diğer kapandı
});

test('yönetici paneli tema geçişi: koyu temaya geçer ve seçim yenilemede kalır', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`http://localhost:${PORT}/giris/yonetici`);
  await hydrated(page, page.getByLabel('E-posta'));
  await page.getByLabel('E-posta').fill('admin@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('button', { name: 'Koyu temaya geç' }).click();
  await expect(page.getByRole('button', { name: 'Açık temaya geç' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Açık temaya geç' })).toBeVisible();
});

test('yönetici paneli masaüstünde kısa pencerede: yan menü kayar, e-posta ve "Çıkış yap" altta görünür ve basılabilir', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto(`http://localhost:${PORT}/giris/yonetici`);
  await hydrated(page, page.getByLabel('E-posta'));
  await page.getByLabel('E-posta').fill('admin@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const out = page.getByRole('button', { name: 'Çıkış yap' });
  await expect(out).toBeVisible();
  const b = await out.boundingBox();
  expect(b.y + b.height).toBeLessThanOrEqual(600);                 // pencerenin içinde
  await out.click();
  await expect(page).toHaveURL(/\/giris|\/$/);
});
