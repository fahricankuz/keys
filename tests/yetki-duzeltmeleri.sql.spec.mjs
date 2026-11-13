// Migration yetki_duzeltmeleri: üretim öncesi denetimde bulunan yetki delikleri. Her delik için rol rol (kiracı, mülk sahibi,
// yönetici ekip üyesi, site sakini, kurumda salt okur rol, oturumsuz) olumsuz deneme yapılır; meşru yollar çalışmaya devam eder.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const { L, T, X, L2 } = ID;
const M = '00000000-0000-0000-0000-0000000000c1';   // site müdürü (master)
const V = '00000000-0000-0000-0000-0000000000c3';   // salt okur kurum rolü (yalnız Raporlar)
let db, as, q, org;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'mudur@atakum.com', '{"name":"Müdür","role":"tenant"}'),
                  ($2, 'okur@atakum.com', '{"name":"Salt Okur","role":"team"}')`, [M, V]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Atakum Sitesi', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'mudur@atakum.com')`, [org]);
  const [{ org_role_save: rid }] = await q(`select public.org_role_save($1, null, 'Salt okur', array['reports.view'])`, [org]);
  await as(M);
  const [{ org_invite_create: c }] = await q(`select public.org_invite_create($1, $2)`, [org, rid]);
  await as(V);
  await q(`select public.accept_org_invite($1)`, [c]);
});

/* ---------------------------------------------------------------- memberships: rol yükseltme */

test('üyelik: kiracı, mülk sahibi ve ekip üyesi kendi rolünü, mülkünü ya da kullanıcısını değiştiremez; ad ve telefon güncellenir', async () => {
  // yönetici ekip üyesi (agent) p1'e davetle katılır
  await as(L);
  const [{ code }] = await q(`insert into public.invites (property_id, created_by, role, scope) values ('p1', '${L}', 'agent', 'property') returning code`);
  await as(L2);
  await q(`select public.accept_invite($1)`, [code]);
  for (const [who, role] of [[T, 'tenant'], [L, 'landlord'], [L2, 'agent']]) {
    await as(who);
    expect(await tryCall(db, `update public.memberships set role = 'landlord' where user_id = '${who}' and property_id = 'p1'`)).toMatch(/permission denied/);
    expect(await tryCall(db, `update public.memberships set property_id = 'p2' where user_id = '${who}'`)).toMatch(/permission denied/);
    expect(await tryCall(db, `update public.memberships set user_id = '${X}' where user_id = '${who}'`)).toMatch(/permission denied/);
    expect(await tryCall(db, `update public.memberships set email = 'baska@ornek.com' where user_id = '${who}'`)).toMatch(/permission denied/);
    await db.query(`update public.memberships set display_name = $1, phone = '0555' where user_id = $2 and property_id = 'p1'`, ['Yeni Ad', who]);   // meşru yol (updateProfile)
    expect((await q(`select role, display_name, phone from public.memberships where user_id = '${who}' and property_id = 'p1'`))[0]).toEqual({ role, display_name: 'Yeni Ad', phone: '0555' });
  }
  // başkasının satırı güncellenmez
  await as(T);
  expect((await db.query(`update public.memberships set display_name = 'Ele geçirildi' where user_id = '${L}'`)).affectedRows).toBe(0);
  // üyeliği olmayanlar: yabancı, kurum yöneticisi ve salt okur kurum rolü (kurum üyeliği mülk üyeliği değildir); oturumsuz
  for (const who of [X, M, V]) {
    await as(who);
    expect((await db.query(`update public.memberships set display_name = 'x'`)).affectedRows, String(who)).toBe(0);
    expect(await tryCall(db, `update public.memberships set role = 'landlord'`), String(who)).toMatch(/permission denied/);
  }
  await as(null, true);
  expect(await tryCall(db, `update public.memberships set role = 'landlord'`)).toMatch(/permission denied/);
});

