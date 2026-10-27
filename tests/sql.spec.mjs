// Supabase şemasının güvenlik ve bildirim kurallarını gerçek bir Postgres'te
// (PGlite, WASM) sınar. Supabase'in sağladığı auth ve storage şemaları taklit edilir.
import { test, expect } from '@playwright/test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const SCHEMA = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

const SUPABASE_STUB = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  end $$;
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
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

const L  = '00000000-0000-0000-0000-00000000000a';   // ev sahibi
const T1 = '00000000-0000-0000-0000-00000000000b';   // kiracı
const T2 = '00000000-0000-0000-0000-00000000000c';   // ev arkadaşı
const O  = '00000000-0000-0000-0000-00000000000d';   // yabancı
const A  = '00000000-0000-0000-0000-00000000000e';   // yönetici

let db;
const as = async uid => db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false);` + (uid ? ' set role authenticated;' : ''));
const q = async (sql, params) => (await db.query(sql, params)).rows;
const notes = async uid => { await as(null); return q('select title, body, url from public.notifications where user_id = $1 order by id', [uid]); };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  await db.exec(SCHEMA);
});

test('şema ikinci kez çalıştırılabilir', async () => {
  await db.exec(SCHEMA);
});

test('kayıt olunca rolüyle profil açılır', async () => {
  await as(null);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'ev@ornek.com', '{"name":"Ev Sahibi","role":"landlord"}'),
    ($2, 'k1@ornek.com', '{"name":"Kiracı Bir","role":"tenant"}'),
    ($3, 'k2@ornek.com', '{"name":"Kiracı İki","role":"tenant"}'),
    ($4, 'x@ornek.com',  '{"name":"Yabancı","role":"landlord"}'),
    ($5, 'admin@ornek.com', '{"name":"Yönetici","role":"tenant"}')`, [L, T1, T2, O, A]);
  await db.exec(`insert into public.admins (user_id) values ('${A}')`);
  const rows = await q('select id, role, name from public.profiles order by name');
  expect(rows.find(r => r.id === L).role).toBe('landlord');
  expect(rows.find(r => r.id === T1).role).toBe('tenant');
});

test('rol sonradan değiştirilemez', async () => {
  await as(T1);
  await expect(db.query(`update public.profiles set role = 'landlord' where id = $1`, [T1])).rejects.toThrow(/rolü değiştirilemez/);
});

test('yalnızca ev sahibi rolü ev ekler; sahiplik, ortak alan ve kira kaydı otomatik açılır', async () => {
  await as(T1);
  await expect(db.query(`insert into public.properties (id, owner_id, name, rent, due_day) values ('p1', $1, 'X', 1, 1)`, [T1])).rejects.toThrow();

  await as(L);
  const due = new Date(); due.setDate(due.getDate() + 3);
  await db.query(`insert into public.properties (id, owner_id, name, addr, rent, due_day, deposit, start_date, contract_end)
                  values ('p1', $1, 'Moda', 'Kadıköy', 30000, $2, 60000, current_date - 100, current_date + 30)`, [L, Math.min(28, due.getDate())]);
  expect(await q(`select role from public.memberships where property_id = 'p1'`)).toEqual([{ role:'landlord' }]);
  expect((await q(`select count(*)::int c from public.property_shared where property_id = 'p1'`))[0].c).toBe(1);
  expect((await q(`select amount::int a from public.rent_history where property_id = 'p1'`))[0].a).toBe(30000);
});

test('davet koduyla kiracı katılır; yabancı evi göremez', async () => {
  await as(L);
  const [{ code }] = await q(`insert into public.invites (property_id, name, created_by) values ('p1', 'Kiracı Bir', $1) returning code`, [L]);
  const [{ code: code2 }] = await q(`insert into public.invites (property_id, name, created_by) values ('p1', 'Kiracı İki', $1) returning code`, [L]);

  await as(O);
  await expect(db.query(`select public.accept_invite($1)`, [code])).rejects.toThrow(/kiracı hesapları/);
  expect(await q(`select * from public.properties`)).toEqual([]);

  await as(T1);
  expect((await q(`select public.accept_invite($1) as pid`, [code.toLowerCase()]))[0].pid).toBe('p1');
  await as(T2);
  await q(`select public.accept_invite($1)`, [code2]);
  await expect(db.query(`select public.accept_invite($1)`, [code])).rejects.toThrow(/kullanılmış/);

  await as(T1);
  expect((await q(`select name from public.properties`)).map(r => r.name)).toEqual(['Moda']);
  expect((await q(`select count(*)::int c from public.memberships where property_id = 'p1'`))[0].c).toBe(3);
  // Ortak evdeki kişilerin profilleri görünür, yabancınınki görünmez.
  const names = (await q(`select name from public.profiles`)).map(r => r.name).sort();
  expect(names).toEqual(['Ev Sahibi', 'Kiracı Bir', 'Kiracı İki']);
});

