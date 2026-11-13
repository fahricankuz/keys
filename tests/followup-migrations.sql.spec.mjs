// Sonraki PR'ın migration'ları (specs/followup-migrations/*.sql): bu PR'ın migration'ları DEĞİLDİR, yayındaki eski web istemcisini bozacakları için
// yeni site yayına çıkıp en az 24 saat geçtikten sonra ikinci bir PR'la supabase/migrations'a taşınır (README.md orada). Bu dosya onları bu PR'ın
// şemasının üstüne uygular (iki kez: yeniden çalıştırılabilir olmalı) ve sonuçlarını sınar; böylece ikinci PR'da yalnız dosyalar taşınır.
// Dosyalar taşındığında specs/followup-migrations içinde .sql kalmaz, aşağıdaki kurulum bir şey uygulamaz ve aynı sınavlar şemanın kendisine karşı çalışır.
//   - site_residents_kod_gizle: code sütunu istemciden okunamaz (yalnız site_resident_code); diğer sütunlar okunur, code yazılamaz.
//   - sistem_mesaji_kapat: from_role = 'system' satırı istemciden doğrudan yazılamaz (yalnız post_system_message ve sunucu işlevleri).
import { test, expect } from '@playwright/test';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { newDb, tryCall, ID, SCHEMA } from './db-helpers.mjs';

const DIR = new URL('../specs/followup-migrations/', import.meta.url);
const NAME = /^\d{14}_[a-z0-9_]+\.sql$/;
const pending = () => (existsSync(DIR) ? readdirSync(DIR).filter((f) => NAME.test(f)).sort() : []);

const { L, T, X } = ID;
const M = '00000000-0000-0000-0000-0000000000c1';   // site müdürü (master)
const V = '00000000-0000-0000-0000-0000000000c3';   // salt okur kurum rolü (yalnız Raporlar)
let db, as, q, org, unit;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  for (const f of pending()) {
    const sql = readFileSync(new URL(f, DIR), 'utf8');
    await db.exec(sql);
    await db.exec(sql);                              // ikinci çalıştırma zararsız olmalı
  }
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'mudur@atakum.com', '{"name":"Müdür","role":"team"}'),
                  ($2, 'okur@atakum.com', '{"name":"Salt Okur","role":"team"}')`, [M, V]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Atakum Sitesi', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'mudur@atakum.com')`, [org]);
  const [{ org_role_save: rid }] = await q(`select public.org_role_save($1, null, 'Salt okur', array['reports.view'])`, [org]);
  await as(M);
  const [{ org_invite_create: c }] = await q(`select public.org_invite_create($1, $2)`, [org, rid]);
  await as(V);
  await q(`select public.accept_org_invite($1)`, [c]);
  await as(M);
  [{ id: unit }] = await q(`insert into public.site_units (org_id, block, no, area) values ($1, 'A', '1', 100) returning id`, [org]);
});

test('sonraki PR dosyaları: bu PR\'ın schema.sql\'inde yok, başlıkta uyarı var, yalnız bilinen iki dosya', () => {
  const files = pending();
  if (!files.length) return;                         // ikinci PR'da taşındı: aşağıdaki sınavlar şemanın kendisine karşı çalışır
  expect(files.map((f) => f.replace(/^\d{14}_/, ''))).toEqual(['sistem_mesaji_kapat.sql', 'site_residents_kod_gizle.sql']);
  for (const f of files) {
    expect(SCHEMA.includes('-- ===== migration: ' + f + ' ====='), f).toBe(false);      // (açıklama satırlarında adı geçebilir; bölüm ayracı olmamalı)
    expect(readFileSync(new URL(f, DIR), 'utf8'), f).toMatch(/DİKKAT: BU MIGRATION YALNIZ/);
  }
  expect(existsSync(new URL('README.md', DIR))).toBe(true);
});

/* ---------------------------------------------------------------- site_residents_kod_gizle */

test('kod gizle: code sütunu hiçbir istemci rolünce okunamaz (salt okur rol, müdür, select *, alt sorgu); diğer bütün sütunlar okunur; kod yalnız işlevle', async () => {
  await as(M);
  const [{ id }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'malik', 'Kod Sahibi') returning id`, [org, unit]);
  expect((await q(`select public.site_resident_code($1) code`, [id]))[0].code).toMatch(/^S[0-9A-HJKMNP-TV-Z]{16}$/);
  await as(null);                                    // information_schema yalnız rolün yetkili olduğu sütunları listeler: tam liste için süper kullanıcı
  const cols = (await q(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'site_residents' order by ordinal_position`)).map((r) => r.column_name);
  expect(cols).toContain('code');
  await as(M);
  // yeni bir sütun eklenirse okuma listesine de eklenmelidir
  for (const c of cols.filter((x) => x !== 'code')) expect(await tryCall(db, `select ${c} from public.site_residents limit 1`), c).toBeNull();
  const readable = cols.filter((x) => x !== 'code').join(', ');
  expect((await q(`select ${readable} from public.site_residents where id = $1`, [id])).length).toBe(1);
  for (const who of [M, V]) {
    await as(who);
    expect(await tryCall(db, `select code from public.site_residents where id = $1`, [id]), String(who)).toMatch(/permission denied for table site_residents/);
    expect(await tryCall(db, `select * from public.site_residents`), String(who)).toMatch(/permission denied for table site_residents/);
    expect(await tryCall(db, `select s.code from (select * from public.site_residents) s`), String(who)).toMatch(/permission denied/);
    expect(await tryCall(db, `select name from public.site_residents where code like 'S%'`), String(who)).toMatch(/permission denied/);   // süzgeçte de okunamaz
  }
  // salt okur rol: satırın görünen alanlarını okur, kodu işlevden de alamaz
  await as(V);
  expect((await q(`select name from public.site_residents where id = $1`, [id]))[0].name).toBe('Kod Sahibi');
  expect(await tryCall(db, `select public.site_resident_code($1)`, [id])).toMatch(/Davet yetkin yok/);
  // oturumsuz ve yabancı
  await as(null, true);
  expect(await tryCall(db, `select code from public.site_residents`)).toMatch(/permission denied/);
  for (const u of [T, L, X]) { await as(u); expect(await tryCall(db, `select code from public.site_residents`), String(u)).toMatch(/permission denied/); }
});

