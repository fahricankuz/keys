/* Mağaza ürün kimlikleri (App Store ve Google Play). Sunucu kimlikten paketi ve mülk adedini okur
   (schema.sql 21. bölüm: plan_of, product_units; biçim paket_adet_dönem: tek_3_aylik, bes_5_yillik).

   App Store: her kimlik ayrı otomatik yenilenen abonelik (36 ürün), hepsi tek abonelik grubunda ("anahtar"): tek_3_aylik.
   Google Play: 2 abonelik, `tek` ve `bes`; her birinin 18 temel planı (base plan) var: `3-aylik`, `3-yillik` (adet 1-9).
   RevenueCat Play ürününü "abonelik:temel-plan" diye verir: `tek:3-aylik`. Sunucudaki kanonik kimlik her zaman `tek_3_aylik`. */

export const STORE_PLANS = ['tek', 'bes'];
export const STORE_MAX_UNITS = 9;

const clampUnits = (units) => Math.min(STORE_MAX_UNITS, Math.max(1, Math.floor(Number(units) || 1)));
const periodOf = (yearly) => (yearly ? 'yillik' : 'aylik');
const must = (plan) => { if (!STORE_PLANS.includes(plan)) throw new Error('Paket mağazada satılmaz: ' + plan); return plan; };

/** Google Play abonelik kimliği: paketin kendisi (`tek` / `bes`). */
export function playSubscriptionId(plan){ return must(plan); }

/** Google Play temel plan kimliği: `3-aylik`, `9-yillik`. */
export function playBasePlanId(units, yearly){ return `${clampUnits(units)}-${periodOf(yearly)}`; }

/** Paket, mülk adedi ve dönemden ürün kimliği. platform 'android' ise RevenueCat'in Play biçimi (`tek:3-aylik`),
    değilse App Store / sunucu kimliği (`tek_3_aylik`). Adet 1-9 aralığına sıkıştırılır. */
export function storeProductId(plan, units, yearly, platform = 'ios'){
  must(plan);
  return platform === 'android'
    ? `${playSubscriptionId(plan)}:${playBasePlanId(units, yearly)}`
    : `${plan}_${clampUnits(units)}_${periodOf(yearly)}`;
}

/** Sunucudaki kanonik kimlik (App Store kimliğiyle aynı): `tek_3_aylik`. */
export function canonicalProductId(plan, units, yearly){ return storeProductId(plan, units, yearly, 'ios'); }

/** Herhangi bir mağaza kimliğinden (App Store `tek_3_aylik`, Play `tek:3-aylik`) paket, adet ve dönem; tanınmazsa null. */
export function parseStoreProductId(id){
  const s = String(id || '');
  const m = /^(tek|bes)_([1-9])_(aylik|yillik)$/.exec(s) || /^(tek|bes):([1-9])-(aylik|yillik)$/.exec(s);
  return m ? { plan: m[1], units: Number(m[2]), yearly: m[3] === 'yillik' } : null;
}

/** Mağazada tanımlanması gereken bütün kimlikler (kurulum listesi ve test için): 36 adet.
    'android' için RevenueCat'in gördüğü `abonelik:temel-plan` kimlikleri. */
export function allStoreProductIds(platform = 'ios'){
  const out = [];
  for (const p of STORE_PLANS) for (let n = 1; n <= STORE_MAX_UNITS; n++) for (const y of [false, true]) out.push(storeProductId(p, n, y, platform));
  return out;
}

/** Google Play'de açılacak abonelikler (2 adet). */
export function allPlaySubscriptions(){ return STORE_PLANS.slice(); }

/* ---- Fiyat basamakları ---------------------------------------------------------------------------------------------
   Mağaza fiyatı serbest yazılamaz, fiyat basamaklarından seçilir. Kural: ürünün fiyatı = mülk başı fiyat × adet,
   en yakın ",99" basamağına yuvarlanır (örn. 2 × 99,99 = 199,98 → 199,99; 9 × 999,99 = 8.999,91 → 8.999,99).
   Ortadaysa (",49") yukarı yuvarlanır. Hesap kuruş (tam sayı) üzerinden yapılır, kayan nokta hatası olmaz. */

/** Tutarı (₺) en yakın ",99" basamağına yuvarlar; en az 0,99. */
export function storePricePoint(amount){
  const cents = Math.round(Number(amount) * 100);
  const wholes = Math.max(0, Math.round((cents - 99) / 100));
  return (wholes * 100 + 99) / 100;
}

/** Mülk başı fiyat × adet, en yakın ",99" basamağına yuvarlanmış mağaza fiyatı. */
export function storePrice(unitPrice, units){
  return storePricePoint(Math.round(Number(unitPrice) * 100) * clampUnits(units) / 100);
}

/** Bütün ürünlerin fiyat tablosu (config.js → billing.tiers): kurulum konsolunda girilecek değerler.
    Her satır: { productId (App Store), playId (RevenueCat), subscription, basePlan, plan, units, yearly, price }. */
export function storePriceTable(tiers){
  const rows = [];
  for (const plan of STORE_PLANS){
    const tier = (tiers || []).find((x) => x.id === plan);
    if (!tier) throw new Error('config.js → billing.tiers içinde paket yok: ' + plan);
    for (let n = 1; n <= STORE_MAX_UNITS; n++) for (const yearly of [false, true]){
      rows.push({
        productId: storeProductId(plan, n, yearly, 'ios'), playId: storeProductId(plan, n, yearly, 'android'),
        subscription: playSubscriptionId(plan), basePlan: playBasePlanId(n, yearly), plan, units: n, yearly,
        price: storePrice(yearly ? tier.yearly : tier.price, n)
      });
    }
  }
  return rows;
}

/* ---- Paket değişikliği ---------------------------------------------------------------------------------------------
   Karşılaştırma için "aylık değer": mülk başı fiyat × adet; yıllıkta 12'ye bölünür. */

/** Bir ürünün aylık değeri (₺, karşılaştırma için); tier yoksa null. */
export function monthlyValue(tiers, plan, units, yearly){
  const tier = (tiers || []).find((x) => x.id === plan);
  const v = tier && (yearly ? tier.yearly : tier.price);
  return v == null ? null : (v * clampUnits(units)) / (yearly ? 12 : 1);
}

/** Mevcut üründen yenisine geçişin türü:
    'new'       mevcut abonelik yok;
    'same'      aynı ürün;
    'upgrade'   daha değerli paket / daha çok mülk: hemen başlar, kalan süre orantılı hesaba katılır;
    'downgrade' daha düşük değer ya da dönemi kısaltma (yıllık → aylık): mevcut dönemin sonunda başlar.
    from / to: { plan, units, yearly } (parseStoreProductId çıktısı). Bilinmeyen eski ürün 'downgrade' sayılır (para kaybı olmaz). */
export function changeKind(tiers, from, to){
  if (!from) return 'new';
  if (!to) return 'new';
  if (from.plan === to.plan && from.units === to.units && !!from.yearly === !!to.yearly) return 'same';
  if (from.yearly && !to.yearly) return 'downgrade';
  const a = monthlyValue(tiers, from.plan, from.units, from.yearly), b = monthlyValue(tiers, to.plan, to.units, to.yearly);
  if (a == null || b == null) return 'downgrade';
  return b > a ? 'upgrade' : 'downgrade';
}
