// Site projesi oylaması, teklif ve fatura (migration site_proje_oylama_maliyet): yönetim projeyi oylamaya sunar; malikler arsa payıyla
// oy verir; eşik geçilirse "Sakinler onayladı", geçilmezse "Sakinler reddetti"; süre bitince ya da yönetim bitirince sonuç uygulanır.
// Teklif ve fatura aşamaya bağlıdır; fatura gider defterine yazılır, projenin harcananı faturaların toplamı olur. PGlite'ta sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000c1';   // site müdürü (master)
const Y = '00000000-0000-0000-0000-0000000000c3';   // muhasebe (proje yetkisi yok)
let db, as, q, org, a1, a2, a3, pid, poll, folder;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'mudur@atakum.com', '{"name":"Site Müdürü","role":"team"}'),
                  ($2, 'muhasebe@atakum.com', '{"name":"Muhasebeci","role":"team"}')`, [M, Y]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Atakum Sitesi', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'mudur@atakum.com')`, [org]);
  folder = 'site-' + org + '/';
  await as(M);
  const [{ org_role_save: ry }] = await q(`select public.org_role_save($1, null, 'Kasa', $2)`, [org, ['reports.view']]);
  const [{ org_invite_create: cy }] = await q(`select public.org_invite_create($1, $2)`, [org, ry]);
  await as(Y); await q(`select public.accept_org_invite($1)`, [cy]);
  await as(M);
  // Üç malik: arsa payları 1, 1 ve 2 (toplam 4).
  const unit = async (no, share) => (await q(`insert into public.site_units (org_id, block, no, share) values ($1, 'A', $2, $3) returning id`, [org, no, share]))[0].id;
  [a1, a2, a3] = [await unit('1', 1), await unit('2', 1), await unit('3', 2)];
  for (const [u, who] of [[a1, ID.L], [a2, ID.T], [a3, ID.X]]) {
    const [{ code }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'malik', 'Malik') returning id`, [org, u]).then(([{ id }]) => q(`select public.site_resident_code($1) code`, [id]));
    await as(who); await q(`select public.accept_site_invite($1)`, [code]); await as(M);
  }
  [{ id: pid }] = await q(`insert into public.site_projects (org_id, title, budget) values ($1, 'Çatı yalıtımı', 240000) returning id`, [org]);
  await as(null); await q(`delete from public.notifications`);
});
const vote = async (who, u, c) => { await as(who); await q(`select public.site_poll_vote($1, $2, $3)`, [poll, u, c]); };
const status = async (id = pid) => (await q(`select status from public.site_projects where id = $1`, [id]))[0].status;

test('yalnız proje yetkisi olan oylamaya sunar; sakin ve muhasebeci sunamaz; aşama ve değerler denetlenir', async () => {
  for (const who of [ID.L, Y]) {
    await as(who);
    expect(await tryCall(db, `select public.site_project_vote_open($1, 5, 50, 'malik')`, [pid])).toMatch(/Yetkin yok/);
  }
  await as(M);
  expect(await tryCall(db, `select public.site_project_vote_open($1, 0, 50, 'malik')`, [pid])).toMatch(/Süre/);
  expect(await tryCall(db, `select public.site_project_vote_open($1, 5, 49, 'malik')`, [pid])).toMatch(/eşiği/);
  expect(await tryCall(db, `select public.site_project_vote_open($1, 5, 50, 'kiraci')`, [pid])).toMatch(/Oy hakkı/);
  [{ site_project_vote_open: poll }] = await q(`select public.site_project_vote_open($1, 5, 50, 'malik')`, [pid]);
  expect(await status()).toBe('oylama');
  const p = (await q(`select poll_id, approve_pct from public.site_projects where id = $1`, [pid]))[0];
  expect(p).toMatchObject({ poll_id: poll, approve_pct: 50 });
  const pl = (await q(`select question, options, weighted, voters from public.site_polls where id = $1`, [poll]))[0];
  expect(pl).toMatchObject({ options: ['Kabul', 'Ret'], weighted: true, voters: 'malik' });
  expect(pl.question).toContain('Çatı yalıtımı');
  expect(await tryCall(db, `select public.site_project_vote_open($1, 5, 50, 'malik')`, [pid])).toMatch(/bu aşamada/);        // zaten oylamada
  // Sakinlere bildirimler gitti (yoklama + aşama).
  await as(null);
  const n = await q(`select user_id, title from public.notifications order by id`);
  expect(n.filter((x) => x.title === 'Görüş yoklaması').map((x) => x.user_id).sort()).toEqual([ID.L, ID.T, ID.X].sort());
  expect(n.some((x) => /Çatı yalıtımı: Oylamaya sunuldu/.test(x.title))).toBe(true);
});

test('doğrudan düzenleme oylama bağını ve aşamayı değiştiremez; teklif oylama sürerken eklenemez', async () => {
  await as(M);
  await q(`update public.site_projects set status = 'onay', poll_id = null, approve_pct = 99 where id = $1`, [pid]).catch(() => {});
  const p = (await q(`select status, poll_id, approve_pct from public.site_projects where id = $1`, [pid]))[0];
  expect(p).toMatchObject({ status: 'oylama', poll_id: poll });
  expect(await tryCall(db, `insert into public.site_project_costs (project_id, org_id, kind, vendor, amount, created_by) values ($1, $2, 'teklif', 'A Yapı', 1000, $3)`, [pid, org, M])).toMatch(/teklif eklenemez/);
});

test('arsa payına göre oy: kabul %75; süre bitmeden sonuç uygulanmaz, sakin oylamayı bitiremez, yönetim erken bitirir', async () => {
  await vote(ID.L, a1, 0); await vote(ID.T, a2, 1); await vote(ID.X, a3, 0);   // kabul 1 + 2 = 3, ret 1 (toplam 4)
  await as(ID.L);
  expect((await q(`select public.site_project_vote_sync($1) n`, [org]))[0].n).toBe(0);                          // süre dolmadı
  expect(await tryCall(db, `select public.site_project_vote_close($1)`, [pid])).toMatch(/Yetkin yok/);
  expect(await status()).toBe('oylama');
  await as(M);
  await q(`select public.site_project_vote_close($1)`, [pid]);
  expect(await status()).toBe('onay');
  const u = (await q(`select body, status from public.site_project_updates where project_id = $1 and status = 'onay'`, [pid]))[0];
  expect(u.body).toContain('proje onaylandı'); expect(u.body).toContain('Kabul %75'); expect(u.body).toContain('ret %25'); expect(u.body).toContain('3 / 3 daire');
  await as(M);
  await q(`select public.site_project_vote_close($1)`, [pid]);                                                  // tekrar çağrı zararsız
  expect((await q(`select count(*)::int n from public.site_project_updates where project_id = $1 and status = 'onay'`, [pid]))[0].n).toBe(1);
});

test('eşik %80: kabul %75 yetmez, proje reddedilir; süre dolunca sakinin ekranı sonucu uygular; reddedilen yeniden sunulabilir', async () => {
  await as(M);
  const [{ id: p2 }] = await q(`insert into public.site_projects (org_id, title) values ($1, 'Otopark') returning id`, [org]);
  [{ site_project_vote_open: poll }] = await q(`select public.site_project_vote_open($1, 3, 80, 'malik')`, [p2]);
  await vote(ID.L, a1, 0); await vote(ID.T, a2, 1); await vote(ID.X, a3, 0);
  await as(null);
  await q(`update public.site_polls set ends_at = now() - interval '1 minute' where id = $1`, [poll]);           // süre doldu
  await as(ID.T);
  expect((await q(`select public.site_project_vote_sync($1) n`, [org]))[0].n).toBe(1);
  expect(await status(p2)).toBe('red');
  const body = (await q(`select body from public.site_project_updates where project_id = $1 and status = 'red'`, [p2]))[0].body;
  expect(body).toContain('proje onaylanmadı');
  await as(M);
  await q(`select public.site_project_vote_open($1, 3, 50, 'herkes')`, [p2]);
  expect(await status(p2)).toBe('oylama');
});

test('yabancı kurumun üyesi oylama sonucunu tetikleyemez', async () => {
  await as(ID.A);
  await q(`select public.admin_org_save($1)`, [{ name: 'Başka Site', sector: 'site' }]);
  await as(ID.L2);
  expect(await tryCall(db, `select public.site_project_vote_sync($1)`, [org])).toMatch(/Yetkin yok/);
});

test('fatura onaydan önce girilmez; onaylı projede teklif seçilir, fatura gider defterine yazılır, harcanan faturaların toplamı olur', async () => {
  await as(M);
  const [{ id: p3 }] = await q(`insert into public.site_projects (org_id, title, spent) values ($1, 'Asansör', 5000) returning id`, [org]);
  expect(await tryCall(db, `insert into public.site_project_costs (project_id, org_id, kind, vendor, amount, created_by) values ($1, $2, 'fatura', 'X', 100, $3)`, [p3, org, M])).toMatch(/onaylandıktan sonra/);
  // Onaylı proje (pid) üzerinde çalış.
  await q(`insert into public.site_project_costs (project_id, org_id, kind, vendor, amount, file, file_name, chosen, created_by) values ($1, $2, 'teklif', 'A Yapı', 228500, $3, 'teklif.pdf', true, $4)`, [pid, org, folder + 't1.pdf', M]);
  await q(`insert into public.site_project_costs (project_id, org_id, kind, vendor, amount, created_by) values ($1, $2, 'teklif', 'B İnşaat', 251000, $3)`, [pid, org, M]);
  const [{ id: b }] = await q(`insert into public.site_project_costs (project_id, org_id, kind, vendor, amount, created_by) values ($1, $2, 'teklif', 'C Isı', 236900, $3) returning id`, [pid, org, M]);
  await q(`update public.site_project_costs set chosen = true where id = $1`, [b]);                              // seçim C'ye geçer
  expect((await q(`select vendor from public.site_project_costs where project_id = $1 and chosen`, [pid])).map((x) => x.vendor)).toEqual(['C Isı']);
  expect((await q(`select spent from public.site_projects where id = $1`, [pid]))[0].spent).toBeNull();          // teklif harcama sayılmaz
  const [{ id: f1 }] = await q(`insert into public.site_project_costs (project_id, org_id, kind, vendor, amount, file, file_name, created_by) values ($1, $2, 'fatura', 'C Isı', 96400, $3, 'fatura-1.pdf', $4) returning id`, [pid, org, folder + 'f1.pdf', M]);
  await q(`insert into public.site_project_costs (project_id, org_id, kind, vendor, amount, created_by) values ($1, $2, 'fatura', 'C Isı', 132100, $3)`, [pid, org, M]);
  expect(Number((await q(`select spent from public.site_projects where id = $1`, [pid]))[0].spent)).toBe(228500);
  const ex = await q(`select cat, amount::float8 a, receipt_path, project_cost_id from public.site_expenses where project_cost_id is not null order by amount`);
  expect(ex.map((e) => [e.cat, e.a])).toEqual([['Onarım ve tadilat', 96400], ['Onarım ve tadilat', 132100]]);
  expect(ex[0]).toMatchObject({ receipt_path: folder + 'f1.pdf', project_cost_id: f1 });
  // Fatura silinince gider kaydı gider, harcanan yeniden hesaplanır.
  await q(`delete from public.site_project_costs where id = $1`, [f1]);
  expect(Number((await q(`select spent from public.site_projects where id = $1`, [pid]))[0].spent)).toBe(132100);
  expect((await q(`select count(*)::int n from public.site_expenses where project_cost_id is not null`))[0].n).toBe(1);
  // Güncelleme kayıtları ve bildirim.
  const ups = (await q(`select body from public.site_project_updates where project_id = $1 and status is null order by created_at, body`, [pid])).map((x) => x.body);
  expect(ups.some((x) => /^Teklif eklendi: A Yapı · ₺228\.500/.test(x))).toBe(true);
  expect(ups.some((x) => /^Fatura eklendi: C Isı · ₺96\.400/.test(x))).toBe(true);
  expect(ups.some((x) => /^Teklif seçildi: C Isı/.test(x))).toBe(true);
});

test('teklif ve fatura: sakin ve yetkisiz yönetici yazamaz; dosya başka klasörde olamaz; tutar ve tür sonradan değişmez; sakinler okur', async () => {
  for (const who of [ID.L, Y]) {
    await as(who);
    expect(await tryCall(db, `insert into public.site_project_costs (project_id, org_id, kind, vendor, amount, created_by) values ($1, $2, 'teklif', 'Z', 1, $3)`, [pid, org, who])).toMatch(/row-level security/);
  }
  await as(M);
  expect(await tryCall(db, `insert into public.site_project_costs (project_id, org_id, kind, vendor, amount, file, created_by) values ($1, $2, 'fatura', 'Z', 1, 'site-00000000-0000-0000-0000-000000000000/x.pdf', $3)`, [pid, org, M])).toMatch(/check constraint/);
  expect(await tryCall(db, `insert into public.site_project_costs (project_id, org_id, kind, vendor, amount, created_by) values ($1, $2, 'fatura', 'Z', 0, $3)`, [pid, org, M])).toMatch(/check constraint/);
  await q(`update public.site_project_costs set amount = 1, kind = 'teklif', vendor = 'Yeni Ad' where project_id = $1 and kind = 'fatura'`, [pid]);
  expect((await q(`select vendor, kind, amount::float8 a from public.site_project_costs where project_id = $1 and kind = 'fatura'`, [pid])).map((r) => [r.vendor, r.kind, r.a])).toEqual([['Yeni Ad', 'fatura', 132100]]);
  await as(ID.L);
  expect((await q(`select count(*)::int n from public.site_project_costs where project_id = $1`, [pid]))[0].n).toBeGreaterThan(2);   // sakin okur
});
