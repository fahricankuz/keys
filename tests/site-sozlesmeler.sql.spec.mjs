// Hizmet ve tedarikçi sözleşmeleri (migration site_sozlesmeler): yetki, kurallar ve bitiş hatırlatması. Gerçek Postgres'te (PGlite).
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000d4';   // site yönetimi (master)
let db, as, q, org;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'yonetim@papatya.com', '{"name":"Papatya Sitesi","role":"team"}')`, [M]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Papatya Sitesi', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'yonetim@papatya.com')`, [org]);
});

test('yönetim sözleşme ekler; kurallar denetlenir; kurum dışı kişi göremez ve yazamaz', async () => {
  await as(M);
  await q(`insert into public.site_contracts (org_id, kind, vendor, ends_on, amount) values ($1, 'asansor', 'Yükselen Asansör', '2026-12-19', 24000)`, [org]);
  expect(await tryCall(db, `insert into public.site_contracts (org_id, vendor, starts_on, ends_on) values ($1, 'X', '2027-01-02', '2027-01-01')`, [org])).toMatch(/check/);
  expect(await tryCall(db, `insert into public.site_contracts (org_id, vendor, ends_on, remind_days) values ($1, 'X', '2027-01-01', '{0}')`, [org])).toMatch(/check/);
  expect(await tryCall(db, `insert into public.site_contracts (org_id, vendor, ends_on, kind) values ($1, 'X', '2027-01-01', 'roket')`, [org])).toMatch(/check/);
  const [{ remind_days }] = await q(`select remind_days from public.site_contracts where org_id = $1`, [org]);
  expect(remind_days).toEqual([30, 15, 7]);
  await as(ID.T);
  expect((await q(`select id from public.site_contracts where org_id = $1`, [org])).length).toBe(0);
  expect(await tryCall(db, `insert into public.site_contracts (org_id, vendor, ends_on) values ($1, 'Sahte', '2027-01-01')`, [org])).toMatch(/row-level security/);
});

test('hatırlatma: bitişe 30 gün kala yöneticiye bildirim; aynı gün ikinci çalıştırma tekrar etmez; uzatılınca yeni tarihe göre kurulur', async () => {
  await as(null);
  const run = async (day) => (await q(`select public.site_contract_reminders($1::date) n`, [day]))[0].n;
  expect(await run('2026-11-18')).toBe(0);                 // 31 gün: hatırlatma günü değil
  expect(await run('2026-11-19')).toBe(1);                 // 30 gün
  expect(await run('2026-11-19')).toBe(0);                 // tekrar yok
  const [n] = await q(`select user_id, title, url from public.notifications where tag like 'contract-%' order by created_at desc limit 1`);
  expect(n).toMatchObject({ user_id: M, url: '/uygulama/site/sozlesmeler' });
  expect(n.title).toBe('Yükselen Asansör: sözleşme 30 gün sonra bitiyor');
  await q(`update public.site_contracts set ends_on = '2027-12-19' where org_id = $1`, [org]);
  expect(await run('2026-12-12')).toBe(0);                 // eski bitişe göre 7 gün: artık değil
  expect(await run('2027-11-19')).toBe(1);                 // yeni bitişe 30 gün
  // Askıdaki kurumda hatırlatma gitmez.
  await q(`update public.organizations set status = 'paused' where id = $1`, [org]);
  expect(await run('2027-12-04')).toBe(0);
});
