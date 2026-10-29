// Mülk başına abonelik: adet ürün kimliğinden, mülk sınırı, SMS kapısı, yenileme öncesi hatırlatma, kartlı deneme.
// Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, ID, tryCall } from './db-helpers.mjs';

const { L, L2, T } = ID;
let db, as, q;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

const sub = async (uid, product, extra = {}) => { await as(null); return db.query(
  `insert into public.subscriptions (user_id, product_id, store, period_type, expires_at, active, will_renew)
   values ($1, $2, $3, $4, $5, true, $6) on conflict (user_id) do update set product_id = excluded.product_id, store = excluded.store,
     period_type = excluded.period_type, expires_at = excluded.expires_at, active = true, will_renew = excluded.will_renew`,
  [uid, product, extra.store ?? 'app_store', extra.period ?? 'normal', extra.expires ?? new Date(Date.now() + 20 * 864e5).toISOString(), extra.renew ?? true]); };
const acc = async (uid) => { await as(null); return (await q(`select public.access_state($1) a`, [uid]))[0].a; };

test('ürün kimliğinden adet: tek_3_aylik → 3 mülk; yabancı kimlik → paketin varsayılanı (9); Portföy yıllık 7 mülk', async () => {
  await as(null);
  const u = async (p) => (await q(`select public.product_units($1) u`, [p]))[0].u;
  expect(await u('tek_3_aylik')).toBe(3);
  expect(await u('bes_9_yillik')).toBe(9);
  for (const bad of ['tek_0_aylik', 'tek_10_aylik', 'bes_3_haftalik', 'evim_aylik', 'kurumsal_3_aylik', 'tek']) expect(await u(bad)).toBeNull();
  await sub(L, 'tek_3_aylik');
  expect(await acc(L)).toMatchObject({ plan: 'tek', units: 3, subscribed: true });
  await sub(L, 'bes_7_yillik');
  expect(await acc(L)).toMatchObject({ plan: 'bes', units: 7 });
  await sub(L, 'evim_aylik_tek');
  expect(await acc(L)).toMatchObject({ plan: 'tek', units: 9 });       // eski kimlik: adet yok → paketin üst sınırı
});

test('mülk sınırı: satın alınan adet kadar mülk eklenir, sonrası EV403 ile reddedilir', async () => {
  await sub(L, 'tek_2_aylik');
  await as(L);
  // L'nin p1 mülkü var (newDb); ikinci mülk serbest, üçüncü reddedilir.
  await q(`insert into public.properties (id, owner_id, name) values ('x2', $1, 'İkinci')`, [L]);
  expect(await tryCall(db, `insert into public.properties (id, owner_id, name) values ('x3', '${L}', 'Üçüncü')`)).toMatch(/Paket sınırı: en fazla 2 mülk/);
  await sub(L, 'tek_3_aylik');
  await as(L);
  await q(`insert into public.properties (id, owner_id, name) values ('x3', $1, 'Üçüncü')`, [L]);
  expect((await q(`select count(*)::int n from public.properties where owner_id = $1`, [L]))[0].n).toBe(3);
});

test('SMS kapısı: Başlangıç hayır; Portföy, Kurumsal, deneme ve sınırsız evet; kiracıya SMS mülk sahibinin paketine bağlı', async () => {
  await as(null);
  const ok = async (uid, pid = null) => (await q(`select public.sms_allowed($1, $2) a`, [uid, pid]))[0].a;
  await sub(L, 'tek_3_aylik');
  expect(await ok(L)).toBe(false);
  expect(await ok(T, 'p1')).toBe(false);                    // p1'in sahibi L (Başlangıç) → kiracıya da SMS yok
  await sub(L, 'bes_3_aylik');
  expect(await ok(L)).toBe(true);
  expect(await ok(T, 'p1')).toBe(true);
  await sub(L, 'kurumsal');
  expect(await ok(L)).toBe(true);
  await db.query(`delete from public.subscriptions where user_id = $1`, [L]);
  expect(await ok(L)).toBe(true);                            // yeni hesap: deneme süresince açık
  await db.query(`update public.profiles set created_at = now() - interval '90 days' where id = $1`, [L]);
  expect(await ok(L)).toBe(false);                           // deneme bitti, abonelik yok
  for (const who of [L, T, null]) {
    await as(who, who === null);
    expect(await tryCall(db, `select public.sms_allowed('${L}', null)`)).toMatch(/permission denied/);
  }
});

