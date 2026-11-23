// Kurum master yöneticisi mülk sahibi hesabı olur (migration kurum_master_mulk_sahibi): master daveti ekip ya da kiracı hesabıyla
// kabul edilse de, yönetici e-postayla atasa da hesap mülk sahibine çevrilir; yönetici panelinden kuruma mülk eklenebilir.
// Başka bir mülk sahibinin ekibindeki ekip hesabı ve bir eve kiracı olarak bağlı kiracı çevrilmez; yönetici onları master atayamaz. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const E1 = '00000000-0000-0000-0000-0000000000c1';   // davetle ekip hesabı açan master
const E2 = '00000000-0000-0000-0000-0000000000c2';   // e-postayla atanan ekip hesabı
const E3 = '00000000-0000-0000-0000-0000000000c3';   // L'nin ekibindeki hesap

let db, as, q, org;
const role = async (id) => (await q(`select role from public.profiles where id = $1`, [id]))[0].role;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await as(null);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'emlak@ornek.com', '{"name":"Emlak Ofisi","role":"team"}'),
    ($2, 'ofis@ornek.com', '{"name":"Ofis","role":"team"}'),
    ($3, 'ekip@ornek.com', '{"name":"Ekip Üyesi","role":"team"}')`, [E1, E2, E3]);
  await db.exec(`reset role; insert into public.team_members (owner_id, member_id, role, scope) values ('${ID.L}', '${E3}', 'agent', 'portfolio')`);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Emlak Portföyü', sector: 'emlak', units: 50 }]);
});

test('master davetini ekip hesabıyla kabul eden mülk sahibi olur; yönetici kuruma mülk ekler', async () => {
  expect(await role(E1)).toBe('team');
  await as(ID.A);
  const [{ admin_org_set_master: r }] = await q(`select public.admin_org_set_master($1, 'yeni@ornek.com')`, [org]);
  await db.exec(`reset role; update public.org_invites set email = 'emlak@ornek.com' where code = '${r.code}'`);
  await as(E1);
  await q(`select public.accept_org_invite($1)`, [r.code]);
  expect(await role(E1)).toBe('landlord');
  await as(ID.A);
  const [{ admin_add_property: p }] = await q(`select public.admin_add_property($1, $2)`, [E1, { name: 'Daire 1' }]);
  expect(p).toMatchObject({ count: 1, limit: 50, over: false });
});

test('yönetici e-postayla ekip hesabını master atayınca hesap mülk sahibi olur', async () => {
  await as(ID.A);
  const [{ admin_org_set_master: r }] = await q(`select public.admin_org_set_master($1, 'ofis@ornek.com')`, [org]);
  expect(r.status).toBe('set');
  expect(await role(E2)).toBe('landlord');
  await q(`select public.admin_add_property($1, $2)`, [E2, { name: 'Daire 2' }]);
});

test('bir eve kiracı olarak bağlı hesap master atanamaz, rolü değişmez', async () => {
  await as(ID.A);
  expect(await tryCall(db, `select public.admin_org_set_master($1, 'kiraci@ornek.com')`, [org])).toMatch(/kiracı olarak bağlı/);
  expect(await role(ID.T)).toBe('tenant');
});

test('başka bir mülk sahibinin ekibindeki hesap master atanamaz ve çevrilmez', async () => {
  await as(ID.A);
  expect(await tryCall(db, `select public.admin_org_set_master($1, 'ekip@ornek.com')`, [org])).toMatch(/başka bir mülk sahibinin ekibinde/);
  expect(await role(E3)).toBe('team');
  expect(await tryCall(db, `select public.admin_add_property($1, $2)`, [E3, { name: 'X' }])).toMatch(/ekip hesabı/);
});

test('dönüştürme işlevi dışarıdan çağrılamaz', async () => {
  await as(E3);
  expect(await tryCall(db, `select public.org_master_landlord($1)`, [E3])).toMatch(/permission denied/);
});