test('kiracı dekont yükler ama onaylayamaz; ev sahibi onaylar; bildirimler iki yöne gider', async () => {
  await as(T1);
  await db.query(`insert into public.payments (property_id, month, status, amount, receipt_name) values ('p1', '2026-01', 'review', 30000, 'd.pdf')`);
  await expect(db.query(`update public.payments set status = 'approved' where property_id = 'p1' and month = '2026-01'`)).rejects.toThrow(/yalnızca mülk sahibi/);
  await expect(db.query(`insert into public.payments (property_id, month, status, amount) values ('p1', '2026-02', 'approved', 1)`)).rejects.toThrow(/yalnızca mülk sahibi/);

  // Yönetici onaylayana kadar mülk sahibi dekontu göremez, onaylayamaz.
  await as(L);
  expect(await q(`select * from public.payments where property_id = 'p1'`)).toEqual([]);
  expect((await notes(L)).some(n => /dekont geldi/.test(n.title))).toBe(false);
  await as(A);
  await db.query(`update public.reviews set status = 'approved' where kind = 'payment' and property_id = 'p1' and ref_id = '2026-01'`);

  await as(L);
  await db.query(`update public.payments set status = 'approved', approved_at = now() where property_id = 'p1' and month = '2026-01'`);

  await as(T1);
  await expect(db.query(`update public.payments set amount = 1 where property_id = 'p1' and month = '2026-01'`)).rejects.toThrow(/Onaylanmış ödeme/);

  const ln = await notes(L);
  expect(ln.some(n => /dekont geldi/.test(n.title) && /₺30\.000/.test(n.body))).toBe(true);
  expect((await notes(T1)).some(n => n.title === 'Ödemen onaylandı')).toBe(true);
  expect((await notes(T2)).some(n => n.title === 'Ödemen onaylandı')).toBe(true);
});

test('giderler kiracıya kapalıdır', async () => {
  await as(L);
  await db.query(`insert into public.expenses (id, property_id, cat, amount, spent_on) values ('e1', 'p1', 'Emlak vergisi', 4000, current_date)`);
  await as(T1);
  expect(await q(`select * from public.expenses`)).toEqual([]);
  await expect(db.query(`insert into public.expenses (id, property_id, cat, amount, spent_on) values ('e2', 'p1', 'x', 1, current_date)`)).rejects.toThrow();
});

test('talepler: kiracı açar ve kapatır, masrafa dokunamaz', async () => {
  await as(T1);
  await db.query(`insert into public.requests (id, property_id, cat, title) values ('r1', 'p1', 'Arıza', 'Kombi')`);
  expect((await notes(L)).some(n => /yeni talep/.test(n.title))).toBe(true);

  await as(T1);
  await expect(db.query(`update public.requests set cost = 'Kiracı' where id = 'r1'`)).rejects.toThrow(/yalnızca mülk sahibi/);
  await expect(db.query(`update public.requests set status = 2 where id = 'r1'`)).rejects.toThrow(/yalnızca kapatabilir/);

  await as(L);
  await db.query(`update public.requests set status = 2, cost = 'Mülk sahibi' where id = 'r1'`);
  await as(T1);
  await db.query(`update public.requests set cost_ok = true, status = 3 where id = 'r1'`);
  // Ev sahibinin güncellemesi kiracıya gider; kiracının kapatması ev sahibine ve ev arkadaşına.
  // İşlemi yapan kişi kendi işlemi için bildirim almaz.
  expect((await notes(T1)).some(n => n.title === 'Talep güncellendi' && /İşlemde/.test(n.body))).toBe(true);
  expect((await notes(T1)).some(n => /Çözüldü/.test(n.body))).toBe(false);
  expect((await notes(L)).some(n => /Çözüldü/.test(n.body))).toBe(true);
  expect((await notes(T2)).some(n => /Çözüldü/.test(n.body))).toBe(true);
});

