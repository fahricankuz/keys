// Yönetici panelinden e-posta (migration panel_eposta): yalnız yönetici gönderir; kuyruğa admin_message, gönderim kaydı,
// "Son temas" notu ve İşlem kaydı; hatalı girdi ve saatlik sınır; kayıtları kullanıcı göremez.
import { test, expect } from '@playwright/test';
import { newDb, ID, tryCall } from './db-helpers.mjs';

let db, as, q, req;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await as(null);
  [{ id: req }] = await q(`insert into public.support_requests (kind, name, email, message) values ('genel', 'Selin', 'selin@ornek.com', 'Merhaba') returning id`);
});
const send = (p) => q(`select public.admin_send_email($1::jsonb) id`, [JSON.stringify(p)]);

test('yönetici gönderir: kuyruk, kayıt (talebe bağlı), son temas notu ve işlem kaydı', async () => {
  await as(ID.A);
  const [{ id }] = await send({ to: ' Selin@Ornek.com ', subject: 'Talebin hakkında', body: 'Merhaba Selin,\n\nYarın arayalım.', request_id: req, user_id: ID.L });
  await as(null);
  const [m] = await q(`select kind, to_email, data from public.mail_outbox where kind = 'admin_message'`);
  expect(m).toEqual({ kind: 'admin_message', to_email: 'selin@ornek.com', data: { subject: 'Talebin hakkında', body: 'Merhaba Selin,\n\nYarın arayalım.' } });
  expect(await q(`select to_email, request_id, user_id, sent_by from public.admin_emails where id = $1`, [id])).toEqual([{ to_email: 'selin@ornek.com', request_id: req, user_id: ID.L, sent_by: ID.A }]);
  expect(await q(`select note from public.customer_contacts where user_id = $1`, [ID.L])).toEqual([{ note: 'E-posta gönderildi: Talebin hakkında' }]);
  expect((await q(`select count(*)::int n from public.admin_audit where action = 'email.send' and target = 'selin@ornek.com'`))[0].n).toBe(1);
});

test('kullanıcı gönderemez ve kayıtları göremez; hatalı adres, boş konu ve mesaj reddedilir', async () => {
  for (const who of [ID.L, ID.T]) {
    await as(who);
    expect(await tryCall(db, `select public.admin_send_email('{"to":"a@b.co","subject":"x","body":"y"}'::jsonb)`)).toMatch(/Yönetici/);
    expect(await q(`select * from public.admin_emails`)).toEqual([]);
  }
  await as(null, true);
  expect(await tryCall(db, `select public.admin_send_email('{"to":"a@b.co","subject":"x","body":"y"}'::jsonb)`)).toMatch(/permission denied/);
  await as(ID.A);
  expect(await tryCall(db, `select public.admin_send_email('{"to":"yanlis","subject":"x","body":"y"}'::jsonb)`)).toMatch(/Geçerli bir e-posta/);
  expect(await tryCall(db, `select public.admin_send_email('{"to":"a@b.co","subject":"  ","body":"y"}'::jsonb)`)).toMatch(/Konu yaz/);
  expect(await tryCall(db, `select public.admin_send_email('{"to":"a@b.co","subject":"x","body":""}'::jsonb)`)).toMatch(/Mesaj yaz/);
});

test('saatte en çok 30 e-posta', async () => {
  await as(ID.A);
  for (let i = 0; i < 29; i++) await send({ to: 'a@b.co', subject: 'S' + i, body: 'B' });
  expect(await tryCall(db, `select public.admin_send_email('{"to":"a@b.co","subject":"x","body":"y"}'::jsonb)`)).toMatch(/Saatte en çok 30/);
});
