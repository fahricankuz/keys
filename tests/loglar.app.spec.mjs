// Uygulama logları, ekran tarafı: yakalanan hata hata kaydına düşer; yönetici sunucu kayıtlarını görür, ayrıntısını açar, temizler.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8247;
let server;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
const url = (p) => `http://localhost:${PORT}${p}`;
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));

async function adminLogin(page) {
  await page.goto(url('/giris/yonetici'));
  await page.getByLabel('E-posta').fill('admin@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

test('yönetici sunucu kayıtlarını gruplanmış görür, ayrıntıyı açar, temizleyince ikisi de boşalır', async ({ page }) => {
  const d = seed();
  const at = new Date().toISOString();
  d.tables.function_logs = [
    { id: 1, at, fn: 'mail-send', level: 'error', message: 'e-posta gönderilemedi', detail: 'SMTP 535 ayrıntısı' },
    { id: 2, at, fn: 'mail-send', level: 'error', message: 'e-posta gönderilemedi', detail: 'SMTP 535 ayrıntısı' },
    { id: 3, at, fn: 'billing', level: 'warn', message: 'yavaş yanıt', detail: '' }
  ];
  d.tables.client_errors = [{ id: 1, at, user_id: null, route: '/', message: 'Eşitleme hatası: deneme', stack: '', kind: 'caught', platform: 'web', version: '1', agent: '' }];
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, d);
  await adminLogin(page);
  await page.getByRole('button', { name: /^Hatalar/ }).click();
  await expect(page.getByText('Eşitleme hatası: deneme')).toBeVisible();
  await expect(page.getByText('Sunucu kayıtları')).toBeVisible();
  const row = page.getByText('mail-send: e-posta gönderilemedi');
  await expect(row).toBeVisible();
  await expect(page.getByText('2 kez')).toBeVisible();
  await expect(page.getByText('SMTP 535 ayrıntısı')).toHaveCount(0);
  await row.click();
  await expect(page.getByText('SMTP 535 ayrıntısı')).toBeVisible();
  page.once('dialog', (dg) => dg.accept());
  await page.getByRole('button', { name: 'Kayıtları temizle' }).click();
  await expect(page.getByText('Sunucu kaydı yok.')).toBeVisible();
  await expect(page.getByText('Hata kaydı yok.')).toBeVisible();
  const after = await db(page);
  expect(after.tables.function_logs).toEqual([]);
  expect(after.tables.client_errors).toEqual([]);
});

async function tenantWithMessage(page) {
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, seed());
  await page.goto(url('/giris/kiraci'));
  await page.getByLabel('E-posta').fill('kiraci@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/mesajlar'));
}
async function send(page, text) {
  const box = page.getByPlaceholder(/mesaj/i).first();
  await box.fill(text);
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect(page.getByText(text).first()).toBeVisible();
}

test('sunucu yazmayı reddedince eşitleme hatası "caught" türüyle kaydedilir; kullanıcı "Kaydedilemedi" uyarısı görür, hata ekranı görmez', async ({ page }) => {
  await tenantWithMessage(page);
  await page.evaluate(() => localStorage.setItem('__fakefail', '3'));
  await send(page, 'Reddedilecek mesaj');
  await expect.poll(async () => ((await db(page)).tables.client_errors || []).filter((e) => e.kind === 'caught').map((e) => e.message), { timeout: 15_000 })
    .toContainEqual(expect.stringContaining('Eşitleme hatası: Sahte sunucu reddi'));
  await expect(page.getByText('Bir şeyler ters gitti')).toHaveCount(0);
  await expect(page.getByText('Kaydedilemedi').first()).toBeVisible();
});

test('ağ kopması gürültü sayılır: hata kaydına yazılmaz', async ({ page }) => {
  await tenantWithMessage(page);
  await page.evaluate(() => localStorage.setItem('__fakefail', '1'));
  await send(page, 'Ağsız mesaj');
  await page.waitForTimeout(3000);
  expect(((await db(page)).tables.client_errors || []).filter((e) => e.kind === 'caught')).toEqual([]);
});
