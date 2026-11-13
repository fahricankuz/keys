// Telefonda bot doğrulaması yoktur (iOS ve Android): captcha.tsx telefonda da yüklenir ama anahtarı boş sayar; Captcha hiçbir şey çizmez,
// captchaToken() null, captchaPending() false döner, auth.tsx anahtarı boş görüp mevcut şifreyi doğrular. Web davranışı değişmez.
// Telefon WebView'i (react-native-webview) kaldırıldı: eski sürüm Turnstile çerçevesini sistem tarayıcısında (Safari) açıyordu.
import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = (p) => new URL('../' + p, import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'captcha-telefon-'));
let n = 0;

/** captcha.tsx'i verilen platform ve site anahtarıyla paketleyip yükler (react-native ve i18n küçük taklitlerle). */
async function load(os, key) {
  const stub = join(dir, `rn${n}.js`);
  writeFileSync(stub, `export const Platform = { OS: ${JSON.stringify(os)} }; export const View = 'View';`);
  const i18n = join(dir, `i18n${n}.js`);
  writeFileSync(i18n, `export const getLang = () => 'tr';`);
  const out = join(dir, `c${n++}.mjs`);
  await build({
    entryPoints: [root('app/src/auth/captcha.tsx')], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent', jsx: 'automatic',
    alias: { 'react-native': stub },
    plugins: [{ name: 'i18n', setup: (b) => b.onResolve({ filter: /\/domain\/i18n$/ }, () => ({ path: i18n })) }],
    define: { 'process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY': JSON.stringify(key) }
  });
  return import(pathToFileURL(out).href);
}

test('telefon: site anahtarı verilse bile doğrulama kapalı, istekler beklemez ve jetonsuz gider', async () => {
  for (const os of ['ios', 'android']) {
    const C = await load(os, '0x4AAAAAAF_pK-kzn3vNBBWZ');
    expect(C.CAPTCHA_KEY, os).toBe('');
    expect(C.captchaToken(), os).toBeNull();
    expect(C.captchaPending(), os).toBe(false);
    expect(() => C.captchaSpent(), os).not.toThrow();
    expect(C.captchaPending(), os).toBe(false);
  }
});

test('web: site anahtarı varken jeton gelene kadar form bekler; anahtar yoksa doğrulama kapalı (davranış değişmedi)', async () => {
  const on = await load('web', '0x4AAAAAAF_pK-kzn3vNBBWZ');
  expect(on.CAPTCHA_KEY).toBe('0x4AAAAAAF_pK-kzn3vNBBWZ');
  expect(on.captchaToken()).toBeNull();
  expect(on.captchaPending()).toBe(true);
  const off = await load('web', '');
  expect(off.CAPTCHA_KEY).toBe('');
  expect(off.captchaPending()).toBe(false);
});

test('telefon WebView doğrulaması kaldırıldı: native dosya, doğrulama sayfası ve react-native-webview bağımlılığı yok', () => {
  expect(existsSync(root('app/src/auth/captcha.native.tsx'))).toBe(false);
  expect(existsSync(root('app/public/turnstile'))).toBe(false);
  const pkg = JSON.parse(readFileSync(root('app/package.json'), 'utf8'));
  expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain('react-native-webview');
  // Hiçbir kaynak dosya WebView'e ya da /turnstile/ sayfasına bağlanmaz.
  const src = readFileSync(root('app/src/auth/captcha.tsx'), 'utf8');
  expect(src).not.toMatch(/react-native-webview|anahtar\.io\/turnstile/);
});
