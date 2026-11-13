// Site talebinde yazışma (migration site_talep_yazisma): talebi açan sakin ile master ya da "Talepler" yetkili yönetici yazışır;
// kurumun diğer üyeleri okur ama yazamaz; başka sakin göremez. Göndereni ve tarafı sunucu belirler; karşı tarafa bildirim gider;
// sakin çözülmüş talebe yazınca talep yeniden "İşlemde"ye döner ve kendisine "güncellendi" bildirimi gitmez. PGlite'ta sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000c1';   // site müdürü (master)
const D = '00000000-0000-0000-0000-0000000000c2';   // danışma (yalnız requests.manage)
const Y = '00000000-0000-0000-0000-0000000000c3';   // kasa (talep yetkisi yok)
let db, as, q, org, a1, a2, rid;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'mudur@atakum.com', '{"name":"Site Müdürü","role":"team"}'),
                  ($2, 'danisma@atakum.com', '{"name":"Danışma","role":"team"}'), ($3, 'kasa@atakum.com', '{"name":"Kasa","role":"team"}')`, [M, D, Y]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Atakum Sitesi', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'mudur@atakum.com')`, [org]);
  await as(M);
  const [{ org_role_save: rd }] = await q(`select public.org_role_save($1, null, 'Danışma', $2)`, [org, ['requests.manage']]);
  const [{ org_role_save: ry }] = await q(`select public.org_role_save($1, null, 'Kasa', $2)`, [org, ['reports.view']]);
  const [{ org_invite_create: cd }] = await q(`select public.org_invite_create($1, $2)`, [org, rd]);
  const [{ org_invite_create: cy }] = await q(`select public.org_invite_create($1, $2)`, [org, ry]);
  await as(D); await q(`select public.accept_org_invite($1)`, [cd]);
  await as(Y); await q(`select public.accept_org_invite($1)`, [cy]);
  await as(M);
  [{ id: a1 }] = await q(`insert into public.site_units (org_id, block, no) values ($1, 'A', '1') returning id`, [org]);
  [{ id: a2 }] = await q(`insert into public.site_units (org_id, block, no) values ($1, 'A', '2') returning id`, [org]);
  const [{ code: ct }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'kiraci', 'Kiracı') returning id`, [org, a1]).then(([{ id }]) => q(`select public.site_resident_code($1) code`, [id]));
  const [{ code: cl }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'malik', 'Komşu') returning id`, [org, a2]).then(([{ id }]) => q(`select public.site_resident_code($1) code`, [id]));
  await as(ID.T); await q(`select public.accept_site_invite($1)`, [ct]);
  await as(ID.L); await q(`select public.accept_site_invite($1)`, [cl]);
  await as(ID.T);
  [{ id: rid }] = await q(`insert into public.site_requests (org_id, unit_id, user_id, cat, title) values ($1, $2, $3, 'ariza', 'Asansör arızası') returning id`, [org, a1, ID.T]);
  await as(null); await q(`delete from public.notifications`);
});

test('yetkili yönetici yazar, sakine bildirim gider; gönderen tarafı istemci belirleyemez', async () => {
  await as(D);
  await q(`insert into public.site_request_messages (request_id, org_id, user_id, from_mgmt, body) values ($1, $2, $3, false, 'Teknik ekip yarın gelecek')`, [rid, org, D]);
  expect(await q(`select user_id, from_mgmt from public.site_request_messages`)).toEqual([{ user_id: D, from_mgmt: true }]);
  await as(null);
  expect(await q(`select user_id, title, url from public.notifications`)).toEqual([{ user_id: ID.T, title: 'Talebine yanıt: Asansör arızası', url: '/uygulama/talepler' }]);
});

test('talep yetkisi olmayan yönetici okur ama yazamaz; başka sakin ne görür ne yazar; boş mesaj yazılamaz', async () => {
  await as(Y);
  expect((await q(`select count(*)::int n from public.site_request_messages`))[0].n).toBe(1);
  expect(await tryCall(db, `insert into public.site_request_messages (request_id, org_id, user_id, body) values ($1, $2, $3, 'Yazamam')`, [rid, org, Y])).toMatch(/row-level security/);
  await as(ID.L);
  expect(await q(`select id from public.site_request_messages`)).toEqual([]);
  expect(await tryCall(db, `insert into public.site_request_messages (request_id, org_id, user_id, body) values ($1, $2, $3, 'Araya giriyorum')`, [rid, org, ID.L])).toMatch(/row-level security/);
  await as(ID.T);
  expect(await tryCall(db, `insert into public.site_request_messages (request_id, org_id, user_id, body) values ($1, $2, $3, '   ')`, [rid, org, ID.T])).toMatch(/check constraint/);
});

test('sakin cevap yazar: talep yetkili yönetime bildirim gider (yetkisize gitmez); çözülmüş talep yeniden açılır', async () => {
  await as(M);
  await q(`update public.site_requests set status = 3 where id = $1`, [rid]);
  await as(null); await q(`delete from public.notifications`);
  await as(ID.T);
  // Yönetici adına (user_id = D) göndermeyi dener: sunucu göndereni oturumdaki kişi yapar, yönetim mesajı sayılmaz.
  await q(`insert into public.site_request_messages (request_id, org_id, user_id, from_mgmt, body) values ($1, $2, $3, true, 'Hâlâ çalışmıyor')`, [rid, org, D]);
  expect(await q(`select user_id, from_mgmt from public.site_request_messages where body = 'Hâlâ çalışmıyor'`)).toEqual([{ user_id: ID.T, from_mgmt: false }]);
  await as(null);
  expect((await q(`select status from public.site_requests where id = $1`, [rid]))[0].status).toBe(2);
  const notes = await q(`select user_id, title from public.notifications order by user_id`);
  expect(notes.map((n) => n.user_id).sort()).toEqual([M, D].sort());
  expect(notes.every((n) => n.title === 'A Blok No 1: talebe yeni mesaj')).toBe(true);
});

test('yazışma değiştirilemez ve silinemez; talep silinince mesajları da silinir', async () => {
  await as(ID.T);
  await q(`update public.site_request_messages set body = 'değişti'`);
  await q(`delete from public.site_request_messages`);
  await as(M);
  expect((await q(`select count(*)::int n from public.site_request_messages where body = 'değişti'`))[0].n).toBe(0);
  expect((await q(`select count(*)::int n from public.site_request_messages`))[0].n).toBe(2);
  await as(null);
  await q(`delete from public.site_requests where id = $1`, [rid]);
  expect((await q(`select count(*)::int n from public.site_request_messages`))[0].n).toBe(0);
});
