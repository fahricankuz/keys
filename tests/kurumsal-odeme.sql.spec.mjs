// Kurumsal ödeme (migration kurumsal_odeme): banka hesapları yalnız yöneticide; Havale/EFT isteği müşteriye e-posta kuyruğuna
// girer; "ödeme alındı" paketi tanımlar, ikinci kez işlemez; iptal; Sanal POS onayı yalnız sunucu işleviyle. Gerçek Postgres'te (PGlite).
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

let db, as, q, req;
const IBAN = 'TR' + '0'.repeat(24);

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

test('banka hesabını yalnız yönetici görür ve ekler', async () => {
  await as(ID.L);
  expect(await tryCall(db, `insert into public.pay_accounts (bank, holder, iban) values ('Banka', 'Anahtar', $1)`, [IBAN])).toMatch(/row-level security/);
  await as(ID.A);
  expect(await tryCall(db, `insert into public.pay_accounts (bank, holder, iban) values ('Banka', 'Anahtar', 'TR12')`)).toMatch(/pay_accounts_iban_check/);
  await q(`insert into public.pay_accounts (bank, holder, iban, note, is_default) values ('Örnek Bank', 'Anahtar A.Ş.', $1, 'Açıklamaya kodu yazın', true)`, [IBAN]);
  await as(ID.L);
  expect(await q(`select * from public.pay_accounts`)).toHaveLength(0);
});

test('havale isteği: e-posta kuyruğa girer, paket henüz tanımlanmaz; yönetici olmayan isteyemez', async () => {
  const p = { method: 'havale', plan: 'kurumsal', units: 20, sector: 'emlak', amount: 12000, why: 'teklif' };
  await as(ID.L);
  expect(await tryCall(db, `select public.admin_pay_request($1, $2)`, [ID.L2, p])).toMatch(/Yönetici yetkisi/);
  await as(ID.A);
  expect(await tryCall(db, `select public.admin_pay_request($1, $2)`, [ID.L2, { ...p, amount: 0 }])).toMatch(/Tutarı yaz/);
  [{ admin_pay_request: req }] = await q(`select public.admin_pay_request($1, $2)`, [ID.L2, p]);
  expect(req.ref).toMatch(/^ANH-[0-9A-F]{6}$/);
  expect(req.account).toMatchObject({ bank: 'Örnek Bank', iban: IBAN });
  await db.exec('reset role');
  const [m] = await q(`select kind, to_email, data from public.mail_outbox where dedupe = $1`, ['havale-' + req.ref]);
  expect(m).toMatchObject({ kind: 'havale_bilgi', to_email: 'ev2@ornek.com' });
  expect(m.data).toMatchObject({ amount: 12000, ref: req.ref, iban: IBAN, plan: 'kurumsal', units: 20 });
  expect(await q(`select 1 from public.subscriptions where user_id = $1 and store = 'admin'`, [ID.L2])).toHaveLength(0);
});

test('ödeme alındı: paket tanımlanır, ikinci kez işlenmez; iptal ve dış çağrı kapalı', async () => {
  await as(ID.A);
  await q(`select public.admin_pay_set($1, 'paid')`, [req.id]);
  await db.exec('reset role');
  const [s] = await q(`select product_id, units, sector, store from public.subscriptions where user_id = $1`, [ID.L2]);
  expect(s).toEqual({ product_id: 'kurumsal', units: 20, sector: 'emlak', store: 'admin' });
  await as(ID.A);
  expect(await tryCall(db, `select public.admin_pay_set($1, 'paid')`, [req.id])).toMatch(/zaten sonuçlandı/);
  const [{ admin_pay_request: r2 }] = await q(`select public.admin_pay_request($1, $2)`, [ID.L, { method: 'pos', plan: 'bes', units: 3, amount: 900, why: 'x' }]);
  await q(`select public.admin_pay_set($1, 'cancelled')`, [r2.id]);
  expect((await q(`select status from public.corp_payments where id = $1`, [r2.id]))[0].status).toBe('cancelled');
  expect(await tryCall(db, `select public.pay_confirm($1)`, [r2.ref])).toMatch(/permission denied/);
  expect(await tryCall(db, `select public.grant_plan($1, 'kurumsal', null, 'x', 5, 'site')`, [ID.A])).toMatch(/permission denied/);
});

test('sanal POS onayı sunucudan: bekleyen isteği öder, paketi tanımlar', async () => {
  await as(ID.A);
  const [{ admin_pay_request: r3 }] = await q(`select public.admin_pay_request($1, $2)`, [ID.L, { method: 'pos', plan: 'bes', units: 4, amount: 1200, why: 'x' }]);
  await db.exec('reset role');
  await q(`select public.pay_set_link($1, 'moka', 'https://odeme.example/x', 'M1')`, [r3.id]);
  expect((await q(`select public.pay_confirm($1, 'M1') ok`, [r3.ref]))[0].ok).toBe(true);
  expect((await q(`select public.pay_confirm($1) ok`, [r3.ref]))[0].ok).toBe(false);
  expect((await q(`select product_id from public.subscriptions where user_id = $1`, [ID.L]))[0].product_id).toBe('bes_4_aylik');
});
