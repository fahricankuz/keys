// Yatırımcı raporu (migration yatirimci_raporu): GYO'da varsayılan modül, kurumun rapor para birimi, gider türü,
// dönem notu ve "mailime gönder" (yalnız kendi e-postasına, yetki ve modül denetimiyle, saatte 10).
import { test, expect } from '@playwright/test';
import { newDb, ID, tryCall } from './db-helpers.mjs';

let db, as, q, gyo, avm;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await as(ID.A);
  [{ id: gyo }] = await q(`select public.admin_org_save('{"name":"Marmara GYO","sector":"gyo"}'::jsonb) id`);
  [{ id: avm }] = await q(`select public.admin_org_save('{"name":"Kordon AVM","sector":"avm","report_currency":"EUR"}'::jsonb) id`);
  await as(null);
  for (const o of [gyo, avm]) await db.query(`insert into public.org_members (org_id, user_id, is_master) values ($1, $2, true)`, [o, ID.L]);
});

test('GYO’da yatırımcı modülü varsayılan açık; AVM’de kapalı; rapor para birimi USD varsayılan, EUR seçilir, başka olmaz', async () => {
  await as(ID.L);
  const orgs = await q(`select x ->> 'name' n, x ->> 'report_currency' c, x -> 'modules' m from jsonb_array_elements(public.my_orgs()) x order by 1`);
  expect(orgs.map((o) => [o.n, o.c, o.m.includes('yatirimci')])).toEqual([['Kordon AVM', 'EUR', false], ['Marmara GYO', 'USD', true]]);
  await as(ID.A);
  expect(await tryCall(db, `select public.admin_org_save($1::jsonb)`, [JSON.stringify({ id: avm, name: 'Kordon AVM', sector: 'avm', report_currency: 'GBP' })])).toMatch(/dolar ya da avro/);
  await q(`select public.admin_org_save($1::jsonb)`, [JSON.stringify({ id: avm, name: 'Kordon AVM', sector: 'avm', modules: ['kira', 'yatirimci'], report_currency: 'USD' })]);
  await as(null);
  const [o] = await q(`select modules, report_currency from public.organizations where id = $1`, [avm]);
  expect(o).toEqual({ modules: ['kira', 'yatirimci'], report_currency: 'USD' });
});

test('gider türü: varsayılan işletme gideri, ortak gider seçilir, başka tür reddedilir', async () => {
  await as(null);
  await db.query(`insert into public.site_expenses (org_id, cat, amount) values ($1, 'Temizlik', 100)`, [gyo]);
  await db.query(`insert into public.site_expenses (org_id, cat, amount, kind) values ($1, 'Güvenlik', 200, 'ortak')`, [gyo]);
  expect((await q(`select cat, kind from public.site_expenses where org_id = $1 order by cat`, [gyo]))).toEqual([{ cat: 'Güvenlik', kind: 'ortak' }, { cat: 'Temizlik', kind: 'isletme' }]);
  expect(await tryCall(db, `insert into public.site_expenses (org_id, cat, amount, kind) values ($1, 'X', 1, 'baska')`, [gyo])).toMatch(/check/);
});

test('dönem notu: Raporlar yetkisi olan yazar ve okur, yabancı göremez; dönem biçimi denetlenir', async () => {
  await as(ID.L);
  await q(`insert into public.site_investor_notes (org_id, period, note) values ($1, '2026-Q3', 'Doluluk %96')`, [gyo]);
  await q(`update public.site_investor_notes set note = 'Doluluk %97' where org_id = $1 and period = '2026-Q3'`, [gyo]);
  expect(await q(`select note from public.site_investor_notes`)).toEqual([{ note: 'Doluluk %97' }]);
  expect(await tryCall(db, `insert into public.site_investor_notes (org_id, period, note) values ($1, '2026-Q5', 'x')`, [gyo])).toBeTruthy();
  await as(ID.X);
  expect(await q(`select * from public.site_investor_notes`)).toEqual([]);
  expect(await tryCall(db, `insert into public.site_investor_notes (org_id, period, note) values ($1, '2026', 'sahte')`, [gyo])).toMatch(/row-level security/);
});

test('mailime gönder: yalnız kendi e-postasına; yetkisiz, kapalı modül ve sınır aşımı reddedilir', async () => {
  await as(ID.L);
  await q(`select public.investor_report_mail($1, '2026-Q3', '{"revenue":"$1.100"}'::jsonb)`, [gyo]);
  await as(null);
  const [m] = await q(`select kind, to_email, data from public.mail_outbox where kind = 'investor_report'`);
  expect(m.to_email).toBe('ev@ornek.com');
  expect(m.data).toMatchObject({ revenue: '$1.100', org: 'Marmara GYO', period: '2026-Q3', uid: ID.L });
  await as(ID.X);
  expect(await tryCall(db, `select public.investor_report_mail($1, '2026-Q3', '{}'::jsonb)`, [gyo])).toMatch(/Rapor yetkin yok/);
  await as(ID.A);
  await q(`select public.admin_org_save($1::jsonb)`, [JSON.stringify({ id: avm, name: 'Kordon AVM', sector: 'avm', modules: ['kira'] })]);
  await as(ID.L);
  expect(await tryCall(db, `select public.investor_report_mail($1, '2026', '{}'::jsonb)`, [avm])).toMatch(/kapalı/);
  expect(await tryCall(db, `select public.investor_report_mail($1, '2026-Q9', '{}'::jsonb)`, [gyo])).toMatch(/Dönem/);
  expect(await tryCall(db, `select public.investor_report_mail($1, '2026', $2::jsonb)`, [gyo, JSON.stringify({ x: 'a'.repeat(9000) })])).toMatch(/Özet/);
  for (let i = 0; i < 9; i++) await q(`select public.investor_report_mail($1, '2026', '{}'::jsonb)`, [gyo]);
  expect(await tryCall(db, `select public.investor_report_mail($1, '2026', '{}'::jsonb)`, [gyo])).toMatch(/Saatte en çok 10/);
  await as(null, true);
  expect(await tryCall(db, `select public.investor_report_mail($1, '2026', '{}'::jsonb)`, [gyo])).toMatch(/permission denied/);
});
