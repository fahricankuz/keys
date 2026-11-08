// Yönetici denetimi, uygulama (app/) üzerinde uçtan uca: kiracı dekont yükler, mülk sahibi
// yönetici onaylayana kadar görmez, yönetici panelinde onaylar ya da gerekçeyle reddeder.
// Sunucu tarafı kuralları gerçek Postgres'te ayrıca sınanır (admin.sql.spec.mjs); burada
// istemci akışı sahte Supabase (app/src/testing/fake-supabase.js) ile doğrulanır.
import { test, expect } from '@playwright/test';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors, PNG } from './helpers.mjs';

// Sahte sunucuyla derlenmiş çıktı; uygulama kodu değişince `rm -rf app/dist-fake` ile yeniden üretilir.
const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8201;
let server;
let errors;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  test.setTimeout(300_000);                       // ilk çalıştırmada uygulama derlenir
  await ensureDist(DIST);
  server = await serveDist(DIST, PORT);
});
test.afterAll(() => server && server.close());

test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  await page.addInitScript(db => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(db)); }, seed());
});
test.afterEach(() => { expect(errors).toEqual([]); });

const url = p => `http://localhost:${PORT}${p}`;
const db = page => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));

/** Oturumu kapatıp (sahte sunucu oturumu) verilen hesapla giriş yapar. */
const ENTRY = { 'kiraci@ornek.com': '/giris/kiraci', 'ev@ornek.com': '/giris/mulk-sahibi', 'admin@ornek.com': '/giris/yonetici' };
async function login(page, email, path = ENTRY[email]) {
  await page.goto(url(path));
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await page.goto(url(path));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}

async function uploadReceipt(page) {
  await page.getByRole('button', { name: 'Dekont yükle' }).first().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Dosya seç' }).click();
  await (await chooser).setFiles(PNG);
  await expect(page.getByText('dekont.png')).toBeVisible();
  await page.getByRole('button', { name: 'Gönder' }).click();
}

/** Kiracı olarak giriş yapıp bir dekont yükler; ödeme sunucuya yazılana kadar bekler. */
async function tenantUploads(page) {
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await uploadReceipt(page);
  await expect(page.getByText('Mülk sahibinin onayı bekleniyor').first()).toBeVisible();
  await expect.poll(async () => (await db(page)).tables.payments.length).toBe(1);   // eşitleme gecikmeli çalışır
}

test('kiracı dekont yükler; anahtar denetimine düşmez, mülk sahibi hemen görür, bildirim alır ve onaylar', async ({ page }) => {
  await tenantUploads(page);
  const d = await db(page);
  expect(d.tables.reviews).toHaveLength(0);                                            // yönetici denetimi yok
  expect(d.tables.payments[0]).toMatchObject({ status: 'review', property_id: 'p1' });
  expect(d.tables.payments[0].receipt_path).toMatch(/^p1\/.+\.(webp|jpg)$/);              // dosya depoya yüklendi
  expect(Object.keys(d.storage).filter((k) => !k.endsWith('.k'))).toHaveLength(1);     // asıl dosya …
  expect(Object.keys(d.storage)).toContain(d.tables.payments[0].receipt_path + '.k');   // … ve listeler için küçük kopyası
  expect(d.tables.notifications.map(n => n.title)).toEqual(['Dekont geldi']);

  await login(page, 'ev@ornek.com');
  await expect(page.getByText('Onay bekliyor').first()).toBeVisible();

  // Mülk sahibi dekontu açar ve cihazına indirir.
  await page.goto(url('/uygulama/mulk?pid=p1&sub=odeme'));
  await page.getByRole('button', { name: 'Dekontu gör' }).first().click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: /dosyasını indir$/ }).first().click();
  expect((await dl).suggestedFilename()).toMatch(/dekont.*\.(webp|jpg)$/);
  await page.keyboard.press('Escape');

  // Mülk sahibi onaylayınca kutlama animasyonu (tik + konfeti) çıkar, ödeme onaylanır.
  await page.goto(url('/uygulama/mulk?pid=p1&sub=odeme'));
  await page.getByRole('button', { name: 'Onayla', exact: true }).first().click();
  await expect(page.getByLabel('Ödeme onaylandı').first()).toBeVisible();
  await expect.poll(async () => (await db(page)).tables.payments[0].status).toBe('approved');
});

