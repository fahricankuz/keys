// App Store Connect durumu (YALNIZCA OKUMA): derlemeler ve TestFlight durumları, App Store sürümü, TestFlight grupları,
// abonelikler ve her birinin kaç bölgede fiyatı olduğu.
//
// Kullanım (depo kökünden):
//   ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_PATH=/yol/AuthKey.p8 node app/scripts/magaza/asc-durum.mjs
//   npm run magaza:durum --prefix app
// Bayraklar: --fiyatsiz  abonelik başına bölge sayımını atlar (hızlı); --json  makine okunur çıktı.
// Hiçbir şey yazmaz.

import { bayrakOku } from './lib/ortak.mjs';
import { ascIstemci } from './lib/asc.mjs';

const bayrak = bayrakOku(process.argv.slice(2), { mantiksal: ['fiyatsiz', 'json'] });
const asc = ascIstemci();
const APP = asc.ayar.appId;
const sayim = (liste, f) => liste.reduce((m, x) => { const k = f(x) ?? '-'; m[k] = (m[k] || 0) + 1; return m; }, {});
const rapor = {};

const uygulama = (await asc.al(`/v1/apps/${APP}?fields[apps]=name,bundleId,primaryLocale`)).data.attributes;
rapor.uygulama = { id: APP, ad: uygulama.name, bundleId: uygulama.bundleId };

// Derlemeler + TestFlight durumu
const b = await asc.al(`/v1/builds?filter[app]=${APP}&sort=-uploadedDate&limit=10&include=preReleaseVersion,buildBetaDetail&fields[builds]=version,processingState,uploadedDate,expired,preReleaseVersion,buildBetaDetail&fields[buildBetaDetails]=internalBuildState,externalBuildState&fields[preReleaseVersions]=version,platform`);
const dahil = new Map((b.included || []).map((x) => [`${x.type}:${x.id}`, x.attributes]));
rapor.derlemeler = b.data.map((x) => {
  const sur = x.relationships?.preReleaseVersion?.data, bd = x.relationships?.buildBetaDetail?.data;
  const s = sur && dahil.get(`preReleaseVersions:${sur.id}`), d = bd && dahil.get(`buildBetaDetails:${bd.id}`);
  return { surum: s?.version, derleme: x.attributes.version, isleme: x.attributes.processingState, yuklendi: x.attributes.uploadedDate?.slice(0, 16), suresiDoldu: x.attributes.expired,
    icTest: d?.internalBuildState, disTest: d?.externalBuildState };
});

// App Store sürümleri
const v = await asc.al(`/v1/apps/${APP}/appStoreVersions?filter[platform]=IOS&limit=5&include=build`);
const yapi = new Map((v.included || []).map((x) => [x.id, x.attributes]));
rapor.surumler = v.data.map((x) => ({ surum: x.attributes.versionString, durum: x.attributes.appVersionState || x.attributes.appStoreState, yayin: x.attributes.releaseType,
  derleme: yapi.get(x.relationships?.build?.data?.id)?.version ?? null }));

// TestFlight grupları
const g = await asc.hepsi(`/v1/apps/${APP}/betaGroups?limit=50`);
rapor.testflightGruplari = g.data.map((x) => ({ ad: x.attributes.name, ic: x.attributes.isInternalGroup, herkesinDerlemesi: x.attributes.hasAccessToAllBuilds, herkeseAcikBaglanti: x.attributes.publicLinkEnabled }));

// Abonelikler + fiyatlı bölge sayısı
const gruplar = await asc.hepsi(`/v1/apps/${APP}/subscriptionGroups?limit=50`);
const bolge = (await asc.hepsi('/v1/territories?limit=200')).data.length;
rapor.abonelikGruplari = [];
for (const grp of gruplar.data) {
  const abonelikler = (await asc.hepsi(`/v1/subscriptionGroups/${grp.id}/subscriptions?limit=200`)).data;
  const ozet = { grup: grp.attributes.referenceName, abonelikSayisi: abonelikler.length, durumlar: sayim(abonelikler, (a) => a.attributes.state), toplamBolge: bolge, fiyatliBolge: null };
  if (!bayrak.fiyatsiz) {
    const dagilim = {};
    for (const a of abonelikler) {
      const p = await asc.hepsi(`/v1/subscriptions/${a.id}/prices?include=territory&limit=200`);
      const n = new Set(p.data.map((x) => x.relationships?.territory?.data?.id).filter(Boolean)).size;
      dagilim[a.attributes.productId] = n;
    }
    const degerler = Object.values(dagilim);
    ozet.fiyatliBolge = { enAz: Math.min(...degerler), enCok: Math.max(...degerler), tamOlanlar: degerler.filter((n) => n >= bolge).length, eksikOlanlar: Object.entries(dagilim).filter(([, n]) => n < bolge).map(([id, n]) => `${id}:${n}`) };
  }
  rapor.abonelikGruplari.push(ozet);
}

if (bayrak.json) { console.log(JSON.stringify(rapor, null, 2)); process.exit(0); }
const tablo = (satirlar) => satirlar.length ? console.table(satirlar) : console.log('  (yok)');
console.log(`Uygulama: ${rapor.uygulama.ad} (${rapor.uygulama.bundleId}, kimlik ${APP})`);
console.log('\nDerlemeler (son 10) ve TestFlight durumu'); tablo(rapor.derlemeler);
console.log('\nApp Store sürümleri'); tablo(rapor.surumler);
console.log('\nTestFlight grupları'); tablo(rapor.testflightGruplari);
for (const a of rapor.abonelikGruplari) {
  console.log(`\nAbonelik grubu "${a.grup}": ${a.abonelikSayisi} ürün, durumlar ${JSON.stringify(a.durumlar)}`);
  if (a.fiyatliBolge) {
    const f = a.fiyatliBolge;
    console.log(`  Fiyatlı bölge (toplam ${a.toplamBolge}): en az ${f.enAz}, en çok ${f.enCok}; tam olan ürün ${f.tamOlanlar}/${a.abonelikSayisi}`);
    if (f.eksikOlanlar.length) console.log(`  Eksik: ${f.eksikOlanlar.slice(0, 12).join(', ')}${f.eksikOlanlar.length > 12 ? ' …' : ''}`);
  }
}
