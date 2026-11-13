// Edge Function anahtarları (supabase/functions/_shared/key-env.ts, keys.ts) ve her fonksiyonun ortak düzeni:
// yeni SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS (JSON), eski değişkenlere geri dönüş; Sentry sarmalayıcısı; doğrudan anahtar okuma yok.
import { test, expect } from '@playwright/test';
import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { withEdge, fakeSupabase } from './edge-harness.mjs';

const ROOT = new URL('../supabase/functions/', import.meta.url).pathname;
const ENTRY = { contents: `export * from './_shared/key-env.ts'; export * from './_shared/keys.ts';` };
const load = (env, createClient, fn) => withEdge(ENTRY, { env, createClient }, fn);

test('secretKey: SUPABASE_SECRET_KEYS içindeki "default"; yoksa ilk dolu girdi; yoksa eski SUPABASE_SERVICE_ROLE_KEY', async () => {
  await load({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_a","billing":"sb_secret_b"}', SUPABASE_SERVICE_ROLE_KEY: 'eyJeski' }, null, ({ mod }) => {
    expect(mod.secretKey()).toBe('sb_secret_a');
  });
  await load({ SUPABASE_SECRET_KEYS: '{"billing":"sb_secret_b","x":"sb_secret_c"}' }, null, ({ mod }) => { expect(mod.secretKey()).toBe('sb_secret_b'); });
  await load({ SUPABASE_SECRET_KEYS: '{"default":"","x":"sb_secret_c"}' }, null, ({ mod }) => { expect(mod.secretKey()).toBe('sb_secret_c'); });
  // yeni değişken yok, boş ya da bozuk: eskisine düşülür
  for (const bad of [undefined, '', '   ', '{bozuk', '{}', '[]', '{"default":123}']) {
    await load({ SUPABASE_SECRET_KEYS: bad, SUPABASE_SERVICE_ROLE_KEY: 'eyJeski' }, null, ({ mod }) => { expect(mod.secretKey(), String(bad)).toBe('eyJeski'); });
  }
  await load({ SUPABASE_SECRET_KEYS: 'sb_secret_duz' }, null, ({ mod }) => { expect(mod.secretKey()).toBe('sb_secret_duz'); });   // düz metin de kabul
  await load({}, null, ({ mod }) => { expect(mod.secretKey()).toBe(''); });
});

