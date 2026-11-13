// Migration saklama_sureleri: gizlilik sayfalarının vaat ettiği saklama süreleri uygulanır.
//  (a) prune_logs: mail_outbox 90 gün, çözülmüş destek talebi 6 ay; admin_audit dokunulmaz
//  (b) delete_my_account: destek talebi anonimleşir, hesap silindi e-postası yalnız gerekli alanlarla kuyruğa girer (90 günde silinir), hukuki talep gider
//  (c) revenuecat_deletions: silinen hesabın kimliği kuyruğa yazılır; kuyruk istemciye kapalı
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const U = '00000000-0000-0000-0000-0000000000e1';
let db, as, q;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

test('prune_logs: 90 günden eski mail_outbox (gönderilmiş, başarısız, takılı) ve 6 aydan eski çözülmüş destek talebi silinir; yeniler, açık talepler ve admin_audit kalır', async () => {
  await as(null);
  const old = `now() - interval '91 days'`, fresh = `now() - interval '89 days'`;
  await db.exec(`insert into public.mail_outbox (kind, to_email, sent_at, attempts, created_at) values
    ('account_deleted', 'a@x.com', now(), 1, ${old}), ('account_deleted', 'b@x.com', null, 5, ${old}), ('account_deleted', 'c@x.com', null, 0, ${old}),
    ('account_deleted', 'd@x.com', now(), 1, ${fresh}), ('account_deleted', 'e@x.com', null, 0, ${fresh})`);
  await db.exec(`insert into public.support_requests (id, kind, name, email, status, created_at) values
    ('00000000-0000-0000-0000-00000000aa01', 'genel', 'Eski çözülmüş', 'a@x.com', 'done', now() - interval '7 months'),
    ('00000000-0000-0000-0000-00000000aa02', 'genel', 'Yeni çözülmüş', 'b@x.com', 'done', now() - interval '5 months'),
    ('00000000-0000-0000-0000-00000000aa03', 'genel', 'Eski açık', 'c@x.com', 'open', now() - interval '7 months')`);
  await db.exec(`insert into public.admin_audit (at, action) values (now() - interval '5 years', 'eski-denetim')`);
  await q(`select public.prune_logs()`);
  expect((await q(`select to_email from public.mail_outbox order by to_email`)).map((r) => r.to_email)).toEqual(['d@x.com', 'e@x.com']);
  expect((await q(`select name from public.support_requests order by name`)).map((r) => r.name)).toEqual(['Eski açık', 'Yeni çözülmüş']);
  expect((await q(`select id from public.admin_audit where action = 'eski-denetim'`)).length).toBe(1);
  await as(ID.T);
  expect(await tryCall(db, `select public.prune_logs()`)).toBeTruthy();                // kullanıcı çağıramaz
  await as(null);
  await db.exec(`delete from public.mail_outbox; delete from public.support_requests`);
});

