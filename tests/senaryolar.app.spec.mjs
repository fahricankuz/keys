// Kullanıcı senaryoları: ziyaretçi, kayıt olan kişi, kiracı, mülk sahibi, yönetici gözünden uçtan uca yollar ve hatalı kullanım.
// Sahte sunucuyla gerçek tarayıcıda çalışır; liste ve sonuçlar: docs/kullanici-senaryolari.md
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist, ID } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8300 + Number(process.env.TEST_PARALLEL_INDEX || 0);   // testler paralel: her işçiye ayrı sunucu
let server, errors;
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(({ page }) => { errors = watchErrors(page); });
const url = (p) => `http://localhost:${PORT}${p}`;
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
const seedDb = (page, d = seed()) => page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, d);
const ENTRY = { 'kiraci@ornek.com': '/giris/kiraci', 'ev@ornek.com': '/giris/mulk-sahibi', 'admin@ornek.com': '/giris/yonetici' };
async function login(page, email) {
  await page.goto(url(ENTRY[email]));
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
}
const noScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

/* ---------- Ziyaretçi ---------- */
for (const path of ['/', '/kurumsal', '/satin-al', '/kira-artis-hesaplama', '/cozumler', '/cozumler/emlak-ofisi', '/giris', '/kayit', '/belge', '/katil', '/sifre']) {
  test(`Z1 ziyaretçi ${path} sayfasını hatasız açar: başlık var, hata ekranı yok`, async ({ page }) => {
    await page.goto(url(path));
    await expect(page.locator('body')).not.toContainText('Bir şeyler ters gitti');
    await expect(page).toHaveTitle(/.+/);
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
}

test('Z2 ziyaretçi olmayan bir adrese gider: anlaşılır sayfa ve ana sayfaya dönüş yolu', async ({ page }) => {
  await page.goto(url('/boyle-bir-sayfa-yok'));
  await expect(page.locator('body')).not.toContainText('Bir şeyler ters gitti');
  await expect(page.getByRole('link').first()).toBeVisible();
  // Tarayıcı, sunucunun doğru 404 yanıtını konsola yazar; uygulama hatası değildir.
  expect(errors.filter((e) => !/status of 404/.test(e))).toEqual([]);
});

test('Z3 yanlış belge kodu: kod bulunamadı denir, hata ekranı çıkmaz', async ({ page }) => {
  await seedDb(page);
  await page.goto(url('/belge?kod=0000000000'));
  await expect(page.locator('body')).not.toContainText('Bir şeyler ters gitti');
  await expect(page.getByText(/bulunamadı|geçersiz|doğrulanamadı/i).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('Z4 yanlış davet kodu: geçersiz denir, hesap açmaya zorlamaz', async ({ page }) => {
  await seedDb(page);
  await page.goto(url('/katil?kod=YANLIS99'));
  await expect(page.locator('body')).not.toContainText('Bir şeyler ters gitti');
  await expect(page.getByText('Davet bulunamadı')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Kiracı hesabı oluştur' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('kiracim-davet'))).toBeNull();   // yanlış kod kayıttan sonra denenmez
  expect(errors).toEqual([]);
});

test('Z4b var olmayan site davet kodu da bulunamadı der', async ({ page }) => {
  await seedDb(page);
  await page.goto(url('/katil?kod=SABCDEF0'));
  await expect(page.getByText('Davet bulunamadı')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Z4c kullanılmış davet: kişi uyarılır', async ({ page }) => {
  const d = seed();
  d.tables.invites.push({ code: 'ABCD1234', property_id: 'p1', created_by: ID.landlord, accepted_by: ID.tenant });
  await seedDb(page, d);
  await page.goto(url('/katil?kod=ABCD1234'));
  await expect(page.getByText(/kullanılmış ya da süresi dolmuş/)).toBeVisible();
  await expect(page.getByText('Davet bulunamadı')).toHaveCount(0);
});

test('Z4d sunucuya ulaşılamazsa geçerli olabilecek davet silinmez, davet sayfası kalır', async ({ page }) => {
  await seedDb(page);
  await page.addInitScript(() => localStorage.setItem('__fakefail', '2'));
  await page.goto(url('/katil?kod=ABCD1234'));
  await expect(page.getByRole('button', { name: 'Kiracı hesabı oluştur' })).toBeVisible();
  await expect(page.getByText('Davet bulunamadı')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('kiracim-davet'))).toBe('ABCD1234');
});

test('Z5 kira artış hesaplayıcı: saçma girdide (harf, negatif) NaN ya da sonsuz görünmez', async ({ page }) => {
  await page.goto(url('/kira-artis-hesaplama'));
  const inputs = page.locator('input');
  await expect(inputs.first()).toBeVisible();
  for (const v of ['abc', '-5000', '99999999999999']) {
    await inputs.first().fill(v);
    await page.waitForTimeout(150);
    await expect(page.locator('body')).not.toContainText(/NaN|Infinity|undefined/);
  }
  expect(errors).toEqual([]);
});

/* ---------- Kayıt ve giriş ---------- */
async function signupForm(page, { name = 'Deneme Kişi', email = 'yeni@ornek.com', pass = 'gizli-sifre-1', pass2 = pass, accept = true } = {}) {
  await page.goto(url('/kayit/kiraci'));
  if (name) await page.getByLabel('Ad soyad').fill(name);
  if (email) await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(pass);
  await page.getByLabel('Şifre (tekrar)').fill(pass2);
  if (accept) await page.getByRole('checkbox').click({ position: { x: 10, y: 10 } });
  await page.getByRole('button', { name: /Hesap oluştur|ücretsiz başla/ }).click();
}
const stillOnSignup = (page) => expect(page).toHaveURL(/\/kayit/);

test('K1 kayıt: şifreler uyuşmuyorsa hesap açılmaz, sebep söylenir', async ({ page }) => {
  await seedDb(page);
  await signupForm(page, { pass2: 'baska-sifre-2' });
  await expect(page.getByText(/eşleşmiyor|uyuşmuyor|aynı değil/i).first()).toBeVisible();
  await stillOnSignup(page);
  expect((await db(page)).users.map((u) => u.email)).not.toContain('yeni@ornek.com');
});

test('K2 kayıt: kısa şifre reddedilir', async ({ page }) => {
  await seedDb(page);
  await signupForm(page, { pass: '123' });
  await stillOnSignup(page);
  expect((await db(page)).users.map((u) => u.email)).not.toContain('yeni@ornek.com');
});

test('K3 kayıt: geçersiz e-posta reddedilir', async ({ page }) => {
  await seedDb(page);
  await signupForm(page, { email: 'bu-eposta-degil' });
  await stillOnSignup(page);
  await expect(page.getByText('Geçerli bir e-posta adresi yaz.')).toBeVisible();
  expect((await db(page)).users.map((u) => u.email)).not.toContain('bu-eposta-degil');
});

test('K4 kayıt: sözleşme onayı olmadan hesap açılmaz', async ({ page }) => {
  await seedDb(page);
  await signupForm(page, { accept: false });
  await stillOnSignup(page);
  expect((await db(page)).users.map((u) => u.email)).not.toContain('yeni@ornek.com');
});

test('K5 kayıt: kullanılan e-postayla ikinci hesap açılmaz', async ({ page }) => {
  await seedDb(page);
  await signupForm(page, { email: 'kiraci@ornek.com' });
  await stillOnSignup(page);
  expect((await db(page)).users.filter((u) => u.email === 'kiraci@ornek.com').length).toBe(1);
});

test('K6 kayıt: düğmeye art arda basmak tek hesap açar', async ({ page }) => {
  await seedDb(page);
  await page.goto(url('/kayit/kiraci'));
  await page.getByLabel('Ad soyad').fill('Çift Tık');
  await page.getByLabel('E-posta').fill('cift@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill('gizli-sifre-1');
  await page.getByLabel('Şifre (tekrar)').fill('gizli-sifre-1');
  await page.getByRole('checkbox').click({ position: { x: 10, y: 10 } });
  await page.getByRole('button', { name: /Hesap oluştur|ücretsiz başla/ }).dblclick();
  await expect(page).toHaveURL(/\/uygulama/);
  expect((await db(page)).users.filter((u) => u.email === 'cift@ornek.com').length).toBe(1);
});

test('K7 giriş: oturumu açık kişi giriş sayfasında formu değil "Panele git" düğmesini görür, paneline döner', async ({ page }) => {
  await seedDb(page);
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/giris/kiraci'));
  await expect(page.getByLabel('Şifre', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Panele git' }).click();
  await expect(page).toHaveURL(/\/uygulama/);
});

test('K8 çıkış: çıkış yaptıktan sonra panel adresi veriyi göstermez', async ({ page }) => {
  await seedDb(page);
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/ayarlar'));
  await page.getByRole('button', { name: /Çıkış yap/ }).first().click();
  const again = page.getByRole('button', { name: /^(Çıkış yap|Evet|Çık)$/ });
  if (await again.count() > 0 && /\/uygulama/.test(page.url())) await again.last().click().catch(() => {});
  await expect(page).not.toHaveURL(/\/uygulama/);
  await page.goto(url('/uygulama'));
  await expect(page).toHaveURL(/\/giris/);
  await expect(page.getByText('Moda Dairesi')).toHaveCount(0);
});

/* ---------- Kiracı ---------- */
async function tenantChat(page) {
  await seedDb(page);
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/mesajlar'));
  return page.getByPlaceholder(/mesaj/i).first();
}

test('T1 kiracı mesajı: emoji ve Türkçe karakterler bozulmaz, yenileyince yerinde', async ({ page }) => {
  const box = await tenantChat(page);
  const text = 'Musluk çalışmıyor, şöyle ğüşıöç 🔧🏠';
  await box.fill(text);
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect(page.getByText(text).first()).toBeVisible();
  await expect.poll(async () => (await db(page)).tables.messages.map((m) => m.body), { timeout: 10_000 }).toContain(text);
  await page.reload();
  await expect(page.getByText(text).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('T2 kiracı mesajı: boş ya da yalnız boşluklu mesaj gönderilmez', async ({ page }) => {
  const box = await tenantChat(page);
  await box.fill('     ');
  const btn = page.getByRole('button', { name: 'Gönder' });
  if (await btn.isEnabled().catch(() => false)) await btn.click({ timeout: 1000 }).catch(() => {});
  await page.waitForTimeout(1200);
  expect((await db(page)).tables.messages).toEqual([]);
});

test('T3 kiracı mesajı: çok uzun metin sayfayı yatay taşırmaz', async ({ page }) => {
  const box = await tenantChat(page);
  await box.fill('uzunkelime'.repeat(400));
  await page.getByRole('button', { name: 'Gönder' }).click();
  await page.waitForTimeout(800);
  expect(await noScroll(page)).toBe(true);
  expect(errors).toEqual([]);
});

test('T4 kiracı: başkasının mülküne ait adres ve yönetici paneli açılmaz', async ({ page }) => {
  const d = seed();
  d.tables.properties.push({ ...d.tables.properties[0], id: 'p9', name: 'Gizli Yalı', owner_id: ID.admin });
  await seedDb(page, d);
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await expect(page.getByText('Gizli Yalı')).toHaveCount(0);
  await page.goto(url('/uygulama/mulk?id=p9'));
  await page.waitForTimeout(800);
  await expect(page.getByText('Gizli Yalı')).toHaveCount(0);
  await page.goto(url('/admin'));
  await expect(page).toHaveURL(/\/uygulama/);
});

test('T5 kiracı: tüm panel sayfaları hatasız açılır', async ({ page }) => {
  test.setTimeout(60_000);
  await seedDb(page);
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  for (const p of ['/uygulama', '/uygulama/mesajlar', '/uygulama/odemeler', '/uygulama/talepler', '/uygulama/belgeler', '/uygulama/takvim', '/uygulama/ayarlar', '/uygulama/mulk']) {
    await page.goto(url(p));
    await page.waitForTimeout(400);
    await expect(page.locator('body'), p).not.toContainText('Bir şeyler ters gitti');
    await expect(page.locator('body'), p).not.toContainText(/NaN|undefined|\[object Object\]/);
  }
  expect(errors).toEqual([]);
});

test('T6 kiracı: dekont olarak bozuk ya da yanlış dosya seçince açıklama görür, uygulama kırılmaz', async ({ page }) => {
  await seedDb(page);
  await login(page, 'kiraci@ornek.com');
  await page.getByRole('button', { name: 'Dekont yükle' }).first().click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Dosya seç' }).click();
  await (await chooser).setFiles({ name: 'virus.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('MZ') });
  await page.waitForTimeout(800);
  await expect(page.locator('body')).not.toContainText('Bir şeyler ters gitti');
  expect((await db(page)).tables.payments.filter((p) => p.status === 'review').length).toBe(0);
  expect(errors).toEqual([]);
});

test('T7 kiracı telefonda: panel ve mesajlar yatay taşmaz @mobil', async ({ page }) => {
  await seedDb(page);
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  for (const p of ['/uygulama', '/uygulama/mesajlar', '/uygulama/odemeler', '/uygulama/ayarlar']) {
    await page.goto(url(p));
    await page.waitForTimeout(400);
    expect(await noScroll(page), p).toBe(true);
  }
});

/* ---------- Mülk sahibi ---------- */
async function landlord(page) {
  await seedDb(page);
  await login(page, 'ev@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
}

test('M1 mülk sahibi: tüm panel sayfaları hatasız açılır', async ({ page }) => {
  test.setTimeout(60_000);
  await landlord(page);
  for (const p of ['/uygulama', '/uygulama/mesajlar', '/uygulama/odemeler', '/uygulama/talepler', '/uygulama/belgeler', '/uygulama/takvim', '/uygulama/rapor', '/uygulama/ayarlar', '/uygulama/mulk', '/uygulama/ekip', '/uygulama/ice-aktar']) {
    await page.goto(url(p));
    await page.waitForTimeout(400);
    await expect(page.locator('body'), p).not.toContainText('Bir şeyler ters gitti');
    await expect(page.locator('body'), p).not.toContainText(/NaN|undefined|\[object Object\]/);
  }
  expect(errors).toEqual([]);
});

test('M2 mülk sahibi: formu boş bırakınca mülk oluşmaz, nedeni söylenir', async ({ page }) => {
  await landlord(page);
  await page.getByRole('button', { name: 'Mülk ekle' }).first().click();
  await page.getByRole('button', { name: /^Kaydet/ }).first().click();
  await page.waitForTimeout(500);
  expect((await db(page)).tables.properties.length).toBe(1);
  await expect(page.getByText(/gerekli|zorunlu|yaz|gir|seç/i).first()).toBeVisible();
});

test('M3 mülk sahibi: negatif kira ve geçersiz ödeme günü kabul edilmez', async ({ page }) => {
  await landlord(page);
  await page.getByRole('button', { name: 'Mülk ekle' }).first().click();
  await page.getByLabel('Mülk adı').fill('Hatalı Mülk');
  await page.getByLabel('Aylık kira (₺)').fill('-5000');
  await page.getByLabel('Ödeme günü').fill('45');
  await page.getByRole('button', { name: /^Kaydet/ }).first().click();
  await page.waitForTimeout(800);
  const made = (await db(page)).tables.properties.find((p) => p.name === 'Hatalı Mülk');
  if (made) { expect(made.rent).toBeGreaterThanOrEqual(0); expect(made.due_day).toBeLessThanOrEqual(31); }
});

test('M4 mülk sahibi: HTML içeren mülk adı metin olarak görünür, çalışmaz', async ({ page }) => {
  const d = seed();
  d.tables.properties[0].name = '<img src=x onerror="window.__xss=1">Moda Dairesi';
  await seedDb(page, d);
  await login(page, 'ev@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
});

/* ---------- Yönetici ---------- */
test('Y1 yönetici: hata kayıtlarını silmeden önce onay sorulur, vazgeçince silinmez', async ({ page }) => {
  const d = seed();
  d.tables.client_errors = [{ id: 1, at: new Date().toISOString(), user_id: null, route: '/', message: 'Saklanacak hata', stack: '', kind: 'error', platform: 'web', version: '1', agent: '' }];
  await seedDb(page, d);
  await login(page, 'admin@ornek.com');
  await page.getByRole('button', { name: /^Hatalar/ }).click();
  await expect(page.getByText('Saklanacak hata')).toBeVisible();
  let asked = null;
  page.once('dialog', async (dg) => { asked = dg.message(); await dg.dismiss(); });
  await page.getByRole('button', { name: 'Kayıtları temizle' }).click();
  await page.waitForTimeout(500);
  expect(asked, 'onay sorulmadı').toContain('Hata kayıtları silinsin mi?');
  expect((await db(page)).tables.client_errors.length).toBe(1);
  await expect(page.getByText('Saklanacak hata')).toBeVisible();
  page.once('dialog', (dg) => dg.accept());
  await page.getByRole('button', { name: 'Kayıtları temizle' }).click();
  await expect(page.getByText('Hata kaydı yok.')).toBeVisible();
});

test('Y2 yönetici değil: oturumsuz kişi /admin yerine girişe yönlenir', async ({ page }) => {
  await seedDb(page);
  await page.goto(url('/admin'));
  await expect(page).toHaveURL(/\/giris/);
});

/* ---------- Dayanıklılık ---------- */
test('D1 bağlantı giderse: mesaj kaybolmaz, bağlantı gelince gider, hata kaydı dolmaz', async ({ page }) => {
  const box = await tenantChat(page);
  await page.evaluate(() => localStorage.setItem('__fakefail', '2'));
  await box.fill('Çevrimdışı mesaj');
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect(page.getByText('Çevrimdışı mesaj').first()).toBeVisible();
  await page.waitForTimeout(1000);
  await page.evaluate(() => { localStorage.removeItem('__fakefail'); window.dispatchEvent(new Event('online')); });
  await expect.poll(async () => (await db(page)).tables.messages.map((m) => m.body), { timeout: 15_000 }).toContain('Çevrimdışı mesaj');
  expect(((await db(page)).tables.client_errors || []).length).toBe(0);
});

test('D2 sunucu mesajı reddederse kullanıcıya gönderilemediği gösterilir', async ({ page }) => {
  const box = await tenantChat(page);
  await page.evaluate(() => localStorage.setItem('__fakefail', '3'));
  await box.fill('Reddedilen mesaj');
  await page.getByRole('button', { name: 'Gönder' }).click();
  await expect(page.getByText('Kaydedilemedi').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('body')).not.toContainText('Bir şeyler ters gitti');
});

test('D3 oturum düşerse: sayfa kırılmaz, girişe yönlenir', async ({ page }) => {
  await seedDb(page);
  await login(page, 'ev@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.evaluate(() => window.__fakeExpire());
  await expect(page).toHaveURL(/\/giris/);
  expect(errors).toEqual([]);
});

test('D4 tarayıcıda geri/ileri: paneller arasında hata çıkmaz', async ({ page }) => {
  await seedDb(page);
  await login(page, 'kiraci@ornek.com');
  await expect(page.getByText('Moda Dairesi').first()).toBeVisible();
  await page.goto(url('/uygulama/mesajlar'));
  await page.goto(url('/uygulama/odemeler'));
  await page.goBack(); await page.goBack(); await page.goForward();
  await page.waitForTimeout(500);
  await expect(page.locator('body')).not.toContainText('Bir şeyler ters gitti');
  expect(errors).toEqual([]);
});

test('D5 İngilizce tarayıcı: anasayfa ve giriş hatasız, Türkçe hata ekranı yok', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'en-US' });
  const page = await ctx.newPage();
  const errs = watchErrors(page);
  await page.goto(url('/giris/kiraci'));
  await page.waitForTimeout(1500);
  await expect(page.locator('body')).not.toContainText(/NaN|undefined|Bir şeyler ters gitti/);
  expect(errs).toEqual([]);
  await ctx.close();
});
