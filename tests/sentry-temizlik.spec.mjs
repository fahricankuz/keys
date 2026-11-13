// Sentry'ye giden veri (KVKK): web ve telefon aynı süzgeci kullanır (app/src/domain/sentry-scrub.js). redact(), public.log_redact ve
// supabase/functions/_shared/log.ts → redact ile aynı kurallardır (tests/loglar.sql.spec.mjs SQL ile TS'yi karşılaştırır; burada TS ile JS).
// Ayrıca web modülünün (sentry.js) sözleşmesi: yalnız anahtar.io'da, boş zamanda, en çok 10 erken hata kuyruğu, kullanıcıda yalnız UUID.
import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const root = (p) => new URL('../' + p, import.meta.url).pathname;
let n = 0;
/** esbuild ile tek dosyaya paketleyip içe aktarır (bağımlılıksız; Node'da çalışsın). */
async function load(entry, opts = {}) {
  const { outputFiles } = await build({ entryPoints: [root(entry)], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'esnext', logLevel: 'silent', ...opts });
  const file = `${tmpdir()}/anahtar-sentry-${process.pid}-${++n}.mjs`;
  writeFileSync(file, outputFiles[0].text);
  return import(pathToFileURL(file).href);
}

test.describe.configure({ mode: 'serial' });

// tests/loglar.sql.spec.mjs ile aynı örnekler: üçü de (SQL, TS, JS) aynı sonucu vermeli.
const SAMPLES = [
  ['Kullanıcı ali.veli+x@ornek.com.tr bulunamadı', 'Kullanıcı [e-posta] bulunamadı'],
  ['Authorization: Bearer abcdefgh12345678', 'Authorization: [gizli] [gizli]'],
  ['istek Bearer abcdefgh12345678 reddedildi', 'istek Bearer [gizli] reddedildi'],
  ['jeton eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln geçersiz', 'jeton [jeton] geçersiz'],
  ['/katil?token=abc123&x=1', '/katil?token=[gizli]&x=1'],
  ['{"password":"gizli-sifre-1","a":1}', '{"password":"[gizli]","a":1}'],
  ['Numara 0532 123 45 67 geçersiz', 'Numara [telefon] geçersiz'],
  ['Numara +905321234567.', 'Numara [telefon].'],
  ['Sipariş 1234567890123456 ve kullanıcı 00000000-0000-4000-8000-00000000000a', 'Sipariş 1234567890123456 ve kullanıcı 00000000-0000-4000-8000-00000000000a'],
  ['TypeError: x is not a function at /_expo/static/js/web/entry-0123456789abcdef0123456789abcdef.js:1:2', 'TypeError: x is not a function at /_expo/static/js/web/entry-0123456789abcdef0123456789abcdef.js:1:2']
];

