// Oturum ve istemci güvenliği (birim): davet kodu biçimleri, SecureStore oturum deposu (parçalama, taşıma, hata), güvenli dosya adresi,
// davet hatasının tek iletiye indirilmesi, uid() rastgeleliği, giriş tutanağı kaynak denetimi. Tarayıcı gerekmez.
import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { mkdtempSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const D = new URL('../app/src/domain/', import.meta.url).pathname;
const STUBS = new URL('./stubs/', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'oturum-'));
const alias = { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js', 'expo-secure-store': STUBS + 'expo-secure-store.js' };

let n = 0;
/** İçeriği paketleyip yeni bir modül olarak yükler (her çağrı kendi bellek durumunu alır). */
async function load(contents) {
  const out = join(dir, `m${n++}.mjs`);
  buildSync({ stdin: { contents, resolveDir: D, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent', alias, external: ['@supabase/supabase-js', 'expo-crypto'] });
  return import(pathToFileURL(out).href);
}

test('davet kodu: yazım düzeni ve biçimler (eski 8/7 karakter ve yeni 16/17 karakter)', async () => {
  const M = await load(`export * from '${D}invite-code.js';`);
  expect(M.normalizeInviteCode(' abcd-efgh jkmn ')).toBe('ABCDEFGHJKMN');
  expect(M.normalizeInviteCode(null)).toBe('');
  expect(M.normalizeInviteCode('k1234567')).toBe('K1234567');
  // kurum: eski K + 7 onaltılık, yeni K + 16 Crockford
  expect(M.isOrgInviteCode('K1234567')).toBe(true);
  expect(M.isOrgInviteCode('k-0123 4567 89AB CDEF')).toBe(true);
  expect(M.isOrgInviteCode('KABCDEFG')).toBe(false);             // G onaltılık değil, eski biçim değil
  expect(M.isOrgInviteCode('K' + 'I'.repeat(16))).toBe(false);   // I Crockford alfabesinde yok
  expect(M.isOrgInviteCode('K0123456789ABCDEF'.slice(0, 16))).toBe(false); // 16 karakterli K'li kod mülk daveti, kurum değil
  // site: S + 7 / S + 16
  expect(M.isSiteInviteCode('S1234567')).toBe(true);
  expect(M.isSiteInviteCode('s0123456789abcdef')).toBe(true);
  expect(M.isSiteInviteCode('S0123456789ABCDEFG')).toBe(false);  // 18 karakter
  // mülk kodları (eski 8 onaltılık, yeni 16 karakter) kurum ya da site sayılmaz
  expect(M.isOrgInviteCode('0123ABCD')).toBe(false);
  expect(M.isSiteInviteCode('0123456789ABCDEF')).toBe(false);
  // bağlantıdan gelen değer: kod olamayacak kadar kısa ya da uzunsa boş
  expect(M.inviteCodeFromInput('abc')).toBe('');
  expect(M.inviteCodeFromInput('A'.repeat(18))).toBe('');
  expect(M.inviteCodeFromInput('x9k2-m4n7-p3q8-r5t6')).toBe('X9K2M4N7P3Q8R5T6');
  expect(M.inviteCodeFromInput('<script>alert(1)</script>')).toBe('');
  expect(M.INVITE_INPUT_MAX).toBeGreaterThanOrEqual(M.INVITE_CODE_LENGTH + 3);
});

const bundleStorage = `export * from '${D}secure-storage.native.js'; export { default as AS } from '@react-native-async-storage/async-storage'; export * as SS from 'expo-secure-store';`;
const KEY = 'sb-abcdefgh-auth-token';
const session = (extra = '') => JSON.stringify({ access_token: 'a'.repeat(900), refresh_token: 'r'.repeat(40), user: { id: 'u', user_metadata: { name: 'Çağrı Şükrü ' + extra } }, extra: 'ğ'.repeat(1500) });

test('SecureStore deposu: küçük değer tek anahtarda, büyük değer 1800 bayttan küçük parçalarda; geri okunur, üzerine yazılır, silinir', async () => {
  const M = await load(bundleStorage);
  globalThis.__ssFail = false;
  await M.authStorage.setItem(KEY, 'küçük');
  expect(await M.authStorage.getItem(KEY)).toBe('küçük');
  expect([...M.SS.dump().keys()]).toEqual([KEY]);

  const big = session();
  expect(new TextEncoder().encode(big).length).toBeGreaterThan(2048);
  await M.authStorage.setItem(KEY, big);
  expect(await M.authStorage.getItem(KEY)).toBe(big);
  expect(M.SS.stats.maxBytes).toBeLessThanOrEqual(1800);
  const keys = [...M.SS.dump().keys()];
  expect(keys.length).toBeGreaterThan(2);
  expect(keys.every((k) => /^[A-Za-z0-9._-]+$/.test(k))).toBe(true);

  const bigger = session('x'.repeat(4000));
  await M.authStorage.setItem(KEY, bigger);
  expect(await M.authStorage.getItem(KEY)).toBe(bigger);
  await M.authStorage.setItem(KEY, 'kısa');                      // eski parçalar silinir
  expect(await M.authStorage.getItem(KEY)).toBe('kısa');
  expect([...M.SS.dump().keys()]).toEqual([KEY]);

  await M.authStorage.setItem(KEY, bigger);
  await M.authStorage.removeItem(KEY);
  expect(await M.authStorage.getItem(KEY)).toBeNull();
  expect(M.SS.dump().size).toBe(0);

  // PKCE akış anahtarları da geçerli SecureStore anahtarıdır
  await M.authStorage.setItem(KEY + '-flow-abcdef0123456789-code-verifier', '"v"');
  expect(await M.authStorage.getItem(KEY + '-flow-abcdef0123456789-code-verifier')).toBe('"v"');
});

test('SecureStore deposu: eksik parça yeniden girişe düşer (null), güvenli depo çökerse oturum bellekte kalır', async () => {
  const M = await load(bundleStorage);
  globalThis.__ssFail = false;
  await M.authStorage.setItem(KEY, session());
  const dump = M.SS.dump();
  const chunk = [...dump.keys()].find((k) => k.endsWith('.p1'));
  await M.SS.deleteItemAsync(chunk);
  expect(await M.authStorage.getItem(KEY)).toBeNull();

  globalThis.__ssFail = true;
  await M.authStorage.setItem(KEY + '2', 'bellek');              // yazılamadı: atmaz, bellekte tutar
  expect(await M.authStorage.getItem(KEY + '2')).toBe('bellek');
  await M.authStorage.removeItem(KEY + '2');
  expect(await M.authStorage.getItem(KEY + '2')).toBeNull();
  globalThis.__ssFail = false;
});

test('SecureStore deposu: eski AsyncStorage oturumu bir kez taşınır ve AsyncStorage\'dan silinir', async () => {
  const M = await load(bundleStorage);
  globalThis.__ssFail = false;
  const s = session();
  await M.AS.setItem(KEY, s);
  await M.AS.setItem('baska-anahtar', 'kalir');
  await M.migrateAuthStorage(KEY);
  expect(await M.authStorage.getItem(KEY)).toBe(s);
  expect(await M.AS.getItem(KEY)).toBeNull();
  expect(await M.AS.getItem('baska-anahtar')).toBe('kalir');
  await M.migrateAuthStorage(KEY);                                // ikinci çağrı zararsız
  expect(await M.authStorage.getItem(KEY)).toBe(s);
});

test('SecureStore deposu: taşıma başarısız olursa eski kopya yine silinir, kişi yeniden giriş yapar', async () => {
  const M = await load(bundleStorage);
  await M.AS.setItem(KEY, session());
  globalThis.__ssFail = true;
  await M.migrateAuthStorage(KEY);
  globalThis.__ssFail = false;
  expect(await M.AS.getItem(KEY)).toBeNull();
  expect(await M.authStorage.getItem(KEY)).toBeNull();
});

test('backend: güvenli dosya adresi (javascript:, başka kaynak ve SVG reddedilir) ve davet hatası tek iletiye iner', async () => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://abcdefgh.supabase.co';
  const B = await load(`export { safeFileUrl, inviteError } from '${D}backend.js';`);
  const ok = 'https://abcdefgh.supabase.co/storage/v1/object/sign/evim/p/x.pdf?token=t';
  expect(B.safeFileUrl(ok)).toBe(ok);
  expect(B.safeFileUrl('javascript:alert(1)')).toBeNull();
  expect(B.safeFileUrl('https://evil.example/x.pdf')).toBeNull();
  expect(B.safeFileUrl('//evil.example/x')).toBeNull();
  expect(B.safeFileUrl('/uygulama')).toBeNull();
  expect(B.safeFileUrl('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
  expect(B.safeFileUrl('data:image/svg+xml;utf8,<svg onload=alert(1)>')).toBeNull();
  expect(B.safeFileUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  expect(B.safeFileUrl('data:application/pdf;base64,AAAA')).toBe('data:application/pdf;base64,AAAA');
  expect(B.safeFileUrl(null)).toBeNull();

  const net = new TypeError('Failed to fetch');
  expect(B.inviteError(net)).toBe(net);                           // ağ hatası olduğu gibi
  for (const m of ['Davet kodu bulunamadı', 'Bu davet kullanılmış', 'Davetin süresi dolmuş', 'Çok fazla deneme']) {
    const u = B.inviteError({ message: m, code: 'P0002' });
    expect(u.message).toMatch(/^Bu davet kodu geçerli değil/);
    expect(u.code).toBe('INVITE');
  }
  const jwt = { message: 'JWT expired', code: 'PGRST301' };
  expect(B.inviteError(jwt)).toBe(jwt);
  // Ayırt edici sunucu hataları kendi iletisiyle geçer: askıdaki hesap (42501) ve kendi daveti (22023); eski şemanın "kullanılmış / süresi dolmuş" (22023) hâlâ tek ileti
  for (const [m, code] of [['Hesap askıya alındı', '42501'], ['Oturum açılmamış', '42501'], ['Kendi davetini kullanamazsın', '22023'], ['Ekip davetleri ekip ya da mülk sahibi hesapları içindir', '22023']]) {
    const e = { message: m, code };
    expect(B.inviteError(e), m).toBe(e);
  }
  for (const m of ['Bu davet kullanılmış', 'Davetin süresi dolmuş']) {
    const u = B.inviteError({ message: m, code: '22023' });
    expect(u.code, m).toBe('INVITE');
    expect(u.message).toMatch(/^Bu davet kodu geçerli değil/);
  }
});

test('uid(): kriptografik rastgelelik, UUID biçimi; Web Crypto yokken Math.random kullanılmaz', async () => {
  const U = await load(`export * from '${D}util.js';`);
  const a = U.uid('p-'), b = U.uid('p-');
  expect(a).toMatch(/^p-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(a).not.toBe(b);
  const real = Math.random;
  Math.random = () => { throw new Error('Math.random kullanıldı'); };
  const desc = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { value: { getRandomValues: (x) => { for (let i = 0; i < x.length; i++) x[i] = (i * 37 + 11) & 255; return x; } }, configurable: true });
  try { expect(U.uid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/); }
  finally { Math.random = real; if (desc) Object.defineProperty(globalThis, 'crypto', desc); }
});

test('giriş tutanağı: kaynak adresi ve fotoğraf adresi doğrulanır (stil bloğuna ve img src\'ye değer karışmaz)', async () => {
  const H = await load(`export * from '${D}inspect-html.js';`);
  const d = { name: 'Ev', inspect: { rooms: [{ n: 'Salon', shots: ['s1', 's2'], caps: ['', ''] }] }, urls: [['javascript:alert(1)', 'https://anahtar.io/f.jpg']], docs: [], landlord: {}, tenant: {}, generated: new Date('2026-11-07T12:00:00Z') };
  const html = H.inspectHtml(d, { origin: 'https://x.example/);}</style><script>alert(1)</script>' });
  expect(html).not.toContain('<script>alert(1)');
  expect(html).not.toContain('javascript:');
  expect(html).toContain('src="https://anahtar.io/f.jpg"');
  expect(html).toContain("url(/fonts/inter-400.woff2)");          // geçersiz kaynak boş sayılır
  expect(H.inspectHtml(d, { origin: 'https://anahtar.io/' })).toContain('url(https://anahtar.io/fonts/inter-400.woff2)');
});

/* ---------------------------------------------------------------- telefon Turnstile sayfası (public/turnstile) */
const TS = new URL('../app/public/turnstile/', import.meta.url).pathname;

test('Turnstile sayfası: satır içi betik ve olay özniteliği yok, CSP betiğe yalnız kendi kaynağı ve Cloudflare\'e izin verir', () => {
  const html = readFileSync(TS + 'index.html', 'utf8');
  expect([...html.matchAll(/<script\b[^>]*>/gi)].every((m) => /\ssrc="turnstile\.js"/.test(m[0]))).toBe(true);
  expect(html).not.toMatch(/\son[a-z]+\s*=/i);
  const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)[1];
  const script = /script-src ([^;]+)/.exec(csp)[1];
  expect(script).toBe("'self' https://challenges.cloudflare.com");
  expect(csp).toContain('frame-src https://challenges.cloudflare.com');
  expect(csp).toContain("default-src 'none'");
  expect(html).toContain('noindex');
});

/** turnstile.js'i sahte pencere ve belgeyle çalıştırır; uygulamaya giden iletileri toplar. */
function runBridge(search, { turnstile = true, bridge = true } = {}) {
  const sent = [], widget = { opts: null, resets: 0 };
  const win = {
    location: { search },
    turnstile: turnstile ? { render: (_sel, opts) => { widget.opts = opts; return 'w1'; }, reset: () => { widget.resets++; } } : undefined,
    ...(bridge ? { ReactNativeWebView: { postMessage: (m) => sent.push(JSON.parse(m)) } } : {})
  };
  const el = {};
  const doc = { createElement: () => el, head: { appendChild: (e) => { e.onload && e.onload(); } } };
  const timers = [];
  vm.runInNewContext(readFileSync(TS + 'turnstile.js', 'utf8'), { window: win, document: doc, URLSearchParams, JSON, setTimeout: (f) => timers.push(f) });
  return { sent, widget, win, el, timers };
}

test('Turnstile köprüsü: jeton, süre dolumu, hata ve sıfırlama iletileri uygulamaya gider', () => {
  const r = runBridge('?k=1x00000000000000000000AA&lang=en');
  expect(r.el.src).toBe('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
  expect(r.widget.opts.sitekey).toBe('1x00000000000000000000AA');
  expect(r.widget.opts.language).toBe('en');
  expect(r.sent).toEqual([{ type: 'ready', token: '' }]);
  r.widget.opts.callback('TOKEN123');
  r.widget.opts['expired-callback']();
  r.widget.opts['error-callback']();
  expect(r.sent.slice(1)).toEqual([{ type: 'token', token: 'TOKEN123' }, { type: 'expired', token: '' }, { type: 'error', token: '' }]);
  r.win.resetTurnstile();
  expect(r.widget.resets).toBe(1);
  expect(runBridge('?k=1x00000000000000000000AA&lang=xx').widget.opts.language).toBe('tr');   // bilinmeyen dil Türkçe
});

test('Turnstile köprüsü: geçersiz anahtar, yüklenemeyen betik ve zaman aşımı sessiz kalmaz (hata iletisi)', () => {
  expect(runBridge('?k=<script>').sent).toEqual([{ type: 'error', token: '' }]);
  expect(runBridge('').sent).toEqual([{ type: 'error', token: '' }]);
  const fail = runBridge('?k=1x00000000000000000000AA', { turnstile: false });
  expect(fail.sent).toEqual([{ type: 'error', token: '' }]);                                    // betik yüklendi ama turnstile yok
  const slow = runBridge('?k=1x00000000000000000000AA');
  slow.sent.length = 0; slow.timers.forEach((f) => f());                                         // yüklendi: zaman aşımı hata vermez
  expect(slow.sent).toEqual([]);
});
