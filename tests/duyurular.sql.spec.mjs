// Duyurular (migration duyurular): yalnız yönetici kaydeder/gönderir; kitle filtresi; gece uyarısı ve onayla gönderim;
// gruplar halinde bildirim ve e-posta kuyruğu; kullanıcı yalnız kendine gelen duyuruyu görür; e-postadan girişsiz abonelik iptali.
import { test, expect } from '@playwright/test';
import { newDb, ID, tryCall } from './db-helpers.mjs';

let db, as, q;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

const draft = (o = {}) => ({ title: 'Yeni rapor', body: 'Konsolide rapor geldi.', title_en: 'New report', cta: 'Rapora git', url: '/uygulama/rapor',
  ch_app: true, ch_push: true, ch_email: true, audience: { roles: ['landlord'] }, ...o });

test('yönetici olmayan duyuru kaydedemez, sayamaz, listeleyemez', async () => {
  await as(ID.L);
  for (const sql of [`select public.admin_announcement_save('{"title":"x y"}'::jsonb)`, `select public.admin_announcement_count('{}'::jsonb)`, `select public.admin_announcements()`]) {
    expect((await tryCall(db, sql))).toMatch(/Yönetici/);
  }
  expect((await tryCall(db, `select * from public.announcements`))).toBeTruthy();
  await as(null, true);
  expect((await tryCall(db, `select public.my_announcements()`))).toBeTruthy();
});

test('kitle: rol filtresi; gece uyarısı; onayla gönderim; kart yalnız alıcıya', async () => {
  await as(ID.A);
  const [{ n }] = await q(`select public.admin_announcement_count($1) n`, [{ roles: ['landlord'] }]);
  const [{ all }] = await q(`select public.admin_announcement_count('{}'::jsonb) "all"`);
  expect(n).toBeGreaterThan(0);
  expect(all).toBeGreaterThan(n);
  const [{ id }] = await q(`select public.admin_announcement_save($1) id`, [draft()]);
  // Gece saati simülasyonu: quiet doğru dönsün diye işlevi geçici olarak değiştir.
  await as(null);
  await q(`create or replace function public.announcement_quiet(at timestamptz default now()) returns boolean language sql stable as $$ select true $$`);
  await as(ID.A);
  const [{ r1 }] = await q(`select public.admin_announcement_send($1) r1`, [id]);
  expect(r1).toEqual({ quiet: true });
  const [{ r2 }] = await q(`select public.admin_announcement_send($1, true) r2`, [id]);
  expect(r2.sent).toBe(true);
  expect(r2.recipients).toBe(n);
  // Bildirim ve e-posta kuyruğa alındı; aynı duyuru ikinci kez gönderilemez.
  await as(null);
  const notes = await q(`select user_id from public.notifications where tag = 'duyuru-' || $1`, [id]);
  expect(notes.map((x) => x.user_id)).toContain(ID.L);
  expect(notes.map((x) => x.user_id)).not.toContain(ID.T);
  const mails = await q(`select data from public.mail_outbox where kind = 'duyuru'`);
  expect(mails.length).toBeGreaterThan(0);
  expect(mails[0].data.token).toBeTruthy();
  await as(ID.A);
  expect((await tryCall(db, `select public.admin_announcement_send(${id}, true)`))).toMatch(/zaten/);
  // Mülk sahibi kartı görür, kiracı görmez.
  await as(ID.L);
  const [{ mine }] = await q(`select public.my_announcements() mine`);
  expect(mine.map((x) => x.id)).toContain(Number(id));
  await q(`select public.announcement_mark($1, 'click')`, [id]);
  await as(ID.T);
  expect((await q(`select public.my_announcements() m`))[0].m).toEqual([]);
  // Kapatınca bir daha gelmez; istatistik sayar.
  await as(ID.L);
  await q(`select public.announcement_mark($1, 'dismiss')`, [id]);
  expect((await q(`select public.my_announcements() m`))[0].m).toEqual([]);
  await as(ID.A);
  const [{ list }] = await q(`select public.admin_announcements() list`);
  const row = list.find((x) => Number(x.id) === Number(id));
  expect(row).toMatchObject({ status: 'sent', seen: 1, clicked: 1 });
});

test('bildirimi kapatan kişiye telefon bildirimi gitmez; e-postadan girişsiz iptal', async () => {
  await as(null);
  await q(`create or replace function public.announcement_quiet(at timestamptz default now()) returns boolean language sql stable as $$ select false $$`);
  await q(`update public.profiles set settings = settings || '{"push": false}'::jsonb where id = $1`, [ID.T]);
  await as(ID.A);
  const [{ id }] = await q(`select public.admin_announcement_save($1) id`, [draft({ audience: { roles: ['tenant'] }, view: 'banner' })]);
  await q(`select public.admin_announcement_send($1)`, [id]);
  await as(null);
  expect(await q(`select 1 from public.notifications where user_id = $1 and tag = 'duyuru-' || $2`, [ID.T, id])).toHaveLength(0);
  const [{ token }] = await q(`select token from public.announcement_recipients where announcement_id = $1 and user_id = $2`, [id, ID.T]);
  await as(null, true);
  expect((await q(`select public.announcement_unsubscribe($1) ok`, [token]))[0].ok).toBe(true);
  expect((await q(`select public.announcement_unsubscribe(gen_random_uuid()) ok`))[0].ok).toBe(false);
  await as(null);
  const [{ s }] = await q(`select settings s from public.profiles where id = $1`, [ID.T]);
  expect(s.duyuruMail).toBe(false);
});

test('ileri tarihli duyuru zamanlanır, zamanı gelince dispatch başlatır; test gönderimi yalnız yöneticiye', async () => {
  await as(ID.A);
  const [{ id }] = await q(`select public.admin_announcement_save($1) id`, [draft({ ch_push: false, ch_email: false, starts_at: new Date(Date.now() + 86400e3).toISOString() })]);
  await q(`select public.admin_announcement_test($1)`, [id]);
  const [{ m }] = await q(`select public.my_announcements() m`);
  expect(m.map((x) => x.id)).toContain(Number(id));
  await as(ID.L);
  expect((await q(`select public.my_announcements() m`))[0].m.map((x) => x.id)).not.toContain(Number(id));
  await as(ID.A);
  expect((await q(`select public.admin_announcement_send($1) r`, [id]))[0].r).toEqual({ scheduled: true });
  await as(null);
  await q(`update public.announcements set starts_at = now() - interval '1 minute' where id = $1`, [id]);
  await q(`select public.announcement_dispatch()`);
  await as(ID.L);
  expect((await q(`select public.my_announcements() m`))[0].m.map((x) => x.id)).toContain(Number(id));
});
