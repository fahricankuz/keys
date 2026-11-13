// Migration davet_kodlari: ≥80 bit davet kodları, eski kodların geçerliliği, normalleştirme, deneme sınırı (kullanıcı ve IP başına),
// tek biçimli ret, e-posta bağlama, maskeli önizleme, sakin kodunun yetkiye bağlanması, e-posta bekleme süresi.
// Her delik için rol rol (kiracı, mülk sahibi, ekip, site sakini, salt okur kurum rolü, oturumsuz) olumsuz deneme yapılır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const { L, T, X, L2 } = ID;
const M = '00000000-0000-0000-0000-0000000000c1';   // site müdürü (master)
const V = '00000000-0000-0000-0000-0000000000c3';   // salt okur kurum rolü (yalnız Raporlar)
const R = '00000000-0000-0000-0000-0000000000c4';   // site sakini (kurum üyesi değil)
const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]+$/;
let db, as, q, org, unit;

const attempts = async () => { await as(null); return (await q(`select count(*)::int c from public.invite_attempts`))[0].c; };
const ip = (xff, cf) => db.exec(`select set_config('request.headers', '${JSON.stringify({ ...(xff ? { 'x-forwarded-for': xff } : {}), ...(cf ? { 'cf-connecting-ip': cf } : {}) })}', false)`);
const noIp = () => db.exec(`select set_config('request.headers', '', false)`);
const accept = async (fn, code) => (await q(`select public.${fn}($1) r`, [code]))[0].r;
const resetAttempts = async () => { await as(null); await db.exec(`delete from public.invite_attempts`); await noIp(); };

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'mudur@atakum.com', '{"name":"Müdür","role":"team"}'),
                  ($2, 'okur@atakum.com', '{"name":"Salt Okur","role":"team"}'), ($3, 'sakin@ornek.com', '{"name":"Sakin","role":"tenant"}')`, [M, V, R]);
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

/* ---------------------------------------------------------------- kod biçimi ve rastgelelik */

test('yeni kodlar: mülk 16, kurum K+16, sakin S+16 karakter (Crockford base32, büyük harf); rastgele ve benzersiz', async () => {
  await as(L);
  const [{ code: p }] = await q(`insert into public.invites (property_id, created_by) values ('p1', '${L}') returning code`);
  expect(p).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
  await as(M);
  const [{ org_invite_create: k }] = await q(`select public.org_invite_create($1, null)`, [org]);
  expect(k).toMatch(/^K[0-9A-HJKMNP-TV-Z]{16}$/);
  const [{ id }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'malik', 'Ayşe Yılmaz') returning id`, [org, unit]);
  const [{ code: s }] = await q(`select public.site_resident_code($1) code`, [id]);
  expect(s).toMatch(/^S[0-9A-HJKMNP-TV-Z]{16}$/);
  // rastgelelik: 600 kod hep farklı, 32 simgenin hepsi görülür, simgeler yaklaşık eşit dağılır (her biri 9600 simgenin %1,5-%5,0 arasında)
  await as(null);
  const rows = await q(`select public.gen_invite_code(16) c from generate_series(1, 600)`);
  const codes = rows.map((r) => r.c);
  expect(new Set(codes).size).toBe(600);
  for (const c of codes) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{16}$/);
  const freq = {};
  for (const ch of codes.join('')) freq[ch] = (freq[ch] || 0) + 1;
  expect(Object.keys(freq).length).toBe(32);
  for (const n of Object.values(freq)) { expect(n).toBeGreaterThan(9600 * 0.015); expect(n).toBeLessThan(9600 * 0.05); }
  expect(await tryCall(db, `select public.gen_invite_code(0)`)).toMatch(/Geçersiz kod uzunluğu/);
  expect((await q(`select length(public.gen_invite_code(24)) n`))[0].n).toBe(24);
  // Yeni üç kod türü de aynı üreticiyi kullanır (varsayılan değer)
  const defs = await q(`select table_name, column_default d from information_schema.columns where table_schema = 'public' and column_name = 'code'
                        and table_name in ('invites', 'org_invites', 'site_residents') order by 1`);
  expect(defs.map((r) => r.d).join('|')).toMatch(/gen_invite_code\(16\).*gen_invite_code\(16\).*gen_invite_code\(16\)/);
});

/* ---------------------------------------------------------------- eski kodlar ve normalleştirme */

