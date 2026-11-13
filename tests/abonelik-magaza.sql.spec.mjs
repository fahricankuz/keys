// Migration abonelik_magaza: app_config (billing_paused), mağaza test (sandbox) satın alımları gelir/KPI/hatırlatma dışında (erişim yine verir),
// billing_reconcile_candidates (günlük uzlaştırma adayları, yalnız service_role), hibe (admin/promotional) satırının mağaza eşitlemesine karşı koruması.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID, SCHEMA } from './db-helpers.mjs';

const { L, T, X, L2, A } = ID;
const L3 = '00000000-0000-0000-0000-0000000000b3';   // üçüncü mülk sahibi (admin hibe testi)
let db, as, q;

const sub = (uid, o = {}) => {
  const v = { product_id: 'tek_2_aylik', store: 'app_store', active: true, will_renew: true, billing_issue: false, environment: 'production', hours: 24 * 20, ...o };
  return db.query(`insert into public.subscriptions (user_id, entitlement, product_id, store, expires_at, active, will_renew, billing_issue, environment, updated_at)
    values ($1, 'pro', $2, $3, now() + ($4 || ' hours')::interval, $5, $6, $7, $8, now())
    on conflict (user_id) do update set product_id = excluded.product_id, store = excluded.store, expires_at = excluded.expires_at, active = excluded.active,
      will_renew = excluded.will_renew, billing_issue = excluded.billing_issue, environment = excluded.environment`,
    [uid, v.product_id, v.store, String(v.hours), v.active, v.will_renew, v.billing_issue, v.environment]);
};

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'ev3@ornek.com', '{"name":"Üçüncü Ev Sahibi","role":"landlord"}')`, [L3]);
  await db.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if; end $$;
                 alter role service_role bypassrls; grant usage on schema public to service_role; grant select, insert, update on public.subscriptions to service_role;`);   // üretimde service_role RLS'yi atlar
});

/* ---------------------------------------------------------------- app_config */

test('app_config: billing_paused doğru ile başlar; herkes (oturumsuz dahil) okur; yalnız yönetici yazar ve yazım işlem kaydına düşer', async () => {
  for (const who of [null, L, T, X, A]) {
    await as(who, who === null);
    expect((await q(`select value from public.app_config where key = 'billing_paused'`))[0].value, String(who)).toBe(true);
  }
  // yönetici dışı hiçbir rol yazamaz, değiştiremez, silemez
  for (const who of [L, T, X, L2]) {
    await as(who);
    expect(await tryCall(db, `insert into public.app_config (key, value) values ('billing_paused_x', 'false'::jsonb)`), String(who)).toMatch(/row-level security/);
    expect((await db.query(`update public.app_config set value = 'false'::jsonb where key = 'billing_paused'`)).affectedRows).toBe(0);
    expect((await db.query(`delete from public.app_config where key = 'billing_paused'`)).affectedRows).toBe(0);
  }
  await as(null, true);
  expect(await tryCall(db, `update public.app_config set value = 'false'::jsonb`)).toMatch(/permission denied/);
  expect(await tryCall(db, `insert into public.app_config (key, value) values ('x', '1'::jsonb)`)).toMatch(/permission denied/);
  expect(await tryCall(db, `delete from public.app_config`)).toMatch(/permission denied/);
  // yönetici bayrağı değiştirir
  await as(A);
  const [{ updated_at: t0 }] = await q(`select updated_at from public.app_config where key = 'billing_paused'`);
  await db.query(`update public.app_config set value = 'false'::jsonb where key = 'billing_paused'`);
  expect((await q(`select value, updated_at > $1::timestamptz newer from public.app_config where key = 'billing_paused'`, [t0]))[0]).toEqual({ value: false, newer: true });
  expect(await tryCall(db, `insert into public.app_config (key, value) values ('Gecersiz Anahtar', '1'::jsonb)`)).toMatch(/check constraint/);
  expect((await q(`select action, target, detail from public.admin_audit where action = 'config.set' order by id desc limit 1`))[0]).toEqual({ action: 'config.set', target: 'billing_paused', detail: { value: false } });
  // şema yeniden çalışınca yöneticinin değeri sıfırlanmaz (on conflict do nothing)
  await as(null);
  await db.exec(SCHEMA);
  expect((await q(`select value from public.app_config where key = 'billing_paused'`))[0].value).toBe(false);
  await db.exec(`update public.app_config set value = 'true'::jsonb where key = 'billing_paused'`);   // sonraki testler için başlangıç değeri
});

/* ---------------------------------------------------------------- sandbox */

