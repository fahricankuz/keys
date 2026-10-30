// Hoş geldin e-postası, uygulama tarafı: ilk girişte welcome fonksiyonu bir kez istenir (sonraki girişlerde istenmez);
// mülk sahibinin satın alma sayfasında seçtiği paket kayıtta hesap bilgisine yazılır (onay başka cihazda yapılsa da doğru paket).
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8235;
let server;
let errors;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  await page.addInitScript((d) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, seed());
});
test.afterEach(() => { expect(errors).toEqual([]); });
const url = (p) => `http://localhost:${PORT}${p}`;
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
const welcomes = async (page) => ((await db(page)).invoked || []).filter((x) => x === 'welcome').length;

async function login(page, email, entry) {
  await page.goto(url(entry));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await page.goto(url(entry));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
}

test('ilk girişte hoş geldin e-postası bir kez istenir, sonraki girişte istenmez', async ({ page }) => {
  await login(page, 'kiraci@ornek.com', '/giris/kiraci');
  await expect.poll(() => welcomes(page)).toBe(1);
  await login(page, 'kiraci@ornek.com', '/giris/kiraci');
  await page.waitForTimeout(500);
  expect(await welcomes(page)).toBe(1);
});

test('mülk sahibinin seçtiği paket kayıtta hesap bilgisine yazılır', async ({ page }) => {
  // Satın alma sayfasındaki seçim (bkz. paketler.spec): sayfa açılmadan cihazda bekliyor.
  await page.addInitScript(() => localStorage.setItem('anahtar-paket-secimi', JSON.stringify({ plan: 'bes', units: 2, yearly: false })));
  await page.goto(url('/kayit/mulk-sahibi'));
  await page.getByLabel('Ad soyad').fill('Yeni Mülk');
  await page.getByLabel('E-posta').fill('yeni@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByLabel('Şifre (tekrar)').fill(PW);
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: '1 ay ücretsiz başla' }).click();
  await expect(page).toHaveURL(/\/uygulama/);
  const d = await db(page);
  expect(d.users.find((u) => u.email === 'yeni@ornek.com').meta).toMatchObject({ role: 'landlord', plan: 'bes' });
  await expect.poll(() => welcomes(page)).toBe(1);
});
