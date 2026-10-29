// Kurum master yöneticisi: mülk sahibi sayılır, sözleşmedeki adede kadar mülk ekler; anahtar ekibi müşteri adına mülk ekler.
// Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, ID, tryCall } from './db-helpers.mjs';

const { A, L, T, X } = ID;
const ORG = '20000000-0000-4000-8000-000000000001';
const M = '00000000-0000-0000-0000-0000000002a1';   // kurumun master yöneticisi (kiracı hesabı olarak açılmış)
let db, as, q;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await as(null);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'master@kurum.com', '{"name":"Master","role":"tenant"}')`, [M]);
  await db.query(`insert into public.organizations (id, name, sector, units) values ($1, 'Örnek AVM', 'avm', 2)`, [ORG]);
});

test('master atanınca hesap mülk sahibi olur; kiracı olarak bağlı biri ise rolü değişmez', async () => {
  await as(null);
  expect((await q(`select role from public.profiles where id = $1`, [M]))[0].role).toBe('tenant');
  await db.query(`insert into public.org_members (org_id, user_id, is_master) values ($1, $2, true)`, [ORG, M]);
  expect((await q(`select role from public.profiles where id = $1`, [M]))[0].role).toBe('landlord');
  // Kiracı olarak bir eve bağlı hesap otomatik çevrilmez (T: p1'de kiracı).
  const ORG2 = '20000000-0000-4000-8000-000000000002';
  await db.query(`insert into public.organizations (id, name, sector, units) values ($1, 'İkinci kurum', 'depo', 3)`, [ORG2]);
  await db.query(`insert into public.org_members (org_id, user_id, is_master) values ($1, $2, true)`, [ORG2, T]);
  expect((await q(`select role from public.profiles where id = $1`, [T]))[0].role).toBe('tenant');
});

test('erişim durumu: master kurumsal pakette, mülk sınırı sözleşmedeki adet', async () => {
  await as(M);
  const a = (await q(`select public.my_access() as a`))[0].a;
  expect(a).toMatchObject({ plan: 'kurumsal', units: 2, access: true });
});

test('sözleşmedeki adede kadar mülk eklenir, sonrası reddedilir; mülk kuruma bağlanır', async () => {
  await as(M);
  await q(`insert into public.properties (id, owner_id, name) values ('k1', $1, 'Mağaza 1')`, [M]);
  await q(`insert into public.properties (id, owner_id, name) values ('k2', $1, 'Mağaza 2')`, [M]);
  expect(await tryCall(db, `insert into public.properties (id, owner_id, name) values ('k3', '${M}', 'Mağaza 3')`)).toMatch(/Sözleşme sınırı: en fazla 2 mülk/);
  expect((await q(`select id, org_id from public.properties where owner_id = $1 order by id`, [M])).map(r => [r.id, r.org_id])).toEqual([['k1', ORG], ['k2', ORG]]);
});

test('kendi rolünü yine değiştiremez; sistem bayrağı yalnız sunucu işlevinde', async () => {
  await as(M);
  expect(await tryCall(db, `update public.profiles set role = 'tenant' where id = '${M}'`)).toMatch(/değiştirilemez/);
  await as(X);
  expect(await tryCall(db, `update public.profiles set role = 'landlord' where id = '${X}'`)).toMatch(/değiştirilemez/);
  expect(await tryCall(db, `select public.org_master_landlord('${X}')`)).toMatch(/permission denied/);
});

test('anahtar ekibi müşteri adına mülk ekler; sözleşme sınırını aşarsa bildirir', async () => {
  await as(A);
  const r = (await q(`select public.admin_add_property($1, '{"name":"Yönetici eklediği","addr":"Kadıköy","prop_type":"Mağaza","rent":42000,"due_day":5}'::jsonb) as r`, [M]))[0].r;
  expect(r).toMatchObject({ count: 3, limit: 2, over: true });
  const row = (await q(`select owner_id, org_id, name, rent, prop_type from public.properties where id = $1`, [r.id]))[0];
  expect(row).toMatchObject({ owner_id: M, org_id: ORG, name: 'Yönetici eklediği', prop_type: 'Mağaza' });
  expect(Number(row.rent)).toBe(42000);
  // Bireysel mülk sahibi (paket sınırı yok / deneme): sınır içinde.
  const r2 = (await q(`select public.admin_add_property($1, '{"name":"Bireysel ek"}'::jsonb) as r`, [L]))[0].r;
  expect(r2).toMatchObject({ over: false });
  // İşlem kaydı.
  expect((await q(`select count(*)::int as n from public.admin_audit where action = 'property.add'`))[0].n).toBe(2);
  // Mülk sahibi sahibinde üyelik satırı da açılır.
  expect((await q(`select role from public.memberships where property_id = $1 and user_id = $2`, [r.id, M]))[0].role).toBe('landlord');
});

test('anahtar ekibi dışında kimse çağıramaz; kiracı hesabı ve olmayan hesap reddedilir; ad zorunlu', async () => {
  for (const who of [M, X, null]) {
    await as(who, who === null);
    expect(await tryCall(db, `select public.admin_add_property('${L}', '{"name":"Sızma"}'::jsonb)`)).toMatch(/Yönetici yetkisi|permission denied/);
  }
  await as(A);
  expect(await tryCall(db, `select public.admin_add_property('${T}', '{"name":"Kiracıya"}'::jsonb)`)).toMatch(/mülk sahibi hesabı değil/);
  expect(await tryCall(db, `select public.admin_add_property('00000000-0000-0000-0000-0000000009ff', '{"name":"Yok"}'::jsonb)`)).toMatch(/Hesap bulunamadı/);
  expect(await tryCall(db, `select public.admin_add_property('${L}', '{"name":" "}'::jsonb)`)).toMatch(/Mülk adını yaz/);
});

test('sözleşmesi biten ya da askıdaki kurumun master yöneticisi sınır dışında kalmaz: paket kuralına döner', async () => {
  await as(null);
  await db.query(`update public.organizations set contract_until = current_date - 1 where id = $1`, [ORG]);
  await as(M);
  const a = (await q(`select public.my_access() as a`))[0].a;
  expect(a.plan).not.toBe('kurumsal');
  await as(null);
  await db.query(`update public.organizations set contract_until = null where id = $1`, [ORG]);
});
