// Gerçek hesap modu: istemci akışları sahte bir Supabase ile uçtan uca sınanır.
import { test, expect } from '@playwright/test';
import { watchErrors, PNG } from './helpers.mjs';

let errors;
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  await page.addInitScript(() => {
    window.EVIM_CONFIG = {
      supabaseUrl: 'https://sahte.supabase.co',
      supabaseAnonKey: 'anon',
      supabaseJs: location.origin + '/tests/fake-supabase.js'
    };
  });
});
test.afterEach(() => { expect(errors).toEqual([]); });

const db = page => page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb') || 'null'));
const screen = page => page.locator('#screen');
const sheet = page => page.locator('#layer .sheet');

async function signup(page, { name, email, password = 'gizli-sifre-1', role }){
  await page.goto('index.html#/kayit');
  await expect(page.locator('#screen h1')).toHaveText('Kayıt ol');
  await page.click(role === 'landlord' ? '.rolecard:has-text("Mülk sahibiyim")' : '.rolecard:has-text("Kiracıyım")');
  await page.fill('input[name=name]', name);
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.check('input[name=consent]');
  await page.click('button:has-text("Hesap oluştur")');
}

async function login(page, email, password = 'gizli-sifre-1'){
  await page.goto('index.html#/giris');
  await page.fill('input[name=email]', email);
  await page.fill('input[name=password]', password);
  await page.click('form button:has-text("Giriş yap")');
}

