// billing Edge Function'ının gerçek işleyicisi (supabase/functions/billing/index.ts), sahte RevenueCat ve sahte veritabanıyla:
// webhook, uygulamadan eşitleme (bekleme süresi), günlük uzlaştırma, korunan satırlar, genel hata gövdeleri.
import { test, expect } from '@playwright/test';
import { withEdge, post, fakeSupabase } from './edge-harness.mjs';

const U = '11111111-2222-3333-4444-555555555555';
const V = '99999999-2222-3333-4444-555555555555';
const W = '77777777-2222-3333-4444-555555555555';
const FUTURE = new Date(Date.now() + 30 * 864e5).toISOString();
const PAST = new Date(Date.now() - 5 * 864e5).toISOString();
const SECRET_KEY = 'sb_secret_test_anahtari';

const ENV = () => ({
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRET_KEY }),
  REVENUECAT_SECRET_KEY: 'sk_test', REVENUECAT_WEBHOOK_AUTH: 'rc-webhook-degeri', BILLING_CRON_SECRET: 'cron-gizli-degeri',
});

/** Android (Google Play) abonesi: RevenueCat REST aboneliği soneksiz kimlikle, temel planı ayrı alanda verir. */
const playSubscriber = (over = {}) => ({
  entitlements: { pro: { expires_date: FUTURE, product_identifier: 'tek', product_plan_identifier: '3-aylik' } },
  subscriptions: { tek: { store: 'play_store', period_type: 'normal', is_sandbox: false, product_plan_identifier: '3-aylik' } },
  ...over,
});

/** Sahte ağ: RevenueCat (kullanıcıya göre), function_logs yazımı; çağrılar kaydedilir. */
function net({ subscribers = {}, rcStatus = {}, rcText = 'RC-IC-HATA-METNI' } = {}) {
  const calls = { rc: [], logs: [] };
  let inflight = 0, maxInflight = 0;
  const fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('api.revenuecat.com')) {
      const id = decodeURIComponent(u.split('/subscribers/')[1]);
      calls.rc.push({ id, method: init.method || 'GET', headers: init.headers, signal: init.signal });
      inflight++; maxInflight = Math.max(maxInflight, inflight);
      await new Promise((r) => setTimeout(r, 15));
      inflight--;
      if (rcStatus[id]) return new Response(rcText, { status: rcStatus[id] });
      return Response.json({ subscriber: subscribers[id] ?? { entitlements: {}, subscriptions: {} } });
    }
    if (u.includes('/rest/v1/function_logs')) { calls.logs.push({ headers: init.headers, body: JSON.parse(init.body) }); return new Response(null, { status: 201 }); }
    throw new Error('beklenmeyen ağ çağrısı: ' + u);
  };
  return { fetch, calls, maxInflight: () => maxInflight };
}

const webhook = (event) => post('https://x.supabase.co/functions/v1/billing', { event }, { authorization: 'rc-webhook-degeri' });
const userCall = (token = 'jeton-u') => post('https://x.supabase.co/functions/v1/billing', {}, { authorization: 'Bearer ' + token });
const cronCall = (secret, body = { action: 'reconcile' }) => post('https://x.supabase.co/functions/v1/billing', body, secret === undefined ? {} : { 'x-anahtar-secret': secret });

async function setup(state, network, run, env = ENV()) {
  const db = fakeSupabase(state);
  return withEdge('billing/index.ts', { env, fetch: network.fetch, createClient: () => db, sentry: null }, run);
}

