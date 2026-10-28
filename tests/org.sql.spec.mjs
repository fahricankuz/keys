// Kurumlar (yol planı Faz 0): anahtar yöneticisi kurum açar ve master yöneticiyi belirler; master rolleri
// ve yetkileri düzenler, yönetici davet eder; yetkiler sunucuda denetlenir. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000b1';   // master yönetici (henüz kayıtlı değil)
const Y = '00000000-0000-0000-0000-0000000000b2';   // muhasebe yöneticisi

let db, as, q, org;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

test('kurumu yalnızca anahtar yöneticisi açar; sektörün modülleri ve hazır rolleri gelir, başvuru kapanır', async () => {
  await as(null, true);
  const [{ submit_lead: lead }] = await q(`select public.submit_lead($1)`, [{ name: 'Ayşe Yönetici', email: 'yonetim@atakum.com', company: 'Atakum Sitesi', consent: true }]);
  await as(ID.L);
  expect(await tryCall(db, `select public.admin_org_save($1)`, [{ name: 'X', sector: 'site' }])).toMatch(/Yönetici yetkisi/);
  expect(await tryCall(db, `insert into public.organizations (name, sector) values ('Y', 'site')`)).toMatch(/permission denied/);

  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Atakum Sitesi', sector: 'site', units: 240, lead_id: lead }]);
  const [o] = await q(`select sector, modules, status from public.organizations where id = $1`, [org]);
  expect(o).toEqual({ sector: 'site', modules: ['aidat', 'gider_dagitim', 'duyuru', 'rapor'], status: 'active' });
  expect((await q(`select name from public.org_roles where org_id = $1 order by position`, [org])).map(r => r.name))
    .toEqual(['Muhasebe', 'Teknik ekip', 'Güvenlik ve resepsiyon', 'Yönetim kurulu']);
  expect((await q(`select status from public.support_requests where id = $1`, [lead]))[0].status).toBe('done');
  expect(await tryCall(db, `select public.admin_org_save($1)`, [{ id: org, name: 'Atakum Sitesi', sector: 'site', modules: ['uydurma'] }])).toMatch(/Geçersiz modül/);
  expect((await q(`select action from public.admin_audit where target = $1`, [org])).map(r => r.action)).toContain('org.create');
});

