// lead-mail Edge Function'ı (supabase/functions/lead-mail): ekibe bildirim her zaman gider; müşteriye "talebini aldık" e-postası yalnız
// talepteki adres, talebi açan hesabın e-postasıyla aynıysa gider; hesapsız (anonim) talepte müşteriye e-posta gitmez (şartname 11).
import { test, expect } from '@playwright/test';
import { withEdge, post, fakeSupabase } from './edge-harness.mjs';

const U = '11111111-2222-3333-4444-555555555555';
const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SECRET_KEYS: '{"default":"sb_secret_a"}', LEAD_SECRET: 'lead-gizli',
  RESEND_API_KEY: 're_test', EMAIL_FROM: 'anahtar <info@anahtar.io>', LEAD_TO: 'info@anahtar.io' };
const lead = (over = {}) => ({ type: 'INSERT', table: 'support_requests', schema: 'public', old_record: null,
  record: { id: 'aaaaaaaa-1111-2222-3333-444444444444', user_id: null, kind: 'genel', name: 'Ayşe', email: 'ayse@example.com', phone: '', company: '', message: 'Merhaba', source: 'web', details: {}, ...over } });
const call = (body, secret = 'lead-gizli') => post('https://x.supabase.co/functions/v1/lead-mail', body, secret === null ? {} : { 'x-anahtar-secret': secret });

/** Resend çağrılarını toplar; function_logs yazımını yok sayar. */
function mailNet() {
  const mails = [], logs = [];
  const fetch = async (u, o) => {
    if (String(u).includes('api.resend.com')) { mails.push(JSON.parse(o.body)); expect(o.signal).toBeInstanceOf(AbortSignal); return new Response('{}', { status: 200 }); }
    if (String(u).includes('function_logs')) { logs.push(JSON.parse(o.body)); return new Response(null, { status: 201 }); }
    throw new Error('beklenmeyen ağ çağrısı: ' + u);
  };
  return { fetch, mails, logs };
}
const run = (n, accounts, fn) => withEdge('lead-mail/index.ts', { env: ENV, fetch: n.fetch, createClient: () => fakeSupabase({ accounts }) }, fn);

test('hesapsız (anonim web formu) talep: ekibe bildirim gider, yazılan adrese teşekkür e-postası GİTMEZ (user_id yok, boş ya da eksik)', async () => {
  for (const user_id of [null, undefined, '']) {
    const n = mailNet();
    await run(n, {}, async ({ handler }) => {
      const res = await handler(call(lead({ user_id })));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, ack: false });
    });
    expect(n.mails.map((m) => m.to), String(user_id)).toEqual(['info@anahtar.io']);           // yalnız ekip; müşterinin yazdığı adrese hiçbir şey gitmez
  }
  // user_id alanı hiç yoksa da
  const n = mailNet();
  await run(n, {}, async ({ handler }) => {
    const body = lead();
    delete body.record.user_id;
    expect(await (await handler(call(body))).json()).toEqual({ ok: true, ack: false });
  });
  expect(n.mails.map((m) => m.to)).toEqual(['info@anahtar.io']);
});

test('hesaplı talep: talepteki adres hesabın e-postasıyla aynıysa (büyük/küçük harf ve boşluk fark etmez) teşekkür gider', async () => {
  const n = mailNet();
  await run(n, { [U]: { email: 'Ayse@Example.com' } }, async ({ handler }) => {
    const res = await handler(call(lead({ user_id: U, email: ' ayse@example.com ' })));
    expect(await res.json()).toEqual({ ok: true, ack: true });
  });
  expect(n.mails.map((m) => m.to)).toEqual(['info@anahtar.io', 'ayse@example.com']);
});

test('hesaplı talep, başka kişinin adresi: ekibe bildirim gider, o adrese e-posta GİTMEZ', async () => {
  const n = mailNet();
  await run(n, { [U]: { email: 'ayse@example.com' } }, async ({ handler }) => {
    const res = await handler(call(lead({ user_id: U, email: 'kurban@example.org', message: 'sahte talep' })));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ack: false });
  });
  expect(n.mails.map((m) => m.to)).toEqual(['info@anahtar.io']);
  expect(JSON.stringify(n.mails)).not.toContain('"to":"kurban@example.org"');
});

test('hesap okunamazsa (silinmiş / hata) teşekkür gönderilmez ve ekibe bildirim yine gider', async () => {
  const n = mailNet();
  await run(n, {}, async ({ handler }) => {
    const res = await handler(call(lead({ user_id: U })));
    expect(await res.json()).toEqual({ ok: true, ack: false });
  });
  expect(n.mails.map((m) => m.to)).toEqual(['info@anahtar.io']);
  expect(n.logs.some((l) => l.level === 'warn' && /hesap okunamadı/.test(l.message))).toBe(true);
});

test('hukuki destek talebi (legal_requests): teşekkür yalnız hesabın e-postasına gider', async () => {
  const legal = (email) => ({ type: 'INSERT', table: 'legal_requests', schema: 'public', old_record: null,
    record: { id: 'bbbbbbbb-1111-2222-3333-444444444444', no: 7, user_id: U, role: 'tenant', topic: 'depozito', body: 'Depozito iadesi', property_name: 'Daire 3',
      files: [], context: {}, contact: { name: 'Ayşe', email, phone: '' }, price: 3000 } });
  let n = mailNet();
  await run(n, { [U]: { email: 'ayse@example.com' } }, async ({ handler }) => { expect(await (await handler(call(legal('ayse@example.com')))).json()).toEqual({ ok: true, ack: true }); });
  expect(n.mails.map((m) => m.to)).toEqual(['info@anahtar.io', 'ayse@example.com']);
  n = mailNet();
  await run(n, { [U]: { email: 'ayse@example.com' } }, async ({ handler }) => { expect(await (await handler(call(legal('baskasi@example.org')))).json()).toEqual({ ok: true, ack: false }); });
  expect(n.mails.map((m) => m.to)).toEqual(['info@anahtar.io']);
});

test('gizli başlık değişmedi: x-anahtar-secret (LEAD_SECRET), sabit süreli karşılaştırma, tanımsızsa kapalı', async () => {
  const n = mailNet();
  await run(n, {}, async ({ handler }) => {
    expect((await handler(call(lead(), 'yanlis'))).status).toBe(401);
    expect((await handler(call(lead(), null))).status).toBe(401);
    expect((await handler(new Request('https://x.supabase.co/functions/v1/lead-mail', { method: 'GET' }))).status).toBe(405);
  });
  await withEdge('lead-mail/index.ts', { env: { ...ENV, LEAD_SECRET: '' }, fetch: n.fetch, createClient: () => fakeSupabase({}) }, async ({ handler }) => {
    expect((await handler(call(lead(), ''))).status).toBe(401);
  });
  expect(n.mails).toEqual([]);
});
