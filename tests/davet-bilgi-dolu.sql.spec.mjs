// Davet bağlantısında davetlinin bilgileri (migration davet_bilgi_dolu): kullanılmamış ve süresi dolmamış kodda ad/e-posta/telefon
// döner; kullanılmış ya da süresi dolmuş kodda dönmez. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, ID } from './db-helpers.mjs';

let db, as, q;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

test('mülk daveti: invitee döner; kullanılınca dönmez', async () => {
  await as(ID.L);
  const [{ code }] = await q(`insert into public.invites (property_id, name, email, phone, created_by) values ('p1', 'Ali Veli', 'ali@ornek.com', '0532 111 22 33', $1) returning code`, [ID.L]);
  await as(null, true);
  const [{ r }] = await q(`select public.invite_preview($1) r`, [code]);
  expect(r.invitee).toEqual({ name: 'Ali Veli', email: 'ali@ornek.com', phone: '0532 111 22 33' });
  await as(null);
  await q(`update public.invites set accepted_by = $1, accepted_at = now() where code = $2`, [ID.T, code]);
  await as(null, true);
  expect((await q(`select public.invite_preview($1) r`, [code]))[0].r).toBeNull();
});

test('kurum daveti: e-posta döner; süresi dolunca dönmez', async () => {
  await as(ID.A);
  const [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Kurum', sector: 'site' }]);
  const [{ admin_org_set_master: m }] = await q(`select public.admin_org_set_master($1, 'yeni@ornek.com')`, [org]);
  await as(null, true);
  const [{ r }] = await q(`select public.org_invite_info($1) r`, [m.code]);
  expect(r).toMatchObject({ org: 'Kurum', master: true, invitee: { email: 'yeni@ornek.com' } });
  await as(null);
  await q(`update public.org_invites set expires_at = now() - interval '1 day' where code = $1`, [m.code]);
  await as(null, true);
  expect((await q(`select public.org_invite_info($1) r`, [m.code]))[0].r).toBeNull();
});
