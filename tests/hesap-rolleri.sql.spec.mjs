// Hesap rolleri (migration hesap_rolleri): admin_user_roles bir hesabın tüm rollerini verir; yalnız yönetici.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

test('mülk sahibi + site maliki + site yöneticisi aynı hesapta; yalnız yönetici okur', async () => {
  const { db, as, q } = await newDb();
  await as(ID.A);
  const [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Atakum Sitesi', sector: 'site' }]);
  await as(null);
  await db.query(`insert into public.org_members (org_id, user_id, is_master) values ($1, $2, true)`, [org, ID.L]);
  const [{ id: u }] = (await db.query(`insert into public.site_units (org_id, block, no) values ($1, 'A', '1') returning id`, [org])).rows;
  await db.query(`insert into public.site_residents (org_id, unit_id, role, name, user_id) values ($1, $2, 'malik', 'Ev Sahibi', $3)`, [org, u, ID.L]);
  await as(ID.A);
  const r = (await q(`select public.admin_user_roles() r`))[0].r;
  const kinds = (id) => (r[id] || []).map((x) => x.k + (x.org ? ':' + x.org : '')).sort();
  expect(kinds(ID.L)).toEqual(['landlord', 'org:Atakum Sitesi', 'site_malik:Atakum Sitesi']);
  expect(kinds(ID.A)).toContain('admin');
  for (const who of [ID.L, ID.T]) { await as(who); expect(await tryCall(db, `select public.admin_user_roles()`)).toMatch(/Yönetici yetkisi/); }
});
