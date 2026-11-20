// Abonelik/erişim açıkları (20261120135929_abonelik_erisim): çift rollü kullanıcı kiracı olarak yazabilir; paket adedinin altına inince
// sınırın dışındaki mülklere yazılamaz; deneme bitiş hatırlatması (3 gün, 1 gün, bitti) bir kez gider. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, ID, tryCall } from './db-helpers.mjs';

const { L, L2, T, X } = ID;
let db, as, q;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

const sub = async (uid, product) => { await as(null); await db.query(
  `insert into public.subscriptions (user_id, product_id, store, period_type, expires_at, active, will_renew)
   values ($1, $2, 'app_store', 'normal', now() + interval '20 days', true, true)
   on conflict (user_id) do update set product_id = excluded.product_id, expires_at = excluded.expires_at, active = true`, [uid, product]); };

test('çift rol: denemesi biten mülk sahibi hesabı, kiracı olduğu evde dekont yükler ve talep açar; mülk sahibi olarak yazamaz', async () => {
  // T: p1'de kiracı. Mülk sahibi rolü ekler, 40 gün önce başlamış gibi (deneme bitti).
  await as(T);
  expect((await q(`select public.add_landlord_role() r`))[0].r).toBe('landlord');
  await as(null);
  await db.query(`update public.profiles set landlord_since = now() - interval '40 days', created_at = now() - interval '40 days' where id = $1`, [T]);
  expect((await q(`select public.access_state($1) a`, [T]))[0].a).toMatchObject({ access: false, role: 'landlord' });

  await as(T);
  await q(`insert into public.payments (property_id, month, status, amount, receipt_name, receipt_path) values ('p1', '2026-11', 'review', 30000, 'k.png', 'p1/k.png')`);
  await q(`insert into public.requests (id, property_id, cat, title) values ('r-dual', 'p1', 'Arıza', 'Kombi')`);
  await q(`update public.property_shared set renewal = '{"tenant":"ok"}'::jsonb where property_id = 'p1'`).catch(() => {});
  expect((await q(`select count(*)::int n from public.requests where id = 'r-dual'`))[0].n).toBe(1);

  // Mülk sahibi olarak (kendi mülkü) hâlâ engelli.
  expect(await tryCall(db, `insert into public.properties (id, owner_id, name) values ('t-own', '${T}', 'Benim')`)).toMatch(/Abonelik gerekli/);
});

test('mülk sahibi olarak hâlâ engelli: denemesi biten sahibin kendi mülkündeki yazımı ve eş-mülk sahibi üyeliği EV402 verir', async () => {
  await as(null);
  await db.query(`update public.profiles set created_at = now() - interval '40 days' where id = $1`, [L2]);
  await as(L2);
  expect(await tryCall(db, `update public.properties set name = 'x' where id = 'p2'`)).toMatch(/Abonelik gerekli/);
  expect(await tryCall(db, `insert into public.requests (id, property_id, cat, title) values ('r-l2', 'p2', 'Arıza', 'x')`)).toMatch(/Abonelik gerekli/);
  // Aynı hesap, kiracı olduğu başka mülkte (X'in değil L'nin p1'i: L2'yi p1'e kiracı yapalım) yazabilir; p1'de mülk sahibi (landlord üyeliği) olursa engellenir.
  await as(null);
  await db.query(`insert into public.memberships (property_id, user_id, role) values ('p1', $1, 'tenant')`, [L2]);
  await as(L2);
  await q(`insert into public.requests (id, property_id, cat, title) values ('r-l2-t', 'p1', 'Arıza', 'kiracı olarak')`);
  await as(null);
  await db.query(`update public.memberships set role = 'landlord' where property_id = 'p1' and user_id = $1`, [L2]);
  await as(L2);
  expect(await tryCall(db, `insert into public.requests (id, property_id, cat, title) values ('r-l2-l', 'p1', 'Arıza', 'sahip olarak')`)).toMatch(/Abonelik gerekli/);
});

test('paket adedinin altına inme: sınırın dışında kalan (en yeni) mülklere yazılamaz, ilk N mülk yazılır, silme serbest', async () => {
  await as(null);
  await db.query(`delete from public.subscriptions`);
  await db.query(`update public.profiles set created_at = now() where id = $1`, [L]);
  await sub(L, 'tek_3_aylik');
  await as(L);
  await q(`insert into public.properties (id, owner_id, name) values ('y2', $1, 'İkinci'), ('y3', $1, 'Üçüncü')`, [L]);
  await as(null);
  await db.query(`update public.properties set created_at = now() - interval '3 days' where id = 'p1'`);
  await db.query(`update public.properties set created_at = now() - interval '2 days' where id = 'y2'`);
  await db.query(`update public.properties set created_at = now() - interval '1 day' where id = 'y3'`);
  await sub(L, 'tek_2_aylik');                                     // 3 mülk, 2 adet: y3 dışarıda
  await as(L);
  await q(`update public.properties set name = 'Moda 2' where id = 'p1'`);
  await q(`update public.properties set name = 'İkinci 2' where id = 'y2'`);
  expect(await tryCall(db, `update public.properties set name = 'Üçüncü 2' where id = 'y3'`)).toMatch(/Paket sınırı: en fazla 2 mülk/);
  expect((await q(`select name from public.properties where id = 'y3'`))[0].name).toBe('Üçüncü');   // okuma serbest
  // Kiracı bu mülkte yazabilmeli (ör. kiracının tetiklediği güncellemeler sahibin sınırına takılmaz).
  await q(`delete from public.properties where id = 'y3'`);
  await q(`update public.properties set name = 'Moda 3' where id = 'p1'`);
  // Yönetici sınıra takılmaz.
  await as(null);
  await sub(L, 'tek_1_aylik');
  await as(ID.A);
  await q(`update public.properties set name = 'Yönetici' where id = 'y2'`);
});

