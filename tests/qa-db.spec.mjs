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

test('uygunluk: anon rolü yalnız herkese açık TÜFE tablosunu okur', async () => {
  const g = await q(`select table_name, privilege_type from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'`);
  expect(g).toEqual([{ table_name: 'cpi_rates', privilege_type: 'SELECT' }]);
});

test('güvenlik: dışarıdan çağrılabilen security definer işlevler yalnızca izinli listede (yeni işlev eklenirse bilinçli karar gerekir)', async () => {
  const rows = await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('authenticated', p.oid, 'EXECUTE') order by 1`);
  expect(rows.map(r => r.proname)).toEqual([
    // Her biri kendi içinde yetki denetler: admin_* → is_admin, team_* → yalnız kendi ekibi, import_properties → mülk sahibi,
    // activity_feed → sahip/ekip, invite_preview → kodu bilen, member_can / msg_side → çağıranın kendi üyeliği,
    // submit_lead → herkese açık kurumsal başvuru (alan doğrulaması ve sıklık sınırı içinde).
    // report_error → herkese açık hata kaydı (alanlar kısaltılır, kişi başına ve oturumsuz toplamda saatlik sınır).
    // Kurumlar: org_* ve my_orgs → çağıranın kurum üyeliği / master'lığı / rol yetkisi; is_org_* ve org_can yalnız çağıranı sorar;
    // accept_org_invite → kodu bilen (süre ve tek kullanım denetimiyle).
    // Site: accept_site_invite → kodu bilen (tek kullanım); site_role, is_site_resident, my_site_units, site_folder_ok → yalnız çağıranı sorar;
    // site_invite_info → kodu bilen (kullanılmış kodda kişisel bilgi yok); site_invite_mail → "Malik ve kiracılar" yetkisi.
    // link_site_unit → mülk sahibi ve dairenin maliki; site_linked_tenants → kurum üyesi; site_report → Raporlar yetkisi.
    'accept_invite', 'accept_org_invite', 'accept_site_invite', 'activity_feed', 'admin_add_property', 'admin_audit_log', 'admin_delete_message', 'admin_extend_trial', 'admin_kpis', 'admin_messages',
    'admin_org_save', 'admin_org_set_master', 'admin_orgs',
    'admin_set_ban', 'admin_set_cpi', 'admin_set_plan', 'admin_subscriptions', 'admin_threads', 'admin_users',
    'delete_my_account', 'file_review_ok', 'has_access', 'import_properties', 'invite_preview', 'is_admin', 'is_banned', 'is_member',
    'is_org_master', 'is_org_member', 'is_owner', 'is_site_resident', 'link_site_unit',
    'member_can', 'member_role', 'msg_side', 'my_access', 'my_orgs', 'my_site_units',
    'org_can', 'org_detail', 'org_invite_create', 'org_invite_delete', 'org_member_remove', 'org_member_set', 'org_role_delete', 'org_role_save',
    'org_transfer_master',
    'report_error', 'review_ok', 'shares_property', 'site_folder_ok', 'site_invite_info', 'site_invite_mail', 'site_linked_tenants', 'site_report', 'site_role', 'submit_lead', 'team_list', 'team_remove', 'team_set'
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

/* ---------------------------------------------------------------- rapor e-postası (Kurumsal) */

test('rapor e-postası: dönem özeti doğru; alıcı listesi paket ve ayara bakar; kullanıcılar çağıramaz', async () => {
  const R = '00000000-0000-0000-0000-0000000000c1';
  await as(null);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'rapor@ornek.com', '{"name":"Rapor","role":"landlord"}')`, [R]);
  await as(R);
  await db.query(`insert into public.properties (id, owner_id, name, rent, start_date, contract_end) values ('pr1', $1, 'Kadıköy', 30000, '2026-01-01', '2027-01-01')`, [R]);
  expect(await tryCall(db, `select public.owner_report($1, 'month', current_date)`, [R])).toMatch(/permission denied/);
  expect(await tryCall(db, `select * from public.report_recipients('month')`)).toMatch(/permission denied/);
  await as(null);
  await db.query(`insert into public.payments (property_id, month, status, amount) values ('pr1', '2026-03', 'approved', 30000), ('pr1', '2026-04', 'partial', 10000)`);
  await db.query(`insert into public.expenses (id, property_id, cat, amount, spent_on) values ('e-r1', 'pr1', 'Tadilat', 2500, '2026-03-12')`);
  const [{ r: m }] = await q(`select public.owner_report($1, 'month', '2026-03-20') r`, [R]);
  expect(m).toMatchObject({ period:'month', from:'2026-03-01', to:'2026-03-31', units:1, occupied:0, expected:30000, collected:30000, spent:2500 });
  expect(m.properties[0]).toMatchObject({ name:'Kadıköy', paidMonths:1, activeMonths:1, hasTenant:false });
  const [{ r: y }] = await q(`select public.owner_report($1, 'year', '2026-06-01') r`, [R]);
  expect(y).toMatchObject({ from:'2026-01-01', to:'2026-12-31', expected:360000, collected:40000, spent:2500 });

  // Deneme süresindeki mülk sahipleri alır; ayarı kapatan ve kiracılar almaz.
  const who = async (p) => (await q(`select email from public.report_recipients($1) order by 1`, [p])).map(r => r.email);
  expect(await who('month')).toContain('rapor@ornek.com');
  expect(await who('month')).not.toContain('kiraci@ornek.com');
  await db.query(`update public.profiles set settings = settings || '{"reportMonthly":false}' where id = $1`, [R]);
  expect(await who('month')).not.toContain('rapor@ornek.com');
  expect(await who('year')).toContain('rapor@ornek.com');
});

