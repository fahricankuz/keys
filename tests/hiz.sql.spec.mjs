// Hız iyileştirmeleri, sunucu tarafı: mülk başına son mesajlar (satır kuralları korunur) ve görselin küçük kopyasının
// asıl dosyanın denetim durumunu izlemesi. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, ID } from './db-helpers.mjs';

let db, as, q;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

test('recent_messages: mülk başına son N mesaj, eskiden yeniye; üyesi olunmayan mülkün mesajı gelmez', async () => {
  await as(null);
  await q(`insert into public.messages (id, property_id, from_role, by_user, body, at)
           select 'm' || i, 'p1', 'landlord', $1, 'Mesaj ' || i, now() - (300 - i) * interval '1 minute' from generate_series(1, 250) i`, [ID.L]);
  await q(`insert into public.messages (id, property_id, from_role, by_user, body, at) values ('x1', 'p2', 'landlord', $1, 'Başkası', now())`, [ID.L2]);
  await as(ID.T);
  const rows = await q(`select id, property_id, body, at from public.recent_messages(array['p1','p2'], 200)`);
  expect(rows.length).toBe(200);
  expect(rows.every((r) => r.property_id === 'p1')).toBe(true);
  // Mülkün en yeni 200 mesajı (eskiden yeniye): sondaki en yenisi, en eskiler dışarıda.
  const newest = (await q(`select id from public.messages where property_id = 'p1' order by at desc limit 200`)).map((r) => r.id).sort();
  expect(rows.map((r) => r.id).sort()).toEqual(newest);
  expect(rows.some((r) => r.body === 'Mesaj 1')).toBe(false);
  expect(rows.every((r, i) => !i || rows[i - 1].at <= r.at)).toBe(true);
  expect((await q(`select count(*)::int as n from public.recent_messages(array['p1'], 10)`))[0].n).toBe(10);
});

test('küçük kopya (yol + .k) asıl dosyanın denetim durumunu izler', async () => {
  await as(null);
  await q(`insert into public.reviews (kind, property_id, ref_id, uploader, label, path, status) values ('payment', 'p1', '2026-10', $1, 'dekont', 'p1/k_abc.webp', 'pending')`, [ID.T]);
  const ok = async (p) => (await q(`select public.file_review_ok($1) as ok`, [p]))[0].ok;
  expect(await ok('p1/k_abc.webp')).toBe(false);
  expect(await ok('p1/k_abc.webp.k')).toBe(false);
  await q(`update public.reviews set status = 'approved' where path = 'p1/k_abc.webp'`);
  expect(await ok('p1/k_abc.webp.k')).toBe(true);
  expect(await ok('p1/baska.webp.k')).toBe(true);
});
