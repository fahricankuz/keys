// Sanal POS sağlayıcı katmanı (supabase/functions/pos/provider.ts): bilgiler girilmeden kapalı; Moka CheckKey ve istek gövdesi;
// yanıt ayrıştırma; durum sorgusu. Gerçek Moka bağlantısı test hesabıyla ayrıca doğrulanır (provider.ts başındaki not).
import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { provider, mokaAuth, mokaLinkBody, mokaParseLink, mokaParseStatus } from '../supabase/functions/pos/provider.ts';

const envOf = (o) => (k) => o[k] ?? '';
const FULL = { MOKA_DEALER_CODE: '1234', MOKA_USERNAME: 'kullanici', MOKA_PASSWORD: 'sifre', MOKA_LINK_PATH: '/x/link', MOKA_STATUS_PATH: '/x/status' };

test('bilgiler eksikse sağlayıcı kapalı; tamamsa açık', () => {
  expect(provider(envOf({})).configured()).toBe(false);
  expect(provider(envOf({ ...FULL, MOKA_STATUS_PATH: '' })).configured()).toBe(false);
  expect(provider(envOf(FULL)).configured()).toBe(true);
  expect(provider(envOf({ ...FULL, POS_PROVIDER: 'baska' })).configured()).toBe(false);
});

test('Moka CheckKey ve bağlantı isteği', async () => {
  const a = await mokaAuth(envOf(FULL));
  expect(a.CheckKey).toBe(createHash('sha256').update('1234MKkullaniciPDsifre').digest('hex'));
  const b = await mokaLinkBody(envOf(FULL), { ref: 'ANH-ABC123', amount: 12000.5, description: 'd', email: 'a@b.co', returnUrl: 'https://anahtar.io/odeme', callbackUrl: 'https://x/cb' });
  expect(b.PaymentDealerRequest).toMatchObject({ Amount: 12000.5, Currency: 'TL', OtherTrxCode: 'ANH-ABC123' });
});

test('yanıt ayrıştırma: bağlantı ve durum', () => {
  expect(mokaParseLink({ ResultCode: 'Success', Data: { Url: 'https://pay.example/1', PaymentId: 9 } })).toEqual({ url: 'https://pay.example/1', providerRef: '9' });
  expect(() => mokaParseLink({ ResultCode: 'PaymentDealer.CheckPaymentDealerAuthentication.InvalidAccount' })).toThrow(/bağlantı oluşturmadı/);
  expect(() => mokaParseLink({ ResultCode: 'Success', Data: { Url: 'http://duz' } })).toThrow();
  expect(mokaParseStatus({ ResultCode: 'Success', Data: { PaymentDetail: { PaymentStatus: 2, DealerPaymentId: 5 } } }).paid).toBe(true);
  expect(mokaParseStatus({ ResultCode: 'Success', Data: { PaymentDetail: { PaymentStatus: 0 } } }).paid).toBe(false);
  expect(mokaParseStatus({ ResultCode: 'Error' }).paid).toBe(false);
});

test('bağlantı ve durum isteği sağlayıcıya gider (sahte fetch)', async () => {
  const calls = [];
  const f = async (url, init) => { calls.push([url, JSON.parse(init.body)]); return { ok: true, json: async () => url.endsWith('/link')
    ? { ResultCode: 'Success', Data: { Url: 'https://pay.example/2' } } : { ResultCode: 'Success', Data: { PaymentDetail: { PaymentStatus: 2 } } } }; };
  const p = provider(envOf(FULL), f);
  expect((await p.createLink({ ref: 'ANH-ABC123', amount: 10, description: 'd', email: 'a@b.co', returnUrl: 'r', callbackUrl: 'c' })).url).toBe('https://pay.example/2');
  expect((await p.status('ANH-ABC123')).paid).toBe(true);
  expect(calls[0][0]).toBe('https://service.refmoka.com/x/link');
  expect(calls[1][1].PaymentDealerRequest.OtherTrxCode).toBe('ANH-ABC123');
});
