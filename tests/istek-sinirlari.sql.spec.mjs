// Migration istek_sinirlari: destek talebinde e-posta zorlaması ve günlük sınır, submit_lead / report_error IP sınırları, plan seçimi ve davet e-postası
// günlük sınırı, web push uç noktası izin listesi, cihaz anahtarı kaydet/sil işlevleri, sayaç temizliği.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const { L, T, X, L2, A } = ID;
let db, as, q;

const ip = (v) => db.exec(`select set_config('request.headers', '${v ? JSON.stringify({ 'x-forwarded-for': v }) : ''}', false)`);
const lead = (o = {}) => JSON.stringify({ name: 'Ayşe Yılmaz', email: 'ayse@firma.com', company: 'Yılmaz Emlak', consent: true, ...o });

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

/* ---------------------------------------------------------------- support_requests */

test('destek talebi: e-posta hesabın e-postasına zorlanır; web kaynağı ve başkası adına yazma reddedilir; günde en çok 10', async () => {
  await as(T);
  // istemci başka bir e-posta yazsa da kaydedilen hesabın e-postasıdır (lead-mail onayı yalnız hesabın adresine gider)
  await q(`insert into public.support_requests (user_id, kind, name, email, message) values ('${T}', 'genel', 'Kiracı', 'kurban@baska.com', 'merhaba')`);
  await q(`insert into public.support_requests (user_id, kind, name, message) values ('${T}', 'import', 'Kiracı', 'e-postasız')`);
  expect((await q(`select email from public.support_requests order by created_at, id`)).map((r) => r.email)).toEqual(['kiraci@ornek.com', 'kiraci@ornek.com']);
  // başkasının kimliğiyle, web kaynağıyla, hazır "done" durumuyla yazılamaz
  expect(await tryCall(db, `insert into public.support_requests (user_id, kind, name) values ('${L}', 'genel', 'x')`)).toMatch(/row-level security/);
  expect(await tryCall(db, `insert into public.support_requests (user_id, kind, name, source) values ('${T}', 'kurumsal', 'x', 'web')`)).toMatch(/row-level security/);
  expect(await tryCall(db, `insert into public.support_requests (user_id, kind, name, status) values ('${T}', 'genel', 'x', 'done')`)).toMatch(/row-level security/);
  // günlük sınır: 2 kayıt var, 8 daha geçer, 11. reddedilir; başka kullanıcı etkilenmez
  for (let i = 0; i < 8; i++) await q(`insert into public.support_requests (user_id, kind, name) values ('${T}', 'genel', 'k${i}')`);
  expect(await tryCall(db, `insert into public.support_requests (user_id, kind, name) values ('${T}', 'genel', 'fazla')`)).toMatch(/Günlük başvuru sınırına ulaştın/);
  await as(L);
  await q(`insert into public.support_requests (user_id, kind, name, email) values ('${L}', 'upgrade', 'Ev Sahibi', 'baskasi@x.com')`);
  expect((await q(`select email from public.support_requests`))[0].email).toBe('ev@ornek.com');
  // bir gün sonra T yeniden yazabilir
  await as(null);
  await db.exec(`update public.support_requests set created_at = now() - interval '25 hours' where user_id = '${T}'`);
  await as(T);
  await q(`insert into public.support_requests (user_id, kind, name) values ('${T}', 'genel', 'yarın')`);
  // yabancı ve oturumsuz
  await as(null, true);
  expect(await tryCall(db, `insert into public.support_requests (kind, name) values ('genel', 'x')`)).toMatch(/permission denied/);
  // başkaları okuyamaz; yönetici okur
  await as(X);
  expect(await q(`select id from public.support_requests`)).toEqual([]);
  await as(A);
  expect((await q(`select id from public.support_requests`)).length).toBeGreaterThan(10);
});

/* ---------------------------------------------------------------- submit_lead */