test('yönetici panelinde ödemeler; Hesaplar\'da kiracının mülkü ve mülk sahibi → kiracı ağacı görünür', async ({ page }) => {
  await tenantUploads(page);
  await login(page, 'admin@ornek.com');
  await page.getByRole('button', { name: 'Ödemeler' }).click();
  await expect(page.getByText('Mehmet Kiracı → Ayşe Mülk')).toBeVisible();
  await expect(page.getByText('₺30.000').first()).toBeVisible();
  await page.getByRole('button', { name: 'Hesaplar', exact: true }).click();
  await expect(page.getByText('kiraci@ornek.com')).toBeVisible();
  await expect(page.getByText('Moda Dairesi mülküne bağlı')).toBeVisible();            // kiracının satırında bağlı olduğu mülk
  await page.getByRole('button', { name: /^Ayşe Mülk/ }).click();
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await expect(page.getByText('• Mehmet Kiracı')).toBeVisible();
});

test('mülk sahibi reddeder: kiracı gerekçeyi görür, ödeme reddedilir', async ({ page }) => {
  await tenantUploads(page);
  await login(page, 'ev@ornek.com');
  await page.goto(url('/uygulama/mulk?pid=p1&sub=odeme'));
  await page.getByRole('button', { name: 'Dekontu gör' }).first().click();
  await page.getByRole('button', { name: 'Reddet', exact: true }).click();
  await page.getByRole('radio', { name: 'Dekont okunmuyor' }).click();
  await page.getByRole('button', { name: 'Reddet', exact: true }).last().click();
  await expect.poll(async () => (await db(page)).tables.payments[0].status).toBe('rejected');
  expect((await db(page)).tables.payments[0].reject_reason).toMatch(/Dekont okunmuyor/);

  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Dekont okunmuyor').first()).toBeVisible();
});

test('yönetici olmayan /admin adresine giremez', async ({ page }) => {
  await login(page, 'kiraci@ornek.com');
  await page.goto(url('/admin'));
  await expect(page).toHaveURL(/\/uygulama/);
});

test('davet bağlantısı kodu saklar; mülke bağlı olmayan kiracı kod ekranını görür', async ({ page }) => {
  await page.goto(url('/giris'));
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('__fakedb'));
    d.tables.memberships = d.tables.memberships.filter(m => m.role !== 'tenant');
    d.tables.invites.push({ code: 'ABCD1234', property_id: 'p1', name: 'Mehmet', email: '', phone: '', created_by: d.users[0].id, accepted_by: null });
    localStorage.setItem('__fakedb', JSON.stringify(d));
  });
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Mülküne bağlan').first()).toBeVisible();
  await page.getByLabel('Davet kodu').fill('abcd1234');
  await page.getByRole('button', { name: 'Mülke bağlan' }).click();
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
});

test('/katil?kod=… bağlantısı: kod saklanır, giriş sonrası kiracı mülke otomatik bağlanır', async ({ page }) => {
  await page.goto(url('/giris'));
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('__fakedb'));
    d.tables.memberships = d.tables.memberships.filter(m => m.role !== 'tenant');
    d.tables.invites.push({ code: 'ABCD1234', property_id: 'p1', name: 'Mehmet', email: '', phone: '', created_by: d.users[0].id, accepted_by: null });
    localStorage.setItem('__fakedb', JSON.stringify(d));
  });
  await page.goto(url('/katil?kod=abcd1234'));
  await expect(page.getByText('ABCD1234')).toBeVisible();
  await page.getByRole('button', { name: 'Hesabım var, giriş yap' }).click();
  await page.getByLabel('E-posta').fill('kiraci@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  expect((await db(page)).tables.invites[0].accepted_by).toBeTruthy();
});

test('giriş ayrı: hesap türü girişle uyuşmazsa oturum açılmaz', async ({ page }) => {
  await page.goto(url('/giris'));
  await expect(page.getByRole('link', { name: /Kiracı girişi/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Mülk sahibi girişi/ })).toBeVisible();

  await login(page, 'ev@ornek.com', '/giris/kiraci');
  await expect(page.getByText('Bu hesap bir mülk sahibi hesabı. Mülk sahibi girişini kullan.')).toBeVisible();
  await login(page, 'kiraci@ornek.com', '/giris/mulk-sahibi');
  await expect(page.getByText('Bu hesap bir kiracı hesabı. Kiracı girişini kullan.')).toBeVisible();
  await login(page, 'kiraci@ornek.com', '/giris/yonetici');
  await expect(page.getByText('Bu hesap yönetici hesabı değil.')).toBeVisible();
  await login(page, 'admin@ornek.com', '/giris/kiraci');
  await expect(page.getByText('Bu bir yönetici hesabı. Yönetici girişini kullan.')).toBeVisible();
  await expect(page).toHaveURL(/\/giris\/kiraci$/);

  await login(page, 'ev@ornek.com', '/giris/mulk-sahibi');
  await expect(page).toHaveURL(/\/uygulama$/);
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
});

