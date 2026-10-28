// Tahakkuk kalemleri (kurumsal yol planı Faz 1): kira ve aidat aynı ay için ayrı kayıt; denetim, bildirim ve
// yetki her kalem için ayrı işler. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

let db, as, q;
const M = '2026-10';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await as(ID.L);
  await q(`update public.properties set aidat = 2000, aidat_payer = 'Kiracı' where id = 'p1'`);
});

test('kiracı aynı ay için kira ve aidat dekontunu ayrı ayrı yükler; ikisi ayrı denetime düşer', async () => {
  await as(ID.T);
  await q(`insert into public.payments (property_id, month, status, amount, receipt_name, receipt_path) values
           ('p1', $1, 'review', 30000, 'kira.png', 'p1/kira.png')`, [M]);
  await q(`insert into public.payments (property_id, month, kind, status, amount, receipt_name, receipt_path) values
           ('p1', $1, 'aidat', 'review', 2000, 'aidat.png', 'p1/aidat.png')`, [M]);
  expect(await q(`select kind, amount::int from public.payments where property_id = 'p1' order by kind`))
    .toEqual([{ kind: 'aidat', amount: 2000 }, { kind: 'kira', amount: 30000 }]);
  await as(null);
  expect((await q(`select ref_id from public.reviews where kind = 'payment' and property_id = 'p1' order by ref_id`)).map(r => r.ref_id))
    .toEqual([M, 'aidat:' + M]);
  // Mülk sahibi onaylanana kadar ikisini de görmez.
  await as(ID.L);
  expect(await q(`select kind from public.payments where property_id = 'p1'`)).toEqual([]);
});

test('aidat dekontu onaylanınca mülk sahibi yalnız aidatı görür ve "aidatı" bildirimi alır; kira reddi aidatı etkilemez', async () => {
  await as(ID.A);
  await q(`update public.reviews set status = 'approved' where kind = 'payment' and ref_id = $1`, ['aidat:' + M]);
  await q(`update public.reviews set status = 'rejected', note = 'Tutar okunmuyor' where kind = 'payment' and ref_id = $1`, [M]);
  await as(ID.L);
  expect(await q(`select kind, status from public.payments where property_id = 'p1'`)).toEqual([{ kind: 'aidat', status: 'review' }]);
  await as(null);
  const notes = await q(`select body from public.notifications where user_id = $1 and title like '%dekont geldi'`, [ID.L]);
  expect(notes.map(n => n.body)).toEqual([M + ' aidatı için ₺2.000 ödendi.']);
  expect(await q(`select kind, status from public.payments where property_id = 'p1' order by kind`))
    .toEqual([{ kind: 'aidat', status: 'review' }, { kind: 'kira', status: 'rejected' }]);
  // Mülk sahibi aidatı onaylar; kiracıya "aidatı onaylandı" gider.
  await as(ID.L);
  await q(`update public.payments set status = 'approved' where property_id = 'p1' and month = $1 and kind = 'aidat'`, [M]);
  await as(null);
  expect((await q(`select body from public.notifications where user_id = $1 and title = 'Ödemen onaylandı'`, [ID.T])).map(n => n.body))
    .toEqual([M + ' aidatı onaylandı.']);
});

test('aidatı mülk sahibi ödüyorsa kiracı aidat kaydı yazamaz; mülk sahibi kendi aidatını işaretler', async () => {
  await as(ID.L);
  await q(`update public.properties set aidat_payer = 'Mülk sahibi' where id = 'p1'`);
  await as(ID.T);
  expect(await tryCall(db, `insert into public.payments (property_id, month, kind, status, amount) values ('p1', '2026-11', 'aidat', 'review', 2000)`))
    .toMatch(/aidatını mülk sahibi öder/);
  await as(ID.L);
  await q(`insert into public.payments (property_id, month, kind, status, amount, paid_on, method) values ('p1', '2026-11', 'aidat', 'approved', 2000, '2026-11-03', 'havale')`);
  expect(await q(`select status, method from public.payments where property_id = 'p1' and month = '2026-11' and kind = 'aidat'`))
    .toEqual([{ status: 'approved', method: 'havale' }]);
});

test('geçersiz kalem ve ödeme yolu reddedilir; kira özetleri aidatı saymaz', async () => {
  await as(ID.L);
  expect(await tryCall(db, `insert into public.payments (property_id, month, kind, status, amount) values ('p1', '2026-12', 'yakit', 'approved', 1)`)).toMatch(/payments_kind_check/);
  expect(await tryCall(db, `insert into public.payments (property_id, month, status, amount, method) values ('p1', '2026-12', 'approved', 1, 'kripto')`)).toMatch(/payments_method_check/);
  await as(null);
  const [{ r }] = await q(`select public.owner_report($1, 'year', '2026-11-15') r`, [ID.L]);
  // Onaylı tek kayıt aidat: mülk sahibinin kira tahsilatına sayılmaz.
  expect(Number(r.properties.find(x => x.name === 'Moda').collected)).toBe(0);
});