test('submit_lead: IP başına saatte 5 başvuru (farklı e-postalarla da); farklı IP etkilenmez; IP yoksa eski sınırlar', async () => {
  await as(null);
  await db.exec(`delete from public.support_requests where source = 'web'; delete from public.request_log`);
  await as(null, true);
  await ip('198.51.100.20, 10.0.0.1');
  for (let i = 0; i < 5; i++) await q(`select public.submit_lead($1::jsonb)`, [lead({ email: `kisi${i}@firma${i}.com` })]);
  expect(await tryCall(db, `select public.submit_lead($1::jsonb)`, [lead({ email: 'altinci@baska.com' })])).toMatch(/Çok sık başvuru/);
  await ip('198.51.100.21');
  await q(`select public.submit_lead($1::jsonb)`, [lead({ email: 'altinci@baska.com' })]);
  // geçersiz başvuru sayaç yazmaz (doğrulama sınırdan önce)
  await ip('198.51.100.22');
  expect(await tryCall(db, `select public.submit_lead($1::jsonb)`, [lead({ email: 'bozuk' })])).toMatch(/e-posta/);
  expect((await (async () => { await as(null); return q(`select count(*)::int c from public.request_log where kind = 'lead' and subject = '198.51.100.22'`); })())[0].c).toBe(0);
  // saat geçince açılır
  await as(null);
  await db.exec(`update public.request_log set at = now() - interval '61 minutes'`);
  await as(null, true);
  await ip('198.51.100.20');
  await q(`select public.submit_lead($1::jsonb)`, [lead({ email: 'yeniden@firma.com' })]);
  // IP bilgisi olmayan çağrı (sunucu içi / eski yol) yalnız e-posta başına ve sistem sınırına bakar
  await ip(null);
  await q(`select public.submit_lead($1::jsonb)`, [lead({ email: 'ipsiz@firma.com' })]);
});

/* ---------------------------------------------------------------- report_error */

test('report_error: oturumsuz kayıtta IP başına saatte 60; oturumlu kişi başına 30 (eskisi gibi); sınır aşılınca sessizce atlanır', async () => {
  await as(null);
  await db.exec(`delete from public.client_errors; delete from public.request_log`);
  await as(null, true);
  await ip('203.0.113.77');
  for (let i = 0; i < 70; i++) await q(`select public.report_error($1::jsonb)`, [JSON.stringify({ message: 'hata ' + i })]);
  await as(null);
  expect((await q(`select count(*)::int c from public.client_errors where user_id is null`))[0].c).toBe(60);
  await as(null, true);
  await ip('203.0.113.78');
  await q(`select public.report_error($1::jsonb)`, [JSON.stringify({ message: 'başka ip' })]);
  await as(null);
  expect((await q(`select count(*)::int c from public.client_errors where user_id is null`))[0].c).toBe(61);
  // oturumlu: IP sınırı uygulanmaz, kişi başına 30 sınırı sürer
  await as(T);
  await ip('203.0.113.77');
  for (let i = 0; i < 35; i++) await q(`select public.report_error($1::jsonb)`, [JSON.stringify({ message: 'oturumlu ' + i })]);
  await as(null);
  expect((await q(`select count(*)::int c from public.client_errors where user_id = '${T}'`))[0].c).toBe(30);
  await ip(null);
});

/* ---------------------------------------------------------------- queue_plan_choice ve davet e-postası */

test('plan seçimi: kullanıcı başına günde en çok 5 e-posta (her farklı adet ayrı e-posta üretirdi); tek seçim eskisi gibi çalışır', async () => {
  await as(null);
  await db.exec(`delete from public.mail_outbox`);
  await as(L);
  const set = (units) => q(`update public.profiles set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{planChoice}', $1::jsonb) where id = '${L}'`, [JSON.stringify({ plan: 'tek', units: String(units), yearly: false })]);
  for (let u = 1; u <= 9; u++) await set(u);
  await as(null);
  expect((await q(`select count(*)::int c from public.mail_outbox where kind = 'plan_choice'`))[0].c).toBe(5);
  // başka kullanıcı etkilenmez
  await as(L2);
  await q(`update public.profiles set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{planChoice}', '{"plan":"bes","units":"2","yearly":true}'::jsonb) where id = '${L2}'`);
  await as(null);
  expect((await q(`select count(*)::int c from public.mail_outbox where kind = 'plan_choice' and data ->> 'user' = '${L2}'`))[0].c).toBe(1);
});