test('webhook: Android (tek + 3-aylik) satırı tek_3_aylik olarak eklenir; units/sector boş, sandbox kaydedilir', async () => {
  const state = { tables: { subscriptions: [] } };
  const n = net({ subscribers: { [U]: playSubscriber({ subscriptions: { tek: { store: 'play_store', period_type: 'normal', is_sandbox: true, product_plan_identifier: '3-aylik' } } }) } });
  await setup(state, n, async ({ handler }) => {
    const res = await handler(webhook({ type: 'INITIAL_PURCHASE', app_user_id: U, aliases: ['$RCAnonymousID:abc'] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, users: 1 });
  });
  expect(state.tables.subscriptions).toHaveLength(1);
  expect(state.tables.subscriptions[0]).toMatchObject({ user_id: U, product_id: 'tek_3_aylik', store: 'play_store', active: true, environment: 'sandbox', units: null, sector: null });
  // RevenueCat v1 sözleşmesi: Bearer gizli anahtar, zaman aşımı sinyali
  expect(n.calls.rc[0].headers.Authorization).toBe('Bearer sk_test');
  expect(n.calls.rc[0].signal).toBeInstanceOf(AbortSignal);
});

test('webhook: yanlış/eksik Authorization kullanıcı yoluna düşer ve 401 verir; webhook gizlisi tanımsızsa kapalıdır', async () => {
  const state = { tables: { subscriptions: [] } };
  const n = net();
  await setup(state, n, async ({ handler }) => {
    const bad = await handler(post('https://x.supabase.co/functions/v1/billing', { event: { type: 'RENEWAL', app_user_id: U } }, { authorization: 'yanlis' }));
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: 'Yetkisiz' });
    expect((await handler(new Request('https://x.supabase.co/functions/v1/billing', { method: 'GET' }))).status).toBe(405);
  });
  const env = ENV(); delete env.REVENUECAT_WEBHOOK_AUTH;
  await setup(state, n, async ({ handler }) => {
    const res = await handler(post('https://x.supabase.co/functions/v1/billing', { event: { type: 'RENEWAL', app_user_id: U } }, { authorization: '' }));
    expect(res.status).toBe(401);
  }, env);
  expect(n.calls.rc).toHaveLength(0);
  expect(state.tables.subscriptions).toHaveLength(0);
});

test('yönetici paketi ve promosyon satırı eşitlemeyle ezilmez; yanıtta mevcut durum döner', async () => {
  const state = { tables: { subscriptions: [
    { user_id: U, store: 'admin', product_id: 'tek_5_aylik', expires_at: FUTURE, active: true, updated_at: '2026-11-01T00:00:00+00:00', units: 5, sector: null },
    { user_id: V, store: 'promotional', product_id: 'rc_promo_pro', expires_at: null, active: true, updated_at: '2026-11-01T00:00:00+00:00' },
  ] }, users: { 'jeton-u': { id: U } } };
  const n = net({ subscribers: { [U]: { entitlements: {}, subscriptions: {} }, [V]: playSubscriber() } });
  await setup(state, n, async ({ handler }) => {
    const res = await handler(userCall());                       // restore: RevenueCat'te yetki yok
    expect(await res.json()).toEqual({ ok: true, active: true, expires_at: FUTURE, kept: 'grant' });
    const wh = await handler(webhook({ type: 'RENEWAL', app_user_id: V }));   // promosyonlu kullanıcı mağaza aboneliği aldı
    expect(wh.status).toBe(200);
  });
  expect(state.log.filter((l) => l[0] === 'update' || l[0] === 'insert')).toEqual([]);
  expect(state.tables.subscriptions[0]).toMatchObject({ store: 'admin', product_id: 'tek_5_aylik', units: 5 });
  expect(state.tables.subscriptions[1]).toMatchObject({ store: 'promotional', product_id: 'rc_promo_pro' });
});

test('süresi dolmuş yönetici paketi satın almayı engellemez; units/sector temizlenir', async () => {
  const state = { tables: { subscriptions: [
    { user_id: U, store: 'admin', product_id: 'tek_5_aylik', expires_at: PAST, active: true, updated_at: '2026-10-01T00:00:00+00:00', units: 5, sector: 'site' },
  ] } };
  const n = net({ subscribers: { [U]: playSubscriber() } });
  await setup(state, n, async ({ handler }) => { await handler(webhook({ type: 'INITIAL_PURCHASE', app_user_id: U })); });
  expect(state.tables.subscriptions[0]).toMatchObject({ store: 'play_store', product_id: 'tek_3_aylik', active: true, units: null, sector: null });
});

