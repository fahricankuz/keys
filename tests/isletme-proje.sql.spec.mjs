// İşletme projesi ve site projeleri tek çatı (migration isletme_projesi_birlesik): her bütçe satırı bir "işletme projesi" olur;
// taslağı yalnız yönetim görür; oylamada onaylanınca kurul onay tarihi yazılır; onaylı bütçe doğrudan değişmez, yıl ortasındaki ek maliyet
// "ek ödenek" olarak oylanır ve onaylanınca kalemin tutarına eklenir; işletme projesinde teklif/fatura yoktur. PGlite'ta sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000c1';   // site müdürü (master)
let db, as, q, org, a1, a2, a3, pid, poll;
const ITEMS = JSON.stringify([{ cat: 'Personel', amount: 90000 }, { cat: 'Temizlik', amount: 60000 }]);

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'mudur@atakum.com', '{"name":"Site Müdürü","role":"team"}')`, [M]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Atakum Sitesi', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'mudur@atakum.com')`, [org]);
  await as(M);
  const unit = async (no, share) => (await q(`insert into public.site_units (org_id, block, no, share) values ($1, 'A', $2, $3) returning id`, [org, no, share]))[0].id;
  [a1, a2, a3] = [await unit('1', 1), await unit('2', 1), await unit('3', 2)];
  for (const [u, who] of [[a1, ID.L], [a2, ID.T], [a3, ID.X]]) {
    const [{ code }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'malik', 'Malik') returning id`, [org, u]).then(([{ id }]) => q(`select public.site_resident_code($1) code`, [id]));
    await as(who); await q(`select public.accept_site_invite($1)`, [code]); await as(M);
  }
  await as(null); await q(`delete from public.notifications`);
});
const proj = async (id = pid) => (await q(`select status, budget::float8 b, kind, year from public.site_projects where id = $1`, [id]))[0];
const bud = async (y = 2026) => (await q(`select items, method, approved_on from public.site_budgets where org_id = $1 and year = $2`, [org, y]))[0];
const vote = async (who, u, c) => { await as(who); await q(`select public.site_poll_vote($1, $2, $3)`, [poll, u, c]); };

test('bütçe satırı işletme projesi açar: taslak, tutar kalemlerin toplamı; sakinler görmez, bildirim gitmez; bütçe değişince tutar eşitlenir', async () => {
  await as(M);
  await q(`insert into public.site_budgets (org_id, year, items) values ($1, 2026, $2::jsonb)`, [org, ITEMS]);
  [{ id: pid }] = await q(`select id from public.site_projects where org_id = $1 and kind = 'isletme' and year = 2026`, [org]);
  expect(await proj()).toMatchObject({ status: 'acildi', b: 150000, kind: 'isletme', year: 2026 });
  expect((await q(`select title from public.site_projects where id = $1`, [pid]))[0].title).toBe('2026 işletme projesi');
  await as(ID.L);
  expect(await q(`select id from public.site_projects where id = $1`, [pid])).toEqual([]);                  // taslağı sakin görmez
  await as(null);
  expect(await q(`select 1 from public.notifications`)).toEqual([]);                                        // sakinlere bildirim gitmedi
  await as(M);
  await q(`update public.site_budgets set items = $2::jsonb where org_id = $1 and year = 2026`, [org, JSON.stringify([{ cat: 'Personel', amount: 90000 }, { cat: 'Temizlik', amount: 60000 }, { cat: 'Asansör', amount: 36000 }])]);
  expect((await proj()).b).toBe(186000);
});

test('tutarsız işletme projesi oylamaya sunulamaz; doğrudan düzenleme tutarı ve türü değiştiremez', async () => {
  await as(M);
  await q(`insert into public.site_budgets (org_id, year, items) values ($1, 2027, '[]'::jsonb)`, [org]);
  const [{ id: empty }] = await q(`select id from public.site_projects where org_id = $1 and year = 2027 and kind = 'isletme'`, [org]);
  expect(await tryCall(db, `select public.site_project_vote_open($1, 5, 50, 'malik')`, [empty])).toMatch(/gider kalemlerini/);
  await q(`update public.site_projects set budget = 1, kind = 'proje', year = 1999 where id = $1`, [pid]);
  expect(await proj()).toMatchObject({ b: 186000, kind: 'isletme', year: 2026 });
});

test('oylamaya sunulunca sakinler görür; onaylanınca kurul onay tarihi kendiliğinden yazılır; "Yürürlükte" bildirimi türe göre', async () => {
  await as(M);
  [{ site_project_vote_open: poll }] = await q(`select public.site_project_vote_open($1, 7, 50, 'malik')`, [pid]);
  expect((await q(`select question from public.site_polls where id = $1`, [poll]))[0].question).toBe('İşletme projesi onaylansın mı: 2026 işletme projesi');
  await as(ID.L);
  expect((await q(`select status from public.site_projects where id = $1`, [pid]))[0].status).toBe('oylama');   // artık sakin görür
  await vote(ID.L, a1, 0); await vote(ID.T, a2, 1); await vote(ID.X, a3, 0);
  await as(M);
  await q(`select public.site_project_vote_close($1)`, [pid]);
  expect((await proj()).status).toBe('onay');
  const b = await bud();
  expect(b.approved_on).toBeTruthy();
  expect((await q(`select body from public.site_project_updates where project_id = $1 and status = 'onay'`, [pid]))[0].body).toContain('işletme projesi onaylandı');
  await as(null); await q(`delete from public.notifications`);
  await as(M);
  await q(`insert into public.site_project_updates (project_id, org_id, body, status) values ($1, $2, 'Aidatlar güncellendi', 'yapim')`, [pid, org]);
  await as(null);
  expect((await q(`select title from public.notifications where user_id = $1`, [ID.L]))[0].title).toBe('2026 işletme projesi: Yürürlükte');
});

test('onaylı işletme projesinin kalemleri ve paylaştırması doğrudan değişmez; teklif ve fatura girilmez', async () => {
  await as(M);
  expect(await tryCall(db, `update public.site_budgets set items = '[{"cat":"Personel","amount":1}]'::jsonb where org_id = $1 and year = 2026`, [org])).toMatch(/ek ödenek/);
  expect(await tryCall(db, `update public.site_budgets set method = 'equal' where org_id = $1 and year = 2026`, [org])).toMatch(/ek ödenek/);
  await q(`update public.site_budgets set note = 'Not değişebilir' where org_id = $1 and year = 2026`, [org]);
  expect(await tryCall(db, `insert into public.site_project_costs (project_id, org_id, kind, vendor, amount, created_by) values ($1, $2, 'teklif', 'X', 100, $3)`, [pid, org, M])).toMatch(/gider defterinden/);
});

test('ek ödenek: yalnız onaylı işletme projesine açılır; oylanır; onaylanınca kalem tutarına eklenir, yıllık toplam ve proje tutarı artar', async () => {
  await as(M);
  const ek = (parent, cat, b) => db.query(`insert into public.site_projects (org_id, title, kind, parent_id, cat, budget) values ($1, $2, 'ek', $3, $4, $5) returning id`, [org, 'Ek ödenek: ' + cat, parent, cat, b]);
  // Bağsız / kalemsiz / tutarsız ek ödenek olmaz.
  expect(await tryCall(db, `insert into public.site_projects (org_id, title, kind, cat, budget) values ($1, 'x', 'ek', 'Personel', 100)`, [org])).toMatch(/onaylı işletme/);
  expect(await tryCall(db, `insert into public.site_projects (org_id, title, kind, parent_id, budget) values ($1, 'x', 'ek', $2, 100)`, [org, pid])).toMatch(/check constraint/);
  expect(await tryCall(db, `insert into public.site_projects (org_id, title, kind, parent_id, cat, budget) values ($1, 'x', 'ek', $2, 'Personel', 0)`, [org, pid])).toMatch(/check constraint/);
  // Onaysız (taslak) işletme projesine ek ödenek açılamaz.
  await q(`insert into public.site_budgets (org_id, year, items) values ($1, 2028, $2::jsonb)`, [org, ITEMS]);
  const [{ id: draft }] = await q(`select id from public.site_projects where org_id = $1 and year = 2028 and kind = 'isletme'`, [org]);
  expect(await tryCall(db, `insert into public.site_projects (org_id, title, kind, parent_id, cat, budget) values ($1, 'x', 'ek', $2, 'Personel', 100)`, [org, draft])).toMatch(/onaylı işletme/);
  // Onaylı projeye: mevcut kalem + yeni kalem.
  const [{ id: e1 }] = (await ek(pid, 'Personel', 10000)).rows;
  const [{ id: e2 }] = (await ek(pid, 'Güvenlik', 24000)).rows;
  expect((await q(`select status, year from public.site_projects where id = $1`, [e1]))[0]).toMatchObject({ status: 'acildi', year: 2026 });
  for (const [id, vote_choices] of [[e1, [0, 0, 0]], [e2, [0, 1, 1]]]) {
    await as(M);
    [{ site_project_vote_open: poll }] = await q(`select public.site_project_vote_open($1, 3, 50, 'malik')`, [id]);
    for (const [who, u, i] of [[ID.L, a1, 0], [ID.T, a2, 1], [ID.X, a3, 2]]) await vote(who, u, vote_choices[i]);
    await as(M);
    await q(`select public.site_project_vote_close($1)`, [id]);
  }
  expect((await proj(e1)).status).toBe('onay');          // kabul %100
  expect((await proj(e2)).status).toBe('red');           // kabul %25
  const items = (await bud()).items;
  expect(items.find((x) => x.cat === 'Personel').amount).toBe(100000);          // 90.000 + 10.000
  expect(items.find((x) => x.cat === 'Güvenlik')).toBeUndefined();              // reddedilen eklenmedi
  expect((await proj()).b).toBe(196000);                                         // 186.000 + 10.000
  expect((await q(`select body from public.site_project_updates where project_id = $1 and body like 'Ek ödenek onaylandı%'`, [pid]))[0].body).toContain('Personel · ₺10.000');
  // Yeni kalem: onaylanırsa eklenir.
  const [{ id: e3 }] = (await ek(pid, 'Güvenlik', 24000)).rows;
  await as(M);
  [{ site_project_vote_open: poll }] = await q(`select public.site_project_vote_open($1, 3, 50, 'malik')`, [e3]);
  for (const [who, u] of [[ID.L, a1], [ID.T, a2], [ID.X, a3]]) await vote(who, u, 0);
  await as(M);
  await q(`select public.site_project_vote_close($1)`, [e3]);
  expect((await bud()).items.find((x) => x.cat === 'Güvenlik').amount).toBe(24000);
  expect((await proj()).b).toBe(220000);
});

test('bütçe kaydında onay tarihi verilmişse işletme projesi "Yürürlükte" başlar (eski kayıtlar)', async () => {
  await as(M);
  await q(`insert into public.site_budgets (org_id, year, items, approved_on) values ($1, 2025, $2::jsonb, '2025-01-15')`, [org, ITEMS]);
  const [{ id }] = await q(`select id from public.site_projects where org_id = $1 and year = 2025 and kind = 'isletme'`, [org]);
  expect((await proj(id)).status).toBe('yapim');
  await as(ID.L);
  expect((await q(`select status from public.site_projects where id = $1`, [id]))[0].status).toBe('yapim');       // sakin görür
});
