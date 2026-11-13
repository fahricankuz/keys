// Migration kasa_sirlari: webhook tetikleyicileri ve HTTP zamanlanmış işler gizli değerleri Supabase Vault'tan ÇAĞRI ANINDA okur; tanımlarda gizli değer yoktur.
// Vault, pg_net ve pg_cron yerel testte yoktur: küçük taklitleri (vault.decrypted_secrets, net.http_post, cron.schedule) kurulup migration üzerinde sınanır.
// Gerçek pg_net/pg_cron/Vault ile deneme: staging'de değil (orada eklentiler yok) üretim uygulamasında plan sonrası, bkz. docs/guvenlik.md.
import { test, expect } from '@playwright/test';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { newDb, tryCall, ID, STUB, SCHEMA } from './db-helpers.mjs';

const parts = SCHEMA.split(/\n-- ===== migration: (\d{14}_kasa_sirlari\.sql) =====\n/);
const BEFORE = parts[0];
const KASA_FILE = parts[1];
const KASA = readFileSync(new URL('../supabase/migrations/' + KASA_FILE, import.meta.url), 'utf8');
const URL_BASE = 'https://ornek-proje.supabase.co/functions/v1';
const NAMES = ['anahtar_functions_url', 'anahtar_lead_secret', 'anahtar_mail_secret', 'anahtar_push_secret', 'anahtar_report_secret', 'anahtar_tufe_secret', 'anahtar_billing_secret'];
const VAL = (n) => (n === 'anahtar_functions_url' ? URL_BASE : 'deger-' + n + '-0123456789abcdef0123456789abcdef');   // yalnız test değerleri

// Eklenti taklitleri: gerçek sözleşmeye uygun imzalar (pg_net 0.20 net.http_post, pg_cron 1.6 cron.schedule/unschedule, Vault decrypted_secrets).
const EXT = `
  create schema vault;
  create table vault.secrets (id bigserial primary key, name text unique, secret text);
  create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
  create schema net;
  create table net.calls (id bigserial primary key, url text, body jsonb, headers jsonb, timeout int);
  create function net.http_post(url text, body jsonb default '{}', params jsonb default '{}', headers jsonb default '{"Content-Type": "application/json"}', timeout_milliseconds int default 5000)
    returns bigint language sql as $$ insert into net.calls (url, body, headers, timeout) values (url, body, headers, timeout_milliseconds) returning id $$;
  create schema cron;
  create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
  create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as
    $$ insert into cron.job (jobname, schedule, command) values (job_name, schedule, command) returning jobid $$;
  create function cron.unschedule(job_id bigint) returns boolean language sql as $$ delete from cron.job where jobid = job_id returning true $$;
  create table cron.job_run_details (runid bigserial primary key, end_time timestamptz);
`;
// Eski üretim durumu: düz metin başlıklı tetikleyici ve işler (burada yalnız "eski" olduklarını ayırt etmek için işaretli).
const OLD = `
  create function public.eski_webhook() returns trigger language plpgsql as $$ begin return new; end $$;
  create trigger talep after insert on public.support_requests for each row execute function public.eski_webhook();
  create trigger hukuki after insert on public.legal_requests for each row execute function public.eski_webhook();
  create trigger bildirim after insert on public.notifications for each row execute function public.eski_webhook();
  create trigger kuyruk after insert on public.mail_outbox for each row execute function public.eski_webhook();
  select cron.schedule('anahtar-mail-sweep', '*/15 * * * *', 'select eski');
  select cron.schedule('anahtar-rapor-aylik', '0 6 1 * *', 'select eski');
  select cron.schedule('anahtar-rapor-yillik', '30 6 1 1 *', 'select eski');
  select cron.schedule('tufe-sync-aylik', '0 13 * * *', 'select eski');
  select cron.schedule('anahtar-log-prune', '15 0 * * *', 'select public.prune_logs()');
`;