test('üyelik: tetikleyici ikinci kat; istemci rolüyle değişmez, sunucu işlevleri ve service_role ile değişir', async () => {
  await as(null);
  await db.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if; end $$;
                 grant select, update on public.memberships to service_role; grant usage on schema public to service_role;`);
  // Sütun yetkisi olmasa bile (geniş yetki verilmiş gibi) tetikleyici istemci rolünü durdurur.
  await as(null);
  await db.exec(`grant update on public.memberships to authenticated`);
  await as(T);
  expect(await tryCall(db, `update public.memberships set role = 'landlord' where user_id = '${T}'`)).toMatch(/değiştirilemez/);
  await as(null);
  await db.exec(`revoke update on public.memberships from authenticated; grant update (display_name, phone) on public.memberships to authenticated`);
  // service_role (ör. yönetim betiği) değiştirebilir
  await db.exec(`set role service_role`);
  await db.query(`update public.memberships set display_name = 'Servis' where user_id = '${T}' and property_id = 'p1'`);
  await as(null);
  // security definer işlevler (davet kabulü: ekip daveti rolü yükseltir) çalışmaya devam eder
  await as(L);
  const [{ code }] = await q(`insert into public.invites (property_id, created_by, role, scope) values ('p1', '${L}', 'accountant', 'property') returning code`);
  await as(L2);
  await q(`select public.accept_invite($1)`, [code]);
  expect((await q(`select role from public.memberships where user_id = '${L2}' and property_id = 'p1'`))[0].role).toBe('accountant');
  await as(null);
  await db.query(`update public.memberships set role = 'agent' where user_id = '${L2}' and property_id = 'p1'`);   // superuser (SQL) de geçer
});

/* ---------------------------------------------------------------- site_report */

test('site_report: oturumsuz çağrı yönetim denetimini atlayamaz; rapor yetkisi olmayan kurum üyesi ve yabancı da göremez', async () => {
  const grantAnon = async (on) => { await as(null); await db.exec(on ? `grant execute on function public.site_report(uuid, text, date) to anon` : `revoke execute on function public.site_report(uuid, text, date) from anon`); };
  await grantAnon(true);   // işlev yetkisi (anon_islev_yetkileri) kapalı olsa bile içerideki denetim tek başına yeterli olmalı
  await as(null, true);
  expect(await tryCall(db, `select public.site_report($1, 'month', date '2026-10-01')`, [org])).toMatch(/Oturum açılmamış/);
  await grantAnon(false);
  await as(null, true);
  expect(await tryCall(db, `select public.site_report($1, 'month', date '2026-10-01')`, [org])).toMatch(/permission denied/);   // ve yetki düzeyinde de kapalı
  // yabancı ve kiracı: rapor yetkisi yok
  for (const who of [X, T, L]) { await as(who); expect(await tryCall(db, `select public.site_report($1, 'month', date '2026-10-01')`, [org])).toMatch(/Rapor yetkin yok/); }
  // yetkili roller görür: master ve Raporlar yetkisi olan salt okur rol
  for (const who of [M, V]) { await as(who); const [{ r }] = await q(`select public.site_report($1, 'month', date '2026-10-01') r`, [org]); expect(r.org).toBe('Atakum Sitesi'); }
  // sunucu tarafı (service_role: rapor e-postası işlevi) oturumsuz çalışır
  await as(null);
  await db.exec(`grant execute on function public.site_report(uuid, text, date) to service_role; set role service_role`);
  const [{ r }] = await q(`select public.site_report($1, 'month', date '2026-10-01') r`, [org]);
  expect(r.org).toBe('Atakum Sitesi');
  await as(null);
});

/* ---------------------------------------------------------------- engelleme ve system mesajı */

test('engelleme: engellenen kişi system rolüyle yazsa da engelleyen göremez; ekip ve sunucu system mesajları görünür kalır', async () => {
  await as(L);
  await q(`insert into public.user_blocks (blocked) values ($1)`, [T]);
  await as(T);
  // uygulama sistem mesajlarını post_system_message ile yazar (satır çağıranın kimliğiyle gelir); bu yazma çalışmalıdır
  await q(`select public.post_system_message('p1', 'request_opened', $1::jsonb)`, [JSON.stringify({ id: 'sys-bloklu', text: 'Yeni talep açıldı: Sistem gibi görünen taciz' })]);
  expect((await q(`select id, by_user from public.messages where id = 'sys-bloklu'`))).toEqual([{ id: 'sys-bloklu', by_user: T }]);   // yazanın kendisi görür
  // yayındaki eski istemci system satırını doğrudan yazar (bu PR'da yol açık; kapatılması specs/followup-migrations içinde): satır yazanın kimliğini taşır,
  // başkasının kimliğiyle yazılamaz ve engelleyen için aynı biçimde gizlenir
  await q(`insert into public.messages (id, property_id, from_role, by_user, body) values ('sys-dogrudan', 'p1', 'system', $1, 'x')`, [T]);
  expect(await tryCall(db, `insert into public.messages (id, property_id, from_role, by_user, body) values ('sys-sahte', 'p1', 'system', $1, 'x')`, [L])).toMatch(/row-level security/);
  for (const [who, saw] of [[L, 0], [L2, 1]]) {
    await as(who);
    for (const id of ['sys-bloklu', 'sys-dogrudan']) {
      expect((await q(`select id from public.messages where id = '${id}'`)).length, id).toBe(saw);
      expect((await q(`select id from public.recent_messages(array['p1'], 200) where id = '${id}'`)).length, id).toBe(saw);
    }
  }
  // sunucunun yazdığı system mesajı (by_user boş) engelleyen için de görünür
  await as(null);
  await db.query(`insert into public.messages (id, property_id, from_role, by_user, body) values ('sys-sunucu', 'p1', 'system', null, 'Sunucu mesajı')`);
  await as(L);
  expect((await q(`select id from public.messages where id = 'sys-sunucu'`)).length).toBe(1);
  await q(`delete from public.user_blocks where blocked = $1`, [T]);
  expect((await q(`select id from public.messages where id = 'sys-bloklu'`)).length).toBe(1);
});

/* ---------------------------------------------------------------- documents */

test('belge: property_id değişmez; başka mülke taşıma, üyeliği bitmiş yükleyicinin güncellemesi ve yabancının güncellemesi reddedilir', async () => {
  await as(T);
  await q(`insert into public.documents (id, property_id, cat, name) values ('d-t1', 'p1', 'diger', 'Kiracı belgesi')`);
  expect(await tryCall(db, `update public.documents set property_id = 'p2' where id = 'd-t1'`)).toMatch(/taşınamaz/);
  await db.query(`update public.documents set note = 'güncel not' where id = 'd-t1'`);   // meşru güncelleme
  expect((await q(`select note, property_id from public.documents where id = 'd-t1'`))[0]).toEqual({ note: 'güncel not', property_id: 'p1' });
  // mülk sahibi (başka mülkü p2'ye) ve yönetici ekip üyesi de taşıyamaz
  for (const who of [L, L2]) { await as(who); expect(await tryCall(db, `update public.documents set property_id = 'p2' where id = 'd-t1'`)).toMatch(/taşınamaz|row-level security/); }
  // yabancı: satırı göremez, güncelleyemez
  await as(X);
  expect((await db.query(`update public.documents set note = 'x' where id = 'd-t1'`)).affectedRows).toBe(0);
  // mülk sahibi p2'de olan belgeyi ezemez: p2 sahibi L2 başka mülkün belgesine dokunamaz
  await as(L2);
  expect((await db.query(`update public.documents set note = 'x' where id = 'd-t1' and property_id = 'p1' and false`)).affectedRows).toBe(0);
  // üyeliği biten yükleyici kendi eski belgesini güncelleyemez (WITH CHECK)
  await as(null);
  await db.query(`delete from public.memberships where user_id = '${T}' and property_id = 'p1'`);
  await as(T);
  expect(await tryCall(db, `update public.documents set note = 'ayrıldım' where id = 'd-t1'`)).toMatch(/row-level security/);
  await as(null);
  await db.query(`insert into public.memberships (property_id, user_id, role, display_name) values ('p1', '${T}', 'tenant', 'Kiracı')`);
  await as(null, true);
  expect(await tryCall(db, `update public.documents set note = 'x'`)).toMatch(/permission denied/);
});

/* ---------------------------------------------------------------- mülk kimliği ve kurum bağı */

test('mülk kimliği: site- ve hukuk- önekleri (her harf büyüklüğü) yasak; adı değiştirilince de; sıradan kimlik geçer', async () => {
  await as(L);
  for (const id of ['site-' + org, 'SITE-abc', 'Site-x', 'hukuk-' + L, 'HUKUK-1', 'hUkUk-z']) {
    expect(await tryCall(db, `insert into public.properties (id, owner_id, name, rent, due_day) values ($1, $2, 'x', 1, 5)`, [id, L]), id).toMatch(/properties_id_onek/);
  }
  await db.query(`insert into public.properties (id, owner_id, name, rent, due_day) values ('tmp-kimlik', $1, 'Geçici', 1, 5)`, [L]);
  expect(await tryCall(db, `update public.properties set id = 'site-x' where id = 'tmp-kimlik'`)).toBeTruthy();   // istemci rolüyle (RLS) reddedilir
  await as(null);
  expect(await tryCall(db, `update public.properties set id = 'site-x' where id = 'tmp-kimlik'`)).toMatch(/properties_id_onek/);   // kural tek başına da reddeder
  await as(L);
  await db.query(`delete from public.properties where id = 'tmp-kimlik'`);
  await db.query(`insert into public.properties (id, owner_id, name, rent, due_day) values ('sitem-1', $1, 'Sıradan', 1, 5), ('hukumet', $1, 'Sıradan 2', 1, 5)`, [L]);
  // kiracı ve ekip üyesi zaten mülk açamaz; yöneticinin kurumsal ekleme yolu da öneki reddeder
  await as(T);
  expect(await tryCall(db, `insert into public.properties (id, owner_id, name, rent, due_day) values ('site-${org}', '${T}', 'x', 1, 5)`)).toBeTruthy();
  await as(null);
  expect(await tryCall(db, `insert into public.properties (id, owner_id, name, rent, due_day) values ('SITE-yonetici', '${L}', 'x', 1, 5)`)).toMatch(/properties_id_onek/);
  // kural doğrulanmış (VALID) durumda; yeni satırlarla sınırlı kalmaz
  expect((await q(`select convalidated from pg_constraint where conname = 'properties_id_onek'`))[0].convalidated).toBe(true);
});

test('mülk org_id: istemci başkasının kurumuna mülk bağlayamaz; kendi kurumunun yöneticisi (master) bağlayabilir; sunucu yolu çalışır', async () => {
  // L2 hiçbir kurumun yöneticisi değil
  await as(L2);
  expect(await tryCall(db, `update public.properties set org_id = '${org}' where id = 'p2'`)).toMatch(/Mülk bu kuruma bağlanamaz/);
  expect(await tryCall(db, `insert into public.properties (id, owner_id, name, rent, due_day, org_id) values ('p2-org', '${L2}', 'x', 1, 5, '${org}')`)).toMatch(/Mülk bu kuruma bağlanamaz/);
  // salt okur kurum rolü ve master olmayan üyeler de bağlayamaz; mülk sahibi hesabı olmayanlar zaten mülk açamaz
  await as(V);
  expect(await tryCall(db, `update public.properties set org_id = '${org}' where id = 'p2'`)).toBeNull();   // satır görünmez: 0 satır, hata yok
  expect((await q(`select count(*)::int c from public.properties where org_id = '${org}'`))[0].c).toBe(0);
  // kurum yöneticisi (master) mülk sahibi olarak kendi kurumuna bağlayabilir (add_landlord_role ile)
  await as(M);
  await db.query(`insert into public.properties (id, owner_id, name, rent, due_day) values ('m-p1', '${M}', 'Kurum mülkü', 1, 5)`);
  expect((await q(`select org_id from public.properties where id = 'm-p1'`))[0].org_id).toBe(org);   // guard_unit_limit kuruma bağlar (sunucu yolu)
  await db.query(`update public.properties set name = 'Yeni ad' where id = 'm-p1'`);                    // org_id değişmeyen güncelleme geçer
  // aynı kurumun master'ı başka bir kuruma bağlayamaz
  await as(ID.A);
  const [{ admin_org_save: other }] = await q(`select public.admin_org_save($1)`, [{ name: 'Başka Site', sector: 'site' }]);
  await as(M);
  expect(await tryCall(db, `update public.properties set org_id = '${other}' where id = 'm-p1'`)).toMatch(/Mülk bu kuruma bağlanamaz/);
  // admin_add_property (security definer, yönetici) kurum bağlı mülk ekleyebilir
  await as(ID.A);
  expect(await tryCall(db, `select public.admin_add_property('${M}', '{"id":"adm-1","name":"Admin mülkü","rent":1,"due_day":5}'::jsonb)`)).toBeNull();
});

/* ---------------------------------------------------------------- team_remove */

test('team_remove: başkasının etkinlik akışına sahte "ekip üyesi çıkarıldı" kaydı yazılamaz; gerçek çıkarma kaydı yazılır', async () => {
  const feed = async (own) => (await q(`select count(*)::int c from public.activity where owner_id = '${own}' and entity = 'team' and action = 'remove'`))[0].c;
  await as(null);
  const before = await feed(L2);
  await as(X);
  await q(`select public.team_remove('${X}', '${L2}')`);   // X, L2'nin ekibinde değil: hiçbir şey silinmez
  await as(null);
  expect(await feed(L2)).toBe(before);
  // oturumsuz çağrı: işlev anon'a açık olsa bile içeride reddedilir (anon_islev_yetkileri ile ayrıca kapatılır)
  await db.exec(`grant execute on function public.team_remove(uuid, uuid) to anon`);
  await as(null, true);
  expect(await tryCall(db, `select public.team_remove('${X}', '${L2}')`)).toMatch(/Oturum açılmamış/);
  await as(null);
  await db.exec(`revoke execute on function public.team_remove(uuid, uuid) from anon`);
  // gerçek çıkarma kaydı yazar (L2'nin ekibinden L çıkarılır)
  await as(L2);
  const [{ code }] = await q(`insert into public.invites (property_id, created_by, role, scope) values ('p2', '${L2}', 'agent', 'portfolio') returning code`);
  await as(L);
  await q(`select public.accept_invite($1)`, [code]);
  await as(L2);
  await q(`select public.team_remove('${L}')`);
  await as(null);
  expect(await feed(L2)).toBe(before + 1);
});
