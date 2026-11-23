// Malike aidat gecikme ve ödendi bildirimi (migration malik_aidat_bildirim): aidatı kiracı ödeyen dairede son günden 5 gün sonra
// bağlı malike bir kez bildirim; ödenince bir kez "ödendi"; malik ayardan kapatabilir; aidatı malik ödüyorsa ya da kiracı yoksa gitmez.
// Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const MK = '00000000-0000-0000-0000-0000000000d1';   // malik (kiracı öder)
const KR = '00000000-0000-0000-0000-0000000000d2';   // kiracı
const M2 = '00000000-0000-0000-0000-0000000000d3';   // aidatı kendisi ödeyen malik
let db, as, q, org, u1, u2, c1, c2;
const notes = async (uid, like) => (await q(`select title, body, tag from public.notifications where user_id = $1 and tag like $2 order by created_at`, [uid, like]));

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await as(null);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'malik@ornek.com', '{"name":"Malik","role":"tenant"}'), ($2, 'kiraci2@ornek.com', '{"name":"Kiracı","role":"tenant"}'),
    ($3, 'malik2@ornek.com', '{"name":"Malik İki","role":"tenant"}')`, [MK, KR, M2]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Dalyan Sitesi', sector: 'site' }]);
  await db.exec('reset role');
  [{ id: u1 }] = await q(`insert into public.site_units (org_id, block, no, aidat, payer) values ($1, 'A', '5', 2500, 'kiraci') returning id`, [org]);
  [{ id: u2 }] = await q(`insert into public.site_units (org_id, block, no, aidat, payer) values ($1, 'A', '6', 2500, 'malik') returning id`, [org]);
  await q(`insert into public.site_residents (org_id, unit_id, user_id, role, name) values ($1, $2, $3, 'malik', 'Malik'), ($1, $2, $4, 'kiraci', 'Kiracı'),
           ($1, $5, $6, 'malik', 'Malik İki'), ($1, $5, $4, 'kiraci', 'Kiracı')`, [org, u1, MK, KR, u2, M2]);
  [{ id: c1 }] = await q(`insert into public.site_charges (org_id, unit_id, month, amount, due_on) values ($1, $2, '2026-11', 2500, '2026-11-10') returning id`, [org, u1]);
  [{ id: c2 }] = await q(`insert into public.site_charges (org_id, unit_id, month, amount, due_on) values ($1, $2, '2026-11', 2500, '2026-11-10') returning id`, [org, u2]);
});

test('son günden 5 gün geçmeden bildirim yok; geçince kiracı öderken malike bir kez gider', async () => {
  await db.exec('reset role');
  expect((await q(`select public.site_malik_late('2026-11-14') n`))[0].n).toBe(0);
  await q(`select public.site_malik_late('2026-11-15')`);
  await q(`select public.site_malik_late('2026-11-16')`);
  const n = await notes(MK, 'aidat-malik-late-%');
  expect(n).toHaveLength(1);
  expect(n[0].title).toMatch(/kiracı aidatı ödemedi/);
  expect(n[0].body).toMatch(/Dalyan Sitesi/);
  expect(await notes(M2, 'aidat-malik-%')).toHaveLength(0);          // aidatı malik ödüyor
  expect(await notes(KR, 'aidat-malik-%')).toHaveLength(0);          // kiracıya bu bildirim gitmez
});

test('gecikme bildirimi gitmiş aidat ödenince malike bir kez "ödendi" gider', async () => {
  await db.exec('reset role');
  await q(`update public.site_charges set status = 'paid', paid_amount = amount where id = $1`, [c1]);
  await q(`update public.site_charges set note = 'x' where id = $1`, [c1]);
  const p = await notes(MK, 'aidat-malik-paid-%');
  expect(p).toHaveLength(1);
  expect(p[0].title).toMatch(/aidat ödendi/);
  await q(`update public.site_charges set status = 'paid', paid_amount = amount where id = $1`, [c2]);
  expect(await notes(M2, 'aidat-malik-paid-%')).toHaveLength(0);     // gecikme bildirimi gitmemişti
});

test('malik ayardan kapatınca bildirim gitmez; 40 günden eski gecikme sayılmaz', async () => {
  await db.exec('reset role');
  const [{ id: c3 }] = await q(`insert into public.site_charges (org_id, unit_id, month, amount, due_on) values ($1, $2, '2026-12', 2500, '2026-12-10') returning id`, [org, u1]);
  await q(`update public.profiles set settings = coalesce(settings, '{}'::jsonb) || '{"malikAidat": false}' where id = $1`, [MK]);
  await q(`select public.site_malik_late('2026-12-16')`);
  expect((await notes(MK, 'aidat-malik-late-' + c3))).toHaveLength(0);
  await q(`update public.profiles set settings = settings || '{"malikAidat": true}' where id = $1`, [MK]);
  await q(`select public.site_malik_late('2027-01-25')`);              // 46 gün geçmiş
  expect((await notes(MK, 'aidat-malik-late-' + c3))).toHaveLength(0);
});

test('işlev dışarıdan çağrılamaz', async () => {
  await as(MK);
  expect(await tryCall(db, `select public.site_malik_late()`)).toMatch(/permission denied/);
});