test('kod gizle: yönetim normal alanları yazar ve sütun listesiyle ekleme + okuma yapar; code ne eklemede ne güncellemede yazılır', async () => {
  await as(null);
  const cols = (await q(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'site_residents' order by ordinal_position`)).map((r) => r.column_name);
  const readable = cols.filter((x) => x !== 'code').join(', ');
  await as(M);
  const [{ id }] = await q(`insert into public.site_residents (org_id, unit_id, role, name, phone, email) values ($1, $2, 'kiraci', 'Normal', '0555', 'n@ornek.com') returning ${readable}`, [org, unit]);
  expect(id).toBeTruthy();
  expect(await tryCall(db, `insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'kiraci', 'x') returning *`, [org, unit])).toMatch(/permission denied/);   // "returning *" artık çalışmaz (code)
  expect(await tryCall(db, `insert into public.site_residents (org_id, unit_id, role, name, code) values ('${org}', '${unit}', 'malik', 'Uydurma', 'S1')`)).toMatch(/permission denied/);
  expect(await tryCall(db, `update public.site_residents set code = 'S1' where id = $1`, [id])).toMatch(/permission denied/);
  await db.query(`update public.site_residents set name = 'Yeni Ad', lives_here = false, invited_at = now() where id = $1`, [id]);   // saveResident, markInvited
  expect((await q(`select name, lives_here from public.site_residents where id = $1`, [id]))[0]).toEqual({ name: 'Yeni Ad', lives_here: false });
  expect(await tryCall(db, `update public.site_residents set mailed_at = null where id = $1`, [id])).toMatch(/permission denied/);      // yalnız sunucu yazar
  await db.query(`delete from public.site_residents where id = $1`, [id]);
  await as(V);
  expect(await tryCall(db, `insert into public.site_residents (org_id, unit_id, role, name) values ('${org}', '${unit}', 'malik', 'x')`)).toMatch(/row-level security/);
});

/* ---------------------------------------------------------------- sistem_mesaji_kapat */

test('sistem mesajı kapat: doğrudan system satırı ve karşı tarafın rolü reddedilir; kendi tarafının mesajı yazılır; işlev ve sunucu işlevleri system satırı yazar', async () => {
  await as(T);
  expect(await tryCall(db, `insert into public.messages (id, property_id, from_role, by_user, body) values ('d1', 'p1', 'system', $1, 'x')`, [T])).toMatch(/row-level security/);
  expect(await tryCall(db, `insert into public.messages (id, property_id, from_role, by_user, body) values ('d2', 'p1', 'landlord', $1, 'x')`, [T])).toMatch(/row-level security/);
  await q(`insert into public.messages (id, property_id, from_role, by_user, body) values ('d3', 'p1', 'tenant', $1, 'merhaba')`, [T]);
  await q(`select public.post_system_message('p1', 'request_status', '{"id":"d5","text":"Talep durumu: Musluk · İşlemde"}'::jsonb)`);
  await as(L);
  expect(await tryCall(db, `insert into public.messages (id, property_id, from_role, by_user, body) values ('d6', 'p1', 'system', $1, 'x')`, [L])).toMatch(/row-level security/);
  await q(`insert into public.messages (id, property_id, from_role, by_user, body) values ('d4', 'p1', 'landlord', $1, 'merhaba')`, [L]);
  // ekleme politikası: eski istemcinin kullandığı biçim (kendi tarafı, kendi kimliği) çalışır; başkası adına yazamaz
  expect(await tryCall(db, `insert into public.messages (id, property_id, from_role, by_user, body) values ('d7', 'p1', 'landlord', $1, 'x')`, [T])).toMatch(/row-level security/);
  await as(null);
  expect((await q(`select id from public.messages where id in ('d3', 'd4', 'd5') order by id`)).map((r) => r.id)).toEqual(['d3', 'd4', 'd5']);
  expect((await q(`select count(*)::int c from public.messages where from_role = 'system' and body like '% eve katıldı'`))[0].c).toBeGreaterThanOrEqual(1);   // accept_invite
});
