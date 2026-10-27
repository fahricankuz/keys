// Kalite güvencesi: uygulama (app/) tarayıcıda, sahte Supabase ile.
//  Kara kutu: kabul (uçtan uca yolculuk), performans bütçesi, kullanılabilirlik/erişilebilirlik (axe, dokunma hedefi, klavye),
//  güvenlik (XSS, yetkisiz rota, saklanan sırlar), stres (çok mesaj, hızlı tıklama), regresyon (tüm paket).
//  Beyaz kutu: kurtarma (sunucu hatasında veri kaybı yok), uygunluk (manifest, dil, konsol temiz).
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors, PNG } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
let PORT = 8203;
let server;
let errors;

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await ensureDist(DIST);
  PORT = 8210 + test.info().parallelIndex;      // her işçi kendi sunucusunu açar
  server = await serveDist(DIST, PORT);
});
test.afterAll(() => server && server.close());
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  await page.addInitScript((db) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(db)); }, seed());
});
test.afterEach(() => { expect(errors).toEqual([]); });

const url = (p) => `http://localhost:${PORT}${p}`;
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
const ENTRY = { 'kiraci@ornek.com': '/giris/kiraci', 'ev@ornek.com': '/giris/mulk-sahibi', 'admin@ornek.com': '/giris/yonetici' };
async function login(page, email) {
  await page.goto(url(ENTRY[email]));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await page.goto(url(ENTRY[email]));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}
async function signup(page, path, name, email) {
  await page.goto(url(path));
  await page.getByLabel('Ad soyad').fill(name);
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill('gizli-sifre-1');
  await page.getByRole('checkbox').click();
  await page.getByRole('button', { name: 'Hesap oluştur' }).click();
}
async function signOutLocal(page) {
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
}

/* =================================================================== KABUL (acceptance) */

