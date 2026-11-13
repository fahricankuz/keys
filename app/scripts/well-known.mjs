// Evrensel bağlantı (iOS) ve Uygulama Bağlantıları (Android) dosyalarını derlemede yazar:
//   <klasör>/.well-known/apple-app-site-association   (APPLE_TEAM_ID varsa)
//   <klasör>/.well-known/assetlinks.json              (ANDROID_SHA256 varsa; virgülle birden çok parmak izi)
// Kullanım: node scripts/well-known.mjs <çıktı klasörü>   (npm run build:hostinger içinde)
// Ortam: APPLE_TEAM_ID (10 karakter, Apple Developer → Membership), ANDROID_SHA256 (Play Console → Uygulama bütünlüğü →
// "Uygulama imzalama anahtarı sertifikası" SHA-256; EAS yükleme anahtarı da eklenecekse virgülle ayrılır).
// Değişken yoksa ilgili dosya yazılmaz (uyarı verilir). Değer biçimi geçersizse derleme hata ile durur: bozuk bağlantı dosyası
// yayına çıkmasın. .htaccess apple-app-site-association'ı yönlendirmesiz ve application/json olarak sunar.
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PACKAGE = 'io.anahtar.app';
export const PATHS = ['/katil*', '/dogrula*', '/yeni-sifre*'];

export function appleAssociation(teamId) {
  const id = String(teamId || '').trim();
  if (!/^[A-Z0-9]{10}$/.test(id)) throw new Error(`APPLE_TEAM_ID geçersiz: 10 büyük harf/rakam olmalı (örn. ABCDE12345)`);
  return { applinks: { apps: [], details: [{ appID: `${id}.${PACKAGE}`, paths: PATHS }] } };
}

/** "aa:bb:…" ya da iki nokta üst üste olmayan 64 hane; büyük harfe ve iki noktalı biçime çevrilir. */
export function fingerprints(list) {
  const out = String(list || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const hex = s.replace(/:/g, '').toUpperCase();
    if (!/^[0-9A-F]{64}$/.test(hex)) throw new Error('ANDROID_SHA256 geçersiz: her parmak izi 32 baytlık SHA-256 olmalı (AA:BB:…)');
    return hex.match(/../g).join(':');
  });
  if (!out.length) throw new Error('ANDROID_SHA256 boş');
  return [...new Set(out)];
}

export function assetLinks(sha256List) {
  return [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: PACKAGE, sha256_cert_fingerprints: fingerprints(sha256List) } }];
}

export function writeWellKnown(out, env = process.env) {
  const dir = join(out, '.well-known');
  const written = [];
  const put = (name, data) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, name), JSON.stringify(data, null, 2) + '\n'); written.push(name); };
  if (env.APPLE_TEAM_ID) put('apple-app-site-association', appleAssociation(env.APPLE_TEAM_ID));
  if (env.ANDROID_SHA256) put('assetlinks.json', assetLinks(env.ANDROID_SHA256));
  return written;
}

// Doğrudan çalıştırıldığında (içe aktarıldığında değil). Sembolik bağlantılı yollarda da çalışsın diye gerçek yol karşılaştırılır.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const out = process.argv[2];
  if (!out) { console.error('Kullanım: node scripts/well-known.mjs <klasör>'); process.exit(1); }
  try {
    const written = writeWellKnown(out);
    for (const [v, f] of [['APPLE_TEAM_ID', 'apple-app-site-association'], ['ANDROID_SHA256', 'assetlinks.json']]) {
      if (!written.includes(f)) console.log(`::warning title=${v} tanımlı değil::${f} yazılmadı; ${f === 'assetlinks.json' ? 'Android' : 'iOS'} uygulaması bağlantıları açamaz (GitHub → Settings → Variables).`);
    }
    console.log(`well-known: ${written.length ? written.join(', ') + ' yazıldı' : 'dosya yazılmadı'}`);
  } catch (e) {
    console.error('well-known: ' + e.message);
    process.exit(1);
  }
}
