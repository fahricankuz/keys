// Tek fiyat kaynağı: app/src/domain/store-ids.js + config.js (app/scripts/magaza-fiyatlari.mjs ile aynı tablo).
// Her satır: { productId, playId, subscription, basePlan, plan, units, yearly, price (TRY) }.

import { CONFIG } from '../../../src/domain/config.js';
import { storePriceTable } from '../../../src/domain/store-ids.js';

export const fiyatTablosu = () => storePriceTable(CONFIG.billing.tiers);

/** "tek_3_aylik,bes_1_yillik" gibi virgüllü süzgeç; boşsa hepsi. Tanınmayan kimlik hata verir. */
export function urunSuz(satirlar, istek) {
  if (!istek) return satirlar;
  const ids = istek.split(',').map((s) => s.trim()).filter(Boolean);
  const bilinen = new Set(satirlar.map((r) => r.productId));
  const yok = ids.filter((i) => !bilinen.has(i));
  if (yok.length) throw new Error(`Bilinmeyen ürün: ${yok.join(', ')} (biçim: tek_3_aylik)`);
  return satirlar.filter((r) => ids.includes(r.productId));
}

/** TRY fiyatı Google Play Money biçimine çevirir (kuruş tam sayıyla, kayan nokta hatası yok). */
export function tryPara(fiyat) {
  const kurus = Math.round(fiyat * 100);
  return { currencyCode: 'TRY', units: String(Math.floor(kurus / 100)), nanos: (kurus % 100) * 10_000_000 };
}
