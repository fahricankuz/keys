// Migration depolama_sinirlari: evim kovası boyut ve tür sınırı, mülk klasörlerinde site-/hukuk- öneki çakışmasının kapanması, site klasöründe
// sakinin yalnız kendine açık dosyaları okuması ve yazmanın yetkiye bağlanması, kullanıcı başına kota.
// Gerçek depolama (Storage API) PGlite'ta yoktur: kova ayarı satır olarak, politikalar storage.objects satırlarıyla sınanır; gerçek yükleme denemesi
// (20 MB dosya, HTML dosyası) canlı/staging'de ayrıca yapılır (docs/guvenlik.md).
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID, SCHEMA } from './db-helpers.mjs';

const { L, T, X, L2 } = ID;
const M = '00000000-0000-0000-0000-0000000000c1';   // site müdürü (master)
const V = '00000000-0000-0000-0000-0000000000c3';   // salt okur kurum rolü (yalnız Raporlar)
const R1 = '00000000-0000-0000-0000-0000000000d1';  // site sakini, daire 1
const R2 = '00000000-0000-0000-0000-0000000000d2';  // site sakini, daire 2
let db, as, q, org, other, u1, u2, folder;

const obj = (name, owner = null) => db.query(`insert into storage.objects (bucket_id, name, owner) values ('evim', $1, $2)`, [name, owner]);
const readable = async (who, prefix = '') => { await as(who); return (await q(`select name from storage.objects where name like $1 order by name`, [prefix + '%'])).map((r) => r.name); };
const canWrite = async (who, name) => { await as(who); return (await tryCall(db, `insert into storage.objects (bucket_id, name, owner) values ('evim', $1, auth.uid())`, [name])) === null; };

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'mudur@atakum.com', '{"name":"Müdür","role":"tenant"}'),
                  ($2, 'okur@atakum.com', '{"name":"Salt Okur","role":"team"}'), ($3, 'r1@ornek.com', '{"name":"Sakin Bir","role":"tenant"}'),
                  ($4, 'r2@ornek.com', '{"name":"Sakin İki","role":"tenant"}')`, [M, V, R1, R2]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Atakum Sitesi', sector: 'site' }]);
  [{ admin_org_save: other }] = await q(`select public.admin_org_save($1)`, [{ name: 'Başka Site', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'mudur@atakum.com')`, [org]);
  const [{ org_role_save: rid }] = await q(`select public.org_role_save($1, null, 'Salt okur', array['reports.view'])`, [org]);
  await as(M);
  const [{ org_invite_create: c }] = await q(`select public.org_invite_create($1, $2)`, [org, rid]);
  await as(V);
  await q(`select public.accept_org_invite($1)`, [c]);
  await as(M);
  [{ id: u1 }] = await q(`insert into public.site_units (org_id, block, no, area) values ($1, 'A', '1', 100) returning id`, [org]);
  [{ id: u2 }] = await q(`insert into public.site_units (org_id, block, no, area) values ($1, 'A', '2', 100) returning id`, [org]);
  for (const [uid, unit] of [[R1, u1], [R2, u2]]) {
    const [{ id }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'kiraci', 'Sakin') returning id`, [org, unit]);
    const [{ code }] = await q(`select public.site_resident_code($1) code`, [id]);
    await as(uid); await q(`select public.accept_site_invite($1)`, [code]); await as(M);
  }
  folder = 'site-' + org + '/';
});

/* ---------------------------------------------------------------- kova sınırları */

test('kova: dosya başına 10 MB ve yalnız uygulamanın yüklediği türler (HTML, SVG, betik, çalıştırılabilir yok); sütun yoksa atlanır', async () => {
  await as(null);
  // Yalın yerel şemada sütunlar yok: migration hata vermeden atlar (newDb iki kez çalıştırdı).
  await db.exec(`alter table storage.buckets add column file_size_limit bigint, add column allowed_mime_types text[]`);
  await db.exec(SCHEMA);                                                                              // üçüncü çalıştırma: artık sütunlar var
  const [b] = await q(`select file_size_limit, allowed_mime_types from storage.buckets where id = 'evim'`);
  expect(Number(b.file_size_limit)).toBe(10 * 1024 * 1024);
  expect(Number(b.file_size_limit)).toBeLessThan(20 * 1024 * 1024);                                   // 20 MB'lık dosya sığmaz
  expect([...b.allowed_mime_types].sort()).toEqual(['application/pdf', 'image/heic', 'image/heif', 'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']);
  for (const bad of ['text/html', 'image/svg+xml', 'application/javascript', 'application/octet-stream', 'application/x-msdownload', 'application/zip']) {
    expect(b.allowed_mime_types, bad).not.toContain(bad);
  }
  // uygulamanın yüklediği her tür listede: görsel (webp/jpeg/png), PDF, video (mp4, mov, webm, m4v)  (backend.js extOf)
  for (const ok of ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/x-m4v', 'video/quicktime', 'video/webm']) expect(b.allowed_mime_types).toContain(ok);
  await db.exec(SCHEMA);                                                                              // dördüncü: yinelenince aynı
  expect(Number((await q(`select file_size_limit from storage.buckets where id = 'evim'`))[0].file_size_limit)).toBe(10485760);
});

/* ---------------------------------------------------------------- mülk klasörü çakışması */

test('klasör çakışması: "site-<kurum>" ya da "hukuk-<kullanıcı>" adlı mülkün sahibi/üyesi olmak o klasörü okutmaz, yükletmez, sildirmez', async () => {
  await as(null);
  // Kimlik kuralı (yetki_duzeltmeleri) yeni satırı zaten reddeder; eski kayıt senaryosu için kural geçici kapatılır.
  await db.exec(`alter table public.properties drop constraint properties_id_onek`);
  await db.query(`insert into public.properties (id, owner_id, name, rent, due_day) values ($1, $2, 'Tuzak', 1, 5), ($3, $2, 'Tuzak 2', 1, 5)`,
    ['site-' + org, X, 'hukuk-' + L]);
  await db.query(`insert into public.memberships (property_id, user_id, role) values ($1, $2, 'landlord'), ($3, $2, 'landlord') on conflict do nothing`, ['site-' + org, X, 'hukuk-' + L]);
  await obj(folder + 'gizli.pdf', M);
  await obj(`hukuk-${L}/sozlesme.pdf`, L);
  await as(X);
  expect((await q(`select id from public.properties where owner_id = '${X}'`)).length).toBeGreaterThanOrEqual(2);   // X o "mülklerin" üyesi/sahibi
  expect(await readable(X, 'site-')).toEqual([]);
  expect(await readable(X, 'hukuk-')).toEqual([]);
  expect(await canWrite(X, folder + 'x.pdf')).toBe(false);
  expect(await canWrite(X, `hukuk-${L}/x.pdf`)).toBe(false);
  expect((await db.query(`delete from storage.objects where name = '${folder}gizli.pdf'`)).affectedRows).toBe(0);
  expect((await db.query(`delete from storage.objects where name = 'hukuk-${L}/sozlesme.pdf'`)).affectedRows).toBe(0);
  // gerçek sahipleri etkilenmez: hukuk klasörünü yükleyen kendi dosyasını okur; yönetici okur
  expect(await readable(L, 'hukuk-')).toEqual([`hukuk-${L}/sozlesme.pdf`]);
  expect(await readable(ID.A, 'hukuk-')).toEqual([`hukuk-${L}/sozlesme.pdf`]);
  expect(await canWrite(L, `hukuk-${L}/yeni.pdf`)).toBe(true);                                         // legal_files_write
  expect(await canWrite(L2, `hukuk-${L}/yeni.pdf`)).toBe(false);                                       // başkasının hukuk klasörü
  // temizlik: kural geri gelir, tuzak satırlar gider
  await as(null);
  await db.exec(`delete from public.properties where id in ('site-${org}', 'hukuk-${L}')`);
  await db.exec(`delete from storage.objects where name like 'hukuk-%'`);
  await db.exec(`alter table public.properties add constraint properties_id_onek check (id !~* '^(site|hukuk)-')`);
});

test('mülk klasörü: üye okur ve yükler, yalnız sahibi siler; yabancı ve oturumsuz erişemez (davranış değişmedi)', async () => {
  await as(null);
  await obj('p1/foto.webp', L);
  await obj('p2/foto.webp', L2);
  expect(await readable(T, 'p')).toEqual(['p1/foto.webp']);                                            // kiracı kendi mülkünün dosyasını okur
  expect(await readable(L, 'p')).toEqual(['p1/foto.webp']);
  expect(await readable(X, 'p')).toEqual([]);
  expect(await canWrite(T, 'p1/kira.pdf')).toBe(true);
  expect(await canWrite(X, 'p1/kira.pdf')).toBe(false);
  expect((await db.query(`delete from storage.objects where name = 'p1/kira.pdf'`).catch(() => ({ affectedRows: -1 }))).affectedRows).toBe(0);   // T mülkün sahibi değil
  await as(L);
  expect((await db.query(`delete from storage.objects where name = 'p1/kira.pdf'`)).affectedRows).toBe(1);
  await as(null, true);
  expect(await tryCall(db, `select * from storage.objects`)).toMatch(/permission denied/);
});

/* ---------------------------------------------------------------- site klasörü: okuma */

test('site klasörü okuma: kurum üyeleri hepsini; sakin yalnız kendi yükledikleri ve kendisine açık kayıtların dosyalarını; yabancı hiçbirini', async () => {
  await as(null);
  const f = (n) => folder + n;
  // 1) sakinlerin kendi yüklemeleri (dekont)
  await obj(f('r1-dekont.webp'), R1);
  await obj(f('r2-dekont.webp'), R2);
  // 2) yönetim belgeleri: herkese / daire 1'e / yönetime (sakinden)
  await obj(f('herkes.pdf'), M); await obj(f('herkes.pdf.k'), M);
  await obj(f('daire1.pdf'), M);
  await obj(f('yonetim-r2.pdf'), R2);
  // 3) tahakkuk dekontları: daire 1 ve daire 2 (yönetici yüklemiş gibi, sahibi M)
  await obj(f('charge-u1.webp'), M); await obj(f('charge-u2.webp'), M);
  // 4) proje dosyaları
  await obj(f('proje-teklif.pdf'), M); await obj(f('proje-foto.webp'), M); await obj(f('proje-kapak.webp'), M); await obj(f('gizli-proje-kapak.webp'), M);
  // 5) talep ekleri: R1'in talebi ve yönetimin cevabındaki ek; R2'nin talebi
  await obj(f('talep-r1.webp'), M); await obj(f('yanit-r1.webp'), M); await obj(f('talep-r2.webp'), M);
  // 6) gider belgesi ve bağlantısız dosya
  await obj(f('fis.pdf'), M); await obj(f('yetim.pdf'), M);
  await as(M);
  await db.query(`insert into public.site_documents (org_id, title, name, path, audience) values ($1, 'Herkes', 'h.pdf', $2, 'herkes')`, [org, f('herkes.pdf')]);
  await db.query(`insert into public.site_documents (org_id, unit_id, audience, title, path) values ($1, $2, 'daire', 'Daire 1', $3)`, [org, u1, f('daire1.pdf')]);
  await as(R2);
  await db.query(`insert into public.site_documents (org_id, unit_id, audience, title, path, uploaded_by) values ($1, $2, 'yonetim', 'Yönetime', $3, $4)`, [org, u2, f('yonetim-r2.pdf'), R2]);
  await as(null);
  await db.query(`insert into public.site_charges (org_id, unit_id, month, kind, amount, receipt_path) values ($1, $2, '2026-11', 'aidat', 100, $3), ($1, $4, '2026-11', 'aidat', 100, $5)`, [org, u1, f('charge-u1.webp'), u2, f('charge-u2.webp')]);
  const [{ id: pid }] = (await db.query(`insert into public.site_projects (org_id, title, kind, cover) values ($1, 'Çatı', 'proje', $2) returning id`, [org, f('proje-kapak.webp')])).rows;
  await db.query(`insert into public.site_projects (org_id, title, kind, cover, status) values ($1, 'İşletme', 'isletme', $2, 'acildi')`, [org, f('gizli-proje-kapak.webp')]);
  await db.query(`insert into public.site_project_costs (project_id, org_id, kind, vendor, amount, file, created_by) values ($1, $2, 'teklif', 'Usta', 100, $3, $4)`, [pid, org, f('proje-teklif.pdf'), M]);
  await db.query(`insert into public.site_project_updates (project_id, org_id, body, photos) values ($1, $2, 'ilerleme', $3)`, [pid, org, [f('proje-foto.webp')]]);
  const [{ id: q1 }] = (await db.query(`insert into public.site_requests (org_id, unit_id, user_id, title, media) values ($1, $2, $3, 'Tavan', $4) returning id`, [org, u1, R1, [f('talep-r1.webp')]])).rows;
  await db.query(`insert into public.site_requests (org_id, unit_id, user_id, title, media) values ($1, $2, $3, 'Kapı', $4)`, [org, u2, R2, [f('talep-r2.webp')]]);
  await db.query(`insert into public.site_request_messages (request_id, org_id, user_id, from_mgmt, body, media) values ($1, $2, $3, true, 'Geliyoruz', $4)`, [q1, org, M, [f('yanit-r1.webp')]]);
  await db.query(`insert into public.site_cash (org_id) values ($1) on conflict do nothing`, [org]);
  await db.query(`insert into public.site_expenses (org_id, cat, amount, spent_on, receipt_path, receipt_name) values ($1, 'Temizlik', 10, '2026-10-20', $2, 'fis.pdf')`, [org, f('fis.pdf')]);

  const all = (await readable(M, 'site-')).length;
  expect(all).toBeGreaterThanOrEqual(15);
  expect(await readable(V, 'site-')).toHaveLength(all);                                                // salt okur kurum rolü: tablolardaki okuma yetkisiyle aynı (hepsi)
  const names = (list) => list.map((n) => n.slice(folder.length));
  // R1: kendi dekontu, herkese açık belge (+ küçük kopyası), kendi dairesine açık belge, dairesinin dekontu, proje dosyaları, kendi talebi ve cevap eki
  expect(names(await readable(R1, 'site-')).sort()).toEqual(['charge-u1.webp', 'daire1.pdf', 'herkes.pdf', 'herkes.pdf.k', 'proje-foto.webp', 'proje-kapak.webp',
    'proje-teklif.pdf', 'r1-dekont.webp', 'talep-r1.webp', 'yanit-r1.webp']);
  // R2: kendi yüklemeleri (dekont, yönetime belge), herkese açık belge, dairesinin dekontu, proje dosyaları, kendi talebi; R1'in hiçbir dosyası
  expect(names(await readable(R2, 'site-')).sort()).toEqual(['charge-u2.webp', 'herkes.pdf', 'herkes.pdf.k', 'proje-foto.webp', 'proje-kapak.webp',
    'proje-teklif.pdf', 'r2-dekont.webp', 'talep-r2.webp', 'yonetim-r2.pdf']);
  // gider belgesi: paylaşım kapalıyken sakin göremez; kasa özeti ve belge paylaşılınca görür
  expect(names(await readable(R1, 'site-'))).not.toContain('fis.pdf');
  await as(M);
  await db.query(`update public.site_cash set share_summary = true, share_receipts = true where org_id = $1`, [org]);
  expect(names(await readable(R1, 'site-'))).toContain('fis.pdf');
  expect(names(await readable(R2, 'site-'))).toContain('fis.pdf');
  await as(M);
  await db.query(`update public.site_cash set share_receipts = false where org_id = $1`, [org]);
  expect(names(await readable(R1, 'site-'))).not.toContain('fis.pdf');
  // bağlantısız ve yönetime özel dosya hiçbir sakine görünmez
  for (const who of [R1, R2]) { const n = names(await readable(who, 'site-')); expect(n).not.toContain('yetim.pdf'); expect(n).not.toContain('gizli-proje-kapak.webp'); }
  // sakin olmayanlar: kiracı (mülk üyesi, siteye bağlı değil), mülk sahibi, yabancı, oturumsuz
  for (const who of [T, L, X, L2]) expect(await readable(who, 'site-'), String(who)).toEqual([]);
  // başka kurumun üyesi bu kurumun klasörünü okuyamaz
  await as(null);
  await obj(`site-${other}/baska.pdf`, L2);
  expect(await readable(M, `site-${other}`)).toEqual([]);
  expect(await readable(R1, `site-${other}`)).toEqual([]);
  // kurumun klasör adı biçimi: geçersiz klasör adı hiçbir kuralla eşleşmez
  await as(null);
  await obj('site-yok/x.pdf', L2);
  expect(await readable(M, 'site-yok')).toEqual([]);
});

/* ---------------------------------------------------------------- site klasörü: yazma */

test('site klasörü yazma: yetkili yönetim ve siteye bağlı sakin yükler; salt okur rol, kiracı (bağlı değil), yabancı yükleyemez; yol tek seviyeli ve kendi kurumunda', async () => {
  expect(await canWrite(M, folder + 'yonetim-yukleme.pdf')).toBe(true);
  expect(await canWrite(R1, folder + 'sakin-yukleme.pdf')).toBe(true);
  expect(await canWrite(R2, folder + 'sakin2-yukleme.pdf')).toBe(true);
  // salt okur kurum rolü yükleyemez (eskiden kurum üyesi herkes yükleyebiliyordu)
  expect(await canWrite(V, folder + 'okur.pdf')).toBe(false);
  for (const who of [T, L, X, L2, ID.A]) expect(await canWrite(who, folder + 'yabanci.pdf'), String(who)).toBe(false);
  // başka kurumun klasörü: ne yönetici ne sakin
  expect(await canWrite(M, `site-${other}/m.pdf`)).toBe(false);
  expect(await canWrite(R1, `site-${other}/r.pdf`)).toBe(false);
  // yol biçimi: iç içe klasör, geçersiz klasör adı, kurum kimliği olmayan
  expect(await canWrite(M, folder + 'alt/dosya.pdf')).toBe(false);
  expect(await canWrite(M, 'site-yok/dosya.pdf')).toBe(false);
  expect(await canWrite(M, `SITE-${org}/dosya.pdf`)).toBe(false);
  expect(await canWrite(R1, `site-${org}`)).toBe(false);
  // ezme yok: aynı yola ikinci yazma (upsert) için güncelleme politikası yoktur
  await as(R1);
  expect(await tryCall(db, `update storage.objects set name = name where name = '${folder}sakin-yukleme.pdf'`)).toMatch(/permission denied/);
  // sakin kendi yüklediğini okur; başkasının yüklediğini okumaz
  expect(await readable(R1, 'site-' + org + '/sakin')).toEqual([folder + 'sakin-yukleme.pdf']);
  expect(await readable(R2, 'site-' + org + '/sakin-yukleme')).toEqual([]);
  // yetkisi olan yönetim rolü: yalnız o yetkiyi taşıyan roller yükler
  await as(ID.A);
  await q(`select public.org_role_save($1, null, 'Gider', array['expenses.manage'])`, [org]);
  const [{ id: rid }] = await q(`select id from public.org_roles where org_id = $1 and name = 'Gider'`, [org]);
  await as(M);
  const G = '00000000-0000-0000-0000-0000000000d3';
  await as(null);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'gider@atakum.com', '{"name":"Gider","role":"team"}')`, [G]);
  await as(M);
  const [{ org_invite_create: gc }] = await q(`select public.org_invite_create($1, $2)`, [org, rid]);
  await as(G); await q(`select public.accept_org_invite($1)`, [gc]);
  expect(await canWrite(G, folder + 'gider-fatura.pdf')).toBe(true);
  // askıdaki kurum: yönetim yetkileri (org_can) etkin kurum ister
  await as(null);
  await db.exec(`update public.organizations set status = 'paused' where id = '${org}'`);
  expect(await canWrite(M, folder + 'askida.pdf')).toBe(false);
  expect(await canWrite(R1, folder + 'sakin-askida.pdf')).toBe(true);                                  // sakin (kayıtlı bağlantı) etkilenmez
  await as(null);
  await db.exec(`update public.organizations set status = 'active' where id = '${org}'`);
});