test('kayıt ayrı: mülk sahibi kaydı rol seçtirmeden mülk sahibi hesabı açar', async ({ page }) => {
  await page.goto(url('/kayit'));
  await page.getByRole('link', { name: /Mülk sahibi olarak kayıt ol/ }).click();
  await expect(page).toHaveURL(/\/kayit\/mulk-sahibi$/);
  await page.getByLabel('Ad soyad').fill('Yeni Mülk Sahibi');
  await page.getByLabel('E-posta').fill('yeni@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByLabel('Şifre (tekrar)').fill(PW);
  await page.getByRole('checkbox').click({ position: { x: 10, y: 10 } });
  await page.getByRole('button', { name: /Hesap oluştur|ücretsiz başla/ }).click();
  await expect(page).toHaveURL(/\/uygulama$/);
  const d = await db(page);
  expect(d.tables.profiles.find(p => p.name === 'Yeni Mülk Sahibi').role).toBe('landlord');
});

test('yazışmaya fotoğraf eklenir; karşı taraf fotoğrafı mesajda görür', async ({ page }) => {
  await login(page, 'kiraci@ornek.com');
  await page.goto(url('/uygulama/mesajlar'));
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Fotoğraf ekle' }).click();
  await (await chooser).setFiles(PNG);
  await expect(page.getByText('dekont.png')).toBeVisible();     // eklenen fotoğrafın adı önizlemede
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect(page.getByLabel('Fotoğrafı büyüt')).toBeVisible();
  await expect.poll(async () => (await db(page)).tables.messages.filter(m => m.image_path).length).toBe(1);
  const m = (await db(page)).tables.messages.find(x => x.image_path);
  expect(m.image_path).toMatch(/^p1\/.+\.(webp|jpg)$/);
  expect((await db(page)).tables.reviews).toHaveLength(0);       // fotoğraf yönetici denetimine girmez

  await login(page, 'ev@ornek.com');
  await page.goto(url('/uygulama/mulk?pid=p1&sub=mesaj'));
  await expect(page.getByLabel('Fotoğrafı büyüt')).toBeVisible();
  await page.getByLabel('Fotoğrafı büyüt').click();
  await expect(page.getByLabel('Fotoğraf', { exact: true })).toBeVisible();
});

test('ana sayfa üst menüsü oturum açıkken "Panele git" gösterir, giriş/kayıt göstermez', async ({ page }) => {
  await login(page, 'kiraci@ornek.com');
  await expect(page).toHaveURL(/\/uygulama$/);
  await page.goto(url('/'));
  await expect(page.getByRole('button', { name: 'Panele git' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Giriş yap' })).toHaveCount(0);
  await expect(page.getByText('Uygulamayı aç')).toHaveCount(0);
});

test('ana sayfa: duyuru şeridi, açılır özellik menüsü, yüzen kartlar, fiyat seçimi ve SSS', async ({ page }) => {
  await page.goto(url('/'));
  await expect(page.getByText('Mülk sahiplerine 1 ay ücretsiz deneme')).toBeVisible();
  // Başlığın yanındaki yüzen kartlar (ödeme, yazışma, talep, depozito).
  for (const tag of ['Ödemeler', 'Yazışma', 'Talepler', 'Depozito']) await expect(page.getByText(tag, { exact: true }).first()).toBeVisible();
  // Özellikler menüsü: üzerine gelmek açmaz; basınca açılır ve fare çekilse de açık kalır.
  const menu = page.getByRole('button', { name: 'Özellikler' });
  const goTo = (name) => page.getByText(name + ' bölümüne git', { exact: false });
  await menu.hover();
  await expect(goTo('Ödemeler')).toHaveCount(0);
  await menu.click();
  await expect(goTo('Ödemeler')).toBeVisible();
  await page.mouse.move(700, 700);
  await page.waitForTimeout(500);
  await expect(goTo('Ödemeler')).toBeVisible();
  // Bir daha basınca kapanır; Esc de kapatır.
  await menu.click();
  await expect(goTo('Ödemeler')).toHaveCount(0);
  await menu.click();
  await expect(goTo('Ödemeler')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(goTo('Ödemeler')).toHaveCount(0);
  // Fiyatlar: aylık / yıllık seçimi fiyatı değiştirir; paket düğmesi "Paketi seç".
  await expect(page.getByText('₺99,99').first()).toBeVisible();
  await page.getByRole('tab', { name: /Yıllık/ }).click();
  await expect(page.getByText('₺999,90').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Paketi seç' }).first()).toBeVisible();
  // SSS: soru basınca açılır, yeniden basınca kapanır.
  const q = page.getByRole('button', { name: 'Kiracı için ücretli mi?' });
  await q.scrollIntoViewIfNeeded();
  await expect(q).toHaveAttribute('aria-expanded', 'false');
  await q.click();
  await expect(q).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText(/Hayır\. Kiracı hesabı her zaman ücretsizdir/)).toBeVisible();
  await q.click();
  await expect(q).toHaveAttribute('aria-expanded', 'false');
});

/** Derlenmiş her sayfa: içerik güvenlik politikası var, her satır içi betik özetle izinli. */
function htmlFiles(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = dir + '/' + n;
    return statSync(p).isDirectory() ? (n === '_expo' || n === 'assets' ? [] : htmlFiles(p)) : n.endsWith('.html') ? [p] : [];
  });
}

test('güvenlik: her sayfada CSP var ve satır içi betiklerin hepsi özetle izinli', () => {
  const files = htmlFiles(DIST);
  expect(files.length).toBeGreaterThan(10);
  for (const f of files) {
    const html = readFileSync(f, 'utf8');
    const csp = (html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1];
    expect(csp, f).toBeTruthy();
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    // JSON-LD gibi veri blokları çalıştırılmaz; CSP yalnız çalıştırılabilir satır içi betiklere uygulanır.
    for (const m of html.matchAll(/<script(?![^>]*\ssrc=)(?![^>]*type="application\/ld\+json")[^>]*>([\s\S]*?)<\/script>/g)) {
      const hash = 'sha256-' + createHash('sha256').update(m[1]).digest('base64');
      expect(csp, f + ' → ' + m[1].slice(0, 60)).toContain(hash);
    }
  }
});

test('eski uygulamanın servis çalışıcısını temizleyen sw.js derlemeyle gelir ve önbelleğe alınmaz', () => {
  const sw = readFileSync(DIST + '/sw.js', 'utf8');
  expect(sw).toContain('skipWaiting');
  expect(sw).toContain('caches.delete');
  expect(sw).toContain('unregister');
  expect(sw).not.toContain("addEventListener('fetch'");
  const ht = readFileSync(DIST + '/.htaccess', 'utf8');
  expect(ht).toMatch(/\^sw\\\.js\$[\s\S]*no-cache/);
  expect(readFileSync(DIST + '/_headers', 'utf8')).toContain('/sw.js');
});

test('Hostinger: .htaccess (HTTPS, temiz adresler, başlıklar) ve manifest derlemeyle gelir; her uygulama sayfası .html dosyasıdır', () => {
  const ht = readFileSync(DIST + '/.htaccess', 'utf8');
  expect(ht).toContain('RewriteRule ^(.+)$ $1.html [L]');
  expect(ht).toContain('Strict-Transport-Security');
  expect(ht).toContain('ErrorDocument 404 /404.html');
  const man = JSON.parse(readFileSync(DIST + '/manifest.webmanifest', 'utf8'));
  expect(man).toMatchObject({ short_name: 'anahtar', display: 'standalone', start_url: './' });
  for (const p of ['404.html', 'giris/kiraci/index.html', 'kayit/mulk-sahibi/index.html', 'uygulama/mesajlar/index.html', 'giris/kiraci.html', 'giris/mulk-sahibi.html', 'giris/yonetici.html', 'kayit/kiraci.html', 'kayit/mulk-sahibi.html', 'sifre.html', 'katil.html', 'uygulama/mesajlar.html', 'admin/index.html', 'index.html'])
    expect(existsSync(DIST + '/' + p), p).toBe(true);
});

test('güvenlik: CSP ihlali yok ve çerçeve koruması başka siteye gömmeyi engeller', async ({ page }) => {
  const violations = [];
  page.on('console', (m) => { if (/Content Security Policy|violates the following/i.test(m.text())) violations.push(m.text()); });
  await page.goto(url('/'));
  await expect(page.getByText('Kira işinin').first()).toBeVisible();
  await page.goto(url('/giris/kiraci'));
  await expect(page.getByLabel('E-posta')).toBeVisible();
  expect(violations).toEqual([]);
  // Başka bir sitenin içine gömülürse sayfa kendini gizler (clickjacking koruması).
  const { createServer } = await import('node:http');
  const host = createServer((_, res) => { res.setHeader('content-type', 'text/html'); res.end(`<iframe src="${url('/')}" style="width:600px;height:400px"></iframe>`); });
  await new Promise((r) => host.listen(8202, r));
  try {
    await page.goto('http://localhost:8202/');
    await expect.poll(async () => {
      // Koruma ya çerçeveyi gizler ya da üst sayfayı kendi adresine götürür; ikisi de gömmeyi engeller.
      if (page.url().startsWith(url('/'))) return 'none';
      const f = page.frames().find((x) => x.url().startsWith(url('/')));
      return f ? await f.evaluate(() => document.documentElement.style.display).catch(() => '') : '';
    }, { timeout: 20000 }).toBe('none');
  } finally { host.close(); }
  await page.goto('about:blank');          // gömülü sayfanın geç gelen hataları sayılmasın
  errors.length = 0;
});

/** Sahte veritabanına iki mesaj koyar (kiracıdan, mülk sahibinden). */
async function seedMessages(page) {
  await page.goto(url('/'));
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('__fakedb'));
    const id = (n) => d.tables.profiles.find((p) => p.name === n).id;
    const at = (m) => new Date(Date.now() - m * 60000).toISOString();
    d.tables.messages.push(
      { id: 'm1', property_id: 'p1', from_role: 'tenant', by_user: id('Mehmet Kiracı'), body: 'Kira bu ay geç yatacak', at: at(10) },
      { id: 'm2', property_id: 'p1', from_role: 'landlord', by_user: id('Ayşe Mülk'), body: 'Tamam, haber ver', at: at(5) }
    );
    localStorage.setItem('__fakedb', JSON.stringify(d));
  });
}

