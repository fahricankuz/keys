// Yayın paketi (scripts/build.mjs): yazı tipleri ve supabase-js pakette, uygulama çalışır.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { watchErrors } from './helpers.mjs';

const OUT = 'test-results/www-build';
test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  execFileSync('node', ['scripts/build.mjs', '--out', OUT], {
    env: { ...process.env, APPLE_TEAM_ID:'TEAM123456', ANDROID_SHA256:'AA:BB' }, stdio: 'pipe', timeout: 120000
  });
});

test('paket dosyaları üretilir; CDN bağlantısı kalmaz', () => {
  const html = readFileSync(OUT + '/index.html', 'utf8');
  expect(html).not.toContain('fonts.googleapis');
  expect(html).toContain('assets/fonts/fonts.css');
  expect(html).toMatch(/<script src="env.js"><\/script>\s*<script type="module"/);
  expect(html).not.toContain('native.js');
  for (const f of ['vendor/supabase.js', 'assets/fonts/fonts.css', '404.html', '.nojekyll', 'sw.js', 'manifest.webmanifest']) expect(existsSync(OUT + '/' + f)).toBe(true);
  expect(readFileSync(OUT + '/sw.js', 'utf8')).toContain('./vendor/supabase.js');
  const aasa = JSON.parse(readFileSync(OUT + '/.well-known/apple-app-site-association', 'utf8'));
  expect(aasa.applinks.details[0].appIDs).toEqual(['TEAM123456.online.kiracim.app']);
  const links = JSON.parse(readFileSync(OUT + '/.well-known/assetlinks.json', 'utf8'));
  expect(links[0].target).toMatchObject({ package_name:'online.kiracim.app', sha256_cert_fingerprints:['AA:BB'] });
});

test('yasal ve destek sayfaları sitede; uygulama adı Kiracım', async ({ page }) => {
  for (const slug of ['gizlilik', 'kosullar', 'hesap-silme', 'destek']){
    await page.goto(OUT + '/' + slug + '/');
    await expect(page).toHaveTitle(/· Kiracım$/);
    await expect(page.locator('main h1')).toBeVisible();
    await expect(page.locator('a[href="mailto:info@kiracim.online"]').first()).toBeVisible();
    await expect(page.locator('nav.legal a')).toHaveCount(4);
  }
  await page.goto(OUT + '/kosullar/');
  await expect(page.locator('main')).toContainText('₺249,99');
  await expect(page.locator('main')).toContainText('24 saat önce');
  await page.goto(OUT + '/index.html#/mulk-sahibi');
  await expect(page).toHaveTitle(/Kiracım/);
  expect(JSON.parse(readFileSync(OUT + '/manifest.webmanifest', 'utf8')).short_name).toBe('Kiracım');
});

test('paketlenmiş uygulama açılır, yerel yazı tipi ve supabase-js yüklenir', async ({ page }) => {
  const errors = watchErrors(page);
  const external = [];
  page.on('request', r => { if (!r.url().startsWith('http://localhost')) external.push(r.url()); });
  await page.goto(OUT + '/index.html#/mulk-sahibi');
  await expect(page.locator('#screen h1')).toHaveText('Portföyüm');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('700 20px "Bricolage Grotesque"') && document.fonts.check('16px Manrope'))).toBe(true);
  const ok = await page.evaluate(async () => typeof (await import(window.EVIM_CONFIG.supabaseJs)).createClient);
  expect(ok).toBe('function');
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test('yerel paket: eklentiler tek dosyada', () => {
  execFileSync('node', ['scripts/build.mjs', '--native', '--out', OUT + '-native'], { stdio: 'pipe', timeout: 120000 });
  const html = readFileSync(OUT + '-native/index.html', 'utf8');
  expect(html).toMatch(/<script src="env.js"><\/script>\s*<script src="native.js"><\/script>/);
  const bundle = readFileSync(OUT + '-native/native.js', 'utf8');
  for (const name of ['Purchases', 'BiometricAuthNative', 'SecureStorage', 'PushNotifications', 'SplashScreen']) expect(bundle).toContain(name);
  expect(existsSync(OUT + '-native/404.html')).toBe(false);
});
