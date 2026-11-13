// push Edge Function'ı (supabase/functions/push): Web Push uç nokta izin listesi, iOS yükünde body.url, Android verisi, her dış istekte zaman aşımı.
import { test, expect } from '@playwright/test';
import { withEdge, post, fakeSupabase } from './edge-harness.mjs';
import { allowedPushEndpoint } from '../supabase/functions/push/endpoint.ts';

const U = '11111111-2222-3333-4444-555555555555';
const note = (over = {}) => ({ type: 'INSERT', table: 'notifications', schema: 'public', old_record: null,
  record: { id: 1, user_id: U, property_id: null, title: 'Yeni talep', body: 'Musluk bozuk', url: '/uygulama/talepler', tag: 'req-1', ...over } });
const hook = (b) => post('https://x.supabase.co/functions/v1/push', b, { 'x-evim-secret': 'push-gizli' });
const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEYS: '{"default":"sb_secret_a"}', WEBHOOK_SECRET: 'push-gizli',
  APNS_KEY: 'x', APNS_KEY_ID: 'KID', APNS_TEAM_ID: 'TEAM', FCM_SERVICE_ACCOUNT: JSON.stringify({ private_key: 'x', client_email: 'sa@x.iam', project_id: 'proje-1' }) };

test('Web Push uç noktası: yalnız bilinen push servisleri (https, 443) kabul edilir', () => {
  for (const ok of [
    'https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://web.push.apple.com/QGh',
    'https://api.push.apple.com/3/device/x', 'https://wns2-par02p.notify.windows.com/w/?token=abc', 'https://FCM.GOOGLEAPIS.COM:443/fcm/send/abc',
  ]) expect(allowedPushEndpoint(ok), ok).toBe(true);
  for (const bad of [
    'http://fcm.googleapis.com/fcm/send/abc', 'https://evil.example/fcm.googleapis.com', 'https://fcm.googleapis.com.evil.example/x',
    'https://evilfcm.googleapis.com/x', 'https://push.apple.com/x', 'https://notify.windows.com/x', 'https://x.notify.windows.com.evil.io/x',
    'https://fcm.googleapis.com:8443/x', 'https://user:pw@fcm.googleapis.com/x', 'https://127.0.0.1/x', 'https://169.254.169.254/latest', 'https://localhost/x',
    'ftp://fcm.googleapis.com/x', '//fcm.googleapis.com/x', 'fcm.googleapis.com', '', 'https://[::1]/x', 'javascript:alert(1)',
    'https://android.googleapis.com/gcm/send/abc', 'https://' + 'a'.repeat(2100) + '.push.apple.com',
  ]) expect(allowedPushEndpoint(bad), bad).toBe(false);
  expect(allowedPushEndpoint(null)).toBe(false);
  expect(allowedPushEndpoint(undefined)).toBe(false);
  expect(allowedPushEndpoint({ toString: () => 'https://fcm.googleapis.com/x' })).toBe(false);
});

test('Web Push: izin listesi dışındaki uç nokta atlanır (istek atılmaz, kayıt silinmez); izinli uç nokta zaman aşımıyla gönderilir', async () => {
  const state = { tables: {
    push_subscriptions: [{ user_id: U, endpoint: 'https://169.254.169.254/latest/meta-data', keys: { p256dh: 'a', auth: 'b' } },
                         { user_id: U, endpoint: 'https://fcm.googleapis.com/fcm/send/iyi', keys: { p256dh: 'a', auth: 'b' } }],
    device_tokens: [], profiles: [{ id: U, settings: { email: false }, phone: '' }],
  } };
  const sent = [], posted = [];
  const db = fakeSupabase(state);
  await withEdge('push/index.ts', {
    env: ENV, createClient: () => db,
    webpush: async (sub, payload, opts) => { sent.push({ sub, payload: JSON.parse(payload), opts }); },
    fetch: async (u, o) => { posted.push({ u: String(u), body: o?.body }); return new Response(null, { status: 201 }); },
  }, async ({ handler }) => {
    const res = await handler(hook(note()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 1 });
  });
  expect(sent).toHaveLength(1);
  expect(sent[0].sub.endpoint).toBe('https://fcm.googleapis.com/fcm/send/iyi');
  expect(sent[0].opts).toMatchObject({ TTL: 86400, timeout: 10000 });
  expect(sent[0].payload).toMatchObject({ title: 'Yeni talep', url: '/uygulama/talepler' });
  expect(state.tables.push_subscriptions).toHaveLength(2);                         // atlanan kayıt silinmez
  expect(posted.some((p) => /function_logs/.test(p.u) && /izin verilen servisler dışında/.test(p.body))).toBe(true);
  expect(posted.every((p) => !p.u.includes('169.254'))).toBe(true);
});