test('publishableKey: SUPABASE_PUBLISHABLE_KEYS, yoksa SUPABASE_ANON_KEY', async () => {
  await load({ SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_a"}', SUPABASE_ANON_KEY: 'eyJanon' }, null, ({ mod }) => { expect(mod.publishableKey()).toBe('sb_publishable_a'); });
  await load({ SUPABASE_ANON_KEY: 'eyJanon' }, null, ({ mod }) => { expect(mod.publishableKey()).toBe('eyJanon'); });
});

test('apiKeyHeaders: yeni biçimli anahtar yalnız apikey başlığında gider; eski JWT anahtarı iki başlıkta', async () => {
  await load({}, null, ({ mod }) => {
    expect(mod.apiKeyHeaders('sb_secret_a')).toEqual({ apikey: 'sb_secret_a' });
    expect(mod.apiKeyHeaders('sb_publishable_a')).toEqual({ apikey: 'sb_publishable_a' });
    expect(mod.apiKeyHeaders('eyJ.a.b')).toEqual({ apikey: 'eyJ.a.b', authorization: 'Bearer eyJ.a.b' });
    expect(mod.isOpaqueKey('sb_secret_a')).toBe(true);
    expect(mod.isOpaqueKey('eyJ.a.b')).toBe(false);
  });
});

test('serviceClient / userClient: doğru adres ve anahtarla, oturum saklamadan; userClient çağıranın Authorization başlığını taşır', async () => {
  const calls = [];
  const createClient = (...a) => { calls.push(a); return {}; };
  await load({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEYS: '{"default":"sb_secret_a"}', SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_a"}' }, createClient, ({ mod }) => {
    mod.serviceClient();
    mod.userClient('Bearer kullanici-jetonu');
  });
  expect(calls[0][0]).toBe('https://x.supabase.co');
  expect(calls[0][1]).toBe('sb_secret_a');
  expect(calls[0][2].auth).toMatchObject({ persistSession: false });
  expect(calls[1][1]).toBe('sb_publishable_a');
  expect(calls[1][2].global.headers.authorization).toBe('Bearer kullanici-jetonu');
  // eski anahtarlarla (yeni değişkenler yokken) aynı kod çalışır
  calls.length = 0;
  await load({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'eyJservis', SUPABASE_ANON_KEY: 'eyJanon' }, createClient, ({ mod }) => { mod.serviceClient(); mod.userClient('Bearer t'); });
  expect([calls[0][1], calls[1][1]]).toEqual(['eyJservis', 'eyJanon']);
});

/* ---- Kaynak düzeni ---- */

const walk = (d) => readdirSync(d).flatMap((f) => (statSync(d + f).isDirectory() ? walk(d + f + '/') : [d + f]));
const fns = readdirSync(ROOT).filter((d) => existsSync(`${ROOT}${d}/index.ts`));

test('hiçbir dosya eski anahtar değişkenlerini doğrudan okumaz: yalnız _shared/key-env.ts okur', () => {
  const direct = /(?:env|Deno\.env\.get)\(\s*['"]SUPABASE_(?:SERVICE_ROLE_KEY|ANON_KEY|SECRET_KEYS|PUBLISHABLE_KEYS)['"]/;
  const bad = walk(ROOT).filter((f) => f.endsWith('.ts') && !f.endsWith('_shared/key-env.ts') && direct.test(readFileSync(f, 'utf8')));
  expect(bad).toEqual([]);
  expect(readFileSync(ROOT + '_shared/key-env.ts', 'utf8')).toMatch(/SUPABASE_SECRET_KEYS/);
  // npm: bağımlılığı olan istemci üretici log.ts'e sızmaz (testler log.ts'i npm: içe aktarması olmadan derler)
  expect(readFileSync(ROOT + '_shared/log.ts', 'utf8')).not.toMatch(/from\s+['"]npm:/);
  expect(readFileSync(ROOT + '_shared/log.ts', 'utf8')).not.toMatch(/keys\.ts/);
});

test('dokuz fonksiyonun hepsi Deno.serve yerine sentryServe(kendi adı) kullanır; supabase-js yalnız _shared/keys.ts içinde içe aktarılır', () => {
  expect(fns.sort()).toEqual(['billing', 'invite-mail', 'lead-mail', 'mail-send', 'push', 'report', 'site-invite', 'tufe-sync', 'welcome']);
  for (const fn of fns) {
    const src = readFileSync(`${ROOT}${fn}/index.ts`, 'utf8');
    expect(src, fn).toContain(`sentryServe('${fn}'`);
    expect(src, fn).not.toMatch(/\bDeno\.serve\(/);
    expect(src, fn).not.toMatch(/npm:@supabase\/supabase-js/);
  }
  const imports = walk(ROOT).filter((f) => f.endsWith('.ts') && /npm:@supabase\/supabase-js/.test(readFileSync(f, 'utf8')));
  expect(imports).toEqual([ROOT + '_shared/keys.ts']);
});

test('gizli başlık adları ve ortam değişkenleri değişmedi (döndürme bir işletim adımıdır)', () => {
  const need = { push: ['WEBHOOK_SECRET', 'x-evim-secret'], 'lead-mail': ['LEAD_SECRET', 'x-anahtar-secret'], 'mail-send': ['MAIL_SECRET', 'x-anahtar-secret'],
    report: ['REPORT_SECRET', 'x-anahtar-secret'], 'tufe-sync': ['TUFE_SECRET', 'x-anahtar-secret'], billing: ['REVENUECAT_WEBHOOK_AUTH', 'REVENUECAT_SECRET_KEY', 'BILLING_CRON_SECRET', 'x-anahtar-secret'] };
  for (const [fn, names] of Object.entries(need)) {
    const src = readFileSync(`${ROOT}${fn}/index.ts`, 'utf8');
    for (const n of names) expect(src, `${fn}: ${n}`).toContain(n);
  }
});

test('her fonksiyon sahte ortamda yüklenir (Sentry kapalı): Deno.serve bir işleyici alır', async () => {
  const stub = fakeSupabase({});
  for (const fn of fns) {
    await withEdge(`${fn}/index.ts`, { env: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEYS: '{"default":"sb_secret_a"}' }, createClient: () => stub }, ({ handler }) => {
      expect(typeof handler, fn).toBe('function');
    });
  }
});