test('sandbox: erişim verir (my_access) ama admin_kpis ödeyen/plan/gelir tabanı/ödeme sorunu/iptal sayımlarına girmez', async () => {
  await as(null);
  await db.exec(`delete from public.subscriptions`);
  await sub(L, { product_id: 'tek_3_aylik', environment: 'production', billing_issue: true, will_renew: false });
  await sub(L2, { product_id: 'bes_5_yillik', environment: 'sandbox', billing_issue: true, will_renew: false });
  await sub(L3, { product_id: 'bes_2_aylik', environment: 'production' });
  // sandbox hesabı erişir ve abone görünür (access_state değişmedi)
  await as(L2);
  expect((await q(`select public.my_access() a`))[0].a).toMatchObject({ access: true, subscribed: true, plan: 'bes', units: 5 });
  await as(ID.A);
  const [{ k }] = await q(`select public.admin_kpis(30) k`);
  expect(k.owners.paying).toBe(2);                                                           // L ve L3; L2 (sandbox) hariç
  expect(k.plans).toEqual({ tek: 1, bes: 1 });                                               // bes: yalnız L3
  expect(k.revenueBase).toEqual(expect.arrayContaining([expect.objectContaining({ plan: 'tek', owners: 1, units: 3 }), expect.objectContaining({ plan: 'bes', owners: 1, units: 2 })]));
  expect(k.revenueBase.reduce((n, r) => n + r.owners, 0)).toBe(2);
  expect(k.billingIssues).toBe(1);                                                           // yalnız L (sandbox değil)
  expect(k.cancelling).toBe(1);                                                              // yalnız L
  // aynı hesap üretim satın alımına dönünce sayıma girer
  await as(null);
  await sub(L2, { product_id: 'bes_5_yillik', environment: 'production', billing_issue: false });
  await as(ID.A);
  const [{ k: k2 }] = await q(`select public.admin_kpis(30) k`);
  expect(k2.owners.paying).toBe(3);
  expect(k2.revenueBase.reduce((n, r) => n + r.owners, 0)).toBe(3);
  // yönetici dışı kimse çağıramaz
  await as(L);
  expect(await tryCall(db, `select public.admin_kpis(30)`)).toMatch(/Yönetici yetkisi gerekli/);
  await as(null, true);
  expect(await tryCall(db, `select public.admin_kpis(30)`)).toMatch(/permission denied/);
});

test('billing_reminders: yarın yenilenecek üretim abonelikleri bildirim alır; sandbox almaz', async () => {
  await as(null);
  await db.exec(`delete from public.subscriptions; delete from public.notifications`);
  const tomorrowNoon = `((current_date + 1)::timestamp + interval '12 hours') at time zone 'Europe/Istanbul'`;
  for (const [uid, env] of [[L, 'production'], [L2, 'sandbox']]) {
    await db.query(`insert into public.subscriptions (user_id, product_id, store, expires_at, active, will_renew, environment) values ($1, 'tek_1_aylik', 'app_store', ${tomorrowNoon}, true, true, $2)`, [uid, env]);
  }
  await db.query(`select public.billing_reminders((now() at time zone 'Europe/Istanbul')::date)`);
  expect((await q(`select user_id from public.notifications where title like 'Aboneliğin yarın%'`)).map((r) => r.user_id)).toEqual([L]);
  await as(L);
  expect(await tryCall(db, `select public.billing_reminders(current_date)`)).toMatch(/permission denied/);
});

/* ---------------------------------------------------------------- reconcile adayları */

test('billing_reconcile_candidates: süresi 2 gün içinde dolacak ya da son 30 günde dolmuş mağaza abonelikleri; yalnız service_role çağırır', async () => {
  await as(null);
  await db.exec(`delete from public.subscriptions`);
  const rows = [
    [L, { store: 'app_store', hours: 24, product_id: 'tek_1_aylik' }],                          // yarın bitiyor: aday
    [L2, { store: 'play_store', hours: -24 * 10, active: false, product_id: 'tek_1_aylik' }],   // 10 gün önce bitti: aday (kaçan yenileme olabilir)
    [L3, { store: 'app_store', hours: 24 * 3, product_id: 'tek_1_aylik' }],                     // 3 gün sonra: aday değil
    [T, { store: 'app_store', hours: -24 * 40, active: false, product_id: 'tek_1_aylik' }],     // 40 gün önce: aday değil
    [X, { store: 'admin', hours: 5, product_id: 'tek_1_aylik' }],                               // yönetici hibesi: aday değil
    [A, { store: 'promotional', hours: 5, product_id: 'tek_1_aylik' }]                          // promosyon: aday değil
  ];
  for (const [uid, o] of rows) await sub(uid, o);
  await db.query(`insert into public.profiles (id, role, name) values ('00000000-0000-0000-0000-0000000000b4', 'landlord', 'Süresiz') on conflict do nothing`).catch(() => {});
  await db.exec(`set role service_role`);
  const ids = (await q(`select public.billing_reconcile_candidates() u`)).map((r) => r.u);
  expect(ids).toEqual([L2, L]);                                                                // süresi en eski önce
  await as(null);
  // süresiz (expires_at boş) ve mağazasız satırlar aday değil
  await db.exec(`update public.subscriptions set expires_at = null where user_id = '${L}'`);
  await db.exec(`set role service_role`);
  expect((await q(`select public.billing_reconcile_candidates() u`)).map((r) => r.u)).toEqual([L2]);
  await as(null);
  // kimse bunu doğrudan çağıramaz
  for (const who of [L, T, X, L2, A]) { await as(who); expect(await tryCall(db, `select public.billing_reconcile_candidates()`), String(who)).toMatch(/permission denied for function/); }
  await as(null, true);
  expect(await tryCall(db, `select public.billing_reconcile_candidates()`)).toMatch(/permission denied for function/);
});

