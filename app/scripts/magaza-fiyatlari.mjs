// Mağaza fiyat tablosu: App Store Connect ve Google Play Console'da girilecek bütün ürünlerin (36) TL fiyatı.
//
// Kural (app/src/domain/store-ids.js → storePricePoint): ürün fiyatı = mülk başı fiyat × mülk adedi, en yakın ",99"
// fiyat basamağına yuvarlanır. Mülk başı fiyatlar app/src/domain/config.js → billing.tiers içindedir
// (Başlangıç 99,99 ₺ / ay ve 999,99 ₺ / yıl; Profesyonel 199,99 ₺ / ay ve 1.999,99 ₺ / yıl). Örnekler:
// 2 × 99,99 = 199,98 → 199,99 · 3 × 99,99 = 299,97 → 299,99 · 9 × 999,99 = 8.999,91 → 8.999,99.
// Fiyatlar KDV dahildir; mağaza komisyonu ve vergiyi kendi hesaplar. Yalnızca TL (Türkiye) girilir; diğer ülkeleri
// mağazalar otomatik karşılar.
//
// Kullanım (depo kökünden):
//   node app/scripts/magaza-fiyatlari.mjs            okunur tablo
//   node app/scripts/magaza-fiyatlari.mjs --csv      CSV (ürün kimliği;Play kimliği;abonelik;temel plan;paket;adet;dönem;fiyat)
//   node app/scripts/magaza-fiyatlari.mjs --json     JSON (betiklerle ürün oluşturmak için)
//   node app/scripts/magaza-fiyatlari.mjs --play     yalnızca Google Play (abonelik → temel plan → fiyat)
// Dosya hiçbir şeyi yazmaz ve ağa bağlanmaz. (Node, app/package.json'da "type" olmadığı için bir uyarı yazar; gizlemek için
// `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON ...` ile çalıştır.)

import { CONFIG } from '../src/domain/config.js';
import { storePriceTable, STORE_PLANS } from '../src/domain/store-ids.js';

const rows = storePriceTable(CONFIG.billing.tiers);
const arg = new Set(process.argv.slice(2));
const tl = (n) => n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pad = (s, n) => String(s).padEnd(n);
const NAME = { tek: 'Başlangıç', bes: 'Profesyonel' };

if (arg.has('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else if (arg.has('--csv')) {
  console.log('urun_kimligi;play_kimligi;abonelik;temel_plan;paket;adet;donem;fiyat_try');
  for (const r of rows) console.log([r.productId, r.playId, r.subscription, r.basePlan, r.plan, r.units, r.yearly ? 'yillik' : 'aylik', r.price.toFixed(2)].join(';'));
} else if (arg.has('--play')) {
  for (const sub of STORE_PLANS) {
    console.log(`\nGoogle Play abonelik: ${sub} (${NAME[sub]})`);
    for (const r of rows.filter((x) => x.subscription === sub)) console.log(`  ${pad(r.basePlan, 10)} ${pad(r.yearly ? 'yıllık' : 'aylık', 7)} ${tl(r.price).padStart(12)} ₺   (RevenueCat: ${r.playId})`);
  }
} else {
  console.log('App Store (abonelik grubu "anahtar", 36 ürün) ve Google Play (iki abonelik, 18 temel plan) fiyatları, KDV dahil, TRY');
  console.log(`\n${pad('App Store ürün kimliği', 24)}${pad('Play (RevenueCat)', 20)}${pad('Paket', 13)}${pad('Adet', 6)}${pad('Dönem', 8)}${'Fiyat (₺)'.padStart(14)}`);
  for (const r of rows) console.log(`${pad(r.productId, 24)}${pad(r.playId, 20)}${pad(NAME[r.plan], 13)}${pad(r.units, 6)}${pad(r.yearly ? 'yıllık' : 'aylık', 8)}${tl(r.price).padStart(14)}`);
  console.log(`\n${rows.length} ürün. Kural: mülk başı fiyat × adet, en yakın ",99" basamağı (app/src/domain/store-ids.js → storePricePoint).`);
}