/* ---------------------------------------------------------------- kota */

test('kota: kullanıcının yüklediği dosyalar 1 GiB ya da 3000 dosyaya ulaşınca yeni yükleme reddedilir; başkası ve eşik altı etkilenmez', async () => {
  await as(null);
  await db.exec(`alter table storage.objects add column if not exists metadata jsonb`);
  expect(await canWrite(T, 'p1/kota-0.pdf')).toBe(true);
  // 1 GiB'lik tek dosya (metadata.size) → kota dolu
  await db.query(`insert into storage.objects (bucket_id, name, owner, metadata) values ('evim', 'p1/dev.pdf', $1, $2::jsonb)`, [T, JSON.stringify({ size: 1073741824 })]);
  expect(await canWrite(T, 'p1/kota-1.pdf')).toBe(false);
  expect(await canWrite(L, 'p1/kota-L.pdf')).toBe(true);                                               // başka kullanıcı etkilenmez
  await as(null);
  await db.exec(`delete from storage.objects where name = 'p1/dev.pdf'`);
  await db.query(`insert into storage.objects (bucket_id, name, owner, metadata) values ('evim', 'p1/buyuk.pdf', $1, $2::jsonb)`, [T, JSON.stringify({ size: 1073741823 })]);
  expect(await canWrite(T, 'p1/kota-2.pdf')).toBe(true);                                               // 1 bayt eşik altı: geçer (yumuşak sınır)
  await as(null);
  await db.exec(`delete from storage.objects where owner = '${T}'`);
  // 3000 dosya
  await db.exec(`insert into storage.objects (bucket_id, name, owner, metadata)
                 select 'evim', 'p1/toplu-' || g, '${T}', '{"size": 1000}'::jsonb from generate_series(1, 3000) g`);
  expect(await canWrite(T, 'p1/kota-3.pdf')).toBe(false);
  await as(null);
  await db.exec(`delete from storage.objects where name = 'p1/toplu-1'`);
  expect(await canWrite(T, 'p1/kota-4.pdf')).toBe(true);                                               // 2999 dosya + yeni = 3000: son yükleme geçer
  expect(await canWrite(T, 'p1/kota-5.pdf')).toBe(false);
  // kota yalnız evim kovası ve istemci yüklemeleri içindir; service_role/oturumsuz yol (auth.uid boş) kotaya takılmaz
  await as(null);
  expect((await q(`select public.storage_quota_ok() ok`))[0].ok).toBe(true);
});
