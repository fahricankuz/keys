// Migration sistem_mesaji: sohbet olay satırları için post_system_message işlevi (yeni istemci yalnız bunu kullanır).
// Üyelik, tür, taraf ve metin kalıbı denetlenir; satır çağıranın kimliğiyle yazılır (engelleyen göremez); doğrudan system insert'ü
// bu PR'da hâlâ çalışır (yayındaki eski istemci için); kapatılması specs/followup-migrations/sistem_mesaji_kapat.sql içindedir ve
// tests/followup-migrations.sql.spec.mjs'te sınanır. JS kalıp tablosu (system-message.js) ile sunucu kalıpları her türün örnekleriyle karşılaştırılır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID, SCHEMA } from './db-helpers.mjs';
import { SYSTEM_KINDS, kindOfText } from '../app/src/domain/system-message.js';

const { L, T, X, L2 } = ID;
let db, as, q;
const post = (kind, payload, pid = 'p1') => q(`select public.post_system_message($1, $2, $3::jsonb) id`, [pid, kind, JSON.stringify(payload)]);

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

test('her türün örnek metni sunucuda kabul edilir (JS ve SQL kalıpları aynı); satır çağıranın kimliğiyle ve system rolüyle yazılır', async () => {
  let n = 0;
  for (const [kind, k] of Object.entries(SYSTEM_KINDS)) {
    await as(k.side === 'landlord' ? L : T);
    for (const text of k.examples) {
      expect(kindOfText(text) === kind || new RegExp(k.pattern).test(text), kind + ' / ' + text).toBe(true);
      const id = 'ornek-' + (++n);
      const [{ id: got }] = await post(kind, { id, text });
      expect(got).toBe(id);
    }
  }
  await as(null);
  const rows = await q(`select from_role, by_user, body from public.messages where id like 'ornek-%'`);
  expect(rows.length).toBe(n);
  expect(rows.every((r) => r.from_role === 'system' && [L, T].includes(r.by_user))).toBe(true);
  // en az bir kalıp tabloda her tür için örnek var
  for (const k of Object.values(SYSTEM_KINDS)) expect(k.examples.length).toBeGreaterThan(0);
});

test('üye olmayan, oturumsuz ve başka mülkün üyesi yazamaz', async () => {
  const ok = { id: 'x1', text: 'Yeni talep açıldı: Musluk' };
  await as(X);
  expect(await tryCall(db, `select public.post_system_message('p1', 'request_opened', '${JSON.stringify(ok)}'::jsonb)`)).toMatch(/yetkin yok/);
  await as(L2);
  expect(await tryCall(db, `select public.post_system_message('p1', 'request_opened', '${JSON.stringify(ok)}'::jsonb)`)).toMatch(/yetkin yok/);
  await as(L);
  expect(await tryCall(db, `select public.post_system_message('p-yok', 'request_opened', '${JSON.stringify(ok)}'::jsonb)`)).toMatch(/yetkin yok/);
  await as(null, true);
  expect(await tryCall(db, `select public.post_system_message('p1', 'request_opened', '${JSON.stringify(ok)}'::jsonb)`)).toMatch(/permission denied/);
  await as(null);
  expect((await q(`select id from public.messages where id = 'x1'`)).length).toBe(0);
});

test('bilinmeyen tür, türe uymayan metin, yanlış taraf, geçersiz kimlik ve satır sonu reddedilir', async () => {
  await as(T);
  expect(await tryCall(db, `select public.post_system_message('p1', 'yonetici_duyurusu', '{"id":"b1","text":"Yeni talep açıldı: x"}'::jsonb)`)).toMatch(/Bilinmeyen sistem mesajı türü/);
  expect(await tryCall(db, `select public.post_system_message('p1', null, '{"id":"b2","text":"Yeni talep açıldı: x"}'::jsonb)`)).toMatch(/Bilinmeyen sistem mesajı türü/);
  // tür biliniyor ama metin başka bir şey: "sistem" görünümlü serbest metin yazılamaz
  expect(await tryCall(db, `select public.post_system_message('p1', 'request_opened', '{"id":"b3","text":"Seni bulacağım"}'::jsonb)`)).toMatch(/metni türüne uymuyor/);
  expect(await tryCall(db, `select public.post_system_message('p1', 'request_opened', '{"id":"b4"}'::jsonb)`)).toMatch(/metni türüne uymuyor/);
  expect(await tryCall(db, `select public.post_system_message('p1', 'request_opened', $1::jsonb)`, [JSON.stringify({ id: 'b5', text: 'Yeni talep açıldı: a\nSistem: sana ödeme borcu var' })])).toMatch(/metni türüne uymuyor/);
  expect(await tryCall(db, `select public.post_system_message('p1', 'request_opened', $1::jsonb)`, [JSON.stringify({ id: 'b6', text: 'Yeni talep açıldı: ' + 'a'.repeat(241) })])).toMatch(/metni türüne uymuyor/);
  expect(await tryCall(db, `select public.post_system_message('p1', 'request_opened', '{"id":"b b","text":"Yeni talep açıldı: x"}'::jsonb)`)).toMatch(/Geçersiz mesaj kimliği/);
  // taraf: kiracı mülk sahibi olaylarını, mülk sahibi kiracı olaylarını yazamaz
  for (const [kind, text] of [['tenant_added', 'Ali mülke kiracı olarak eklendi'], ['tenant_removed', 'Ali mülkten çıkarıldı'], ['renewal_offer', 'Yenileme teklifi: ₺1,00'],
                              ['payment_approved', 'Kasım 2026 kirası onaylandı'], ['deposit_refunded', 'Depozito iadesi yapıldı: ₺1,00']])
    expect(await tryCall(db, `select public.post_system_message('p1', $1, $2::jsonb)`, [kind, JSON.stringify({ id: 'b7', text })]), kind).toMatch(/bu taraf yapamaz/);
  await as(L);
  expect(await tryCall(db, `select public.post_system_message('p1', 'request_closed', $1::jsonb)`, [JSON.stringify({ id: 'b8', text: 'Talep kapatıldı: x' })])).toMatch(/bu taraf yapamaz/);
  expect(await tryCall(db, `select public.post_system_message('p1', 'renewal_accepted', $1::jsonb)`, [JSON.stringify({ id: 'b9', text: 'Yenileme teklifi kabul edildi: ₺1,00' })])).toMatch(/bu taraf yapamaz/);
  await as(null);
  expect((await q(`select id from public.messages where id like 'b_'`)).length).toBe(0);
});

