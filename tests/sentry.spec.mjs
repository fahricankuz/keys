// Edge Function Sentry sarmalayıcısı (supabase/functions/_shared/sentry.ts): yalnız SENTRY_DSN varsa açılır, olaylar gönderilmeden
// log.ts ile aynı kurallarla temizlenir, istek başına kapsam + flush, log kancası ve cron check-in. SDK sahte bir modülle değiştirilir;
// gerçek SDK ile uçtan uca deneme sürümü yükseltirken elle yapılır (docs/loglar.md).
import { test, expect } from '@playwright/test';
import { withEdge } from './edge-harness.mjs';

const ENTRY = { contents: `export * from './_shared/sentry.ts'; export { logger, redact } from './_shared/log.ts';` };

function fakeSentry({ failInit = false } = {}) {
  const rec = { init: [], scoped: [], tags: [], msg: [], global: [], flush: [], checkins: [] };
  return {
    rec,
    impl: {
      init: (o) => { if (failInit) throw new Error('init patladı'); rec.init.push(o); },
      withScope: (f) => f({ setTag: (k, v) => rec.tags.push([k, v]), captureException: (e, h) => rec.scoped.push({ e, h }) }),
      flush: async (t) => { rec.flush.push(t); return true; },
      captureCheckIn: (c, cfg) => { rec.checkins.push({ c, cfg }); return 'chk-1'; },
      captureMessage: (m, ctx) => rec.msg.push({ m, ctx }),
      captureException: (e, ctx) => rec.global.push({ e, ctx }),
    },
  };
}
const run = (env, sentry, fn, fetch) => withEdge(ENTRY, { env, sentry: sentry?.impl, fetch: fetch ?? (async () => new Response(null, { status: 201 })) }, fn);
const req = (u = 'http://x/') => new Request(u, { method: 'POST' });

test('DSN yoksa Sentry hiç başlatılmaz: işleyici olduğu gibi çalışır, log kancası bağlanmaz, check-in boştur', async () => {
  const s = fakeSentry();
  await run({}, s, async ({ mod }) => {
    expect(mod.sentryEnabled()).toBe(false);
    let served = null;
    globalThis.Deno.serve = (h) => { served = h; };
    mod.sentryServe('billing', async () => new Response('tamam'));
    expect(await (await served(req())).text()).toBe('tamam');
    await mod.logger('billing').error('hata', new Error('x'));
    await mod.cronCheckIn('tufe-sync', '0 13 * * *').done(true);
    // işleyicideki hata Sentry'siz de yukarı fırlar
    mod.sentryServe('billing', async () => { throw new Error('patladı'); });
    await expect(served(req())).rejects.toThrow('patladı');
  });
  expect(s.rec.init).toEqual([]);
  expect(s.rec.global.length + s.rec.scoped.length + s.rec.msg.length + s.rec.checkins.length).toBe(0);
});

test('DSN varsa tek kez başlatılır: varsayılan entegrasyonlar kapalı, kişisel veri ve izleme kapalı, ortam SENTRY_ENV ya da production', async () => {
  const s = fakeSentry();
  await run({ SENTRY_DSN: 'https://k@o1.ingest.de.sentry.io/1' }, s, async ({ mod }) => {
    expect(mod.sentryEnabled()).toBe(true);
  });
  expect(s.rec.init).toHaveLength(1);
  expect(s.rec.init[0]).toMatchObject({
    dsn: 'https://k@o1.ingest.de.sentry.io/1', environment: 'production', defaultIntegrations: false, integrations: [], sendDefaultPii: false,
    tracesSampleRate: 0, maxBreadcrumbs: 0, skipOpenTelemetrySetup: true,
  });
  expect(typeof s.rec.init[0].beforeSend).toBe('function');
  const s2 = fakeSentry();
  await run({ SENTRY_DSN: 'https://k@o1.ingest.de.sentry.io/1', SENTRY_ENV: 'staging', SENTRY_RELEASE: 'abc1234' }, s2, async () => {});
  expect(s2.rec.init[0]).toMatchObject({ environment: 'staging', release: 'abc1234' });
});

test('başlatma hatası fonksiyonu durdurmaz: Sentry kapalı sürer ve uyarı loglanır', async () => {
  const s = fakeSentry({ failInit: true });
  const posted = [];
  await run({ SENTRY_DSN: 'https://k@o1.ingest.de.sentry.io/1', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}' }, s, async ({ mod }) => {
    expect(mod.sentryEnabled()).toBe(false);
    let served = null;
    globalThis.Deno.serve = (h) => { served = h; };
    mod.sentryServe('x', async () => new Response('ok'));
    expect((await served(req())).status).toBe(200);
  }, async (u, o) => { posted.push(JSON.parse(o.body)); return new Response(null, { status: 201 }); });
  expect(posted.some((p) => p.level === 'warn' && /Sentry başlatılamadı/.test(p.message))).toBe(true);
});

