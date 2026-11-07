// Ödeyen kuralı ve yönetici bildirim ayarları (migration odeyen_ve_bildirim_ayarlari): seçilen rolde hesabı bağlı kimse yoksa
// diğer rol öder (hatırlatma ve sakinin ekranı aynı sonucu verir); dekont ve talep bildirimi ayarla kapanır; haftalık gecikme özeti.
import { test, expect } from '@playwright/test';
import { newDb, ID } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000d2';   // site yöneticisi (master)
let db, as, q, org, u1, u2;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'yonetim@dalyan.com', '{"name":"Yönetim","role":"team"}')`, [M]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Dalyan Sitesi', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'yonetim@dalyan.com')`, [org]);
  await as(M);
  [{ id: u1 }] = await q(`insert into public.site_units (org_id, block, no, area, payer) values ($1, 'A', '1', 100, 'kiraci') returning id`, [org]);
  [{ id: u2 }] = await q(`insert into public.site_units (org_id, block, no, area, payer) values ($1, 'A', '2', 100, 'kiraci') returning id`, [org]);
  // A1: yalnız malik (L) oturuyor, kiracı yok. A2: malik X ve kiracı T, ikisinin de hesabı bağlı.
  const res = async (unit, role, uid) => {
    await as(M);
    const [{ code }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, $3, 'K') returning code`, [org, unit, role]);
    await as(uid); await q(`select public.accept_site_invite($1)`, [code]);
  };
  await res(u1, 'malik', ID.L);
  await res(u2, 'malik', ID.X);
  await res(u2, 'kiraci', ID.T);
  await as(M);
  for (const u of [u1, u2]) await q(`insert into public.site_charges (org_id, unit_id, month, kind, amount, due_on) values ($1, $2, '2026-10', 'aidat', 1500, '2026-10-10')`, [org, u]);
});

const mine = async (uid) => { await as(uid); return (await q(`select public.my_site_units() u`))[0].u[0]; };

test('kiracı öder seçili ama kiracı yok: malik öder (ekran bilgisi ve hatırlatma aynı)', async () => {
  expect(await mine(ID.L)).toMatchObject({ payer: 'kiraci', payer_effective: 'malik', pays: true, role: 'malik' });
  expect(await mine(ID.X)).toMatchObject({ payer: 'kiraci', payer_effective: 'kiraci', pays: false });
  expect(await mine(ID.T)).toMatchObject({ payer_effective: 'kiraci', pays: true });
  await as(null);
  await q(`select public.site_reminders('2026-10-15')`);                       // son günden 5 gün sonra: "gecikti"
  const got = await q(`select user_id from public.notifications where tag like 'aidat-late-%' order by 1`);
  expect(got.map((r) => r.user_id).sort()).toEqual([ID.L, ID.T].sort());          // A1'de malik, A2'de kiracı; X almaz
});

test('malik dekont gönderebilir; yöneticiye "dekont geldi" gider, ayarı kapatınca gitmez', async () => {
  await as(ID.L);
  const [{ id }] = await q(`select id from public.site_charges where unit_id = $1`, [u1]);
  await q(`update public.site_charges set status = 'review', paid_amount = 1500, paid_on = '2026-10-16' where id = $1`, [id]);
  await as(null);
  expect((await q(`select count(*)::int n from public.notifications where user_id = $1 and title like '%dekont geldi'`, [M]))[0].n).toBe(1);
  await db.query(`update public.profiles set settings = settings || '{"siteReceipt":false,"siteRequest":false}' where id = $1`, [M]);
  const [{ id: id2 }] = await q(`select id from public.site_charges where unit_id = $1`, [u2]);
  await as(ID.T);
  await q(`update public.site_charges set status = 'review', paid_amount = 1500 where id = $1`, [id2]);
  await q(`insert into public.site_requests (org_id, unit_id, title, cat) values ($1, $2, 'Asansör', 'ariza')`, [org, u2]);
  await as(null);
  expect((await q(`select count(*)::int n from public.notifications where user_id = $1 and title like '%dekont geldi'`, [M]))[0].n).toBe(1);
  expect((await q(`select count(*)::int n from public.notifications where user_id = $1 and title like '%yeni talep'`, [M]))[0].n).toBe(0);
  await db.query(`update public.profiles set settings = settings - 'siteRequest' where id = $1`, [M]);
  await as(ID.T);
  await q(`insert into public.site_requests (org_id, unit_id, title, cat) values ($1, $2, 'Su', 'ariza')`, [org, u2]);
  await as(null);
  expect((await q(`select count(*)::int n from public.notifications where user_id = $1 and title like '%yeni talep'`, [M]))[0].n).toBe(1);
});

test('haftalık gecikme özeti: yalnız gecikme varsa, kurum başına tek bildirim; aynı hafta iki kez yazılmaz; ayarla kapanır', async () => {
  await as(null);
  await db.query(`update public.site_charges set status = 'open', paid_amount = 0 where org_id = $1`, [org]);
  expect(await q(`select public.site_late_digest('2026-10-14') n`)).toEqual([{ n: 0 }]);          // 4 gün: henüz değil
  expect(await q(`select public.site_late_digest('2026-10-19') n`)).toEqual([{ n: 1 }]);
  const [n] = await q(`select title, body, url from public.notifications where user_id = $1 and tag like 'site-late-%'`, [M]);
  expect(n.title).toBe('Aidatı geciken daireler');
  expect(n.body).toMatch(/^Dalyan Sitesi: 2 daire geç ödedi, toplam ₺3\.000/);
  expect(n.url).toBe('/uygulama/site/tahakkuk');
  expect(await q(`select public.site_late_digest('2026-10-20') n`)).toEqual([{ n: 0 }]);          // aynı hafta
  await db.query(`update public.site_charges set status = 'paid', paid_amount = amount where org_id = $1`, [org]);
  expect(await q(`select public.site_late_digest('2026-10-26') n`)).toEqual([{ n: 0 }]);          // gecikme yok
  await db.query(`update public.site_charges set status = 'open', paid_amount = 0 where org_id = $1`, [org]);
  await db.query(`update public.profiles set settings = settings || '{"siteLate":false}' where id = $1`, [M]);
  expect(await q(`select public.site_late_digest('2026-11-02') n`)).toEqual([{ n: 0 }]);
});
