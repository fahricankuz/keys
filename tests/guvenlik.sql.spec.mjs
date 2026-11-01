// Mağaza ve üretim güvenliği (şema 25–26. bölüm): hata kaydı sıklık sınırı ve alan kısaltma; bildir (yalnız üyesi olunan
// mülk, günlük sınır, yalnız yönetici okur ve karar verir); engelle (engellenen kişinin mesajları ve mesaj bildirimleri gelmez).
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

let db, as, q;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

test('üyelik: kullanıcı kendi rolünü yükseltemez ya da başka mülke taşıyamaz; iletişim bilgisini güncelleyebilir', async () => {
  await as(ID.T);
  await q(`update public.memberships set display_name = 'Yeni ad', phone = '555' where property_id = 'p1' and user_id = $1`, [ID.T]);
  expect(await tryCall(db, `update public.memberships set role = 'landlord' where property_id = 'p1' and user_id = $1`, [ID.T])).toMatch(/Üyelik rolü/);
  expect(await tryCall(db, `update public.memberships set property_id = 'p2' where property_id = 'p1' and user_id = $1`, [ID.T])).toMatch(/Üyelik rolü/);
  await as(null);
  expect(await q(`select role, display_name from public.memberships where property_id = 'p1' and user_id = $1`, [ID.T])).toEqual([{ role: 'tenant', display_name: 'Yeni ad' }]);
});

test('davet: e-posta hedefi, doğrulama, süre ve tek kullanım sunucuda zorlanır', async () => {
  await as(null);
  await q(`update auth.users set email_confirmed_at = now() where id in ($1, $2)`, [ID.T, ID.X]);
  await as(ID.L);
  const [{ code }] = await q(`insert into public.invites (property_id, created_by, email) values ('p1', $1, 'kiraci@ornek.com') returning code`, [ID.L]);
  const [{ expired }] = await q(`insert into public.invites (property_id, created_by, expires_at) values ('p1', $1, now() - interval '1 second') returning code as expired`, [ID.L]);
  await as(ID.X);
  expect(await tryCall(db, `select public.accept_invite($1)`, [code])).toMatch(/doğrulanmış e-posta/);
  await as(ID.T);
  await q(`select public.accept_invite($1)`, [code]);
  expect(await tryCall(db, `select public.accept_invite($1)`, [code])).toMatch(/kullanılmış/);
  expect(await tryCall(db, `select public.accept_invite($1)`, [expired])).toMatch(/süresi dolmuş/);
});

test('hata kaydı: alanlar kısaltılır, kişi başına saatte 30 kayıt; kullanıcı kayıtları okuyamaz', async () => {
  await as(ID.T);
  await q(`select public.report_error($1)`, [{ message: 'x'.repeat(5000), route: '/uygulama', kind: 'bilinmeyen', platform: 'web' }]);
  for (let i = 0; i < 40; i++) await q(`select public.report_error($1)`, [{ message: 'hata ' + i }]);
  expect(await q(`select * from public.client_errors`)).toEqual([]);           // kullanıcı okuyamaz
  await as(null);
  const rows = await q(`select message, kind from public.client_errors where user_id = $1 order by id`, [ID.T]);
  expect(rows.length).toBe(30);
  expect(rows[0].message.length).toBe(1000);
  expect(rows[0].kind).toBe('error');
});

test('bildir: yalnız üyesi olunan mülk; bildiren kendi kaydını, yönetici hepsini görür; günde en çok 20', async () => {
  await as(ID.T);
  await q(`insert into public.content_reports (property_id, kind, ref_id, reported_user, reason, snapshot) values ('p1', 'message', 'm1', $1, 'taciz', 'kaba mesaj')`, [ID.L]);
  expect(await tryCall(db, `insert into public.content_reports (property_id, kind, reason) values ('p2', 'user', 'spam')`)).toBeTruthy();
  expect(await tryCall(db, `insert into public.content_reports (property_id, kind, reason, status) values ('p1', 'user', 'spam', 'done')`)).toBeTruthy();
  for (let i = 0; i < 19; i++) await q(`insert into public.content_reports (property_id, kind, reason) values ('p1', 'user', 'diger')`);
  expect(await tryCall(db, `insert into public.content_reports (property_id, kind, reason) values ('p1', 'user', 'diger')`)).toBeTruthy();
  await as(ID.L);
  expect(await q(`select id from public.content_reports`)).toEqual([]);         // bildirilen kişi göremez
  await as(ID.A);
  const [r] = await q(`select id from public.content_reports where kind = 'message'`);
  await q(`update public.content_reports set status = 'done', resolution = 'Mesaj kaldırıldı.' where id = $1`, [r.id]);
  await as(null);
  expect((await q(`select body from public.notifications where user_id = $1 and title = 'Bildirimin incelendi'`, [ID.T]))[0].body).toBe('Mesaj kaldırıldı.');
});

test('engelle: engellenen kişinin mesajları ve mesaj bildirimleri gelmez; engel kalkınca mesajlar geri gelir', async () => {
  await as(ID.T);
  await q(`insert into public.user_blocks (blocked) values ($1)`, [ID.L]);
  await as(ID.L);
  await q(`insert into public.messages (id, property_id, from_role, by_user, body) values ('mb1', 'p1', 'landlord', $1, 'engelli mesaj')`, [ID.L]);
  await as(ID.T);
  expect(await q(`select id from public.messages where id = 'mb1'`)).toEqual([]);
  expect(await q(`select id from public.recent_messages(array['p1'], 200) where id = 'mb1'`)).toEqual([]);
  await as(null);
  expect(await q(`select id from public.notifications where user_id = $1 and body = 'engelli mesaj'`, [ID.T])).toEqual([]);
  await as(ID.T);
  await q(`delete from public.user_blocks where blocked = $1`, [ID.L]);
  expect((await q(`select id from public.messages where id = 'mb1'`)).length).toBe(1);
  // Başkasının adına engel yazılamaz.
  expect(await tryCall(db, `insert into public.user_blocks (user_id, blocked) values ($1, $2)`, [ID.L, ID.T])).toBeTruthy();
});

test('mesaj bildirimi engel yokken her iki tarafa da gider (gönderen hariç)', async () => {
  await as(ID.L);
  await q(`insert into public.messages (id, property_id, from_role, by_user, body) values ('mb2', 'p1', 'landlord', $1, 'normal mesaj')`, [ID.L]);
  await as(null);
  expect((await q(`select user_id from public.notifications where body = 'normal mesaj'`)).map((r) => r.user_id)).toEqual([ID.T]);
});