test('yakalanmamış hata: istek kapsamında fn etiketiyle yakalanır, 2 sn flush beklenir ve hata yeniden fırlatılır', async () => {
  const s = fakeSentry();
  await run({ SENTRY_DSN: 'https://k@o1.ingest.de.sentry.io/1', SB_REGION: 'eu-central-1', SB_EXECUTION_ID: 'ex-1' }, s, async ({ mod }) => {
    let served = null;
    globalThis.Deno.serve = (h) => { served = h; };
    const boom = new Error('patladı');
    mod.sentryServe('billing', async () => { throw boom; });
    await expect(served(req())).rejects.toBe(boom);
    expect(s.rec.scoped).toHaveLength(1);
    expect(s.rec.scoped[0].e).toBe(boom);
    expect(s.rec.scoped[0].h.mechanism).toMatchObject({ handled: false });
    expect(s.rec.tags).toEqual(expect.arrayContaining([['fn', 'billing'], ['region', 'eu-central-1'], ['execution_id', 'ex-1']]));
    expect(s.rec.flush).toEqual([2000]);
  });
});

test('hatasız istek: yanıt aynen döner, hiçbir şey yakalanmaz ve flush beklenmez', async () => {
  const s = fakeSentry();
  await run({ SENTRY_DSN: 'https://k@o1.ingest.de.sentry.io/1' }, s, async ({ mod }) => {
    let served = null;
    globalThis.Deno.serve = (h) => { served = h; };
    mod.sentryServe('push', async () => new Response('gövde', { status: 201 }));
    const res = await served(req());
    expect(res.status).toBe(201);
    expect(await res.text()).toBe('gövde');
  });
  expect(s.rec.scoped).toEqual([]);
  expect(s.rec.flush).toEqual([]);
  expect(s.rec.tags).toEqual([['fn', 'push']]);
});

test('log kancası: warn ve error Sentry\'ye de gider (temizlenmiş), info gitmez; Error nesnesi istisna olarak, diğerleri mesaj olarak', async () => {
  const s = fakeSentry();
  await run({ SENTRY_DSN: 'https://k@o1.ingest.de.sentry.io/1', SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}' }, s, async ({ mod }) => {
    const log = mod.logger('push');
    await log.info('başladı');
    await log.warn('yavaş ayse@example.com', { code: 5 });
    const err = new Error('boom');
    await log.error('cihaz hatası', err);
    await log.error('düz nesne', { status: 500, phone: '0532 111 22 33' });
    let served = null;
    globalThis.Deno.serve = (h) => { served = h; };
    mod.sentryServe('push', async () => { await log.warn('istek içinde'); return new Response('ok'); });
    await served(req());
  });
  expect(s.rec.msg.map((m) => m.m)).toEqual(['yavaş [e-posta]', 'düz nesne', 'istek içinde']);
  expect(s.rec.msg[0].ctx).toMatchObject({ level: 'warning', tags: { fn: 'push' } });
  expect(JSON.stringify(s.rec.msg)).not.toMatch(/ayse@example|0532/);
  expect(s.rec.msg[1].ctx.level).toBe('error');
  expect(s.rec.global).toHaveLength(1);
  expect(s.rec.global[0].e.message).toBe('boom');
  expect(s.rec.global[0].ctx).toMatchObject({ level: 'error', tags: { fn: 'push' } });
  expect(s.rec.flush).toEqual([2000]);                      // kancadan gelen olaylar istek bitince gönderilir
});

test('log selinde Sentry dakikada en çok 30 olay alır', async () => {
  const s = fakeSentry();
  await run({ SENTRY_DSN: 'https://k@o1.ingest.de.sentry.io/1' }, s, async ({ mod }) => {
    for (let i = 0; i < 45; i++) await mod.logger('a').error('hata ' + i);
  });
  expect(s.rec.msg).toHaveLength(30);
});

