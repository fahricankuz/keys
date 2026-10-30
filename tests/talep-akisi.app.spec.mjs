// Talep akışı: kiracı ve mülk sahibi usta teklifi ekler (usta seçimi mülk sahibinin), talepten "iletişime geç" ile
// talebe bağlı mesaj karşı tarafa düşer, mesajdaki talep kartı talebi açar, kiracı fatura ekler.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8234;
let server, errors;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  const d = seed();
  d.tables.requests = [{ id: 'r1', property_id: 'p1', cat: 'Arıza', title: 'Kombi basıncı düşüyor', descr: '', urgency: 'Acil', status: 1, cost: 'Belirlenmedi', cost_ok: false, decision: null, req_date: new Date().toISOString().slice(0, 10), photos: 0, shots: [], log: [], quotes: [{ id: 'q0', vendor: 'Servis Mehmet', amount: 2200, phone: '', note: '2 gün', chosen: false, by: 'landlord' }], invoice: null }];
  await page.addInitScript((db) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(db)); }, d);
});
test.afterEach(() => { expect(errors).toEqual([]); });

const url = (p) => `http://localhost:${PORT}${p}`;
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
async function login(page, email, path) {
  await page.goto(url(path));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await page.goto(url(path));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

test('kiracı teklif ve fatura ekler, mülk sahibiyle iletişime geçer; kart mülk sahibinin mesajlarına düşer', async ({ page }) => {
  await login(page, 'kiraci@ornek.com', '/giris/kiraci');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/talepler'));
  await page.getByText('Kombi basıncı düşüyor').first().click();
  // Mülk sahibinin teklifi görünür ama kiracı seçemez.
  await expect(page.getByText('Servis Mehmet')).toBeVisible();
  await expect(page.getByText('Mülk sahibi ekledi')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Seç', exact: true })).toHaveCount(0);
  // Kiracı teklif ekler.
  await page.getByRole('button', { name: 'Teklif', exact: true }).click();
  await page.getByLabel('Usta ya da firma').fill('Usta Ahmet');
  await page.getByLabel('Tutar (₺)').fill('1800');
  await page.getByRole('button', { name: 'Ekle' }).click();
  await page.getByText('Kombi basıncı düşüyor').first().click();
  await expect(page.getByText('Usta Ahmet', { exact: true })).toBeVisible();
  await expect(page.getByText('Kiracı ekledi')).toBeVisible();
  await expect.poll(async () => (await db(page)).tables.requests[0].quotes.map((x) => [x.vendor, x.by, x.chosen])).toEqual([['Servis Mehmet', 'landlord', false], ['Usta Ahmet', 'tenant', false]]);
  // Kiracı fatura ekler (gider defteri seçeneği yok).
  await page.getByRole('button', { name: 'Fatura ekle' }).click();
  await expect(page.getByText('Gider defterine mülk sahibi ya da emlakçı ekler.')).toBeVisible();
  await page.getByLabel('Tutar (₺)').fill('1850');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect.poll(async () => (await db(page)).tables.requests[0].invoice?.amount).toBe(1850);
  await page.getByText('Kombi basıncı düşüyor').first().click();
  // İletişime geç → Mesajlar; talep kartı ve talep sistem mesajları talebe bağlı.
  await page.getByRole('button', { name: 'Mülk sahibiyle iletişime geç' }).click();
  await expect(page).toHaveURL(/mesajlar/);
  await expect(page.getByText('Bu talep hakkında yazıyorum.')).toBeVisible();
  await expect.poll(async () => (await db(page)).tables.messages.filter((m) => m.req_id === 'r1').length).toBeGreaterThanOrEqual(2);
  const user = (await db(page)).tables.messages.filter((m) => m.from_role === 'tenant');
  expect(user.map((m) => m.req_id)).toEqual(['r1']);
  // Aynı talep için ikinci basış yeni kart açmaz.
  await page.getByRole('button', { name: /Talebi aç: Kombi/ }).first().click();
  await expect(page.getByRole('button', { name: 'Mülk sahibiyle iletişime geç' })).toBeVisible();
  await page.getByRole('button', { name: 'Mülk sahibiyle iletişime geç' }).click();
  await expect(page).toHaveURL(/mesajlar/);
  expect((await db(page)).tables.messages.filter((m) => m.from_role === 'tenant').length).toBe(1);
});

test('mülk sahibi mesajlardaki talep kartından talebe gider, teklifi seçer, kiracıyla iletişime geçer', async ({ page }) => {
  await page.addInitScript(() => {
    const d = JSON.parse(localStorage.getItem('__fakedb'));
    if (!d.tables.messages.length) d.tables.messages = [{ id: 'm1', property_id: 'p1', from_role: 'tenant', by_user: '00000000-0000-4000-8000-00000000000b', body: 'Bu talep hakkında yazıyorum.', at: new Date().toISOString(), req_id: 'r1' }];
    localStorage.setItem('__fakedb', JSON.stringify(d));
  });
  await login(page, 'ev@ornek.com', '/giris/mulk-sahibi');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/mulk?pid=p1&sub=mesaj'));
  const card = page.getByRole('button', { name: /Talebi aç: Kombi/ });
  await expect(card).toBeVisible();
  await expect(card).toContainText('Kombi basıncı düşüyor');
  await card.click();
  await expect(page.getByRole('button', { name: 'Kiracıyla iletişime geç' })).toBeVisible();
  await page.getByRole('button', { name: 'Seç', exact: true }).click();
  await expect.poll(async () => (await db(page)).tables.requests[0].quotes[0].chosen).toBe(true);
  await expect.poll(async () => (await db(page)).tables.requests[0].status).toBe(2);
  // Seçim mesajı da talebe bağlıdır.
  await expect.poll(async () => (await db(page)).tables.messages.filter((m) => m.from_role === 'system' && m.req_id === 'r1').length).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'Kiracıyla iletişime geç' }).click();
  await expect(page).toHaveURL(/sub=mesaj|mesaj/);
});
