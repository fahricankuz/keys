// Site projeleri (migration site_projeleri): yönetim (master ya da "Site projeleri" yetkili rol) projeyi açar ve aşama aşama
// (açıldı → teklif → yapım → tamamlandı) fotoğraflı güncellemeyle ilerletir; her aşamada sakinlere aşamanın adıyla bildirim gider;
// sakin ve yetkisiz yönetici ilerletemez; başka site ve yabancı göremez. Gerçek Postgres'te (PGlite) sınanır.
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
  const [{ code }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'malik', 'Malik') returning id`, [org, a1]).then(([{ id }]) => q(`select public.site_resident_code($1) code`, [id]));
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

test('aşamalar: açıldı → teklif → yapım → tamamlandı; her aşamada fotoğraf ve aşamanın adıyla bildirim; düzenleme aşamayı değiştirmez', async () => {
  await as(P);
  expect((await q(`select status from public.site_projects where id = $1`, [pid]))[0].status).toBe('acildi');
  expect(await tryCall(db, `insert into public.site_project_updates (project_id, org_id, body, photos) values ($1, $2, 'Yanlış klasör', $3)`, [pid, org, ['site-00000000-0000-0000-0000-000000000000/a.webp']]))
    .toMatch(/row-level security/);
  expect(await tryCall(db, `insert into public.site_project_updates (project_id, org_id) values ($1, $2)`, [pid, org])).toMatch(/check constraint/);
  // Düzenleme formundan aşama atlanamaz: doğrudan güncelleme aşamayı değiştirmez (bildirimsiz aşama olmasın).
  await q(`update public.site_projects set status = 'tamam', body = 'A ve B blok, çatı dahil' where id = $1`, [pid]);
  expect(await q(`select status, body from public.site_projects where id = $1`, [pid])).toEqual([{ status: 'acildi', body: 'A ve B blok, çatı dahil' }]);
  await as(null); await q(`delete from public.notifications`);
  await as(P);
  await q(`insert into public.site_project_updates (project_id, org_id, body, status, photos) values ($1, $2, 'Üç firmadan teklif alındı', 'teklif', $3)`, [pid, org, [folder + 'teklif1.webp', folder + 'teklif2.webp']]);
  await q(`insert into public.site_project_updates (project_id, org_id, status, progress, photos) values ($1, $2, 'yapim', 30, $3)`, [pid, org, [folder + 'iskele.webp']]);
  expect(await q(`select status, progress from public.site_projects where id = $1`, [pid])).toEqual([{ status: 'yapim', progress: 30 }]);
  await q(`insert into public.site_project_updates (project_id, org_id, body, progress) values ($1, $2, 'A blok bitti', 60)`, [pid, org]);   // aşama aynı
  await q(`insert into public.site_project_updates (project_id, org_id, body, status, photos) values ($1, $2, 'Cephe tamamlandı', 'tamam', $3)`, [pid, org, [folder + 'bitti.webp']]);
  expect(await q(`select status, progress from public.site_projects where id = $1`, [pid])).toEqual([{ status: 'tamam', progress: 100 }]);
  await as(null);
  expect(await q(`select title, body from public.notifications where user_id = $1 order by id`, [ID.L])).toEqual([
    { title: 'Dış cephe boyası: Teklif alındı', body: 'Üç firmadan teklif alındı' },
    { title: 'Dış cephe boyası: Yapıma başlandı', body: '1 yeni fotoğraf eklendi' },
    { title: 'Proje güncellendi: Dış cephe boyası', body: 'A blok bitti' },
    { title: 'Dış cephe boyası: Tamamlandı', body: 'Cephe tamamlandı' }
  ]);
  expect(await q(`select user_id from public.notifications where user_id in ($1, $2)`, [P, M])).toEqual([]);   // yazan ve yönetim değil, sakinler
});

test('okuma: sitenin sakini ve yönetim görür; yabancı görmez; sakin değiştiremez ve silemez', async () => {
  await as(ID.L);
  expect((await q(`select title from public.site_projects`)).map((r) => r.title)).toEqual(['Dış cephe boyası']);
  expect((await q(`select count(*)::int n from public.site_project_updates`))[0].n).toBe(4);
  await q(`update public.site_projects set progress = 5 where id = $1`, [pid]);   // RLS: hiçbir satır değişmez
  await q(`delete from public.site_project_updates`);
  expect(await tryCall(db, `insert into public.site_project_updates (project_id, org_id, body, status) values ($1, $2, 'Sakin', 'tamam')`, [pid, org])).toMatch(/row-level security/);
  await as(Y);
  expect((await q(`select progress from public.site_projects where id = $1`, [pid]))[0].progress).toBe(100);
  expect((await q(`select count(*)::int n from public.site_project_updates`))[0].n).toBe(4);
  expect(await tryCall(db, `insert into public.site_project_updates (project_id, org_id, body, status) values ($1, $2, 'Yetkisiz', 'tamam')`, [pid, org])).toMatch(/row-level security/);
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
