// Talep akışı (schema.sql 22. bölüm): kiracı kendi teklifini ve faturasını ekler, usta seçimi mülk sahibinindir;
// mesajlar bir talebe bağlanabilir. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

let db, as, q;
const quote = (id, by, extra = {}) => JSON.stringify(Object.assign({ id, vendor: 'Usta ' + id, amount: 1000, chosen: false, by }, extra));

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await as(ID.T);
  await q(`insert into public.requests (id, property_id, cat, title) values ('r1', 'p1', 'Arıza', 'Kombi')`);
});

test('kiracı kendi teklifini ekler; mülk sahibine "Yeni teklif" bildirimi gider', async () => {
  await as(ID.T);
  await q(`update public.requests set quotes = $1::jsonb where id = 'r1'`, ['[' + quote('q1', 'tenant') + ']']);
  await as(null);
  const n = await q(`select title from public.notifications where user_id = $1 and title = 'Yeni teklif'`, [ID.L]);
  expect(n.length).toBe(1);
});

test('mülk sahibi teklif ekler ve seçer; kiracı seçemez, başkasının teklifini silemez ya da sahipliğini değiştiremez', async () => {
  await as(ID.L);
  await q(`update public.requests set quotes = $1::jsonb where id = 'r1'`, ['[' + quote('q1', 'tenant') + ',' + quote('q2', 'landlord') + ']']);
  await as(ID.T);
  // Mülk sahibinin teklifini silmek.
  expect(await tryCall(db, `update public.requests set quotes = '[${quote('q1', 'tenant')}]'::jsonb where id = 'r1'`)).toMatch(/yalnızca kendi teklifini/);
  // Kendi teklifini seçili yapmak (usta seçimi mülk sahibinindir).
  expect(await tryCall(db, `update public.requests set quotes = '[${quote('q1', 'tenant', { chosen: true })},${quote('q2', 'landlord')}]'::jsonb where id = 'r1'`)).toMatch(/yalnızca kendi teklifini/);
  // Mülk sahibinin teklifini kendine mal etmek.
  expect(await tryCall(db, `update public.requests set quotes = '[${quote('q1', 'tenant')},${quote('q2', 'tenant')}]'::jsonb where id = 'r1'`)).toMatch(/yalnızca kendi teklifini/);
  // Kendi seçilmemiş teklifini silebilir.
  await q(`update public.requests set quotes = $1::jsonb where id = 'r1'`, ['[' + quote('q2', 'landlord') + ']']);
  await as(ID.L);
  await q(`update public.requests set quotes = $1::jsonb where id = 'r1'`, ['[' + quote('q3', 'tenant') + ',' + quote('q2', 'landlord', { chosen: true }) + ']']);
  expect((await q(`select jsonb_array_length(quotes) n from public.requests where id = 'r1'`))[0].n).toBe(2);
  // Mülk sahibinin seçtiği teklif kiracı tarafından silinemez.
  await as(ID.T);
  expect(await tryCall(db, `update public.requests set quotes = '[${quote('q3', 'tenant')}]'::jsonb where id = 'r1'`)).toMatch(/yalnızca kendi teklifini/);
});

test('kiracı fatura ekler; masraf ve kararı yine değiştiremez; mülk sahibinin faturasına dokunamaz', async () => {
  await as(ID.T);
  await q(`update public.requests set invoice = '{"name":"fatura.pdf","path":"sb:p1/fatura.pdf","amount":1850,"date":"2026-10-20"}'::jsonb where id = 'r1'`);
  expect(await tryCall(db, `update public.requests set cost = 'Kiracı' where id = 'r1'`)).toMatch(/yalnızca mülk sahibi/);
  expect(await tryCall(db, `update public.requests set invoice = '{"name":"x.pdf","amount":1}'::jsonb where id = 'r1'`)).toMatch(/Faturayı yalnızca mülk sahibi/);
  // Fatura yönetici inceleme kuyruğuna düşer.
  await as(null);
  expect((await q(`select kind, status from public.reviews where kind = 'invoice'`))[0]).toEqual({ kind: 'invoice', status: 'pending' });
});

test('mesaj bir talebe bağlanabilir (req_id); sistem mesajı da', async () => {
  await as(ID.T);
  await q(`insert into public.messages (id, property_id, from_role, body, req_id) values ('m1', 'p1', 'tenant', 'Bu talep hakkında yazıyorum.', 'r1')`);
  await q(`insert into public.messages (id, property_id, from_role, body, req_id) values ('m2', 'p1', 'system', 'Yeni usta teklifi', 'r1')`);
  await as(ID.L);
  expect((await q(`select id, req_id from public.messages where req_id = 'r1' order by id`))).toEqual([{ id: 'm1', req_id: 'r1' }, { id: 'm2', req_id: 'r1' }]);
});
