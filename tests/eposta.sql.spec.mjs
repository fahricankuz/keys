// Müşteriye e-posta: abonelik olayları, elle paket, askıya alma, deneme bitti ve e-posta onayı hatırlatması.
// Hepsi bildirim satırı olarak yazılır (push fonksiyonu e-postaya çevirir); gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, ID } from './db-helpers.mjs';

let db, as, q;
const notes = async (uid, tagLike = '%') => { await as(null); return q(`select title, body, tag from public.notifications where user_id = $1 and tag like $2 order by id`, [uid, tagLike]); };

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); await as(null); });

test('abonelik olayları: ödeme sorunu, iptal ve sona erme kullanıcıya bildirilir; yönetici paketi ve ilk yazım bildirmez', async () => {
  await db.query(`insert into public.subscriptions (user_id, product_id, store, active, will_renew, expires_at)
    values ($1, 'bes_3_aylik', 'app_store', true, true, now() + interval '20 days')`, [ID.L]);
  expect(await notes(ID.L)).toHaveLength(0);                                   // ilk yazım: haber yok

  await db.query(`update public.subscriptions set billing_issue = true where user_id = $1`, [ID.L]);
  let n = await notes(ID.L, 'bill-issue-%');
  expect(n).toHaveLength(1);
  expect(n[0].title).toBe('Ödemende sorun var');
  expect(n[0].body).toContain('App Store');

  await db.query(`update public.subscriptions set will_renew = false where user_id = $1`, [ID.L]);
  n = await notes(ID.L, 'bill-cancel-%');
  expect(n).toHaveLength(1);
  expect(n[0].title).toBe('Aboneliğin iptal edildi');
  expect(n[0].body).toMatch(/Erişimin \d\d\.\d\d\.\d{4} tarihine kadar devam eder/);

  await db.query(`update public.subscriptions set active = false where user_id = $1`, [ID.L]);
  n = await notes(ID.L, 'bill-end-%');
  expect(n).toHaveLength(1);
  expect(n[0].title).toBe('Aboneliğin sona erdi');
  expect(await notes(ID.L, 'bill-cancel-%')).toHaveLength(1);                  // sona erme iptal bildirimi eklemedi

  // Yönetici paketi (store = admin): tetikleyici sessiz.
  await db.query(`insert into public.subscriptions (user_id, product_id, store, active, will_renew) values ($1, 'kurumsal', 'admin', true, true)`, [ID.L2]);
  await db.query(`update public.subscriptions set will_renew = false, billing_issue = true where user_id = $1`, [ID.L2]);
  expect(await notes(ID.L2)).toHaveLength(0);
});

test('elle paket: aynı paket art arda tanımlanınca bildirim tek kalır; farklı paket yeni bildirim açar', async () => {
  await as(ID.A);
  await q(`select public.admin_set_plan($1, 'tek', null, 'a', 2, null)`, [ID.L]);
  await as(ID.A);
  await q(`select public.admin_set_plan($1, 'tek', null, 'a', 2, null)`, [ID.L]);
  expect(await notes(ID.L, 'bill-plan-%')).toHaveLength(1);
  await as(ID.A);
  await q(`select public.admin_set_plan($1, 'tek', null, 'a', 3, null)`, [ID.L]);
  expect(await notes(ID.L, 'bill-plan-%')).toHaveLength(2);
});

