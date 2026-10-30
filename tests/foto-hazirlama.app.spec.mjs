// Sohbette fotoğraf: büyük (telefon boyutu) fotoğraf otomatik küçültülür, hazır olunca tik çıkar ve gönderilir;
// işlenemeyen dosyada açık bir uyarı çıkar (eskiden sessizce hiçbir şey olmuyordu).
import { test, expect } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8240;
let server, errors, dir;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  test.setTimeout(300_000);
  await ensureDist(DIST); server = await serveDist(DIST, PORT);
  dir = mkdtempSync(join(tmpdir(), 'foto-'));
  // 5000x4000 (20 MP) düz renkli PNG: telefon fotoğrafı boyutu, dosya küçük kalır.
  const w = 5000, h = 4000, row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 160)]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(join(dir, 'buyuk.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  writeFileSync(join(dir, 'bozuk.png'), Buffer.from('bu bir fotoğraf değil, rastgele baytlar'));
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
