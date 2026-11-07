// Site projeleri (migration site_projeleri): yönetim (master ya da "Site projeleri" yetkili rol) proje ve fotoğraflı güncelleme
// ekler; güncelleme projenin durumunu ve yüzdesini taşır; sitenin sakinleri görür ve bildirim alır, değiştiremez; başka site
// ve yabancı göremez. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000c1';   // site müdürü (master)
const P = '00000000-0000-0000-0000-0000000000c2';   // proje sorumlusu (yalnız projects.manage)
const Y = '00000000-0000-0000-0000-0000000000c3';   // muhasebe (proje yetkisi yok)
let db, as, q, org, a1, pid, folder;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'mudur@atakum.com', '{"name":"Site Müdürü","role":"team"}'),
                  ($2, 'proje@atakum.com', '{"name":"Proje Sorumlusu","role":"team"}'), ($3, 'muhasebe@atakum.com', '{"name":"Muhasebeci","role":"team"}')`, [M, P, Y]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Atakum Sitesi', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'mudur@atakum.com')`, [org]);
  folder = 'site-' + org + '/';
  await as(M);
  const [{ org_role_save: rp }] = await q(`select public.org_role_save($1, null, 'Proje', $2)`, [org, ['projects.manage']]);
  const [{ org_role_save: ry }] = await q(`select public.org_role_save($1, null, 'Kasa', $2)`, [org, ['reports.view']]);
  const [{ org_invite_create: cp }] = await q(`select public.org_invite_create($1, $2)`, [org, rp]);
  const [{ org_invite_create: cy }] = await q(`select public.org_invite_create($1, $2)`, [org, ry]);
  await as(P); await q(`select public.accept_org_invite($1)`, [cp]);
  await as(Y); await q(`select public.accept_org_invite($1)`, [cy]);
  await as(M);
  [{ id: a1 }] = await q(`insert into public.site_units (org_id, block, no) values ($1, 'A', '1') returning id`, [org]);
  const [{ code }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'malik', 'Malik') returning code`, [org, a1]);
  await as(ID.L); await q(`select public.accept_site_invite($1)`, [code]);
});

test('yetki kataloğunda "projects.manage" var; master hepsini alır', async () => {
  await as(M);
  expect((await q(`select public.org_perm_list() l`))[0].l).toContain('projects.manage');
});

test('proje: yetkili rol ekler, sakinlere bildirim gider; yetkisiz yönetici ve sakin ekleyemez', async () => {
  await as(Y);
  expect(await tryCall(db, `insert into public.site_projects (org_id, title) values ($1, 'Yetkisiz')`, [org])).toMatch(/row-level security/);
  await as(ID.L);
  expect(await tryCall(db, `insert into public.site_projects (org_id, title) values ($1, 'Sakinden')`, [org])).toMatch(/row-level security/);
  await as(P);
  [{ id: pid }] = await q(`insert into public.site_projects (org_id, title, body, budget, start_on, end_on, cover) values ($1, 'Dış cephe boyası', 'A ve B blok', 450000, '2026-11-10', '2027-01-31', $2) returning id`, [org, folder + 'kapak.webp']);
  expect(await tryCall(db, `insert into public.site_projects (org_id, title, cover) values ($1, 'Başka klasör', 'site-00000000-0000-0000-0000-000000000000/x.webp')`, [org])).toMatch(/check constraint/);
  expect(await tryCall(db, `insert into public.site_projects (org_id, title, start_on, end_on) values ($1, 'Ters tarih', '2027-01-01', '2026-01-01')`, [org])).toMatch(/check constraint/);
  await as(null);
  expect(await q(`select user_id, title from public.notifications where title like 'Yeni site projesi%'`)).toEqual([{ user_id: ID.L, title: 'Yeni site projesi: Dış cephe boyası' }]);
});

test('güncelleme: fotoğraflar site klasöründe olmalı; durum ve yüzde projeye taşınır, "tamam" yüzdeyi 100 yapar', async () => {
  await as(P);
  expect(await tryCall(db, `insert into public.site_project_updates (project_id, org_id, body, photos) values ($1, $2, 'Yanlış klasör', $3)`, [pid, org, ['site-00000000-0000-0000-0000-000000000000/a.webp']]))
    .toMatch(/row-level security/);
  expect(await tryCall(db, `insert into public.site_project_updates (project_id, org_id) values ($1, $2)`, [pid, org])).toMatch(/check constraint/);
  await q(`insert into public.site_project_updates (project_id, org_id, body, status, progress, photos) values ($1, $2, 'İskele kuruldu', 'devam', 30, $3)`, [pid, org, [folder + 'iskele.webp', folder + 'iskele2.webp']]);
  expect(await q(`select status, progress from public.site_projects where id = $1`, [pid])).toEqual([{ status: 'devam', progress: 30 }]);
  await q(`insert into public.site_project_updates (project_id, org_id, body, status) values ($1, $2, 'Bitti', 'tamam')`, [pid, org]);
  expect(await q(`select status, progress from public.site_projects where id = $1`, [pid])).toEqual([{ status: 'tamam', progress: 100 }]);
  await as(null);
  expect((await q(`select count(*)::int n from public.notifications where user_id = $1 and title = 'Proje güncellendi: Dış cephe boyası'`, [ID.L]))[0].n).toBe(2);
});

test('okuma: sitenin sakini ve yönetim görür; yabancı görmez; sakin değiştiremez ve silemez', async () => {
  await as(ID.L);
  expect((await q(`select title from public.site_projects`)).map((r) => r.title)).toEqual(['Dış cephe boyası']);
  expect((await q(`select count(*)::int n from public.site_project_updates`))[0].n).toBe(2);
  await q(`update public.site_projects set progress = 5 where id = $1`, [pid]);   // RLS: hiçbir satır değişmez
  await q(`delete from public.site_project_updates`);
  await as(Y);
  expect((await q(`select progress from public.site_projects where id = $1`, [pid]))[0].progress).toBe(100);
  expect((await q(`select count(*)::int n from public.site_project_updates`))[0].n).toBe(2);
  await as(ID.X);
  expect(await q(`select id from public.site_projects`)).toEqual([]);
  expect(await q(`select id from public.site_project_updates`)).toEqual([]);
});

test('proje başka siteye taşınamaz; oluşturan değişmez; silinince güncellemeleri de silinir', async () => {
  await as(ID.A);
  const [{ admin_org_save: other }] = await q(`select public.admin_org_save($1)`, [{ name: 'Başka Site', sector: 'site' }]);
  await as(M);
  expect(await tryCall(db, `update public.site_projects set org_id = $1 where id = $2`, [other, pid])).toMatch(/taşınamaz|row-level security/);
  await q(`update public.site_projects set created_by = $1, budget = 480000 where id = $2`, [M, pid]);
  expect(await q(`select created_by, budget::int budget from public.site_projects where id = $1`, [pid])).toEqual([{ created_by: P, budget: 480000 }]);
  await q(`delete from public.site_projects where id = $1`, [pid]);
  await as(null);
  expect((await q(`select count(*)::int n from public.site_project_updates`))[0].n).toBe(0);
});
