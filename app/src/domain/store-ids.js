/* Mağaza ürün kimlikleri (App Store ve Google Play). Sunucu kimlikten paketi ve mülk adedini okur
   (schema.sql 21. bölüm: plan_of, product_units; biçim paket_adet_dönem: tek_3_aylik, bes_5_yillik).
   App Store: her kimlik ayrı otomatik yenilenen abonelik, hepsi tek abonelik grubunda ("anahtar").
   Google Play: abonelik kimliği paket_adet ("tek_3"), temel planlar "aylik" ve "yillik"; RevenueCat bunu "tek_3:aylik" diye verir. */

export const STORE_PLANS = ['tek', 'bes'];
export const STORE_MAX_UNITS = 9;

/** Paket, mülk adedi ve dönemden ürün kimliği. platform 'android' ise Google Play biçimi. */
export function storeProductId(plan, units, yearly, platform = 'ios'){
  if (!STORE_PLANS.includes(plan)) throw new Error('Paket mağazada satılmaz: ' + plan);
  const n = Math.min(STORE_MAX_UNITS, Math.max(1, Math.floor(Number(units) || 1)));
  const period = yearly ? 'yillik' : 'aylik';
  return platform === 'android' ? `${plan}_${n}:${period}` : `${plan}_${n}_${period}`;
}

/** Mağazada tanımlanması gereken bütün kimlikler (kurulum listesi ve test için). */
export function allStoreProductIds(platform = 'ios'){
  const out = [];
  for (const p of STORE_PLANS) for (let n = 1; n <= STORE_MAX_UNITS; n++) for (const y of [false, true]) out.push(storeProductId(p, n, y, platform));
  return out;
}