/* ---------------------------------------------------------------- hibe koruması */

test('hibe koruması: service_role süresi dolmamış admin/promotional satırını ezemez; süresi dolmuş hibe ve normal satır yazılabilir; yönetici işlevi geçer', async () => {
  await as(null);
  await db.exec(`delete from public.subscriptions`);
  // 1) yöneticinin verdiği paket (süresiz)
  await as(A);
  await q(`select public.admin_set_plan('${L}', 'bes', null, 'hibe', 4, null)`);
  await as(null);
  const store = async (uid) => (await q(`select product_id, store, active, units from public.subscriptions where user_id = $1`, [uid]))[0];
  expect(await store(L)).toMatchObject({ product_id: 'bes_4_aylik', store: 'admin', active: true });
  await db.exec(`set role service_role`);
  // mağaza eşitlemesi (billing): "yetki yok" anlık görüntüsüyle ezmeye çalışır: satır değişmez
  await db.query(`update public.subscriptions set store = 'app_store', active = false, product_id = 'tek_1_aylik', expires_at = now() - interval '1 day' where user_id = $1`, [L]);
  await db.query(`insert into public.subscriptions (user_id, product_id, store, active) values ($1, 'tek_1_aylik', 'app_store', false)
                  on conflict (user_id) do update set product_id = excluded.product_id, store = excluded.store, active = excluded.active`, [L]);
  await as(null);
  expect(await store(L)).toMatchObject({ product_id: 'bes_4_aylik', store: 'admin', active: true });
  // 2) promosyon: aktif promosyon güncellenebilir; mağazaya geçiş ya da pasifleştirme yok sayılır
  await sub(L2, { store: 'promotional', product_id: 'tek_1_aylik', hours: 24 * 5 });
  await db.exec(`set role service_role`);
  await db.query(`update public.subscriptions set expires_at = now() + interval '10 days' where user_id = $1`, [L2]);         // promosyon uzatma: geçer
  await db.query(`update public.subscriptions set store = 'app_store', active = false where user_id = $1`, [L2]);                // geçmez
  await as(null);
  expect(await store(L2)).toMatchObject({ store: 'promotional', active: true });
  expect((await q(`select expires_at > now() + interval '9 days' ok from public.subscriptions where user_id = $1`, [L2]))[0].ok).toBe(true);
  // 3) süresi dolmuş hibe eşitlemeyle değişebilir
  await sub(L3, { store: 'admin', product_id: 'tek_1_aylik', hours: -48 });
  await db.exec(`set role service_role`);
  await db.query(`update public.subscriptions set store = 'app_store', product_id = 'tek_2_aylik' where user_id = $1`, [L3]);
  await as(null);
  expect(await store(L3)).toMatchObject({ store: 'app_store', product_id: 'tek_2_aylik' });
  // 4) normal mağaza satırı serbestçe güncellenir
  await sub(T, { store: 'app_store', product_id: 'tek_1_aylik' });
  await db.exec(`set role service_role`);
  await db.query(`update public.subscriptions set product_id = 'bes_3_aylik', will_renew = false where user_id = $1`, [T]);
  await as(null);
  expect(await store(T)).toMatchObject({ product_id: 'bes_3_aylik' });
  // 5) yönetici işlevi hibeyi değiştirir (security definer) ve kaldırır
  await as(A);
  await q(`select public.admin_set_plan('${L}', 'tek', null, 'değişiklik', 2, null)`);
  await as(null);
  expect(await store(L)).toMatchObject({ product_id: 'tek_2_aylik', store: 'admin' });
  await as(A);
  await q(`select public.admin_set_plan('${L}', '', null, 'kaldır')`);
  await as(null);
  expect(await store(L)).toBeUndefined();
  // 6) istemci (authenticated) abonelik satırına zaten yazamaz
  await as(L2);
  expect(await tryCall(db, `update public.subscriptions set active = false where user_id = '${L2}'`)).toMatch(/permission denied/);
});
