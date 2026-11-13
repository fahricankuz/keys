// App Store Connect: abonelik fiyatlarını bütün bölgelere yazar. Önce TRY (TUR) taban fiyatı fiyat tablosundan seçilir
// (app/src/domain/store-ids.js; magaza-fiyatlari.mjs ile aynı kaynak), sonra Apple'ın "denkleştirilmiş" (equalization) fiyatları
// öteki bölgelere yazılır. Zaten fiyatı olan bölge atlanır: tekrar çalıştırmak güvenlidir.
//
// Kullanım (depo kökünden):
//   node app/scripts/magaza/asc-abonelik-fiyatlari.mjs                      kuru çalıştırma (varsayılan; hiçbir şey yazmaz)
//   node app/scripts/magaza/asc-abonelik-fiyatlari.mjs --urun tek_3_aylik   yalnız bu ürün(ler) (virgülle çoklu)
//   node app/scripts/magaza/asc-abonelik-fiyatlari.mjs --apply               GERÇEKTEN YAZAR (sahibinin açık onayı gerekir)
// Ortam: ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH, ASC_APP_ID (bkz. README.md).
// Apple saatlik istek sınırı 3600'dür; yazmalar arasında ~1,1 sn beklenir (36 ürün × ~175 bölge ≈ 2 saat; yarıda kesilirse yeniden çalıştır).

import { bayrakOku, bekle, gunluk } from './lib/ortak.mjs';
import { ascIstemci } from './lib/asc.mjs';
import { fiyatTablosu, urunSuz } from './lib/fiyat.mjs';

const PLAN = 'UPFRONT';        // peşin ödeme planı (Apple'ın varsayılan fiyatlama planı)
const TABAN_BOLGE = 'TUR';
const ARA = 1100;              // ms

const bayrak = bayrakOku(process.argv.slice(2), { mantiksal: ['apply', 'dry-run'], deger: ['urun'] });
if (bayrak.apply && bayrak['dry-run']) throw new Error('--apply ve --dry-run birlikte verilemez.');
const yaz = !!bayrak.apply;
const asc = ascIstemci();
const satirlar = urunSuz(fiyatTablosu(), bayrak.urun);

let sonYazma = 0;
async function yazIstek(yontem, yol, govde) {
  const bekleme = ARA - (Date.now() - sonYazma);
  if (bekleme > 0) await bekle(bekleme);
  sonYazma = Date.now();
  return asc.istek(yontem, yol, govde);
}
const fiyatGovdesi = (aboneId, noktaId, bolge) => ({ data: { type: 'subscriptionPrices', attributes: { startDate: null, planType: PLAN, preserveCurrentPrice: false },
  relationships: { subscription: { data: { type: 'subscriptions', id: aboneId } }, subscriptionPricePoint: { data: { type: 'subscriptionPricePoints', id: noktaId } }, territory: { data: { type: 'territories', id: bolge } } } } });

gunluk(yaz ? 'YAZMA MODU (--apply)' : 'Kuru çalıştırma: hiçbir şey yazılmaz (yazmak için --apply)');
const bolgeler = (await asc.hepsi('/v1/territories?limit=200')).data.map((x) => x.id);
const gruplar = await asc.hepsi(`/v1/apps/${asc.ayar.appId}/subscriptionGroups?limit=50`);
const aboneler = new Map();
for (const g of gruplar.data) for (const a of (await asc.hepsi(`/v1/subscriptionGroups/${g.id}/subscriptions?limit=200`)).data) aboneler.set(a.attributes.productId, a);
gunluk(`${bolgeler.length} bölge, ${aboneler.size} abonelik App Store Connect'te; tablodan ${satirlar.length} ürün işlenecek`);

let yazilan = 0, atlanan = 0; const hatalar = [];
for (const satir of satirlar) {
  const abone = aboneler.get(satir.productId);
  if (!abone) { hatalar.push(`${satir.productId}: App Store Connect'te yok (önce abonelik oluşturulmalı)`); gunluk('YOK', satir.productId); continue; }
  try {
    const fiyatlar = await asc.hepsi(`/v1/subscriptions/${abone.id}/prices?include=subscriptionPricePoint,territory&limit=200`);
    const mevcut = new Map();
    for (const p of fiyatlar.data) {
      const b = p.relationships?.territory?.data?.id;
      if (b && (p.attributes.planType || PLAN) === PLAN) mevcut.set(b, p.relationships?.subscriptionPricePoint?.data?.id);
    }
    // 1) Taban (TUR) fiyat noktası: varsa o; yoksa tablodaki TRY fiyatla eşleşen nokta.
    let tabanNokta = mevcut.get(TABAN_BOLGE), tabanYazilacak = false;
    if (!tabanNokta) {
      const noktalar = await asc.hepsi(`/v1/subscriptions/${abone.id}/pricePoints?filter[territory]=${TABAN_BOLGE}&limit=200`);
      const hedef = Math.round(satir.price * 100);
      const n = noktalar.data.find((x) => Math.round(Number(x.attributes.customerPrice) * 100) === hedef);
      if (!n) { hatalar.push(`${satir.productId}: Apple'da ${satir.price} TRY fiyat noktası yok`); gunluk('NOKTA YOK', satir.productId, satir.price); continue; }
      tabanNokta = n.id; tabanYazilacak = true;
    }
    // 2) Denkleştirilmiş fiyatlar
    const esdeger = await asc.hepsi(`/v1/subscriptionPricePoints/${tabanNokta}/equalizations?include=territory&limit=200`);
    const esMap = new Map(esdeger.data.map((e) => [e.relationships.territory.data.id, e.id]));
    const eksik = bolgeler.filter((b) => b !== TABAN_BOLGE && !mevcut.has(b));
    const yazilacak = eksik.filter((b) => esMap.has(b)), esdegersiz = eksik.filter((b) => !esMap.has(b));
    gunluk(`${satir.productId} (${satir.price} TRY): ${mevcut.size} bölge fiyatlı, taban ${tabanYazilacak ? 'YAZILACAK' : 'var'}, ${yazilacak.length} bölge yazılacak${esdegersiz.length ? `, eşdeğer yok: ${esdegersiz.join(',')}` : ''}`);
    atlanan += mevcut.size;
    if (!yaz) { yazilan += yazilacak.length + (tabanYazilacak ? 1 : 0); continue; }
    const is = [...(tabanYazilacak ? [[TABAN_BOLGE, tabanNokta]] : []), ...yazilacak.map((b) => [b, esMap.get(b)])];
    for (const [b, nokta] of is) {
      const { durum, veri } = await yazIstek('POST', '/v1/subscriptionPrices', fiyatGovdesi(abone.id, nokta, b));
      if (durum === 200 || durum === 201) yazilan++;
      else if (durum === 409 && /already/i.test(asc.hata(veri))) atlanan++;
      else { hatalar.push(`${satir.productId} ${b} ${durum}: ${asc.hata(veri).slice(0, 200)}`); gunluk('HATA', satir.productId, b, durum); }
    }
  } catch (e) { hatalar.push(`${satir.productId}: ${e.message}`); gunluk('HATA', satir.productId, e.message); }
}
gunluk(`${yaz ? 'Yazılan' : 'Yazılacak'}: ${yazilan}, zaten fiyatlı (atlanan): ${atlanan}, hata: ${hatalar.length}`);
for (const h of hatalar) console.error('  - ' + h);
if (hatalar.length) process.exitCode = 1;