test('yönetici yazışmaları listeler, okur ve uygunsuz mesajı siler; her işlem kayda düşer', async ({ page }) => {
  await seedMessages(page);
  await login(page, 'admin@ornek.com');
  await page.getByRole('button', { name: 'Mesajlar' }).click();
  await expect(page.getByText('Yazışmalar özeldir')).toBeVisible();
  await expect(page.getByText('2 mesaj')).toBeVisible();
  await page.getByText('Moda Dairesi').first().click();
  await expect(page.getByText('Kira bu ay geç yatacak')).toBeVisible();
  await expect(page.getByText('Tamam, haber ver')).toBeVisible();

  // Silme önce onay ister.
  await page.getByRole('button', { name: 'Mesajı sil' }).first().click();
  await expect(page.getByText('Bu mesaj herkesten silinir')).toBeVisible();
  await page.getByRole('button', { name: 'Evet, sil' }).click();
  await expect(page.getByText('Kira bu ay geç yatacak')).toHaveCount(0);
  expect((await db(page)).tables.messages.map((m) => m.id)).toEqual(['m2']);

  await page.getByRole('button', { name: 'Geri' }).click();
  await page.getByRole('button', { name: 'İşlem kaydı', exact: true }).click();
  await expect(page.getByText('Mesaj silindi')).toBeVisible();
  await expect(page.getByText('Yazışma okundu').first()).toBeVisible();
  const log = (await db(page)).tables.admin_audit.map((a) => a.action);
  expect(log).toEqual(['messages.view', 'message.delete']);
});

