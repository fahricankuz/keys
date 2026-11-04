// Yönetici paneli → Abonelikler → "Paket ver": mülk adedi (Başlangıç/Profesyonel 1-9) ve Kurumsal için sektör sorulur;
// eksikse uyarır, doluysa kaydeder, listede görünür. Sunucu kuralları gerçek Postgres'te ayrıca sınanır (admin.sql.spec.mjs).
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8243;
let server, errors;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  await page.addInitScript((d) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, seed());
});
test.afterEach(() => { expect(errors).toEqual([]); });
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));

test('paket ver: mülk adedi sorulur; Kurumsal için sektör de zorunlu; kayıt ve liste', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/giris/yonetici`);
  await page.getByLabel('E-posta').fill('admin@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('button', { name: 'Hesaplar', exact: true }).first().click();
  await page.getByRole('button', { name: /^Ayşe Mülk/ }).click();                    // satır açılınca paket işlemleri görünür
  await page.getByRole('button', { name: 'Paket ver' }).first().click();

  // Başlangıç: adet alanı var, sektör yok; 9'dan büyük adet reddedilir.
  await page.getByRole('button', { name: 'Başlangıç', exact: true }).click();
  await expect(page.getByLabel('Mülk adedi (1-9)')).toBeVisible();
  await expect(page.getByText('Sektör', { exact: true })).toHaveCount(0);
  await page.getByLabel('Gerekçe').fill('deneme');
  await page.getByLabel('Mülk adedi (1-9)').fill('');
  await page.getByRole('button', { name: 'Paketi ver' }).click();
  await expect(page.getByText('Mülk adedini yaz.')).toBeVisible();

  // Kurumsal: adet ve sektör sorulur; sektörsüz gönderilemez.
  await page.getByRole('button', { name: 'Kurumsal', exact: true }).click();
  await expect(page.getByLabel('Mülk / birim adedi')).toBeVisible();
  await expect(page.getByText('Sektör', { exact: true })).toBeVisible();
  await page.getByLabel('Mülk / birim adedi').fill('14');
  await page.getByRole('button', { name: 'Paketi ver' }).click();
  await expect(page.getByText('Sektörü seç.')).toBeVisible();
  await page.getByRole('button', { name: 'Depo ve lojistik' }).click();
  await page.getByRole('button', { name: 'Paketi ver' }).click();
  await expect(page.getByText('Paketteki adet')).toBeVisible();
  await expect(page.getByText(/14 mülk · Sektör: Depo ve lojistik/)).toBeVisible();
  const s = (await db(page)).tables.subscriptions.find((x) => x.store === 'admin');
  expect(s).toMatchObject({ product_id: 'kurumsal', units: 14, sector: 'depo' });
});
