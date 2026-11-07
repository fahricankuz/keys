// Site tahakkuk koruması (migration site_tahakkuk_koruma): sıfır ya da eksi tutarlı tahakkuk yazılamaz; yönetimin elle
// yazdığı tahakkukta dairenin sakinlerine bildirim gider, otomatik (oturumsuz) işte gitmez. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000c1';   // site müdürü (master)
let db, as, q, org, a1, a2;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'mudur@atakum.com', '{"name":"Site Müdürü","role":"team"}')`, [M]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Atakum Sitesi', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'mudur@atakum.com')`, [org]);
  await as(M);
  [{ id: a1 }] = await q(`insert into public.site_units (org_id, block, no, aidat) values ($1, 'A', '1', 500) returning id`, [org]);
  [{ id: a2 }] = await q(`insert into public.site_units (org_id, block, no, aidat) values ($1, 'A', '2', 500) returning id`, [org]);
  const [{ code }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'kiraci', 'Kiracı') returning code`, [org, a1]);
  await as(ID.T); await q(`select public.accept_site_invite($1)`, [code]);
});

test('sıfır ve eksi tutarlı tahakkuk reddedilir; toplu yazımda biri sıfırsa hiçbiri yazılmaz', async () => {
  await as(M);
  expect(await tryCall(db, `insert into public.site_charges (org_id, unit_id, month, kind, title, amount) values ($1, $2, '2026-11', 'ozel', 'Boş', 0)`, [org, a1]))
    .toMatch(/Tutar sıfırdan büyük olmalı/);
  expect(await tryCall(db, `insert into public.site_charges (org_id, unit_id, month, kind, title, amount) values ($1, $2, '2026-11', 'ozel', 'Boş', 0), ($1, $3, '2026-11', 'ozel', 'Boş', 10)`, [org, a1, a2]))
    .toMatch(/Tutar sıfırdan büyük olmalı/);
  expect((await q(`select count(*)::int n from public.site_charges where org_id = $1`, [org]))[0].n).toBe(0);
});

test('yönetimin yazdığı ek ödeme: dairenin sakinine bildirim gider, boş dairede kimseye gitmez', async () => {
  await as(M);
  await q(`insert into public.site_charges (org_id, unit_id, month, kind, title, amount) values ($1, $2, '2026-11', 'ozel', 'Çatı onarımı', 750), ($1, $3, '2026-11', 'ozel', 'Çatı onarımı', 750)`, [org, a1, a2]);
  await as(null);
  const notes = await q(`select user_id, title, body, url from public.notifications where title like 'Yeni ödeme%'`);
  expect(notes).toEqual([{ user_id: ID.T, title: 'Yeni ödeme: A Blok No 1', body: 'Kasım 2026 Çatı onarımı: ₺750', url: '/uygulama/odemeler' }]);
});

test('otomatik aidat (oturumsuz iş) bildirim üretmez ve tutarı sıfır olan daireyi atlar', async () => {
  await as(M);
  await q(`update public.site_units set aidat = 0 where id = $1`, [a2]);
  await as(null);
  await q(`delete from public.notifications`);
  await q(`insert into public.site_auto (org_id, enabled, run_day, due_day) values ($1, true, 1, 10)
           on conflict (org_id) do update set enabled = true, run_day = 1, due_day = 10, last_month = null, start_month = null`, [org]);
  const [{ n }] = await q(`select public.site_auto_run('2026-12-02'::date) n`);
  expect(n).toBe(1);
  expect((await q(`select count(*)::int n from public.notifications where title like 'Yeni ödeme%'`))[0].n).toBe(0);
  expect((await q(`select unit_id, amount::int amount from public.site_charges where month = '2026-12'`))).toEqual([{ unit_id: a1, amount: 500 }]);
});