test('yönetici hesabı gerekçeyle yasaklar; yasaklı giriş yapamaz; yasak kalkınca girer', async ({ page }) => {
  await login(page, 'admin@ornek.com');
  await page.getByRole('button', { name: 'Hesaplar', exact: true }).click();
  await page.getByLabel('Ara').fill('kiraci@ornek.com');
  await expect(page.getByRole('button', { name: 'Yasakla', exact: true })).toHaveCount(0);   // satır kapalı: işlemler dokununca açılır
  await page.getByRole('button', { name: /^Mehmet Kiracı/ }).click();
  await page.getByRole('button', { name: 'Yasakla', exact: true }).click();
  // Gerekçesiz olmaz.
  await page.getByRole('button', { name: 'Hesabı yasakla' }).click();
  await expect(page.getByText('Yasaklama için gerekçe yaz.')).toBeVisible();
  await page.getByLabel('Yasaklama gerekçesi').fill('Taciz içerikli mesajlar');
  await page.getByRole('button', { name: 'Hesabı yasakla' }).click();
  await expect(page.getByText('Askıda: Taciz içerikli mesajlar')).toBeVisible();
  expect((await db(page)).tables.bans).toHaveLength(1);
  // Yönetici kendini yasaklayamaz: kartında yasak düğmesi çıkmaz.
  await page.getByLabel('Ara').fill('admin@ornek.com');
  await page.getByRole('button', { name: /^Yönetici, Yönetici/ }).click();
  await expect(page.getByText('Kayıt').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Yasakla', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hesabı sil', exact: true })).toHaveCount(0);

  // Yasaklı kiracı giriş yapamaz; gerekçeyi görür.
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Hesabın askıya alındı: Taciz içerikli mesajlar')).toBeVisible();
  await expect(page).not.toHaveURL(/uygulama/);

  // Yasak kalkınca girer.
  await login(page, 'admin@ornek.com');
  await page.getByRole('button', { name: 'Hesaplar', exact: true }).click();
  await page.getByLabel('Ara').fill('kiraci@ornek.com');
  await page.getByRole('button', { name: /^Mehmet Kiracı/ }).click();
  await page.getByRole('button', { name: 'Yasağı kaldır' }).click();
  await expect(page.getByText('Askıda: ')).toHaveCount(0);
  expect((await db(page)).tables.bans).toHaveLength(0);
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();

  await login(page, 'admin@ornek.com');
  await page.getByRole('button', { name: 'İşlem kaydı', exact: true }).click();
  await expect(page.getByText('Hesap yasaklandı')).toBeVisible();
  await expect(page.getByText('Yasak kaldırıldı')).toBeVisible();
});

