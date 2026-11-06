// Rapor e-postasında dolar karşılıkları (migration rapor_dolar_karsiligi): site_report "usd" ve "fx_diff_try" döndürür;
// kurallar uygulamadaki fx-report.js ile aynı (istenen son ödeme günü, tahsilat ödeme günü, gider harcama günü kuruyla).
import { test, expect } from '@playwright/test';
import { newDb, ID, tryCall } from './db-helpers.mjs';

let db, as, q, oid;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await as(null);
  await db.exec(`insert into public.fx_rates (day, currency, sell) values ('2026-10-09', 'USD', 40), ('2026-10-20', 'USD', 42)`);  // 10 Ekim cumartesi
  [{ id: oid }] = await q(`insert into public.organizations (name, sector, status) values ('Kordon AVM', 'avm', 'active') returning id`);
  await db.query(`insert into public.org_members (org_id, user_id, is_master) values ($1, $2, true)`, [oid, ID.L]);
  const [{ id: u1 }] = await q(`insert into public.site_units (org_id, no, area) values ($1, 'Z-1', 100) returning id`, [oid]);
  const [{ id: u2 }] = await q(`insert into public.site_units (org_id, no, area) values ($1, 'Z-2', 100) returning id`, [oid]);
  // TL kira 4.000 (son ödeme 10 Ekim → cuma kuru 40 = $100), 20 Ekim'de ödendi (42 → $95,24).
  await db.query(`insert into public.site_charges (org_id, unit_id, month, kind, amount, status, paid_on, due_on) values ($1, $2, '2026-10', 'kira', 4000, 'paid', '2026-10-20', '2026-10-10')`, [oid, u1]);
  // Dolar sözleşme $1.000 (tahakkuk kuru 40 → ₺40.000), 20 Ekim'de ödendi: sözleşme $1.000 esas, kur farkı 40.000/42 − 1.000.
  await db.query(`insert into public.site_charges (org_id, unit_id, month, kind, amount, currency, fx, orig_amount, status, paid_on, due_on)
                  values ($1, $2, '2026-10', 'kira', 40000, 'USD', 40, 1000, 'paid', '2026-10-20', '2026-10-10')`, [oid, u2]);
  await db.query(`insert into public.site_expenses (org_id, cat, amount, spent_on) values ($1, 'Temizlik', 8400, '2026-10-20')`, [oid]);
});

test('dolar karşılıkları ve kur farkı', async () => {
  await as(ID.L);
  const [{ r }] = await q(`select public.site_report($1, 'month', '2026-10-15') r`, [oid]);
  expect(r.charges).toEqual([{ kind: 'kira', charged: 44000, collected: 44000 }]);   // TL alanları değişmedi
  expect(r.usd.charged).toBe(1100);
  expect(r.usd.collected).toBeCloseTo(1095.24, 2);
  expect(r.usd.fx_diff).toBeCloseTo(-47.62, 2);
  expect(r.usd.spent).toBe(200);
  expect(r.usd.missing).toBe(false);
  expect(Number(r.usd.rate)).toBe(42);
  expect(r.usd.rate_day).toBe('2026-10-20');
  expect(Number(r.fx_diff_try)).toBe(-2000);                                           // 40.000 − 1.000 × 42
});

test('kur yoksa toplama katılmaz, eksik işaretlenir; yardımcı işlev doğrudan çağrılamaz', async () => {
  await as(ID.L);
  const [{ r }] = await q(`select public.site_report($1, 'month', '2026-09-15') r`, [oid]);
  expect(r.usd).toMatchObject({ charged: 0, spent: 0, missing: false });
  await as(null);
  await db.query(`insert into public.site_expenses (org_id, cat, amount, spent_on) values ($1, 'Eski', 100, '2019-05-01')`, [oid]);
  await as(ID.L);
  const [{ r: old }] = await q(`select public.site_report($1, 'month', '2019-05-15') r`, [oid]);
  expect(old.usd).toMatchObject({ spent: 0, missing: true, rate: null });
  expect(await tryCall(db, `select public.site_report_fx($1, '2026-10', '2026-10', '2026-10-01', '2026-11-01', 'USD')`, [oid])).toMatch(/permission denied/);
});
