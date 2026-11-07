// Depozito ve ticari portföyde otomatik kira (migration depozito_otomatik_kira): kiracı kendi depozitosunu görür; teminat mektubu
// bitişine 30 ve 7 gün kala yöneticiye bildirim; AVM'de kiracısı olan ve sözleşmesi süren birime kira ve ortak gider kendiliğinden,
// KDV ve döviz kuruyla; kur yoksa yazılmaz ve ay kapanmaz; elle yazılmış ay ikinci kez yazılmaz.
import { test, expect } from '@playwright/test';
import { newDb, ID, tryCall } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000d3';
let db, as, q, org, u1, u2, u3, u4;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'yonetim@kordon.com', '{"name":"AVM","role":"team"}')`, [M]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Kordon AVM', sector: 'avm' }]);
  await q(`select public.admin_org_set_master($1, 'yonetim@kordon.com')`, [org]);
  await as(null);
  await db.exec(`insert into public.fx_rates (day, currency, sell) values ('2026-11-02', 'USD', 42)`);
  await as(M);
  // u1: dolar kira, KDV'li, kiracılı, sözleşme sürüyor. u2: TL kira, stopajlı, kiracılı, ortak gider 5.000.
  // u3: kiracı yok. u4: sözleşmesi bitmiş.
  [{ id: u1 }] = await q(`insert into public.site_units (org_id, no, area, rent, currency, vat, due_day, lease_start, lease_end) values ($1, 'Z-1', 100, 1000, 'USD', true, 5, '2025-01-01', '2028-12-31') returning id`, [org]);
  [{ id: u2 }] = await q(`insert into public.site_units (org_id, no, area, rent, currency, stopaj, aidat, lease_end) values ($1, 'Z-2', 100, 50000, 'TRY', true, 5000, '2027-06-30') returning id`, [org]);
  [{ id: u3 }] = await q(`insert into public.site_units (org_id, no, area, rent, currency) values ($1, 'Z-3', 100, 30000, 'TRY') returning id`, [org]);
  [{ id: u4 }] = await q(`insert into public.site_units (org_id, no, area, rent, currency, lease_end) values ($1, 'Z-4', 100, 30000, 'TRY', '2026-10-31') returning id`, [org]);
  for (const u of [u1, u2, u4]) await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'kiraci', 'Kiracı')`, [org, u]);
  await q(`insert into public.site_auto (org_id, enabled, run_day, due_day) values ($1, true, 1, 10)`, [org]);
});

const charges = () => q(`select u.no, c.kind, c.amount::text, c.currency, c.fx::text, c.orig_amount::text, c.due_on::text from public.site_charges c join public.site_units u on u.id = c.unit_id where c.month = '2026-11' order by u.no, c.kind`);

test('otomatik kira: kiracılı ve sözleşmesi süren birime; KDV, stopaj ve döviz kuru; ortak gider; vade sözleşmedeki gün', async () => {
  await as(null);
  expect((await q(`select public.site_auto_run('2026-11-02') n`))[0].n).toBe(3);
  expect(await charges()).toEqual([
    { no: 'Z-1', kind: 'kira', amount: '50400.00', currency: 'USD', fx: '42.0000', orig_amount: '1000', due_on: '2026-11-05' },   // 1.000 × 42 × 1,20
    { no: 'Z-2', kind: 'kira', amount: '40000.00', currency: 'TRY', fx: null, orig_amount: null, due_on: null },                // 50.000 × 0,80
    { no: 'Z-2', kind: 'ortak_gider', amount: '5000', currency: 'TRY', fx: null, orig_amount: null, due_on: null }
  ]);
  expect((await q(`select last_month from public.site_auto where org_id = $1`, [org]))[0].last_month).toBe('2026-11');
  expect((await q(`select public.site_auto_run('2026-11-03') n`))[0].n).toBe(0);              // aynı ay ikinci kez yazılmaz
});

