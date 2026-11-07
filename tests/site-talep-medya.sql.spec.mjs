// Site talebine fotoğraf ve video eki (migration site_talep_medya): ekler yalnız talebin sitesinin klasöründen ve izinli uzantıda;
// talep açılırken yazılır, sonradan değişmez; mesaj yalnız dosyadan oluşabilir ve bildirim "Fotoğraf / video eklendi" der. PGlite'ta sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000c1';   // site müdürü (master)
let db, as, q, org, other, a1;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'mudur@atakum.com', '{"name":"Site Müdürü","role":"team"}')`, [M]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Atakum Sitesi', sector: 'site' }]);
  [{ admin_org_save: other }] = await q(`select public.admin_org_save($1)`, [{ name: 'Başka Site', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'mudur@atakum.com')`, [org]);
  await as(M);
  [{ id: a1 }] = await q(`insert into public.site_units (org_id, block, no) values ($1, 'A', '1') returning id`, [org]);
  const [{ code }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'kiraci', 'Kiracı') returning code`, [org, a1]);
  await as(ID.T); await q(`select public.accept_site_invite($1)`, [code]);
});

const open = (media, title = 'Tavan akıtıyor') => db.query(
  `insert into public.site_requests (org_id, unit_id, user_id, cat, title, media) values ($1, $2, $3, 'ariza', $4, $5) returning id`, [org, a1, ID.T, title, media]);

test('sakin fotoğraf ve video ekiyle talep açar; yönetim ekleri okur', async () => {
  await as(ID.T);
  const media = [`site-${org}/k_a1.webp`, `site-${org}/b2.mp4`, `site-${org}/c3.MOV`.toLowerCase()];
  const [{ id }] = (await open(media)).rows;
  await as(M);
  expect((await q(`select media from public.site_requests where id = $1`, [id]))[0].media).toEqual(media);
});

test('ek yolu başka sitenin klasöründe, izinsiz uzantıda ya da yol gezen biçimde olamaz; en çok 6 dosya', async () => {
  await as(ID.T);
  expect(await tryCall(db, `insert into public.site_requests (org_id, unit_id, user_id, title, media) values ($1, $2, $3, 'x1', $4)`, [org, a1, ID.T, [`site-${other}/a.jpg`]])).toMatch(/klasöründe/);
  expect(await tryCall(db, `insert into public.site_requests (org_id, unit_id, user_id, title, media) values ($1, $2, $3, 'x2', $4)`, [org, a1, ID.T, [`site-${org}/a.exe`]])).toMatch(/klasöründe/);
  expect(await tryCall(db, `insert into public.site_requests (org_id, unit_id, user_id, title, media) values ($1, $2, $3, 'x3', $4)`, [org, a1, ID.T, [`site-${org}/../${other}/a.jpg`]])).toMatch(/klasöründe/);
  expect(await tryCall(db, `insert into public.site_requests (org_id, unit_id, user_id, title, media) values ($1, $2, $3, 'x4', $4)`, [org, a1, ID.T, [`evim/${org}/a.jpg`]])).toMatch(/klasöründe/);
  const seven = Array.from({ length: 7 }, (_, i) => `site-${org}/f${i}.jpg`);
  expect(await tryCall(db, `insert into public.site_requests (org_id, unit_id, user_id, title, media) values ($1, $2, $3, 'x5', $4)`, [org, a1, ID.T, seven])).toMatch(/check/);
});

test('ek sonradan değişmez: yönetim durumu ve yanıtı güncelleyince ek korunur', async () => {
  await as(ID.T);
  const [{ id }] = (await open([`site-${org}/a.jpg`], 'Kapı')).rows;
  await as(M);
  await q(`update public.site_requests set status = 1, reply = 'Bakıyoruz', media = '{}' where id = $1`, [id]);
  const r = (await q(`select status, reply, media from public.site_requests where id = $1`, [id]))[0];
  expect(r).toMatchObject({ status: 1, reply: 'Bakıyoruz', media: [`site-${org}/a.jpg`] });
});

test('mesaj yalnız dosyadan oluşabilir; ikisi de boşsa reddedilir; bildirim "Fotoğraf / video eklendi" der', async () => {
  await as(ID.T);
  const [{ id }] = (await open([], 'Su kaçağı')).rows;
  await as(null); await q(`delete from public.notifications`);
  await as(ID.T);
  await q(`insert into public.site_request_messages (request_id, org_id, body, media) values ($1, $2, '', $3)`, [id, org, [`site-${org}/v1.mp4`]]);
  expect(await tryCall(db, `insert into public.site_request_messages (request_id, org_id, body, media) values ($1, $2, '', '{}')`, [id, org])).toMatch(/check/);
  expect(await tryCall(db, `insert into public.site_request_messages (request_id, org_id, body, media) values ($1, $2, 'x', $3)`, [id, org, [`site-${other}/v.mp4`]])).toMatch(/klasöründe/);
  await as(null);
  const n = await q(`select user_id, body from public.notifications where title like '%talebe yeni mesaj%'`);
  expect(n.map((x) => x.user_id)).toContain(M);
  expect(n.every((x) => /Su kaçağı: Fotoğraf \/ video eklendi/.test(x.body))).toBe(true);
  // Yönetim de dosyayla yanıtlar; sakine bildirim gider.
  await as(M);
  await q(`insert into public.site_request_messages (request_id, org_id, body, media) values ($1, $2, 'Gördük', $3)`, [id, org, [`site-${org}/y.jpg`]]);
  const got = (await q(`select media, from_mgmt from public.site_request_messages where request_id = $1 order by created_at`, [id])).map((x) => [x.from_mgmt, x.media.length]);
  expect(got).toEqual([[false, 1], [true, 1]]);
});
