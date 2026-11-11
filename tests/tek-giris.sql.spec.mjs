// Tek giriş / tek kayıt / rol ekleme (sunucu): kiracı ve site sakini hesabı yalnız geçerli davet koduyla açılır (Auth servisi
// oturumunda); hesap içinden mülk sahibi özelliği eklenir, deneme o andan başlar ve bir kez verilir. Gerçek Postgres'te (PGlite).
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

let db, as, q;
const NEW = (n) => `00000000-0000-0000-0000-0000000001${String(n).padStart(2, '0')}`;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.exec(`do $$ begin if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then create role supabase_auth_admin superuser; end if; end $$;`);
});

/** Auth servisi gibi (session_user = supabase_auth_admin) yeni kullanıcı ekler; hata iletisini ya da 'ok' döner. */
async function signup(id, meta) {
  await as(null);
  await db.exec(`set session authorization supabase_auth_admin`);
  try {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, id.slice(-4) + '@ornek.com', JSON.stringify(meta)]);
    return 'ok';
  } catch (e) { return String(e.message); } finally { await db.exec(`set session authorization postgres`); }
}

test('signup_code_ok: geçerli kiracı daveti ve kullanılmamış site kodu; kullanılmış, süresi dolmuş, ekip daveti ve uydurma kod geçersiz', async () => {
  await as(ID.L);
  const [{ code }] = await q(`insert into public.invites (property_id, created_by) values ('p1', $1) returning code`, [ID.L]);
  const [{ code: old }] = await q(`insert into public.invites (property_id, created_by, expires_at) values ('p1', $1, now() - interval '1 day') returning code`, [ID.L]);
  const [{ code: team }] = await q(`insert into public.invites (property_id, created_by, role, scope) values ('p1', $1, 'agent', 'property') returning code`, [ID.L]);
  const [{ code: used }] = await q(`select code from public.invites where accepted_by is not null limit 1`);
  await as(null, true);                                                            // oturumsuz ziyaretçi sorabilir
  const ok = async (c) => (await q(`select public.signup_code_ok($1) as ok`, [c]))[0].ok;
  expect(await ok(code)).toBe(true);
  expect(await ok(code.toLowerCase() + ' ')).toBe(true);
  expect(await ok(old)).toBe(false);
  expect(await ok(team)).toBe(false);
  expect(await ok(used)).toBe(false);
  expect(await ok('YOKYOK12')).toBe(false);
  expect(await ok('')).toBe(false);
  expect(await ok(null)).toBe(false);
});

test('kayıt: kiracı hesabı kodsuz ya da geçersiz kodla açılmaz; geçerli kodla açılır; mülk sahibi ve ekip kodsuz açılır', async () => {
  await as(ID.L);
  const [{ code }] = await q(`insert into public.invites (property_id, created_by) values ('p1', $1) returning code`, [ID.L]);
  expect(await signup(NEW(1), { name: 'Kodsuz', role: 'tenant' })).toMatch(/geçerli bir davet kodu gerekir/);
  expect(await signup(NEW(1), { name: 'Rolsüz' })).toMatch(/geçerli bir davet kodu gerekir/);            // rol yazılmazsa kiracı sayılır
  expect(await signup(NEW(1), { name: 'Sahte', role: 'tenant', invite: 'YOKYOK12' })).toMatch(/geçerli bir davet kodu gerekir/);
  await as(null);
  expect((await q(`select count(*)::int as n from public.profiles where id = $1`, [NEW(1)]))[0].n).toBe(0);
  expect(await signup(NEW(1), { name: 'Kodlu', role: 'tenant', invite: code })).toBe('ok');
  expect(await signup(NEW(2), { name: 'Sahip', role: 'landlord' })).toBe('ok');
  expect(await signup(NEW(3), { name: 'Ekip', role: 'team' })).toBe('ok');
  await as(null);
  expect((await q(`select role from public.profiles where id = any($1) order by id`, [[NEW(1), NEW(2), NEW(3)]])).map((r) => r.role)).toEqual(['tenant', 'landlord', 'team']);
});

