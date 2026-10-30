// Kayıt onayı: onay e-postasındaki bağlantı /dogrula sayfasına iner, oturumu açar ve kişiyi giriş geçişiyle doğrudan
// paneline götürür (giriş ekranına atmaz). Geçersiz ya da süresi dolmuş bağlantıda açıklama ve giriş düğmesi görünür.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8234;
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

test('kayıt onay gerektiriyorsa form bağlantıyı anlatır; bağlantı /dogrula adresine döner', async ({ page }) => {
  await page.goto(url('/kayit/mulk-sahibi'));
  await page.getByLabel('Ad soyad').fill('Yeni Mülk');
  await page.getByLabel('E-posta').fill('dogrula-yeni@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByLabel('Şifre (tekrar)').fill(PW);
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: '1 ay ücretsiz başla' }).click();
  await expect(page.getByText('E-postana bir onay bağlantısı gönderdik. Bağlantıya tıklayınca hesabın açılır ve doğrudan paneline geçersin.')).toBeVisible();
  expect((await db(page)).session).toBeNull();
});

test('onay bağlantısı oturumu açar, giriş geçişini oynatır ve kişiyi kendi paneline götürür', async ({ page }) => {
  await page.goto(url('/dogrula#access_token=tok-ev@ornek.com&refresh_token=r&expires_in=3600&token_type=bearer&type=signup'));
  await expect(page).toHaveURL(/\/uygulama$/);
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  expect(page.url()).not.toContain('access_token');
  expect((await db(page)).session.user.email).toBe('ev@ornek.com');
});

test('süresi dolmuş bağlantı: açıklama ve giriş düğmesi', async ({ page }) => {
  await page.goto(url('/dogrula#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired'));
  await expect(page.getByText('Bağlantı geçersiz').first()).toBeVisible();
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page).toHaveURL(/\/giris$/);
});
