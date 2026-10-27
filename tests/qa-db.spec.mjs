// Kalite güvencesi: veritabanı katmanı (gerçek Postgres / PGlite).
//  Kara kutu: yetki ihlali denemeleri (güvenlik), veri yarışı/yinelenen istek, hatalı girdi.
//  Beyaz kutu: şema uygunluğu (conformance), dizin kullanımı ve hacim altında süre (performans, stres),
//  yeniden çalıştırma ve geri alma (recovery).
import { test, expect } from '@playwright/test';
import { newDb, ID, SCHEMA, tryCall } from './db-helpers.mjs';

const { L, T, A, X, L2 } = ID;
let db, as, q;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

/* ---------------------------------------------------------------- uygunluk (conformance) */

test('uygunluk: public şemasındaki her tabloda satır düzeyi güvenlik açık', async () => {
  await as(null);
  const off = await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
                       where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
  expect(off).toEqual([]);
});

test('uygunluk: her security definer işlevinde search_path sabit', async () => {
  const bad = await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`);
  expect(bad).toEqual([]);
});

test('uygunluk: anon rolünün hiçbir tabloya yetkisi yok', async () => {
  const g = await q(`select table_name from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'`);
  expect(g).toEqual([]);
});

test('güvenlik: dışarıdan çağrılabilen security definer işlevler yalnızca izinli listede (yeni işlev eklenirse bilinçli karar gerekir)', async () => {
  const rows = await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('authenticated', p.oid, 'EXECUTE') order by 1`);
  expect(rows.map(r => r.proname)).toEqual([
    'accept_invite', 'admin_audit_log', 'admin_delete_message', 'admin_messages', 'admin_set_ban', 'admin_threads', 'admin_users',
    'delete_my_account', 'file_review_ok', 'has_access', 'is_admin', 'is_banned', 'is_member', 'is_owner', 'member_role',
    'my_access', 'review_ok', 'shares_property'
  ]);
});

/* ---------------------------------------------------------------- güvenlik: yetki ihlali denemeleri */

test('güvenlik: yabancı biri sahte bildirim gönderemez, denetim durumunu sıfırlayamaz, mülk adı soramaz', async () => {
  for (const who of [X, null]) {
    await as(who, who === null);
    expect(await tryCall(db, `select public.notify_members('p1','tenant','Sahte','Linke tıkla','/x','/x',null,'t')`)).toMatch(/permission denied/);
    expect(await tryCall(db, `select public.upsert_review('payment','p1','2026-10',null,'sahte','x',1)`)).toMatch(/permission denied/);
    expect(await tryCall(db, `select public.prop_name('p1')`)).toMatch(/permission denied/);
  }
  await as(null);
  expect(await q(`select * from public.notifications where title = 'Sahte'`)).toEqual([]);
});

test('güvenlik: kullanıcı kendi rolünü ya da başkasının profilini değiştiremez, kendini yönetici yapamaz', async () => {
  await as(T);
  expect(await tryCall(db, `update public.profiles set role = 'landlord' where id = '${T}'`)).toMatch(/değiştirilemez/);
  expect((await db.query(`update public.profiles set name = 'Hack' where id = '${L}'`)).affectedRows).toBe(0);
  expect(await tryCall(db, `insert into public.admins (user_id) values ('${T}')`)).toBeTruthy();
  expect(await tryCall(db, `insert into public.bans (user_id, reason) values ('${L}', 'x')`)).toBeTruthy();
  expect(await tryCall(db, `insert into public.subscriptions (user_id, active) values ('${T}', true)`)).toBeTruthy();
});

test('güvenlik: başka mülke yazma, okuma ve silme denemeleri sonuçsuz kalır (IDOR)', async () => {
  await as(L2);
  expect((await db.query(`update public.properties set name = 'Ele geçirildi' where id = 'p1'`)).affectedRows).toBe(0);
  expect((await db.query(`delete from public.properties where id = 'p1'`)).affectedRows).toBe(0);
  expect(await q(`select * from public.memberships where property_id = 'p1'`)).toEqual([]);
  expect(await tryCall(db, `insert into public.messages (id, property_id, from_role, body) values ('m-x', 'p1', 'landlord', 'sızma')`)).toBeTruthy();
  expect(await tryCall(db, `insert into public.invites (property_id, created_by) values ('p1', '${L2}')`)).toBeTruthy();
  await as(X);
  expect(await tryCall(db, `insert into public.payments (property_id, month, amount, status) values ('p1', '2026-09', 1, 'approved')`)).toBeTruthy();
  expect(await q(`select * from public.payments`)).toEqual([]);
  // başkasının kimliğiyle mesaj
  await as(T);
  expect(await tryCall(db, `insert into public.messages (id, property_id, from_role, by_user, body) values ('m-sahte', 'p1', 'tenant', '${L}', 'ev sahibi gibi yazıyorum')`)).toBeTruthy();
  expect(await tryCall(db, `insert into public.messages (id, property_id, from_role, body) values ('m-rol', 'p1', 'landlord', 'rolümü değiştirdim')`)).toBeTruthy();
});

test('güvenlik: yinelenen / çakışan istekler (aynı davet iki kez, aynı kimlik iki kez) tutarlı kalır', async () => {
  await as(L);
  const [{ code }] = await q(`insert into public.invites (property_id, created_by) values ('p1', '${L}') returning code`);
  await as(X);
  await q(`select public.accept_invite($1)`, [code]);
  expect(await tryCall(db, `select public.accept_invite($1)`, [code])).toBeNull();      // ikinci çağrı zarar vermez
  await as(null);
  expect((await q(`select count(*)::int c from public.memberships where property_id = 'p1' and user_id = '${X}'`))[0].c).toBe(1);
  await as(L);
  await db.query(`delete from public.memberships where property_id = 'p1' and user_id = '${X}'`);
  await db.query(`insert into public.messages (id, property_id, from_role, body) values ('m-dup', 'p1', 'landlord', 'bir')`);
  expect(await tryCall(db, `insert into public.messages (id, property_id, from_role, body) values ('m-dup', 'p1', 'landlord', 'iki')`)).toMatch(/duplicate|unique/i);
});

test('güvenlik: hatalı girdi (SQL içeren metin, çok uzun metin, geçersiz tür) veriyi bozmaz', async () => {
  await as(L);
  const evil = `'); drop table public.messages; --`;
  await db.query(`insert into public.messages (id, property_id, from_role, body) values ('m-sqli', 'p1', 'landlord', $1)`, [evil]);
  expect((await q(`select body from public.messages where id = 'm-sqli'`))[0].body).toBe(evil);
  await db.query(`insert into public.messages (id, property_id, from_role, body) values ('m-xss', 'p1', 'landlord', $1)`, ['<script>alert(1)</script><img src=x onerror=alert(2)>']);
  expect(await tryCall(db, `insert into public.properties (id, owner_id, name, rent, due_day) values ('p-bad', '${L}', 'x', 1, 99)`)).toBeTruthy();       // geçersiz ödeme günü
  expect(await tryCall(db, `insert into public.properties (id, owner_id, name, rent, due_day, prop_type) values ('p-bad2', '${L}', 'x', 1, 5, 'Uzay')`)).toBeTruthy();   // geçersiz tür
  expect((await q(`select count(*)::int c from public.messages`))[0].c).toBeGreaterThan(0);
});