test('erişim veren satır "yetki yok" anlık görüntüsüyle silinmez; aktarımda (TRANSFER) kaybeden hesap güncellenir', async () => {
  const mk = () => ({ tables: { subscriptions: [{ user_id: U, store: 'app_store', product_id: 'tek_1_aylik', expires_at: FUTURE, active: true, will_renew: true, updated_at: '2026-11-01T00:00:00+00:00' }] } });
  const empty = net({ subscribers: {} });
  let state = mk();
  await setup(state, empty, async ({ handler }) => { await handler(webhook({ type: 'CANCELLATION', app_user_id: U })); });
  expect(state.tables.subscriptions[0].active).toBe(true);
  state = mk();
  await setup(state, empty, async ({ handler }) => { await handler(webhook({ type: 'TRANSFER', transferred_from: [U], transferred_to: [V] })); });
  expect(state.tables.subscriptions[0].active).toBe(false);
});

test('okuma ile yazma arasında başka eşitleme araya girerse satır yeniden okunur ve daha yeni satır ezilmez', async () => {
  const row = { user_id: U, store: 'play_store', product_id: 'tek_3_aylik', expires_at: new Date(Date.now() + 5 * 864e5).toISOString(), active: true, will_renew: true, updated_at: '2026-11-01T00:00:00+00:00' };
  const newer = new Date(Date.now() + 60 * 864e5).toISOString();
  const state = { tables: { subscriptions: [row] } };
  let raced = false;
  // ilk update denemesinden önce başka bir eşitleme satırı daha ileri bir bitişle yazar
  state.beforeUpdate = (_t, rows) => { if (!raced) { raced = true; Object.assign(rows[0], { expires_at: newer, updated_at: '2026-11-13T00:00:00+00:00' }); } };
  const n = net({ subscribers: { [U]: playSubscriber() } });          // bu eşitlemenin gördüğü bitiş FUTURE (30 gün) < newer
  await setup(state, n, async ({ handler }) => { await handler(webhook({ type: 'RENEWAL', app_user_id: U })); });
  expect(state.tables.subscriptions[0].expires_at).toBe(newer);       // eski anlık görüntü yeni satırı ezmedi
});

