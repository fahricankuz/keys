// Derlenmiş sayfaları sertleştirir: içerik güvenlik politikası (CSP), çerçeve koruması, referrer
// politikası, manifest ve simgeler. GitHub Pages yanıt başlığı (header) ayarlayamadığı için
// koruma <meta> ile verilir. Kullanım: node scripts/harden-html.mjs <çıktı klasörü>
//
// CSP'de satır içi betikler özetle (sha256) izinlidir; özetler her sayfada gerçek betik
// metninden hesaplanır, 'unsafe-inline' (betik için) hiçbir zaman kullanılmaz.
//
// Ortam: EXPO_PUBLIC_SUPABASE_URL (API ve gerçek zamanlı bağlantı kaynağı), EXPO_PUBLIC_TURNSTILE_SITE_KEY
// (varsa Cloudflare Turnstile için gerekli kaynaklar), EXPO_BASE_URL (GitHub Pages proje yolu).
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const out = process.argv[2];
if (!out) { console.error('Kullanım: node scripts/harden-html.mjs <klasör>'); process.exit(1); }

const base = (process.env.EXPO_BASE_URL || '').replace(/\/$/, '');
const origin = (u) => { try { return u && /^https?:/.test(u) ? new URL(u).origin : ''; } catch { return ''; } };
const api = origin(process.env.EXPO_PUBLIC_SUPABASE_URL);
const ws = api ? api.replace(/^http/, 'ws') : '';
const turnstile = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ? 'https://challenges.cloudflare.com' : '';

/** Sayfa başka bir sitenin içine gömülürse (clickjacking) gizlenir ve üst pencereye açılır. */
const FRAME_GUARD = "if(window.top!==window.self){document.documentElement.style.display='none';try{window.top.location=window.self.location}catch(e){}}";

const sha = (s) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

function csp(hashes) {
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')} ${turnstile}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${api}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' blob: data: ${api} ${ws} ${turnstile}`.replace(/\s+/g, ' ').trim(),
    `media-src 'self' blob: data: ${api}`.trim(),
    turnstile ? `frame-src ${turnstile}` : "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ');
}

const inline = (html) => [...html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '_expo' || n === 'assets' ? [] : walk(p);
    return n.endsWith('.html') ? [p] : [];
  });
}

const TITLES = JSON.parse(readFileSync(new URL('../src/site/titles.json', import.meta.url), 'utf8'));
const DESC = 'anahtar: kiracı ile mülk sahibi için kira, ödeme, depozito, arıza ve belge takibi tek yerde.';
const titleFor = (file) => {
  const key = relative(out, file).replace(/\.html$/, '').replace(/(^|\/)index$/, '');
  return TITLES[key] || TITLES[key.split('/')[0]] || TITLES._default;
};

let count = 0;
for (const file of walk(out)) {
  let html = readFileSync(file, 'utf8');
  if (html.includes('http-equiv="Content-Security-Policy"')) continue;      // zaten sertleştirilmiş
  html = html.replace('<html lang="en">', '<html lang="tr">');
  const guard = `<script>${FRAME_GUARD}</script>`;
  const hashes = [...new Set([...inline(html), FRAME_GUARD].map(sha))];
  const title = titleFor(file);
  // Elle yazılmış sayfalar (destek, yasal metinler) kendi başlık ve açıklamasını taşır; onlara yenisi eklenmez.
  const own = /<title>/.test(html);
  const head = [
    `<meta http-equiv="Content-Security-Policy" content="${esc(csp(hashes))}"/>`,
    ...(own ? [] : [
      `<title>${title}</title>`,
      `<meta name="description" content="${DESC}"/>`,
      `<meta property="og:title" content="${title}"/>`,
      `<meta property="og:description" content="${DESC}"/>`
    ]),
    '<meta property="og:locale" content="tr_TR"/>',
    '<meta name="referrer" content="strict-origin-when-cross-origin"/>',
    '<meta name="theme-color" content="#FAF5F0"/>',
    '<meta name="apple-mobile-web-app-capable" content="yes"/>',
    '<meta name="apple-mobile-web-app-title" content="anahtar"/>',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default"/>',
    `<link rel="manifest" href="${base}/manifest.webmanifest"/>`,
    `<link rel="apple-touch-icon" href="${base}/apple-touch-icon.png"/>`
  ].join('');
  // CSP en başta olmalı ki sonraki kaynaklara da uygulansın; çerçeve koruması hemen ardından.
  html = html.replace('<head>', `<head>${head}${guard}`);
  writeFileSync(file, html);
  count++;
}
console.log(`harden-html: ${count} sayfa sertleştirildi`);

// Temiz adresler her sunucuda çalışsın: /giris/kiraci.html dosyasının /giris/kiraci/index.html kopyası da yazılır
// (yeniden yazma kuralı olmayan statik barındırıcılarda /giris/kiraci adresi bu klasöre düşer).
// Bulunamayan adresler için 404.html de üretilir.
let copies = 0;
for (const file of walk(out)) {
  const name = file.split('/').pop();
  if (name === 'index.html' || name === '404.html' || name.startsWith('_') || name.startsWith('+')) continue;
  const dir = file.replace(/\.html$/, '');
  mkdirSync(dir, { recursive: true });
  copyFileSync(file, join(dir, 'index.html'));
  copies++;
}
const nf = join(out, '+not-found.html');
if (existsSync(nf)) copyFileSync(nf, join(out, '404.html'));
console.log(`harden-html: ${copies} temiz adres klasörü, 404.html yazıldı`);

// Kullanılmayan yazı tipi dosyalarını sil: expo paketteki her ağırlığı kopyalar (≈14 MB); sayfalar yalnızca @font-face'te geçenleri ister.
const used = new Set();
for (const file of walk(out)) for (const m of readFileSync(file, 'utf8').matchAll(/url\(&quot;([^&]+\.ttf)&quot;\)|url\("([^"]+\.ttf)"\)/g)) used.add(decodeURI(m[1] || m[2]));
let pruned = 0;
const fontRoot = join(out, 'assets/node_modules/@expo-google-fonts');
const prune = (dir) => {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { prune(p); continue; }
    const web = '/' + relative(out, p).split('\\').join('/');
    if (n.endsWith('.ttf') && ![...used].some((u) => u === web || u.endsWith(web))) { rmSync(p); pruned++; }
  }
};
try { prune(fontRoot); } catch { /* yazı tipi klasörü yoksa geç */ }
console.log(`harden-html: ${pruned} kullanılmayan yazı tipi dosyası silindi`);
