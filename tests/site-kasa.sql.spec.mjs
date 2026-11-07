// Site kasası ve gider eki (migration site_kasa): fatura yolu yalnız kurumun klasöründe; kasa açılış bakiyesini yönetim yazar,
// kurum üyesi okur; sakin ve yabancı göremez.
import { test, expect } from '@playwright/test';
import { newDb, ID, tryCall } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000d4';
let db, as, q, org, other;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'yonetim@dalyan.com', '{"name":"Yönetim","role":"team"}')`, [M]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Dalyan Sitesi', sector: 'site' }]);
  [{ admin_org_save: other }] = await q(`select public.admin_org_save($1)`, [{ name: 'Başka Site', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'yonetim@dalyan.com')`, [org]);
});

test('gider eki: yalnız kurumun klasöründen; eksiz gider eskisi gibi', async () => {
  await as(M);
  await q(`insert into public.site_expenses (org_id, cat, amount, receipt_path, receipt_name) values ($1, 'Asansör', 2500, $2, 'fatura.pdf')`, [org, `site-${org}/fatura.pdf`]);
  await q(`insert into public.site_expenses (org_id, cat, amount) values ($1, 'Temizlik', 1000)`, [org]);
  expect(await tryCall(db, `insert into public.site_expenses (org_id, cat, amount, receipt_path) values ($1, 'X', 1, $2)`, [org, `site-${other}/baska.pdf`])).toMatch(/site_expenses_receipt_check/);
  expect((await q(`select count(*)::int n from public.site_expenses where org_id = $1`, [org]))[0].n).toBe(2);
});

test('kasa açılış bakiyesi: yönetim yazar, kurum üyesi okur; sakin ve yabancı göremez, yazamaz', async () => {
  await as(M);
  await q(`insert into public.site_cash (org_id, opening, opening_on) values ($1, 120000, '2026-10-01')`, [org]);
  await q(`update public.site_cash set opening = 125000 where org_id = $1`, [org]);
  expect(await q(`select opening::text, opening_on::text from public.site_cash`)).toEqual([{ opening: '125000', opening_on: '2026-10-01' }]);
  for (const who of [ID.T, ID.X]) {
    await as(who);
    expect(await q(`select * from public.site_cash`)).toEqual([]);
    expect(await tryCall(db, `insert into public.site_cash (org_id, opening) values ($1, 1)`, [other])).toMatch(/row-level security/);
  }
});