test('uygulamadan eşitleme: kullanıcı başına 30 sn bekleme (429 + Retry-After); başarısızlıkta hemen yeniden denenebilir', async () => {
  const state = { tables: { subscriptions: [] }, users: { 'jeton-u': { id: U }, 'jeton-v': { id: V } } };
  const n = net({ subscribers: { [U]: playSubscriber(), [V]: playSubscriber() }, rcStatus: {} });
  await setup(state, n, async ({ handler }) => {
    const a = await handler(userCall());
    expect(a.status).toBe(200);
    expect(await a.json()).toMatchObject({ ok: true, active: true });
    const b = await handler(userCall());
    expect(b.status).toBe(429);
    expect(Number(b.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await b.json()).toMatchObject({ error: 'Çok sık istek', retry_after: expect.any(Number) });
    expect((await handler(userCall('jeton-v'))).status).toBe(200);     // başka kullanıcı etkilenmez
    expect((await handler(userCall('geçersiz'))).status).toBe(401);
  });
  expect(n.calls.rc.map((c) => c.id)).toEqual([U, V]);

  // RevenueCat hatası bekleme süresi başlatmaz
  const n2 = net({ rcStatus: { [U]: 500 } });
  await setup({ tables: { subscriptions: [] }, users: { 'jeton-u': { id: U } } }, n2, async ({ handler }) => {
    expect((await handler(userCall())).status).toBe(502);
    expect((await handler(userCall())).status).toBe(502);              // 429 değil: yeniden denendi
  });
  expect(n2.calls.rc).toHaveLength(2);
});

test('hata gövdeleri genel: RevenueCat metni, hata iletisi ve yığın istemciye gitmez; ayrıntı loglanır', async () => {
  const stateA = { tables: { subscriptions: [] }, users: { 'jeton-u': { id: U } } };
  const n = net({ rcStatus: { [U]: 503 }, rcText: 'RC-IC-HATA-METNI api_key: sk_gizli_deger' });
  let body;
  await setup(stateA, n, async ({ handler }) => {
    const res = await handler(userCall());
    expect(res.status).toBe(502);
    body = await res.text();
  });
  expect(JSON.parse(body)).toEqual({ error: 'Abonelik hizmetine ulaşılamadı' });
  expect(body).not.toMatch(/RC-IC|503|sk_|stack/);
  expect(n.calls.logs.some((l) => /RevenueCat/.test(l.body.message) && /503/.test(l.body.detail))).toBe(true);
  expect(JSON.stringify(n.calls.logs)).not.toContain('sk_gizli_deger');       // log da temizlenmiş

  // veritabanı hatası: 500 ve genel ileti
  const stateB = { tables: { subscriptions: [] }, users: { 'jeton-u': { id: U } }, readError: () => ({ message: 'DB-IC-HATA relation "x" does not exist', code: '42P01' }) };
  const n2 = net({ subscribers: { [U]: playSubscriber() } });
  await setup(stateB, n2, async ({ handler }) => {
    const res = await handler(userCall());
    expect(res.status).toBe(500);
    const t = await res.text();
    expect(JSON.parse(t)).toEqual({ error: 'Sunucu hatası' });
    expect(t).not.toMatch(/DB-IC|relation|42P01/);
  });
  expect(n2.calls.logs.some((l) => /beklenmeyen hata/.test(l.body.message))).toBe(true);
});

test('profili olmayan kimlik (silinmiş hesap, 23503) atlanır; webhook hata vermez', async () => {
  const state = { tables: { subscriptions: [] }, insertError: () => ({ code: '23503', message: 'fk' }) };
  const n = net({ subscribers: { [U]: playSubscriber() } });
  await setup(state, n, async ({ handler }) => {
    const res = await handler(webhook({ type: 'RENEWAL', app_user_id: U }));
    expect(res.status).toBe(200);
  });
  expect(state.tables.subscriptions).toHaveLength(0);
});

test('uzlaştırma: gizli başlık zorunlu ve sabit sürede denetlenir; BILLING_CRON_SECRET tanımsızsa kapalıdır', async () => {
  const state = { tables: { subscriptions: [] }, rpc: { billing_reconcile_candidates: () => ({ data: [U], error: null }) } };
  const n = net({ subscribers: { [U]: playSubscriber() } });
  await setup(state, n, async ({ handler }) => {
    for (const secret of [undefined, 'yanlis', '']) {
      const res = await handler(cronCall(secret));
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Yetkisiz' });
    }
    // webhook gizlisi ya da kullanıcı jetonu uzlaştırmayı çalıştırmaz
    expect((await handler(post('https://x.supabase.co/functions/v1/billing', { action: 'reconcile' }, { authorization: 'rc-webhook-degeri' }))).status).toBe(401);
  });
  expect(n.calls.rc).toHaveLength(0);
  const env = ENV(); delete env.BILLING_CRON_SECRET;
  await setup(state, n, async ({ handler }) => {
    expect((await handler(cronCall(''))).status).toBe(401);
    expect((await handler(cronCall('cron-gizli-degeri'))).status).toBe(401);
  }, env);
  expect(n.calls.rc).toHaveLength(0);
});

test('uzlaştırma: adayları RevenueCat\'ten tazeler (en çok 3 eşzamanlı), yenilenmiş aboneliğin bitişi ileri taşınır, korunan satır ezilmez', async () => {
  const ids = [U, V, W, ...Array.from({ length: 4 }, (_, i) => `0000000${i}-2222-3333-4444-555555555555`)];
  const subs = ids.map((id) => ({ user_id: id, store: 'app_store', product_id: 'tek_1_aylik', expires_at: PAST, active: true, will_renew: true, updated_at: '2026-10-01T00:00:00+00:00' }));
  subs[2] = { user_id: W, store: 'admin', product_id: 'tek_5_aylik', expires_at: FUTURE, active: true, updated_at: '2026-10-01T00:00:00+00:00' };
  const renewed = { entitlements: { pro: { expires_date: FUTURE, product_identifier: 'tek_1_aylik' } }, subscriptions: { tek_1_aylik: { store: 'app_store', period_type: 'normal' } } };
  const state = { tables: { subscriptions: subs }, rpc: { billing_reconcile_candidates: () => ({ data: [...ids, U, 'anonim-kimlik'], error: null }) } };   // yinelenen ve geçersiz kimlik elenir
  const n = net({ subscribers: Object.fromEntries(ids.map((id) => [id, renewed])) });
  await setup(state, n, async ({ handler }) => {
    const res = await handler(cronCall('cron-gizli-degeri'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, candidates: 7, synced: 6, kept: 1, failed: 0, rate_limited: false });
  });
  expect(n.calls.rc).toHaveLength(7);
  expect(n.maxInflight()).toBeLessThanOrEqual(3);
  for (const r of state.tables.subscriptions.filter((x) => x.user_id !== W)) expect(r.expires_at).toBe(FUTURE);
  expect(state.tables.subscriptions.find((x) => x.user_id === W)).toMatchObject({ store: 'admin', product_id: 'tek_5_aylik' });
});

test('uzlaştırma: yol soneki (/reconcile) de çalışır; RevenueCat 429 verirse durur; aday okunamazsa genel 500', async () => {
  const ids = Array.from({ length: 9 }, (_, i) => `1000000${i}-2222-3333-4444-555555555555`);
  const state = { tables: { subscriptions: [] }, rpc: { billing_reconcile_candidates: () => ({ data: ids.map((id) => ({ billing_reconcile_candidates: id })), error: null }) } };
  const n = net({ subscribers: {}, rcStatus: Object.fromEntries(ids.map((id) => [id, 429])) });
  await setup(state, n, async ({ handler }) => {
    const res = await handler(post('https://x.supabase.co/functions/v1/billing/reconcile', {}, { 'x-anahtar-secret': 'cron-gizli-degeri' }));
    const j = await res.json();
    expect(res.status).toBe(502);
    expect(j).toMatchObject({ ok: false, rate_limited: true });
    expect(j.failed).toBeLessThanOrEqual(3);                            // ilk grup 429 alınca durur
  });
  expect(n.calls.rc.length).toBeLessThanOrEqual(3);

  const bad = { tables: {}, rpc: { billing_reconcile_candidates: () => ({ data: null, error: { message: 'DB-IC-HATA' } }) } };
  await setup(bad, net(), async ({ handler }) => {
    const res = await handler(cronCall('cron-gizli-degeri'));
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('DB-IC-HATA');
  });
});

test('gizli anahtar: yeni SUPABASE_SECRET_KEYS ile log tablosuna yalnızca apikey başlığıyla yazılır', async () => {
  const state = { tables: { subscriptions: [] }, users: { 'jeton-u': { id: U } } };
  const n = net({ rcStatus: { [U]: 500 } });
  await setup(state, n, async ({ handler }) => { await handler(userCall()); });
  const h = n.calls.logs[0].headers;
  expect(h.apikey).toBe(SECRET_KEY);
  expect(h.authorization).toBeUndefined();
});

const DAY = 864e5;
test('RevenueCat silme kuyruğu: uzlaştırma DELETE /v1/subscribers/{id} çağırır (Bearer gizli anahtar), 404 de tamamdır, işlenen satırlar kuyruktan kalkar; aday akışı etkilenmez', async () => {
  const state = { tables: { subscriptions: [], revenuecat_deletions: [
    { user_id: U, created_at: new Date().toISOString() }, { user_id: V, created_at: new Date(Date.now() - 2 * DAY).toISOString() }] },
    rpc: { billing_reconcile_candidates: () => ({ data: [], error: null }) } };
  const n = net({ rcStatus: { [V]: 404 } });
  await setup(state, n, async ({ handler }) => {
    const res = await handler(cronCall('cron-gizli-degeri'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, candidates: 0, deletions: { deleted: 2, retry: 0, gave_up: 0 } });
  });
  expect(n.calls.rc.map((c) => [c.method, c.id])).toEqual([['DELETE', U], ['DELETE', V]]);
  expect(n.calls.rc[0].headers.Authorization).toBe('Bearer sk_test');
  expect(n.calls.rc[0].signal).toBeInstanceOf(AbortSignal);
  expect(state.tables.revenuecat_deletions).toEqual([]);
});

test('RevenueCat silme kuyruğu: hata (500, 429) satırı tutar ve sonraki uzlaştırmada yeniden denenir; 7 günü geçen satırdan vazgeçilir ve uyarı loglanır', async () => {
  const state = { tables: { subscriptions: [], revenuecat_deletions: [
    { user_id: U, created_at: new Date(Date.now() - 1 * DAY).toISOString() },
    { user_id: V, created_at: new Date(Date.now() - 8 * DAY).toISOString() },
    { user_id: W, created_at: new Date(Date.now() - 3 * DAY).toISOString() }] },
    rpc: { billing_reconcile_candidates: () => ({ data: [], error: null }) } };
  const n = net({ rcStatus: { [U]: 500, [V]: 500, [W]: 429 } });
  await setup(state, n, async ({ handler }) => {
    const res = await handler(cronCall('cron-gizli-degeri'));
    expect(res.status).toBe(200);                                                      // bekleyen silme uzlaştırmayı başarısız saymaz
    expect(await res.json()).toMatchObject({ ok: true, deletions: { deleted: 0, retry: 2, gave_up: 1 } });
  });
  expect(state.tables.revenuecat_deletions.map((r) => r.user_id).sort()).toEqual([U, W].sort());   // V'den vazgeçildi, U ve W kaldı
  expect(n.calls.logs.some((l) => l.body.level === 'warn' && /7 günde silinemedi/.test(l.body.message))).toBe(true);
  // sonraki gün RevenueCat düzelir: kalanlar silinir
  const n2 = net();
  await setup(state, n2, async ({ handler }) => {
    expect(await (await handler(cronCall('cron-gizli-degeri'))).json()).toMatchObject({ deletions: { deleted: 2, retry: 0, gave_up: 0 } });
  });
  expect(state.tables.revenuecat_deletions).toEqual([]);
});

test('RevenueCat silme kuyruğu: yalnız gizli başlıklı uzlaştırma çalıştırır; geçersiz kimlik atlanır; tablo yoksa (migration öncesi) uzlaştırma bozulmaz', async () => {
  const state = { tables: { subscriptions: [], revenuecat_deletions: [{ user_id: 'anonim-kimlik', created_at: new Date().toISOString() }, { user_id: U, created_at: new Date().toISOString() }] },
    rpc: { billing_reconcile_candidates: () => ({ data: [], error: null }) } };
  const n = net();
  await setup(state, n, async ({ handler }) => {
    expect((await handler(cronCall('yanlis'))).status).toBe(401);
    expect((await handler(webhook({ type: 'RENEWAL', app_user_id: V }))).status).toBe(200);
  });
  expect(n.calls.rc.filter((c) => c.method === 'DELETE')).toHaveLength(0);              // yetkisiz çağrı ve webhook kuyruğu işlemez
  await setup(state, n, async ({ handler }) => { await handler(cronCall('cron-gizli-degeri')); });
  expect(n.calls.rc.filter((c) => c.method === 'DELETE').map((c) => c.id)).toEqual([U]);
  const old = { tables: { subscriptions: [] }, readError: (t) => (t === 'revenuecat_deletions' ? { message: 'relation does not exist' } : null),
    rpc: { billing_reconcile_candidates: () => ({ data: [], error: null }) } };
  await setup(old, net(), async ({ handler }) => {
    const res = await handler(cronCall('cron-gizli-degeri'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, deletions: { deleted: 0, retry: 0, gave_up: 0 } });
  });
});