test('mesaj: gönderen rolü taklit edilemez; diğer üyelere bildirim gider', async () => {
  await as(T1);
  await expect(db.query(`insert into public.messages (id, property_id, from_role, by_user, body) values ('m0', 'p1', 'landlord', $1, 'sahte')`, [T1])).rejects.toThrow();
  await expect(db.query(`insert into public.messages (id, property_id, from_role, by_user, body) values ('m0', 'p1', 'tenant', $1, 'başkası adına')`, [L])).rejects.toThrow();
  await db.query(`insert into public.messages (id, property_id, from_role, by_user, body) values ('m1', 'p1', 'tenant', $1, 'Merhaba')`, [T1]);
  expect((await notes(L)).some(n => n.title === 'Kiracı Bir' && n.body === 'Merhaba')).toBe(true);
  expect((await notes(T2)).some(n => n.body === 'Merhaba')).toBe(true);
  expect((await notes(T1)).some(n => n.body === 'Merhaba')).toBe(false);
});

test('çıkış süreci: kimse karşı tarafın onayını veremez, kiracı kesinti giremez', async () => {
  await as(L);
  await db.query(`update public.property_shared set move_out = '{"rooms":[],"deductions":[],"tenantOk":false,"landlordOk":false,"refunded":null}' where property_id = 'p1'`);
  expect((await notes(T1)).some(n => /çıkış süreci başladı/.test(n.title))).toBe(true);

  await as(T1);
  await expect(db.query(`update public.property_shared set move_out = jsonb_set(move_out, '{landlordOk}', 'true') where property_id = 'p1'`)).rejects.toThrow(/karşı tarafın/i);
  await expect(db.query(`update public.property_shared set move_out = jsonb_set(move_out, '{deductions}', '[{"label":"x","amount":1}]') where property_id = 'p1'`)).rejects.toThrow(/yalnızca mülk sahibi/);
  await db.query(`update public.property_shared set move_out = jsonb_set(move_out, '{tenantOk}', 'true') where property_id = 'p1'`);

  await as(L);
  // Ev sahibi kesinti ekleyince kiracı onayını geri alabilir (true → false).
  await db.query(`update public.property_shared set move_out = move_out || '{"deductions":[{"label":"Boya","amount":4000}],"tenantOk":false}' where property_id = 'p1'`);
  await expect(db.query(`update public.property_shared set move_out = jsonb_set(move_out, '{tenantOk}', 'true') where property_id = 'p1'`)).rejects.toThrow(/karşı tarafın/i);
});

test('yenileme: kiracı yalnızca kabul eder; kabul kira geçmişine yazılır', async () => {
  await as(L);
  await db.query(`update public.property_shared set renewal = '{"amount":36000,"max":37500,"cpi":25,"status":"sent"}' where property_id = 'p1'`);
  expect((await notes(T1)).some(n => n.title === 'Yenileme teklifi geldi')).toBe(true);

  await as(T1);
  await expect(db.query(`update public.property_shared set renewal = '{"amount":30000,"max":37500,"cpi":25,"status":"accepted"}' where property_id = 'p1'`)).rejects.toThrow(/yalnızca kabul/);
  await db.query(`update public.property_shared set renewal = jsonb_set(renewal, '{status}', '"accepted"') where property_id = 'p1'`);

  await as(null);
  const hist = await q(`select from_date::text f, amount::int a from public.rent_history where property_id = 'p1' order by from_date`);
  const end = (await q(`select contract_end::text e from public.properties where id = 'p1'`))[0].e;
  expect(hist[hist.length - 1]).toEqual({ f:end, a:36000 });
  expect((await notes(L)).some(n => /teklif kabul edildi/.test(n.title))).toBe(true);
});

test('günlük hatırlatma eşik gününde bir kez üretilir', async () => {
  await as(null);
  const [{ due_day }] = await q(`select due_day from public.properties where id = 'p1'`);
  // Vadeye tam 3 gün kalan bir "bugün" seç (varsayılan eşik).
  const today = new Date(); today.setDate(1);
  const target = new Date(today.getFullYear(), today.getMonth(), due_day - 3);
  const day = target.getFullYear() + '-' + String(target.getMonth() + 1).padStart(2, '0') + '-' + String(target.getDate()).padStart(2, '0');
  await q(`delete from public.payments where property_id = 'p1' and month = $1`, [day.slice(0, 7)]);

  const first = (await q(`select public.daily_reminders($1::date) n`, [day]))[0].n;
  const second = (await q(`select public.daily_reminders($1::date) n`, [day]))[0].n;
  expect(first).toBeGreaterThanOrEqual(2);          // iki kiracı
  expect(second).toBe(0);                           // aynı gün tekrar yok
  expect((await notes(T2)).some(n => n.title === 'Kira günü yaklaşıyor')).toBe(true);
});

