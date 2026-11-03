// "Hareketi azalt" (prefers-reduced-motion) açık ziyaretçide sayfa hidrasyon hatası (React #418) vermez:
// sunucu çıktısı ayarı bilmez; tarayıcı ilk çizimi sunucuyla aynı yapar, ayar bağlandıktan sonra uygulanır.
import { test, expect } from '@playwright/test';
import { serveDist, ensureDist } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8246;
let server;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());

for (const [ad, yol] of [['ana sayfa', '/'], ['çözümler', '/cozumler/mulk-sahibi'], ['fiyatlar', '/#fiyat']]) {
  test(`hareketi azalt açıkken hata yok: ${ad}`, async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    await page.goto(`http://localhost:${PORT}${yol}`);
    await page.waitForTimeout(2500);
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('hareketi azalt açıkken bant animasyonsuz (parlama katmanı yok), kapalıyken var', async ({ browser }) => {
  const ac = await browser.newContext({ reducedMotion: 'reduce' });
  const p1 = await ac.newPage();
  await p1.goto(`http://localhost:${PORT}/`);
  await p1.waitForTimeout(1500);
  const sade = await p1.evaluate(() => document.documentElement.outerHTML.length);
  await ac.close();
  const kapali = await browser.newContext({ reducedMotion: 'no-preference' });
  const p2 = await kapali.newPage();
  await p2.goto(`http://localhost:${PORT}/`);
  await p2.waitForTimeout(1500);
  const hareketli = await p2.evaluate(() => document.documentElement.outerHTML.length);
  await kapali.close();
  expect(hareketli).toBeGreaterThan(sade);                      // animasyonlu çizimde fazladan katman var
});