test('eski kodlar (8 onaltılık, K+7, S+7) kabul edilir; girdi normalleştirilir (küçük harf, boşluk, tire, O→0, I/L→1)', async () => {
  await as(null);
  await db.query(`insert into public.invites (code, property_id, created_by) values ('A1B2C3D4', 'p2', $1), ('ABCD0123EFGH4567', 'p2', $1), ('ABCD1234EFGH5678', 'p2', $1)`, [L2]);
  await db.query(`insert into public.org_invites (code, org_id) values ('KA1B2C3D', $1)`, [org]);
  await db.query(`insert into public.site_residents (org_id, unit_id, role, name, code) values ($1, $2, 'kiraci', 'Eski Kod', 'S1234ABC')`, [org, unit]);
  await as(X);
  expect(await accept('accept_invite', 'a1b2-c3d4')).toBe('p2');                                  // eski 8 haneli kod, küçük harf ve tire
  await as(T);
  expect(await accept('accept_invite', ' abcd-O123 efgh-4567 ')).toBe('p2');                      // O → 0, boşluk ve tireler atılır
  await as(ID.A);
  expect(await accept('accept_invite', 'ABCDl234EFGHI678'.replace('I678', '5678'))).toBe('p2');    // L → 1
  await as(R);
  expect(await accept('accept_org_invite', 'ka1b2c3d')).toBe(org);
  expect(await accept('accept_site_invite', 's1234 abc')).toBe(unit);
  // aynı hesap kullandığı sakin kodunu yeniden gönderirse işlem değişmez (tek kullanım yine korunur)
  expect(await accept('accept_site_invite', 'S1234ABC')).toBe(unit);
  await as(null, true);
  expect(await accept('signup_code_ok', 'zzzz-zzzz')).toBe(false);
});

/* ---------------------------------------------------------------- tek biçimli ret ve deneme sınırı */

test('tek biçimli ret: yok, kullanılmış, süresi dolmuş, başka e-postaya bağlı: hepsi NULL (hata iletisi yok); her biri kaydedilir', async () => {
  await resetAttempts();
  await as(L);
  const [{ code: used }] = await q(`insert into public.invites (property_id, created_by) values ('p1', '${L}') returning code`);
  const [{ code: expired }] = await q(`insert into public.invites (property_id, created_by, expires_at) values ('p1', '${L}', now() - interval '1 day') returning code`);
  const [{ code: bound }] = await q(`insert into public.invites (property_id, created_by, email) values ('p1', '${L}', 'ayse@baska.com') returning code`);
  await as(X);
  await q(`select public.accept_invite($1)`, [used]);
  await as(L2);
  const outcomes = [];
  for (const c of ['YOKYOKYOKYOKYOK1', used, expired, bound, '', null]) outcomes.push(await accept('accept_invite', c));
  expect(outcomes).toEqual([null, null, null, null, null, null]);
  expect(await attempts()).toBe(6);                                                                  // başarısız her deneme kaydedildi (hata fırlatılmadığı için geri alınmadı)
  // başka kurum / sakin kodlarında da aynı
  await as(L2);
  expect(await accept('accept_org_invite', 'KYOKYOKYOKYOKYOK1')).toBeNull();
  expect(await accept('accept_site_invite', 'SYOKYOKYOKYOKYOK1')).toBeNull();
  // oturum ve askı hataları hâlâ hata olarak döner (kod doğrulanmadan önce)
  await as(null);
  await db.exec(`grant execute on function public.accept_invite(text) to anon`);
  await as(null, true);
  expect(await tryCall(db, `select public.accept_invite('X')`)).toMatch(/Oturum açılmamış/);
  await as(null);
  await db.exec(`revoke execute on function public.accept_invite(text) from anon`);
  await as(ID.A);
  await q(`select public.admin_set_ban($1, true, 'test')`, [L2]);
  await as(L2);
  expect(await tryCall(db, `select public.accept_invite($1)`, [bound])).toMatch(/Hesap askıya alındı/);
  await as(ID.A);
  await q(`select public.admin_set_ban($1, false)`, [L2]);
});

