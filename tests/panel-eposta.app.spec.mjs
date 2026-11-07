// Yönetici paneli → Talepler: "E-posta gönder" panelde pencere açar (alıcı ve konu dolu), gönderilince talebin altında
// "Gönderildi" görünür; Gmail ve kopyala yedekleri; Hesaplar'da da aynı pencere.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8258;
let server, errors;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  const d = seed();
  d.tables.support_requests = [{ id: '11111111-2222-4333-8444-555555555555', user_id: null, kind: 'genel', units: null, name: 'Selin Yılmaz', email: 'selin@ornek.com',
    phone: '', message: 'Excel aktarımında yardım', company: '', source: 'web', details: {}, status: 'open', created_at: new Date().toISOString() }];
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, d);
});
test.afterEach(() => { expect(errors).toEqual([]); });
const url = (p) => `http://localhost:${PORT}${p}`;

test('talebe panelden e-posta: pencere dolu açılır, gönderilir, talebin altında görünür', async ({ page }) => {
  await page.goto(url('/giris/yonetici'));
  await page.getByLabel('E-posta').fill('admin@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await page.getByRole('button', { name: 'Talepler' }).first().click();
  await page.getByRole('button', { name: 'E-posta gönder' }).click();
  const box = page.getByLabel('E-posta penceresi');
  await expect(box.getByLabel('Alıcı')).toHaveValue('selin@ornek.com');
  await expect(box.getByLabel('Konu')).toHaveValue('anahtar iletişim talebin');
  await expect(box.getByLabel('Mesaj')).toHaveValue(/^Merhaba Selin,/);
  await expect(box.getByRole('button', { name: 'Gmail’de aç' })).toBeVisible();
  await expect(box.getByRole('button', { name: 'Adresi kopyala' })).toBeVisible();
  await box.getByLabel('Mesaj').fill('Merhaba Selin,\n\nYarın arayalım.');
  await box.getByRole('button', { name: 'Gönder', exact: true }).click();
  await expect(page.getByText('E-posta gönderildi. Yanıtlar info@anahtar.io adresine gelir.')).toBeVisible();
  await expect(page.getByText(/✓ Gönderildi .*: anahtar iletişim talebin/)).toBeVisible();
  await expect(box.getByRole('button', { name: 'Gönder', exact: true })).toBeDisabled();          // ikinci kez gitmez
  const t = await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')).tables);
  expect(t.mail_outbox).toEqual([expect.objectContaining({ kind: 'admin_message', to_email: 'selin@ornek.com', data: { subject: 'anahtar iletişim talebin', body: 'Merhaba Selin,\n\nYarın arayalım.' } })]);
  expect(t.admin_emails[0]).toMatchObject({ request_id: '11111111-2222-4333-8444-555555555555' });
});