test('kayıt: site dairesi koduyla sakin hesabı açılır; kural veritabanı ayarıyla kapatılabilir; SQL ile elle eklenen satır denetlenmez', async () => {
  await as(null);
  const [{ id: oid }] = await q(`insert into public.organizations (name, sector) values ('Test Sitesi', 'site') returning id`);
  const [{ id: uid }] = await q(`insert into public.site_units (org_id, block, no) values ($1, 'A', '1') returning id`, [oid]);
  const [{ code }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'malik', 'Sakin') returning code`, [oid, uid]);
  expect(await signup(NEW(4), { name: 'Sakin', role: 'tenant', invite: code })).toBe('ok');
  await as(null);
  await db.exec(`select set_config('anahtar.signup_code', 'off', false)`);
  expect(await signup(NEW(5), { name: 'Kural kapalı', role: 'tenant' })).toBe('ok');
  await db.exec(`select set_config('anahtar.signup_code', '', false)`);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'elle@ornek.com', '{"role":"tenant"}')`, [NEW(6)]);
  expect((await q(`select count(*)::int as n from public.profiles where id = $1`, [NEW(6)]))[0].n).toBe(1);
});

test('mülk sahibi özelliği: kiracı hesabı ekler; kiracılığı sürer, mülk ekleyebilir; deneme o andan başlar ve yinelenmez', async () => {
  await as(null);
  await db.query(`update public.profiles set created_at = now() - interval '200 days' where id = $1`, [ID.T]);
  await as(ID.T);
  let a = (await q(`select public.my_access() as a`))[0].a;
  expect(a.role).toBe('tenant');
  expect(await tryCall(db, `insert into public.properties (id, owner_id, name, rent, due_day) values ('pt', '${ID.T}', 'Benim Evim', 1000, 1)`)).toMatch(/row-level security/);
  expect(await tryCall(db, `update public.profiles set role = 'landlord' where id = '${ID.T}'`)).toMatch(/Hesap rolü değiştirilemez/);
  expect(await tryCall(db, `update public.profiles set landlord_since = now() where id = '${ID.T}'`)).toMatch(/Hesap rolü değiştirilemez/);

  expect((await q(`select public.add_landlord_role() as r`))[0].r).toBe('landlord');
  a = (await q(`select public.my_access() as a`))[0].a;
  expect(a.role).toBe('landlord');
  expect(a.inTrial).toBe(true);                                                     // 200 günlük hesap: deneme eklediği andan sayılır
  expect(a.access).toBe(true);
  await q(`insert into public.properties (id, owner_id, name, rent, due_day) values ('pt', $1, 'Benim Evim', 1000, 1)`, [ID.T]);
  expect((await q(`select role from public.memberships where property_id = 'p1' and user_id = $1`, [ID.T]))[0].role).toBe('tenant');

  // Yeniden çağırmak denemeyi uzatmaz; kullanıcı tarihi kendisi de değiştiremez.
  const [{ landlord_since: first }] = await q(`select landlord_since from public.profiles where id = $1`, [ID.T]);
  await q(`select public.add_landlord_role()`);
  expect((await q(`select landlord_since from public.profiles where id = $1`, [ID.T]))[0].landlord_since).toEqual(first);
  expect(await tryCall(db, `update public.profiles set landlord_since = now() + interval '1 year' where id = '${ID.T}'`)).toMatch(/Hesap rolü değiştirilemez/);
  // Deneme süresi dolunca erişim kapanır (abonelik yok).
  await as(null);
  await db.query(`update public.profiles set landlord_since = now() - interval '40 days' where id = $1`, [ID.T]);
  await as(ID.T);
  a = (await q(`select public.my_access() as a`))[0].a;
  expect(a.inTrial).toBe(false);
  expect(a.access).toBe(false);
});

test('mülk sahibi özelliği: mevcut mülk sahibinin denemesi değişmez; ekip hesabı dönüştürülemez; oturumsuz çağrılamaz', async () => {
  await as(ID.L);
  const before = (await q(`select public.my_access() as a`))[0].a.trialEnds;
  expect((await q(`select public.add_landlord_role() as r`))[0].r).toBe('landlord');
  expect((await q(`select public.my_access() as a`))[0].a.trialEnds).toBe(before);
  expect((await q(`select landlord_since from public.profiles where id = $1`, [ID.L]))[0].landlord_since).toBeNull();
  await as(NEW(3));
  expect(await tryCall(db, `select public.add_landlord_role()`)).toMatch(/Ekip hesabı/);
  await as(null, true);
  expect(await tryCall(db, `select public.add_landlord_role()`)).toMatch(/permission denied/);
});
