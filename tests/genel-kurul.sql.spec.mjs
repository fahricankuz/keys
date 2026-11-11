// Genel kurul ve görüş yoklaması (migration genel_kurul_yoklama): yönetim çağırır, malik katılım/vekâlet bildirir;
// daire başına tek oy, arsa payıyla ağırlıklı sonuç; bitişten sonra oy yok. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const M = '00000000-0000-0000-0000-0000000000c1';   // site müdürü (master)
const Y = '00000000-0000-0000-0000-0000000000c2';   // muhasebe (duyuru yetkisi yok)
let db, as, q, org, a1, a2, mid, pid;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'mudur@atakum.com', '{"name":"Site Müdürü","role":"team"}'),
                  ($2, 'muhasebe@atakum.com', '{"name":"Muhasebeci","role":"team"}')`, [M, Y]);
  await as(ID.A);
  [{ admin_org_save: org }] = await q(`select public.admin_org_save($1)`, [{ name: 'Atakum Sitesi', sector: 'site' }]);
  await q(`select public.admin_org_set_master($1, 'mudur@atakum.com')`, [org]);
  const [{ id: acc }] = await q(`select id from public.org_roles where org_id = $1 and name = 'Muhasebe'`, [org]);
  const [{ org_invite_create: c }] = await q(`select public.org_invite_create($1, $2)`, [org, acc]);
  await as(Y);
  await q(`select public.accept_org_invite($1)`, [c]);
  await as(M);
  [{ id: a1 }] = await q(`insert into public.site_units (org_id, block, no, share) values ($1, 'A', '1', 3) returning id`, [org]);
  [{ id: a2 }] = await q(`insert into public.site_units (org_id, block, no, share) values ($1, 'A', '2', 1) returning id`, [org]);
  const [{ code: cl }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'malik', 'Ev Sahibi') returning code`, [org, a1]);
  const [{ code: ct }] = await q(`insert into public.site_residents (org_id, unit_id, role, name) values ($1, $2, 'kiraci', 'Kiracı') returning code`, [org, a2]);
  await as(ID.L); await q(`select public.accept_site_invite($1)`, [cl]);
  await as(ID.T); await q(`select public.accept_site_invite($1)`, [ct]);
});

test('yönetim çağrı yapar, tüm sakinlere (malik ve kiracı) bildirim gider; duyuru yetkisi olmayan çağıramaz', async () => {
  await as(Y);
  expect(await tryCall(db, `insert into public.site_meetings (org_id, held_at) values ($1, now() + interval '20 days')`, [org])).toMatch(/row-level security/);
  await as(M);
  [{ id: mid }] = await q(`insert into public.site_meetings (org_id, held_at, place, agenda) values ($1, now() + interval '20 days', 'Kapalı otopark',
    array['Açılış ve divan seçimi','Yönetim kurulu raporu']) returning id`, [org]);
  await as(null);
  expect((await q(`select user_id from public.notifications where title like 'Genel kurul çağrısı%' order by user_id`)).map((r) => r.user_id)).toEqual([ID.L, ID.T].sort());
  await as(ID.T);
  expect((await q(`select agenda from public.site_meetings`))[0].agenda).toHaveLength(2);   // sakin gündemi görür
  await as(ID.X);
  expect(await q(`select id from public.site_meetings`)).toEqual([]);
});