test('elle paket: tanımlayınca ve kaldırınca kullanıcıya bildirim; olmayan paketi kaldırmak bildirim üretmez', async () => {
  await as(ID.A);
  await q(`select public.admin_set_plan($1, 'bes', '2027-12-31T20:59:59Z', 'sözleşme', 5, null)`, [ID.X]);
  let n = await notes(ID.X, 'bill-plan-%');
  expect(n).toHaveLength(1);
  expect(n[0].title).toBe('Paketin tanımlandı');
  expect(n[0].body).toBe('Hesabına Profesyonel paketi tanımlandı · 5 mülk · bitiş 31.12.2027.');

  await as(ID.A);
  await q(`select public.admin_set_plan($1, 'kurumsal', null, 'x', 20, 'avm')`, [ID.T]);
  expect((await notes(ID.T, 'bill-plan-%'))[0].body).toBe('Hesabına Kurumsal paketi tanımlandı · 20 mülk · süresiz.');

  await as(ID.A);
  await q(`select public.admin_set_plan($1, '', null, 'bitti')`, [ID.X]);
  expect((await notes(ID.X, 'bill-planoff-%'))[0].title).toBe('Paketin kaldırıldı');

  await as(ID.A);
  await q(`select public.admin_set_plan($1, '', null, 'yok')`, [ID.L2]);        // ID.L2'de yalnızca store = admin satırı vardı; kaldırınca haber verilir
  const before = (await notes(ID.L2, 'bill-planoff-%')).length;
  await as(ID.A);
  await q(`select public.admin_set_plan($1, '', null, 'yine yok')`, [ID.L2]);   // artık silinecek satır yok
  expect((await notes(ID.L2, 'bill-planoff-%')).length).toBe(before);
});

test('askıya alma ve yeniden açma: kullanıcıya gerekçeli ve destek adresli bildirim', async () => {
  await as(ID.A);
  await q(`select public.admin_set_ban($1, true, 'Taciz bildirimi doğrulandı.')`, [ID.X]);
  let n = await notes(ID.X, 'acct-ban-%');
  expect(n).toHaveLength(1);
  expect(n[0].title).toBe('Hesabın askıya alındı');
  expect(n[0].body).toContain('Taciz bildirimi doğrulandı.');
  expect(n[0].body).toContain('info@anahtar.io');
  await as(ID.A);
  await q(`select public.admin_set_ban($1, false, '')`, [ID.X]);
  expect((await notes(ID.X, 'acct-unban-%'))[0].title).toBe('Hesabın yeniden açıldı');
});

test('hesap silindi: kendisi ya da yönetici silince, silinmeden önce kuyruğa e-posta yazılır; kullanıcı kuyruğa erişemez', async () => {
  await as(null);
  const U1 = '00000000-0000-0000-0000-0000000000d1', U2 = '00000000-0000-0000-0000-0000000000d2';
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values
    ($1, 'kendi@ornek.com', '{"name":"Kendi Silen","role":"landlord"}'), ($2, 'yonetici-sildi@ornek.com', '{"name":"Askıdaki","role":"landlord"}')`, [U1, U2]);

  await as(U1);
  await q(`select public.delete_my_account()`);
  await as(ID.A);
  await q(`select public.admin_set_ban($1, true, 'Sahte hesap')`, [U2]);
  await as(ID.A);
  await q(`select public.admin_delete_user($1, 'Sahte hesap')`, [U2]);

  await as(null);
  const rows = await q(`select kind, to_email, data from public.mail_outbox where kind = 'account_deleted' order by id`);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ to_email: 'kendi@ornek.com', data: { name: 'Kendi Silen', by: 'self' } });
  expect(rows[1]).toMatchObject({ to_email: 'yonetici-sildi@ornek.com', data: { by: 'admin', reason: 'Sahte hesap' } });
  expect(await q(`select 1 from auth.users where id in ($1, $2)`, [U1, U2])).toHaveLength(0);   // hesaplar gerçekten silindi

  await as(ID.L);
  await expect(q(`select * from public.mail_outbox`)).rejects.toThrow(/permission denied/);
  await expect(q(`select public.mail_claim(1)`)).rejects.toThrow(/permission denied/);
});

test('paket seçimi: ekibe tek satır; yalnız zaman damgası değişirse ve aynı seçim günde bir kez yazılmaz; profil güncellemesi engellenmez', async () => {
  await as(ID.L2);
  const set = (c) => q(`update public.profiles set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{planChoice}', $1::jsonb) where id = $2`, [JSON.stringify(c), ID.L2]);
  await set({ plan: 'bes', units: 4, yearly: false, at: '2026-11-01T10:00:00Z' });
  await set({ plan: 'bes', units: 4, yearly: false, at: '2026-11-01T10:05:00Z' });          // yalnız zaman damgası
  await as(null);
  let rows = await q(`select to_email, data from public.mail_outbox where kind = 'plan_choice'`);
  expect(rows).toHaveLength(1);
  expect(rows[0].to_email).toBeNull();                                                       // ekip adresi fonksiyonda
  expect(rows[0].data).toMatchObject({ name: 'Başka Ev Sahibi', email: 'ev2@ornek.com', plan: 'bes', units: '4', yearly: false });

  await set({ plan: 'tek', units: 2, yearly: true, at: '2026-11-01T11:00:00Z' });         // farklı seçim → yeni satır
  await set({ plan: 'bes', units: 4, yearly: false, at: '2026-11-01T12:00:00Z' });         // eski seçime dönüş: aynı gün aynı anahtar
  await as(null);
  rows = await q(`select data from public.mail_outbox where kind = 'plan_choice' order by id`);
  expect(rows).toHaveLength(2);

  await as(ID.L2);
  await set({ plan: 'garip', units: 'abc', yearly: 5 });                                      // bozuk veri: sessizce atlanır, hata vermez
  await as(null);
  expect(await q(`select 1 from public.mail_outbox where kind = 'plan_choice'`)).toHaveLength(2);
});

