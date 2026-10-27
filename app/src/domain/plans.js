/* Mülk sahibi paketleri: adlar, mülk sınırı metni, fiyat ve paketlere göre özellikler.
   Kiracı hesapları her zaman ücretsizdir. Her paket 1 ay ücretsiz denemeyle başlar. */

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

export function unitsText(units){
  return units == null ? t('5’ten fazla mülk') : units === 1 ? t('1 mülk') : t('{n} mülke kadar', { n: units });
}

const usd = () => getLang() === 'en';
const money = (v) => usd()
  ? '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  : '₺' + Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Paket fiyatı; `yearly` doğruysa yıllık fiyat. Türkçede TL, İngilizcede dolar. */
export function priceText(tier, yearly = false){
  const v = usd() ? (yearly ? tier.usdYearly : tier.usd) : (yearly ? tier.yearly : tier.price);
  if (v != null) return money(v);
  return tier.id === 'kurumsal' ? t('Teklif alın') : t('Fiyat yakında');
}

/** Yıllık paketin aylığa denk gelen tutarı (ör. "₺208,33" / "$4.16"); yıllık fiyat yoksa boş. */
export function monthlyEquivalent(tier){
  const y = usd() ? tier.usdYearly : tier.yearly;
  return y != null ? money(Math.round((y / 12) * 100) / 100) : '';
}

/** Paketlere göre açılan özellikler. Başlangıç'ta olmayanlar Portföy ve Kurumsal'da açıktır;
    deneme süresince hepsi açıktır. */
export const FEATURES = {
  team: ['bes', 'kurumsal', 'trial', 'pro'],      // ekip üyeleri (emlakçı, muhasebeci, personel)
  import: ['bes', 'kurumsal', 'trial', 'pro'],    // Excel / CSV ile toplu içe aktarma
  report: ['bes', 'kurumsal', 'trial', 'pro'],    // yıllık rapor, Excel dışa aktarma, vergi tahmini
  mailReport: ['kurumsal', 'trial', 'pro']        // aylık ve yıllık rapor e-postası (supabase/functions/report)
};

/** Paket kartlarında gösterilen maddeler. */
export function tierPoints(id){
  const base = [
    t('Ödeme ve dekont takibi, kısmi ödeme'),
    t('Arıza ve tadilat talepleri, mesajlaşma'),
    t('Belge arşivi, giriş ve çıkış tutanağı'),
    t('Kira, DASK ve sözleşme hatırlatmaları')
  ];
  if (id === 'tek') return base;
  const pro = [
    t('Başlangıç’taki her şey'),
    t('Ekip üyeleri: emlakçı, muhasebeci, personel'),
    t('Excel / CSV ile toplu mülk aktarma'),
    t('Yıllık rapor, Excel dışa aktarma ve vergi tahmini'),
    t('Gider defteri ve mülk başına net getiri')
  ];
  if (id === 'bes') return pro;
  return [
    t('Portföy’deki her şey'),
    t('Sınırsız mülk ve ekip üyesi'),
    t('Aylık ve yıllık rapor e-postası'),
    t('Öncelikli destek'),
    t('Kurulum ve veri taşıma yardımı'),
    t('Kuruma özel sözleşme ve fatura')
  ];
}
