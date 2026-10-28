// Ticari portföy (kurumsal yol planı Faz 3): AVM mağazası, döviz kirası, ciro bildirimi ve onayı, kira artış kaydı,
// sözleşmedeki ödeme gününe göre kira hatırlatması. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000d1';   // AVM yönetimi (master)
let db, as, q, org, z12, code;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'yonetim@merkezavm.com', '{"name":"AVM Yönetimi","role":"team"}')`, [M]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Merkez AVM', sector: 'avm' }]);
  await q(`select public.admin_org_set_master($1, 'yonetim@merkezavm.com')`, [org]);
});

test('mağaza sözleşmesi: döviz kirası, ciro oranı, KDV ve stopaj birlikte seçilemez; etiket "kat · no"', async () => {
  await as(M);
  [{ id: z12 }] = await q(`insert into public.site_units (org_id, block, no, area, rent, currency, turnover_rate, lease_start, lease_end, index_kind, vat, due_day)
                           values ($1, 'Zemin kat', 'Z-12', 200, 2000, 'USD', 8, '2025-11-01', '2030-10-31', 'tufe', true, 5) returning id`, [org]);
  expect(await tryCall(db, `insert into public.site_units (org_id, no, vat, stopaj) values ($1, 'X', true, true)`, [org])).toMatch(/site_units_tax_check/);
  expect(await tryCall(db, `insert into public.site_units (org_id, no, currency) values ($1, 'Y', 'GBP')`, [org])).toMatch(/site_units_currency_check/);
  await as(null);
  expect((await q(`select public.unit_label($1) l`, [z12]))[0].l).toBe('Zemin kat · Z-12');
  await as(M);
  [{ code }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'kiraci', 'Moda Giyim A.Ş.') returning code`, [org, z12]);
  await as(ID.T);
  await q(`select public.accept_site_invite($1)`, [code]);
  const [{ u }] = await q(`select public.my_site_units() u`);
  expect(u[0]).toMatchObject({ sector: 'avm', role: 'kiraci', currency: 'USD', turnover_rate: 8 });
});

test('döviz kirası tahakkuku: asıl tutar ve kur saklanır; kiracı kuru ve vadeyi değiştiremez', async () => {
  await as(M);
  const [{ id }] = await q(`insert into public.site_charges (org_id, unit_id, month, kind, amount, currency, fx, orig_amount, due_on)
                            values ($1, $2, '2026-11', 'kira', 81600, 'USD', 34, 2400, '2026-11-05') returning id`, [org, z12]);
  await as(ID.T);
  expect(await tryCall(db, `update public.site_charges set fx = 1 where id = $1`, [id])).toMatch(/yalnızca yönetim/);
  expect(await tryCall(db, `update public.site_charges set due_on = '2026-12-31' where id = $1`, [id])).toMatch(/yalnızca yönetim/);
  expect(await q(`select orig_amount::int, fx::int, currency from public.site_charges where id = $1`, [id])).toEqual([{ orig_amount: 2400, fx: 34, currency: 'USD' }]);
});

test('kira hatırlatması sözleşmedeki ödeme gününe göre: "kira günü yaklaşıyor", metinde "kirası"', async () => {
  await as(null);
  expect((await q(`select public.site_reminders('2026-11-02') n`))[0].n).toBe(1);
  const [n] = await q(`select title, body from public.notifications where user_id = $1 and tag like 'aidat-soon-%'`, [ID.T]);
  expect(n.title).toBe('Zemin kat · Z-12: kira günü yaklaşıyor');
  expect(n.body).toMatch(/11\.2026 kirası ₺81\.600, son gün 05\.11\.2026/);
});

test('ciro: kiracı bildirir, yönetime bildirim gider; onaydan sonra değiştiremez; başkası bildiremez', async () => {
  await as(ID.T);
  const [{ id }] = await q(`insert into public.site_turnovers (org_id, unit_id, month, amount) values ($1, $2, '2026-10', 1200000) returning id`, [org, z12]);
  expect(await tryCall(db, `update public.site_turnovers set status = 'approved' where id = $1`, [id])).toBeNull();
  expect((await q(`select status from public.site_turnovers where id = $1`, [id]))[0].status).toBe('reported');   // koruma geri çevirir
  await q(`update public.site_turnovers set amount = 1250000 where id = $1`, [id]);
  await as(null);
  expect((await q(`select title from public.notifications where user_id = $1 and title like '%ciro bildirildi'`, [M])).length).toBeGreaterThan(0);
  await as(M);
  await q(`update public.site_turnovers set status = 'approved' where id = $1`, [id]);
  await as(null);
  expect((await q(`select title from public.notifications where user_id = $1 and title = 'Ciro bildirimin onaylandı'`, [ID.T])).length).toBe(1);
  await as(ID.T);
  expect(await tryCall(db, `update public.site_turnovers set amount = 1 where id = $1`, [id])).toMatch(/Onaylanmış ciro/);
  await as(ID.X);
  expect(await tryCall(db, `insert into public.site_turnovers (org_id, unit_id, month, amount) values ($1, $2, '2026-09', 1)`, [org, z12])).toMatch(/row-level security/);
  expect(await q(`select id from public.site_turnovers`)).toEqual([]);
});

test('kira artış kaydı: yönetim yazar, kiracı okur, kiracı yazamaz', async () => {
  await as(M);
  await q(`insert into public.site_rent_changes (org_id, unit_id, from_date, old_amount, new_amount, currency, reason) values ($1, $2, '2026-11-01', 2000, 2400, 'USD', 'Sözleşme yıldönümü')`, [org, z12]);
  await as(ID.T);
  expect((await q(`select new_amount::int from public.site_rent_changes`))[0].new_amount).toBe(2400);
  expect(await tryCall(db, `insert into public.site_rent_changes (org_id, unit_id, from_date, new_amount) values ($1, $2, '2027-11-01', 1)`, [org, z12])).toMatch(/row-level security/);
});