test('her sakin katılım bildirir (malik ve kiracı ayrı kayıt); vekâlet yalnız malikte; başka daire için yanıt yok; vekil adı gerekir', async () => {
  await as(ID.L);
  expect(await tryCall(db, `select public.site_meeting_reply($1, $2, 'vekalet', '')`, [mid, a1])).toMatch(/Vekilin adını/);
  await q(`select public.site_meeting_reply($1, $2, 'vekalet', 'Ayşe Yılmaz')`, [mid, a1]);
  await q(`select public.site_meeting_reply($1, $2, 'katilacak')`, [mid, a1]);         // değiştirilebilir
  await as(ID.T);
  expect(await tryCall(db, `select public.site_meeting_reply($1, $2, 'vekalet', 'Biri')`, [mid, a2])).toMatch(/Vekâlet yalnız malik/);
  await q(`select public.site_meeting_reply($1, $2, 'katilmayacak')`, [mid, a2]);       // kiracı kendi dairesi için bildirir
  expect(await tryCall(db, `select public.site_meeting_reply($1, $2, 'katilacak')`, [mid, a1])).toMatch(/Yalnız dairenin sakini/);
  await as(ID.L);
  expect(await tryCall(db, `select public.site_meeting_reply($1, $2, 'katilacak')`, [mid, a2])).toMatch(/Yalnız dairenin sakini/);
  await as(M);
  expect(await q(`select role, answer, proxy_name from public.site_meeting_replies order by role`)).toEqual([
    { role: 'kiraci', answer: 'katilmayacak', proxy_name: '' }, { role: 'malik', answer: 'katilacak', proxy_name: '' }]);
});

test('yoklama: daire başına tek oy, arsa payıyla sonuç; malik yoklamasında kiracı oy veremez', async () => {
  await as(M);
  [{ id: pid }] = await q(`insert into public.site_polls (org_id, question, options, weighted, ends_at) values ($1, 'Çatı yalıtımı yapılsın mı?',
    array['Evet','Hayır'], true, now() + interval '7 days') returning id`, [org]);
  await as(ID.T);
  expect(await tryCall(db, `select public.site_poll_vote($1, $2, 0)`, [pid, a2])).toMatch(/oy veremezsin/);
  await as(ID.L);
  expect(await tryCall(db, `select public.site_poll_vote($1, $2, 5)`, [pid, a1])).toMatch(/Seçenek geçersiz/);
  await q(`select public.site_poll_vote($1, $2, 1)`, [pid, a1]);
  await q(`select public.site_poll_vote($1, $2, 0)`, [pid, a1]);                         // fikir değiştirir, tek oy kalır
  const [{ r }] = await q(`select public.site_poll_results($1) r`, [pid]);
  expect(r).toMatchObject({ units: 2, share: 3 + 1, voted: 1, voted_share: 3, closed: false });
  expect(r.options).toEqual([{ label: 'Evet', count: 1, share: 3 }, { label: 'Hayır', count: 0, share: 0 }]);
  await as(ID.X);
  expect(await tryCall(db, `select public.site_poll_results($1)`, [pid])).toMatch(/Yetkin yok/);
  await as(null);
  expect((await q(`select user_id from public.notifications where title = 'Görüş yoklaması'`)).map((x) => x.user_id)).toEqual([ID.L]);
});

test('"herkes" yoklamasında kiracı da oy verir; bitişten sonra oy alınmaz', async () => {
  await as(M);
  const [{ id: p2 }] = await q(`insert into public.site_polls (org_id, question, options, voters, ends_at) values ($1, 'Bahçe günü hangi gün?',
    array['Cumartesi','Pazar'], 'herkes', now() + interval '1 day') returning id`, [org]);
  await as(ID.T);
  await q(`select public.site_poll_vote($1, $2, 1)`, [p2, a2]);
  expect(await q(`select choice from public.site_votes where poll_id = $1`, [p2])).toEqual([{ choice: 1 }]);
  await as(M);
  await q(`update public.site_polls set ends_at = now() - interval '1 minute' where id = $1`, [p2]);
  await as(ID.T);
  expect(await tryCall(db, `select public.site_poll_vote($1, $2, 0)`, [p2, a2])).toMatch(/Yoklama bitti/);
  expect(await tryCall(db, `insert into public.site_votes (poll_id, unit_id, org_id, choice) values ($1, $2, $3, 0)`, [p2, a2, org])).toMatch(/row-level security/);
});