test('deneme sınırı (kullanıcı): saatte 10 başarısız denemeden sonra doğru kod da reddedilir; başka kullanıcı etkilenmez; bir saat sonra açılır', async () => {
  await resetAttempts();
  await as(L2);
  const [{ code }] = await q(`insert into public.invites (property_id, created_by) values ('p2', '${L2}') returning code`);
  await as(X);
  for (let i = 0; i < 10; i++) expect(await accept('accept_invite', 'HATALI' + i)).toBeNull();
  expect(await attempts()).toBe(10);
  await as(X);
  expect(await accept('accept_invite', code)).toBeNull();                                            // doğru kod, ama sınır dolu
  expect(await attempts()).toBe(10);                                                                  // sınırlanmış deneme ayrıca kayıt yazmaz
  await as(T);                                                                                        // başka kullanıcı (IP bilgisi yok) etkilenmez
  expect(await accept('accept_invite', code)).toBe('p2');
  // yalnız başarısız denemeler sayılır; başarı kayıt yazmaz
  expect(await attempts()).toBe(10);
  // bir saat geçince sınır açılır
  await as(null);
  await db.exec(`update public.invite_attempts set at = now() - interval '61 minutes'`);
  await as(L2);
  const [{ code: c2 }] = await q(`insert into public.invites (property_id, created_by) values ('p2', '${L2}') returning code`);
  await as(X);
  expect(await accept('accept_invite', c2)).toBe('p2');
});

test('deneme sınırı (IP): aynı IP\'den saatte 10 başarısız deneme; x-forwarded-for\'un ilk girdisi ve cf-connecting-ip esas; farklı IP etkilenmez', async () => {
  await resetAttempts();
  await as(L2);
  const [{ code }] = await q(`insert into public.invites (property_id, created_by) values ('p2', '${L2}') returning code`);
  await ip('203.0.113.7, 10.1.1.1');                                                                  // ilk girdi istemcidir
  for (const u of [X, ID.A, M, V, R]) { await as(u); for (let i = 0; i < 2; i++) expect(await accept('accept_invite', 'HATALI' + i)).toBeNull(); }
  expect(await attempts()).toBe(10);                                                                  // beş farklı hesap, tek IP
  await as(T);
  expect(await accept('accept_invite', code)).toBeNull();                                            // yeni hesap bile aynı IP'den sınırlı
  await ip('203.0.113.8, 10.1.1.1');                                                                  // başka IP
  expect(await accept('accept_invite', code)).toBe('p2');
  // cf-connecting-ip, x-forwarded-for'dan önce gelir (istemci x-forwarded-for'u uyduramaz)
  await resetAttempts();
  await ip('198.51.100.1, 10.0.0.1', '203.0.113.50');
  await as(X);
  for (let i = 0; i < 10; i++) await accept('accept_invite', 'HATALI' + i);
  await as(null);
  expect((await q(`select distinct ip from public.invite_attempts`)).map((r) => r.ip)).toEqual(['203.0.113.50']);
  await noIp();
});

test('deneme sınırı (anon önizleme): oturumsuz ziyaretçi IP başına 10 başarısız denemeden sonra geçerli kodu da göremez', async () => {
  await resetAttempts();
  await as(L2);
  const [{ code }] = await q(`insert into public.invites (property_id, created_by) values ('p2', '${L2}') returning code`);
  await ip('192.0.2.9');
  await as(null, true);
  for (let i = 0; i < 4; i++) expect((await q(`select public.invite_preview($1) r`, ['YOK' + i]))[0].r).toBeNull();
  for (let i = 0; i < 3; i++) expect((await q(`select public.site_invite_info($1) r`, ['SYOK' + i]))[0].r).toBeNull();
  for (let i = 0; i < 3; i++) expect(await accept('signup_code_ok', 'YOKYOK' + i)).toBe(false);
  expect((await q(`select public.invite_preview($1) r`, [code]))[0].r).toBeNull();                  // sınır doldu
  expect(await accept('signup_code_ok', code)).toBe(false);
  await ip('192.0.2.10');
  expect((await q(`select public.invite_preview($1) r`, [code]))[0].r).toMatchObject({ valid: true });
  await noIp();
});

/* ---------------------------------------------------------------- e-posta bağlama */