test('invite_mail_claim: mülk sahibi başına günde en çok 40 davet e-postası ({throttled:true}); aynı davet 2 dakikada bir; süre geçince açılır', async () => {
  await as(null);
  await db.exec(`delete from public.request_log`);
  const codes = [];
  for (let i = 0; i < 42; i++) {
    const [{ code }] = (await db.query(`insert into public.invites (property_id, created_by, email, name) values ('p1', '${L}', $1, 'Kiracı') returning code`, [`k${i}@ornek.com`])).rows;
    codes.push(code);
  }
  for (let i = 0; i < 40; i++) expect((await q(`select public.invite_mail_claim('${L}', $1) r`, [codes[i]]))[0].r).toMatchObject({ email: `k${i}@ornek.com`, owner: 'Ev Sahibi' });
  expect((await q(`select public.invite_mail_claim('${L}', $1) r`, [codes[40]]))[0].r).toEqual({ throttled: true });
  expect((await q(`select mailed_at from public.invites where code = $1`, [codes[40]]))[0].mailed_at).toBeNull();     // sınırlanan davet "gönderildi" işaretlenmez
  expect((await q(`select public.invite_mail_claim('${L}', $1) r`, [codes[0]]))[0].r).toEqual({ throttled: true });   // 2 dakika sınırı (eskisi gibi)
  // başka mülk sahibi etkilenmez
  const [{ code: c2 }] = (await db.query(`insert into public.invites (property_id, created_by, email, name) values ('p2', '${L2}', 'x@ornek.com', 'Kiracı') returning code`)).rows;
  expect((await q(`select public.invite_mail_claim('${L2}', $1) r`, [c2]))[0].r.email).toBe('x@ornek.com');
  await db.exec(`update public.request_log set at = now() - interval '25 hours'`);
  expect((await q(`select public.invite_mail_claim('${L}', $1) r`, [codes[41]]))[0].r.email).toBe('k41@ornek.com');
  // istemci doğrudan çağıramaz
  await as(L);
  expect(await tryCall(db, `select public.invite_mail_claim('${L}', 'X')`)).toMatch(/permission denied for function/);
  expect(await tryCall(db, `select public.rate_ok('x', 'y', 1, interval '1 hour')`)).toMatch(/permission denied for function/);
  await as(null, true);
  expect(await tryCall(db, `select * from public.request_log`)).toMatch(/permission denied/);
});

/* ---------------------------------------------------------------- push_subscriptions.endpoint */

test('push uç noktası: yalnız bilinen itme servislerinin https adresleri; benzer ya da uydurma adresler reddedilir', async () => {
  await as(T);
  const keys = JSON.stringify({ p256dh: 'a', auth: 'b' });
  const ins = (ep) => tryCall(db, `insert into public.push_subscriptions (endpoint, user_id, keys) values ($1, '${T}', $2::jsonb)`, [ep, keys]);
  for (const ok of ['https://fcm.googleapis.com/fcm/send/abc', 'https://updates.push.services.mozilla.com/wpush/v2/abc', 'https://web.push.apple.com/QWERT',
                    'https://api.push.apple.com/3/device/x', 'https://wns2-par02p.notify.windows.com/w/?token=abc', 'https://FCM.googleapis.com:443/fcm/send/x']) {
    expect(await ins(ok), ok).toBeNull();
  }
  for (const bad of ['http://fcm.googleapis.com/fcm/send/abc', 'https://fcm.googleapis.com.evil.com/x', 'https://evil.com/fcm.googleapis.com/', 'https://localhost/x',
                     'https://169.254.169.254/latest/meta-data', 'https://user@fcm.googleapis.com/x', 'https://notify.windows.com.evil.io/x', 'https://push.apple.com.evil.io/x',
                     'javascript:alert(1)', 'https://fcm.googleapis.com:8443/x', '', 'https://fcm.googleapis.com/' + 'a'.repeat(2100)]) {
    expect(await ins(bad), bad.slice(0, 60)).toMatch(/push_subscriptions_endpoint_host/);
  }
  // güncelleme ile adres değiştirilemez; kural doğrulanmış
  expect(await tryCall(db, `update public.push_subscriptions set endpoint = 'https://evil.com/x' where user_id = '${T}'`)).toMatch(/push_subscriptions_endpoint_host/);
  await as(null);
  expect((await q(`select convalidated from pg_constraint where conname = 'push_subscriptions_endpoint_host'`))[0].convalidated).toBe(true);
  await as(X);
  expect(await q(`select endpoint from public.push_subscriptions`)).toEqual([]);                      // başkasının aboneliği görünmez
});

/* ---------------------------------------------------------------- cihaz anahtarı */

