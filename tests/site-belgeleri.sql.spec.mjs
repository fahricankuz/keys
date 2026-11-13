// Site belgeleri (migration site_belgeleri): yönetim siteye ya da daireye yükler, sakin yönetime gönderir; kim neyi görür,
// bildirim kime gider; bağlı mülkün kiracısı da sakin sayılır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000c1';   // site müdürü (master)
let db, as, q, org, a1, a2, folder;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'mudur@atakum.com', '{"name":"Site Müdürü","role":"team"}')`, [M]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Atakum Sitesi', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'mudur@atakum.com')`, [org]);
  folder = 'site-' + org + '/';
  await as(M);
  [{ id: a1 }] = await q(`insert into public.site_units (org_id, block, no, area) values ($1, 'A', '1', 100) returning id`, [org]);
  [{ id: a2 }] = await q(`insert into public.site_units (org_id, block, no, area) values ($1, 'A', '2', 100) returning id`, [org]);
  const [{ code }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'malik', 'Malik') returning id`, [org, a1]).then(([{ id }]) => q(`select public.site_resident_code($1) code`, [id]));
  await as(ID.L); await q(`select public.accept_site_invite($1)`, [code]);
  // p1'in kiracısı (T) mülk A2'ye bağlanınca A2'nin kiracısı sayılır.
  await as(M); const [{ code: c2 }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'malik', 'Ev Sahibi') returning id`, [org, a2]).then(([{ id }]) => q(`select public.site_resident_code($1) code`, [id]));
  await as(ID.L); await q(`select public.accept_site_invite($1)`, [c2]); await q(`select public.link_site_unit('p1', $1)`, [a2]);
});

test('yönetim siteye ve daireye belge yükler; herkes kendi göreceğini görür, sakinlere bildirim gider', async () => {
  await as(M);
  await q(`insert into public.site_documents (org_id, title, name, path) values ($1, 'İşletme projesi 2027', 'proje.pdf', $2)`, [org, folder + 'proje.pdf']);
  await q(`insert into public.site_documents (org_id, unit_id, audience, title, path) values ($1, $2, 'daire', 'A1 sayaç tutanağı', $3)`, [org, a1, folder + 'a1.pdf']);
  await as(ID.T);   // A2 (bağlı mülk) kiracısı
  expect((await q(`select title from public.site_documents order by title`)).map((r) => r.title)).toEqual(['İşletme projesi 2027']);
  expect((await q(`select public.site_folder_ok($1) ok`, ['site-' + org]))[0].ok).toBe(true);
  await as(ID.X);
  expect(await q(`select title from public.site_documents`)).toEqual([]);
  await as(null);
  const notes = await q(`select user_id, body from public.notifications where title = 'Yeni belge' order by body, user_id`);
  expect(notes.filter((n) => n.body === 'İşletme projesi 2027').map((n) => n.user_id).sort()).toEqual([ID.L, ID.T].sort());
  expect(notes.filter((n) => n.body === 'A1 sayaç tutanağı').map((n) => n.user_id)).toEqual([ID.L]);
});

test('sakin yalnız kendi dairesi için yönetime gönderir; siteye belge koyamaz; yönetime bildirim gider', async () => {
  await as(ID.T);
  await q(`insert into public.site_documents (org_id, unit_id, audience, title, path) values ($1, $2, 'yonetim', 'Kira sözleşmem', $3)`, [org, a2, folder + 'soz.pdf']);
  expect(await tryCall(db, `insert into public.site_documents (org_id, unit_id, audience, title, path) values ($1, $2, 'yonetim', 'Başkasının', $3)`, [org, a1, folder + 'x.pdf'])).toMatch(/row-level security/);
  expect(await tryCall(db, `insert into public.site_documents (org_id, title, path) values ($1, 'Herkese', $2)`, [org, folder + 'y.pdf'])).toMatch(/row-level security/);
  expect(await tryCall(db, `insert into public.site_documents (org_id, unit_id, audience, title, path) values ($1, $2, 'yonetim', 'Başka klasör', 'site-00000000-0000-0000-0000-000000000000/z.pdf')`, [org, a2])).toMatch(/row-level security/);
  await as(ID.L);   // A1 maliki, A2'nin de maliki: kiracının yönetime gönderdiğini görmez
  expect((await q(`select title from public.site_documents where audience = 'yonetim'`))).toEqual([]);
  await as(M);
  expect((await q(`select title from public.site_documents where audience = 'yonetim'`)).map((r) => r.title)).toEqual(['Kira sözleşmem']);
  await as(null);
  expect((await q(`select user_id, title from public.notifications where body = 'Kira sözleşmem'`))).toEqual([{ user_id: M, title: 'A Blok No 2: yeni belge' }]);
});

test('silme: yönetim her belgeyi, sakin yalnız kendi gönderdiğini', async () => {
  await as(ID.L);
  await q(`delete from public.site_documents`);   // RLS: hiçbirini silemez (hepsi başkasının)
  await as(M);
  expect((await q(`select count(*)::int n from public.site_documents`))[0].n).toBe(3);
  await as(ID.T);
  await q(`delete from public.site_documents where title = 'Kira sözleşmem'`);
  await as(M);
  expect((await q(`select count(*)::int n from public.site_documents`))[0].n).toBe(2);
  await q(`delete from public.site_documents where title = 'A1 sayaç tutanağı'`);
  expect((await q(`select count(*)::int n from public.site_documents`))[0].n).toBe(1);
});
