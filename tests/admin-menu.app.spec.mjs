// Yönetici paneli telefonda: bölümler kaydırılan şerit yerine, basınca açılan menüdür (seçince kapanır).
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
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

test('yönetici paneli telefonda açılır menü: basınca bölümler açılır, seçince kapanır ve bölüm değişir @mobil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`http://localhost:${PORT}/giris/yonetici`);
  await page.getByLabel('E-posta').fill('admin@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const menuBtn = page.getByRole('button', { name: /^Bölümler: Genel bakış/ });
  await expect(menuBtn).toBeVisible();
  // Kapalıyken diğer bölümler listelenmez (kaydırılan şerit yok).
  await expect(page.getByRole('button', { name: 'Abonelikler', exact: true })).toHaveCount(0);
  await menuBtn.click();
  await expect(page.getByRole('button', { name: 'Abonelikler', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kurumlar', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Abonelikler', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Bölümler: Abonelikler/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kurumlar', exact: true })).toHaveCount(0);   // seçince menü kapandı
});
