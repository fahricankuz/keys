// Kurumsal paketin mülk adedi sınırdır (migration kurumsal_adet): yönetici "Kurumsal · N mülk" verince N'den fazla mülk eklenemez;
// sınırın üstündeki mevcut mülkler silinmez. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

let db, as, q;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

const add = (n) => q(`insert into public.properties (id, owner_id, name) values ($1, $2, $3)`, ['k' + n, ID.L2, 'Mülk ' + n]);

test('Kurumsal · 2 mülk: erişimde adet 2; üçüncü mülk reddedilir', async () => {
  await as(ID.A);
  await q(`select public.admin_set_plan($1, 'kurumsal', null, 'test', 2, 'emlak')`, [ID.L2]);
  await db.exec('reset role');
  expect((await q(`select public.access_state($1) a`, [ID.L2]))[0].a).toMatchObject({ plan: 'kurumsal', units: 2, subscribed: true });
  const have = Number((await q(`select count(*) n from public.properties where owner_id = $1`, [ID.L2]))[0].n);
  await as(ID.L2);
  for (let i = have; i < 2; i++) await add(i);
  expect(await tryCall(db, `insert into public.properties (id, owner_id, name) values ('k9', $1, 'Fazla')`, [ID.L2])).toMatch(/Paket sınırı: en fazla 2 mülk/);
});

test('adet düşürülünce mevcut mülkler kalır, yeni ekleme durur; adet artınca açılır', async () => {
  await as(ID.A);
  await q(`select public.admin_set_plan($1, 'kurumsal', null, 'test', 1, 'emlak')`, [ID.L2]);
  await db.exec('reset role');
  expect(Number((await q(`select count(*) n from public.properties where owner_id = $1`, [ID.L2]))[0].n)).toBeGreaterThanOrEqual(2);
  await as(ID.L2);
  expect(await tryCall(db, `insert into public.properties (id, owner_id, name) values ('k8', $1, 'Fazla')`, [ID.L2])).toMatch(/Paket sınırı/);
  await as(ID.A);
  await q(`select public.admin_set_plan($1, 'kurumsal', null, 'test', 5, 'emlak')`, [ID.L2]);
  await as(ID.L2);
  await q(`insert into public.properties (id, owner_id, name) values ('k7', $1, 'Yeni')`, [ID.L2]);
});
