/* Mülk sahibi paketleri: adlar, mülk sayısı aralığı, MÜLK BAŞINA fiyat ve paketlere göre özellikler.
   Kiracı ve ekip hesapları her zaman ücretsizdir. Başlangıç ve Portföy 1–9 mülk içindir; 10 ve üstü Kurumsal'dır (teklif).
   Fiyatlar KDV dahildir. Her paket 1 ay ücretsiz denemeyle başlar. */

import { t, getLang } from './i18n.js';
import { CONFIG } from './config.js';

export const PLAN_LABEL = {
  tek: () => t('Başlangıç'),
  bes: () => t('Portföy'),
  kurumsal: () => t('Kurumsal'),
  trial: () => t('Deneme'),
  pro: () => t('Sınırsız')
};
export const planLabel = (id) => PLAN_LABEL[id] ? PLAN_LABEL[id]() : String(id || '');

export function tiers(){ return CONFIG.billing.tiers; }
export const tierOf = (id) => tiers().find((x) => x.id === id);

/** Kendi kendine satın alınabilecek en çok mülk (üstü Kurumsal). */
export const maxUnits = () => CONFIG.billing.maxUnits;

/** Paketin kapsadığı mülk aralığı (kartlarda): "1-9 mülk" / "10 ve üstü mülk". */
export function rangeText(tier){
  return tier.id === 'kurumsal' ? t('{n} ve üstü mülk', { n: tier.minUnits || maxUnits() + 1 }) : t('1-{n} mülk', { n: tier.units });
}

/** Bir hesabın mülk sınırı metni (sunucudaki satın alınan adet): "3 mülke kadar". */
export function unitsText(units){
  return units == null ? t('Sınırsız mülk') : units === 1 ? t('1 mülk') : t('{n} mülke kadar', { n: units });
}

const usd = () => getLang() === 'en';
const money = (v) => usd()
  ? '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : '₺' + Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Mülk başına fiyat metni; `yearly` doğruysa yıllık. Türkçede TL, İngilizcede dolar. */
export function priceText(tier, yearly = false){
  const v = usd() ? (yearly ? tier.usdYearly : tier.usd) : (yearly ? tier.yearly : tier.price);
  if (v != null) return money(v);
  return tier.id === 'kurumsal' ? t('Teklif alın') : t('Fiyat yakında');
}

/** Yıllık paketin aylığa denk gelen tutarı (mülk başına, ör. "₺83,33" / "$1.67"); yıllık fiyat yoksa boş. */
export function monthlyEquivalent(tier){
  const y = usd() ? tier.usdYearly : tier.yearly;
  return y != null ? money(Math.round((y / 12) * 100) / 100) : '';
}

/** n mülk için toplam tutar (sayı); fiyatı olmayan pakette null. Kuruş yuvarlaması: 2 ondalık. */
export function totalPrice(tier, n, yearly = false){
  const v = usd() ? (yearly ? tier.usdYearly : tier.usd) : (yearly ? tier.yearly : tier.price);
  return v == null ? null : Math.round(v * n * 100) / 100;
}
export function totalText(tier, n, yearly = false){
  const v = totalPrice(tier, n, yearly);
  return v == null ? priceText(tier) : money(v);
}

/** Mağaza ürün kimliği: paket + mülk adedi + dönem (ör. tek_3_aylik, bes_5_yillik). */
export function productId(plan, units, yearly = false){
  return plan + '_' + units + '_' + (yearly ? 'yillik' : 'aylik');
}
/** Ürün kimliğinden paket, mülk adedi ve dönem; eski/yabancı kimlikte null (sunucudaki plan_of ile aynı kural). */
export function parseProduct(pid){
  const m = /^(tek|bes)_([1-9])_(aylik|yillik)$/.exec(String(pid || ''));
  return m ? { plan: m[1], units: Number(m[2]), yearly: m[3] === 'yillik' } : null;
}

/** Paketlere göre açılan özellikler. Başlangıç'ta olmayanlar Portföy ve Kurumsal'da açıktır;
    deneme süresince hepsi açıktır. */
export const FEATURES = {
  team: ['bes', 'kurumsal', 'trial', 'pro'],      // ekip üyeleri (emlakçı, muhasebeci, personel)
  import: ['bes', 'kurumsal', 'trial', 'pro'],    // Excel / CSV ile toplu içe aktarma
  report: ['bes', 'kurumsal', 'trial', 'pro'],    // net getiri, yıllık rapor, Excel dışa aktarma, vergi tahmini
  sms: ['bes', 'kurumsal', 'trial', 'pro'],       // SMS hatırlatmaları (kota sonra belirlenir); sunucuda da denetlenir
  mailReport: ['kurumsal', 'trial', 'pro']        // aylık ve yıllık rapor e-postası (supabase/functions/report)
};

/** Paket kartlarında gösterilen maddeler. */
export function tierPoints(id){
  const base = [
    t('Ödeme ve dekont takibi, kısmi ödeme'),
    t('Arıza ve tadilat talepleri, mesajlaşma'),
    t('Belge arşivi, giriş ve çıkış tutanağı, depozito iadesi'),
    t('Sözleşme yenileme ve TÜFE yasal üst sınırı'),
    t('Kira, DASK ve sözleşme hatırlatmaları'),
    t('Gider kayıtları (fatura otomatik işlenir)')
  ];
  if (id === 'tek') return base;
  const pro = [
    t('Başlangıç’taki her şey'),
    t('Ekip üyeleri: emlakçı, muhasebeci, personel'),
    t('Excel / CSV ile toplu mülk aktarma'),
    t('Net getiri, yıllık rapor ve Excel çıktısı'),
    t('Vergi tahmini ve stopaj takibi'),
    t('SMS hatırlatmaları')
  ];
  if (id === 'bes') return pro;
  return [
    t('Site yönetimi · AVM · GYO · Depo ve lojistik · Emlak ofisi · Aile ofisi'),   // ilk madde kartta kalın yazılır (sektörler)
    t('Portföy’deki her şey'),
    t('Sınırsız mülk ve ekip üyesi'),
    t('Aylık ve yıllık rapor e-postası'),
    t('Öncelikli destek'),
    t('Kurulum ve veri taşıma yardımı'),
    t('Kuruma özel sözleşme ve fatura')
  ];
}
