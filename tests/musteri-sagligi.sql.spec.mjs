// Müşteri sağlığı panosu: temas notları yalnız yöneticiye açık (migration musteri_temas_notlari).
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

let db, as, q;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

test('yönetici temas notu yazar ve okur; mülk sahibi ve kiracı göremez, yazamaz', async () => {
  await as(ID.A);
  await q(`insert into public.customer_contacts (user_id, note) values ($1, 'Aradım, Excel ile aktarım için yardım istedi.')`, [ID.L]);
  const rows = await q(`select user_id, note, created_by from public.customer_contacts`);
  expect(rows).toEqual([{ user_id: ID.L, note: 'Aradım, Excel ile aktarım için yardım istedi.', created_by: ID.A }]);
  expect(await tryCall(db, `insert into public.customer_contacts (user_id, note) values ($1, '')`, [ID.L])).toMatch(/check/);
  for (const who of [ID.L, ID.T]) {
    await as(who);
    expect(await q(`select * from public.customer_contacts`)).toEqual([]);
    expect(await tryCall(db, `insert into public.customer_contacts (user_id, note) values ($1, 'x')`, [who])).toMatch(/row-level security/);
  }
});