test('redact: JS kopyası (Sentry) ile _shared/log.ts (sunucu) aynı sonucu verir; kural satırları birebir aynı', async () => {
  const ts = await load('supabase/functions/_shared/log.ts');
  const js = await load('app/src/domain/sentry-scrub.js');
  for (const [input, want] of SAMPLES) {
    expect(ts.redact(input), 'TS: ' + input).toBe(want);
    expect(js.redact(input), 'JS: ' + input).toBe(want);
  }
  // Kural ekleyen biri yalnız birini değiştirirse bu test kırılır: .replace(...) satırları iki dosyada aynı olmalı.
  const rules = (file) => readFileSync(root(file), 'utf8').match(/^\s*\.replace\(\/.*$/gm).map((l) => l.trim());
  expect(rules('app/src/domain/sentry-scrub.js')).toEqual(rules('supabase/functions/_shared/log.ts'));
  expect(rules('app/src/domain/sentry-scrub.js').length).toBe(5);
});

test('gürültü süzgeci errors.js ile aynı', () => {
  const src = (f) => readFileSync(root(f), 'utf8').match(/const NOISE = (\/.*\/i);/)[1];
  expect(src('app/src/domain/sentry-scrub.js')).toBe(src('app/src/domain/errors.js'));
});

test('scrubUrl: sorgu ve parça atılır (Supabase onay bağlantısı #access_token taşır), yol kimlikleri parametreleşir', async () => {
  const { scrubUrl } = await load('app/src/domain/sentry-scrub.js');
  expect(scrubUrl('https://anahtar.io/dogrula#access_token=eyJhbGciOiJIUzI1NiJ9.abc.def&type=signup')).toBe('https://anahtar.io/dogrula');
  expect(scrubUrl('https://anahtar.io/yeni-sifre/#access_token=abc&refresh_token=def')).toBe('https://anahtar.io/yeni-sifre/');
  expect(scrubUrl('https://anahtar.io/katil?code=ABCD1234&email=ali@ornek.com')).toBe('https://anahtar.io/katil');
  expect(scrubUrl('https://x.supabase.co/rest/v1/profiles?email=eq.ali@x.com&id=eq.1')).toBe('https://x.supabase.co/rest/v1/profiles');
  expect(scrubUrl('https://anahtar.io/uygulama/mulk/00000000-0000-4000-8000-00000000000a/odemeler')).toBe('https://anahtar.io/uygulama/mulk/:id/odemeler');
  expect(scrubUrl('https://anahtar.io/uygulama/mulk/00000000-0000-4000-8000-00000000000A')).toBe('https://anahtar.io/uygulama/mulk/:id');
  expect(scrubUrl('/uygulama/talepler/1234567')).toBe('/uygulama/talepler/:n');
  expect(scrubUrl('')).toBe('');
  expect(scrubUrl(undefined)).toBeUndefined();
});

test('scrubText: metindeki adresler ve kişisel veri temizlenir', async () => {
  const { scrubText } = await load('app/src/domain/sentry-scrub.js');
  expect(scrubText('Failed GET https://x.supabase.co/rest/v1/residents?email=eq.ali@x.com&select=* için ali@x.com')).toBe('Failed GET https://x.supabase.co/rest/v1/residents için [e-posta]');
  expect(scrubText('açılış https://anahtar.io/dogrula#access_token=abc')).toBe('açılış https://anahtar.io/dogrula');
  expect(scrubText(42)).toBe(42);
});

test('scrubEvent: kullanıcıda yalnız UUID; istekte çerez, başlık, gövde, sorgu yok; ekmek kırıntısı ve aralıklar temizlenir', async () => {
  const { scrubEvent, scrubBreadcrumb } = await load('app/src/domain/sentry-scrub.js');
  const e = scrubEvent({
    message: 'Ali ali@x.com 0532 123 45 67',
    user: { id: 'u-1', email: 'a@b.co', ip_address: '1.2.3.4', username: 'ali' },
    request: { url: 'https://anahtar.io/katil?code=ABC#x', cookies: { a: 1 }, headers: { Referer: 'https://anahtar.io/dogrula#access_token=abc' }, data: { password: 'x' }, query_string: 'code=ABC' },
    exception: { values: [{ value: 'Bearer abcdefgh12345678 reddedildi' }] },
    transaction: '/uygulama/mulk/00000000-0000-4000-8000-00000000000a',
    breadcrumbs: [{ category: 'fetch', message: 'ali@x.com', data: { url: 'https://x.supabase.co/rest/v1/a?b=c', request_body: '{"a":1}', response_body: '{}', query: 'b=c' } }],
    spans: [{ description: 'GET https://x.supabase.co/rest/v1/payments?email=eq.ali@x.com', data: { 'http.url': 'https://x.supabase.co/rest/v1/payments?email=eq.ali@x.com', 'http.query': 'email=eq.ali@x.com', 'http.method': 'GET' } }],
    tags: { kind: 'caught', who: 'ali@x.com' },
    extra: { note: 'token=abc123' }
  });
  expect(e.message).toBe('Ali [e-posta] [telefon]');
  expect(e.user).toEqual({ id: 'u-1' });
  expect(e.request).toEqual({ url: 'https://anahtar.io/katil' });
  expect(e.exception.values[0].value).toBe('Bearer [gizli] reddedildi');
  expect(e.transaction).toBe('/uygulama/mulk/:id');
  expect(e.breadcrumbs[0]).toEqual({ category: 'fetch', message: '[e-posta]', data: { url: 'https://x.supabase.co/rest/v1/a' } });
  expect(e.spans[0].description).toBe('GET https://x.supabase.co/rest/v1/payments');
  expect(e.spans[0].data).toEqual({ 'http.url': 'https://x.supabase.co/rest/v1/payments', 'http.method': 'GET' });
  expect(e.tags).toEqual({ kind: 'caught', who: '[e-posta]' });
  expect(e.extra).toEqual({ note: 'token=[gizli]' });
  expect(JSON.stringify(e)).not.toMatch(/ali@x|a@b\.co|1\.2\.3\.4|access_token|ABC|password/);
  // Kullanıcı yoksa ya da kimliksiz ise hiçbir şey taşınmaz.
  expect(scrubEvent({ user: { email: 'a@b.co' } }).user).toBeUndefined();
  expect(scrubEvent({}).user).toBeUndefined();
  expect(scrubEvent(null)).toBeNull();
  expect(scrubBreadcrumb({ message: 'a@b.co', data: { from: '/a?x=1', to: '/b#y' } })).toEqual({ message: '[e-posta]', data: { from: '/a', to: '/b' } });
});

// ---- Web modülü (sentry.js): @sentry/browser yerine kayıt tutan bir taklit kullanılır ----
const STUB = `
export const init = (o) => globalThis.__s.inits.push(o);
export const setUser = (u) => globalThis.__s.users.push(u);
export const breadcrumbsIntegration = (o) => ({ name: 'Breadcrumbs', o });
export const withScope = (fn) => fn({ setTag: (k, v) => { globalThis.__s.tags.push([k, v]); } });
export const captureException = (e) => globalThis.__s.captured.push(e);
`;
const DSN = 'https://abc123@o1.ingest.de.sentry.io/2';

async function web({ host = 'anahtar.io', dsn = DSN, release = '0123456789abcdef', idle = 'now' } = {}) {
  const stub = `${tmpdir()}/anahtar-sentry-stub-${process.pid}-${++n}.mjs`;
  writeFileSync(stub, STUB);
  const s = (globalThis.__s = { inits: [], users: [], tags: [], captured: [] });
  const handlers = {};
  const idleQueue = [];
  if (host === null) delete globalThis.window;
  else globalThis.window = {
    location: { hostname: host }, addEventListener: (t, f) => { handlers[t] = f; }, removeEventListener: (t) => { delete handlers[t]; },
    requestIdleCallback: (fn) => (idle === 'now' ? fn() : idleQueue.push(fn))
  };
  const m = await load('app/src/domain/sentry.js', {
    platform: 'browser', alias: { '@sentry/browser': stub },
    define: { 'process.env.EXPO_PUBLIC_SENTRY_DSN_WEB': JSON.stringify(dsn), 'process.env.EXPO_PUBLIC_SENTRY_RELEASE': JSON.stringify(release) }
  });
  const settle = () => new Promise((r) => setTimeout(r, 30));
  return { m, s, handlers, idleQueue, settle };
}
test.afterEach(() => { delete globalThis.window; delete globalThis.__s; });

test('web: anahtar.io\'da bir kez, PII kapalı, sürüm anahtar-web@<7 hane>, replay yok, beforeSend süzgeçli', async () => {
  const { m, s, settle } = await web();
  m.initSentry(); m.initSentry();
  await settle();
  expect(s.inits.length).toBe(1);
  const o = s.inits[0];
  expect(o).toMatchObject({ dsn: DSN, environment: 'production', release: 'anahtar-web@0123456', sendDefaultPii: false });
  expect(o.integrations.map((i) => i.name)).toEqual(['Breadcrumbs']);
  expect(o.integrations[0].o).toEqual({ console: false });
  expect(Object.keys(o).filter((k) => /replay|tracesSampleRate|profiles/i.test(k))).toEqual([]);
  expect(o.beforeSend({ user: { id: 'u', email: 'a@b.co' }, message: 'a@b.co' })).toEqual({ user: { id: 'u' }, message: '[e-posta]' });
  expect(o.ignoreErrors[0].test('TypeError: Failed to fetch')).toBe(true);
});

test('web: www.anahtar.io da çalışır; localhost, önizleme adresi ve statik üretim (window yok) hiçbir şey yapmaz', async () => {
  for (const host of ['www.anahtar.io', 'ANAHTAR.IO']) {
    const { m, s, settle } = await web({ host }); m.initSentry(); await settle(); expect(s.inits.length, host).toBe(1);
  }
  for (const host of ['localhost', 'anahtar.io.evil.example', 'x.hostingersite.com', 'evil-anahtar.io']) {
    const { m, s, handlers, settle } = await web({ host }); m.initSentry(); await settle();
    expect(s.inits.length, host).toBe(0); expect(Object.keys(handlers), host).toEqual([]);
  }
  const ssr = await web({ host: null });
  ssr.m.initSentry(); ssr.m.captureError(new Error('x'), 'render'); ssr.m.setSentryUser('u'); ssr.m.wrapRoot(() => null);   // atmamalı
  expect(ssr.s.inits.length).toBe(0);
  const empty = await web({ dsn: '' }); empty.m.initSentry(); empty.m.captureError(new Error('x'), 'caught'); await empty.settle();
  expect(empty.s.inits.length).toBe(0);
});

test('web: Sentry yüklenene kadar en çok 10 erken hata kuyruğa alınır, yüklenince gönderilir; kuyruk dolunca yenisi atılır', async () => {
  const { m, s, handlers, idleQueue, settle } = await web({ idle: 'later' });
  m.initSentry();
  expect(idleQueue.length).toBe(1);                       // boş zamanı bekler: ilk yüklemeyi geciktirmez
  expect(typeof handlers.error).toBe('function'); expect(typeof handlers.unhandledrejection).toBe('function');
  for (let i = 0; i < 8; i++) m.captureError(new Error('e' + i), 'caught');
  handlers.error({ error: new Error('pencere hatası') });
  handlers.unhandledrejection({ reason: new Error('söz reddi') });
  handlers.error({ error: new Error('taştı') });         // 11. kayıt atılır
  expect(s.inits.length).toBe(0);
  idleQueue[0](); await settle();
  expect(s.inits.length).toBe(1);
  expect(s.captured.map((e) => e.message)).toEqual(['e0', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'pencere hatası', 'söz reddi']);
  expect(s.tags.slice(-2)).toEqual([['kind', 'error'], ['kind', 'rejection']]);
  expect(handlers.error).toBeUndefined();                 // geçici dinleyiciler kalkar (Sentry kendi kancasını kurar)
  m.captureError('düz metin', 'render');                  // yüklendikten sonra doğrudan gider; Error olmayan değer Error'a çevrilir
  expect(s.captured.at(-1)).toBeInstanceOf(Error); expect(s.captured.at(-1).message).toBe('düz metin');
});

test('web: setSentryUser yalnız UUID taşır; boş değer kullanıcıyı siler', async () => {
  const { m, s, settle } = await web();
  m.setSentryUser('00000000-0000-4000-8000-00000000000a');   // yüklenmeden önce çağrılırsa yüklenince uygulanır
  m.initSentry(); await settle();
  expect(s.users).toEqual([{ id: '00000000-0000-4000-8000-00000000000a' }]);
  m.setSentryUser(null);
  expect(s.users.at(-1)).toBeNull();
});
