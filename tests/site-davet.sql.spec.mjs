// Site daveti ve otomatik aidat (schema.sql 29. bölüm): davet bilgisi kodu bilene açılır, kullanılmış kodda kişisel bilgi
// dönmez; davet e-postasının içeriğini yalnız yetkili yönetici alır; otomatik aidat ayın gününde bir kez tahakkuk eder.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000d1';   // site müdürü (master)
let db, as, q, org, u1, u2, villa, rid, code;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'mudur@dalyan.com', '{"name":"Site Müdürü","role":"team"}')`, [M]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Dalyan Sitesi', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'mudur@dalyan.com')`, [org]);
  await as(M);
  [{ id: u1 }] = await q(`insert into public.site_units (org_id, block, no, area, aidat) values ($1, 'A', '1', 100, 1500) returning id`, [org]);
  [{ id: u2 }] = await q(`insert into public.site_units (org_id, block, no, area) values ($1, 'A', '2', 90) returning id`, [org]);
  [{ id: villa }] = await q(`insert into public.site_units (org_id, block, no, area, aidat) values ($1, '', 'Villa 3', 250, 4000) returning id`, [org]);
  [{ id: rid, code }] = await q(`insert into public.site_residents (org_id, unit_id, role, name, phone, email) values ($1, $2, 'kiraci', 'Ayşe Kiracı', '05321112233', 'ayse@ornek.com') returning id, code`, [org, u1]);
});

test('davet bilgisi: oturumsuz kodla ad, telefon ve e-posta; kullanılınca kişisel bilgi yok; villada "No" yok', async () => {
  await as(null, true);
  const [{ i }] = await q(`select public.site_invite_info($1) i`, [code.toLowerCase()]);
  expect(i).toMatchObject({ org: 'Dalyan Sitesi', unit: 'A Blok No 1', role: 'kiraci', name: 'Ayşe Kiracı', phone: '05321112233', email: 'ayse@ornek.com', used: false });
  expect((await q(`select public.site_invite_info('SXXXXXXX') i`))[0].i).toBeNull();
  await as(null);
  expect((await q(`select public.unit_label($1) v`, [villa]))[0].v).toBe('Villa 3');
  await as(ID.T);
  await q(`select public.accept_site_invite($1)`, [code]);
  await as(null, true);
  const [{ i: used }] = await q(`select public.site_invite_info($1) i`, [code]);
  expect(used).toEqual({ org: 'Dalyan Sitesi', unit: 'A Blok No 1', used: true });
});

test('davet e-postası içeriği yalnız yetkili yöneticiye; katılmış kişiye ve e-postasıza gönderilmez', async () => {
  await as(M);
  const [{ id: r2 }] = await q(`insert into public.site_residents (org_id, unit_id, role, name, email) values ($1, $2, 'malik', 'Mehmet Malik', 'mehmet@ornek.com') returning id`, [org, u2]);
  const [{ m }] = await q(`select public.site_invite_mail($1) m`, [r2]);
  expect(m).toMatchObject({ email: 'mehmet@ornek.com', name: 'Mehmet Malik', org: 'Dalyan Sitesi', unit: 'A Blok No 2', role: 'malik', by: 'Site Müdürü' });
  expect((await q(`select invited_at from public.site_residents where id = $1`, [r2]))[0].invited_at).not.toBeNull();
  expect(await tryCall(db, `select public.site_invite_mail($1)`, [rid])).toMatch(/zaten katıldı/);
  const [{ id: r3 }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'kiraci', 'E-postasız') returning id`, [org, u2]);
  expect(await tryCall(db, `select public.site_invite_mail($1)`, [r3])).toMatch(/E-posta adresi yok/);
  await as(ID.X);
  expect(await tryCall(db, `select public.site_invite_mail($1)`, [r2])).toMatch(/Davet yetkin yok/);
});

test('otomatik aidat: yalnız yönetim ayarlar; günü gelince aidatı olan dairelere bir kez tahakkuk eder', async () => {
  await as(ID.X);
  expect(await tryCall(db, `insert into public.site_auto (org_id, enabled) values ($1, true)`, [org])).toMatch(/row-level security/);
  await as(M);
  await q(`insert into public.site_auto (org_id, enabled, run_day, due_day, start_month) values ($1, true, 5, 3, '2026-11')`, [org]);
  expect(await tryCall(db, `select public.site_auto_run('2026-11-05')`)).toMatch(/permission denied/);
  await as(null);
  expect((await q(`select public.site_auto_run('2026-10-20') n`))[0].n).toBe(0);    // başlangıç ayından önce
  expect((await q(`select public.site_auto_run('2026-11-04') n`))[0].n).toBe(0);    // günü gelmedi
  expect((await q(`select public.site_auto_run('2026-11-05') n`))[0].n).toBe(2);    // aidatı olan iki daire (A1, villa)
  expect((await q(`select public.site_auto_run('2026-11-06') n`))[0].n).toBe(0);    // aynı ay ikinci kez yok
  const rows = await q(`select unit_id, amount::float a, due_on::text d from public.site_charges where org_id = $1 and month = '2026-11' order by a`, [org]);
  expect(rows).toEqual([{ unit_id: u1, a: 1500, d: '2026-12-03' }, { unit_id: villa, a: 4000, d: '2026-12-03' }]);  // vade günü tahakkuk gününden önce: sonraki ay
  expect((await q(`select public.site_auto_run('2026-12-28') n`))[0].n).toBe(2);    // kaçırılan gün sonradan yakalanır
  await as(M);
  await q(`update public.site_auto set enabled = false where org_id = $1`, [org]);
  await as(null);
  expect((await q(`select public.site_auto_run('2027-01-10') n`))[0].n).toBe(0);
});
