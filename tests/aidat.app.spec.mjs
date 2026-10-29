// Aidat (kurumsal yol planı Faz 1), uygulama üzerinde uçtan uca: kira ve aidat ayrı kalem. Kiracı aidat dekontu
// yükler, yönetici denetimde "Aidat" olarak görür ve onaylar, mülk sahibi aidatı onaylar; aidatı mülk sahibi
// ödüyorsa dekontsuz kaydeder. Sunucu kuralları gerçek Postgres'te ayrıca sınanır (aidat.sql.spec.mjs).
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors, PNG } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8208;
let server;
let errors;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await ensureDist(DIST);
  server = await serveDist(DIST, PORT);
});
test.afterAll(() => server && server.close());

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const now = new Date();
const KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(now).slice(0, 7);   // tarayıcının (İstanbul) ayı
const thisMonth = MONTHS[Number(KEY.slice(5, 7)) - 1] + ' ' + KEY.slice(0, 4);

function seedWith(payer) {
  const db = seed();
  Object.assign(db.tables.properties[0], { aidat: 2000, aidat_payer: payer });
  return db;
}

test.beforeEach(async ({ page }) => { errors = watchErrors(page); });
test.afterEach(() => { expect(errors).toEqual([]); });

const url = p => `http://localhost:${PORT}${p}`;
const db = page => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
const ENTRY = { 'kiraci@ornek.com': '/giris/kiraci', 'ev@ornek.com': '/giris/mulk-sahibi', 'admin@ornek.com': '/giris/yonetici' };
async function login(page, email) {
  await page.goto(url(ENTRY[email]));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await page.goto(url(ENTRY[email]));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

test('kiracı aidat dekontu yükler; yönetici "Aidat" olarak onaylar; mülk sahibi aidatı ayrı onaylar, kira etkilenmez', async ({ page }) => {
  await page.addInitScript(d => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, seedWith('Kiracı'));
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/odemeler'));
  await expect(page.getByText('Aidatı sen ödüyorsun. Dekontu yükle; mülk sahibin görsün.')).toBeVisible();
  await page.getByRole('button', { name: thisMonth + ' aidat dekontunu yükle' }).click();
  await expect(page.getByText(thisMonth + ' aidatı')).toBeVisible();
  await expect(page.getByText('₺2.000').first()).toBeVisible();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Dosya seç' }).click();
  await (await chooser).setFiles(PNG);
  await expect(page.getByText('dekont.png')).toBeVisible();
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect.poll(async () => (await db(page)).tables.reviews.length, { timeout: 15000 }).toBe(1);   // eşitleme gecikmeli çalışır
  let d = await db(page);
  expect(d.tables.payments.map(p => [p.kind, p.month, p.status, p.amount])).toEqual([['aidat', KEY, 'review', 2000]]);
  expect(d.tables.reviews[0].ref_id).toBe('aidat:' + KEY);

  await login(page, 'admin@ornek.com');
  await page.getByRole('button', { name: /^Denetim/ }).click();
  await expect(page.getByText('· Aidat').first()).toBeVisible();
  await page.getByRole('button', { name: 'Onayla', exact: true }).click();
  await expect(page.getByText('Bekleyen yükleme yok')).toBeVisible();

  await login(page, 'ev@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/mulk?pid=p1&sub=odeme'));
  await expect(page.getByText('Aidatı kiracı öder. Dekontu yükleyince onaylarsın.')).toBeVisible();
  await page.getByText(thisMonth, { exact: true }).last().click();
  await expect(page.getByText(thisMonth + ' aidat dekontu')).toBeVisible();
  await page.getByRole('button', { name: 'Onayla', exact: true }).last().click();
  await expect.poll(async () => (await db(page)).tables.payments.find(p => p.kind === 'aidat').status).toBe('approved');
  d = await db(page);
  expect(d.tables.payments.filter(p => p.kind === 'kira')).toEqual([]);   // kira kaydı oluşmadı
});

test('aidatı mülk sahibi ödüyorsa dekontsuz kaydeder; kiracı yalnızca bilgi görür', async ({ page }) => {
  await page.addInitScript(d => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, seedWith('Mülk sahibi'));
  await login(page, 'ev@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/mulk?pid=p1&sub=odeme'));
  await page.getByRole('button', { name: thisMonth + ' aidatını kaydet' }).click();
  await expect(page.getByText('Dekont (isteğe bağlı)')).toBeVisible();
  await page.getByRole('button', { name: 'Kaydet', exact: true }).last().click();
  await expect.poll(async () => ((await db(page)).tables.payments.find(p => p.kind === 'aidat') || {}).status).toBe('approved');
  expect((await db(page)).tables.payments.find(p => p.kind === 'aidat').method).toBe('havale');
  expect((await db(page)).tables.reviews).toEqual([]);                     // mülk sahibinin kendi kaydı denetime gitmez

  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/odemeler'));
  await expect(page.getByText('Aidatı mülk sahibi öder.')).toBeVisible();
  await expect(page.getByRole('button', { name: /aidat dekontunu yükle/ })).toHaveCount(0);
});
