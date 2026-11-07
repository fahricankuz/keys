// Yönetici paneli göstergeleri ve giderler (migration panel_gelir_gider): kurum kirası ve aidat hacmi, tahmini gelir tabanı
// (paket, dönem, mülk adedi), kurum özeti; gider kaydı yalnız yöneticide, her işlem İşlem kaydı'nda; hatalı girdi reddedilir.
import { test, expect } from '@playwright/test';
import { newDb, ID, tryCall } from './db-helpers.mjs';

let db, as, q, org;
const m = new Date().toISOString().slice(0, 7);
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Kordon AVM', sector: 'avm', units: 40 }]);
  await as(null);
  const [{ id: u }] = await q(`insert into public.site_units (org_id, no, area) values ($1, 'Z-1', 100) returning id`, [org]);
  await db.query(`insert into public.site_charges (org_id, unit_id, month, kind, amount, status, paid_amount) values
    ($1, $2, $3, 'kira', 80000, 'paid', 80000), ($1, $2, $3, 'ciro', 5000, 'partial', 2000), ($1, $2, $3, 'aidat', 1500, 'paid', 1500),
    ($1, $2, $3, 'ortak_gider', 9000, 'paid', 9000)`, [org, u, m]);
  await db.query(`insert into public.payments (property_id, month, kind, amount, status) values ('p1', $1, 'aidat', 1200, 'approved')`, [m]);
  await db.query(`insert into public.subscriptions (user_id, product_id, store, period_type, expires_at, active, will_renew)
    values ($1, 'anahtar_bes_5_yillik', 'app_store', 'normal', now() + interval '200 days', true, true),
           ($2, 'anahtar_tek_3_aylik', 'play_store', 'normal', now() + interval '20 days', true, true)`, [ID.L, ID.L2]);
});

test('göstergeler: kurum kirası (kira + ciro, tahsil edilen), aidat hacmi, gelir tabanı, kurum özeti', async () => {
  await as(ID.A);
  const [{ k }] = await q(`select public.admin_kpis(30) k`);
  expect(Number(k.orgRent.month)).toBe(82000);                 // ortak gider ve aidat girmez
  expect(Number(k.aidat.month)).toBe(1200);
  expect(Number(k.aidat.siteMonth)).toBe(1500);
  expect(k.rent).toEqual(expect.objectContaining({ month: expect.anything(), prevMonth: expect.anything() }));   // eski alanlar duruyor
  const base = k.revenueBase.map((x) => [x.plan, x.yearly, Number(x.owners), Number(x.units)]).sort();
  expect(base).toEqual([['bes', true, 1, 5], ['tek', false, 1, 3]].sort());
  expect(k.orgs).toMatchObject({ total: 1, active: 1, bySector: { avm: 1 }, units: 1, contracted: 40 });
});

test('gider: yönetici ekler, düzenler, siler; her işlem kayıtta; kullanıcı göremez ve yazamaz; hatalı girdi', async () => {
  await as(ID.A);
  const [{ id }] = await q(`select public.admin_cost_save($1::jsonb) id`, [JSON.stringify({ title: 'Supabase Pro', category: 'altyapi', amount: 25, currency: 'USD', vat_included: false, vat_rate: 20, recurrence: 'monthly', start_on: '2026-11-03' })]);
  await q(`select public.admin_cost_save($1::jsonb)`, [JSON.stringify({ id, title: 'Supabase Pro', category: 'altyapi', amount: 30, currency: 'USD', recurrence: 'monthly', start_on: '2026-11-03' })]);
  expect(await q(`select amount::text, currency, recurrence, vat_included from public.admin_costs`)).toEqual([{ amount: '30.00', currency: 'USD', recurrence: 'monthly', vat_included: true }]);
  expect(await tryCall(db, `select public.admin_cost_save('{"title":"","amount":5}'::jsonb)`)).toMatch(/Başlık/);
  expect(await tryCall(db, `select public.admin_cost_save('{"title":"X","amount":0}'::jsonb)`)).toMatch(/sıfırdan büyük/);
  expect(await tryCall(db, `select public.admin_cost_save('{"title":"X","amount":5,"category":"yemek"}'::jsonb)`)).toMatch(/check/);
  expect(await tryCall(db, `select public.admin_cost_save('{"title":"X","amount":5,"start_on":"2026-11-10","end_on":"2026-11-01"}'::jsonb)`)).toMatch(/Bitiş/);
  for (const who of [ID.L, ID.T]) {
    await as(who);
    expect(await q(`select * from public.admin_costs`)).toEqual([]);
    expect(await tryCall(db, `select public.admin_cost_save('{"title":"X","amount":5}'::jsonb)`)).toMatch(/Yönetici/);
    expect(await tryCall(db, `select public.admin_cost_delete($1)`, [id])).toMatch(/Yönetici/);
    expect(await tryCall(db, `select public.admin_kpis(30)`)).toMatch(/Yönetici/);
  }
  await as(ID.A);
  await q(`select public.admin_cost_delete($1)`, [id]);
  await as(null);
  expect((await q(`select action from public.admin_audit where action like 'cost.%' order by at`)).map((r) => r.action)).toEqual(['cost.create', 'cost.update', 'cost.delete']);
  expect(await q(`select * from public.admin_costs`)).toEqual([]);
});