test('yönetici mesajdaki göndereni oradan yasaklayabilir; Hesaplar bağlantısız kiracıları süzer', async ({ page }) => {
  await seedMessages(page);
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('__fakedb'));
    d.users.push({ id: 'u-yeni', email: 'yeni@ornek.com', password: 'x', meta: { name: 'Yeni Kiracı', role: 'tenant' } });
    d.tables.profiles.push({ id: 'u-yeni', role: 'tenant', name: 'Yeni Kiracı', phone: '', lang: 'tr', settings: {}, created_at: new Date().toISOString() });
    localStorage.setItem('__fakedb', JSON.stringify(d));
  });
  await login(page, 'admin@ornek.com');
  await page.getByRole('button', { name: 'Hesaplar', exact: true }).click();
  await page.getByRole('button', { name: 'Mülke bağlanmamış kiracı: 1' }).click();
  await expect(page.getByText('Yeni Kiracı')).toBeVisible();
  await expect(page.getByText('yeni@ornek.com')).toBeVisible();
  await expect(page.getByText('Mehmet Kiracı')).toHaveCount(0);

  await page.getByRole('button', { name: 'Mesajlar' }).click();
  await page.getByText('Moda Dairesi').first().click();
  await page.getByRole('button', { name: 'Yasakla', exact: true }).first().click();      // en eski mesaj kiracıdan
  await page.getByLabel('Yasaklama gerekçesi').fill('Spam');
  await page.getByRole('button', { name: 'Hesabı yasakla' }).click();
  await expect.poll(async () => (await db(page)).tables.bans.map((b) => b.reason)).toEqual(['Spam']);
});