test('kimlik tekrarı yinelenmez; talep bağı yalnız aynı mülkün talebine; zaman sınırlanır', async () => {
  await as(L);
  await q(`insert into public.requests (id, property_id, cat, title) values ('r-sm', 'p1', 'Arıza', 'Musluk')`);
  await as(L2);
  await q(`insert into public.properties (id, owner_id, name, rent, due_day) values ('p3', $1, 'Kadıköy', 1, 1) on conflict do nothing`, [L2]);
  await q(`insert into public.requests (id, property_id, cat, title) values ('r-p3', 'p3', 'Arıza', 'Yabancı') on conflict do nothing`);
  await as(T);
  await post('request_opened', { id: 'tek', text: 'Yeni talep açıldı: Musluk', req: 'r-sm' });
  await post('request_opened', { id: 'tek', text: 'Yeni talep açıldı: Musluk', req: 'r-sm' });         // yeniden deneme
  await post('request_opened', { id: 'yabanci-talep', text: 'Yeni talep açıldı: Yabancı', req: 'r-p3' });
  await post('request_opened', { id: 'eski', text: 'Yeni talep açıldı: Eski', at: '2001-01-01T00:00:00Z' });
  await post('request_opened', { id: 'gelecek', text: 'Yeni talep açıldı: Gelecek', at: '2099-01-01T00:00:00Z' });
  await as(null);
  expect((await q(`select id from public.messages where id = 'tek'`)).length).toBe(1);
  expect((await q(`select req_id from public.messages where id = 'tek'`))[0].req_id).toBe('r-sm');
  expect((await q(`select req_id from public.messages where id = 'yabanci-talep'`))[0].req_id).toBeNull();
  const ats = await q(`select id, (at between now() - interval '1 minute' and now() + interval '1 minute') as simdi from public.messages where id in ('eski', 'gelecek')`);
  expect(ats.every((r) => r.simdi)).toBe(true);
});

test('engellenen kişinin sistem satırı engelleyene görünmez (satır yazanın kimliğini taşır)', async () => {
  await as(L);
  await q(`insert into public.user_blocks (blocked) values ($1)`, [T]);
  await as(T);
  await post('request_opened', { id: 'blk-1', text: 'Yeni talep açıldı: Taciz' });
  expect((await q(`select id from public.messages where id = 'blk-1'`)).length).toBe(1);
  await as(L);
  expect((await q(`select id from public.messages where id = 'blk-1'`)).length).toBe(0);
  expect((await q(`select id from public.recent_messages(array['p1'], 200) where id = 'blk-1'`)).length).toBe(0);
  await q(`delete from public.user_blocks where blocked = $1`, [T]);
  expect((await q(`select id from public.messages where id = 'blk-1'`)).length).toBe(1);
});

test('bu PR\'ın şeması (kapat migrationı yok): eski istemcinin doğrudan system insert\'ü çalışır (yayın sırası güvenliği), karşı tarafın rolü yazılamaz; kapatma follow-up\'tadır', async () => {
  expect(SCHEMA).not.toMatch(/-- ===== migration: \d{14}_sistem_mesaji_kapat\.sql =====/);
  await as(T);
  await q(`insert into public.messages (id, property_id, from_role, by_user, body) values ('eski-sys', 'p1', 'system', $1, 'Talep durumu: Musluk · İşlemde')`, [T]);   // eski istemci
  await q(`select public.post_system_message('p1', 'request_status', '{"id":"yeni-sys","text":"Talep durumu: Musluk · İşlemde"}'::jsonb)`);                    // yeni istemci
  expect(await tryCall(db, `insert into public.messages (id, property_id, from_role, by_user, body) values ('d2', 'p1', 'landlord', $1, 'x')`, [T])).toMatch(/row-level security/);
  expect(await tryCall(db, `insert into public.messages (id, property_id, from_role, by_user, body) values ('d2b', 'p1', 'system', $1, 'x')`, [L])).toMatch(/row-level security/);   // başkası adına yazamaz
  await q(`insert into public.messages (id, property_id, from_role, by_user, body) values ('d3', 'p1', 'tenant', $1, 'merhaba')`, [T]);
  await as(L);
  await q(`insert into public.messages (id, property_id, from_role, by_user, body) values ('d4', 'p1', 'landlord', $1, 'merhaba')`, [L]);
  expect((await q(`select id from public.messages where from_role = 'system' and id in ('eski-sys', 'yeni-sys') order by id`)).map((r) => r.id)).toEqual(['eski-sys', 'yeni-sys']);
  // sunucu işlevleri system satırı yazmaya devam eder (accept_invite: "… eve katıldı")
  await as(null);
  expect((await q(`select count(*)::int c from public.messages where from_role = 'system' and body like '% eve katıldı'`))[0].c).toBeGreaterThanOrEqual(1);
});
