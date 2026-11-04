// Kira geçmişi belgesi (migration kira_gecmisi_belgesi): yalnız kiracı üretir, yalnız onaylı kira girer, kodla herkes doğrular.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

let db, as, q, code;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await as(null);
  await q(`update public.properties set due_day = 5 where id = 'p1'`);
  await q(`insert into public.payments (property_id, month, kind, status, amount, paid_on) values
    ('p1', '2026-07', 'kira', 'approved', 30000, '2026-07-03'),
    ('p1', '2026-08', 'kira', 'approved', 30000, '2026-08-09'),
    ('p1', '2026-09', 'kira', 'review',   30000, '2026-09-04'),
    ('p1', '2026-09', 'aidat', 'approved', 1500, '2026-09-04'),
    ('p1', '2026-10', 'kira', 'approved', 30000, '2026-10-05')`);
});

test('kiracı belge üretir: yalnız onaylı kira, zamanında sayısı, mülk sahibinin soyadı kısaltılmış', async () => {
  await as(ID.T);
  const [{ r }] = await q(`select public.create_rent_certificate('p1', '2026-01', '2026-12') r`);
  code = r.code;
  expect(code).toMatch(/^[0-9A-F]{10}$/);
  expect(r.data.rows.map((x) => [x.month, x.on_time])).toEqual([['2026-07', true], ['2026-08', false], ['2026-10', true]]);
  expect(r.data).toMatchObject({ months: 3, on_time: 2, total: 90000, from: '2026-01', to: '2026-12' });
  expect(r.data.landlord).toBe('Ev S.');                                       // "Ev Sahibi" → soyadı kısaltılır
  expect((await q(`select count(*)::int c from public.rent_certificates`))[0].c).toBe(1);
});

test('mülk sahibi ve yabancı belge üretemez; dönem sırası kontrol edilir', async () => {
  for (const who of [ID.L, ID.X]) {
    await as(who);
    expect(await tryCall(db, `select public.create_rent_certificate('p1', '2026-01', '2026-12')`)).toMatch(/Yalnız mülkün kiracısı/);
  }
  await as(ID.T);
  expect(await tryCall(db, `select public.create_rent_certificate('p1', '2026-12', '2026-01')`)).toMatch(/Dönem geçersiz/);
  await as(ID.L);
  expect(await q(`select code from public.rent_certificates`)).toEqual([]);  // başkasının belgesi listelenmez
});

test('herkes (oturumsuz) kodla doğrular; yanlış kod boş döner; kimse doğrudan yazamaz', async () => {
  await as(null, true);
  const [{ v }] = await q(`select public.verify_rent_certificate($1) v`, [code.toLowerCase()]);
  expect(v).toMatchObject({ code, months: 3, on_time: 2 });
  expect((await q(`select public.verify_rent_certificate('YANLIS1234') v`))[0].v).toBeNull();
  await as(ID.T);
  expect(await tryCall(db, `insert into public.rent_certificates (code, property_id, tenant_id, from_month, to_month, data) values ('X', 'p1', $1, '2026-01', '2026-02', '{}')`, [ID.T])).toMatch(/row-level security/);
});
