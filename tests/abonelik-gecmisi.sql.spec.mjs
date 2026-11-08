// Abonelik geçmişi (migration abonelik_gecmisi): durum değişikliği olay yazar; sandbox sayılmaz; olayları ve kohortu yalnız yönetici görür.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

let db, as, q;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });
const kinds = async () => (await db.query(`select kind from public.subscription_events where user_id = $1 order by id`, [ID.L])).rows.map((r) => r.kind);

test('başladı → iptal → yeniden → ödeme sorunu → bitti; tekrar başladı', async () => {
  await as(null);
  await db.query(`delete from public.subscriptions where user_id = $1`, [ID.L]);
  await db.query(`delete from public.subscription_events`);
  await db.query(`insert into public.subscriptions (user_id, product_id, active, will_renew, environment) values ($1, 'bes_aylik', true, true, 'production')`, [ID.L]);
  await db.query(`update public.subscriptions set will_renew = false where user_id = $1`, [ID.L]);
  await db.query(`update public.subscriptions set will_renew = true where user_id = $1`, [ID.L]);
  await db.query(`update public.subscriptions set billing_issue = true where user_id = $1`, [ID.L]);
  await db.query(`update public.subscriptions set active = false where user_id = $1`, [ID.L]);
  await db.query(`update public.subscriptions set active = true, billing_issue = false where user_id = $1`, [ID.L]);
  expect(await kinds()).toEqual(['basladi', 'iptal', 'yeniden', 'odeme_sorunu', 'bitti', 'basladi']);
  await db.query(`update public.subscriptions set updated_at = now() where user_id = $1`, [ID.L]);   // değişiklik yok → olay yok
  expect((await kinds()).length).toBe(6);
});

test('sandbox (deneme satın alma) olay yazmaz', async () => {
  await as(null);
  await db.query(`delete from public.subscriptions where user_id = $1`, [ID.L]);
  await db.query(`delete from public.subscription_events`);
  await db.query(`insert into public.subscriptions (user_id, product_id, active, will_renew, environment) values ($1, 'tek_aylik', true, true, 'sandbox')`, [ID.L]);
  await db.query(`update public.subscriptions set active = false where user_id = $1`, [ID.L]);
  expect(await kinds()).toEqual([]);
});

test('olaylar ve kohort: yalnız yönetici; kohortta kayıt ayı, büyüklük ve aylık etkin kişi', async () => {
  await as(null);
  await db.query(`insert into public.subscriptions (user_id, product_id, active, will_renew, environment) values ($1, 'bes_aylik', true, true, 'production')
                  on conflict (user_id) do update set environment = 'production', active = true, product_id = 'bes_aylik'`, [ID.L]);
  await db.query(`insert into public.activity (owner_id, actor, actor_role, entity, action) values ($1, $1, 'landlord', 'property', 'create')`, [ID.L]);
  await as(ID.A);
  const ev = (await q(`select public.admin_subscription_events() e`))[0].e;
  expect(ev.at(-1)).toMatchObject({ user_id: ID.L, kind: 'basladi', product_id: 'bes_aylik', backfill: false });
  const co = (await q(`select public.admin_cohorts(12) c`))[0].c;
  const m = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Istanbul' }).slice(0, 7);
  const own = co.find((x) => x.role === 'landlord' && x.cohort === m);
  expect(own.size).toBeGreaterThanOrEqual(1);
  expect(own.active[m]).toBeGreaterThanOrEqual(1);
  expect(co.some((x) => x.size > 0 && x.cohort > m)).toBe(false);
  for (const who of [ID.L, ID.T]) {
    await as(who);
    expect(await tryCall(db, `select public.admin_subscription_events()`)).toMatch(/Yönetici yetkisi/);
    expect(await tryCall(db, `select public.admin_cohorts()`)).toMatch(/Yönetici yetkisi/);
    expect(await q(`select * from public.subscription_events`)).toEqual([]);
  }
});