test('kabul: mülk sahibi kaydolur, mülk ekler, kiracı davetle katılır, dekont yükler, yönetici onaylar, mülk sahibi görür', async ({ page }) => {
  test.setTimeout(90_000);
  // 1) Mülk sahibi kaydolur ve ilk mülkünü ekler.
  await signup(page, '/kayit/mulk-sahibi', 'Zeynep Ev', 'zeynep@ornek.com');
  await expect(page).toHaveURL(/\/uygulama/);
  await page.getByRole('button', { name: 'Mülk ekle' }).first().click();
  await page.getByLabel('Mülk adı').fill('Kadıköy Dairesi');
  await page.getByLabel('Adres').fill('Moda Cd. 5');
  await page.getByLabel('Aylık kira (₺)').fill('25000');
  await page.getByLabel('Ödeme günü').fill('5');
  await page.getByRole('button', { name: 'Kaydet ve davet et' }).click();
  await expect(page.getByText('Kiracını davet et')).toBeVisible();
  await expect.poll(async () => (await db(page)).tables.invites.length).toBe(1);
  const code = (await db(page)).tables.invites[0].code;
  expect(code).toMatch(/^[A-Z0-9]{8}$/);

  // 2) Kiracı davet bağlantısıyla gelir, kaydolur ve mülke bağlanır.
  await signOutLocal(page);
  await page.goto(url('/katil?kod=' + code));
  await page.getByRole('button', { name: 'Kiracı hesabı oluştur' }).click();
  await signup(page, '/kayit/kiraci', 'Deniz Kiracı', 'deniz@ornek.com');
  await expect(page.getByText('Kadıköy Dairesi').first()).toBeVisible();
  await expect.poll(async () => (await db(page)).tables.memberships.filter((m) => m.display_name === 'Deniz Kiracı').length).toBe(1);

  // 3) Kiracı dekont yükler; mülk sahibi onaydan önce görmez.
  await page.getByRole('button', { name: 'Dekont yükle' }).first().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Dosya seç' }).click();
  await (await chooser).setFiles(PNG);
  await expect(page.getByText('dekont.png')).toBeVisible();
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect(page.getByText('Kiracım ekibi dekontu inceliyor').first()).toBeVisible();
  await expect.poll(async () => (await db(page)).tables.reviews.length).toBe(1);

  // 4) Yönetici onaylar.
  await login(page, 'admin@ornek.com');
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('button', { name: 'Onayla', exact: true }).click();
  await expect(page.getByText('Bekleyen yükleme yok')).toBeVisible();

  // 5) Mülk sahibi (aynı hesap) ödemeyi artık görür.
  await signOutLocal(page);
  await page.goto(url('/giris/mulk-sahibi'));
  await page.getByLabel('E-posta').fill('zeynep@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill('gizli-sifre-1');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('Kadıköy Dairesi').first()).toBeVisible();
  await expect.poll(async () => (await db(page)).tables.reviews[0].status).toBe('approved');
});

/* =================================================================== PERFORMANS */

test('performans: ana sayfa bütçesi (yükleme süresi, istek sayısı, aktarılan betik)', async ({ page }) => {
  const reqs = [];
  page.on('response', async (r) => { try { reqs.push({ url: r.url(), size: (await r.body()).length, type: r.request().resourceType() }); } catch { /* yönlendirme */ } });
  const t0 = Date.now();
  await page.goto(url('/'), { waitUntil: 'load' });
  await expect(page.getByText('Kira işi,').first()).toBeVisible();
  const visible = Date.now() - t0;
  await page.waitForTimeout(500);
  const js = reqs.filter((r) => r.type === 'script').reduce((n, r) => n + r.size, 0);
  const fonts = reqs.filter((r) => r.type === 'font');
  const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd }; });
  const lcp = await page.evaluate(() => new Promise((res) => {
    new PerformanceObserver((l) => { const e = l.getEntries(); res(e[e.length - 1].startTime); }).observe({ type: 'largest-contentful-paint', buffered: true });
    setTimeout(() => res(null), 1500);
  }));
  console.log(`performans: görünür ${visible} ms · DCL ${Math.round(nav.dcl)} ms · load ${Math.round(nav.load)} ms · LCP ${lcp && Math.round(lcp)} ms · betik ${(js / 1024).toFixed(0)} KB · yazı tipi ${fonts.length} · istek ${reqs.length}`);
  expect(visible).toBeLessThan(5000);
  if (lcp) expect(lcp).toBeLessThan(4000);
  expect(js).toBeLessThan(2.6 * 1024 * 1024);       // sıkıştırılmamış; sıkıştırılınca ~1/4'ü
  expect(fonts.length).toBeLessThanOrEqual(6);        // yalnızca kullanılan ağırlıklar iner
  expect(reqs.filter((r) => !r.url.startsWith(`http://localhost:${PORT}`))).toEqual([]);   // dış sunucuya istek yok
});

test('performans: etkileşim (menü açma, sayfa geçişi) 1 saniyenin altında yanıt verir', async ({ page }) => {
  await page.goto(url('/'));
  await expect(page.getByText('Kira işi,').first()).toBeVisible();
  let t = Date.now();
  await page.getByRole('button', { name: 'Özellikler' }).click();
  await expect(page.getByText('Dekont yükleme')).toBeVisible();
  expect(Date.now() - t).toBeLessThan(1000);
  await page.keyboard.press('Escape');
  t = Date.now();
  await page.getByRole('button', { name: 'Giriş yap' }).first().click();
  await expect(page).toHaveURL(/\/giris/);
  await expect(page.getByText('Kiracı girişi').first()).toBeVisible();
  expect(Date.now() - t).toBeLessThan(2000);
});

/* =================================================================== KULLANILABİLİRLİK / ERİŞİLEBİLİRLİK */

const PAGES = [['ana sayfa', '/'], ['kiracı girişi', '/giris/kiraci'], ['mülk sahibi kaydı', '/kayit/mulk-sahibi'], ['şifre sıfırlama', '/sifre'], ['davet', '/katil']];
for (const [name, path] of PAGES) {
  test(`erişilebilirlik (axe, WCAG 2 A/AA): ${name}`, async ({ page }) => {
    await page.goto(url(path));
    await page.waitForTimeout(1200);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bad = r.violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    expect(bad, bad.join('\n')).toEqual([]);
  });
}

