// Site yönetimi (kurumsal yol planı Faz 2): daireler, malik ve kiracılar, tahakkuk ve dekont onayı, duyuru,
// talep ve gider; yönetim kurum rolleriyle, sakin dairesindeki kaydıyla erişir. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000c1';   // site müdürü (master)
const Y = '00000000-0000-0000-0000-0000000000c2';   // muhasebe
const MONTH = '2026-11';

let db, as, q, org, a1, a2, codeT, codeL;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'mudur@atakum.com', '{"name":"Site Müdürü","role":"team"}'),
                  ($2, 'muhasebe@atakum.com', '{"name":"Muhasebeci","role":"team"}')`, [M, Y]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Atakum Sitesi', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'mudur@atakum.com')`, [org]);
  const [{ id: acc }] = await q(`select id from public.org_roles where org_id = $1 and name = 'Muhasebe'`, [org]);
  const [{ org_invite_create: c }] = await q(`select public.org_invite_create($1, $2)`, [org, acc]);
  await as(Y);
  await q(`select public.accept_org_invite($1)`, [c]);
});

test('yönetim daire ve sakin ekler; davet koduyla kiracı ve malik dairesine bağlanır', async () => {
  await as(M);
  [{ id: a1 }] = await q(`insert into public.site_units (org_id, block, no, area, share, aidat) values ($1, 'A', '1', 120, 2, 1500) returning id`, [org]);
  [{ id: a2 }] = await q(`insert into public.site_units (org_id, block, no, area, share, aidat, payer) values ($1, 'A', '2', 80, 1, 1000, 'malik') returning id`, [org]);
  [{ code: codeT }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'kiraci', 'Kiracı') returning code`, [org, a1]);
  [{ code: codeL }] = await q(`insert into public.site_residents (org_id, unit_id, role, name, lives_here) values ($1, $2, 'malik', 'Ev Sahibi', false) returning code`, [org, a1]);
  expect(codeT).toMatch(/^S[0-9A-F]{7}$/);
  // Yetkisi olmayan (muhasebe) daire ekleyemez; kurum dışı hiç göremez.
  await as(Y);
  expect(await tryCall(db, `insert into public.site_units (org_id, no) values ($1, '9')`, [org])).toMatch(/row-level security/);
  await as(ID.X);
  expect(await q(`select id from public.site_units`)).toEqual([]);

  await as(ID.T);
  await q(`select public.accept_site_invite($1)`, [codeT.toLowerCase()]);
  await as(ID.L);
  await q(`select public.accept_site_invite($1)`, [codeL]);
  expect(await tryCall(db, `select public.accept_site_invite($1)`, [codeT])).toMatch(/kullanılmış/);
  await as(ID.T);
  const [{ u }] = await q(`select public.my_site_units() u`);
  expect(u).toEqual([expect.objectContaining({ org: 'Atakum Sitesi', block: 'A', no: '1', role: 'kiraci', payer: 'kiraci' })]);
  // Kiracı yalnız kendi dairesini görür.
  expect((await q(`select no from public.site_units`)).map(r => r.no)).toEqual(['1']);
});

test('aidat tahakkuku: kiracı dekontla onaya gönderir; malik görür; muhasebe onaylar, bildirimler gider', async () => {
  await as(M);
  await q(`insert into public.site_charges (org_id, unit_id, month, kind, amount) values ($1, $2, $3, 'aidat', 1500), ($1, $4, $3, 'aidat', 1000)`, [org, a1, MONTH, a2]);
  await as(ID.T);
  const [{ id: ch }] = await q(`select id from public.site_charges where unit_id = $1`, [a1]);
  expect((await q(`select count(*)::int c from public.site_charges`))[0].c).toBe(1);
  expect(await tryCall(db, `update public.site_charges set status = 'paid' where id = $1`, [ch])).toMatch(/yalnızca yönetim onaylayabilir/);
  expect(await tryCall(db, `update public.site_charges set amount = 1 where id = $1`, [ch])).toMatch(/yalnızca yönetim değiştirebilir/);
  await q(`update public.site_charges set status = 'review', paid_amount = 1500, paid_on = '2026-11-03', receipt_name = 'aidat.png', receipt_path = $2 where id = $1`,
    [ch, `site-${org}/aidat.png`]);
  // Malik dairesinin aidat durumunu kendiliğinden görür.
  await as(ID.L);
  expect(await q(`select status from public.site_charges`)).toEqual([{ status: 'review' }]);
  await as(null);
  expect((await q(`select title from public.notifications where user_id = $1`, [Y])).map(r => r.title)).toContain('A Blok No 1: dekont geldi');
  await as(Y);
  await q(`update public.site_charges set status = 'paid' where id = $1`, [ch]);
  await as(null);
  expect((await q(`select title from public.notifications where user_id = $1 and title = 'Ödemen onaylandı'`, [ID.T])).length).toBe(1);
  await as(ID.T);
  expect(await tryCall(db, `update public.site_charges set status = 'review', paid_amount = 1 where id = $1`, [ch])).toMatch(/Ödenmiş tahakkuk/);
});

test('duyuru sakinlere bildirilir; talep yönetime gider, yanıt sakine döner; giderleri sakin göremez', async () => {
  await as(M);
  await q(`insert into public.site_announcements (org_id, title, body) values ($1, 'Su kesintisi', 'Yarın 10-14 arası su kesilecek.')`, [org]);
  await as(null);
  for (const u of [ID.T, ID.L]) expect((await q(`select title from public.notifications where user_id = $1 and title like 'Duyuru:%'`, [u])).length).toBe(1);
  await as(ID.X);
  expect(await q(`select id from public.site_announcements`)).toEqual([]);
  expect(await tryCall(db, `insert into public.site_requests (org_id, title) values ($1, 'Sahte')`, [org])).toMatch(/row-level security/);

  await as(ID.T);
  const [{ id: rq }] = await q(`insert into public.site_requests (org_id, unit_id, cat, title, body) values ($1, $2, 'aidat', 'Aidatı malik ödesin', 'Sözleşmeye göre aidat ev sahibinde.') returning id`, [org, a1]);
  expect(await tryCall(db, `update public.site_requests set status = 3 where id = $1`, [rq])).toBeNull();   // RLS: etkisiz
  await as(M);
  expect((await q(`select status from public.site_requests where id = $1`, [rq]))[0].status).toBe(0);
  await q(`update public.site_requests set status = 3, reply = 'Daire için aidatı malik ödeyecek şekilde güncelledik.' where id = $1`, [rq]);
  await q(`update public.site_units set payer = 'malik' where id = $1`, [a1]);
  await as(null);
  expect((await q(`select title from public.notifications where user_id = $1 and title = 'Talebin güncellendi'`, [ID.T])).length).toBe(1);

  await as(Y);
  await q(`insert into public.site_expenses (org_id, cat, amount, note) values ($1, 'Asansör bakımı', 4500, 'Kasım')`, [org]);
  await as(ID.T);
  expect(await q(`select id from public.site_expenses`)).toEqual([]);
});

test('dosya klasörü: yönetim ve sakin site klasörüne erişir, yabancı erişemez', async () => {
  for (const [who, ok] of [[M, true], [ID.T, true], [ID.X, false]]) {
    await as(who);
    expect((await q(`select public.site_folder_ok($1) ok`, ['site-' + org]))[0].ok).toBe(ok);
  }
  await as(ID.T);
  expect((await q(`select public.site_folder_ok('site-../p1') ok`))[0].ok).toBe(false);
});

/* ---------------- Faz 2 tamamlayıcıları: mülk–daire bağı, hatırlatma, bütçe, rapor ---------------- */

test('ev sahibi mülkünü dairesine bağlar; bağlı mülkün kiracısı daireyi görür, öder, talep açar', async () => {
  // Önce kiracının doğrudan kaydı kaldırılır: erişimi yalnız ev sahibinin bağlantısından gelsin.
  await as(M);
  await q(`delete from public.site_residents where role = 'kiraci'`);
  await as(ID.T);
  expect(await q(`select id from public.site_charges`)).toEqual([]);
  // Malik olmayan bağlayamaz; doğrudan güncelleme de engellenir.
  await as(ID.L2);
  expect(await tryCall(db, `select public.link_site_unit('p2', $1)`, [a1])).toMatch(/maliki olarak kayıtlı değilsin/);
  expect(await tryCall(db, `update public.properties set site_unit_id = $1 where id = 'p2'`, [a1])).toMatch(/maliki olarak kayıtlı değilsin/);
  await as(ID.L);
  await q(`select public.link_site_unit('p1', $1)`, [a1]);
  await as(ID.T);
  const [{ u }] = await q(`select public.my_site_units() u`);
  expect(u).toEqual([expect.objectContaining({ no: '1', role: 'kiraci', property_id: 'p1' })]);
  expect((await q(`select count(*)::int c from public.site_charges`))[0].c).toBe(1);
  await q(`insert into public.site_requests (org_id, unit_id, title) values ($1, $2, 'Kapı zili bozuk')`, [org, a1]);
  await as(M);
  expect((await q(`select name from public.site_linked_tenants($1)`, [org])).map(r => r.name)).toEqual(['Kiracı']);
  await as(ID.X);
  expect(await q(`select * from public.site_linked_tenants($1)`, [org])).toEqual([]);
});

test('aidat hatırlatması ödeyene gider (kiracı yoksa malike); aynı gün ikinci kez gitmez, ayardan kapanır', async () => {
  await as(M);
  await q(`update public.site_units set payer = 'kiraci' where id = $1`, [a1]);
  await q(`insert into public.site_charges (org_id, unit_id, month, kind, amount) values ($1, $2, '2026-12', 'aidat', 1500), ($1, $3, '2026-12', 'aidat', 1000)`, [org, a1, a2]);
  await as(null);
  const n = (await q(`select public.site_reminders('2026-12-28') n`))[0].n;
  expect(n).toBe(1);   // A1: kiracı (bağlı mülkten); A2: kayıtlı kimse yok → kimseye gitmez
  const rows = await q(`select user_id, title, body, tag from public.notifications where tag like 'aidat-%'`);
  expect(rows).toEqual([expect.objectContaining({ user_id: ID.T, title: 'A Blok No 1: aidat günü yaklaşıyor', tag: expect.stringMatching(/^aidat-soon-/) })]);
  expect(rows[0].body).toMatch(/12\.2026 aidatı ₺1\.500, son gün 31\.12\.2026/);
  expect((await q(`select public.site_reminders('2026-12-28') n`))[0].n).toBe(0);
  // Aidatı malik öderse malike gider; kullanıcı kapattıysa gitmez.
  await db.exec(`update public.site_units set payer = 'malik' where id = '${a1}'`);
  expect((await q(`select public.site_reminders('2027-01-05') n`))[0].n).toBe(1);
  expect((await q(`select user_id from public.notifications where tag like 'aidat-late-%'`)).map(r => r.user_id)).toEqual([ID.L]);
  await db.exec(`update public.profiles set settings = settings || '{"remindAidat": false}' where id = '${ID.L}'`);
  expect((await q(`select public.site_reminders('2027-01-15') n`))[0].n).toBe(0);
});

test('işletme projesi: yönetim yazar, malik ve kiracı okur; yetkisiz yazamaz', async () => {
  await as(M);
  await q(`insert into public.site_budgets (org_id, year, items) values ($1, 2026, $2)`, [org, JSON.stringify([{ cat: 'Asansör bakımı', amount: 48000 }, { cat: 'Temizlik', amount: 72000 }])]);
  await as(ID.L);
  expect((await q(`select year from public.site_budgets`)).map(r => r.year)).toEqual([2026]);
  expect(await tryCall(db, `update public.site_budgets set note = 'x' where org_id = $1 returning 1`, [org])).toBeNull();
  expect((await q(`select note from public.site_budgets`))[0].note).toBe('');
  await as(ID.X);
  expect(await q(`select year from public.site_budgets`)).toEqual([]);
});

test('yönetim kurulu raporu: tahakkuk/tahsilat, giderler, bütçe, borçlular; yetkisiz okuyamaz', async () => {
  await as(Y);   // muhasebe: Raporlar yetkisi var
  const [{ r }] = await q(`select public.site_report($1, 'year', '2026-06-01') r`, [org]);
  expect(r.org).toBe('Atakum Sitesi');
  expect(r.units).toBe(2);
  const aidat = r.charges.find(x => x.kind === 'aidat');
  expect(Number(aidat.charged)).toBe(5000);       // 1500 + 1000 (Kasım) + 1500 + 1000 (Aralık)
  expect(Number(aidat.collected)).toBe(1500);
  expect(r.expenses).toEqual([{ cat: 'Asansör bakımı', total: 4500 }]);
  expect(Number(r.budget.total)).toBe(120000);
  expect(r.requests.opened).toBe(2);
  await as(ID.T);
  expect(await tryCall(db, `select public.site_report($1, 'month', '2026-11-01')`, [org])).toMatch(/Rapor yetkin yok/);
  await as(null);
  expect((await q(`select email from public.site_report_recipients()`)).map(r => r.email).sort()).toEqual(['mudur@atakum.com', 'muhasebe@atakum.com']);
});
