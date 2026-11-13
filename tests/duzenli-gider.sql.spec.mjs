// Düzenli giderler ve sakinlere kasa özeti (migration duzenli_gider_seffaflik): günü gelen ayın gideri bir kez yazılır;
// bitiş ayından sonra yazılmaz; sakin özeti yalnız yönetim açınca görür, faturaları ayrıca açılınca.
import { test, expect } from '@playwright/test';
import { newDb, ID, tryCall } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000d5';
let db, as, q, org, unit;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'yonetim@dalyan.com', '{"name":"Yönetim","role":"team"}')`, [M]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Dalyan Sitesi', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'yonetim@dalyan.com')`, [org]);
  await as(M);
  [{ id: unit }] = await q(`insert into public.site_units (org_id, block, no, area) values ($1, 'A', '1', 100) returning id`, [org]);
  const [{ code }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'malik', 'Ayşe') returning id`, [org, unit]).then(([{ id }]) => q(`select public.site_resident_code($1) code`, [id]));
  await as(ID.T); await q(`select public.accept_site_invite($1)`, [code]);
  await as(M);
  await q(`insert into public.site_cash (org_id, opening, opening_on) values ($1, 10000, '2026-10-01')`, [org]);
  await q(`insert into public.site_charges (org_id, unit_id, month, kind, amount, status, paid_amount, paid_on) values ($1, $2, '2026-10', 'aidat', 3000, 'paid', 3000, '2026-10-05'), ($1, $2, '2026-11', 'aidat', 3000, 'paid', 3000, '2026-11-04')`, [org, unit]);
  await q(`insert into public.site_expenses (org_id, cat, amount, spent_on, receipt_path, receipt_name) values ($1, 'Temizlik', 2000, '2026-10-20', $2, 'fis.pdf')`, [org, `site-${org}/fis.pdf`]);
});

test('düzenli gider: günü gelince bir kez; erken gün ve bitişten sonra yok; gidere kategori ve not', async () => {
  await as(M);
  await q(`insert into public.site_recurring_expenses (org_id, cat, amount, day, note, start_month, end_month) values ($1, 'Personel', 25000, 5, 'Kapıcı maaşı', '2026-11', '2026-12')`, [org]);
  await as(null);
  expect((await q(`select public.site_recurring_run('2026-11-04') n`))[0].n).toBe(0);      // gün gelmedi
  expect((await q(`select public.site_recurring_run('2026-11-05') n`))[0].n).toBe(1);
  expect((await q(`select public.site_recurring_run('2026-11-20') n`))[0].n).toBe(0);      // aynı ay ikinci kez yok
  expect((await q(`select public.site_recurring_run('2026-12-07') n`))[0].n).toBe(1);      // kaçırılan gün sonra yazılır
  expect((await q(`select public.site_recurring_run('2027-01-05') n`))[0].n).toBe(0);      // bitiş ayından sonra yok
  expect(await q(`select cat, amount::text, spent_on::text, note from public.site_expenses where recurring_id is not null order by spent_on`)).toEqual([
    { cat: 'Personel', amount: '25000', spent_on: '2026-11-05', note: 'Kapıcı maaşı' }, { cat: 'Personel', amount: '25000', spent_on: '2026-12-05', note: 'Kapıcı maaşı' }]);
});

test('kasa özeti: yönetim her zaman; sakin yalnız paylaşım açıksa; faturalar ayrıca; yabancı hiç', async () => {
  await as(M);
  const [{ s }] = await q(`select public.site_cash_summary($1, '2026-11') s`, [org]);
  // Devreden: 10.000 + 3.000 (Ekim tahsilat) − 2.000 (Ekim gider) = 11.000; Kasım: +3.000 − 25.000.
  expect(s).toMatchObject({ carry: 11000, income: 3000, spent: 25000, left: -11000, byCat: [{ cat: 'Personel', total: 25000 }] });
  await as(ID.T);
  expect(await tryCall(db, `select public.site_cash_summary($1, '2026-11')`, [org])).toMatch(/paylaşılmıyor/);
  await as(M);
  await q(`update public.site_cash set share_summary = true where org_id = $1`, [org]);
  await as(ID.T);
  const [{ s: r }] = await q(`select public.site_cash_summary($1, '2026-10') s`, [org]);
  expect(r).toMatchObject({ carry: 10000, income: 3000, spent: 2000, left: 11000, receipts: null });
  expect(await tryCall(db, `select * from public.site_expenses`)).toBe(null);
  expect(await q(`select * from public.site_expenses`)).toEqual([]);                      // sakin tek tek gideri okuyamaz
  await as(M);
  await q(`update public.site_cash set share_receipts = true where org_id = $1`, [org]);
  await as(ID.T);
  const [{ s: r2 }] = await q(`select public.site_cash_summary($1, '2026-10') s`, [org]);
  expect(r2.receipts).toEqual([expect.objectContaining({ cat: 'Temizlik', name: 'fis.pdf' })]);
  await as(ID.X);
  expect(await tryCall(db, `select public.site_cash_summary($1, '2026-10')`, [org])).toMatch(/paylaşılmıyor/);
  expect(await q(`select * from public.site_recurring_expenses`)).toEqual([]);
});