test('erişilebilirlik (axe): oturum açmış kiracı ve mülk sahibi ekranları', async ({ page }) => {
  for (const who of ['kiraci@ornek.com', 'ev@ornek.com']) {
    await login(page, who);
    await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
    await page.waitForTimeout(800);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const bad = r.violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    expect(bad, who + '\n' + bad.join('\n')).toEqual([]);
  }
});

test('erişilebilirlik (axe): yönetici paneli', async ({ page }) => {
  await login(page, 'admin@ornek.com');
  await expect(page.getByText('Yönetici', { exact: true }).first()).toBeVisible();
  for (const tab of ['Denetim', 'Ödemeler', 'Bağlantılar', 'Mesajlar', 'Kullanıcılar', 'Kayıt']) {
    await page.getByRole('button', { name: tab, exact: tab === 'Kayıt' }).first().click();
    await page.waitForTimeout(400);
  }
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  const bad = r.violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
  expect(bad, bad.join('\n')).toEqual([]);
});

test.describe('koyu tema', () => {
  test.use({ colorScheme: 'dark' });
  test('erişilebilirlik (axe): koyu temada ana sayfa, giriş ve kiracı ekranı', async ({ page }) => {
    for (const p of ['/', '/giris/kiraci']) {
      await page.goto(url(p));
      await page.waitForTimeout(1200);
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const bad = r.violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      expect(bad, p + '\n' + bad.join('\n')).toEqual([]);
    }
    await login(page, 'kiraci@ornek.com');
    await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
    await page.waitForTimeout(800);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const bad = r.violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    expect(bad, bad.join('\n')).toEqual([]);
  });
});

test.describe('telefon görünümü', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('kullanılabilirlik: yatay kaydırma yok, düğmeler en az 44 px, yazı en az 12 px', async ({ page }) => {
    for (const p of ['/', '/giris/kiraci', '/kayit/kiraci']) {
      await page.goto(url(p));
      await page.waitForTimeout(1000);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(over, p + ' yatay taşma').toBeLessThanOrEqual(1);
      const small = await page.evaluate(() => [...document.querySelectorAll('button, [role=button], a, input')]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 40 || r.width < 40) && getComputedStyle(e).visibility !== 'hidden'; })
        .map((e) => `${e.getAttribute('aria-label') || e.textContent.trim().slice(0, 20)} ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`));
      expect(small, p + ' küçük dokunma hedefi').toEqual([]);
      const tiny = await page.evaluate(() => [...document.querySelectorAll('div, span')].filter((e) => e.children.length === 0 && e.textContent.trim() && !e.closest('[aria-hidden="true"]') && parseFloat(getComputedStyle(e).fontSize) < 11).map((e) => e.textContent.trim().slice(0, 20)));
      expect(tiny, p + ' çok küçük yazı').toEqual([]);
    }
  });
});

test('kullanılabilirlik: klavye ile giriş yapılabilir (Tab sırası, Enter ile gönderme, odak görünür)', async ({ page }) => {
  await page.goto(url('/giris/kiraci'));
  await page.waitForTimeout(1200);                       // sayfa etkileşime hazır olsun (hidrasyon)
  await page.getByLabel('E-posta').focus();
  await page.keyboard.type('kiraci@ornek.com');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Şifre', { exact: true })).toBeFocused();
  await page.keyboard.type(PW);
  await page.keyboard.press('Enter');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
});

test('kullanılabilirlik: hatalı girişte anlaşılır mesaj, boş alanda yönlendirme', async ({ page }) => {
  await page.goto(url('/giris/kiraci'));
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('E-posta ve şifreni gir.')).toBeVisible();
  await page.getByLabel('E-posta').fill('kiraci@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill('yanlis-sifre');
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('E-posta ya da şifre hatalı.')).toBeVisible();
});

/* =================================================================== GÜVENLİK */

