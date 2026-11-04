// Rapor e-postası alıcıları (migration rapor_alicilari): Başlangıç hariç herkes; Kurumsal'ın bütün kategorileri; boş kuruma e-posta gitmez.
import { test, expect } from '@playwright/test';
import { newDb, ID } from './db-helpers.mjs';

let db, as, q;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

const sub = (uid, product) => db.query(
  `insert into public.subscriptions (user_id, product_id, store, period_type, expires_at, active, will_renew)
   values ($1, $2, 'app_store', 'normal', now() + interval '20 days', true, true)
   on conflict (user_id) do update set product_id = excluded.product_id, active = true, expires_at = excluded.expires_at`, [uid, product]);
const gets = async (uid) => (await q(`select user_id from public.report_recipients('month')`)).some((r) => r.user_id === uid);

test('mülk sahibi: Profesyonel, Kurumsal ve deneme alır; Başlangıç ve ayarı kapatan almaz', async () => {
  await as(null);
  expect(await gets(ID.L)).toBe(true);                                 // deneme
  await sub(ID.L, 'anahtar_tek_3_aylik');
  expect((await q(`select public.access_state($1) ->> 'plan' p`, [ID.L]))[0].p).toBe('tek');
  expect(await gets(ID.L)).toBe(false);                                // Başlangıç
  await sub(ID.L, 'anahtar_bes_3_aylik');
  expect((await q(`select public.access_state($1) ->> 'plan' p`, [ID.L]))[0].p).toBe('bes');
  expect(await gets(ID.L)).toBe(true);                                 // Profesyonel
  await sub(ID.L, 'anahtar_kurumsal');
  expect(await gets(ID.L)).toBe(true);                                 // Kurumsal
  await sub(ID.L, 'anahtar_bes_3_aylik');
  await db.query(`update public.profiles set settings = settings || '{"reportMonthly":false}' where id = $1`, [ID.L]);
  expect(await gets(ID.L)).toBe(false);                                // ayarı kapattı
  await db.query(`update public.profiles set settings = settings - 'reportMonthly' where id = $1`, [ID.L]);
  expect(await gets(ID.T)).toBe(false);                                // kiracı almaz
});

test('kurum yöneticisi: bütün kategorilerde alır; birimi olmayan ve askıdaki kurumda almaz', async () => {
  await as(null);
  const sectors = ['site', 'avm', 'gyo', 'depo', 'emlak', 'family', 'diger'];
  for (const sector of sectors) {
    const [{ id }] = await q(`insert into public.organizations (name, sector, status) values ($1, $2, 'active') returning id`, ['K ' + sector, sector]);
    await db.query(`insert into public.org_members (org_id, user_id, is_master) values ($1, $2, true)`, [id, ID.X]);
    await db.query(`insert into public.site_units (org_id, no) values ($1, '1')`, [id]);
  }
  const [{ id: empty }] = await q(`insert into public.organizations (name, sector, status) values ('Boş', 'emlak', 'active') returning id`);
  await db.query(`insert into public.org_members (org_id, user_id, is_master) values ($1, $2, true)`, [empty, ID.X]);
  const [{ id: off }] = await q(`insert into public.organizations (name, sector, status) values ('Askı', 'site', 'paused') returning id`);
  await db.query(`insert into public.org_members (org_id, user_id, is_master) values ($1, $2, true)`, [off, ID.X]);
  await db.query(`insert into public.site_units (org_id, no) values ($1, '1')`, [off]);
  const rows = await q(`select o.sector, o.name from public.site_report_recipients() r join public.organizations o on o.id = r.org_id where r.user_id = $1`, [ID.X]);
  expect(rows.map((r) => r.sector).sort()).toEqual([...sectors].sort());
});