test('e-posta bağlama: e-postalı davet yalnız o e-postalı hesapla kabul edilir (büyük/küçük harf fark etmez); mülk, kurum ve site için', async () => {
  await resetAttempts();
  // mülk daveti (kiracı)
  await as(L2);
  const [{ code: pc }] = await q(`insert into public.invites (property_id, created_by, email) values ('p2', '${L2}', 'KIRACI@ornek.com') returning code`);
  await as(X);
  expect(await accept('accept_invite', pc)).toBeNull();                                               // diger@ornek.com değil
  await as(T);
  expect(await accept('accept_invite', pc)).toBe('p2');                                              // kiraci@ornek.com
  // ekip daveti de e-postaya bağlanır
  const [{ code: tc }] = await (async () => { await as(L2); return q(`insert into public.invites (property_id, created_by, role, scope, email) values ('p2', '${L2}', 'agent', 'property', 'ev@ornek.com') returning code`); })();
  await as(ID.A);
  expect(await accept('accept_invite', tc)).toBeNull();
  await as(L);
  expect(await accept('accept_invite', tc)).toBe('p2');
  // kurum daveti
  await as(M);
  await q(`select 1`);
  const [{ org_invite_create: oc }] = await q(`select public.org_invite_create($1, null, 'Okur@Atakum.com')`, [org]);
  await as(R);
  expect(await accept('accept_org_invite', oc)).toBeNull();
  await as(V);                                                                                         // okur@atakum.com
  expect(await accept('accept_org_invite', oc)).toBe(org);
  // site sakini kodu: e-posta doluysa bağlı, boşsa serbest
  await as(M);
  const [{ id: bid }] = await q(`insert into public.site_residents (org_id, unit_id, role, name, email) values ($1, $2, 'kiraci', 'Bağlı Sakin', 'sakin@ornek.com') returning id`, [org, unit]);
  const [{ id: fid }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'malik', 'Serbest Sakin') returning id`, [org, unit]);
  const [{ code: bcode }] = await q(`select public.site_resident_code($1) code`, [bid]);
  const [{ code: fcode }] = await q(`select public.site_resident_code($1) code`, [fid]);
  await as(X);
  expect(await accept('accept_site_invite', bcode)).toBeNull();
  await as(R);
  expect(await accept('accept_site_invite', bcode)).toBe(unit);
  await as(X);
  expect(await accept('accept_site_invite', fcode)).toBe(unit);                                       // e-posta yoksa kodu bilen kabul eder
});

/* ---------------------------------------------------------------- oturumsuz önizleme */

test('önizleme: oturumsuz çağrı yalnız geçerli kod için rol/mülk/sahip adı döner; telefon, e-posta ve kişisel veri yok; kullanılmış/süresi dolmuş kod NULL', async () => {
  await resetAttempts();
  await as(L2);
  const [{ code: ok }] = await q(`insert into public.invites (property_id, created_by, name, email, phone) values ('p2', '${L2}', 'Veli Kiracı', 'veli@ornek.com', '05001112233') returning code`);
  const [{ code: old }] = await q(`insert into public.invites (property_id, created_by, expires_at) values ('p2', '${L2}', now() - interval '1 day') returning code`);
  await as(null, true);
  const [{ r }] = await q(`select public.invite_preview($1) r`, [ok.toLowerCase()]);
  expect(r).toEqual({ role: 'tenant', scope: 'property', owner: 'Başka Ev Sahibi', property: 'Bebek', valid: true, email_bound: true });
  expect(JSON.stringify(r)).not.toMatch(/veli@ornek|05001112233|Veli/);
  expect((await q(`select public.invite_preview($1) r`, [old]))[0].r).toBeNull();
  expect((await q(`select public.invite_preview('') r`))[0].r).toBeNull();
  // signup_code_ok: yalnız boolean; yeni uzun kod ve eski kod
  expect(await accept('signup_code_ok', ok)).toBe(true);
  expect(await accept('signup_code_ok', old)).toBe(false);
  expect(await accept('signup_code_ok', 'AB')).toBe(false);
  expect(await accept('signup_code_ok', null)).toBe(false);
  await resetAttempts();
  // site sakini: maskeli ad, telefon/e-posta yok
  await as(M);
  const [{ id }] = await q(`insert into public.site_residents (org_id, unit_id, role, name, phone, email) values ($1, $2, 'kiraci', 'Ayşe Yılmaz', '05321112233', 'ayse@ornek.com') returning id`, [org, unit]);
  const [{ code }] = await q(`select public.site_resident_code($1) code`, [id]);
  await as(null, true);
  const [{ i }] = await q(`select public.site_invite_info($1) i`, [code]);
  expect(i).toEqual({ org: 'Atakum Sitesi', sector: 'site', unit: 'A Blok No 1', role: 'kiraci', name: 'A*** Y***', email_bound: true, used: false });
  expect(JSON.stringify(i)).not.toMatch(/05321112233|ayse@ornek|Ayşe|Yılmaz/);
});

/* ---------------------------------------------------------------- sakin kodu yetkisi ve sütun yetkileri
   code sütununun OKUNMASININ kapatılması (revoke select + sütun listesi) bu PR'da değildir: yayındaki eski istemci "select *" kullanır.
   O kısıt specs/followup-migrations/ içindedir ve tests/followup-migrations.sql.spec.mjs onu uygulayıp sınar. Burada sunucu işlevi yolu
   (site_resident_code), kodun yazılamaması ve eski istemcinin okuma yollarının çalışması sınanır. */

test('sakin kodu: yalnız "Malik ve kiracılar" yetkisi okur; salt okur kurum rolü, sakin, kiracı, yabancı ve oturumsuz okuyamaz', async () => {
  await as(M);
  const [{ id }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'malik', 'Kod Sahibi') returning id`, [org, unit]);
  const [{ code }] = await q(`select public.site_resident_code($1) code`, [id]);
  expect(code).toMatch(/^S[0-9A-HJKMNP-TV-Z]{16}$/);
  // salt okur kurum rolü: satırı görür; sunucu işlevi kodu ona vermez (sütunun doğrudan okunması follow-up migrationıyla kapanır, bkz. üstteki not)
  await as(V);
  expect((await q(`select name from public.site_residents where id = $1`, [id]))[0].name).toBe('Kod Sahibi');
  expect(await tryCall(db, `select public.site_resident_code($1)`, [id])).toMatch(/Davet yetkin yok/);
  // sakin (bağlı kiracı), mülk sahibi hesabı, yabancı, ekip dışı
  await as(R);
  expect(await tryCall(db, `select public.site_resident_code($1)`, [id])).toMatch(/Davet yetkin yok/);
  for (const u of [T, L, X, L2]) { await as(u); expect(await tryCall(db, `select public.site_resident_code($1)`, [id]), String(u)).toMatch(/Davet yetkin yok/); }
  await as(M);
  expect(await tryCall(db, `select public.site_resident_code('00000000-0000-0000-0000-000000000999')`)).toMatch(/Kişi bulunamadı/);
  // oturumsuz
  await as(null, true);
  expect(await tryCall(db, `select public.site_resident_code($1)`, [id])).toMatch(/permission denied for function/);
  expect(await tryCall(db, `select code from public.site_residents`)).toMatch(/permission denied/);
  await as(null);
  await db.exec(`grant execute on function public.site_resident_code(uuid) to anon`);
  await as(null, true);
  expect(await tryCall(db, `select public.site_resident_code($1)`, [id])).toMatch(/Oturum açılmamış/);
  await as(null);
  await db.exec(`revoke execute on function public.site_resident_code(uuid) from anon`);
});

