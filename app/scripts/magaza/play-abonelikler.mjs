// Google Play: `tek` ve `bes` aboneliklerini 18'er temel planla (N-aylik = P1M, N-yillik = P1Y; N = 1-9) oluşturur.
// Fiyat tablosu app/src/domain/store-ids.js'ten gelir (TRY); öteki bölgeler Google'ın convertRegionPrices çağrısıyla çevrilir,
// TR fiyatı tablodaki değerle sabitlenir. İdempotent: var olan temel plan atlanır, yalnız eksikler eklenir; hepsi etkinleştirilir.
//
// Kullanım (depo kökünden):
//   node app/scripts/magaza/play-abonelikler.mjs                     kuru çalıştırma (varsayılan; yalnız okur)
//   node app/scripts/magaza/play-abonelikler.mjs --abonelik tek      yalnız `tek` ya da `bes`
//   node app/scripts/magaza/play-abonelikler.mjs --apply              GERÇEKTEN YAZAR (sahibinin açık onayı gerekir)
// Ortam: PLAY_SA_PATH, PLAY_PACKAGE (bkz. README.md). İlk 403 PERMISSION_DENIED yayılma gecikmesi olabilir (README).

import { pathToFileURL } from 'node:url';
import { bayrakOku, gunluk } from './lib/ortak.mjs';
import { playIstemci } from './lib/play.mjs';
import { fiyatTablosu, tryPara } from './lib/fiyat.mjs';

export const BASLIK = {
  tek: { tr: 'Başlangıç', en: 'Starter', faydaTr: ['Kira ve dekont takibi', 'Talep ve mesajlaşma', 'Mülk ve kiracı yönetimi'], faydaEn: ['Rent and receipt tracking', 'Requests and messaging', 'Property and tenant management'] },
  bes: { tr: 'Profesyonel', en: 'Professional', faydaTr: ['Kira ve dekont takibi', 'Talep ve mesajlaşma', 'Ekip üyeleri ve raporlar'], faydaEn: ['Rent and receipt tracking', 'Requests and messaging', 'Team members and reports'] }
};

/** Bir temel planın Google Play gövdesi; `donusum` convertRegionPrices yanıtıdır. */
export function temelPlanGovdesi(satir, donusum) {
  const fiyat = tryPara(satir.price);
  const bolgesel = Object.entries(donusum.convertedRegionPrices).sort(([a], [b]) => a.localeCompare(b))
    .map(([kod, c]) => ({ regionCode: kod, newSubscriberAvailability: true, price: kod === 'TR' ? fiyat : c.price }));
  const diger = donusum.convertedOtherRegionsPrice;
  return {
    basePlanId: satir.basePlan,
    autoRenewingBasePlanType: { billingPeriodDuration: satir.yearly ? 'P1Y' : 'P1M', gracePeriodDuration: 'P7D', resubscribeState: 'RESUBSCRIBE_STATE_ACTIVE',
      prorationMode: 'SUBSCRIPTION_PRORATION_MODE_CHARGE_FULL_PRICE_IMMEDIATELY' },
    regionalConfigs: bolgesel,
    otherRegionsConfig: { newSubscriberAvailability: true, usdPrice: diger.usdPrice, eurPrice: diger.eurPrice }
  };
}

async function main() {
  const bayrak = bayrakOku(process.argv.slice(2), { mantiksal: ['apply', 'dry-run'], deger: ['abonelik'] });
  if (bayrak.apply && bayrak['dry-run']) throw new Error('--apply ve --dry-run birlikte verilemez.');
  if (bayrak.abonelik && !BASLIK[bayrak.abonelik]) throw new Error('--abonelik tek ya da bes olmalı.');
  const yaz = !!bayrak.apply;
  const play = playIstemci();
  const tablo = fiyatTablosu();
  gunluk(`${play.paket}: ${yaz ? 'YAZMA MODU (--apply)' : 'Kuru çalıştırma: yalnız okunur (yazmak için --apply)'}`);

  for (const sub of Object.keys(BASLIK).filter((s) => !bayrak.abonelik || s === bayrak.abonelik)) {
    const m = BASLIK[sub], url = `/subscriptions/${sub}`;
    const r = await play.iste('GET', url);
    const mevcut = r.durum === 200 ? r.veri : null;
    const var_ = new Set((mevcut?.basePlans || []).map((b) => b.basePlanId));
    const eksik = tablo.filter((x) => x.subscription === sub && !var_.has(x.basePlan));
    gunluk(`${sub}: abonelik ${mevcut ? 'var' : 'YOK (oluşturulacak)'}, ${var_.size} temel plan var, ${eksik.length} eklenecek${eksik.length ? ` (${eksik.map((x) => x.basePlan + '=' + x.price).join(', ')})` : ''}`);
    if (!yaz) continue;

    if (eksik.length) {
      const yeni = []; let surum = null;
      for (const satir of eksik) {
        const d = (await play.iste('POST', '/pricing:convertRegionPrices', { price: tryPara(satir.price) })).veri;
        surum = d.regionVersion.version; yeni.push(temelPlanGovdesi(satir, d));
      }
      if (!mevcut) {
        await play.iste('POST', `/subscriptions?productId=${sub}&regionsVersion.version=${surum}`, { packageName: play.paket, productId: sub, basePlans: yeni,
          listings: [{ languageCode: 'tr-TR', title: m.tr, benefits: m.faydaTr }, { languageCode: 'en-US', title: m.en, benefits: m.faydaEn }] });
      } else {
        await play.iste('PATCH', `${url}?updateMask=basePlans&regionsVersion.version=${surum}`, { ...mevcut, basePlans: [...(mevcut.basePlans || []), ...yeni] });
      }
      gunluk(`${sub}: ${yeni.length} temel plan yazıldı`);
    }
    const guncel = (await play.iste('GET', url)).veri;
    for (const b of guncel.basePlans || []) {
      if (b.state !== 'ACTIVE') { await play.iste('POST', `${url}/basePlans/${b.basePlanId}:activate`, {}); gunluk(`${sub}/${b.basePlanId}: etkinleştirildi`); }
    }
  }
  const liste = (await play.iste('GET', '/subscriptions?pageSize=100')).veri.subscriptions || [];
  for (const s of liste) {
    const durumlar = {}; for (const b of s.basePlans || []) durumlar[b.state] = (durumlar[b.state] || 0) + 1;
    console.log(`  ${s.productId}: ${(s.basePlans || []).length} temel plan ${JSON.stringify(durumlar)}, bölge/plan ${[...new Set((s.basePlans || []).map((b) => (b.regionalConfigs || []).length))].join(',')}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error('HATA:', e.message); process.exit(1); });