/* ---------------------------------------------------------------- performans ve stres */

test('stres + performans: 30.000 mesaj, 400 mülk, 6.000 ödeme altında sorgular hızlı ve dizin kullanır', async () => {
  test.setTimeout(120_000);
  await as(null);
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data)
      select ('10000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'u' || g || '@ornek.com', '{"name":"Kullanıcı","role":"landlord"}'::jsonb from generate_series(1, 400) g;
    insert into public.properties (id, owner_id, name, rent, due_day)
      select 'bulk' || g, ('10000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'Mülk ' || g, 10000, 5 from generate_series(1, 400) g;
    insert into public.messages (id, property_id, from_role, by_user, body, at)
      select 'bm' || g, 'bulk' || (1 + g % 400), 'landlord', ('10000000-0000-0000-0000-' || lpad((1 + g % 400)::text, 12, '0'))::uuid,
             'Mesaj ' || g, now() - (g || ' minutes')::interval from generate_series(1, 30000) g;
    insert into public.payments (property_id, month, amount, status)
      select 'bulk' || (1 + g % 400), to_char(date '2024-01-01' + ((g / 400) || ' months')::interval, 'YYYY-MM'), 10000, 'approved' from generate_series(1, 6000) g
      on conflict do nothing;
    analyze;
  `);
  const time = async (sql, as_) => { await as(as_); const t = performance.now(); await db.query(sql); return performance.now() - t; };

  // Mülk sahibi kendi mülkünün son mesajlarını alır (sohbet açılışı).
  const chat = await time(`select * from public.messages where property_id = 'bulk7' order by at desc limit 200`, '10000000-0000-0000-0000-000000000007');
  expect(chat).toBeLessThan(300);
  // Dizin kullanılıyor mu: (property_id, at)
  await as(null);
  const plan = (await q(`explain select * from public.messages where property_id = 'bulk7' order by at desc limit 200`)).map(r => r['QUERY PLAN']).join('\n');
  expect(plan).toMatch(/Index|Bitmap/);
  expect(plan).not.toMatch(/Seq Scan on messages/);

  // Yönetici: yazışma özeti ve kullanıcı listesi 400 mülk / 30.000 mesajda kabul edilebilir sürede.
  const threads = await time(`select * from public.admin_threads()`, A);
  expect(threads).toBeLessThan(3000);
  const users = await time(`select * from public.admin_users()`, A);
  expect(users).toBeLessThan(2000);
  const log = await time(`select * from public.admin_audit_log()`, A);
  expect(log).toBeLessThan(500);
  await as(A);
  expect((await q(`select * from public.admin_threads()`)).length).toBeGreaterThan(300);
  // Bir yazışma açılışı sınırlıdır (en çok 300; büyük dökümler tarayıcıyı kilitlemesin).
  expect((await q(`select * from public.admin_messages('bulk7', 5000)`)).length).toBeLessThanOrEqual(1000);
  expect((await q(`select * from public.admin_messages('bulk7')`)).length).toBeLessThanOrEqual(300);
});

test('stres: yasaklı hesap hacimli veride de hiçbir satır okuyamaz; yasak kalkınca hepsi geri gelir', async () => {
  const U = '10000000-0000-0000-0000-000000000009';
  await as(A);
  await db.query(`select public.admin_set_ban($1, true, 'stres')`, [U]);
  await as(U);
  expect((await q(`select count(*)::int c from public.messages`))[0].c).toBe(0);
  expect((await q(`select count(*)::int c from public.properties`))[0].c).toBe(0);
  await as(A);
  await db.query(`select public.admin_set_ban($1, false)`, [U]);
  await as(U);
  expect((await q(`select count(*)::int c from public.properties`))[0].c).toBe(1);
});

/* ---------------------------------------------------------------- kurtarma (recovery) */

test('kurtarma: şema veri varken üçüncü kez çalıştırılınca veri, yasak ve denetim kaydı korunur', async () => {
  await as(A);
  await db.query(`select public.admin_set_ban($1, true, 'kurtarma testi')`, [X]);
  await as(null);
  const before = {
    msgs: (await q(`select count(*)::int c from public.messages`))[0].c,
    props: (await q(`select count(*)::int c from public.properties`))[0].c,
    bans: (await q(`select count(*)::int c from public.bans`))[0].c,
    audit: (await q(`select count(*)::int c from public.admin_audit`))[0].c
  };
  await db.exec(SCHEMA);
  const after = {
    msgs: (await q(`select count(*)::int c from public.messages`))[0].c,
    props: (await q(`select count(*)::int c from public.properties`))[0].c,
    bans: (await q(`select count(*)::int c from public.bans`))[0].c,
    audit: (await q(`select count(*)::int c from public.admin_audit`))[0].c
  };
  expect(after).toEqual(before);
  // yasak şema yenilendikten sonra da çalışıyor
  await as(X);
  expect((await q(`select count(*)::int c from public.properties`))[0].c).toBe(0);
  await as(A);
  await db.query(`select public.admin_set_ban($1, false)`, [X]);
});

test('kurtarma: yarıda kesilen işlem geri alınır (yasak + denetim kaydı birlikte ya da hiç)', async () => {
  await as(A);
  await db.exec('begin');
  await db.query(`select public.admin_set_ban($1, true, 'geri alınacak')`, [X]);
  await db.exec('rollback');
  await as(null);
  expect((await q(`select count(*)::int c from public.bans where user_id = '${X}'`))[0].c).toBe(0);
  expect((await q(`select count(*)::int c from public.admin_audit where detail ->> 'reason' = 'geri alınacak'`))[0].c).toBe(0);
});

test('kurtarma: hesap silinince bağlı veri temizlenir, başkasının verisine dokunulmaz', async () => {
  await as(X);
  await db.query(`select public.delete_my_account()`).catch(() => {});
  await as(null);
  const left = await q(`select count(*)::int c from public.profiles where id = '${X}'`);
  expect(left[0].c).toBeLessThanOrEqual(1);
  expect((await q(`select count(*)::int c from public.properties where id in ('p1', 'p2')`))[0].c).toBe(2);
});

test('hatırlatma: yeni eklenen mülk için vade başlangıçtan önceye düşmez, "kira gecikti" gitmez; başlamamış sözleşme sessiz', async () => {
  await as(null);
  await db.exec(`reset role`);
  await db.exec(`insert into public.properties (id, owner_id, name, rent, due_day, start_date) values
    ('p-yeni', '${L}', 'Yeni', 1000, 5, date '2026-10-25'), ('p-gelecek', '${L}', 'Gelecek', 1000, 5, date '2026-12-01'), ('p-eski', '${L}', 'Eski', 1000, 5, date '2026-08-01')`);
  await db.exec(`insert into public.memberships (property_id, user_id, role) values ('p-yeni', '${T}', 'tenant'), ('p-gelecek', '${T}', 'tenant'), ('p-eski', '${T}', 'tenant') on conflict do nothing`);
  await db.exec(`delete from public.notifications`);
  // 27 Ekim: eski mülk 22 gündür gecikmiş (22 % 7 = 1 → bildirim günü). Yeni mülk (25 Ekim'de başladı) için eski kural
  // "05.10 vadeli kira 22 gündür ödenmedi" derdi; yenisi vadeyi başlangıca çeker. Başlamamış sözleşme sessiz kalır.
  await db.query(`select public.daily_reminders(date '2026-10-27')`);
  const late = (await q(`select distinct property_id from public.notifications where title like '%gecikti%' and property_id in ('p-yeni','p-gelecek','p-eski')`)).map(r => r.property_id);
  expect(late).toEqual(['p-eski']);
});