test('cihaz anahtarı: register anahtarı çağırana bağlar (paylaşılan cihazda devralır); unregister kendi ya da yetim anahtarı siler; yabancı kullanıcıya dokunamaz', async () => {
  await as(null);
  await db.exec(`delete from public.device_tokens; delete from auth.sessions`);
  const TOK = 'ExponentPushToken[ornek-cihaz-anahtari-1]';
  await as(T);
  await q(`select public.register_device_token($1, 'ios')`, [TOK]);
  expect((await q(`select user_id, platform from public.device_tokens`))[0]).toEqual({ user_id: T, platform: 'ios' });
  // aynı cihazda başka kullanıcı oturum açtı: anahtar ona geçer (eski tablo politikası upsert'i reddederdi)
  await as(L);
  expect(await tryCall(db, `insert into public.device_tokens (token, user_id, platform) values ($1, '${L}', 'ios') on conflict (token) do update set user_id = '${L}'`, [TOK])).toBeTruthy();
  await q(`select public.register_device_token($1, 'android')`, [TOK]);
  await as(null);
  expect((await q(`select user_id, platform from public.device_tokens`))).toEqual([{ user_id: L, platform: 'android' }]);
  await as(T);
  expect(await q(`select token from public.device_tokens`)).toEqual([]);                              // T artık göremez
  // T, L'nin açık oturumu varken L'nin anahtarını silemez
  await as(null);
  await db.exec(`insert into auth.sessions (user_id) values ('${L}')`);
  await as(T);
  await q(`select public.unregister_device_token($1)`, [TOK]);
  await as(null);
  expect((await q(`select count(*)::int c from public.device_tokens`))[0].c).toBe(1);
  // L kendi anahtarını siler
  await as(L);
  await q(`select public.unregister_device_token($1)`, [TOK]);
  await as(null);
  expect((await q(`select count(*)::int c from public.device_tokens`))[0].c).toBe(0);
  // yetim anahtar: sahibinin açık oturumu yoksa (çıkış yapılmış, uygulama yeniden başlatılmış) başkası da temizleyebilir
  await as(L);
  await q(`select public.register_device_token($1, 'ios')`, [TOK]);
  await as(null);
  await db.exec(`delete from auth.sessions`);
  await as(T);
  await q(`select public.unregister_device_token($1)`, [TOK]);
  await as(null);
  expect((await q(`select count(*)::int c from public.device_tokens`))[0].c).toBe(0);
  // doğrulama ve yetki
  await as(T);
  expect(await tryCall(db, `select public.register_device_token($1, 'windows')`, [TOK])).toMatch(/Geçersiz platform/);
  expect(await tryCall(db, `select public.register_device_token('kisa', 'ios')`)).toMatch(/Geçersiz cihaz anahtarı/);
  expect(await tryCall(db, `select public.register_device_token(null, 'ios')`)).toMatch(/Geçersiz cihaz anahtarı/);
  await as(null, true);
  expect(await tryCall(db, `select public.register_device_token($1, 'ios')`, [TOK])).toMatch(/permission denied for function/);
  expect(await tryCall(db, `select public.unregister_device_token($1)`, [TOK])).toMatch(/permission denied for function/);
});

test('cihaz anahtarı: kullanıcı başına en çok 20 anahtar (en eskiler düşer)', async () => {
  await as(null);
  await db.exec(`delete from public.device_tokens`);
  await as(T);
  for (let i = 0; i < 25; i++) {
    await q(`select public.register_device_token($1, 'android')`, ['cihaz-anahtari-numara-' + String(i).padStart(2, '0')]);
    await as(null); await db.exec(`update public.device_tokens set created_at = now() - interval '${100 - i} minutes' where token = 'cihaz-anahtari-numara-${String(i).padStart(2, '0')}'`); await as(T);
  }
  await as(null);
  const left = (await q(`select token from public.device_tokens where user_id = '${T}' order by token`)).map((r) => r.token);
  expect(left.length).toBe(20);
  expect(left[0]).toBe('cihaz-anahtari-numara-05');                                                    // 00-04 düştü
});

/* ---------------------------------------------------------------- temizlik */

test('prune_logs: 2 günden eski sayaç kayıtları silinir', async () => {
  await as(null);
  await db.exec(`delete from public.request_log; insert into public.request_log (at, kind, subject) values (now() - interval '3 days', 'lead', '1.1.1.1'), (now(), 'lead', '2.2.2.2')`);
  await q(`select public.prune_logs()`);
  expect((await q(`select subject from public.request_log`)).map((r) => r.subject)).toEqual(['2.2.2.2']);
});
