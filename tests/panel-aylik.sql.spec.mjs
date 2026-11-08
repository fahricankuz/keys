// Yönetici paneli aylık veri (migration panel_aylik_veri): 12 ay için kira ve aidat hacmi, kartla ödeme, ödenen hukuki ücret,
// yeni kayıt; üyelik tahmini ay ay kaydedilir; yalnız yönetici.
import { test, expect } from '@playwright/test';
import { newDb, ID, tryCall } from './db-helpers.mjs';

let db, as, q;
const y = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date()).slice(0, 4));
const m = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date()).slice(0, 7);
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await as(null);
  await db.query(`insert into public.payments (property_id, month, kind, amount, status, method) values
    ('p1', $1, 'kira', 30000, 'approved', 'pos'), ('p1', $1, 'aidat', 1500, 'approved', 'havale'), ('p1', $2, 'kira', 30000, 'review', 'pos')`, [m, y + '-01']);
  await db.query(`insert into public.legal_requests (no, user_id, role, property_id, topic, body, price, status, paid_at)
                  values (1, $1, 'landlord', 'p1', 'tahliye', 'Tahliye desteği', 3000, 'paid', now())`, [ID.L]);
  await as(ID.A); await db.query(`update public.legal_requests set status = 'paid', paid_at = now()`); await as(null);   // yönetici ödemeyi işaretler
});

test('12 ay; bu ayda kira, aidat, kartla ödeme, hukuki ücret ve yeni kayıt; onaysız ödeme sayılmaz', async () => {
  await as(ID.A);
  const [{ r }] = await q(`select public.admin_monthly($1) r`, [y]);
  expect(r.length).toBe(12);
  expect(r[0].month).toBe(y + '-01');
  const cur = r.find((x) => x.month === m);
  expect(cur).toMatchObject({ rent: 30000, aidat: 1500, card: 30000, legal: 3000, mrr: null });
  expect(Number(cur.signups)).toBeGreaterThanOrEqual(5);
  if (m !== y + '-01') expect(r[0].rent).toBe(0);                      // ocaktaki ödeme onay bekliyor
});

test('üyelik tahmini bu ay için yazılır ve güncellenir; yalnız yönetici; kullanıcı göremez', async () => {
  await as(ID.A);
  await q(`select public.admin_revenue_save(1250.5, 4)`);
  await q(`select public.admin_revenue_save(1300, 5)`);
  const [{ r }] = await q(`select public.admin_monthly($1) r`, [y]);
  expect(r.find((x) => x.month === m)).toMatchObject({ mrr: 1300, payers: 5 });
  expect(await tryCall(db, `select public.admin_revenue_save(-1, 0)`)).toMatch(/geçersiz/);
  for (const who of [ID.L, ID.T]) {
    await as(who);
    expect(await tryCall(db, `select public.admin_monthly(2026)`)).toMatch(/Yönetici/);
    expect(await tryCall(db, `select public.admin_revenue_save(1, 1)`)).toMatch(/Yönetici/);
    expect(await q(`select * from public.admin_revenue_months`)).toEqual([]);
  }
});