test('yönetici genel bakışı özet; Büyüme ve Gelir sayfalarında üyelik, gelir, kullanım göstergeleri ve aktivasyon hunisi', async ({ page }) => {
  await tenantUploads(page);
  await login(page, 'admin@ornek.com');
  await expect(page).toHaveURL(/\/admin$/);
  for (const label of ['Üye', 'Aylık gelir (tahmini)', 'Bu ay onaylı kira hacmi', 'Gelir, gider ve net', 'Gelir kırılımı', 'Gider kırılımı'])
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Gelir' }).first().click();
  await expect(page.getByText('Yıllık üyelik geliri (ARR, tahmini)', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Büyüme' }).first().click();
  for (const label of ['Üye', 'Deneme → ödeyen', 'Haftalık etkin kullanıcı', 'Davet kabul oranı (30 gün)', 'Aktivasyon hunisi', 'Günlük yeni kayıt'])
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  // Örnek veride tek mülk sahibi: mülkü ve bağlı kiracısı var.
  await expect(page.getByText(/^1\. Kayıt olan mülk sahibi$/)).toBeVisible();
  await expect(page.getByText(/^1 · 100%$/).first()).toBeVisible();
  await page.screenshot({ path: 'test-results/yonetici-genel-bakis.png', fullPage: true });
});

test('İngilizce: üst menüden dil değişir; fiyatlar dolar; site, uygulama ve yönetici panelinde çevrilmemiş metin kalmaz', async ({ page }) => {
  test.setTimeout(120_000);
  // Türkçe ana sayfada küre düğmesi seçiciyi açar; "EN" ile İngilizceye geçilir.
  await page.goto(url('/'));
  await page.getByRole('button', { name: 'Dil', exact: true }).first().click();
  await expect(page.getByLabel('Türkçe', { exact: true })).toBeVisible();
  await page.getByLabel('English', { exact: true }).click();
  await expect(page.getByText('to renting.').first()).toBeVisible();
  await expect(page.getByText('$2.00').first()).toBeVisible();
  await expect(page.getByText('$4.00').first()).toBeVisible();
  await page.getByRole('tab', { name: /Yearly/ }).click();
  await expect(page.getByText('$20.00').first()).toBeVisible();
  await expect(page.getByText('$40.00').first()).toBeVisible();
  await expect(page.getByText('₺99,99')).toHaveCount(0);
  // Ekranlar İngilizce gezilir; sözlükte karşılığı olmayan metin toplanır.
  const missing = new Set();
  const sweep = async () => { await page.waitForTimeout(800); (await page.evaluate(() => [...(globalThis.__i18nMissing || [])])).forEach((x) => missing.add(x)); };
  await sweep();
  const enLogin = async (email, path) => {
    await page.goto(url(path));
    await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
    await page.goto(url(path));
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PW);
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL(/\/(uygulama|admin)/);
    await sweep();
  };
  for (const p of ['/kayit/kiraci', '/kayit/mulk-sahibi', '/sifre']) { await page.goto(url(p)); await sweep(); }
  await enLogin('kiraci@ornek.com', '/giris/kiraci');
  for (const p of ['/uygulama/odemeler', '/uygulama/talepler', '/uygulama/belgeler']) { await page.goto(url(p)); await sweep(); }
  await enLogin('ev@ornek.com', '/giris/mulk-sahibi');
  for (const p of ['/uygulama/mulk?pid=p1', '/uygulama/mulk?pid=p1&sub=odeme', '/uygulama/mulk?pid=p1&sub=gider', '/uygulama/rapor', '/uygulama/takvim']) { await page.goto(url(p)); await sweep(); }
  await enLogin('admin@ornek.com', '/giris/yonetici');
  await expect(page.getByText('Overview').first()).toBeVisible();
  for (const tab of ['Accounts', 'Payments', 'Activity log']) { await page.getByRole('button', { name: tab, exact: true }).first().click(); await sweep(); }
  expect([...missing]).toEqual([]);
});


test('yönetici yasaklanmış hesabı e-postayı yazarak kalıcı siler; yasaksız hesapta silme düğmesi yok; işlem kayda düşer', async ({ page }) => {
  await login(page, 'admin@ornek.com');
  await page.getByRole('button', { name: 'Hesaplar', exact: true }).click();
  await page.getByLabel('Ara').fill('kiraci@ornek.com');
  await page.getByRole('button', { name: /^Mehmet Kiracı/ }).click();
  await expect(page.getByRole('button', { name: 'Hesabı sil', exact: true })).toHaveCount(0);     // önce yasaklanmalı
  await page.getByRole('button', { name: 'Yasakla', exact: true }).click();
  await page.getByLabel('Yasaklama gerekçesi').fill('Taciz');
  await page.getByRole('button', { name: 'Hesabı yasakla' }).click();
  await expect(page.getByText('Askıda: Taciz')).toBeVisible();
  await page.getByRole('button', { name: 'Hesabı sil', exact: true }).click();
  await expect(page.getByText('Bu işlem geri alınamaz.')).toBeVisible();
  const confirm = page.getByRole('button', { name: 'Kalıcı olarak sil' });
  await expect(confirm).toBeDisabled();                                                          // e-posta yazılmadan silinmez
  await page.getByLabel('Onay için hesabın e-postasını yaz').fill('baska@ornek.com');
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Onay için hesabın e-postasını yaz').fill('kiraci@ornek.com');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(page.getByText('Eşleşen hesap yok.')).toBeVisible();
  const d = await db(page);
  expect(d.users.some((u) => u.email === 'kiraci@ornek.com')).toBe(false);
  expect(d.tables.admin_audit.map((a) => a.action)).toContain('user.delete');
});

test('müşteri sağlığı: mülk eklemeyen hesap listede; temas notu kaydedilir ve "Son temas" görünür', async ({ page }) => {
  await page.goto(url('/giris'));
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('__fakedb'));
    const old = new Date(Date.now() - 10 * 864e5).toISOString();
    d.users.push({ id: 'u-bos', email: 'bos@ornek.com', password: 'x', meta: { name: 'Boş Mülk Sahibi', role: 'landlord' } });
    d.tables.profiles.push({ id: 'u-bos', role: 'landlord', name: 'Boş Mülk Sahibi', phone: '05320001122', lang: 'tr', settings: {}, created_at: old });
    localStorage.setItem('__fakedb', JSON.stringify(d));
  });
  await login(page, 'admin@ornek.com');
  await page.getByRole('button', { name: 'Müşteri sağlığı', exact: true }).click();
  await expect(page.getByText('Boş Mülk Sahibi')).toBeVisible();
  await expect(page.getByText('• 10 gündür mülk eklemedi')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ara', exact: true }).first()).toBeVisible();          // telefonla tek tıkla
  await page.getByRole('button', { name: 'Not ekle' }).first().click();
  await page.getByLabel('Temas notu').first().fill('Aradım, hafta sonu mülk ekleyecek.');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).first().click();
  await expect(page.getByText('Not kaydedildi.')).toBeVisible();
  await expect(page.getByText(/Son temas .*: Aradım, hafta sonu mülk ekleyecek\./)).toBeVisible();     // kart yerinde, not hemen görünür
  await expect(page.getByText('Boş Mülk Sahibi')).toBeVisible();
  expect((await db(page)).tables.customer_contacts.map((x) => [x.user_id, x.note])).toEqual([['u-bos', 'Aradım, hafta sonu mülk ekleyecek.']]);
  // İkinci not: en yeni "Son temas" olur, geçmiş "Tüm notlar"da.
  await page.getByRole('button', { name: 'Not ekle' }).first().click();
  await page.getByLabel('Temas notu').first().fill('Ertesi gün tekrar aradım, mülkü ekledi.');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).first().click();
  await expect(page.getByText(/Son temas .*: Ertesi gün tekrar aradım/)).toBeVisible();
  await page.getByRole('button', { name: 'Tüm notlar (2)' }).click();
  await expect(page.getByText(/^\d.*: Aradım, hafta sonu mülk ekleyecek\.$/)).toBeVisible();
});