async function extDb() {
  const db = new PGlite();
  await db.exec(STUB);
  await db.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if; end $$;`);   // üretimde var
  await db.exec(EXT);
  await db.exec(BEFORE);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'ev@ornek.com', '{"name":"Ev Sahibi","role":"landlord"}')`, [ID.L]);
  await db.exec(`insert into public.profiles (id, role, name) values ('${ID.L}', 'landlord', 'Ev Sahibi') on conflict do nothing`);
  await db.exec(`insert into public.properties (id, owner_id, name, rent, due_day) values ('p1', '${ID.L}', 'Moda', 30000, 5)`);
  await db.exec(OLD);
  return db;
}
const putSecrets = (db, names = NAMES) => db.exec(names.map((n) => `insert into vault.secrets (name, secret) values ('${n}', '${VAL(n)}') on conflict (name) do update set secret = excluded.secret`).join(';'));
const hooks = async (db) => (await db.query(`select c.relname t, t.tgname n, p.proname f from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc p on p.oid = t.tgfoid
  where t.tgname in ('talep', 'hukuki', 'bildirim', 'kuyruk') order by 2`)).rows;
const jobs = async (db) => (await db.query(`select jobname, schedule, command from cron.job order by jobname`)).rows;
const calls = async (db) => (await db.query(`select url, body, headers, timeout from net.calls order by id`)).rows;

test.describe.configure({ mode: 'serial' });

test('Vault kaydı eksikse migration hiçbir şeyi değiştirmeden hata verir (eksik ad listelenir, değer yazılmaz); tetikleyici ve işler eski kalır', async () => {
  const db = await extDb();
  const before = { hooks: await hooks(db), jobs: await jobs(db) };
  expect(before.hooks.map((h) => h.f)).toEqual(['eski_webhook', 'eski_webhook', 'eski_webhook', 'eski_webhook']);
  // hiç kayıt yok
  let err = await db.exec(KASA).then(() => null, (e) => String(e.message));
  expect(err).toMatch(/Vault gizli anahtarı eksik: anahtar_billing_secret, anahtar_functions_url, anahtar_lead_secret, anahtar_mail_secret, anahtar_push_secret, anahtar_report_secret, anahtar_tufe_secret/);
  // yalnız biri eksik
  await putSecrets(db, NAMES.filter((n) => n !== 'anahtar_billing_secret'));
  err = await db.exec(KASA).then(() => null, (e) => String(e.message));
  expect(err).toMatch(/Vault gizli anahtarı eksik: anahtar_billing_secret\./);
  expect(err).not.toMatch(/deger-anahtar/);                                                    // hata iletisi değer taşımaz
  // boş değer eksik sayılır
  await db.exec(`insert into vault.secrets (name, secret) values ('anahtar_billing_secret', '   ')`);
  expect(await db.exec(KASA).then(() => null, (e) => String(e.message))).toMatch(/anahtar_billing_secret/);
  // hiçbir şey değişmedi: tetikleyiciler ve işler aynı, yardımcı işlevler oluşturulmadı (tek işlemde geri alındı)
  expect(await hooks(db)).toEqual(before.hooks);
  expect(await jobs(db)).toEqual(before.jobs);
  expect((await db.query(`select to_regprocedure('public.anahtar_call(text,text,text,jsonb,integer)') f`)).rows[0].f).toBeNull();
  expect((await db.query(`select count(*)::int c from cron.job where jobname in ('anahtar-billing-reconcile', 'anahtar-cron-prune')`)).rows[0].c).toBe(0);
});

