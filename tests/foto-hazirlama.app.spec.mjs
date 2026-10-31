// Sohbette fotoğraf: büyük (telefon boyutu) fotoğraf otomatik küçültülür, hazır olunca tik çıkar ve gönderilir;
// işlenemeyen dosyada açık bir uyarı çıkar (eskiden sessizce hiçbir şey olmuyordu).
import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors, makeTestPhotos } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8240;
let server, errors, dir;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  test.setTimeout(300_000);
  await ensureDist(DIST); server = await serveDist(DIST, PORT);
  dir = await makeTestPhotos();
});
test.afterAll(() => server && server.close());
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  await page.addInitScript((d) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, seed());
});
test.afterEach(() => { expect(errors).toEqual([]); });
const url = (p) => `http://localhost:${PORT}${p}`;
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));

async function open(page) {
  await page.goto(url('/giris/kiraci'));
  await page.getByLabel('E-posta').fill('kiraci@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/mesajlar'));
  await expect(page.getByPlaceholder('Mesaj yaz')).toBeVisible();
}
async function pick(page, file) {
  const fc = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Fotoğraf ekle' }).click();
  await (await fc).setFiles(join(dir, file));
}

test('büyük fotoğraf otomatik küçültülür; hazır olunca tik çıkar ve gönderilir', async ({ page }) => {
  await open(page);
  await pick(page, 'buyuk.png');
  await expect(page.getByLabel('Fotoğraf hazır')).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('img', { name: 'Eklenen fotoğraf' })).toBeVisible();
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect.poll(async () => (await db(page)).tables.messages.map((m) => !!m.image_path)).toEqual([true]);
  await expect(page.getByLabel('Fotoğraf hazır')).toHaveCount(0);        // gönderilince önizleme kalkar
});

test('işlenemeyen dosyada açık uyarı çıkar, önizleme ve tik çıkmaz', async ({ page }) => {
  await open(page);
  await pick(page, 'bozuk.png');
  await expect(page.getByText('Fotoğraf işlenemedi').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByLabel('Fotoğraf hazır')).toHaveCount(0);
});
