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

// Gerçek durum: yeni yayın eski parçayı sildi (404); hatayı React yakaladığı için pencere olayı oluşmaz, hata ekranı devreye girer.
const CHUNK = /_expo\/static\/js\/web\/(?!entry-).*\.js/;
const goTo = (page, path) => page.evaluate((p) => { window.__marker = 1; history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, path);

test('eski sekmede parça 404 verince hata ekranı çıkmadan sayfa yenilenir, hata kaydedilmez, kullanıcı gittiği sayfayı görür', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await expect(page.getByText('Kira işinin').first()).toBeVisible();
  await page.waitForTimeout(800);
  let gone = 0;
  const handler = (route) => { gone++; return route.fulfill({ status: 404, contentType: 'text/html', body: '<html>404</html>' }); };
  await page.route(CHUNK, handler);
  const nav = page.waitForEvent('load');
  page.once('load', () => page.unroute(CHUNK, handler).catch(() => {}));
  await goTo(page, '/kira-artis-hesaplama');
  await nav;
  expect(gone).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__marker)).toBeUndefined();         // yenilendi
  await expect(page).toHaveURL(/kira-artis-hesaplama/);
  await expect(page.getByText('Bir şeyler ters gitti')).toHaveCount(0);
  await expect(page.locator('input').first()).toBeVisible();
  const db = await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb') || '{}'));
  expect((db.tables?.client_errors || []).filter((e) => /Loading module/.test(e.message))).toEqual([]);
});

test('yenileme de çözmezse döngüye girmez: hata ekranı çıkar ve kaydedilir', async ({ page }) => {
  await page.goto(`http://localhost:${PORT}/`);
  await expect(page.getByText('Kira işinin').first()).toBeVisible();
  await page.waitForTimeout(800);
  await page.evaluate(() => sessionStorage.setItem('__stale_reload', String(Date.now())));   // az önce yenilendi
  await page.route(CHUNK, (route) => route.fulfill({ status: 404, contentType: 'text/html', body: '<html>404</html>' }));
  await goTo(page, '/kira-artis-hesaplama');
  await expect(page.getByText('Bir şeyler ters gitti')).toBeVisible();
  expect(await page.evaluate(() => window.__marker)).toBe(1);                  // yenilenmedi
  await expect.poll(async () => {
    const db = await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb') || '{}'));
    return (db.tables?.client_errors || []).filter((e) => e.kind === 'render').length;
  }).toBe(1);
});

test('Hostinger geçici adresinde hata kaydedilmez (adres HTML\'de değiştiği için orada React #418 çıkar)', async ({ page }) => {
  let reported = 0;
  await page.route('http://deneme-200844.hostingersite.com/**', async (route) => {
    const u = new URL(route.request().url());
    return route.fulfill({ response: await route.fetch({ url: `http://localhost:${PORT}${u.pathname}${u.search}` }) });
  });
  page.on('request', (r) => { if (/report_error/.test(r.url())) reported++; });
  await page.goto('http://deneme-200844.hostingersite.com/');
  await expect(page.getByText('Kira işinin').first()).toBeVisible();
  await page.waitForTimeout(800);
  await page.evaluate(() => { setTimeout(() => { throw new Error('Geçici adres hatası'); }, 0); });
  await page.waitForTimeout(800);
  const db = await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb') || '{}'));
  expect((db.tables?.client_errors || []).map((e) => e.message)).not.toContain('Geçici adres hatası');
  expect(reported).toBe(0);
});

test('sayfa tarayıcı çevirisine kapalıdır (çeviri metni değiştirip React #418 hydration hatası üretmesin)', async ({ page }) => {
  for (const path of ['/', '/kayit', '/satin-al']) {
    const html = await (await page.request.get(`http://localhost:${PORT}${path}`)).text();
    expect(html).toMatch(/<html lang="tr" translate="no">/);
  }
});
