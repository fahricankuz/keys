// Aynı e-posta birden çok rol taşır: mülk sahibi hesabı başka bir mülkte kiracı olabilir (davet kodu); kendi mülkünün davetini kullanamaz;
// kiracı olduğu mülkün sahibi gibi davranamaz. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

let db, as, q;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

test('mülk sahibi (L), başka mülk sahibinin (L2) kiracı davetini kabul edip o mülkte kiracı olur', async () => {
  await as(ID.L2);
  const [{ code }] = await q(`insert into public.invites (property_id, created_by) values ('p2', $1) returning code`, [ID.L2]);
  await as(ID.L);
  const [{ accept_invite: pid }] = await q(`select public.accept_invite($1)`, [code]);
  expect(pid).toBe('p2');
  await as(null);
  const m = await q(`select role from public.memberships where property_id = 'p2' and user_id = $1`, [ID.L]);
  expect(m).toEqual([{ role: 'tenant' }]);
  expect((await q(`select role from public.profiles where id = $1`, [ID.L]))[0].role).toBe('landlord');   // hesap rolü değişmedi
  // Her iki mülkü de görür (kendi evi p1 ve kiracısı olduğu p2).
  await as(ID.L);
  expect((await q(`select id from public.properties order by id`)).map((r) => r.id)).toEqual(['p1', 'p2']);
});

test('kiracı olduğu mülkün sahibi gibi davranamaz; kendi mülkünün davetini kullanamaz', async () => {
  await as(ID.L);
  await q(`update public.properties set rent = 1 where id = 'p2'`);            // RLS: satır güncellenmez
  await as(null);
  expect(Number((await q(`select rent from public.properties where id = 'p2'`))[0].rent)).toBe(40000);

  await as(ID.L2);
  const [{ code }] = await q(`insert into public.invites (property_id, created_by) values ('p2', $1) returning code`, [ID.L2]);
  expect(await tryCall(db, `select public.accept_invite($1)`, [code])).toMatch(/Kendi davetini/);
  await as(ID.L);
  const [{ code: c2 }] = await q(`insert into public.invites (property_id, created_by) values ('p1', $1) returning code`, [ID.L]);
  expect(await tryCall(db, `select public.accept_invite($1)`, [c2])).toMatch(/Kendi davetini/);
});

test('kiracı hesabı davetleri eskisi gibi kabul eder; kullanılmış davet yeniden kullanılamaz', async () => {
  await as(ID.L2);
  const [{ code }] = await q(`insert into public.invites (property_id, created_by) values ('p2', $1) returning code`, [ID.L2]);
  await as(ID.X);
  await q(`select public.accept_invite($1)`, [code]);
  await as(ID.L);
  expect(await tryCall(db, `select public.accept_invite($1)`, [code])).toMatch(/kullanılmış/);
});