test('kurum yöneticisi: hesabı olana bildirim, hesabı olmayana davet e-postası kuyruğa', async () => {
  await as(ID.A);
  const [{ id: oid }] = await q(`select public.admin_org_save($1::jsonb) id`, [JSON.stringify({ name: 'Örnek AVM', sector: 'avm' })]);
  await as(ID.A);
  const hesapli = await q(`select public.admin_org_set_master($1, 'ev@ornek.com') r`, [oid]);
  expect(hesapli[0].r.status).toBe('set');
  const n = await notes(ID.L, 'acct-org-%');
  expect(n).toHaveLength(1);
  expect(n[0].body).toContain('Örnek AVM kurumunun yöneticisi oldun');

  await as(ID.A);
  const davet = await q(`select public.admin_org_set_master($1, 'yeni@kurum.com') r`, [oid]);
  expect(davet[0].r.status).toBe('invited');
  await as(null);
  const [m] = await q(`select to_email, data from public.mail_outbox where kind = 'org_master_invite'`);
  expect(m.to_email).toBe('yeni@kurum.com');
  expect(m.data).toMatchObject({ org: 'Örnek AVM', code: davet[0].r.code });
});

test('gönderim işlevleri: ayır → kapat; hata kaydı; yeniden deneme yalnız eski ve gönderilmemiş satırları verir', async () => {
  await as(null);
  const [{ id }] = await q(`insert into public.mail_outbox (kind, to_email, data) values ('account_deleted', 'a@b.com', '{}') returning id`);
  expect((await q(`select (public.mail_claim($1)).id c`, [id]))[0].c).toBe(Number(id));
  await q(`select public.mail_fail($1, 'Resend 500')`, [id]);
  expect((await q(`select attempts, error, sent_at from public.mail_outbox where id = $1`, [id]))[0]).toMatchObject({ attempts: 1, error: 'Resend 500', sent_at: null });
  expect(await q(`select public.mail_retry() r`)).toHaveLength(0);                             // henüz 5 dakika geçmedi
  await q(`update public.mail_outbox set created_at = now() - interval '10 minutes' where id = $1`, [id]);
  expect((await q(`select public.mail_retry() r`)).map((x) => Number(x.r))).toContain(Number(id));
  await q(`select public.mail_done($1)`, [id]);
  expect((await q(`select (public.mail_claim($1)).id c`, [id]))[0].c).toBeNull();            // gönderilmiş satır ikinci kez ayrılmaz
  expect((await q(`select public.mail_retry() r`)).map((x) => Number(x.r))).not.toContain(Number(id));
});