test('kur yoksa dövizli birim yazılmaz, ay kapanmaz, kur gelince eksik yazılır; elle yazılmış kayıt tekrar yazılmaz', async () => {
  await as(null);
  await db.query(`update public.site_auto set last_month = '2026-11' where org_id = $1`, [org]);
  await as(M);
  await q(`insert into public.site_charges (org_id, unit_id, month, kind, amount) values ($1, $2, '2026-12', 'kira', 39000)`, [org, u2]);   // elle
  await as(null);
  await db.exec(`delete from public.fx_rates`);
  expect((await q(`select public.site_auto_run('2026-12-01') n`))[0].n).toBe(1);              // yalnız Z-2 ortak gider (kira elle yazılmış)
  expect((await q(`select last_month from public.site_auto where org_id = $1`, [org]))[0].last_month).toBe('2026-11');   // kapanmadı
  await db.exec(`insert into public.fx_rates (day, currency, sell) values ('2026-12-02', 'USD', 43)`);
  expect((await q(`select public.site_auto_run('2026-12-02') n`))[0].n).toBe(1);              // Z-1 dolar kirası
  expect((await q(`select kind, amount::text from public.site_charges where unit_id = $1 and month = '2026-12' order by kind`, [u2]))).toEqual([{ kind: 'kira', amount: '39000' }, { kind: 'ortak_gider', amount: '5000' }]);
  expect((await q(`select last_month from public.site_auto where org_id = $1`, [org]))[0].last_month).toBe('2026-12');
});

test('depozito: yönetim girer, kiracı kendi depozitosunu görür; hatalı tür ve para birimi reddedilir', async () => {
  await as(M);
  await q(`update public.site_units set deposit_amount = 3000, deposit_currency = 'USD', deposit_kind = 'teminat', deposit_on = '2025-01-01',
           deposit_bank = 'Garanti BBVA', deposit_until = '2026-12-31' where id = $1`, [u1]);
  expect(await tryCall(db, `update public.site_units set deposit_kind = 'cek' where id = $1`, [u1])).toMatch(/check/);
  expect(await tryCall(db, `update public.site_units set deposit_currency = 'GBP' where id = $1`, [u1])).toMatch(/check/);
  const [{ code }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'kiraci', 'Moda Giyim') returning code`, [org, u1]);
  await as(ID.T);
  await q(`select public.accept_site_invite($1)`, [code]);
  const [{ u }] = await q(`select public.my_site_units() u`);
  expect(u.find((x) => x.unit_id === u1).deposit).toMatchObject({ amount: 3000, currency: 'USD', kind: 'teminat', bank: 'Garanti BBVA', until: '2026-12-31', returned_on: null });
  expect(await tryCall(db, `update public.site_units set deposit_amount = 1 where id = $1`, [u1])).toBe(null);
  await as(null);
  expect((await q(`select deposit_amount::text a from public.site_units where id = $1`, [u1]))[0].a).toBe('3000');   // kiracı değiştiremez
});

test('teminat mektubu: bitişe 30 ve 7 gün kala yöneticiye bildirim; iade edilince ya da başka günde yok', async () => {
  await as(null);
  await q(`select public.site_reminders('2026-12-01')`);                  // 30 gün kala
  await q(`select public.site_reminders('2026-12-24')`);                  // 7 gün kala
  await q(`select public.site_reminders('2026-12-10')`);                  // başka gün
  const n = await q(`select title from public.notifications where user_id = $1 and tag like 'deposit-%' order by created_at`, [M]);
  expect(n.map((x) => x.title)).toEqual(['Z-1: teminat mektubu 30 gün sonra bitiyor', 'Z-1: teminat mektubu 7 gün sonra bitiyor']);
  await db.query(`update public.site_units set deposit_returned_on = '2026-12-20', deposit_returned = 2500, deposit_cut_reason = 'Boya' where id = $1`, [u1]);
  await db.query(`delete from public.notifications where tag like 'deposit-%'`);
  await q(`select public.site_reminders('2026-12-24')`);
  expect((await q(`select count(*)::int n from public.notifications where tag like 'deposit-%'`))[0].n).toBe(0);
});
