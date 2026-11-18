// Blok toplu yeniden adlandırma ve "Blok" tekrarı (migration blok_adi_tekrari). Gerçek Postgres'te (PGlite) sınanır.
// Yeniden adlandırma istemcide tek sorgudur: update site_units set block = yeni where org_id = … and block = eski (RLS: su_write).
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000b7';   // site yönetimi (master)
let db, as, q, org, other;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'yonetim@gulsite.com', '{"name":"Gül Sitesi","role":"team"}')`, [M]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Gül Sitesi', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'yonetim@gulsite.com')`, [org]);
  [{ admin_org_save: other }] = await q(`select public.admin_org_save($1)`, [{ name: 'Başka Site', sector: 'site' }]);
});

const label = async (id) => { await as(null); const [{ l }] = await q(`select public.unit_label($1) l`, [id]); return l; };

test('etiket: "A" → "A Blok No 1"; adı zaten Blok/Bloğu ile bitiyorsa tekrar eklenmez', async () => {
  await as(M);
  const ins = async (block, no) => (await q(`insert into public.site_units (org_id, block, no, area) values ($1, $2, $3, 100) returning id`, [org, block, no]))[0].id;
  expect(await label(await ins('A', '1'))).toBe('A Blok No 1');
  await as(M); expect(await label(await ins('B Blok', '2'))).toBe('B Blok No 2');
  await as(M); expect(await label(await ins('C BLOK', '3'))).toBe('C BLOK No 3');
  await as(M); expect(await label(await ins('Gül Bloğu', '4'))).toBe('Gül Bloğu No 4');
  await as(M); expect(await label(await ins('Ablok', '5'))).toBe('Ablok Blok No 5');   // kelimenin parçası sayılmaz
  await as(M); expect(await label(await ins('', '6'))).toBe('No 6');
});

test('yeniden adlandırma: bloğun bütün daireleri tek sorguda güncellenir, başka blok ve kurum etkilenmez', async () => {
  await as(M);
  await q(`insert into public.site_units (org_id, block, no, area) values ($1, 'A', '2', 100), ($1, 'A', '3', 100)`, [org]);
  const n = await q(`update public.site_units set block = 'A Blok' where org_id = $1 and block = 'A' returning id`, [org]);
  expect(n.length).toBe(3);
  const rows = await q(`select block, count(*)::int c from public.site_units where org_id = $1 group by block order by block`, [org]);
  expect(rows.find((r) => r.block === 'A Blok').c).toBe(3);
  expect(rows.find((r) => r.block === 'A')).toBeUndefined();
  expect(rows.find((r) => r.block === 'B Blok').c).toBe(1);
  const [{ id }] = await q(`select id from public.site_units where org_id = $1 and block = 'A Blok' and no = '1'`, [org]);
  expect(await label(id)).toBe('A Blok No 1');
});

test('aynı daire numarası çakışırsa hiçbir daire değişmez; başka kurumun bloğu yeniden adlandırılamaz', async () => {
  await as(M);
  // "B Blok" içinde 2 numara var; "A Blok" → "B Blok" denemesi tekil kuralına takılır ve işlem bütünüyle geri alınır.
  expect(await tryCall(db, `update public.site_units set block = 'B Blok' where org_id = $1 and block = 'A Blok'`, [org])).toMatch(/duplicate|unique/i);
  expect((await q(`select count(*)::int c from public.site_units where org_id = $1 and block = 'A Blok'`, [org]))[0].c).toBe(3);
  await as(null);   // kurulum: başka kurumun dairesi (RLS dışı)
  await q(`insert into public.site_units (org_id, block, no, area) values ($1, 'A', '1', 100)`, [other]);
  await as(M);
  const n = await q(`update public.site_units set block = 'Z' where org_id = $1 and block = 'A' returning id`, [other]);
  expect(n.length).toBe(0);
});
