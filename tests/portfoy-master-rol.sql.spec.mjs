// Portföy kurumu (site, GYO, AVM, depo) master'ı otomatik mülk sahibi olmaz; emlak ofisi master'ı olur (migration portfoy_master_rol).
// Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, ID } from './db-helpers.mjs';

const S1 = '00000000-0000-0000-0000-0000000000a7', E1 = '00000000-0000-0000-0000-0000000000a8';
let db, as, q;
const role = async (id) => (await q(`select role, landlord_since from public.profiles where id = $1`, [id]))[0];
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await as(null);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'site@ornek.com', '{"name":"Site","role":"team"}'),
    ($2, 'emlak@ornek.com', '{"name":"Emlak","role":"team"}')`, [S1, E1]);
});

test('site master ekip hesabı kalır, deneme başlamaz; emlak ofisi master mülk sahibi olur', async () => {
  await as(ID.A);
  const [{ admin_org_save: site }] = await q(`select public.admin_org_save($1)`, [{ name: 'Site', sector: 'site' }]);
  const [{ admin_org_save: em }] = await q(`select public.admin_org_save($1)`, [{ name: 'Emlak', sector: 'emlak' }]);
  await q(`select public.admin_org_set_master($1, 'site@ornek.com')`, [site]);
  await q(`select public.admin_org_set_master($1, 'emlak@ornek.com')`, [em]);
  await as(null);
  expect(await role(S1)).toMatchObject({ role: 'team', landlord_since: null });
  expect((await role(E1)).role).toBe('landlord');
  // Site yöneticisi kendi kiralık evi için "Rol ekle → Mülk sahibi" yapabilir; deneme o an başlar.
  await as(S1);
  expect((await q(`select public.add_landlord_role() r`))[0].r).toBe('landlord');
  await as(null);
  expect((await role(S1)).landlord_since).not.toBeNull();
});