test('kayıtlar tamamsa: 4 tetikleyici anahtar_webhook\'a, 6 iş anahtar_call\'a bağlanır; tanımlarda gizli değer ve Authorization yok', async () => {
  const db = await extDb();
  await putSecrets(db);
  await db.exec(KASA);
  expect(await hooks(db)).toEqual([
    { t: 'notifications', n: 'bildirim', f: 'anahtar_webhook' }, { t: 'legal_requests', n: 'hukuki', f: 'anahtar_webhook' },
    { t: 'mail_outbox', n: 'kuyruk', f: 'anahtar_webhook' }, { t: 'support_requests', n: 'talep', f: 'anahtar_webhook' }]);
  const j = Object.fromEntries((await jobs(db)).map((r) => [r.jobname, r]));
  expect(Object.keys(j).sort()).toEqual(['anahtar-billing-reconcile', 'anahtar-cron-prune', 'anahtar-log-prune', 'anahtar-mail-sweep', 'anahtar-rapor-aylik', 'anahtar-rapor-yillik', 'tufe-sync-aylik']);
  expect(j['anahtar-mail-sweep'].schedule).toBe('*/15 * * * *');
  expect(j['anahtar-rapor-aylik'].schedule).toBe('0 6 1 * *');
  expect(j['anahtar-rapor-yillik'].schedule).toBe('30 6 1 1 *');
  expect(j['tufe-sync-aylik'].schedule).toBe('0 13 * * *');
  expect(j['anahtar-billing-reconcile'].schedule).toBe('30 4 * * *');
  expect(j['anahtar-cron-prune'].schedule).toBe('20 0 * * *');
  expect(j['anahtar-log-prune'].command).toBe('select public.prune_logs()');                    // ilgisiz iş dokunulmadan kaldı
  // hiçbir tanımda gizli değer, Authorization ya da JWT yok
  const defs = [...(await jobs(db)).map((r) => r.command),
    ...(await db.query(`select pg_get_triggerdef(oid) d from pg_trigger where tgname in ('talep','hukuki','bildirim','kuyruk')`)).rows.map((r) => r.d),
    ...(await db.query(`select prosrc from pg_proc where proname in ('anahtar_call', 'anahtar_webhook', 'anahtar_secret')`)).rows.map((r) => r.prosrc)];
  for (const d of defs) { expect(d).not.toMatch(/deger-anahtar|eyJ|Bearer|authorization/i); expect(d).not.toMatch(/[A-Za-z0-9+/=_-]{40,}/); }
  // ikinci uygulama aynı sonucu verir (yeniden çalıştırılabilir)
  await db.exec(KASA);
  expect((await jobs(db)).length).toBe(7);
  expect((await hooks(db)).length).toBe(4);
});

test('webhook yükü ve başlıkları: işlev adresi Vault\'tan, gizli başlık işlevin adıyla (push: x-evim-secret), Authorization yok, zaman aşımı 10 sn, yük {type,table,schema,record,old_record}', async () => {
  const db = await extDb();
  await putSecrets(db);
  await db.exec(KASA);
  await db.exec(`insert into public.support_requests (kind, name, email, message) values ('genel', 'Ali', 'ali@ornek.com', 'merhaba')`);
  await db.exec(`insert into public.notifications (user_id, title, body, url) values ('${ID.L}', 'Başlık', 'Gövde', '/uygulama')`);
  await db.exec(`insert into public.mail_outbox (kind, to_email, lang, data) values ('account_deleted', 'x@ornek.com', 'tr', '{"a":1}')`);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${ID.L}', false)`);
  await db.exec(`insert into public.legal_requests (role, property_id, topic, body) values ('landlord', 'p1', 'gecikme', 'x')`);
  await db.exec(`reset role`);
  const c = await calls(db);
  const by = (fn) => c.filter((x) => x.url === `${URL_BASE}/${fn}`);
  expect(by('lead-mail').length).toBeGreaterThanOrEqual(1);
  const lead = by('lead-mail')[0];
  expect(Object.keys(lead.headers).sort()).toEqual(['Content-Type', 'x-anahtar-secret']);
  expect(lead.headers['x-anahtar-secret']).toBe(VAL('anahtar_lead_secret'));
  expect(lead.timeout).toBe(10000);
  expect(Object.keys(lead.body).sort()).toEqual(['old_record', 'record', 'schema', 'table', 'type']);
  expect(lead.body).toMatchObject({ type: 'INSERT', table: 'support_requests', schema: 'public', old_record: null });
  expect(lead.body.record).toMatchObject({ name: 'Ali', email: 'ali@ornek.com', message: 'merhaba', kind: 'genel' });
  const push = by('push');
  expect(push.length).toBe(1);
  expect(Object.keys(push[0].headers).sort()).toEqual(['Content-Type', 'x-evim-secret']);
  expect(push[0].headers['x-evim-secret']).toBe(VAL('anahtar_push_secret'));
  expect(push[0].body).toMatchObject({ type: 'INSERT', table: 'notifications', record: { title: 'Başlık', body: 'Gövde', user_id: ID.L } });
  const mail = by('mail-send');
  expect(mail.length).toBe(1);
  expect(Object.keys(mail[0].headers).sort()).toEqual(['Content-Type', 'x-anahtar-secret']);
  expect(mail[0].headers['x-anahtar-secret']).toBe(VAL('anahtar_mail_secret'));
  expect(mail[0].body).toMatchObject({ table: 'mail_outbox', record: { kind: 'account_deleted', to_email: 'x@ornek.com', data: { a: 1 } } });
  expect(by('lead-mail').some((x) => x.body.table === 'legal_requests')).toBe(true);           // hukuki tetikleyici de lead-mail'e gider
  for (const x of c) { expect(Object.keys(x.headers).map((k) => k.toLowerCase())).not.toContain('authorization'); expect(x.timeout).toBe(10000); }
});