test('deneme bitiş hatırlatması: 3 gün, 1 gün ve bitince bildirim + e-posta; bir kez; abonelik, kurum, kiracı ve @anahtar.io hariç', async () => {
  await as(null);
  await db.query(`delete from public.subscriptions`);
  await db.query(`delete from public.notifications`);
  await db.query(`delete from public.mail_outbox`);
  await db.query(`delete from public.memberships where user_id = $1`, [L2]);
  await db.query(`update public.profiles set created_at = now(), landlord_since = null, extra_trial_days = 0 where id in ($1, $2, $3)`, [L, L2, T]);
  const day = (n) => new Date(Date.now() + n * 864e5);
  const today = (d) => d.toISOString().slice(0, 10);
  const run = async (d) => (await q(`select public.trial_reminders($1::date) n`, [today(d)]))[0].n;
  // L'nin denemesi 30 gün sonra biter; 27. günde (3 gün kala) ilk hatırlatma.
  await db.query(`update public.profiles set extra_trial_days = 0 where id = $1`, [L]);
  expect(await run(day(10))).toBe(0);
  const n3 = await run(day(27));
  expect(n3).toBeGreaterThanOrEqual(1);
  const notes = await q(`select title, tag, url from public.notifications where user_id = $1`, [L]);
  expect(notes).toEqual([{ title: 'Deneme süren 3 gün sonra bitiyor', tag: 'trial-3', url: '/uygulama/ayarlar' }]);
  const mail = await q(`select kind, to_email, data from public.mail_outbox where to_email = 'ev@ornek.com'`);
  expect(mail).toHaveLength(1);
  expect(mail[0].kind).toBe('admin_message');
  expect(mail[0].data.subject).toBe('Deneme süren 3 gün sonra bitiyor');
  expect(mail[0].data.body).toContain('https://anahtar.io');
  expect(await run(day(27))).toBe(0);                              // aynı aşama tekrar gitmez
  expect(await run(day(26.9))).toBe(0);
  // Aşama 1 ve 0.
  expect(await run(day(29))).toBeGreaterThanOrEqual(1);
  expect((await q(`select title from public.notifications where user_id = $1 and tag = 'trial-1'`, [L]))[0].title).toBe('Deneme süren 1 gün sonra bitiyor');
  expect(await run(day(30))).toBeGreaterThanOrEqual(1);
  expect((await q(`select title from public.notifications where user_id = $1 and tag = 'trial-0'`, [L]))[0].title).toBe('Deneme süren bitti');
  expect(await run(day(31))).toBe(0);
  expect((await q(`select count(*)::int n from public.mail_outbox where to_email = 'ev@ornek.com'`))[0].n).toBe(3);
  // Kiracı hesap (rol tenant) hiç hatırlatma almaz; yönetici paketi olanlar da.
  expect((await q(`select count(*)::int n from public.notifications where user_id in ($1, $2)`, [X, ID.A]))[0].n).toBe(0);
});

test('deneme hatırlatması: abonelik, @anahtar.io ve kartlı deneme hariç; işlev dışarıdan çağrılamaz', async () => {
  await as(null);
  await db.query(`delete from public.notifications`);
  await db.query(`delete from public.mail_outbox`);
  await db.query(`delete from public.trial_reminder_log`);
  await sub(L, 'tek_1_aylik');                                     // abonelik var → hatırlatma yok
  await sub(T, 'tek_1_aylik');
  await db.query(`update auth.users set email = 'ekip@anahtar.io' where id = $1`, [L2]);   // iç hesap
  const d = new Date(Date.now() + 27 * 864e5).toISOString().slice(0, 10);
  expect((await q(`select public.trial_reminders($1::date) n`, [d]))[0].n).toBe(0);
  await db.query(`update auth.users set email = 'ev2@ornek.com' where id = $1`, [L2]);
  expect((await q(`select public.trial_reminders($1::date) n`, [d]))[0].n).toBe(1);   // yalnız L2
  // Günlük cron billing_reminders aracılığıyla da çalışır (dönüş değeri yalnız mağaza yenileme bildirimleri).
  await db.query(`delete from public.trial_reminder_log`); await db.query(`delete from public.notifications`);
  expect((await q(`select public.billing_reminders($1::date) n`, [d]))[0].n).toBe(0);
  expect((await q(`select count(*)::int n from public.notifications where tag = 'trial-3'`))[0].n).toBe(1);
  await db.query(`delete from public.trial_reminder_log`); await db.query(`delete from public.notifications`);
  await db.query(`select set_config('anahtar.card_trial_from', (now() - interval '1 hour')::text, false)`);
  expect((await q(`select public.trial_reminders($1::date) n`, [d]))[0].n).toBe(0);   // kartlı: uygulama içi deneme yok
  await db.query(`select set_config('anahtar.card_trial_from', '', false)`);
  for (const who of [L, T, null]) {
    await as(who, who === null);
    expect(await tryCall(db, `select public.trial_reminders()`)).toMatch(/permission denied/);
  }
});