test('yenileme hatırlatması: ertesi gün yenilenen / denemesi biten abonelere bildirim; iptal edilen, yönetici paketi ve ikinci çalıştırma hariç', async () => {
  await as(null);
  await db.query(`delete from public.subscriptions`);
  await db.query(`delete from public.notifications`);
  const tomorrow = new Date(Date.now() + 864e5).toISOString();
  const day2 = new Date(Date.now() + 2 * 864e5).toISOString();
  await sub(L, 'bes_3_aylik', { expires: tomorrow });
  await sub(T, 'tek_1_yillik', { expires: tomorrow, period: 'trial', store: 'play_store' });
  await sub(L2, 'bes_2_aylik', { expires: tomorrow, renew: false });          // iptal edilmiş
  await sub(ID.X, 'tek_1_aylik', { expires: tomorrow, store: 'admin' });       // yönetici elle verdi
  await sub(ID.A, 'tek_1_aylik', { expires: day2 });                           // 2 gün sonra
  const n = (await q(`select public.billing_reminders() n`))[0].n;
  expect(n).toBe(2);
  const notes = await q(`select user_id, title, body, tag, url from public.notifications where tag like 'bill-%' order by title`);
  expect(notes.map((r) => r.user_id).sort()).toEqual([L, T].sort());
  const byUser = Object.fromEntries(notes.map((r) => [r.user_id, r]));
  expect(byUser[L].title).toBe('Aboneliğin yarın yenilenecek');
  expect(byUser[L].body).toContain('Portföy · 3 mülk · aylık');
  expect(byUser[L].body).toContain('App Store abonelik ayarlarından');
  expect(byUser[T].title).toBe('Ücretsiz denemen yarın bitiyor');
  expect(byUser[T].body).toContain('Yarın ilk ödemen alınacak');
  expect(byUser[T].body).toContain('Başlangıç · 1 mülk · yıllık');
  expect(byUser[T].body).toContain('Google Play abonelik ayarlarından');
  expect(notes[0].tag).toMatch(/^bill-\d{8}$/);
  expect((await q(`select public.billing_reminders() n`))[0].n).toBe(0);       // aynı gün tekrar gönderilmez
  await as(L);
  expect(await tryCall(db, `select public.billing_reminders()`)).toMatch(/permission denied/);
});

test('kartlı deneme: kesimden sonra açılan hesaba kartsız deneme verilmez; önce açılanlar denemesini sürdürür; bayrak yokken eski davranış', async () => {
  await as(null);
  await db.query(`delete from public.subscriptions`);
  await db.query(`update public.profiles set created_at = now() where id in ($1, $2)`, [L, L2]);
  expect(await acc(L)).toMatchObject({ plan: 'trial', inTrial: true, cardTrial: false });       // bayrak kapalı: eski davranış
  const cut = new Date(Date.now() - 3600_000).toISOString();                                      // 1 saat önce
  await db.query(`select set_config('anahtar.card_trial_from', $1, false)`, [cut]);
  await db.query(`update public.profiles set created_at = now() - interval '2 hours' where id = $1`, [L]);   // kesimden önce
  expect(await acc(L)).toMatchObject({ inTrial: true, cardTrial: false });
  expect(await acc(L2)).toMatchObject({ access: false, inTrial: false, cardTrial: true, plan: null });       // kesimden sonra: deneme yok
  // Abonelik (mağazanın ücretsiz ayı da dahil) erişim verir.
  await sub(L2, 'bes_2_aylik', { period: 'trial', expires: new Date(Date.now() + 30 * 864e5).toISOString() });
  expect(await acc(L2)).toMatchObject({ access: true, subscribed: true, plan: 'bes', units: 2, trialPeriod: true, cardTrial: true });
  // Kiracı hesapları her zaman erişir.
  expect(await acc(T)).toMatchObject({ access: true });
  await db.query(`select set_config('anahtar.card_trial_from', '', false)`);
});
