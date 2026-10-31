// Yönetici hesap silme (schema.sql 32. bölüm): yalnızca yönetici, yalnızca önce yasaklanmış hesap; kendini ve yöneticiyi silemez;
// hesap, sahibi olduğu mülkler ve verileri gider; işlem silinmeden önce denetim kaydına yazılır. Gerçek Postgres'te (PGlite).
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

let db, as, q;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await as(ID.T);
  await q(`insert into public.messages (id, property_id, from_role, body) values ('m1', 'p1', 'tenant', 'Merhaba')`);
});

test('yönetici olmayan silemez; yasaksız hesap silinemez; kendini ve yöneticiyi silemez', async () => {
  await as(ID.L);
  expect(await tryCall(db, `select public.admin_delete_user($1, 'x')`, [ID.T])).toMatch(/Yönetici yetkisi/);
  await as(ID.A);
  expect(await tryCall(db, `select public.admin_delete_user($1, 'x')`, [ID.T])).toMatch(/Önce hesabı yasakla/);
  expect(await tryCall(db, `select public.admin_delete_user($1, 'x')`, [ID.A])).toMatch(/Kendi hesabını/);
  await db.exec(`reset role; insert into public.admins (user_id) values ('${ID.X}')`); await as(ID.A);
  expect(await tryCall(db, `select public.admin_delete_user($1, 'x')`, [ID.X])).toMatch(/Yönetici silinemez/);
  await db.exec(`reset role; delete from public.admins where user_id = '${ID.X}'`);
  expect(await tryCall(db, `select public.admin_delete_user('00000000-0000-4000-8000-0000000000ff', 'x')`)).toMatch(/bulunamadı/);
});

test('yasaklanmış kiracı silinir: hesap ve profil gider, mesajı kalır (gönderen boşalır), denetim kaydı yazılır', async () => {
  await as(ID.A);
  await q(`select public.admin_set_ban($1, true, 'Taciz')`, [ID.T]);
  await q(`select public.admin_delete_user($1, 'Taciz')`, [ID.T]);
  await as(null);
  expect(await q(`select id from auth.users where id = $1`, [ID.T])).toEqual([]);
  expect(await q(`select id from public.profiles where id = $1`, [ID.T])).toEqual([]);
  expect(await q(`select by_user from public.messages where id = 'm1'`)).toEqual([{ by_user: null }]);
  const log = (await q(`select action, detail from public.admin_audit where action = 'user.delete'`))[0];
  expect(log.detail).toMatchObject({ email: 'kiraci@ornek.com', role: 'tenant', reason: 'Taciz' });
});

test('yasaklanmış mülk sahibi silinince sahibi olduğu mülk de gider; kayıtta mülk sayısı yazar', async () => {
  await as(ID.A);
  await q(`select public.admin_set_ban($1, true, 'Dolandırıcılık')`, [ID.L2]);
  await q(`select public.admin_delete_user($1, 'Dolandırıcılık')`, [ID.L2]);
  await as(null);
  expect(await q(`select id from public.properties where id = 'p2'`)).toEqual([]);
  const log = (await q(`select detail from public.admin_audit where action = 'user.delete' order by id desc limit 1`))[0];
  expect(log.detail).toMatchObject({ properties: 1, role: 'landlord' });
});
