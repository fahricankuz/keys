// Havale / EFT bilgileri (migration havale_bilgileri): açıklama kodu, mülk ve kurum IBAN'ı, org_bank_save yetkisi,
// my_site_units'in sakine banka bilgisini döndürmesi. Gerçek Postgres'te (PGlite) sınanır. IBAN'lar uydurmadır (mod-97 tutarlı).
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000c3';   // site yönetimi (master)
const IBAN = 'TR420001000000000000000001';
const CODE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
let db, as, q, org, unit;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'yonetim@lalesite.com', '{"name":"Lale Sitesi","role":"team"}')`, [M]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Lale Sitesi', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'yonetim@lalesite.com')`, [org]);
});

test('açıklama kodu: mülke ve daireye kendiliğinden verilir, 6 karakter, karışan harf yok, benzersiz', async () => {
  await as(null);
  const [{ pay_code }] = await q(`select pay_code from public.properties where id = 'p1'`);
  expect(pay_code).toMatch(CODE);
  const codes = (await q(`select public.gen_pay_code() c from generate_series(1, 200)`)).map((r) => r.c);
  codes.forEach((c) => expect(c).toMatch(CODE));
  expect(new Set(codes).size).toBeGreaterThan(195);
  await as(M);
  [{ id: unit }] = await q(`insert into public.site_units (org_id, block, no, area, aidat) values ($1, 'A', '1', 100, 1500) returning id`, [org]);
  await as(null);
  expect((await q(`select pay_code from public.site_units where id = $1`, [unit]))[0].pay_code).toMatch(CODE);
  expect(await tryCall(db, `insert into public.site_units (org_id, block, no, area, pay_code) values ($1, 'A', '2', 100, (select pay_code from public.site_units where id = $2))`, [org, unit])).toMatch(/duplicate|unique/i);
});

test('mülk IBAN: yalnız sahibi yazar, biçim denetlenir; kiracı okur ama değiştiremez', async () => {
  await as(ID.L);
  expect(await tryCall(db, `update public.properties set bank_iban = 'TR12 3' where id = 'p1'`)).toMatch(/properties_bank_iban_check/);
  await q(`update public.properties set bank_iban = $1, bank_holder = 'Ev Sahibi' where id = 'p1'`, [IBAN]);
  await as(ID.T);
  expect((await q(`select bank_iban, bank_holder, pay_code from public.properties where id = 'p1'`))[0]).toMatchObject({ bank_iban: IBAN, bank_holder: 'Ev Sahibi', pay_code: expect.stringMatching(CODE) });
  expect((await q(`update public.properties set bank_iban = null where id = 'p1' returning id`)).length).toBe(0);
  await as(ID.X);
  expect((await q(`select bank_iban from public.properties where id = 'p1'`)).length).toBe(0);   // yabancı göremez
});

test('kurum IBAN: org_bank_save yalnız "Kurum bilgileri" yetkisiyle; boşluklar temizlenir, geçersiz IBAN reddedilir', async () => {
  await as(ID.T);
  expect(await tryCall(db, `select public.org_bank_save($1, $2, 'X')`, [org, IBAN])).toMatch(/yetkin yok/);
  await as(null, true);   // oturumsuz
  expect(await tryCall(db, `select public.org_bank_save($1, $2, 'X')`, [org, IBAN])).toMatch(/permission denied/);
  await as(M);
  expect(await tryCall(db, `select public.org_bank_save($1, 'TR12', '')`, [org])).toMatch(/IBAN geçersiz/);
  await q(`select public.org_bank_save($1, $2, '  Lale Sitesi Yönetimi ')`, [org, 'tr42 0001 0000 0000 0000 0000 01']);
  expect((await q(`select bank_iban, bank_holder from public.organizations where id = $1`, [org]))[0]).toEqual({ bank_iban: IBAN, bank_holder: 'Lale Sitesi Yönetimi' });
});

test('my_site_units: sakin dairesinin açıklama kodunu ve yönetimin banka bilgisini görür', async () => {
  await as(M);
  const [{ id: rid }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'kiraci', 'Kiracı') returning id`, [org, unit]);
  const [{ code }] = await q(`select public.site_resident_code($1) code`, [rid]);
  await as(ID.T);
  await q(`select public.accept_site_invite($1)`, [code]);
  const [{ u }] = await q(`select public.my_site_units() u`);
  const mine = u.find((x) => x.unit_id === unit);
  expect(mine).toMatchObject({ bank_iban: IBAN, bank_holder: 'Lale Sitesi Yönetimi', pay_code: expect.stringMatching(CODE) });
  // Alıcı adı boşsa kurum adı gösterilir; IBAN boş gönderilirse hesap kaldırılır.
  await as(M);
  await q(`select public.org_bank_save($1, '', '')`, [org]);
  await as(ID.T);
  const [{ u: u2 }] = await q(`select public.my_site_units() u`);
  expect(u2.find((x) => x.unit_id === unit)).toMatchObject({ bank_iban: null, bank_holder: 'Lale Sitesi' });
});
