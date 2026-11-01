// Yeni sürüm yayınlanınca açık duran eski sekmede "Loading module … failed" hatası gelirse sayfa bir kez yenilenir
// (yeni sürüm gelir); dakikada en çok bir kez, başka hatalarda yenilenmez.
import { test, expect } from '@playwright/test';
import { serveDist, ensureDist } from './app-helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8244;
let server;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());

const fire = (page, message) => page.evaluate((m) => window.dispatchEvent(new ErrorEvent('error', { message: m })), message);

test('eski parça hatasında sayfa bir kez yenilenir; başka hatada ve dakika içinde ikinci kez yenilenmez', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await expect(page.getByText('Kira işinin').first()).toBeVisible();
  await page.waitForTimeout(800);                         // kayıt (useEffect) yüklensin
  await page.evaluate(() => { window.__marker = 1; });

  await fire(page, 'Uncaught TypeError: x is not a function');           // alakasız hata: yenileme yok
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__marker)).toBe(1);

  const nav = page.waitForEvent('load');
  await fire(page, 'Loading module https://anahtar.io/_expo/static/js/web/satin-al-93bcd.js failed. (error: https://anahtar.io/_expo/static/js/web/satin-al-93bcd.js)');
  await nav;                                              // yenilendi
  await expect(page.getByText('Kira işinin').first()).toBeVisible();
  expect(await page.evaluate(() => window.__marker)).toBeUndefined();

  await page.waitForTimeout(800);
  await page.evaluate(() => { window.__marker = 2; });
  await fire(page, 'Loading module https://anahtar.io/_expo/static/js/web/kayit-1.js failed.');   // dakika içinde ikinci kez: yenileme yok
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__marker)).toBe(2);
});

test('sayfa tarayıcı çevirisine kapalıdır (çeviri metni değiştirip React #418 hydration hatası üretmesin)', async ({ page }) => {
  for (const path of ['/', '/kayit', '/satin-al']) {
    const html = await (await page.request.get(`http://localhost:${PORT}${path}`)).text();
    expect(html).toMatch(/<html lang="tr" translate="no">/);
  }
});
