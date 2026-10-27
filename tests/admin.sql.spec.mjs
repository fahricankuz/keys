// Yönetici denetimi: dekont, belge ve faturalar yönetici onaylayana kadar karşı tarafa
// görünmez; yönetici tüm kullanıcı ve ödemeleri okur. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const SCHEMA = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

const STUB = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  end $$;
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb, banned_until timestamptz);
  create table if not exists auth.sessions (id uuid default gen_random_uuid(), user_id uuid);
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema if not exists storage;
  create table if not exists storage.buckets (id text primary key, name text, public boolean);
  create table if not exists storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text) returns text[] language sql immutable as
    $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema auth, storage to authenticated;
  grant execute on function auth.uid() to authenticated;
  grant select, insert, delete on storage.objects to authenticated;
`;

const L  = '00000000-0000-0000-0000-00000000000a';   // mülk sahibi
const T  = '00000000-0000-0000-0000-00000000000b';   // kiracı
const A  = '00000000-0000-0000-0000-00000000000e';   // yönetici
const X  = '00000000-0000-0000-0000-00000000000f';   // başka kiracı (yönetici değil)

let db;
const as = async uid => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false);` + (uid ? ' set role authenticated;' : ''));
const q = async (sql, params) => (await db.query(sql, params)).rows;
const notes = async uid => { await as(null); return q('select title, body from public.notifications where user_id = $1 order by id', [uid]); };
const putFile = async (path, owner) => { await as(null); await db.query(`insert into storage.objects (bucket_id, name, owner) values ('evim', $1, $2)`, [path, owner]); };
const canRead = async (uid, path) => { await as(uid); return (await q(`select 1 from storage.objects where bucket_id = 'evim' and name = $1`, [path])).length === 1; };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  db = new PGlite();
  await db.exec(STUB);
  await db.exec(SCHEMA);
  await db.exec(SCHEMA);       // ikinci çalıştırma zararsız
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'ev@ornek.com', '{"name":"Ev Sahibi","role":"landlord"}'),
    ($2, 'kiraci@ornek.com', '{"name":"Kiracı","role":"tenant"}'),
    ($3, 'admin@ornek.com', '{"name":"Yönetici","role":"tenant"}'),
    ($4, 'diger@ornek.com', '{"name":"Diğer","role":"tenant"}')`, [L, T, A, X]);
  await db.exec(`insert into public.admins (user_id) values ('${A}')`);
  await as(L);
  await db.query(`insert into public.properties (id, owner_id, name, rent, due_day) values ('p1', $1, 'Moda', 30000, 5)`, [L]);
  const [{ code }] = await q(`insert into public.invites (property_id, created_by) values ('p1', $1) returning code`, [L]);
  await as(T);
  await q(`select public.accept_invite($1)`, [code]);
});

test('yönetici olmayan admins tablosuna yazamaz, yöneticilik kendini sorgular', async () => {
  await as(T);
  await expect(db.query(`insert into public.admins (user_id) values ($1)`, [T])).rejects.toThrow();
  expect((await q(`select public.is_admin() as a`))[0].a).toBe(false);
  await as(A);
  expect((await q(`select public.is_admin() as a`))[0].a).toBe(true);
});

test('dekont: kiracı yükler, denetim kaydı düşer, mülk sahibi göremez, bildirim gitmez', async () => {
  await putFile('p1/dekont1.jpg', T);
  await as(T);
  await db.query(`insert into public.payments (property_id, month, status, amount, receipt_name, receipt_path)
                  values ('p1', '2026-10', 'review', 30000, 'dekont.jpg', 'p1/dekont1.jpg')`);
  expect((await q(`select status, label, path from public.reviews where kind = 'payment'`))[0])
    .toEqual({ status: 'pending', label: 'dekont.jpg', path: 'p1/dekont1.jpg' });
  expect((await q(`select count(*)::int c from public.payments`))[0].c).toBe(1);        // kiracı kendi yüklemesini görür

  await as(L);
  expect(await q(`select * from public.payments`)).toEqual([]);                           // mülk sahibi göremez
  expect(await q(`select * from public.reviews`)).toEqual([]);                            // denetim kaydını da
  expect((await notes(L)).some(n => /dekont geldi/.test(n.title))).toBe(false);
  expect(await canRead(L, 'p1/dekont1.jpg')).toBe(false);                                 // dosya da kilitli
  expect(await canRead(T, 'p1/dekont1.jpg')).toBe(true);                                  // yükleyen okur
  expect(await canRead(A, 'p1/dekont1.jpg')).toBe(true);                                  // yönetici okur
  expect(await canRead(X, 'p1/dekont1.jpg')).toBe(false);                                 // yabancı okuyamaz
});

test('yalnızca yönetici karar verir; kiracı kendi denetimini değiştiremez', async () => {
  await as(T);
  expect((await q(`update public.reviews set status = 'approved' where kind = 'payment' returning 1`)).length).toBe(0);
  await as(L);
  expect((await q(`update public.reviews set status = 'approved' where kind = 'payment' returning 1`)).length).toBe(0);
  await as(A);
  await expect(db.query(`update public.reviews set status = 'rejected' where kind = 'payment'`)).rejects.toThrow(/gerekçe/);
  await expect(db.query(`update public.reviews set label = 'x' where kind = 'payment'`)).rejects.toThrow(/kendisi değiştirilemez/);
});

test('yönetici onaylar: mülk sahibi dekontu ve dosyayı görür, bildirim gider, sonra onaylar', async () => {
  await as(A);
  await db.query(`update public.reviews set status = 'approved' where kind = 'payment' and ref_id = '2026-10'`);
  const r = (await q(`select status, reviewed_by from public.reviews where kind = 'payment'`))[0];
  expect(r.status).toBe('approved');
  expect(r.reviewed_by).toBe(A);

  expect((await notes(L)).some(n => /dekont geldi/.test(n.title) && /₺30\.000/.test(n.body))).toBe(true);
  await as(L);
  expect((await q(`select status from public.payments`))[0].status).toBe('review');
  expect(await canRead(L, 'p1/dekont1.jpg')).toBe(true);
  await db.query(`update public.payments set status = 'approved', approved_at = now() where property_id = 'p1' and month = '2026-10'`);
  expect((await notes(T)).some(n => n.title === 'Ödemen onaylandı')).toBe(true);
});

test('yönetici reddeder: gerekçe ile kiracıya döner, mülk sahibi görmez, yeniden yüklenince denetim baştan', async () => {
  await putFile('p1/dekont2.jpg', T);
  await as(T);
  await db.query(`insert into public.payments (property_id, month, status, amount, receipt_name, receipt_path)
                  values ('p1', '2026-11', 'review', 30000, 'bulanik.jpg', 'p1/dekont2.jpg')`);
  await as(A);
  await db.query(`update public.reviews set status = 'rejected', note = 'Dekont okunmuyor' where kind = 'payment' and ref_id = '2026-11'`);

  await as(T);
  const p = (await q(`select status, reject_reason from public.payments where month = '2026-11'`))[0];
  expect(p).toEqual({ status: 'rejected', reject_reason: 'Denetim: Dekont okunmuyor' });
  expect((await q(`select status, note from public.reviews where ref_id = '2026-11'`))[0]).toEqual({ status: 'rejected', note: 'Dekont okunmuyor' });
  expect((await notes(T)).some(n => n.title === 'Dekont reddedildi' && /Dekont okunmuyor/.test(n.body))).toBe(true);
  await as(L);
  expect((await q(`select * from public.payments where month = '2026-11'`))).toEqual([]);

  // Kiracı yeni dekont yükler → denetim yeniden beklemeye geçer.
  await putFile('p1/dekont3.jpg', T);
  await as(T);
  await db.query(`update public.payments set status = 'review', receipt_name = 'net.jpg', receipt_path = 'p1/dekont3.jpg', reject_reason = null
                  where property_id = 'p1' and month = '2026-11'`);
  const rv = (await q(`select status, note, label from public.reviews where ref_id = '2026-11'`))[0];
  expect(rv).toEqual({ status: 'pending', note: null, label: 'net.jpg' });
});

test('belge: karşı taraf onaydan sonra görür; reddedilirse yükleyen haberdar olur', async () => {
  await putFile('p1/sozlesme.pdf', T);
  await as(T);
  await db.query(`insert into public.documents (id, property_id, cat, name, path) values ('d1', 'p1', 'Kira sözleşmesi', 'sozlesme.pdf', 'sb:p1/sozlesme.pdf')`);
  expect((await q(`select count(*)::int c from public.documents`))[0].c).toBe(1);
  await as(L);
  expect(await q(`select * from public.documents`)).toEqual([]);
  expect(await canRead(L, 'p1/sozlesme.pdf')).toBe(false);

  await as(A);
  expect((await q(`select count(*)::int c from public.documents`))[0].c).toBe(1);        // yönetici hepsini görür
  await db.query(`update public.reviews set status = 'approved' where kind = 'document' and ref_id = 'd1'`);
  await as(L);
  expect((await q(`select name from public.documents`))[0].name).toBe('sozlesme.pdf');
  expect(await canRead(L, 'p1/sozlesme.pdf')).toBe(true);
  expect((await notes(L)).some(n => /yeni belge/.test(n.title))).toBe(true);

  // Mülk sahibinin belgesi reddedilir; kiracı hiç görmez, mülk sahibi bildirim alır.
  await putFile('p1/ruhsat.pdf', L);
  await as(L);
  await db.query(`insert into public.documents (id, property_id, cat, name, path) values ('d2', 'p1', 'Diğer', 'ruhsat.pdf', 'sb:p1/ruhsat.pdf')`);
  await as(T);
  expect((await q(`select id from public.documents`)).map(r => r.id)).toEqual(['d1']);
  await as(A);
  await db.query(`update public.reviews set status = 'rejected', note = 'Eksik sayfa' where kind = 'document' and ref_id = 'd2'`);
  expect((await notes(L)).some(n => /kabul edilmedi/.test(n.title) && /Eksik sayfa/.test(n.body))).toBe(true);
  await as(T);
  expect((await q(`select id from public.documents`)).map(r => r.id)).toEqual(['d1']);
});

test('fatura: mülk sahibi ekler, dosya kiracıya onaya kadar kilitli', async () => {
  await as(T);
  await db.query(`insert into public.requests (id, property_id, cat, title) values ('r1', 'p1', 'Arıza', 'Kombi')`);
  await putFile('p1/fatura.pdf', L);
  await as(L);
  await db.query(`update public.requests set invoice = '{"name":"fatura.pdf","path":"sb:p1/fatura.pdf","amount":2400,"date":"2026-10-20"}'::jsonb where id = 'r1'`);
  const rv = (await q(`select kind, status, amount::int a from public.reviews where kind = 'invoice'`))[0];
  expect(rv).toEqual({ kind: 'invoice', status: 'pending', a: 2400 });
  expect(await canRead(T, 'p1/fatura.pdf')).toBe(false);
  expect(await canRead(L, 'p1/fatura.pdf')).toBe(true);
  await as(A);
  await db.query(`update public.reviews set status = 'approved' where kind = 'invoice'`);
  expect(await canRead(T, 'p1/fatura.pdf')).toBe(true);
  expect((await notes(T)).some(n => /fatura eklendi/.test(n.title))).toBe(true);
});

test('yönetici kullanıcıları, evleri, üyelikleri ve ödemeleri okur; giderleri ve mesajları okumaz', async () => {
  await as(L);
  await db.query(`insert into public.expenses (id, property_id, cat, amount, spent_on) values ('e1', 'p1', 'Vergi', 1, current_date)`);
  await db.query(`insert into public.messages (id, property_id, from_role, by_user, body) values ('m1', 'p1', 'landlord', $1, 'merhaba')`, [L]);

  await as(A);
  const users = await q(`select email, role, is_admin from public.admin_users() order by email`);
  expect(users.map(u => u.email)).toEqual(['admin@ornek.com', 'diger@ornek.com', 'ev@ornek.com', 'kiraci@ornek.com']);
  expect(users.find(u => u.email === 'admin@ornek.com').is_admin).toBe(true);
  expect((await q(`select count(*)::int c from public.profiles`))[0].c).toBe(4);
  expect((await q(`select name from public.properties`))[0].name).toBe('Moda');
  expect((await q(`select count(*)::int c from public.memberships where property_id = 'p1'`))[0].c).toBe(2);
  expect((await q(`select count(*)::int c from public.payments`))[0].c).toBe(2);
  expect((await q(`select count(*)::int c from public.expenses`))[0].c).toBe(0);
  expect((await q(`select count(*)::int c from public.messages where from_role <> 'system'`))[0].c).toBe(0);
});

test('yönetici olmayan admin_users çağıramaz ve başkasının evini göremez', async () => {
  await as(T);
  await expect(db.query(`select * from public.admin_users()`)).rejects.toThrow(/Yönetici yetkisi/);
  await as(X);
  expect(await q(`select * from public.properties`)).toEqual([]);
  expect(await q(`select * from public.reviews`)).toEqual([]);
});

test('yazışmaya eklenen fotoğraf: evin üyeleri görür, dışarıdan biri göremez, bildirim metni olur', async () => {
  await putFile('p1/ariza.jpg', T);
  await as(T);
  await db.query(`insert into public.messages (id, property_id, from_role, body, image_path) values ('m-foto', 'p1', 'tenant', '', 'p1/ariza.jpg')`);
  expect((await q(`select image_path from public.messages where id = 'm-foto'`))[0].image_path).toBe('p1/ariza.jpg');
  expect(await canRead(L, 'p1/ariza.jpg')).toBe(true);        // mülk sahibi görür
  expect(await canRead(X, 'p1/ariza.jpg')).toBe(false);       // evin üyesi olmayan göremez
  await as(L);
  expect((await q(`select image_path from public.messages where id = 'm-foto'`)).length).toBe(1);
  await as(null);
  const n = await q(`select body from public.notifications where user_id = $1 order by id desc limit 1`, [L]);
  expect(n[0].body).toBe('Fotoğraf gönderdi');
});

test('yasaklama: yalnızca yönetici, gerekçeyle; kendini ve yöneticiyi yasaklayamaz', async () => {
  await as(T);
  await expect(db.query(`select public.admin_set_ban($1, true, 'x')`, [X])).rejects.toThrow(/Yönetici yetkisi/);
  await as(A);
  await expect(db.query(`select public.admin_set_ban($1, true, '')`, [T])).rejects.toThrow(/gerekçe/);
  await expect(db.query(`select public.admin_set_ban($1, true, 'x')`, [A])).rejects.toThrow(/Kendini/);
  await db.exec(`reset role; insert into public.admins (user_id) values ('${X}')`); await as(A);
  await expect(db.query(`select public.admin_set_ban($1, true, 'x')`, [X])).rejects.toThrow(/Yönetici yasaklanamaz/);
  await db.exec(`reset role; delete from public.admins where user_id = '${X}'`);
});

test('yasaklanan hesap hiçbir içeriği okuyamaz ya da yazamaz; kendi yasak kaydını görür; Auth girişi kapanır', async () => {
  await as(null);
  await db.query(`insert into auth.sessions (user_id) values ($1)`, [T]);
  await as(T);
  await db.query(`insert into public.messages (id, property_id, from_role, body) values ('m-ok', 'p1', 'tenant', 'merhaba')`);
  await as(A);
  await db.query(`select public.admin_set_ban($1, true, 'Taciz içerikli mesajlar')`, [T]);

  await as(T);
  expect(await q(`select * from public.properties`)).toEqual([]);
  expect(await q(`select * from public.messages`)).toEqual([]);
  expect(await q(`select * from public.payments`)).toEqual([]);
  await expect(db.query(`insert into public.messages (id, property_id, from_role, body) values ('m-ban', 'p1', 'tenant', 'yazarım')`)).rejects.toThrow();
  await expect(db.query(`update public.profiles set name = 'x' where id = '${T}'`)).resolves.toBeDefined();
  expect((await q(`select name from public.profiles where id = $1`, [T]))[0].name).toBe('Kiracı');   // güncelleme sessizce 0 satır
  const mine = await q(`select reason from public.bans`);
  expect(mine).toEqual([{ reason: 'Taciz içerikli mesajlar' }]);
  expect(await canRead(T, 'p1/ariza.jpg')).toBe(false);

  // Başkası etkilenmez; mülk sahibi eski yazışmayı görmeye devam eder.
  await as(L);
  expect((await q(`select id from public.messages where id = 'm-ok'`)).length).toBe(1);
  expect(await q(`select * from public.bans`)).toEqual([]);          // başkasının yasak kaydını görmez

  await as(null);
  expect((await q(`select banned_until is not null as b from auth.users where id = $1`, [T]))[0].b).toBe(true);
  expect((await q(`select count(*)::int c from auth.sessions where user_id = $1`, [T]))[0].c).toBe(0);

  await as(A);
  const u = (await q(`select * from public.admin_users()`)).find(x => x.id === T);
  expect(u.banned).toBe(true);
  expect(u.ban_reason).toBe('Taciz içerikli mesajlar');
});

test('yasak kaldırılınca erişim geri gelir; Auth yasağı da kalkar', async () => {
  await as(A);
  await db.query(`select public.admin_set_ban($1, false)`, [T]);
  await as(T);
  expect((await q(`select id from public.properties`)).length).toBe(1);
  await db.query(`insert into public.messages (id, property_id, from_role, body) values ('m-geri', 'p1', 'tenant', 'döndüm')`);
  await as(null);
  expect((await q(`select banned_until is null as b from auth.users where id = $1`, [T]))[0].b).toBe(true);
});

test('yönetici yazışmaları listeler ve okur; okuma denetim kaydına düşer; yönetici olmayan okuyamaz', async () => {
  await as(X);
  await expect(db.query(`select * from public.admin_threads()`)).rejects.toThrow(/Yönetici yetkisi/);
  await expect(db.query(`select * from public.admin_messages('p1')`)).rejects.toThrow(/Yönetici yetkisi/);
  await as(A);
  const th = await q(`select * from public.admin_threads()`);
  expect(th.length).toBe(1);
  expect(th[0]).toMatchObject({ property_id: 'p1', owner_name: 'Ev Sahibi' });
  expect(Number(th[0].msg_count)).toBeGreaterThanOrEqual(3);
  expect(th[0].tenants).toContain('Kiracı');
  const msgs = await q(`select * from public.admin_messages('p1')`);
  expect(msgs.some(m => m.body === 'merhaba' && m.by_name === 'Kiracı')).toBe(true);
  expect(msgs.some(m => m.image_path === 'p1/ariza.jpg')).toBe(true);
  const log = await q(`select action, target, admin_name from public.admin_audit_log()`);
  expect(log.some(x => x.action === 'messages.view' && x.target === 'p1' && x.admin_name === 'Yönetici')).toBe(true);
});

test('mesaj silme denetim kaydına düşer; denetim kaydı değiştirilemez, silinemez, yönetici dışı okuyamaz', async () => {
  await as(A);
  await db.query(`select public.admin_delete_message('m-geri')`);
  expect((await q(`select id from public.messages where id = 'm-geri'`)).length).toBe(0);
  await expect(db.query(`select public.admin_delete_message('yok')`)).rejects.toThrow(/bulunamadı/);
  const log = await q(`select action, target, detail from public.admin_audit_log()`);
  expect(log.some(x => x.action === 'message.delete' && x.target === 'p1' && x.detail.message === 'm-geri')).toBe(true);
  expect(log.some(x => x.action === 'user.ban' && x.target === T)).toBe(true);
  expect(log.some(x => x.action === 'user.unban' && x.target === T)).toBe(true);
  // yönetici bile kayda dokunamaz
  expect(await db.query(`update public.admin_audit set action = 'x'`).then(r => r.affectedRows)).toBe(0);
  expect(await db.query(`delete from public.admin_audit`).then(r => r.affectedRows)).toBe(0);
  await expect(db.query(`insert into public.admin_audit (action) values ('sahte')`)).rejects.toThrow();
  await expect(db.query(`select public.audit('sahte', 'x')`)).rejects.toThrow();
  await as(T);
  expect(await q(`select * from public.admin_audit`)).toEqual([]);
  await expect(db.query(`select * from public.admin_audit_log()`)).rejects.toThrow(/Yönetici yetkisi/);
});

test('yükleme kararı denetim kaydına düşer', async () => {
  await as(A);
  const [r] = await q(`select kind, property_id, ref_id from public.reviews where status = 'pending' limit 1`);
  expect(r, 'bekleyen yükleme olmalı').toBeTruthy();
  await db.query(`update public.reviews set status = 'approved' where kind = $1 and property_id = $2 and ref_id = $3`, [r.kind, r.property_id, r.ref_id]);
  const log = await q(`select action, target from public.admin_audit_log()`);
  expect(log.some(x => x.action === 'review.approved' && x.target === `${r.kind}:${r.property_id}:${r.ref_id}`)).toBe(true);
});
