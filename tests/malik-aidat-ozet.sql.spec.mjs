// Maliklere aylık aidat özeti (migration malik_aidat_ozet): en az 2 dairesi olan bağlı malike ayda bir e-posta; daire durumu ve
// borç; ayar kapalıysa ve tek dairede gitmez; aynı ay ikinci kez kuyruğa girmez. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const MK = '00000000-0000-0000-0000-0000000000e1', TEK = '00000000-0000-0000-0000-0000000000e2';
let db, as, q;
const outbox = () => q(`select to_email, data from public.mail_outbox where kind = 'aidat_ozet' order by to_email`);

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await as(null);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'cok@ornek.com', '{"name":"Çok Daireli","role":"tenant"}'),
    ($2, 'tek@ornek.com', '{"name":"Tek","role":"tenant"}')`, [MK, TEK]);
  await as(ID.A);
  const [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Dalyan Sitesi', sector: 'site' }]);
  await db.exec('reset role');
  const [{ id: a }] = await q(`insert into public.site_units (org_id, block, no, aidat, payer) values ($1, 'A', '5', 2500, 'kiraci') returning id`, [org]);
  const [{ id: b }] = await q(`insert into public.site_units (org_id, block, no, aidat, payer) values ($1, 'A', '6', 2500, 'malik') returning id`, [org]);
  const [{ id: c }] = await q(`insert into public.site_units (org_id, block, no, aidat) values ($1, 'B', '1', 2000) returning id`, [org]);
  await q(`insert into public.site_residents (org_id, unit_id, user_id, role, name) values ($1, $2, $4, 'malik', 'Ç'), ($1, $3, $4, 'malik', 'Ç'), ($1, $5, $6, 'malik', 'T')`, [org, a, b, MK, c, TEK]);
  await q(`insert into public.site_charges (org_id, unit_id, month, amount) values ($1, $2, '2026-11', 2500), ($1, $3, '2026-11', 2500)`, [org, a, b]);
  await q(`update public.site_charges set status = 'paid', paid_amount = amount where unit_id = $1`, [b]);
});

test('en az 2 dairesi olan malike özet gider; tek daireliye gitmez; aynı ay ikinci kez girmez', async () => {
  await db.exec('reset role');
  expect((await q(`select public.site_malik_summary('2026-12-01') n`))[0].n).toBe(1);
  expect((await q(`select public.site_malik_summary('2026-12-01') n`))[0].n).toBe(0);
  const [m] = await outbox();
  expect(m.to_email).toBe('cok@ornek.com');
  expect(m.data.month).toBe('2026-11');
  expect(m.data.units.map((u) => [u.status, Number(u.due), u.payer])).toEqual([['open', 2500, 'malik'], ['paid', 0, 'malik']]   // A5'te kiracı yok: fiilen malik öder);
});

test('ayar kapalıysa gitmez; işlev dışarıdan çağrılamaz', async () => {
  await db.exec(`reset role; update public.profiles set settings = coalesce(settings, '{}'::jsonb) || '{"malikOzet": false}' where id = '${MK}'`);
  expect((await q(`select public.site_malik_summary('2027-01-01') n`))[0].n).toBe(0);
  await as(MK);
  expect(await tryCall(db, `select public.site_malik_summary()`)).toMatch(/permission denied/);
});
