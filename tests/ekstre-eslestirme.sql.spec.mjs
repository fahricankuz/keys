// Ekstreden tahsilat (migration ekstre_eslestirme): site_bank_apply yetkisi, kısmi/tam ödeme, aynı hareketin ikinci kez işlenmemesi,
// başka kurumun tahakkukuna dokunulamaması, tabloya doğrudan yazılamaması. Gerçek Postgres'te (PGlite).
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000e5';
let db, as, q, org, other, unit, c1, c2, cx;
const apply = (fp, amount, ids, amts, oid = org) => q(`select public.site_bank_apply($1, $2, '2026-11-16', $3, 'Garanti BBVA', $4::uuid[], $5::numeric[]) ok`, [oid, fp, amount, ids, amts]);

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'yonetim@menekse.com', '{"name":"Menekşe Sitesi","role":"team"}')`, [M]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Menekşe Sitesi', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'yonetim@menekse.com')`, [org]);
  [{ admin_org_save: other }] = await q(`select public.admin_org_save($1)`, [{ name: 'Başka Site', sector: 'site' }]);
  await as(null);
  [{ id: unit }] = await q(`insert into public.site_units (org_id, block, no, area) values ($1, 'A', '1', 100) returning id`, [org]);
  [{ id: c1 }] = await q(`insert into public.site_charges (org_id, unit_id, month, amount) values ($1, $2, '2026-10', 1500) returning id`, [org, unit]);
  [{ id: c2 }] = await q(`insert into public.site_charges (org_id, unit_id, month, amount) values ($1, $2, '2026-11', 1500) returning id`, [org, unit]);
  const [{ id: ou }] = await q(`insert into public.site_units (org_id, block, no, area) values ($1, 'A', '1', 100) returning id`, [other]);
  [{ id: cx }] = await q(`insert into public.site_charges (org_id, unit_id, month, amount) values ($1, $2, '2026-11', 1500) returning id`, [other, ou]);
});

test('yetki: yalnız "Dekont onayı"; oturumsuz çağıramaz; tabloya doğrudan yazılamaz', async () => {
  await as(ID.T);
  expect(await tryCall(db, `select public.site_bank_apply($1, 'aaaaaaaaaaaaaaaa', '2026-11-16', 100, '', $2::uuid[], '{100}')`, [org, [c1]])).toMatch(/yetkin yok/);
  await as(null, true);
  expect(await tryCall(db, `select public.site_bank_apply($1, 'aaaaaaaaaaaaaaaa', '2026-11-16', 100, '', $2::uuid[], '{100}')`, [org, [c1]])).toMatch(/permission denied/);
  await as(M);
  expect(await tryCall(db, `insert into public.site_bank_txns (org_id, fp, txn_date, amount) values ($1, 'bbbbbbbbbbbbbbbb', '2026-11-16', 1)`, [org])).toMatch(/permission denied|row-level/);
});

test('kısmi sonra tam ödeme: tutarlar toplanır, tarih işlem tarihi, yöntem havale; aynı hareket ikinci kez işlenmez', async () => {
  await as(M);
  expect((await apply('0000000000000001', 1000, [c1], [1000]))[0].ok).toBe(true);
  expect((await q(`select status, paid_amount, paid_on, method from public.site_charges where id = $1`, [c1]))[0]).toMatchObject({ status: 'partial', paid_amount: '1000', method: 'havale' });
  expect((await apply('0000000000000001', 1000, [c1], [1000]))[0].ok).toBe(false);                       // aynı parmak izi
  expect((await q(`select paid_amount from public.site_charges where id = $1`, [c1]))[0].paid_amount).toBe('1000');
  // Tek havale iki ayı kapatır: kalan 500 + Kasım 1500.
  expect((await apply('0000000000000002', 2000, [c1, c2], [500, 1500]))[0].ok).toBe(true);
  const rows = await q(`select id, status, paid_amount, to_char(paid_on, 'YYYY-MM-DD') d from public.site_charges where id = any($1::uuid[]) order by month`, [[c1, c2]]);
  expect(rows.map((r) => [r.status, r.paid_amount, r.d])).toEqual([['paid', '1500', '2026-11-16'], ['paid', '1500', '2026-11-16']]);
  expect((await q(`select count(*)::int n from public.site_bank_txns where org_id = $1`, [org]))[0].n).toBe(2);
});

test('kurallar: ödenmiş tahakkuk, başka kurumun tahakkuku, tutarı aşan dağıtım reddedilir ve hiçbir şey kaydedilmez', async () => {
  await as(M);
  expect(await tryCall(db, `select public.site_bank_apply($1, '0000000000000003', '2026-11-16', 100, '', $2::uuid[], '{100}')`, [org, [c1]])).toMatch(/zaten ödenmiş/);
  expect(await tryCall(db, `select public.site_bank_apply($1, '0000000000000004', '2026-11-16', 100, '', $2::uuid[], '{100}')`, [org, [cx]])).toMatch(/bulunamadı/);
  expect(await tryCall(db, `select public.site_bank_apply($1, '0000000000000005', '2026-11-16', 100, '', $2::uuid[], '{150}')`, [org, [c1]])).toMatch(/aşıyor/);
  expect((await q(`select count(*)::int n from public.site_bank_txns where org_id = $1`, [org]))[0].n).toBe(2);
  await as(null);   // başka kurumun kaydı yöneticiye görünmez; denetim yetkisiz bağlamda
  expect((await q(`select status from public.site_charges where id = $1`, [cx]))[0].status).toBe('open');
});
