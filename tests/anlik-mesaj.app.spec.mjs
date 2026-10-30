// Sohbet: son mesajdan açılır, mesaj kutusu sabit, liste kaydırılır; karşı tarafın mesajı yenilemeden düşer;
// kopan bağlantı yeniden kurulur ve kaçan mesajlar tamamlanır (canlı kanal kopukken yedek sorgu).
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8238;
let server, errors;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
const row = (i, from = i % 2 ? 'landlord' : 'tenant', extra = {}) => Object.assign({
  id: 'm' + i, property_id: 'p1', from_role: from, by_user: from === 'tenant' ? ID.tenant : ID.landlord, body: 'Mesaj numarası ' + i,
  at: new Date(Date.now() - (100 - i) * 60000).toISOString(), image_path: null }, extra);
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  const d = seed();
  d.tables.messages = Array.from({ length: 40 }, (_, i) => row(i + 1));
  await page.addInitScript((db) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(db)); }, d);
});
test.afterEach(() => { expect(errors).toEqual([]); });
const url = (p) => `http://localhost:${PORT}${p}`;
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));

async function open(page) {
  await page.goto(url('/giris/kiraci'));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await page.goto(url('/giris/kiraci'));
  await page.getByLabel('E-posta').fill('kiraci@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/mesajlar'));
  await expect(page.getByPlaceholder('Mesaj yaz')).toBeVisible();
}
const emit = (page, r) => page.evaluate((x) => window.__fakeRealtime.emit('messages', 'INSERT', x), r);
const status = (page, s) => page.evaluate((x) => window.__fakeRealtime.status(x), s);

test('sohbet son mesajdan açılır; mesaj kutusu sabit kalır ve liste kaydırılır', async ({ page }) => {
  await open(page);
  await expect(page.getByText('Mesaj numarası 40', { exact: true })).toBeInViewport();
  await expect(page.getByText('Mesaj numarası 1', { exact: true })).not.toBeInViewport();
  const before = await page.getByPlaceholder('Mesaj yaz').boundingBox();
  expect(before.y + before.height).toBeLessThanOrEqual(960);
  // Yukarı kaydırınca eski mesaj görünür, kutu yerinde kalır.
  await page.getByText('Mesaj numarası 40', { exact: true }).hover();
  await page.mouse.wheel(0, -6000);
  await expect(page.getByText('Mesaj numarası 1', { exact: true })).toBeInViewport();
  const after = await page.getByPlaceholder('Mesaj yaz').boundingBox();
  expect(Math.round(after.y)).toBe(Math.round(before.y));
});

test('karşı tarafın mesajı yenilemeden düşer ve liste aşağı iner; aynı olay iki kez gelirse tek mesaj olur', async ({ page }) => {
  await open(page);
  const r = row(41, 'landlord', { body: 'Anında gelen mesaj' });
  await emit(page, r);
  await expect(page.getByText('Anında gelen mesaj', { exact: true })).toBeInViewport();
  await emit(page, r);
  await expect(page.getByText('Anında gelen mesaj', { exact: true })).toHaveCount(1);
  // Eşitleme bu mesajı yeniden yazmaya çalışmaz (sunucuya yalnız kendi mesajlarımız gider).
  await page.waitForTimeout(800);
  expect((await db(page)).tables.messages.filter((m) => m.id === 'm41').length).toBe(0);
});

test('yukarıda okurken gelen mesaj sırayı bozmaz; "yeni mesaj" düğmesi listeyi aşağı indirir', async ({ page }) => {
  await open(page);
  await page.getByText('Mesaj numarası 40', { exact: true }).hover();
  await page.mouse.wheel(0, -6000);
  await expect(page.getByText('Mesaj numarası 1', { exact: true })).toBeInViewport();
  await emit(page, row(41, 'landlord', { body: 'Yeni mesaj geldi' }));
  const jump = page.getByRole('button', { name: /↓ 1 yeni mesaj/ });
  await expect(jump).toBeVisible();
  await expect(page.getByText('Mesaj numarası 1', { exact: true })).toBeInViewport();
  await jump.click();
  await expect(page.getByText('Yeni mesaj geldi', { exact: true })).toBeInViewport();
  await expect(jump).toHaveCount(0);
});

test('bağlantı rozeti; kanal kopunca kaçan mesaj yedek sorguyla ve yeniden bağlanınca tamamlanır', async ({ page }) => {
  await open(page);
  await expect(page.getByText('Canlı', { exact: true })).toBeVisible();
  await status(page, 'CHANNEL_ERROR');
  await expect(page.getByText('Bağlanıyor…', { exact: true })).toBeVisible();
  // Kanal kopukken sunucuya (sahte veritabanına) düşen mesaj yedek sorguyla gelir.
  await page.evaluate((r) => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.tables.messages.push(r); localStorage.setItem('__fakedb', JSON.stringify(d)); }, row(41, 'landlord', { body: 'Kopukken gelen mesaj' }));
  await expect(page.getByText('Kopukken gelen mesaj', { exact: true })).toBeInViewport({ timeout: 15000 });
  // Yeniden bağlanınca rozet döner.
  await expect(page.getByText('Canlı', { exact: true })).toBeVisible({ timeout: 15000 });
});

test('kanal "canlı" görünse bile olay gelmezse (Realtime kapalı) sohbet açıkken yedek sorgu mesajı 4-5 sn içinde getirir', async ({ page }) => {
  await open(page);
  await expect(page.getByText('Canlı', { exact: true })).toBeVisible();
  // Gerçek olay yok; yalnızca sunucuya (sahte veritabanına) düşer.
  await page.evaluate((r) => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.tables.messages.push(r); localStorage.setItem('__fakedb', JSON.stringify(d)); }, row(41, 'landlord', { body: 'Olay gelmeyen mesaj' }));
  await expect(page.getByText('Olay gelmeyen mesaj', { exact: true })).toBeInViewport({ timeout: 12000 });
});

test('bildirim de olay gelmese yedek sorguyla düşer', async ({ page }) => {
  await open(page);
  await page.evaluate((id) => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.tables.notifications.push({ id: 9001, user_id: id, property_id: 'p1', title: 'Yedekten gelen bildirim', body: 'Test', url: '#/kiraci/mesajlar', created_at: new Date().toISOString(), read_at: null }); localStorage.setItem('__fakedb', JSON.stringify(d)); }, ID.tenant);
  await expect(page.getByText('Yedekten gelen bildirim').first()).toBeVisible({ timeout: 12000 });
});