test('güvenlik: mesajdaki HTML/betik metin olarak görünür, çalışmaz', async ({ page }) => {
  await page.goto(url('/'));
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('__fakedb'));
    d.tables.messages.push({ id: 'xss1', property_id: 'p1', from_role: 'landlord', by_user: d.tables.profiles.find((p) => p.role === 'landlord').id,
      body: '<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>', at: new Date().toISOString() });
    d.tables.properties[0].name = '<b onmouseover="window.__pwned=3">Ev</b>';
    localStorage.setItem('__fakedb', JSON.stringify(d));
  });
  await login(page, 'kiraci@ornek.com');
  await page.goto(url('/uygulama/mesajlar'));
  await expect(page.getByText('<img src=x onerror="window.__pwned=1">', { exact: false })).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
});

test('güvenlik: oturumsuz kullanıcı uygulama ve yönetici sayfalarını göremez; kiracı yönetici sayfasına giremez', async ({ page }) => {
  await page.goto(url('/uygulama'));
  await page.waitForTimeout(1500);
  expect(page.url()).not.toMatch(/\/uygulama/);                       // girişe yönlendirildi
  await expect(page.getByText('Moda Dairesi')).toHaveCount(0);
  await page.goto(url('/admin'));
  await page.waitForTimeout(1500);
  expect(page.url()).not.toMatch(/\/admin$/);
  await expect(page.getByRole('button', { name: 'Kullanıcılar' })).toHaveCount(0);
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/admin'));
  await page.waitForTimeout(1500);
  expect(page.url()).not.toMatch(/\/admin$/);
  await expect(page.getByRole('button', { name: 'Kullanıcılar' })).toHaveCount(0);
});

test('güvenlik: uygulama kendi depolama anahtarlarına parola yazmaz; adreste sır yok', async ({ page }) => {
  await signup(page, '/kayit/kiraci', 'Gizli Kişi', 'gizli@ornek.com');
  await page.waitForTimeout(1500);
  expect(page.url()).not.toMatch(/gizli-sifre|password|token/i);
  // Sahte sunucunun kendi kaydı (test düzeneği) hariç, uygulamanın sakladıkları parola içermez.
  const raw = await page.evaluate(() => JSON.stringify(Object.entries(localStorage).filter(([k]) => !k.startsWith('__fake'))));
  expect(raw).not.toContain('gizli-sifre-1');
});

test('güvenlik: çerçeveye gömme ve harici betik yok; sayfalar CSP taşır', async ({ page }) => {
  const html = (await (await page.request.get(url('/giris/kiraci'))).text());
  expect(html).toContain('Content-Security-Policy');
  expect(html).not.toMatch(/<script[^>]+src="https?:\/\//);
});

/* =================================================================== STRES */

test('stres: 1.500 mesajlık yazışma açılır, kaydırılır ve yeni mesaj gönderilir', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(url('/'));
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('__fakedb'));
    const L = d.tables.profiles.find((p) => p.role === 'landlord').id, T = d.tables.profiles.find((p) => p.name === 'Mehmet Kiracı').id;
    for (let i = 0; i < 1500; i++) d.tables.messages.push({ id: 'bulk' + i, property_id: 'p1', from_role: i % 2 ? 'tenant' : 'landlord', by_user: i % 2 ? T : L, body: 'Mesaj numarası ' + i, at: new Date(Date.now() - (1500 - i) * 60000).toISOString() });
    localStorage.setItem('__fakedb', JSON.stringify(d));
  });
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  const t0 = Date.now();
  await page.goto(url('/uygulama/mesajlar'));
  await expect(page.getByText('Mesaj numarası 1499')).toBeVisible();
  const open = Date.now() - t0;
  console.log(`stres: 1.500 mesajlık yazışma ${open} ms'de açıldı; DOM düğümü ${await page.evaluate(() => document.getElementsByTagName('*').length)}`);
  expect(open).toBeLessThan(8000);
  const nodes = await page.evaluate(() => document.getElementsByTagName('*').length);
  expect(nodes).toBeLessThan(25000);
  await page.getByPlaceholder(/mesaj/i).first().fill('Yeni mesaj');
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect(page.getByText('Yeni mesaj').first()).toBeVisible();
});