test('delete_my_account: destek talepleri anonimleşir (talep kalır), hukuki talep gider, e-posta kuyruğa yalnız adres/dil/ad ile, RevenueCat kuyruğuna kimlik yazılır', async () => {
  await as(null);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'silen@ornek.com', '{"name":"Silen Kişi","role":"landlord"}')`, [U]);
  await as(U);
  await q(`insert into public.support_requests (kind, name, email, phone, message, company, details) values ('genel', 'Silen Kişi', 'silen@ornek.com', '0555', 'Özel mesaj', 'Firma', '{"x":1}')`);
  await q(`insert into public.legal_requests (role, topic, body) values ('landlord', 'depozito', 'Depozito iadesi')`);
  expect((await q(`select count(*)::int c from public.legal_requests`))[0].c).toBe(1);
  await q(`select public.delete_my_account()`);
  await as(null);
  const sr = await q(`select user_id, name, email, phone, message, company, details, kind, status from public.support_requests`);
  expect(sr).toEqual([{ user_id: null, name: 'silindi', email: '', phone: '', message: '', company: '', details: {}, kind: 'genel', status: 'open' }]);
  expect((await q(`select count(*)::int c from public.legal_requests`))[0].c).toBe(0);
  const mail = await q(`select kind, to_email, lang, data, created_at > now() - interval '1 minute' as taze from public.mail_outbox where kind = 'account_deleted' and to_email = 'silen@ornek.com'`);
  expect(mail).toEqual([{ kind: 'account_deleted', to_email: 'silen@ornek.com', lang: 'tr', data: { name: 'Silen Kişi', by: 'self' }, taze: true }]);
  expect((await q(`select user_id from public.revenuecat_deletions`)).map((r) => r.user_id)).toEqual([U]);
  expect((await q(`select count(*)::int c from auth.users where id = $1`, [U]))[0].c).toBe(0);
  // hesap silindi e-postası da 90 günde silinir
  await db.exec(`update public.mail_outbox set created_at = now() - interval '91 days' where to_email = 'silen@ornek.com'`);
  await q(`select public.prune_logs()`);
  expect((await q(`select id from public.mail_outbox where to_email = 'silen@ornek.com'`)).length).toBe(0);
});

test('revenuecat_deletions: istemciye kapalı (RLS açık, politika ve yetki yok); ikinci silme aynı kimliği tekrarlamaz', async () => {
  await as(null);
  expect((await q(`select relrowsecurity from pg_class where oid = 'public.revenuecat_deletions'::regclass`))[0].relrowsecurity).toBe(true);
  expect((await q(`select count(*)::int c from pg_policies where tablename = 'revenuecat_deletions'`))[0].c).toBe(0);
  for (const role of ['authenticated', 'anon']) expect((await q(`select has_table_privilege('${role}', 'public.revenuecat_deletions', 'select, insert, update, delete') p`))[0].p).toBe(false);
  for (const who of [ID.T, ID.L, ID.A]) {
    await as(who);
    for (const sql of [`select * from public.revenuecat_deletions`, `insert into public.revenuecat_deletions (user_id) values ('${who}')`, `delete from public.revenuecat_deletions`])
      expect(await tryCall(db, sql), sql).toMatch(/permission denied/);
  }
  await as(null);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'ikinci@ornek.com', '{"name":"İkinci","role":"landlord"}')`, ['00000000-0000-0000-0000-0000000000e2']);
  await db.exec(`insert into public.revenuecat_deletions (user_id) values ('00000000-0000-0000-0000-0000000000e2')`);
  await as('00000000-0000-0000-0000-0000000000e2');
  await q(`select public.delete_my_account()`);                                           // kimlik zaten kuyrukta: on conflict do nothing
  await as(null);
  expect((await q(`select count(*)::int c from public.revenuecat_deletions where user_id = '00000000-0000-0000-0000-0000000000e2'`))[0].c).toBe(1);
});

test('admin_delete_user: destek talepleri anonimleşir, RevenueCat kuyruğuna kimlik yazılır, e-posta kuyruğa girer', async () => {
  const V = '00000000-0000-0000-0000-0000000000e3';
  await as(null);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'yasakli@ornek.com', '{"name":"Yasaklı Kişi","role":"landlord"}')`, [V]);
  await db.exec(`insert into public.support_requests (user_id, kind, name, email, phone, message, company, details) values ('${V}', 'genel', 'Yasaklı Kişi', 'yasakli@ornek.com', '0555', 'Özel mesaj', 'Firma', '{"x":1}')`);
  await db.exec(`insert into public.bans (user_id) values ('${V}')`);
  await as(ID.A);
  await q(`select public.admin_delete_user($1, 'Sahte hesap')`, [V]);
  await as(null);
  const sr = await q(`select user_id, name, email, phone, message, company, details, kind from public.support_requests where name = 'silindi' and kind = 'genel' and user_id is null`);
  expect(sr.length).toBeGreaterThanOrEqual(1);
  expect((await q(`select count(*)::int c from public.support_requests where email = 'yasakli@ornek.com'`))[0].c).toBe(0);
  expect((await q(`select user_id from public.revenuecat_deletions where user_id = $1`, [V])).length).toBe(1);
  expect((await q(`select data from public.mail_outbox where to_email = 'yasakli@ornek.com'`))[0].data.by).toBe('admin');
  expect((await q(`select count(*)::int c from auth.users where id = $1`, [V]))[0].c).toBe(0);
});
