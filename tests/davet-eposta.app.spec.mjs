// Kiracı davet e-postası, uygulama tarafı: e-postalı kiracı eklenince invite-mail istenir; e-postasızda istenmez;
// e-postadaki bağlantı kayıt sayfasını kod, ad ve e-postayla doldurur.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8237;
let server, errors;

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

async function landlord(page) {
  await page.goto(url('/giris/mulk-sahibi'));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await page.goto(url('/giris/mulk-sahibi'));
  await page.getByLabel('E-posta').fill('ev@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
}
const mails = async (page) => ((await db(page)).invokedBodies || []).filter((x) => x.name === 'invite-mail');

test('e-postalı kiracı eklenince davet e-postası istenir; yeniden gönder düğmesi de çalışır', async ({ page }) => {
  await landlord(page);
  await page.goto(url('/uygulama/mulk?pid=p1&sub=ozet'));
  await page.getByRole('button', { name: /Kiracı ekle/ }).first().click();
  await page.getByLabel('Ad soyad').fill('Ali Yeni');
  await page.getByLabel('E-posta').fill('ali@ornek.com');
  await page.getByRole('button', { name: 'Ekle ve davet et' }).click();
  await expect(page.getByText('Kiracını davet et')).toBeVisible();
  await expect.poll(async () => (await mails(page)).length).toBe(1);
  const code = (await db(page)).tables.invites[0].code;
  expect((await mails(page))[0].body).toEqual({ code });
  await page.getByRole('button', { name: 'Davet e-postasını yeniden gönder' }).click();
  await expect.poll(async () => (await mails(page)).length).toBe(2);
});

test('e-postasız kiracıda e-posta istenmez', async ({ page }) => {
  await landlord(page);
  await page.goto(url('/uygulama/mulk?pid=p1&sub=ozet'));
  await page.getByRole('button', { name: /Kiracı ekle/ }).first().click();
  await page.getByLabel('Ad soyad').fill('Veli Telefonlu');
  await page.getByRole('button', { name: 'Ekle ve davet et' }).click();
  await expect(page.getByText('Kiracını davet et')).toBeVisible();
  await page.waitForTimeout(500);
  expect((await mails(page)).length).toBe(0);
  await expect(page.getByRole('button', { name: 'Davet e-postasını yeniden gönder' })).toHaveCount(0);
});

test('e-postadaki bağlantı kayıt sayfasını kod, ad ve e-postayla doldurur', async ({ page }) => {
  await page.goto(url('/kayit/kiraci?kod=ab12cd34&ad=Ali%20Yeni&e=ali%40ornek.com'));
  await expect(page.getByLabel('Ad soyad')).toHaveValue('Ali Yeni');
  await expect(page.getByLabel('E-posta')).toHaveValue('ali@ornek.com');
  await expect(page.getByLabel(/Davet kodu/)).toHaveValue('AB12CD34');
});
