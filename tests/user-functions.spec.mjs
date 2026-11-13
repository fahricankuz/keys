// Kullanıcı jetonuyla çağrılan fonksiyonlar (welcome, invite-mail, site-invite): ortak istemci üretici ve Sentry sarmalayıcısı sonrası davranış aynı kalır.
import { test, expect } from '@playwright/test';
import { withEdge, post, fakeSupabase } from './edge-harness.mjs';

const U = '11111111-2222-3333-4444-555555555555';
const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEYS: '{"default":"sb_secret_a"}', SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_a"}',
  RESEND_API_KEY: 're_test', EMAIL_FROM: 'anahtar <info@anahtar.io>' };

function net() {
  const mails = [];
  return { mails, fetch: async (u, o) => {
    if (String(u).includes('api.resend.com')) { mails.push(JSON.parse(o.body)); return new Response('{}', { status: 200 }); }
    return new Response(null, { status: 201 });
  } };
}

test('site-invite: yöneticinin Authorization başlığı yayınlanabilir anahtarla birlikte taşınır; davet e-postası gider', async () => {
  const n = net();
  const made = [];
  const db = { ...fakeSupabase({}), rpc: async (name, args) => ({ data: { email: 'sakin@example.com', name: 'Ayşe', role: 'malik', org: 'Dalyan Sitesi', unit: 'A3', code: 'S1A2B3C4', sector: 'site' }, error: null, name, args }) };
  await withEdge('site-invite/index.ts', { env: ENV, fetch: n.fetch, createClient: (...a) => { made.push(a); return db; } }, async ({ handler }) => {
    const res = await handler(post('https://x.supabase.co/functions/v1/site-invite', { resident: 'r-1' }, { authorization: 'Bearer yonetici-jetonu' }));
    expect(await res.json()).toEqual({ ok: true, sent: true });
    expect((await handler(post('https://x.supabase.co/functions/v1/site-invite', { resident: 'r-1' }))).status).toBe(401);
    expect((await handler(post('https://x.supabase.co/functions/v1/site-invite', {}, { authorization: 'Bearer x' }))).status).toBe(400);
  });
  expect(made).toHaveLength(1);
  expect(made[0][1]).toBe('sb_publishable_a');
  expect(made[0][2].global.headers.authorization).toBe('Bearer yonetici-jetonu');
  expect(n.mails.map((m) => m.to)).toEqual(['sakin@example.com']);
});

test('site-invite: veritabanı yeniden gönderimi kısıtladıysa (throttled) e-posta gitmez; yetki hatası 403 olur', async () => {
  const n = net();
  const mk = (r) => ({ ...fakeSupabase({}), rpc: async () => r });
  await withEdge('site-invite/index.ts', { env: ENV, fetch: n.fetch, createClient: () => mk({ data: { throttled: true }, error: null }) }, async ({ handler }) => {
    const res = await handler(post('https://x.supabase.co/functions/v1/site-invite', { resident: 'r-1' }, { authorization: 'Bearer t' }));
    expect(await res.json()).toEqual({ ok: true, sent: false, reason: 'throttled' });
  });
  await withEdge('site-invite/index.ts', { env: ENV, fetch: n.fetch, createClient: () => mk({ data: null, error: { message: 'yetki yok' } }) }, async ({ handler }) => {
    expect((await handler(post('https://x.supabase.co/functions/v1/site-invite', { resident: 'r-1' }, { authorization: 'Bearer t' }))).status).toBe(403);
  });
  expect(n.mails).toEqual([]);
});

test('welcome ve invite-mail: jeton yoksa ya da geçersizse 401; kullanıcı gizli anahtarlı sunucu istemcisiyle aranır', async () => {
  for (const fn of ['welcome', 'invite-mail']) {
    const state = { users: { 'gecerli': { id: U } }, rpc: {} };
    const made = [];
    const db = fakeSupabase(state);
    await withEdge(`${fn}/index.ts`, { env: ENV, fetch: net().fetch, createClient: (...a) => { made.push(a); return db; } }, async ({ handler }) => {
      expect((await handler(post(`https://x.supabase.co/functions/v1/${fn}`, {}))).status, fn).toBe(401);
      expect((await handler(post(`https://x.supabase.co/functions/v1/${fn}`, {}, { authorization: 'Bearer gecersiz' }))).status, fn).toBe(401);
      expect((await handler(new Request(`https://x.supabase.co/functions/v1/${fn}`, { method: 'GET' }))).status, fn).toBe(405);
    });
    expect(made[0][1], fn).toBe('sb_secret_a');
  }
});