test('dosya deposu yalnızca ev üyelerine açık', async () => {
  await as(T1);
  await db.query(`insert into storage.objects (bucket_id, name) values ('evim', 'p1/dekont.jpg')`);
  await as(O);
  await expect(db.query(`insert into storage.objects (bucket_id, name) values ('evim', 'p1/sizinti.jpg')`)).rejects.toThrow();
  expect(await q(`select * from storage.objects`)).toEqual([]);
});

test('kiracı evden çıkarılınca erişimi biter', async () => {
  await as(L);
  await db.query(`delete from public.memberships where property_id = 'p1' and user_id = $1`, [T2]);
  await as(T2);
  expect(await q(`select * from public.payments`)).toEqual([]);
  expect(await q(`select * from public.messages`)).toEqual([]);
});

test('kullanıcı hesabını silebilir; sahibi olduğu evler de silinir', async () => {
  await as(null);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000ee', 'sil@ornek.com', '{"role":"landlord"}')`);
  await as('00000000-0000-0000-0000-0000000000ee');
  await db.query(`insert into public.properties (id, owner_id, name) values ('psil', '00000000-0000-0000-0000-0000000000ee', 'Silinecek')`);
  await db.query(`select public.delete_my_account()`);
  await as(null);
  expect(await q(`select * from public.properties where id = 'psil'`)).toEqual([]);
  expect(await q(`select * from public.profiles where id = '00000000-0000-0000-0000-0000000000ee'`)).toEqual([]);
});

test('kullanıcı kendi bildirimlerini silebilir, başkasınınkini göremez', async () => {
  await as(T1);
  const mine = (await q(`select count(*)::int c from public.notifications`))[0].c;
  expect(mine).toBeGreaterThan(0);
  await db.query(`delete from public.notifications`);
  expect((await q(`select count(*)::int c from public.notifications`))[0].c).toBe(0);
  await as(null);
  expect((await q(`select count(*)::int c from public.notifications where user_id = $1`, [L]))[0].c).toBeGreaterThan(0);
});

test('v4: mülk tipi, şirket kiracı ve stopaj saklanır; geçersiz tip reddedilir', async () => {
  await as(L);
  await db.query(`insert into public.properties (id, owner_id, name, rent, due_day, prop_type, area, company, stopaj, deposit_kind)
                  values ('pofis', $1, 'Ofis', 60000, 5, 'Ofis', 140, '{"name":"Örnek A.Ş.","taxNo":"1"}', true, 'Teminat mektubu')`, [L]);
  const [row] = await q(`select prop_type, area::int area, company->>'name' co, stopaj, deposit_kind from public.properties where id = 'pofis'`);
  expect(row).toEqual({ prop_type:'Ofis', area:140, co:'Örnek A.Ş.', stopaj:true, deposit_kind:'Teminat mektubu' });
  await expect(db.query(`update public.properties set prop_type = 'Villa' where id = 'pofis'`)).rejects.toThrow();
  // Eski kurulumdan gelen satır varsayılan olarak konuttur.
  expect((await q(`select prop_type from public.properties where id = 'p1'`))[0].prop_type).toBe('Konut');
});

test('v4 veri güncellemesi "Ev sahibi" değerini bildirim üretmeden yeniler', async () => {
  await as(null);
  await db.query(`alter table public.requests disable trigger on_request_change`);
  await db.query(`update public.requests set cost = 'Ev sahibi' where id = 'r1'`);
  await db.query(`alter table public.requests enable trigger on_request_change`);
  await db.query(`update public.properties set bills = '[{"n":"Su","who":"Ev sahibi"}]', aidat_payer = 'Ev sahibi' where id = 'p1'`);
  const before = (await q(`select count(*)::int c from public.notifications`))[0].c;
  await db.exec(SCHEMA);
  expect((await q(`select cost from public.requests where id = 'r1'`))[0].cost).toBe('Mülk sahibi');
  expect(await q(`select aidat_payer, bills from public.properties where id = 'p1'`)).toEqual([{ aidat_payer:'Mülk sahibi', bills:[{ n:'Su', who:'Mülk sahibi' }] }]);
  expect((await q(`select count(*)::int c from public.notifications`))[0].c).toBe(before);
});

/* ---- abonelik ---- */

const X = '00000000-0000-0000-0000-0000000000f1';   // denemesi bitmiş mülk sahibi

