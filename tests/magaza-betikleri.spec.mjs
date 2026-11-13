// Mağaza betikleri (app/scripts/magaza): JWT imzaları, fiyat tablosu → Play temel plan gövdesi, ürün süzgeci. Ağa bağlanmaz.
import { test, expect } from '@playwright/test';
import { generateKeyPairSync, verify, createVerify } from 'node:crypto';
import { jwtUret as ascJwt } from '../app/scripts/magaza/lib/asc.mjs';
import { jwtUret as playJwt } from '../app/scripts/magaza/lib/play.mjs';
import { fiyatTablosu, urunSuz, tryPara } from '../app/scripts/magaza/lib/fiyat.mjs';
import { temelPlanGovdesi } from '../app/scripts/magaza/play-abonelikler.mjs';
import { surumGovdesi } from '../app/scripts/magaza/play-yukle.mjs';
import { bayrakOku } from '../app/scripts/magaza/lib/ortak.mjs';

const parca = (j) => j.split('.');
const coz = (s) => JSON.parse(Buffer.from(s, 'base64url').toString());

test('ASC JWT: ES256, kid/iss/aud doğru, imza ham r||s ve doğrulanır', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwt = ascJwt({ keyId: 'KEY123', issuerId: 'issuer-1', pem: privateKey.export({ type: 'pkcs8', format: 'pem' }), simdi: 1000 });
  const [h, p, s] = parca(jwt);
  expect(coz(h)).toEqual({ alg: 'ES256', kid: 'KEY123', typ: 'JWT' });
  expect(coz(p)).toMatchObject({ iss: 'issuer-1', aud: 'appstoreconnect-v1', iat: 1000 });
  expect(coz(p).exp - 1000).toBeLessThanOrEqual(1200);
  expect(Buffer.from(s, 'base64url').length).toBe(64);
  expect(verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))).toBe(true);
});

test('Play JWT: RS256, hizmet hesabı e-postası ve androidpublisher kapsamı; imza doğrulanır', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwt = playJwt({ email: 'sa@x.iam.gserviceaccount.com', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }), tokenUri: 'https://oauth2.googleapis.com/token', simdi: 1000 });
  const [h, p, s] = parca(jwt);
  expect(coz(h)).toEqual({ alg: 'RS256', typ: 'JWT' });
  expect(coz(p)).toMatchObject({ iss: 'sa@x.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token' });
  expect(createVerify('RSA-SHA256').update(`${h}.${p}`).verify(publicKey, Buffer.from(s, 'base64url'))).toBe(true);
});

test('fiyat tablosu: 36 ürün, Play temel plan kimlikleri N-aylik / N-yillik, süzgeç ve TRY para biçimi', () => {
  const t = fiyatTablosu();
  expect(t).toHaveLength(36);
  expect(t.filter((x) => x.subscription === 'tek')).toHaveLength(18);
  const r = t.find((x) => x.productId === 'tek_3_aylik');
  expect(r).toMatchObject({ basePlan: '3-aylik', playId: 'tek:3-aylik', price: 299.99, yearly: false });
  expect(urunSuz(t, 'tek_3_aylik,bes_9_yillik').map((x) => x.productId)).toEqual(['tek_3_aylik', 'bes_9_yillik']);
  expect(() => urunSuz(t, 'tek_10_aylik')).toThrow(/Bilinmeyen ürün/);
  expect(tryPara(299.99)).toEqual({ currencyCode: 'TRY', units: '299', nanos: 990000000 });
  expect(tryPara(1000)).toEqual({ currencyCode: 'TRY', units: '1000', nanos: 0 });
});

test('Play temel plan gövdesi: P1M / P1Y, TR fiyatı tablodan sabitlenir, öteki bölgeler çeviriden gelir', () => {
  const donusum = { convertedRegionPrices: { US: { price: { currencyCode: 'USD', units: '9', nanos: 990000000 } }, TR: { price: { currencyCode: 'TRY', units: '1', nanos: 0 } } },
    convertedOtherRegionsPrice: { usdPrice: { currencyCode: 'USD', units: '9' }, eurPrice: { currencyCode: 'EUR', units: '9' } } };
  const ay = fiyatTablosu().find((x) => x.productId === 'bes_2_aylik'), yil = fiyatTablosu().find((x) => x.productId === 'bes_2_yillik');
  const g = temelPlanGovdesi(ay, donusum);
  expect(g.basePlanId).toBe('2-aylik');
  expect(g.autoRenewingBasePlanType.billingPeriodDuration).toBe('P1M');
  expect(temelPlanGovdesi(yil, donusum).autoRenewingBasePlanType.billingPeriodDuration).toBe('P1Y');
  expect(g.regionalConfigs.map((x) => x.regionCode)).toEqual(['TR', 'US']);
  expect(g.regionalConfigs[0].price).toEqual({ currencyCode: 'TRY', units: '399', nanos: 990000000 });
  expect(g.regionalConfigs[1].price.currencyCode).toBe('USD');
});

test('bayraklar ve sürüm gövdesi: bilinmeyen bayrak hata, varsayılan kuru çalıştırma, draft sürüm', () => {
  expect(bayrakOku(['--urun', 'a', '--apply'], { mantiksal: ['apply'], deger: ['urun'] })).toMatchObject({ urun: 'a', apply: true });
  expect(bayrakOku(['x.aab'], { mantiksal: ['apply'] }).apply).toBeUndefined();
  expect(() => bayrakOku(['--aply'], { mantiksal: ['apply'] })).toThrow(/Bilinmeyen bayrak/);
  expect(surumGovdesi({ kanal: 'internal', durum: 'draft', kod: 12, notTr: 'Yeni' })).toEqual({ track: 'internal', releases: [{ name: '12', versionCodes: ['12'], status: 'draft', releaseNotes: [{ language: 'tr-TR', text: 'Yeni' }] }] });
});
