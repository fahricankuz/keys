// Hukuki süreç desteği (şema 22. bölüm): talebi açan ve yöneticiler görür, karşı taraf görmez; fiyat ve durum
// sunucuda belirlenir; kişi yalnız "alındı" durumundaki talebini iptal eder; durum değişince bildirim ve işlem kaydı.
// Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

let db, as, q;
let rid;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

test('mülk sahibi talep açar: numara, fiyat, durum ve iletişim bilgisi sunucuda belirlenir', async () => {
  await as(ID.L);
  const [r] = await q(`insert into public.legal_requests (role, property_id, property_name, topic, body, price, status, reply, files, context)
    values ('landlord', 'p1', 'Moda', 'gecikme', 'İki aydır ödeme yok', 1, 'closed', 'hile', '[{"name":"ihtar.pdf","path":"hukuk-${ID.L}/a.pdf"}]', '{"payments":[]}')
    returning id, no, price::int, status, reply, contact`);
  rid = r.id;
  expect(r.no).toBeGreaterThan(0);
  expect(r.price).toBe(3000);
  expect(r.status).toBe('received');
  expect(r.reply).toBe('');
  expect(r.contact.email).toBe('ev@ornek.com');
});

test('talebi yalnız açan kişi ve yönetici görür; kiracı ve yabancı göremez', async () => {
  await as(ID.T);
  expect(await q(`select id from public.legal_requests`)).toEqual([]);
  await as(ID.X);
  expect(await q(`select id from public.legal_requests`)).toEqual([]);
  await as(ID.A);
  expect((await q(`select id from public.legal_requests`)).length).toBe(1);
});

test('kiracı mülk sahibi rolüyle ya da üyesi olmadığı mülk için talep açamaz; kendi rolüyle açar', async () => {
  await as(ID.T);
  expect(await tryCall(db, `insert into public.legal_requests (role, property_id, topic, body) values ('landlord', 'p1', 'tahliye', 'x')`)).toBeTruthy();
  expect(await tryCall(db, `insert into public.legal_requests (role, property_id, topic, body) values ('tenant', 'p2', 'depozito', 'x')`)).toBeTruthy();
  await q(`insert into public.legal_requests (role, property_id, property_name, topic, body) values ('tenant', 'p1', 'Moda', 'depozito', 'Depozito iade edilmedi')`);
  // Mülk sahibi kiracının talebini görmez.
  await as(ID.L);
  expect((await q(`select topic from public.legal_requests`)).map(r => r.topic)).toEqual(['gecikme']);
});

test('boş açıklama ve geçersiz konu reddedilir', async () => {
  await as(ID.L);
  expect(await tryCall(db, `insert into public.legal_requests (role, topic, body) values ('landlord', 'gecikme', '   ')`)).toBeTruthy();
  expect(await tryCall(db, `insert into public.legal_requests (role, topic, body) values ('landlord', 'bosanma', 'x')`)).toBeTruthy();
});

test('kişi durumu, fiyatı ya da yanıtı değiştiremez; yalnız "alındı" talebini iptal eder', async () => {
  await as(ID.L);
  expect(await tryCall(db, `update public.legal_requests set status = 'paid' where id = $1`, [rid])).toMatch(/ekibimiz/);
  expect(await tryCall(db, `update public.legal_requests set price = 1 where id = $1`, [rid])).toMatch(/ekibimiz/);
  await as(ID.X);
  await q(`update public.legal_requests set status = 'cancelled' where id = $1`, [rid]);   // başkasının talebi: satır görünmez, etkisiz
  await as(null);
  expect((await q(`select status from public.legal_requests where id = $1`, [rid]))[0].status).toBe('received');
});

test('yönetici durumu ilerletir: zaman damgaları, kişiye bildirim ve işlem kaydı; iç not kullanıcıya görünmez', async () => {
  await as(ID.A);
  await q(`update public.legal_requests set status = 'paid', reply = 'Ödemen alındı, dosyan hazırlanıyor.' where id = $1`, [rid]);
  await q(`insert into public.legal_notes (request_id, note) values ($1, 'Av. ile görüşüldü')`, [rid]);
  await q(`update public.legal_requests set status = 'forwarded' where id = $1`, [rid]);
  const [r] = await q(`select status, paid_at is not null as paid, forwarded_at is not null as fwd, closed_at from public.legal_requests where id = $1`, [rid]);
  expect(r).toEqual({ status: 'forwarded', paid: true, fwd: true, closed_at: null });
  await as(null);
  const notes = await q(`select title, body, url from public.notifications where user_id = $1 and title like 'Hukuki destek%' order by id`, [ID.L]);
  expect(notes.map(n => n.title)).toEqual([expect.stringMatching(/^Hukuki destek H-\d{4}: Ödemen alındı$/), expect.stringMatching(/Hukuk bürosuna iletildi$/)]);
  expect(notes[0].body).toBe('Ödemen alındı, dosyan hazırlanıyor.');
  expect(notes[0].url).toBe('/uygulama/talepler');
  expect((await q(`select action from public.admin_audit where target = $1 order by id`, [rid])).map(a => a.action)).toEqual(['legal.paid', 'legal.forwarded']);
  await as(ID.L);
  expect(await q(`select note from public.legal_notes`)).toEqual([]);
  expect(await tryCall(db, `update public.legal_requests set status = 'cancelled' where id = $1`, [rid])).toMatch(/ekibimiz/);
});

test('günde en fazla 5 talep', async () => {
  await as(ID.X);
  for (let i = 0; i < 5; i++) await q(`insert into public.legal_requests (role, topic, body) values ('tenant', 'diger', 'soru ${i}')`);
  expect(await tryCall(db, `insert into public.legal_requests (role, topic, body) values ('tenant', 'diger', 'fazla')`)).toMatch(/sınır/);
});

test('dosya yalnız kişinin kendi hukuk klasörüne yüklenir', async () => {
  await as(ID.L);
  await q(`insert into storage.objects (bucket_id, name, owner) values ('evim', $1, $2)`, ['hukuk-' + ID.L + '/a.pdf', ID.L]);
  expect(await tryCall(db, `insert into storage.objects (bucket_id, name, owner) values ('evim', $1, $2)`, ['hukuk-' + ID.T + '/b.pdf', ID.L])).toBeTruthy();
});