test('kira geçmişi belgesi: kiracı oluşturur; doğrulama sayfası oturumsuz açılır; yanlış kod doğrulanmaz', async ({ page }) => {
  const m = (n) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 7); };
  await page.goto(url('/giris'));
  await page.evaluate((months) => {
    const d = JSON.parse(localStorage.getItem('__fakedb'));
    d.tables.payments.push({ property_id: 'p1', month: months[0], kind: 'kira', status: 'approved', amount: 30000, paid_on: months[0] + '-03', method: 'dekont' },
                           { property_id: 'p1', month: months[1], kind: 'kira', status: 'approved', amount: 30000, paid_on: months[1] + '-20', method: 'dekont' });
    localStorage.setItem('__fakedb', JSON.stringify(d));
  }, [m(2), m(1)]);
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/belgeler'));
  await expect(page.getByText('Kira geçmişi belgesi')).toBeVisible();
  await page.getByRole('button', { name: 'Belge oluştur' }).click();
  await expect(page.getByText(/^Belge hazır · doğrulama kodu [0-9A-F]{10}$/)).toBeVisible();
  await expect(page.getByText('2 onaylı ödeme, 1 tanesi zamanında.')).toBeVisible();
  const code = (await db(page)).tables.rent_certificates[0].code;

  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await page.goto(url('/belge?kod=' + code.toLowerCase()));
  await expect(page.getByText('Doğrulandı · anahtar kayıtlarıyla aynı')).toBeVisible();
  await expect(page.getByText('Mehmet Kiracı')).toBeVisible();
  await expect(page.getByText('2/2').or(page.getByText('1/2'))).toBeVisible();
  await page.goto(url('/belge?kod=YANLIS1234'));
  await expect(page.getByText('Belge doğrulanamadı')).toBeVisible();
});