test('zamanlanmış işler çalıştırılınca: doğru işlev, gövde ve gizli başlık; billing reconcile yalnız x-anahtar-secret (anahtar_billing_secret); prune 14 günden eskiyi siler', async () => {
  const db = await extDb();
  await putSecrets(db);
  await db.exec(KASA);
  for (const r of await jobs(db)) if (r.jobname !== 'anahtar-log-prune' && r.jobname !== 'anahtar-cron-prune') await db.exec(r.command);   // pg_cron'un yaptığı: komutu çalıştır
  const c = Object.fromEntries((await calls(db)).map((x) => [x.url.replace(URL_BASE + '/', '') + ':' + JSON.stringify(x.body), x]));
  const sweep = c['mail-send:{"sweep":true}'];
  expect(sweep.headers['x-anahtar-secret']).toBe(VAL('anahtar_mail_secret'));
  expect(sweep.timeout).toBe(10000);
  expect(c['report:{"period":"month"}'].headers['x-anahtar-secret']).toBe(VAL('anahtar_report_secret'));
  expect(c['report:{"period":"month"}'].timeout).toBe(120000);
  expect(c['report:{"period":"year"}'].headers['x-anahtar-secret']).toBe(VAL('anahtar_report_secret'));
  expect(c['tufe-sync:{}'].headers['x-anahtar-secret']).toBe(VAL('anahtar_tufe_secret'));
  const rec = c['billing:{"action":"reconcile"}'];
  expect(rec).toBeTruthy();
  expect(Object.keys(rec.headers).sort()).toEqual(['Content-Type', 'x-anahtar-secret']);        // Authorization yok, tek gizli başlık
  expect(rec.headers['x-anahtar-secret']).toBe(VAL('anahtar_billing_secret'));
  // prune işi: 14 günden eski çalıştırma kayıtları silinir
  await db.exec(`insert into cron.job_run_details (end_time) values (now() - interval '15 days'), (now() - interval '13 days'), (now())`);
  await db.exec((await jobs(db)).find((r) => r.jobname === 'anahtar-cron-prune').command);
  expect((await db.query(`select count(*)::int c from cron.job_run_details`)).rows[0].c).toBe(2);
});

test('gizli değer çağrı anında okunur: Vault\'ta döndürülünce yeni değer gider; kayıt silinirse ana işlem (başvuru, bildirim) yine kaydedilir', async () => {
  const db = await extDb();
  await putSecrets(db);
  await db.exec(KASA);
  await db.exec(`update vault.secrets set secret = 'DONDURULMUS-YENI-DEGER' where name = 'anahtar_lead_secret'`);
  await db.exec(`update vault.secrets set secret = 'https://baska-proje.supabase.co/functions/v1/' where name = 'anahtar_functions_url'`);   // sondaki / atılır
  await db.exec(`insert into public.support_requests (kind, name, email) values ('genel', 'Ali', 'ali@ornek.com')`);
  const last = (await calls(db)).pop();
  expect(last.url).toBe('https://baska-proje.supabase.co/functions/v1/lead-mail');
  expect(last.headers['x-anahtar-secret']).toBe('DONDURULMUS-YENI-DEGER');
  // kayıt silindi: webhook uyarı verir ama satır yazılır
  await db.exec(`delete from vault.secrets where name = 'anahtar_push_secret'`);
  const n0 = (await calls(db)).length;
  await db.exec(`insert into public.notifications (user_id, title, body) values ('${ID.L}', 'Kayıt', 'sürer')`);
  expect((await db.query(`select count(*)::int c from public.notifications where title = 'Kayıt'`)).rows[0].c).toBe(1);
  expect((await calls(db)).length).toBe(n0);                                                  // çağrı yapılmadı
  // geçersiz adres (https değil) de ana işlemi bozmaz
  await db.exec(`update vault.secrets set secret = 'http://acik-metin.example/functions/v1' where name = 'anahtar_functions_url'`);
  await db.exec(`insert into public.support_requests (kind, name, email) values ('genel', 'Veli', 'veli@ornek.com')`);
  expect((await db.query(`select count(*)::int c from public.support_requests where name = 'Veli'`)).rows[0].c).toBe(1);
  expect((await calls(db)).length).toBe(n0);
});