test('iOS: bildirim verisi yükün kökündeki body anahtarında (expo-notifications), eski url alanı da durur; APNs isteği zaman aşımlıdır', async () => {
  const state = { tables: { push_subscriptions: [], device_tokens: [{ user_id: U, token: 'test-ios-device-token', platform: 'ios' }], profiles: [{ id: U, settings: { email: false }, phone: '' }] } };
  const calls = [];
  const db = fakeSupabase(state);
  await withEdge('push/index.ts', {
    env: ENV, createClient: () => db,
    fetch: async (u, o) => { calls.push({ u: String(u), o }); return String(u).includes('function_logs') ? new Response(null, { status: 201 }) : new Response('{}', { status: 200 }); },
  }, async ({ handler }) => {
    const res = await handler(hook(note({ url: '#/mulk-sahibi/mulk/p1/odeme' })));
    expect(await res.json()).toMatchObject({ sent: 1 });
  });
  const apns = calls.find((c) => c.u.startsWith('https://api.push.apple.com/3/device/'));
  expect(apns.u).toBe('https://api.push.apple.com/3/device/test-ios-device-token');
  expect(apns.o.signal).toBeInstanceOf(AbortSignal);
  expect(apns.o.headers['apns-topic']).toBe('io.anahtar.app');
  const payload = JSON.parse(apns.o.body);
  expect(payload.aps.alert).toEqual({ title: 'Yeni talep', body: 'Musluk bozuk' });
  expect(payload.body).toEqual({ url: '/uygulama/mulk?pid=p1&sub=odeme' });
  expect(payload.url).toBe('/uygulama/mulk?pid=p1&sub=odeme');
});

test('Android: FCM verisi data.url olarak sürer; token alma ve gönderme istekleri zaman aşımlıdır; cihaz anahtarı adrese güvenli yazılır', async () => {
  const state = { tables: { push_subscriptions: [], device_tokens: [{ user_id: U, token: 'fcm-token', platform: 'android' }], profiles: [{ id: U, settings: { email: false }, phone: '' }] } };
  const calls = [];
  const db = fakeSupabase(state);
  await withEdge('push/index.ts', {
    env: ENV, createClient: () => db,
    fetch: async (u, o) => {
      calls.push({ u: String(u), o });
      if (String(u).includes('oauth2.googleapis.com')) return Response.json({ access_token: 'at', expires_in: 3600 });
      return String(u).includes('function_logs') ? new Response(null, { status: 201 }) : new Response('{}', { status: 200 });
    },
  }, async ({ handler }) => {
    const res = await handler(hook(note()));
    expect(await res.json()).toMatchObject({ sent: 1 });
  });
  const tok = calls.find((c) => c.u === 'https://oauth2.googleapis.com/token');
  expect(tok.o.signal).toBeInstanceOf(AbortSignal);
  const fcm = calls.find((c) => c.u === 'https://fcm.googleapis.com/v1/projects/proje-1/messages:send');
  expect(fcm.o.signal).toBeInstanceOf(AbortSignal);
  const msg = JSON.parse(fcm.o.body).message;
  expect(msg.data).toEqual({ url: '/uygulama/talepler' });
  expect(msg.android.notification.channel_id).toBe('evim');
  expect(msg.token).toBe('fcm-token');
});

test('APNs zaman aşımı / ağ hatası bildirimi durdurmaz: hata loglanır, yanıt yine 200', async () => {
  const state = { tables: { push_subscriptions: [], device_tokens: [{ user_id: U, token: 'test-ios-device-token', platform: 'ios' }], profiles: [{ id: U, settings: {}, phone: '' }] } };
  const posted = [];
  const db = fakeSupabase(state);
  await withEdge('push/index.ts', {
    env: ENV, createClient: () => db,
    fetch: async (u, o) => {
      if (String(u).includes('function_logs')) { posted.push(JSON.parse(o.body)); return new Response(null, { status: 201 }); }
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    },
  }, async ({ handler }) => {
    const res = await handler(hook(note()));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 0 });
  });
  expect(posted.some((p) => /cihaz bildirimi hatası/.test(p.message))).toBe(true);
});

test('gizli başlık: yanlış x-evim-secret 401; webhook gövdesi {type, table, schema, record, old_record} biçimiyle çalışır', async () => {
  const db = fakeSupabase({ tables: { push_subscriptions: [], device_tokens: [], profiles: [{ id: U, settings: { email: false }, phone: '' }] } });
  await withEdge('push/index.ts', { env: ENV, createClient: () => db }, async ({ handler }) => {
    expect((await handler(post('https://x.supabase.co/functions/v1/push', note(), { 'x-evim-secret': 'yanlis' }))).status).toBe(401);
    expect((await handler(post('https://x.supabase.co/functions/v1/push', note()))).status).toBe(401);
    const ignored = await handler(hook({ ...note(), type: 'UPDATE' }));
    expect(ignored.status).toBe(200);
    expect(await ignored.text()).toBe('Yok sayıldı');
  });
  await withEdge('push/index.ts', { env: { ...ENV, WEBHOOK_SECRET: '' }, createClient: () => db }, async ({ handler }) => {
    expect((await handler(hook(note()))).status).toBe(401);       // gizli tanımsızsa kapalı
  });
});
