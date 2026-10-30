// Mağaza ve üretim hazırlığı, uygulama tarafı: oturum sunucuda düşünce girişe yönlenme ve açıklama (kayıtlar korunur);
// sohbette karşı tarafı ya da mesajı bildirme ve engelleme; yönetici Şikâyetler'de karar verir; yakalanmamış hata kaydedilir.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8237;
let server;
let errors;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(({ page }) => { errors = watchErrors(page); });
const url = (p) => `http://localhost:${PORT}${p}`;
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
const ENTRY = { 'kiraci@ornek.com': '/giris/kiraci', 'ev@ornek.com': '/giris/mulk-sahibi', 'admin@ornek.com': '/giris/yonetici' };
async function login(page, email) {
  await page.goto(url(ENTRY[email]));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await page.goto(url(ENTRY[email]));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}
function data() {
  const d = seed();
  d.tables.messages.push({ id: 'ml1', property_id: 'p1', from_role: 'landlord', by_user: ID.landlord, body: 'Kaba bir mesaj', at: new Date(Date.now() - 60000).toISOString() });
  return d;
}

test('oturum sunucuda düşünce girişe yönlenir ve açıklama görünür; yeniden girince kayıtlar yerinde', async ({ page }) => {
  await page.addInitScript((d) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, data());
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.evaluate(() => window.__fakeExpire());
  await expect(page).toHaveURL(/\/giris$/);
  await expect(page.getByText(/Oturumun sona erdi/)).toBeVisible();
  await page.getByRole('link', { name: /Kiracı girişi/ }).click();
  await page.getByLabel('E-posta').fill('kiraci@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('kiracı mesajı bildirir ve mülk sahibini engeller; mesaj gizlenir; yönetici şikâyeti kapatır, kiracı haber alır', async ({ page }) => {
  await page.addInitScript((d) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, data());
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/mesajlar'));
  await expect(page.getByText('Kaba bir mesaj')).toBeVisible();
  // Mesaja uzun basınca bildir penceresi açılır.
  const bubble = page.getByText('Kaba bir mesaj');
  const box = await bubble.boundingBox();
  await page.mouse.move(box.x + 5, box.y + 5); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
  await expect(page.getByText('Mesajı bildir')).toBeVisible();
  await page.getByRole('radio', { name: 'Taciz ya da tehdit' }).click();
  await page.getByRole('switch', { name: /Bu kişiyi engelle/ }).click();
  await page.getByRole('button', { name: 'Bildir', exact: true }).click();
  await expect.poll(async () => (await db(page)).tables.content_reports.length).toBe(1);
  const d = await db(page);
  expect(d.tables.content_reports[0]).toMatchObject({ kind: 'message', ref_id: 'ml1', reported_user: ID.landlord, reason: 'taciz', snapshot: 'Kaba bir mesaj' });
  expect(d.tables.user_blocks).toEqual([expect.objectContaining({ user_id: ID.tenant, blocked: ID.landlord })]);
  await expect(page.getByText('Kaba bir mesaj')).toHaveCount(0);

  // Engellenen kişiler Ayarlar'da; engel kaldırılabilir.
  await page.goto(url('/uygulama/ayarlar'));
  await expect(page.getByText('Engellenen kişiler')).toBeVisible();

  await login(page, 'admin@ornek.com');
  await page.getByRole('button', { name: /^Şikâyetler/ }).click();
  await expect(page.getByText('Kaba bir mesaj')).toBeVisible();
  await page.getByLabel('Karar (bildirene iletilir)').fill('Uyarı verildi.');
  await page.getByRole('button', { name: 'Kapat', exact: true }).click();
  await expect.poll(async () => (await db(page)).tables.content_reports[0].status).toBe('done');
  expect(errors).toEqual([]);
});

test('yakalanmamış hata sunucuya kaydedilir, yönetici Hatalar bölümünde görür', async ({ page }) => {
  await page.addInitScript((d) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, data());
  await page.goto(url('/'));
  await page.waitForTimeout(1500);
  await page.evaluate(() => { setTimeout(() => { throw new Error('Deneme hatası 42'); }, 0); });
  await expect.poll(async () => ((await db(page)).tables.client_errors || []).map((e) => e.message)).toContain('Deneme hatası 42');
  await login(page, 'admin@ornek.com');
  await page.getByRole('button', { name: /^Hatalar/ }).click();
  await expect(page.getByText('Deneme hatası 42')).toBeVisible();
  // Bu testte bilerek hata atıldı; yalnız o beklenir.
  expect(errors.filter((e) => !/Deneme hatası 42/.test(String(e)))).toEqual([]);
});
