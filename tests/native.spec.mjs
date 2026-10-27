// iOS / Android uyarlaması: yerel köprü sahte eklentilerle (tests/fake-native.js) taklit edilir.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { watchErrors, open, sheet } from './helpers.mjs';

const FAKE = readFileSync(new URL('./fake-native.js', import.meta.url), 'utf8');
const screen = page => page.locator('#screen');
const calls = (page, name) => page.evaluate(n => window.__native.called(n).map(c => c.args), name);

let errors;
test.beforeEach(({ page }) => { errors = watchErrors(page); });
test.afterEach(() => { expect(errors).toEqual([]); });

async function asNative(page, cfg = {}, live = false){
  await page.addInitScript(({ cfg, live }) => {
    window.__nativeCfg = cfg;
    if (live) window.EVIM_CONFIG = { supabaseUrl:'https://sahte.supabase.co', supabaseAnonKey:'anon', supabaseJs: location.origin + '/tests/fake-supabase.js', publicUrl:'https://kiracim.online/',
      billing:{ revenuecatIosKey:'appl_x', revenuecatAndroidKey:'goog_x', plans:[{ id:'monthly', package:'$rc_monthly', price:'' }, { id:'annual', package:'$rc_annual', price:'' }], androidPackage:'online.kiracim.app' } };
  }, { cfg, live });
  await page.addInitScript(FAKE);
}

test('telefonda service worker ve kurulum önerisi yok; açılış ekranı kapanır', async ({ page }) => {
  await asNative(page);
  await open(page, '#/mulk-sahibi');
  await expect(page.locator('html')).toHaveClass(/native native-android/);
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length))).toBe(0);
  await expect(page.locator('[data-act=install]')).toHaveCount(0);
  expect((await calls(page, 'SplashScreen.hide')).length).toBeGreaterThan(0);
  expect((await calls(page, 'StatusBar.setStyle'))[0][0]).toEqual({ style:'LIGHT' });
});

test('Android geri tuşu: önce alt sayfa, sonra geçmiş; kökte uygulama küçülür', async ({ page }) => {
  await asNative(page);
  await open(page, '#/mulk-sahibi');
  await page.click('[data-act=nav][data-go="/mulk-sahibi/mulk/levent"]');
  await expect(screen(page).locator('h1')).toHaveText('Levent ofis');
  await page.click('[data-act=sheet][data-s=ev-duzenle]');
  await expect(sheet(page)).toBeVisible();
  await page.evaluate(() => window.__native.fire('App:backButton', { canGoBack:true }));
  await expect(sheet(page)).toHaveCount(0);
  await page.evaluate(() => window.__native.fire('App:backButton', { canGoBack:true }));
  await expect(page).toHaveURL(/#\/mulk-sahibi$/);
  await page.evaluate(() => window.__native.fire('App:backButton', { canGoBack:false }));
  expect((await calls(page, 'App.minimizeApp')).length).toBe(1);
});

test('uygulamayı açan bağlantılar doğru ekrana gider', async ({ page }) => {
  await asNative(page);
  await open(page, '#/mulk-sahibi');
  await page.evaluate(() => window.__native.fire('App:appUrlOpen', { url:'https://kiracim.online/#/mulk-sahibi/mulk/bagdat/odeme' }));
  await expect(page).toHaveURL(/#\/mulk-sahibi\/mulk\/bagdat\/odeme$/);

  const parsed = await page.evaluate(async () => {
    const { parseOpenUrl } = await import('./assets/js/native.js');
    return [
      parseOpenUrl('https://kiracim.online/katil/ABC123'),
      parseOpenUrl('evim://katil/XYZ789'),
      parseOpenUrl('evim://auth?code=kod-1'),
      parseOpenUrl('https://kiracim.online/auth?code=kod-2'),
      parseOpenUrl('bozuk adres')
    ];
  });
  expect(parsed).toEqual([
    { code:null, route:'/katil/ABC123' },
    { code:null, route:'/katil/XYZ789' },
    { code:'kod-1', route:null },
    { code:'kod-2', route:null },
    { code:null, route:null }
  ]);
});

test('uygulama kilidi: açılınca doğrulama ister, yeniden açılışta kilit ekranı gelir', async ({ page }) => {
  await asNative(page, { platform:'ios' });
  await open(page, '#/mulk-sahibi?s=ayarlar');
  await expect(sheet(page)).toContainText('Face ID / Touch ID ile kilitle');
  await sheet(page).locator('input[data-input=appLock]').check();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('evim-kilit'))).toBe('1');
  expect((await calls(page, 'Bio.authenticate')).length).toBe(1);

  // Yeniden açılış: doğrulama başarısız → kilit ekranı kalır; düğmeyle tekrar dene.
  await page.addInitScript(() => { window.__nativeCfg = Object.assign(window.__nativeCfg || {}, { authOk:false }); });
  await page.reload();
  await expect(page.locator('#lock')).toBeVisible();
  await expect(page.locator('#lock')).toContainText('Kiracım kilitli');
  await page.evaluate(() => window.__native.setAuth(true));
  await page.click('#unlockBtn');
  await expect(page.locator('#lock')).toBeHidden();
});