async function logout(page){
  await page.click('.shell button:has-text("Çıkış yap")');
  await expect(page).toHaveURL(/#\/giris$/);
}

test('kayıt formu kullanım koşulları ve aydınlatma metnine bağlanır', async ({ page }) => {
  await page.goto('index.html#/kayit');
  const box = page.locator('label.check');
  await expect(box.locator('a[href="https://kiracim.online/kosullar/"]')).toHaveText('Kullanım Koşulları’nı');
  await expect(box.locator('a[href="https://kiracim.online/gizlilik/"]')).toHaveText('Gizlilik ve KVKK Aydınlatma Metni’ni');
});

test('oturum yokken giriş ekranı açılır; demo öğeleri görünmez', async ({ page }) => {
  await page.goto('index.html#/mulk-sahibi/rapor');
  await expect(page).toHaveURL(/#\/giris$/);
  await expect(page.locator('#screen h1')).toHaveText('Giriş yap');
  await expect(page.locator('#tabbar')).toBeHidden();
  await expect(page.locator('.rolepill')).toHaveCount(0);
});

test('ev sahibi ve kiracı: kayıt, ev, davet, dekont, mesaj, onay', async ({ page }) => {
  // 1) Ev sahibi kaydolur, boş portföy görür, ev ekler.
  await signup(page, { name:'Ayşe Sahip', email:'ayse@ornek.com', role:'landlord' });
  await expect(page).toHaveURL(/#\/mulk-sahibi$/);
  await expect(screen(page)).toContainText('İlk mülkünü ekle');
  await expect(page.locator('.rolepill.status')).toContainText('Ayşe');

  await page.click('#screen button:has-text("Mülk ekle")');
  await sheet(page).locator('input[name=name]').fill('Test Evi');
  await sheet(page).locator('input[name=addr]').fill('Deneme Sk. 1');
  await sheet(page).locator('input[name=rent]').fill('25000');
  await sheet(page).locator('input[name=due]').fill('5');
  await sheet(page).locator('button:has-text("Kaydet ve davet et")').click();

  // 2) Ev sunucuya yazılır ve davet kodu oluşur.
  await expect(sheet(page)).toContainText('Kiracını davet et');
  const code = (await sheet(page).locator('.codebox').innerText()).trim();
  expect(code).toMatch(/^[A-Z0-9]{6,}$/);
  const d1 = await db(page);
  const owner = d1.users.find(u => u.email === 'ayse@ornek.com').id;
  expect(d1.tables.properties).toEqual([expect.objectContaining({ name:'Test Evi', owner_id:owner, rent:25000, due_day:5 })]);
  expect(d1.tables.invites.map(i => i.code)).toEqual([code]);
  await page.keyboard.press('Escape');
  await expect(screen(page)).toContainText('Davet bekleniyor');

  // 3) Kiracı davet bağlantısıyla gelir, kaydolur ve eve otomatik bağlanır.
  await logout(page);
  await page.goto('index.html#/katil/' + code);
  await expect(page.locator('#screen h1')).toHaveText('Kiraladığın mülke davet edildin');
  await page.click('button:has-text("Kiracı hesabı oluştur")');
  await expect(page.locator('.note')).toContainText(code);
  await expect(page.locator('.rolecard:has-text("Mülk sahibiyim")')).toHaveClass(/off/);
  await page.fill('input[name=name]', 'Mehmet Kiracı');
  await page.fill('input[name=email]', 'mehmet@ornek.com');
  await page.fill('input[name=password]', 'gizli-sifre-2');
  await page.check('input[name=consent]');
  await page.click('button:has-text("Hesap oluştur")');
  await expect(page).toHaveURL(/#\/kiraci$/);
  await expect(page.locator('#screen h1')).toHaveText('Test Evi');
  await expect(screen(page)).toContainText('Ayşe Sahip');

  // 4) Kiracı ev sahibi ekranlarına giremez.
  await page.goto('index.html#/mulk-sahibi/rapor');
  await expect(page).toHaveURL(/#\/kiraci$/);

  // 5) Dekont yükler: ödeme satırı ve dosya sunucuya gider.
  await page.goto('index.html#/kiraci/odemeler');
  await page.click('.hero button:has-text("Dekont yükle")');
  await sheet(page).locator('input[name=amount]').fill('25000');
  await sheet(page).locator('input[type=file]').setInputFiles(PNG);
  await sheet(page).locator('button:has-text("Gönder")').click();
  const tenant = (await db(page)).users.find(u => u.email === 'mehmet@ornek.com').id;
  await expect.poll(async () => (await db(page)).tables.payments.map(p => [p.status, p.amount, !!p.receipt_path]))
    .toEqual([['review', 25000, true]]);
  expect(Object.keys((await db(page)).storage).length).toBe(1);

  // 6) Mesaj gönderir: gönderen rolü ve kullanıcı doğru.
  await page.goto('index.html#/kiraci/mesajlar');
  await page.fill('#msgIn', 'Merhaba, dekontu yükledim');
  await page.press('#msgIn', 'Enter');
  await expect.poll(async () => (await db(page)).tables.messages.filter(m => m.from_role === 'tenant').map(m => [m.body, m.by_user]))
    .toEqual([['Merhaba, dekontu yükledim', tenant]]);
  // Demo'daki otomatik yanıt gerçek hesapta yoktur.
  await page.waitForTimeout(2800);
  expect((await db(page)).tables.messages.filter(m => m.from_role === 'landlord')).toEqual([]);

  // 7) Ev sahibi girer, kiracıyı ve mesajı görür, ödemeyi onaylar.
  await logout(page);
  await login(page, 'ayse@ornek.com');
  await expect(page).toHaveURL(/#\/mulk-sahibi$/);
  const pid = (await db(page)).tables.properties[0].id;
  await page.goto('index.html#/mulk-sahibi/mulk/' + pid);
  await expect(screen(page)).toContainText('Mehmet Kiracı');
  await expect(screen(page)).not.toContainText('Davet bekleniyor');
  await page.goto('index.html#/mulk-sahibi/mulk/' + pid + '/mesaj');
  await expect(screen(page)).toContainText('Merhaba, dekontu yükledim');
  await page.goto('index.html#/mulk-sahibi/mulk/' + pid + '/odeme');
  await page.click('.hero button:has-text("Onayla")');
  await expect.poll(async () => (await db(page)).tables.payments[0].status).toBe('approved');
});

test('oturum sayfa yenilense de açık kalır', async ({ page }) => {
  await signup(page, { name:'Kalıcı Kullanıcı', email:'kalici@ornek.com', role:'landlord' });
  await expect(page).toHaveURL(/#\/mulk-sahibi$/);
  await page.reload();
  await expect(page.locator('#screen h1')).toHaveText('Portföyüm');
  await expect(page).toHaveURL(/#\/mulk-sahibi$/);
});

test('hatalı şifre anlaşılır bir mesaj gösterir', async ({ page }) => {
  await signup(page, { name:'A', email:'a@ornek.com', role:'landlord' });
  await logout(page);
  await login(page, 'a@ornek.com', 'yanlis-sifre');
  await expect(page.locator('.note.warn')).toHaveText('E-posta ya da şifre hatalı.');
});

test('kayıt formu eksikleri söyler, e-posta doğrulaması gerekiyorsa bilgi verir', async ({ page }) => {
  await page.goto('index.html#/kayit');
  await page.fill('input[name=name]', 'Deneme');
  await page.fill('input[name=email]', 'dogrula@ornek.com');
  await page.fill('input[name=password]', 'kisa');
  await page.click('button:has-text("Hesap oluştur")');
  await expect(page.locator('.note.warn')).toHaveText('Şifre en az 8 karakter olmalı.');
  await page.fill('input[name=password]', 'yeterince-uzun');
  await page.click('button:has-text("Hesap oluştur")');
  await expect(page.locator('.note.warn')).toContainText('koşulları kabul');
  await page.check('input[name=consent]');
  await page.click('button:has-text("Hesap oluştur")');
  await expect(page).toHaveURL(/#\/giris$/);
  await expect(page.locator('.note')).toContainText('doğrulama bağlantısı');
});

test('evsiz kiracı kodu sonradan girerek bağlanır', async ({ page }) => {
  await signup(page, { name:'Sahip', email:'s@ornek.com', role:'landlord' });
  await page.click('#screen button:has-text("Mülk ekle")');
  await sheet(page).locator('input[name=name]').fill('Kodlu Ev');
  await sheet(page).locator('input[name=addr]').fill('Adres');
  await sheet(page).locator('input[name=rent]').fill('10000');
  await sheet(page).locator('button:has-text("Kaydet ve davet et")').click();
  const code = (await sheet(page).locator('.codebox').innerText()).trim();
  await page.keyboard.press('Escape');
  await logout(page);

  await signup(page, { name:'Kiracı', email:'k@ornek.com', role:'tenant' });
  await expect(page).toHaveURL(/#\/davet$/);
  await page.fill('input[name=code]', 'YANLIS');
  await page.click('button:has-text("Mülke bağlan")');
  await expect(page.locator('.note.warn')).toContainText('bulunamadı');
  await page.fill('input[name=code]', code.toLowerCase());
  await page.click('button:has-text("Mülke bağlan")');
  await expect(page).toHaveURL(/#\/kiraci$/);
  await expect(page.locator('#screen h1')).toHaveText('Kodlu Ev');
});

test('sunucu değişikliği reddederse kullanıcıya söylenir ve kayıt geri alınır', async ({ page }) => {
  await signup(page, { name:'Sahip', email:'r@ornek.com', role:'landlord' });
  await page.click('#screen button:has-text("Mülk ekle")');
  await sheet(page).locator('input[name=name]').fill('Ret Evi');
  await sheet(page).locator('input[name=addr]').fill('Adres');
  await sheet(page).locator('input[name=rent]').fill('10000');
  await sheet(page).locator('button:has-text("Kaydet ve davet et")').click();
  await expect(sheet(page)).toContainText('Kiracını davet et');
  await page.keyboard.press('Escape');

  const pid = (await db(page)).tables.properties[0].id;
  await page.evaluate(() => { globalThis.__fakeClient._fail = (t, op) => t === 'expenses' && op === 'upsert'; });
  await page.goto('index.html#/mulk-sahibi/mulk/' + pid + '/gider');
  await page.click('button:has-text("Gider ekle")');
  await sheet(page).locator('input[name=amount]').fill('777');
  await sheet(page).locator('input[name=note]').fill('Reddedilecek');
  await sheet(page).locator('button:has-text("Kaydet")').click();
  await expect(page.locator('#banners')).toContainText('Kaydedilemedi');

  await page.evaluate(() => { globalThis.__fakeClient._fail = null; });
  // Sunucu reddettiği için yerel kayıt geri alınır (sunucudaki hal yüklenir).
  await expect(screen(page)).not.toContainText('Reddedilecek');
});

test('hesap sayfası: profil güncelleme ve hesabı silme', async ({ page }) => {
  await signup(page, { name:'Eski Ad', email:'hesap@ornek.com', role:'landlord' });
  await page.click('.rolepill.status');
  await expect(sheet(page)).toContainText('hesap@ornek.com');
  await sheet(page).locator('input[name=name]').fill('Yeni Ad');
  await sheet(page).locator('form[data-form=profile] button').click();
  await expect.poll(async () => (await db(page)).tables.profiles[0].name).toBe('Yeni Ad');

  await sheet(page).locator('button:has-text("Hesabı sil")').click();
  await page.locator('#confirm button:has-text("Hesabı sil")').click();
  await expect(page).toHaveURL(/#\/giris$/);
  expect((await db(page)).users).toEqual([]);
});

/* ---- abonelik ---- */

test('yeni mülk sahibi deneme sürümüyle başlar; kiracıda abonelik yok', async ({ page }) => {
  await signup(page, { name:'Deniz Sahip', email:'deniz@ornek.com', role:'landlord' });
  await expect(page).toHaveURL(/#\/mulk-sahibi$/);
  await expect(screen(page).locator('.subbar')).toContainText('Deneme sürümü');
  await expect(screen(page).locator('.subbar')).toContainText('14 gün kaldı');
  await page.click('.subbar button:has-text("Abone ol")');
  await expect(sheet(page).locator('h3')).toHaveText('Mülk sahibi aboneliği');
  await expect(sheet(page)).toContainText('kendiliğinden yenilenir');
  await expect(sheet(page).locator('.plan')).toHaveCount(2);
  // Web'den satış kapalıyken: fiyatlar görünür, abonelik telefondaki uygulamaya yönlendirilir.
  await expect(sheet(page).locator('.plan[data-v=monthly] .price')).toHaveText('₺249,99');
  await expect(sheet(page).locator('button[data-act=subscribe]')).toHaveCount(0);
  await expect(sheet(page)).toContainText('iPhone ya da Android uygulamasından');
  await page.keyboard.press('Escape');

  await logout(page);
  await signup(page, { name:'Kerem Kiracı', email:'kerem@ornek.com', role:'tenant' });
  await expect(page.locator('.subbar')).toHaveCount(0);
});

test('deneme bitince kayıtlar salt okunur; abonelik geri yüklenince açılır', async ({ page }) => {
  await signup(page, { name:'Ece Sahip', email:'ece@ornek.com', role:'landlord' });
  await expect(page).toHaveURL(/#\/mulk-sahibi$/);
  // Deneme süresi 30 gün önce başlamış olsun.
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('__fakedb'));
    d.tables.profiles.forEach(p => { p.created_at = new Date(Date.now() - 30 * 86400000).toISOString(); });
    localStorage.setItem('__fakedb', JSON.stringify(d));
  });
  await page.reload();
  await expect(screen(page).locator('.subbar.lock')).toContainText('Deneme süren bitti');

  // Mülk eklemek abonelik sayfasını açar, kayıt oluşmaz.
  await page.click('#screen button:has-text("Mülk ekle")');
  await sheet(page).locator('input[name=name]').fill('Kilitli');
  await sheet(page).locator('input[name=addr]').fill('A');
  await sheet(page).locator('input[name=rent]').fill('1000');
  await sheet(page).locator('button:has-text("Kaydet ve davet et")').click();
  await expect(sheet(page).locator('h3')).toHaveText('Mülk sahibi aboneliği');
  await expect(page.locator('#banners')).toContainText('Abonelik gerekli');
  expect((await db(page)).tables.properties).toEqual([]);

  // Mağazada satın alınmış abonelik "geri yükle" ile gelir.
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('__fakedb'));
    d.nextSubscription = { active:true, expires_at:new Date(Date.now() + 30 * 86400000).toISOString(), store:'app_store', product_id:'evim_aylik', will_renew:true };
    localStorage.setItem('__fakedb', JSON.stringify(d));
  });
  await sheet(page).locator('button:has-text("Satın alımları geri yükle")').click();
  await expect(page.locator('#banners')).toContainText('Aboneliğin geri yüklendi');
  await expect(sheet(page)).toContainText('Aboneliğin aktif');
  await expect(sheet(page)).toContainText('App Store');
  await expect(sheet(page).locator('a:has-text("Aboneliği yönet")')).toHaveAttribute('href', /apps\.apple\.com/);
  // Geri: yarım kalan forma dönülür; artık kaydedilebilir.
  await page.keyboard.press('Escape');
  await expect(sheet(page).locator('h3')).toHaveText('Mülk ekle');
  await expect(page.locator('.subbar')).toHaveCount(0);
  await sheet(page).locator('input[name=name]').fill('Açık');
  await sheet(page).locator('input[name=addr]').fill('A');
  await sheet(page).locator('input[name=rent]').fill('1000');
  await sheet(page).locator('button:has-text("Kaydet ve davet et")').click();
  await expect(sheet(page)).toContainText('Kiracını davet et');
  expect((await db(page)).tables.properties.map(p => p.name)).toEqual(['Açık']);
});
