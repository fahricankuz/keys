// Google Play: bir .aab dosyasını bir kanala (varsayılan: internal) yükler ve sürüm taslağı açar.
//
// Kullanım (depo kökünden):
//   node app/scripts/magaza/play-yukle.mjs yol/uygulama.aab                  kuru çalıştırma (varsayılan; dosyayı doğrular, yüklemez)
//   node app/scripts/magaza/play-yukle.mjs yol/uygulama.aab --apply           yükler (sahibinin açık onayı gerekir)
// Bayraklar: --kanal internal|alpha|beta|production (varsayılan internal), --durum draft|completed (varsayılan draft),
//            --ad "1.0.0 (12)" sürüm adı, --not-tr "..." --not-en "..." sürüm notları.
// "draft": Play Console'da elle gözden geçirilip yayına alınır. production kanalı için ayrıca --uretim-onayi verilmelidir.
// Ortam: PLAY_SA_PATH, PLAY_PACKAGE (bkz. README.md).

import { pathToFileURL } from 'node:url';
import { readFileSync, statSync } from 'node:fs';
import { bayrakOku, gunluk } from './lib/ortak.mjs';
import { playIstemci } from './lib/play.mjs';

const KANALLAR = ['internal', 'alpha', 'beta', 'production'];

export function surumGovdesi({ kanal, durum, ad, kod, notTr, notEn }) {
  return { track: kanal, releases: [{ name: ad || `${kod}`, versionCodes: [String(kod)], status: durum,
    ...(notTr || notEn ? { releaseNotes: [...(notTr ? [{ language: 'tr-TR', text: notTr }] : []), ...(notEn ? [{ language: 'en-US', text: notEn }] : [])] } : {}) }] };
}

async function main() {
  const bayrak = bayrakOku(process.argv.slice(2), { mantiksal: ['apply', 'dry-run', 'uretim-onayi'], deger: ['kanal', 'durum', 'ad', 'not-tr', 'not-en'] });
  const dosya = bayrak._[0];
  if (!dosya) throw new Error('Kullanım: play-yukle.mjs <dosya.aab> [--apply]');
  if (bayrak.apply && bayrak['dry-run']) throw new Error('--apply ve --dry-run birlikte verilemez.');
  const kanal = bayrak.kanal || 'internal', durum = bayrak.durum || 'draft';
  if (!KANALLAR.includes(kanal)) throw new Error(`--kanal ${KANALLAR.join('|')} olmalı.`);
  if (!['draft', 'completed'].includes(durum)) throw new Error('--durum draft ya da completed olmalı.');
  if (kanal === 'production' && bayrak.apply && !bayrak['uretim-onayi']) throw new Error('production kanalı için --uretim-onayi gerekir (sahibinin açık onayı).');
  const boyut = statSync(dosya).size;
  const veri = readFileSync(dosya);
  if (veri.subarray(0, 2).toString('latin1') !== 'PK') throw new Error('Dosya bir .aab (zip) gibi görünmüyor.');
  const play = playIstemci();
  if (!bayrak.apply) await play.erisimJetonu(); // yalnız Google OAuth jetonu (Play'de değişiklik yapmaz)
  gunluk(`${play.paket}: ${dosya} (${(boyut / 1048576).toFixed(1)} MB) → ${kanal} / ${durum}`);
  if (!bayrak.apply) {
    gunluk('Kuru çalıştırma: dosya geçerli, hizmet hesabı jetonu alınabildi; Play\'e hiçbir şey gönderilmedi. Yüklemek için --apply.');
    return;
  }
  const e = (await play.iste('POST', '/edits', {})).veri;
  try {
    const y = await play.iste('POST', `${play.yuklemeTabani}/edits/${e.id}/bundles?uploadType=media`, veri, { ham: true, tur: 'application/octet-stream' });
    const kod = y.veri.versionCode;
    gunluk('Yüklendi, versionCode', kod);
    await play.iste('PUT', `/edits/${e.id}/tracks/${kanal}`, surumGovdesi({ kanal, durum, ad: bayrak.ad, kod, notTr: bayrak['not-tr'], notEn: bayrak['not-en'] }));
    const c = (await play.iste('POST', `/edits/${e.id}:commit`, {})).veri;
    gunluk(`Düzenleme işlendi (${c.id}) → ${kanal} (${durum})`);
  } catch (err) {
    await play.istek('DELETE', `/edits/${e.id}`).catch(() => {});
    throw err;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error('HATA:', e.message); process.exit(1); });
