// Hoş geldin e-postası (şema 23. bölüm): tür ve paket seçimi, deneme bitişi, eski hesaplar ve tek seferlik gönderim.
// İşlevler yalnız sunucu içindir; kullanıcı çağıramaz, kayıt tablosunu okuyamaz. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

let db, as, q;
const info = async (uid) => (await q(`select public.welcome_info($1) as i`, [uid]))[0].i;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); await as(null); });

test('kiracı → tenant; paket seçmeyen mülk sahibi → Başlangıç, deneme bitişiyle; yönetici gönderilmez', async () => {
  expect((await info(ID.T)).kind).toBe('tenant');
  const l = await info(ID.L);
  expect(l).toMatchObject({ kind: 'tek', email: 'ev@ornek.com', name: 'Ev Sahibi' });
  const days = (Date.parse(l.trial_ends) - Date.now()) / 86400000;
  expect(days).toBeGreaterThan(29); expect(days).toBeLessThan(31);
  expect((await info(ID.A)).kind).toBe('skip');
  expect((await info(ID.T)).trial_ends).toBeNull();
});

test('mülk sahibinin paketi: kayıtta seçtiği paket, sonra ayardaki seçim; ücretli abonelik hepsinden önce gelir', async () => {
  await q(`update auth.users set raw_user_meta_data = raw_user_meta_data || '{"plan":"bes"}' where id = $1`, [ID.L]);
  expect((await info(ID.L)).kind).toBe('bes');
  await q(`update auth.users set raw_user_meta_data = raw_user_meta_data - 'plan' where id = $1`, [ID.L]);
  await q(`update public.profiles set settings = '{"planChoice":{"plan":"bes","units":2}}' where id = $1`, [ID.L]);
  expect((await info(ID.L)).kind).toBe('bes');
  await q(`insert into public.subscriptions (user_id, product_id, period_type, expires_at, active) values ($1, 'tek_3_aylik', 'trial', now() + interval '7 days', true)`, [ID.L]);
  const l = await info(ID.L);
  expect(l.kind).toBe('tek');
  expect((Date.parse(l.trial_ends) - Date.now()) / 86400000).toBeLessThan(8);   // mağaza denemesinin bitişi
  await q(`update public.subscriptions set period_type = 'normal' where user_id = $1`, [ID.L]);
  expect((await info(ID.L)).trial_ends).toBeNull();
});

test('bu özellikten önce açılan hesaplara gönderilmez', async () => {
  await q(`update public.profiles set created_at = '2026-01-01' where id = $1`, [ID.L2]);
  expect((await info(ID.L2)).kind).toBe('skip');
});

test('gönderim bir kez ayrılır', async () => {
  expect((await q(`select public.welcome_claim($1, 'tenant') as ok`, [ID.T]))[0].ok).toBe(true);
  expect((await q(`select public.welcome_claim($1, 'tenant') as ok`, [ID.T]))[0].ok).toBe(false);
});

test('kullanıcı işlevleri çağıramaz, kayıtları okuyamaz ve yazamaz', async () => {
  await as(ID.T);
  expect(await tryCall(db, `select public.welcome_info('${ID.L}')`)).toBeTruthy();
  expect(await tryCall(db, `select public.welcome_claim('${ID.X}', 'tenant')`)).toBeTruthy();
  expect(await q(`select * from public.welcome_mail`)).toEqual([]);
  expect(await tryCall(db, `insert into public.welcome_mail (user_id, kind) values ('${ID.X}', 'tenant')`)).toBeTruthy();
  await as(null);
});