test('kayıtlı olmayan master için davet kodu üretilir; kod hangi hesap türüyle kabul edilirse o kişi master olur', async () => {
  await as(ID.A);
  const [{ admin_org_set_master: r }] = await q(`select public.admin_org_set_master($1, 'mudur@atakum.com')`, [org]);
  expect(r.status).toBe('invited');
  expect(r.code).toMatch(/^K[0-9A-F]{7}$/);

  await as(null);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'mudur@atakum.com', '{"name":"Site Müdürü","role":"tenant"}'),
                  ($2, 'muhasebe@atakum.com', '{"name":"Muhasebeci","role":"tenant"}')`, [M, Y]);
  await as(M);
  expect(await q(`select public.my_orgs() o`)).toEqual([{ o: [] }]);
  expect((await q(`select public.my_access() a`))[0].a.access).toBe(true);   // kiracı hesabı zaten erişir
  await q(`select public.accept_org_invite($1)`, [r.code.toLowerCase()]);
  const [{ o: mine }] = await q(`select public.my_orgs() o`);
  expect(mine).toHaveLength(1);
  expect(mine[0]).toMatchObject({ name: 'Atakum Sitesi', sector: 'site', master: true, role: null });
  expect(mine[0].perms).toContain('org.members');
});

test('mülk sahibi hesabı deneme bitse de etkin kurumun yöneticisi olarak erişir; kurum askıya alınınca erişim düşer', async () => {
  await as(ID.L2);
  await db.exec(`reset role; update public.profiles set created_at = now() - interval '200 days' where id = '${ID.L2}'`);
  await as(ID.L2);
  expect((await q(`select public.my_access() a`))[0].a.access).toBe(false);
  await as(ID.A);
  const [{ org_invite_create: code }] = await q(`select public.org_invite_create($1, null)`, [org]);
  await as(ID.L2);
  await q(`select public.accept_org_invite($1)`, [code]);
  expect((await q(`select public.my_access() a`))[0].a.access).toBe(true);
  await as(ID.A);
  await q(`select public.admin_org_save($1)`, [{ id: org, name: 'Atakum Sitesi', sector: 'site', status: 'paused' }]);
  await as(ID.L2);
  expect((await q(`select public.my_access() a`))[0].a.access).toBe(false);
  await as(ID.A);
  await q(`select public.admin_org_save($1)`, [{ id: org, name: 'Atakum Sitesi', sector: 'site', status: 'active' }]);
  await q(`select public.org_member_remove($1, $2)`, [org, ID.L2]);
});

test('master rolleri düzenler; davetle gelen yönetici rolünün yetkisini alır, rolleri düzenleyemez', async () => {
  await as(M);
  const [{ id: acc }] = await q(`select id from public.org_roles where org_id = $1 and name = 'Muhasebe'`, [org]);
  await q(`select public.org_role_save($1, $2, 'Muhasebe', $3)`, [org, acc, ['payments.approve', 'reports.view']]);
  expect(await tryCall(db, `select public.org_role_save($1, null, 'Kötü', $2)`, [org, ['her.sey']])).toMatch(/Geçersiz yetki/);
  expect(await tryCall(db, `select public.org_role_save($1, null, 'muhasebe', '{}')`, [org])).toMatch(/Bu adla bir rol var/);
  const [{ org_invite_create: code }] = await q(`select public.org_invite_create($1, $2, 'muhasebe@atakum.com')`, [org, acc]);

  await as(Y);
  await q(`select public.accept_org_invite($1)`, [code]);
  const [{ o }] = await q(`select public.my_orgs() o`);
  expect(o[0]).toMatchObject({ master: false, role: { name: 'Muhasebe' }, perms: ['payments.approve', 'reports.view'] });
  expect((await q(`select public.org_can($1, 'payments.approve') a, public.org_can($1, 'org.members') b`, [org]))[0]).toEqual({ a: true, b: false });
  expect(await tryCall(db, `select public.org_role_save($1, $2, 'Muhasebe', $3)`, [org, acc, ['org.members']])).toMatch(/master yönetici/);
  expect(await tryCall(db, `select public.org_invite_create($1, null)`, [org])).toMatch(/davet etme yetkin yok/);
  expect(await tryCall(db, `select public.org_member_remove($1, $2)`, [org, M])).toMatch(/yetkin yok|Master/);
  // Ayrıntıyı görür ama açık davetleri göremez.
  const [{ d }] = await q(`select public.org_detail($1) d`, [org]);
  expect(d.members.map(m => m.name)).toEqual(['Site Müdürü', 'Muhasebeci']);
  expect(d.invites).toEqual([]);
  expect(d.org.billing).toBeUndefined();
});

test('yönetici çıkarma yetkisi verilen rol üyeleri yönetir; master çıkarılamaz, master devredilir', async () => {
  await as(M);
  const [{ id: acc }] = await q(`select id from public.org_roles where org_id = $1 and name = 'Muhasebe'`, [org]);
  const [{ id: tech }] = await q(`select id from public.org_roles where org_id = $1 and name = 'Teknik ekip'`, [org]);
  await q(`select public.org_member_set($1, $2, $3)`, [org, Y, tech]);
  expect((await q(`select role_id from public.org_members where org_id = $1 and user_id = $2`, [org, Y]))[0].role_id).toBe(tech);
  expect(await tryCall(db, `select public.org_member_set($1, $2, $3)`, [org, M, acc])).toMatch(/Master yöneticinin rolü/);
  // Rol silinince o roldeki yönetici yetkisiz kalır.
  await q(`select public.org_role_delete($1)`, [tech]);
  expect((await q(`select role_id from public.org_members where org_id = $1 and user_id = $2`, [org, Y]))[0].role_id).toBeNull();
  await as(Y);
  expect((await q(`select public.org_can($1, 'requests.manage') a`, [org]))[0].a).toBe(false);
  // Devir: Y master olur, eski master rolsüz yönetici kalır.
  await as(M);
  await q(`select public.org_transfer_master($1, $2)`, [org, Y]);
  expect(await q(`select user_id, is_master from public.org_members where org_id = $1 order by is_master desc`, [org]))
    .toEqual([{ user_id: Y, is_master: true }, { user_id: M, is_master: false }]);
  expect(await tryCall(db, `select public.org_transfer_master($1, $2)`, [org, M])).toMatch(/Yalnızca master/);
  // Kişi kendisi ayrılabilir.
  await q(`select public.org_member_remove($1, $2)`, [org, M]);
  await as(ID.A);
  expect((await q(`select count(*)::int c from public.org_members where org_id = $1`, [org]))[0].c).toBe(1);
});

test('kurum dışındakiler kurumu, rolleri ve üyeleri göremez; bireysel kullanıcının verisi değişmez', async () => {
  await as(ID.T);
  expect(await q(`select id from public.organizations`)).toEqual([]);
  expect(await q(`select id from public.org_roles`)).toEqual([]);
  expect(await q(`select user_id from public.org_members`)).toEqual([]);
  expect(await tryCall(db, `select public.org_detail($1)`, [org])).toMatch(/yetkin yok/);
  await as(ID.L);
  expect((await q(`select org_id from public.properties where id = 'p1'`))[0].org_id).toBeNull();
  expect(await q(`select public.my_orgs() o`)).toEqual([{ o: [] }]);
});

test('kullanılmış ya da süresi dolmuş davet reddedilir; yönetici başka kurumun rolünü atayamaz', async () => {
  await as(ID.A);
  const [{ admin_org_save: other }] = await q(`select public.admin_org_save($1)`, [{ name: 'Merkez AVM', sector: 'avm' }]);
  expect((await q(`select modules from public.organizations where id = $1`, [other]))[0].modules).toContain('ciro_kira');
  const [{ id: foreign }] = await q(`select id from public.org_roles where org_id = $1 limit 1`, [other]);
  expect(await tryCall(db, `select public.org_invite_create($1, $2)`, [org, foreign])).toMatch(/bu kuruma ait değil/);
  const [{ org_invite_create: code }] = await q(`select public.org_invite_create($1, null)`, [other]);
  await as(null);
  await db.query(`update public.org_invites set expires_at = now() - interval '1 day' where code = $1`, [code]);
  await as(ID.T);
  expect(await tryCall(db, `select public.accept_org_invite($1)`, [code])).toMatch(/süresi dolmuş/);
  expect(await tryCall(db, `select public.accept_org_invite('KYOKYOK1')`)).toMatch(/bulunamadı/);
  await as(ID.A);
  const [{ o: list }] = await q(`select public.admin_orgs() o`);
  expect(list.map(o => o.name).sort()).toEqual(['Atakum Sitesi', 'Merkez AVM']);
  expect(list.find(o => o.name === 'Atakum Sitesi').master.name).toBe('Muhasebeci');
});
