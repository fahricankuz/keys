// Yüklenen görseller depolama maliyeti için küçültülür: fotoğraflar 1280 px, dekont/fatura/belge görselleri 1800 px (uzun kenar);
// küçük görseller büyütülmez. Dosya WebP/JPEG olarak, orijinalden çok daha küçük yüklenir. PDF'ler 10 MB ile sınırlıdır.
import { test, expect } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8209;
let server;
let errors;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  test.setTimeout(300_000);
  await ensureDist(DIST);
  server = await serveDist(DIST, PORT);
});
test.afterAll(() => server && server.close());
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  await page.addInitScript((d) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, seed());
});
test.afterEach(() => { expect(errors).toEqual([]); });

const url = (p) => `http://localhost:${PORT}${p}`;
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));

/** w×h boyutunda, yazı benzeri çizgili RGB PNG üretir (bağımlılık olmadan). */
function png(w, h) {
  const row = w * 3 + 1, raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) {
    raw[y * row] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * row + 1 + x * 3, stripe = ((x >> 3) + (y >> 4)) % 5 === 0 ? 20 : 235;
      raw[i] = stripe; raw[i + 1] = (stripe + (x >> 5) + (y >> 5)) & 255; raw[i + 2] = 255 - stripe;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function tenant(page) {
  await page.goto(url('/giris/kiraci'));
  await page.getByLabel('E-posta').fill('kiraci@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
}
async function sent(page) {
  await expect.poll(async () => Object.keys((await db(page)).storage).length).toBe(1);
  const [o] = Object.values((await db(page)).storage);
  return o;
}

test('dekont görseli uzun kenarı 1800 px\'e küçültülür, WebP/JPEG olarak ve çok daha küçük yüklenir', async ({ page }) => {
  await tenant(page);
  const big = png(3000, 2200);
  await page.getByRole('button', { name: 'Dekont yükle' }).first().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Dosya seç' }).click();
  await (await chooser).setFiles({ name: 'dekont-buyuk.png', mimeType: 'image/png', buffer: big });
  await expect(page.getByText('dekont-buyuk.png')).toBeVisible();
  await page.getByRole('button', { name: 'Gönder' }).click();
  const o = await sent(page);
  expect(o.type).toMatch(/^image\/(webp|jpeg)$/);
  expect(Math.max(o.w, o.h)).toBe(1800);
  expect(o.w).toBeGreaterThan(o.h);                               // yatay oran korunur
  expect(Math.abs(o.w / o.h - 3000 / 2200)).toBeLessThan(0.01);
  expect(o.size).toBeLessThan(500 * 1024);                        // 3000×2200 görselin ham hali ≈ 20 MB
});

test('dikey belge görselinde de uzun kenar (yükseklik) 1800 px olur', async ({ page }) => {
  await tenant(page);
  await page.getByRole('button', { name: 'Dekont yükle' }).first().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Dosya seç' }).click();
  await (await chooser).setFiles({ name: 'dikey.png', mimeType: 'image/png', buffer: png(1900, 2600) });
  await expect(page.getByText('dikey.png')).toBeVisible();
  await page.getByRole('button', { name: 'Gönder' }).click();
  const o = await sent(page);
  expect(o.h).toBe(1800);
  expect(o.w).toBeLessThan(o.h);
});

test('küçük görsel büyütülmez (boyutu korunur)', async ({ page }) => {
  await tenant(page);
  await page.getByRole('button', { name: 'Dekont yükle' }).first().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Dosya seç' }).click();
  await (await chooser).setFiles({ name: 'kucuk.png', mimeType: 'image/png', buffer: png(900, 600) });
  await expect(page.getByText('kucuk.png')).toBeVisible();
  await page.getByRole('button', { name: 'Gönder' }).click();
  const o = await sent(page);
  expect([o.w, o.h]).toEqual([900, 600]);
});

test('yazışmaya eklenen fotoğraf uzun kenarı 1280 px\'e küçültülür', async ({ page }) => {
  await tenant(page);
  await page.goto(url('/uygulama/mesajlar'));
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Fotoğraf ekle' }).click();
  await (await chooser).setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: png(3000, 2000) });
  await expect(page.getByText('foto.png')).toBeVisible();
  await page.getByRole('button', { name: 'Gönder' }).click();
  const o = await sent(page);
  expect([o.w, o.h]).toEqual([1280, 853]);
});

test('10 MB\'tan büyük PDF seçilince hemen uyarılır ve yüklenmez', async ({ page }) => {
  await tenant(page);
  await page.getByRole('button', { name: 'Dekont yükle' }).first().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Dosya seç' }).click();
  await (await chooser).setFiles({ name: 'sozlesme.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(10 * 1024 * 1024 + 1024, 1) });
  await expect(page.getByText('Dosya çok büyük')).toBeVisible();
  await expect(page.getByText('En fazla 10 MB yüklenebilir.')).toBeVisible();
  await expect(page.getByText('sozlesme.pdf')).toHaveCount(0);
  expect(Object.keys((await db(page)).storage)).toHaveLength(0);
});