test('deneme süresindeki mülk sahibinin erişimi var; kiracı her zaman ücretsiz', async () => {
  await as(L);
  const a = (await q(`select public.my_access() a`))[0].a;
  expect(a).toMatchObject({ role:'landlord', access:true, inTrial:true, subscribed:false, trialDays:14 });
  await as(T1);
  expect((await q(`select public.my_access() a`))[0].a).toMatchObject({ role:'tenant', access:true });
});

test('deneme bitince mülk sahibi yazamaz, okur ve mesajlaşır; kiracı etkilenmez', async () => {
  await as(null);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'eski@ornek.com', '{"role":"landlord","name":"Eski"}')`, [X]);
  await as(X);
  await db.query(`insert into public.properties (id, owner_id, name, rent, due_day) values ('px', $1, 'Eski ev', 10000, 1)`, [X]);
  await as(null);
  await db.query(`update public.profiles set created_at = now() - interval '30 days' where id = $1`, [X]);
  await db.query(`insert into public.memberships (property_id, user_id, role) values ('px', $1, 'tenant')`, [T2]);

  await as(X);
  expect((await q(`select public.my_access() a`))[0].a).toMatchObject({ access:false, inTrial:false });
  await expect(db.query(`insert into public.properties (id, owner_id, name, rent, due_day) values ('px2', $1, 'Yeni', 1, 1)`, [X])).rejects.toThrow(/Abonelik gerekli/);
  await expect(db.query(`update public.properties set rent = 20000 where id = 'px'`)).rejects.toThrow(/Abonelik gerekli/);
  await expect(db.query(`insert into public.expenses (id, property_id, cat, amount, spent_on) values ('ex', 'px', 'Diğer', 1, current_date)`)).rejects.toThrow(/Abonelik gerekli/);
  expect((await q(`select name from public.properties where id = 'px'`))[0].name).toBe('Eski ev');
  await db.query(`insert into public.messages (id, property_id, from_role, by_user, body) values ('mx', 'px', 'landlord', $1, 'Merhaba')`, [X]);

  // Kiracı dekont yükleyebilir.
  await as(T2);
  await db.query(`insert into public.payments (property_id, month, status, amount) values ('px', '2026-03', 'review', 10000)`);
});

test('abonelik gelince yazma açılır; süresi geçmiş abonelik açmaz', async () => {
  await as(null);
  await db.query(`insert into public.subscriptions (user_id, active, expires_at, store, product_id) values ($1, true, now() - interval '1 day', 'app_store', 'aylik')`, [X]);
  await as(X);
  await expect(db.query(`update public.properties set rent = 20000 where id = 'px'`)).rejects.toThrow(/Abonelik gerekli/);

  await as(null);
  await db.query(`update public.subscriptions set expires_at = now() + interval '30 days', will_renew = true where user_id = $1`, [X]);
  await as(X);
  expect((await q(`select public.my_access() a`))[0].a).toMatchObject({ access:true, subscribed:true, store:'app_store', willRenew:true });
  await db.query(`update public.properties set rent = 20000 where id = 'px'`);
});

test('kullanıcı abonelik satırını kendisi yazamaz, başkasınınkini göremez', async () => {
  await as(L);
  await expect(db.query(`insert into public.subscriptions (user_id, active, expires_at) values ($1, true, now() + interval '1 year')`, [L])).rejects.toThrow();
  expect(await q(`select * from public.subscriptions`)).toEqual([]);
  await as(X);
  await expect(db.query(`update public.subscriptions set expires_at = now() + interval '10 years' where user_id = $1`, [X])).rejects.toThrow();
  expect((await q(`select count(*)::int c from public.subscriptions`))[0].c).toBe(1);
});

test('cihaz anahtarları: kullanıcı yalnızca kendi cihazını yazar ve görür', async () => {
  await as(T1);
  await db.query(`insert into public.device_tokens (token, user_id, platform) values ('tok-ios', $1, 'ios')`, [T1]);
  await expect(db.query(`insert into public.device_tokens (token, user_id, platform) values ('tok-x', $1, 'android')`, [L])).rejects.toThrow();
  await expect(db.query(`insert into public.device_tokens (token, user_id, platform) values ('tok-w', $1, 'windows')`, [T1])).rejects.toThrow();
  await as(L);
  expect(await q(`select * from public.device_tokens`)).toEqual([]);
  await as(T1);
  expect((await q(`select platform from public.device_tokens`))).toEqual([{ platform:'ios' }]);
});