test('gerçek hesapta: oturum güvenli depoda, e-posta bağlantısı uygulamaya döner, davet bağlantısı yayın adresiyle', async ({ page }) => {
  await asNative(page, {}, true);
  await page.goto('index.html#/kayit');
  await expect(page.locator('#screen h1')).toHaveText('Kayıt ol');
  const opts = await page.evaluate(() => {
    const a = window.__fakeClient._opts.auth;
    return { detect: a.detectSessionInUrl, storage: typeof a.storage?.getItem };
  });
  expect(opts).toEqual({ detect:false, storage:'function' });

  const links = await page.evaluate(async () => {
    const b = await import('./assets/js/backend.js');
    return { invite: b.inviteLink('ABC123'), redirect: b.redirect() };
  });
  expect(links).toEqual({ invite:'https://kiracim.online/katil/ABC123', redirect:'https://kiracim.online/auth' });

  // Kayıt ol, çık; şifre sıfırlama bağlantısı uygulamayı açınca yeni şifre ekranı gelir.
  await page.click('.rolecard:has-text("Kiracıyım")');
  await page.fill('input[name=name]', 'Can Kiracı');
  await page.fill('input[name=email]', 'can@ornek.com');
  await page.fill('input[name=password]', 'gizli-sifre-1');
  await page.check('input[name=consent]');
  await page.click('button:has-text("Hesap oluştur")');
  await expect(page).toHaveURL(/#\/(kiraci|davet)/);
  await page.evaluate(() => window.__fakeClient.auth.signOut());
  await expect(page).toHaveURL(/#\/giris$/);
  await page.evaluate(() => window.__native.fire('App:appUrlOpen', { url:'https://kiracim.online/auth?code=recovery-1' }));
  await expect(page.locator('#screen h1')).toHaveText('Yeni şifreni belirle');
  expect(await page.evaluate(() => window.__fakeClient._calls.filter(c => c.exchange).map(c => c.exchange))).toEqual(['recovery-1']);
});

test('gerçek hesapta: anlık bildirim izni, cihaz anahtarı ve bildirime dokununca yönlenme', async ({ page }) => {
  await asNative(page, {}, true);
  await page.goto('index.html#/kayit');
  await page.click('.rolecard:has-text("Mülk sahibiyim")');
  await page.fill('input[name=name]', 'Nil Sahip');
  await page.fill('input[name=email]', 'nil@ornek.com');
  await page.fill('input[name=password]', 'gizli-sifre-1');
  await page.check('input[name=consent]');
  await page.click('button:has-text("Hesap oluştur")');
  await expect(page).toHaveURL(/#\/mulk-sahibi$/);

  await page.goto('index.html#/mulk-sahibi?s=hesap');
  await sheet(page).locator('button:has-text("Anlık bildirimleri aç")').click();
  await expect(sheet(page).locator('button:has-text("Anlık bildirimleri kapat")')).toBeVisible();
  const db = await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')));
  expect(db.tables.device_tokens || []).toEqual([expect.objectContaining({ token:'cihaz-anahtari-1', platform:'android' })]);
  expect((await calls(page, 'Push.createChannel'))[0][0]).toMatchObject({ id:'evim' });

  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__native.fire('Push:pushNotificationActionPerformed', { notification:{ data:{ url:'#/mulk-sahibi/rapor' } } }));
  await expect(page).toHaveURL(/#\/mulk-sahibi\/rapor$/);

  await page.goto('index.html#/mulk-sahibi?s=hesap');
  await sheet(page).locator('button:has-text("Anlık bildirimleri kapat")').click();
  await expect(sheet(page).locator('button:has-text("Anlık bildirimleri aç")')).toBeVisible();
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')))).tables.device_tokens).toEqual([]);
});

test('gerçek hesapta: mağaza fiyatları görünür, satın alma RevenueCat ile yapılır', async ({ page }) => {
  await asNative(page, { platform:'ios' }, true);
  await page.goto('index.html#/kayit');
  await page.click('.rolecard:has-text("Mülk sahibiyim")');
  await page.fill('input[name=name]', 'Ali Sahip');
  await page.fill('input[name=email]', 'ali@ornek.com');
  await page.fill('input[name=password]', 'gizli-sifre-1');
  await page.check('input[name=consent]');
  await page.click('button:has-text("Hesap oluştur")');
  await expect(page).toHaveURL(/#\/mulk-sahibi$/);

  await page.goto('index.html#/mulk-sahibi?s=abonelik');
  await expect(sheet(page).locator('.plan[data-v=monthly] .price')).toHaveText('₺199,99');
  await expect(sheet(page)).toContainText('App Store hesabından alınır');
  const uid = await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')).users[0].id);
  expect((await calls(page, 'RC.configure'))[0][0]).toEqual({ apiKey:'appl_x', appUserID: uid });

  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('__fakedb'));
    d.nextSubscription = { active:true, expires_at:new Date(Date.now() + 365 * 86400000).toISOString(), store:'app_store', product_id:'evim_yillik', will_renew:true };
    localStorage.setItem('__fakedb', JSON.stringify(d));
  });
  await sheet(page).locator('button[data-act=subscribe]').click();
  await expect(page.locator('#banners')).toContainText('Aboneliğin başladı');
  expect((await calls(page, 'RC.purchasePackage'))[0][0].aPackage.identifier).toBe('$rc_annual');
  await expect(page.locator('.subbar')).toHaveCount(0);
});