test('temizleme: e-posta, jeton, parola, telefon silinir; kullanıcı, sunucu adı, istek gövdesi/başlıkları atılır; adresten sorgu ve parça gider', async () => {
  const s = fakeSentry();
  let scrub;
  await run({ SENTRY_DSN: 'https://k@o1.ingest.de.sentry.io/1' }, s, async ({ mod }) => { scrub = mod.scrubEvent; });
  const out = scrub({
    message: 'giriş ayse@example.com Bearer abcdefgh12345678',
    user: { id: 'u1', email: 'a@b.co', ip_address: '1.2.3.4' }, server_name: 'host-1',
    exception: { values: [{ type: 'Error', value: 'token=abc123 kullanıcı 0532 111 22 33', stacktrace: { frames: [{ filename: 'x.ts' }] } }] },
    extra: { password: 'p', nested: { Authorization: 'x', note: 'mail a@b.co', list: ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig'] } },
    tags: { fn: 'billing', owner: 'x@y.org' },
    request: { method: 'POST', url: 'https://x.supabase.co/functions/v1/billing?access_token=zzz&email=a@b.co#fragman', headers: { authorization: 'Bearer abc' }, cookies: { a: 'b' }, data: { email: 'a@b.co' }, query_string: 'a=b' },
    contexts: { trace: { trace_id: '5123456789abcdef5123456789abcdef' }, runtime: { name: 'deno' }, custom: { who: 'ayse@example.com' } },
    breadcrumbs: [{ message: 'tıkla ayse@example.com' }],
    event_id: '51234567890abcdef1234567890abcde',
  });
  expect(out.user).toBeUndefined();
  expect(out.server_name).toBeUndefined();
  expect(out.message).toBe('giriş [e-posta] Bearer [gizli]');
  expect(out.exception.values[0].value).toBe('token=[gizli] kullanıcı [telefon]');
  expect(out.exception.values[0].type).toBe('Error');
  expect(out.extra.password).toBe('[gizli]');
  expect(out.extra.nested.Authorization).toBe('[gizli]');
  expect(out.extra.nested.note).toBe('mail [e-posta]');
  expect(out.extra.nested.list[0]).toBe('[jeton]');
  expect(out.tags).toEqual({ fn: 'billing', owner: '[e-posta]' });
  expect(out.request).toEqual({ method: 'POST', url: 'https://x.supabase.co/functions/v1/billing' });
  expect(out.contexts.trace.trace_id).toBe('5123456789abcdef5123456789abcdef');     // yapı alanları değişmez
  expect(out.contexts.custom.who).toBe('[e-posta]');
  expect(out.breadcrumbs[0].message).toBe('tıkla [e-posta]');
  expect(out.event_id).toBe('51234567890abcdef1234567890abcde');
  expect(JSON.stringify(out)).not.toMatch(/ayse@|a@b\.co|x@y\.org|abcdefgh12345678|0532|access_token|zzz|fragman|1\.2\.3\.4/);
});

test('temizleme kuralları _shared/log.ts içindeki redact ile birebir aynıdır (public.log_redact ile aynı kural kümesi)', async () => {
  const s = fakeSentry();
  let scrub, redact;
  await run({ SENTRY_DSN: 'https://k@o1.ingest.de.sentry.io/1' }, s, async ({ mod }) => { scrub = mod.scrubEvent; redact = mod.redact; });
  const corpus = [
    'ayse@example.com yazdı', 'Bearer abcdefgh12345678', 'Basic dXNlcjpwYXNz1234', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.imza',
    'password=gizli1 secret: x2 sifre="abc" şifre: d4 apikey=k api_key: z', '0532 111 22 33 ve +90 532 111 22 33 ve 05321112233',
    'authorization: Bearer abcdefgh12345678', 'hata yok', '', 'URL https://x.co/a?token=abc&b=1',
  ];
  for (const c of corpus) expect(scrub({ message: c }).message, c).toBe(redact(c));
});

test('cron check-in: başlangıç (zamanlama UTC) ve bitişte ok/error + süre; aynı check-in kimliği', async () => {
  const s = fakeSentry();
  await run({ SENTRY_DSN: 'https://k@o1.ingest.de.sentry.io/1' }, s, async ({ mod }) => {
    const a = mod.cronCheckIn('tufe-sync', '0 13 * * *');
    await a.done(true);
    const b = mod.cronCheckIn('tufe-sync', '0 13 * * *');
    await b.done(false);
  });
  const [start1, end1, start2, end2] = s.rec.checkins;
  expect(start1.c).toEqual({ monitorSlug: 'tufe-sync', status: 'in_progress' });
  expect(start1.cfg).toMatchObject({ schedule: { type: 'crontab', value: '0 13 * * *' }, timezone: 'UTC' });
  expect(end1.c).toMatchObject({ monitorSlug: 'tufe-sync', status: 'ok', checkInId: 'chk-1' });
  expect(end1.c.duration).toBeGreaterThanOrEqual(0);
  expect(end2.c).toMatchObject({ status: 'error', checkInId: 'chk-1' });
  expect(start2.c.status).toBe('in_progress');
});
