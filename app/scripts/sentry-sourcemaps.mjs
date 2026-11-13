// Web kaynak haritaları: SENTRY_AUTH_TOKEN varsa Sentry'ye (AB bölgesi) yüklenir; harita dosyaları her durumda silinir ve JS
// dosyalarındaki sourceMappingURL satırı kaldırılır (harita hiçbir zaman siteye çıkmaz; .htaccess de .map dosyalarını engeller).
// Kullanım: node scripts/sentry-sourcemaps.mjs <çıktı klasörü>     (npm run build:web:maps içinde, harden-html'den sonra)
//
// Ortam (hepsi isteğe bağlı; jeton yoksa yükleme atlanır, harita yine silinir):
//   SENTRY_AUTH_TOKEN, SENTRY_ORG, SENTRY_PROJECT (anahtar-web), SENTRY_URL (varsayılan https://de.sentry.io/),
//   EXPO_PUBLIC_SENTRY_RELEASE (commit SHA; src/domain/sentry.js ile aynı: anahtar-web@<ilk 7 hane>).
// Yükleme başarısız olursa site yayını durmaz: uyarı yazılır, haritalar yine silinir.
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const out = process.argv[2];
if (!out) { console.error('Kullanım: node scripts/sentry-sourcemaps.mjs <klasör>'); process.exit(1); }

const HERE = dirname(fileURLToPath(import.meta.url));
const jsDir = join(out, '_expo/static/js/web');

function files(dir, ext, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) files(p, ext, acc);
    else if (n.endsWith(ext)) acc.push(p);
  }
  return acc;
}

const releaseName = (sha) => (sha ? 'anahtar-web@' + String(sha).slice(0, 7) : '');

const maps = files(out, '.map');
const token = process.env.SENTRY_AUTH_TOKEN || '';
let uploaded = false;

if (!maps.length) {
  console.log('sentry-sourcemaps: harita dosyası yok (derleme --source-maps ile yapılmadı), atlandı');
} else if (!token) {
  console.log(`sentry-sourcemaps: SENTRY_AUTH_TOKEN yok, ${maps.length} harita yüklenmeden silinecek`);
} else {
  const cli = [join(HERE, '../node_modules/.bin/sentry-cli'), 'sentry-cli'].find((c) => c === 'sentry-cli' || existsSync(c));
  const release = releaseName(process.env.EXPO_PUBLIC_SENTRY_RELEASE);
  const args = ['sourcemaps', 'upload', '--url-prefix', '~/_expo/static/js/web', ...(release ? ['--release', release] : []), resolve(jsDir)];
  const r = spawnSync(cli, args, {
    stdio: 'inherit',
    env: { ...process.env, SENTRY_URL: process.env.SENTRY_URL || 'https://de.sentry.io/' }
  });
  uploaded = r.status === 0;
  if (!uploaded) console.log(`::warning title=Sentry harita yüklemesi başarısız::sentry-cli ${r.error ? r.error.message : 'çıkış kodu ' + r.status}; site yayını sürüyor, web hataları çözümlenmemiş görünür.`);
}

// Her durumda: haritaları sil, JS'teki bağlantı satırını kaldır.
for (const m of maps) rmSync(m);
let stripped = 0;
for (const f of files(out, '.js')) {
  const s = readFileSync(f, 'utf8');
  const t = s.replace(/\n\/\/# sourceMappingURL=\S+\.map(?=\n|$)/, '');   // debugId satırı kalır
  if (t !== s) { writeFileSync(f, t); stripped++; }
}
console.log(`sentry-sourcemaps: ${maps.length} harita silindi${uploaded ? ' (Sentry\'ye yüklendi)' : ''}, ${stripped} JS dosyasında sourceMappingURL kaldırıldı`);