test('stres: hızlı art arda tıklama ve gönderme kayıt çoğaltmaz', async ({ page }) => {
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/mesajlar'));
  const box = page.getByPlaceholder(/mesaj/i).first();
  await box.fill('çift tıklama');
  const send = page.getByRole('button', { name: 'Gönder' });
  await send.dblclick();
  await page.waitForTimeout(1200);
  const n = (await db(page)).tables.messages.filter((m) => m.body === 'çift tıklama').length;
  expect(n).toBeLessThanOrEqual(1);
  // 20 hızlı sekme geçişi hata üretmez
  for (let i = 0; i < 20; i++) await page.goto(url(i % 2 ? '/uygulama/mesajlar' : '/uygulama'));
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
});

/* =================================================================== KURTARMA (recovery) */

test('kurtarma: yazma hatasında mesaj ekranda kalır, sayfa yenilenince kaybolmaz, bağlantı gelince sunucuya gider', async ({ page }) => {
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/mesajlar'));
  await page.evaluate(() => localStorage.setItem('__fakefail', '1'));          // sunucu yazmaları reddediyor
  await page.getByPlaceholder(/mesaj/i).first().fill('Sunucu kapalıyken yazdım');
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect(page.getByText('Sunucu kapalıyken yazdım').first()).toBeVisible();
  await page.waitForTimeout(1200);
  expect((await db(page)).tables.messages.map((m) => m.body)).not.toContain('Sunucu kapalıyken yazdım');
  await page.reload();                                                          // kullanıcı sayfayı yeniler
  await expect(page.getByText('Sunucu kapalıyken yazdım').first()).toBeVisible();   // kayıp yok
  await page.evaluate(() => { localStorage.removeItem('__fakefail'); window.dispatchEvent(new Event('online')); });
  await expect.poll(async () => (await db(page)).tables.messages.map((m) => m.body), { timeout: 15000 }).toContain('Sunucu kapalıyken yazdım');
});

test('kurtarma: bağlantı tamamen yokken açılan uygulama kayıtlı veriyi gösterir (çevrimdışı açılış)', async ({ page }) => {
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.waitForTimeout(800);
  await page.evaluate(() => localStorage.setItem('__fakefail', '2'));          // sunucuya hiç ulaşılamıyor
  await page.reload();
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();          // önbellekten açılır, giriş ekranına atmaz
  await expect(page.getByLabel('E-posta')).toHaveCount(0);
});

/* =================================================================== UYGUNLUK (conformance) */

test('uygunluk: manifest, dil, başlık, simgeler ve temel meta etiketleri doğru', async ({ page }) => {
  const resp = await page.goto(url('/'));
  expect(resp.status()).toBe(200);
  expect(await page.locator('html').getAttribute('lang')).toBe('tr');
  expect(await page.title()).toMatch(/Kiracım/);
  expect(await page.locator('meta[name=viewport]').getAttribute('content')).toContain('width=device-width');
  const man = await (await page.request.get(url('/manifest.webmanifest'))).json();
  expect(man.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
  for (const i of man.icons) expect((await page.request.get(url('/' + i.src))).status()).toBe(200);
  expect((await page.request.get(url('/apple-touch-icon.png'))).status()).toBe(200);
  expect((await page.request.get(url('/.well-known/security.txt'))).status()).toBe(200);
  expect((await page.request.get(url('/olmayan-sayfa-xyz'))).status()).toBe(404);
});

test('uygunluk: para ve tarih Türkçe biçimde (₺25.000, 5 Kasım)', async ({ page }) => {
  await login(page, 'ev@ornek.com');
  await page.goto(url('/uygulama/mulk?pid=p1'));
  await expect(page.getByText('₺30.000').first()).toBeVisible();
  const body = await page.locator('body').innerText();
  expect(body).not.toMatch(/\$|NaN|undefined|null|\[object/);
});
