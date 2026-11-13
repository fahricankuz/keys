// Migration anon_islev_yetkileri: oturumsuz (anon) rol yalnız altı bilinçli işlevi çağırabilir; authenticated'ın yetkisi değişmez;
// yeni işlevler varsayılan olarak anon'a kapalıdır; bütün işlevlerde search_path sabittir.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const { L, T, X } = ID;
// tests/qa-db.spec.mjs ile aynı liste: yeni bir herkese açık işlev bilinçli bir karardır.
export const ANON_ALLOWED = ['invite_preview', 'report_error', 'signup_code_ok', 'site_invite_info', 'submit_lead', 'verify_rent_certificate'];

let db, as, q;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

test('anon: security definer işlevlerden yalnız izin listesindekiler çağrılabilir (tetikleyici işlevler dahil)', async () => {
  await as(null);
  const open = await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE') order by 1`);
  expect([...new Set(open.map((r) => r.proname))]).toEqual(ANON_ALLOWED);
});

test('anon: rastgele işlev çağrıları (yönetici, kurum, davet, rapor, bildirim) yetki hatasıyla düşer', async () => {
  await as(null, true);
  const calls = [
    `select public.site_report('${L}', 'month', date '2026-10-01')`, `select public.accept_invite('ABC')`, `select public.accept_org_invite('KABC')`,
    `select public.accept_site_invite('SABC')`, `select public.admin_kpis(30)`, `select public.admin_users()`, `select public.admin_delete_user('${X}', 'x')`,
    `select public.my_access()`, `select public.is_admin()`, `select public.is_member('p1')`, `select public.org_detail('${L}')`,
    `select public.team_remove('${X}', '${L}')`, `select public.notify_members('p1','tenant','x','y','/','/',null,'t')`,
    `select public.import_properties('[]'::jsonb)`, `select public.delete_my_account()`, `select public.site_cash_summary('${L}', '2026-10')`,
    `select public.has_access('${L}')`, `select public.file_review_ok('p1/x.pdf')`, `select public.site_folder_ok('site-x')`
  ];
  for (const c of calls) expect(await tryCall(db, c), c).toMatch(/permission denied for function/);
});

test('anon: izin listesindeki işlevler çalışır ve kişisel veri döndürmez', async () => {
  await as(null, true);
  expect(await tryCall(db, `select public.invite_preview('YOKYOKYO')`)).toBeNull();
  expect(await tryCall(db, `select public.signup_code_ok('YOKYOKYO')`)).toBeNull();
  expect(await tryCall(db, `select public.site_invite_info('SYOKYOK')`)).toBeNull();
  expect(await tryCall(db, `select public.verify_rent_certificate('0000000000')`)).toBeNull();
  expect(await tryCall(db, `select public.report_error('{"message":"x"}'::jsonb)`)).toBeNull();
  expect(await tryCall(db, `select public.submit_lead($1::jsonb)`, [JSON.stringify({ name: 'Ali Veli', email: 'ali@firma.com', consent: true })])).toBeNull();
});

test('authenticated: RLS ve depolama politikalarının kullandığı işlevler çağrılabilir kalır; yetkisi olan işlev yetkisini korur', async () => {
  for (const f of ['is_admin', 'is_banned', 'is_member', 'is_owner', 'member_role', 'member_can', 'review_ok', 'file_review_ok', 'file_in_locked_inspect', 'has_access',
                   'is_org_member', 'is_org_master', 'org_can', 'is_site_resident', 'site_role', 'site_linked', 'site_folder_ok', 'shares_property', 'msg_side']) {
    const [{ ok }] = await q(`select bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')) ok from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                              where n.nspname = 'public' and p.proname = $1`, [f]);
    expect(ok, f).toBe(true);
  }
  // Politika üzerinden gerçek kullanım: üye kendi mülkünü, yabancı hiçbir şey görmez.
  await as(T);
  expect((await q(`select id from public.properties`)).map((r) => r.id)).toEqual(['p1']);
  await as(X);
  expect(await q(`select id from public.properties`)).toEqual([]);
  await as(L);
  expect((await q(`select public.my_access() a`))[0].a.access).toBe(true);
  // iç işlevler (zamanlanmış iş, bildirim) authenticated'a da kapalı kalır
  for (const c of [`select public.daily_reminders()`, `select public.access_state('${L}')`, `select public.audit('x','y','{}'::jsonb)`, `select public.log_activity('p1','a','b','c','{}'::jsonb,null)`]) {
    expect(await tryCall(db, c), c).toMatch(/permission denied for function/);
  }
});

test('varsayılan yetki: yeni işlev anon ve PUBLIC için kapalı, authenticated için açık', async () => {
  await as(null);
  await db.exec(`create function public.test_yeni_islev() returns int language sql security definer set search_path = public as $$ select 1 $$;`);
  const [r] = await q(`select has_function_privilege('anon', 'public.test_yeni_islev()', 'EXECUTE') anon,
                              has_function_privilege('authenticated', 'public.test_yeni_islev()', 'EXECUTE') auth,
                              (select count(*)::int from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                                where p.proname = 'test_yeni_islev' and a.grantee = 0) pub`);
  expect(r).toEqual({ anon: false, auth: true, pub: 0 });
  await as(null, true);
  expect(await tryCall(db, `select public.test_yeni_islev()`)).toMatch(/permission denied for function/);
  await as(null);
  await db.exec(`drop function public.test_yeni_islev()`);
});

test('search_path: public şemasındaki her işlevde sabit (yalnız security definer değil)', async () => {
  await as(null);
  const bad = await q(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') order by 1`);
  expect(bad).toEqual([]);
});