test('site_residents: eski istemcinin okuma yolları çalışır (select *, insert … returning *); code yazılamaz; yönetim normal alanları yazar', async () => {
  await as(null);
  const cols = (await q(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'site_residents' order by ordinal_position`)).map((r) => r.column_name);
  expect(cols).toContain('code');
  await as(M);
  for (const c of cols) expect(await tryCall(db, `select ${c} from public.site_residents limit 1`), c).toBeNull();
  expect(await tryCall(db, `select * from public.site_residents`)).toBeNull();                      // yayındaki eski istemci
  const [{ id }] = await q(`insert into public.site_residents (org_id, unit_id, role, name, phone, email) values ($1, $2, 'kiraci', 'Normal', '0555', 'n@ornek.com') returning *`, [org, unit]);
  expect(id).toBeTruthy();
  // kod yazılamaz: ne eklemede ne güncellemede (yönetim yetkisi olsa bile)
  expect(await tryCall(db, `insert into public.site_residents (org_id, unit_id, role, name, code) values ('${org}', '${unit}', 'malik', 'Uydurma', 'S1')`)).toMatch(/permission denied/);
  expect(await tryCall(db, `update public.site_residents set code = 'S1' where id = $1`, [id])).toMatch(/permission denied/);
  await db.query(`update public.site_residents set name = 'Yeni Ad', lives_here = false, invited_at = now() where id = $1`, [id]);   // meşru güncelleme (saveResident, markInvited)
  expect((await q(`select name, lives_here from public.site_residents where id = $1`, [id]))[0]).toEqual({ name: 'Yeni Ad', lives_here: false });
  await db.query(`delete from public.site_residents where id = $1`, [id]);
  // salt okur rol yazamaz
  await as(V);
  expect(await tryCall(db, `insert into public.site_residents (org_id, unit_id, role, name) values ('${org}', '${unit}', 'malik', 'x')`)).toMatch(/row-level security/);
});

test('invite_attempts: istemciye kapalı (RLS açık, yetki yok); yalnız security definer işlevler yazar', async () => {
  await as(null);
  expect((await q(`select relrowsecurity from pg_class where oid = 'public.invite_attempts'::regclass`))[0].relrowsecurity).toBe(true);
  expect((await q(`select count(*)::int c from pg_policies where tablename = 'invite_attempts'`))[0].c).toBe(0);
  for (const role of ['authenticated', 'anon']) {
    expect((await q(`select has_table_privilege('${role}', 'public.invite_attempts', 'select, insert, update, delete') p`))[0].p).toBe(false);
  }
  await as(T);
  expect(await tryCall(db, `select * from public.invite_attempts`)).toMatch(/permission denied/);
  expect(await tryCall(db, `insert into public.invite_attempts (ip) values ('1.1.1.1')`)).toMatch(/permission denied/);
  expect(await tryCall(db, `delete from public.invite_attempts`)).toMatch(/permission denied/);
  for (const f of ['invite_throttle()', 'invite_fail()', 'client_ip()', "invite_norm('x')", "mask_name('x')"]) expect(await tryCall(db, `select public.${f}`), f).toMatch(/permission denied for function/);
  await as(null, true);
  expect(await tryCall(db, `select * from public.invite_attempts`)).toMatch(/permission denied/);
});

/* ---------------------------------------------------------------- davet e-postası ve temizlik */

test('site_invite_mail: aynı kişiye 2 dakikada bir; ikinci çağrı {throttled:true}; süre geçince yeniden; yetkisiz çağıramaz', async () => {
  await as(M);
  const [{ id }] = await q(`insert into public.site_residents (org_id, unit_id, role, name, email) values ($1, $2, 'malik', 'Postalı', 'postali@ornek.com') returning id`, [org, unit]);
  const [{ r: first }] = await q(`select public.site_invite_mail($1) r`, [id]);
  expect(first).toMatchObject({ email: 'postali@ornek.com', name: 'Postalı', org: 'Atakum Sitesi', unit: 'A Blok No 1' });
  expect(first.code).toMatch(/^S[0-9A-HJKMNP-TV-Z]{16}$/);
  expect((await q(`select public.site_invite_mail($1) r`, [id]))[0].r).toEqual({ throttled: true });
  // WhatsApp ile işaretleme (invited_at) e-posta bekleme süresini etkilemez
  await db.query(`update public.site_residents set invited_at = now() where id = $1`, [id]);
  expect((await q(`select public.site_invite_mail($1) r`, [id]))[0].r).toEqual({ throttled: true });
  await as(null);
  await db.query(`update public.site_residents set mailed_at = now() - interval '3 minutes' where id = $1`, [id]);
  await as(M);
  expect((await q(`select public.site_invite_mail($1) r`, [id]))[0].r.email).toBe('postali@ornek.com');
  await as(V);
  expect(await tryCall(db, `select public.site_invite_mail($1)`, [id])).toMatch(/Davet yetkin yok/);
  await as(X);
  expect(await tryCall(db, `select public.site_invite_mail($1)`, [id])).toMatch(/Davet yetkin yok/);
  await as(null, true);
  expect(await tryCall(db, `select public.site_invite_mail($1)`, [id])).toMatch(/permission denied/);
});

test('prune_logs: 2 günden eski deneme kayıtları silinir, yenisi kalır', async () => {
  await as(null);
  await db.exec(`delete from public.invite_attempts`);
  await db.exec(`insert into public.invite_attempts (at, ip) values (now() - interval '3 days', '1.1.1.1'), (now() - interval '1 hour', '2.2.2.2')`);
  await q(`select public.prune_logs()`);
  expect((await q(`select ip from public.invite_attempts`)).map((r) => r.ip)).toEqual(['2.2.2.2']);
});
