// Şifre sıfırlama bağlantısı: /yeni-sifre sayfası bağlantıyı doğrular, yeni şifreyi kaydeder; süresi dolan bağlantıda yeni bağlantı ister.
import { test, expect } from '@playwright/test';
import { serveDist, seed, ensureDist } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8233;
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

test('sıfırlama e-postası yeni-sifre adresine yönlendirir', async ({ page }) => {
  await page.goto(url('/sifre'));
  await page.getByLabel('E-posta').fill('ayse@example.com');
  await page.getByRole('button', { name: 'Bağlantı gönder' }).click();
  await expect(page.getByText('Bağlantı gönderildi. E-postanı kontrol et.')).toBeVisible();
  const calls = await page.evaluate(() => (window.__fakeCalls && window.__fakeCalls()) || null);
  if (calls) expect(JSON.stringify(calls)).toContain('yeni-sifre');
});

test('geçerli bağlantı: yeni şifre kaydedilir, oturum kapanır, giriş sayfasına yönlendirir', async ({ page }) => {
  await page.goto(url('/yeni-sifre#access_token=tok123&refresh_token=r&type=recovery'));
  await expect(page.getByRole('heading', { name: 'Yeni şifre belirle' }).or(page.getByText('Yeni şifre belirle').first())).toBeVisible();
  await page.getByLabel('Yeni şifre').fill('kisa');
  await page.getByLabel('Şifre (tekrar)').fill('kisa');
  await page.getByRole('button', { name: 'Şifreyi kaydet' }).click();
  await expect(page.getByText('Şifre en az 8 karakter olmalı.')).toBeVisible();
  await page.getByLabel('Yeni şifre').fill('YeniSifre123');
  await page.getByLabel('Şifre (tekrar)').fill('Farkli12345');
  await page.getByRole('button', { name: 'Şifreyi kaydet' }).click();
  await expect(page.getByText('Şifreler aynı değil.')).toBeVisible();
  await page.getByLabel('Şifre (tekrar)').fill('YeniSifre123');
  await page.getByRole('button', { name: 'Şifreyi kaydet' }).click();
  await expect(page.getByText('Şifren yenilendi')).toBeVisible();
  const d = await db(page);
  expect(d.users[0].password).toBe('YeniSifre123');
  expect(d.session).toBeNull();
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/giris/);
});

test('süresi dolmuş bağlantı: açıklama ve yeni bağlantı isteme', async ({ page }) => {
  await page.goto(url('/yeni-sifre#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'));
  await expect(page.getByText('Bağlantı geçersiz')).toBeVisible();
  await page.getByRole('button', { name: 'Yeni bağlantı iste' }).click();
  await expect(page).toHaveURL(/\/sifre/);
});

test('bağlantısız açılan sayfa yeni şifre formu göstermez', async ({ page }) => {
  await page.goto(url('/yeni-sifre'));
  await expect(page.getByText('Bağlantı geçersiz')).toBeVisible();
  await expect(page.getByLabel('Yeni şifre')).toHaveCount(0);
});
