// Telefon (dar ekran) denetimi: sohbet düzeni ekrana sığar, fotoğraf hazırlanır ve tik çıkar.
// "@mobil" etiketli testler hem Pixel 7 (Chromium) hem de CI'daki Safari (WebKit) işinde çalışır; iPhone'a özgü sorunları yakalamak içindir.
import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';
import { watchErrors, makeTestPhotos } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8241;
let server, errors, dir;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); dir = await makeTestPhotos(); });
test.afterAll(() => server && server.close());
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  const d = seed();
  d.tables.messages = Array.from({ length: 30 }, (_, i) => ({ id: 'm' + i, property_id: 'p1', from_role: i % 2 ? 'landlord' : 'tenant', by_user: i % 2 ? ID.landlord : ID.tenant, body: 'Mesaj numarası ' + (i + 1), at: new Date(Date.now() - (40 - i) * 60000).toISOString(), image_path: null }));
  await page.addInitScript((db) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(db)); }, d);
});
test.afterEach(() => { expect(errors).toEqual([]); });
const url = (p) => `http://localhost:${PORT}${p}`;
async function login(page, email, entry) {
  await page.goto(url(entry));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
}

test('mülk sahibi sohbeti telefonda ekrana sığar: şerit ince, kutu ve gönder düğmesi görünür @mobil', async ({ page }) => {
  await login(page, 'ev@ornek.com', '/giris/mulk-sahibi');
  await page.goto(url('/uygulama/mulk?pid=p1&sub=mesaj'));
  const input = page.getByPlaceholder('Mesaj yaz');
  await expect(input).toBeVisible();
  const vw = page.viewportSize().width, vh = page.viewportSize().height;
  const send = await page.getByRole('button', { name: 'Gönder' }).boundingBox();
  expect(send.x + send.width).toBeLessThanOrEqual(vw);                                // taşmaz
  const box = await input.boundingBox();
  expect(box.y + box.height).toBeLessThanOrEqual(vh);                                  // ekranın içinde
  const tab = await page.getByRole('button', { name: 'Mesajlar', exact: true }).first().boundingBox();
  expect(tab.height).toBeLessThan(80);                                                 // sekme şeridi dikeyde uzamaz
  await expect(page.getByText('Mesaj numarası 30', { exact: true })).toBeInViewport();  // son mesajdan açılır
});

test('kiracı telefonda büyük fotoğraf seçer: hazırlanır, tik çıkar, gönderilir; bozuk dosyada uyarı çıkar @mobil', async ({ page }) => {
  await login(page, 'kiraci@ornek.com', '/giris/kiraci');
  await page.goto(url('/uygulama/mesajlar'));
  const pick = async (f) => { const fc = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Fotoğraf ekle' }).click(); await (await fc).setFiles(join(dir, f)); };
  await pick('bozuk.png');
  await expect(page.getByText('Fotoğraf işlenemedi').first()).toBeVisible({ timeout: 20000 });
  await pick('buyuk.png');
  await expect(page.getByLabel('Fotoğraf hazır')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')))).tables.messages.filter((m) => m.image_path).length).toBe(1);
});
