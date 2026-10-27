// Yayın paketi: www/ klasörünü üretir.
//
//   node scripts/build.mjs            web (GitHub Pages) için
//   node scripts/build.mjs --native   iOS/Android (Capacitor) için — yerel eklentiler dahil
//
// Kaynak dosyalar olduğu gibi kopyalanır (derleme adımı yalnızca yayında):
// - supabase-js ve yazı tipleri pakete alınır; uygulama ilk açılışta da internetsiz çalışır
// - --native: yerel eklentiler tek dosyada toplanır (www/native.js)
// - web: yasal sayfalar (site/), 404.html (yol biçimindeki davet bağlantıları için) ve isteğe bağlı
//   .well-known dosyaları (iOS Universal Links, Android App Links)
//
// Ortam değişkenleri (isteğe bağlı, yalnızca web):
//   APPLE_TEAM_ID        — apple-app-site-association için (ör. ABCDE12345)
//   ANDROID_SHA256       — assetlinks.json için imza parmak izi(leri), virgülle
//   APP_ID               — paket kimliği (varsayılan capacitor.config.json → appId)

import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const NATIVE = args.includes('--native');
const OUT = join(ROOT, args.includes('--out') ? args[args.indexOf('--out') + 1] : 'www');
const cap = JSON.parse(await readFile(join(ROOT, 'capacitor.config.json'), 'utf8'));
const APP_ID = process.env.APP_ID || cap.appId;

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

// 1) Kaynak dosyalar
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js']) await cp(join(ROOT, f), join(OUT, f));
await cp(join(ROOT, 'assets'), join(OUT, 'assets'), { recursive: true });

// 2) supabase-js tek dosya
await build({
  stdin: { contents: "export * from '@supabase/supabase-js';", resolveDir: ROOT, loader: 'js' },
  bundle: true, format: 'esm', platform: 'browser', target: ['es2020', 'safari15'],
  minify: true, legalComments: 'none', outfile: join(OUT, 'vendor/supabase.js'),
  logLevel: 'warning'
});

// 3) Yazı tipleri: yalnızca Latin ve Latin genişletilmiş (Türkçe) alt kümeler
const FONTS = [
  { pkg: '@fontsource-variable/manrope', css: 'wght.css', family: 'Manrope' },
  { pkg: '@fontsource-variable/bricolage-grotesque', css: 'opsz.css', family: 'Bricolage Grotesque' }
];
await mkdir(join(OUT, 'assets/fonts'), { recursive: true });
let fontCss = '/* Yerel yazı tipleri — scripts/build.mjs üretir (fontsource, OFL lisanslı). */\n';
for (const f of FONTS){
  const src = await readFile(join(ROOT, 'node_modules', f.pkg, f.css), 'utf8');
  const blocks = src.split(/(?=\/\* )/).filter(b => /-latin(-ext)?-/.test(b.split('\n')[0]));
  for (const b of blocks){
    const file = b.match(/url\(\.\/files\/([^)]+)\)/)[1];
    await cp(join(ROOT, 'node_modules', f.pkg, 'files', file), join(OUT, 'assets/fonts', file));
    fontCss += b.replace(/font-family: '[^']+'/, "font-family: '" + f.family + "'").replace('./files/', '');
  }
}
await writeFile(join(OUT, 'assets/fonts/fonts.css'), fontCss);

// 4) Yerel eklentiler
if (NATIVE){
  await build({
    entryPoints: [join(ROOT, 'native/entry.js')],
    bundle: true, format: 'iife', platform: 'browser', target: ['es2020', 'safari15'],
    minify: true, legalComments: 'none', outfile: join(OUT, 'native.js'), logLevel: 'warning'
  });
}

// 5) Açılış ayarı: supabase-js pakette
await writeFile(join(OUT, 'env.js'),
  '// scripts/build.mjs üretir.\n' +
  'window.EVIM_CONFIG = Object.assign({ supabaseJs: new URL("vendor/supabase.js", document.baseURI).href }, window.EVIM_CONFIG || {});\n');

// 6) index.html: CDN yazı tipleri yerine yerel dosya, açılış betikleri
let html = await readFile(join(OUT, 'index.html'), 'utf8');
html = html
  .replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.[^>]+>/g, '')
  .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]+>/, '<link rel="stylesheet" href="assets/fonts/fonts.css">')
  .replace('<script type="module"', '<script src="env.js"></script>\n' + (NATIVE ? '<script src="native.js"></script>\n' : '') + '<script type="module"');
if (html.includes('fonts.googleapis')) throw new Error('index.html: yazı tipi bağlantısı değiştirilemedi');
await writeFile(join(OUT, 'index.html'), html);

// 7) Service worker: yeni dosyalar da çevrimdışı kabuğa girsin
const fontFiles = (await readdir(join(OUT, 'assets/fonts'))).map(f => './assets/fonts/' + f);
let sw = await readFile(join(OUT, 'sw.js'), 'utf8');
sw = sw.replace("const SHELL = [", 'const SHELL = [\n  ' + ['./env.js', './vendor/supabase.js', ...fontFiles].map(x => JSON.stringify(x)).join(',\n  ') + ',');
await writeFile(join(OUT, 'sw.js'), sw);

// 8) Web barındırma ekleri
if (!NATIVE){
  await writeFile(join(OUT, '.nojekyll'), '');
  // Yasal ve destek sayfaları: /gizlilik/, /kosullar/, /hesap-silme/, /destek/
  await cp(join(ROOT, 'site'), OUT, { recursive: true });
  // /katil/KOD gibi yol biçimindeki bağlantılar → #/katil/KOD
  await writeFile(join(OUT, '404.html'), `<!doctype html><meta charset="utf-8"><title>Kiracım</title>
<script>
  var p = location.pathname, m = p.match(/^(.*?)\\/(katil|davet|giris|kayit|yeni-sifre)(\\/.*)?$/);
  location.replace(m ? m[1] + '/#/' + m[2] + (m[3] || '') + location.search : p.replace(/[^/]*$/, '') || '/');
</script>`);

  const team = process.env.APPLE_TEAM_ID, sha = process.env.ANDROID_SHA256;
  if (team || sha) await mkdir(join(OUT, '.well-known'), { recursive: true });
  if (team){
    await writeFile(join(OUT, '.well-known/apple-app-site-association'), JSON.stringify({
      applinks: { details: [{ appIDs: [team + '.' + APP_ID], components: [
        { '/': '/katil/*' }, { '/': '/auth*' }, { '/': '/giris' }, { '/': '/yeni-sifre' }
      ] }] }
    }, null, 2));
  }
  if (sha){
    await writeFile(join(OUT, '.well-known/assetlinks.json'), JSON.stringify([{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: { namespace: 'android_app', package_name: APP_ID, sha256_cert_fingerprints: sha.split(',').map(s => s.trim()) }
    }], null, 2));
  }
}

console.log('www hazır (' + (NATIVE ? 'iOS/Android' : 'web') + '): ' + OUT);
