// Ekstreden kira tahsilatı (migration ekstre_kira): rent_bank_apply yetkisi, kısmi/tam ödeme, onaylı ayın korunması,
// aynı hareketin ikinci kez işlenmemesi, tabloya doğrudan yazılamaması. Gerçek Postgres'te (PGlite).
// newDb: p1 (sahibi L, kiracısı T), p2 (sahibi L2).
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

let db, as, q;
const call = (pid, fp, amount, kinds, months, amounts, complete) =>
  `select public.rent_bank_apply('${pid}', '${fp}', '2026-11-05', ${amount}, 'Garanti BBVA', '{${kinds}}', '{${months}}', '{${amounts}}', '{${complete}}') ok`;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

test('yetki: kiracı ve başka mülk sahibi işleyemez; oturumsuz çağrılamaz; tabloya doğrudan yazılamaz', async () => {
  await as(ID.T);
  expect(await tryCall(db, call('p1', '0000000000000001', 30000, 'kira', '2026-11', 30000, 'true'))).toMatch(/yetkin yok/);
  await as(ID.L2);
  expect(await tryCall(db, call('p1', '0000000000000001', 30000, 'kira', '2026-11', 30000, 'true'))).toMatch(/yetkin yok/);
  await as(null, true);
  expect(await tryCall(db, call('p1', '0000000000000001', 30000, 'kira', '2026-11', 30000, 'true'))).toMatch(/permission denied/);
  await as(ID.L);
  expect(await tryCall(db, `insert into public.rent_bank_txns (owner_id, property_id, fp, txn_date, amount) values ($1, 'p1', 'aaaaaaaaaaaaaaaa', '2026-11-05', 1)`, [ID.L])).toMatch(/permission denied|row-level/);
});

test('kısmi sonra tam: tutarlar toplanır, havale ve işlem tarihi yazılır; aynı hareket ikinci kez işlenmez; kiracı görür', async () => {
  await as(ID.L);
  expect((await q(call('p1', '0000000000000002', 10000, 'kira', '2026-10', 10000, 'false')))[0].ok).toBe(true);
  expect((await q(`select status, amount, method, to_char(paid_on, 'YYYY-MM-DD') d from public.payments where property_id = 'p1' and month = '2026-10' and kind = 'kira'`))[0])
    .toEqual({ status: 'partial', amount: '10000', method: 'havale', d: '2026-11-05' });
  expect((await q(call('p1', '0000000000000002', 10000, 'kira', '2026-10', 10000, 'false')))[0].ok).toBe(false);
  // Tek havale: Ekim'in kalanı (20000) + Kasım (30000).
  expect((await q(call('p1', '0000000000000003', 50000, 'kira,kira', '2026-10,2026-11', '20000,30000', 'true,true')))[0].ok).toBe(true);
  const rows = await q(`select month, status, amount, approved_at is not null a from public.payments where property_id = 'p1' and kind = 'kira' order by month`);
  expect(rows).toEqual([{ month: '2026-10', status: 'approved', amount: '30000', a: true }, { month: '2026-11', status: 'approved', amount: '30000', a: true }]);
  await as(ID.T);
  expect((await q(`select count(*)::int n from public.payments where property_id = 'p1' and status = 'approved'`))[0].n).toBe(2);
  expect((await q(`select count(*)::int n from public.rent_bank_txns`))[0].n).toBe(0);   // hareket kaydı kiracıya görünmez
});

test('kurallar: onaylı ay değişmez, dağıtım hareketi aşamaz, geçersiz ay reddedilir; hata olunca hiçbir şey kaydedilmez', async () => {
  await as(ID.L);
  expect(await tryCall(db, call('p1', '0000000000000004', 30000, 'kira', '2026-11', 30000, 'true'))).toMatch(/zaten onaylanmış/);
  expect(await tryCall(db, call('p1', '0000000000000005', 100, 'kira', '2026-12', 150, 'false'))).toMatch(/aşıyor/);
  expect(await tryCall(db, call('p1', '0000000000000006', 100, 'kira', '2026-13', 100, 'false'))).toMatch(/geçersiz/);
  expect((await q(`select count(*)::int n from public.rent_bank_txns where owner_id = $1`, [ID.L]))[0].n).toBe(2);
});