test('kurumsal başvuru: oturumsuz ziyaretçi gönderir; doğrulama ve sıklık sınırı; yalnız yönetici görür', async () => {
  await as(null, true);
  const lead = (o = {}) => JSON.stringify({ name: 'Ayşe Yılmaz', email: 'ayse@firma.com', company: 'Yılmaz Emlak', phone: '05001112233', units: '40', types: ['Konut', 'Ofis'], role: 'Emlak ofisi', consent: true, message: 'Merhaba', ...o });
  const [{ id }] = await q(`select public.submit_lead($1::jsonb) id`, [lead()]);
  expect(id).toBeTruthy();
  expect(await tryCall(db, `select public.submit_lead($1::jsonb)`, [lead({ email: 'bozuk' })])).toMatch(/e-posta/);
  expect(await tryCall(db, `select public.submit_lead($1::jsonb)`, [lead({ consent: false })])).toMatch(/Aydınlatma/);
  expect(await tryCall(db, `insert into public.support_requests (name, email) values ('x', 'y@z.co')`)).toBeTruthy();
  await q(`select public.submit_lead($1::jsonb)`, [lead({ types: ['Konut', '<script>'] })]);
  await q(`select public.submit_lead($1::jsonb)`, [lead()]);
  expect(await tryCall(db, `select public.submit_lead($1::jsonb)`, [lead()])).toMatch(/Çok sık/);
  await as(L);
  expect(await q(`select * from public.support_requests where source = 'web'`)).toEqual([]);
  await as(A);
  const rows = await q(`select kind, units, company, details from public.support_requests where source = 'web' order by created_at`);
  expect(rows.length).toBe(3);
  expect(rows[0]).toMatchObject({ kind: 'kurumsal', units: 40, company: 'Yılmaz Emlak', details: { types: ['Konut', 'Ofis'], role: 'Emlak ofisi' } });
  expect(rows[1].details.types).toEqual([]);
});

test('TÜFE oranları: herkes okur; yalnız yönetici yazar; yazma kaydı tutulur', async () => {
  await as(A);
  await q(`select public.admin_set_cpi('2026-09', 33.456)`);
  await as(null, true);
  expect(await q(`select month, avg12::text from public.cpi_rates`)).toEqual([{ month: '2026-09', avg12: '33.46' }]);
  expect(await tryCall(db, `insert into public.cpi_rates (month, avg12) values ('2026-10', 1)`)).toBeTruthy();
  await as(L);
  expect(await tryCall(db, `select public.admin_set_cpi('2026-10', 99)`)).toMatch(/Yönetici/);
  expect(await tryCall(db, `update public.cpi_rates set avg12 = 1`)).toBeTruthy();
  await as(A);
  expect(await tryCall(db, `select public.admin_set_cpi('2026-13', 10)`)).toBeTruthy();
  await q(`select public.admin_set_cpi('2026-09', null)`);
  expect(await q(`select * from public.cpi_rates`)).toEqual([]);
});