test('istemciler yardımcı işlevleri çağıramaz (Vault okuma, işlev çağırma); Vault ve sayaç tablosu istemciye kapalı', async () => {
  const db = await extDb();
  await putSecrets(db);
  await db.exec(KASA);
  for (const role of ['authenticated', 'anon']) {
    await db.exec(`set role ${role}`);
    for (const c of [`select public.anahtar_secret('anahtar_lead_secret')`, `select public.anahtar_call('push', 'anahtar_push_secret', 'x-evim-secret')`]) {
      expect(await db.query(c).then(() => null, (e) => String(e.message)), role + ' ' + c).toMatch(/permission denied/);
    }
    expect(await db.query(`select * from vault.decrypted_secrets`).then(() => null, (e) => String(e.message))).toMatch(/permission denied/);
    await db.exec(`reset role`);
  }
});

test('service_role (edge işlevleri) gizli değerleri okuyan işlevleri çağıramaz; yalnız sahibi (postgres, pg_cron) çağırır', async () => {
  const db = await extDb();
  await putSecrets(db);
  await db.exec(KASA);
  for (const f of ['public.anahtar_secret(text)', 'public.anahtar_call(text, text, text, jsonb, integer)', 'public.anahtar_webhook()']) {
    for (const role of ['service_role', 'authenticated', 'anon', 'public']) {
      expect((await db.query(`select ${role === 'public' ? `(select count(*) from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid = '${f}'::regprocedure and a.grantee = 0)::int > 0` : `has_function_privilege('${role}', '${f}', 'execute')`} as ok`)).rows[0].ok, role + ' ' + f).toBe(false);
    }
  }
});

test('eklentisiz ortam (yerel test, staging): kurulum atlanır, yardımcı işlevler oluşur, başvuru/bildirim yazımı etkilenmez', async () => {
  const { db, as, q } = await newDb();
  await as(null);
  expect((await q(`select count(*)::int c from pg_trigger where tgname in ('talep','hukuki','bildirim','kuyruk')`))[0].c).toBe(0);
  expect((await q(`select count(*)::int c from pg_proc where proname in ('anahtar_call', 'anahtar_webhook', 'anahtar_secret')`))[0].c).toBe(3);
  await as(ID.T);
  await q(`insert into public.support_requests (user_id, kind, name) values ('${ID.T}', 'genel', 'Kiracı')`);
  await as(null);
  expect((await q(`select count(*)::int c from public.support_requests`))[0].c).toBe(1);
  // yardımcı işlev vault yokken çalıştırılırsa hata verir (eklentisiz ortamda hiçbir yerden çağrılmaz)
  expect(await tryCall(db, `select public.anahtar_secret('x')`)).toMatch(/vault\.decrypted_secrets/);
});

test('migration dosyasında hiçbir gizli değer yok (JWT, Bearer, uzun rastgele dizgi, parola, anahtar öneki)', async () => {
  expect(KASA).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  expect(KASA).not.toMatch(/Bearer\s+[A-Za-z0-9]/);
  expect(KASA).not.toMatch(/\b(sk|pk|rk|whsec|sb_secret|sb_publishable)_[A-Za-z0-9]/);
  // 32+ karakterlik, hem harf hem rakam içeren dizgi yok (yorumdaki ayraç çizgileri ve işlev adları sayılmaz)
  expect(KASA.split(/[^A-Za-z0-9_+/=-]+/).filter((t) => t.length >= 32 && /\d/.test(t) && /[A-Za-z]/.test(t))).toEqual([]);
  expect(KASA).not.toMatch(/password|parola\s*[:=]/i);
  // yalnız Vault kayıt adları geçer
  for (const n of NAMES) expect(KASA).toContain(n);
});
