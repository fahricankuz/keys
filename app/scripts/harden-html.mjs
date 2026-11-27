// Derlenmiş sayfaları sertleştirir: içerik güvenlik politikası (CSP), çerçeve koruması, referrer
// politikası, manifest ve simgeler. GitHub Pages yanıt başlığı (header) ayarlayamadığı için
// koruma <meta> ile verilir. Kullanım: node scripts/harden-html.mjs <çıktı klasörü>
//
// CSP'de satır içi betikler özetle (sha256) izinlidir; özetler her sayfada gerçek betik
// metninden hesaplanır, 'unsafe-inline' (betik için) hiçbir zaman kullanılmaz.
//
// Ortam: EXPO_PUBLIC_SUPABASE_URL (API ve gerçek zamanlı bağlantı kaynağı), EXPO_PUBLIC_TURNSTILE_SITE_KEY
// (varsa Cloudflare Turnstile için gerekli kaynaklar), EXPO_PUBLIC_SENTRY_DSN_WEB (varsa Sentry alım adresinin kaynağı connect-src'ye
// eklenir; DSN'deki anahtar ve yol atılır), EXPO_BASE_URL (GitHub Pages proje yolu).
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const out = process.argv[2];
if (!out) { console.error('Kullanım: node scripts/harden-html.mjs <klasör>'); process.exit(1); }

const base = (process.env.EXPO_BASE_URL || '').replace(/\/$/, '');
const origin = (u) => { try { return u && /^https?:/.test(u) ? new URL(u).origin : ''; } catch { return ''; } };
const api = origin(process.env.EXPO_PUBLIC_SUPABASE_URL);
const ws = api ? api.replace(/^http/, 'ws') : '';
const CHALLENGES = 'https://challenges.cloudflare.com';
const turnstile = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ? CHALLENGES : '';
const sentry = origin(process.env.EXPO_PUBLIC_SENTRY_DSN_WEB);       // yalnız kaynak (https://o123.ingest.de.sentry.io); anahtar CSP'ye girmez
const pageKey = (file) => relative(out, file).replace(/\.html$/, '').replace(/(^|\/)index$/, '');
/** Adresler tek biçimde, sondaki eğik çizgiyle yazılır: sunucu /x → /x/ yönlendirir (klasör kopyası), canonical yönlendirmeye gitmesin. */
const slash = (p) => (p === '' || p.endsWith('/') || /\.[A-Za-z0-9]+$/.test(p.split('/').pop()) ? p : p + '/');

/** Sayfa başka bir sitenin içine gömülürse (clickjacking) gizlenir ve üst pencereye açılır. */
const FRAME_GUARD = "if(window.top!==window.self){document.documentElement.style.display='none';try{window.top.location=window.self.location}catch(e){}}";

/** Web yazı tipleri: public/fonts altındaki WOFF2 alt kümeleri; aile adları ui/theme.ts → fonts ile aynı.
    Ağırlık aralığı geniş tutulur ki tarayıcı sahte kalınlık üretmesin. İlk ekrandaki iki yüz önceden yüklenir. */
const FONT_FACES = [['Inter_400Regular', 'inter-400'], ['Inter_500Medium', 'inter-500'], ['Inter_600SemiBold', 'inter-600'], ['Inter_700Bold', 'inter-700'],
  ['InterTight_700Bold', 'intertight-700'], ['InterTight_800ExtraBold', 'intertight-800']];
const fontCss = () => '<style>' + FONT_FACES.map(([fam, file]) =>
  `@font-face{font-family:'${fam}';src:url(${base}/fonts/${file}.woff2) format('woff2');font-weight:100 900;font-display:swap}`).join('') + '</style>' +
  ['intertight-800', 'inter-400'].map((f) => `<link rel="preload" href="${base}/fonts/${f}.woff2" as="font" type="font/woff2" crossorigin=""/>`).join('');

const sha = (s) => `'sha256-${createHash('sha256').update(s).digest('base64')}'`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

function csp(hashes) {
  const ts = turnstile;
  return [
    "default-src 'self'",
    `script-src 'self' ${hashes.join(' ')} ${ts}`.trim(),
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${api}`.trim(),
    "font-src 'self' data:",
    `connect-src 'self' blob: data: ${api} ${ws} ${ts} ${sentry}`.replace(/\s+/g, ' ').trim(),
    `media-src 'self' blob: data: ${api}`.trim(),
    ts ? `frame-src ${ts}` : "frame-src 'none'",
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
  const key = pageKey(file);
  return TITLES[key] || TITLES[key.split('/')[0]] || TITLES._default;
};

// Statik sayfaların stil dosyası içerik özetiyle istenir: yeni sürüm yayınlanınca tarayıcı ve sunucu önbelleği eskisini vermez.
const cssFile = join(out, 'site.css');
const cssV = existsSync(cssFile) ? createHash('sha256').update(readFileSync(cssFile)).digest('hex').slice(0, 10) : '';

// Sunucuyla konuşan sayfalar (giriş, kayıt, şifre, davet, panel, hesaplayıcı) bağlantıyı önceden açar: ilk istek
// DNS/TLS beklemez. Ana sayfa ve tanıtım sayfaları açmaz (oturumu olmayan ziyaretçi sunucuya hiç bağlanmaz).
const API_PAGES = /^(giris|kayit|sifre|yeni-sifre|dogrula|katil|duyuru-iptal|uygulama|admin|satin-al|kira-artis-hesaplama)(\/|$)/;
const preconnect = (file) => {
  const key = pageKey(file);
  return api && API_PAGES.test(key) ? `<link rel="preconnect" href="${api}" crossorigin=""/>` : '';
};

// Giriş yapılan ve işlem sayfaları arama sonuçlarına girmez (robots.txt tek başına dizinden çıkarmaz; karar sayfanın kendi etiketindedir).
const NOINDEX_PAGES = /^(giris|kayit|sifre|yeni-sifre|dogrula|katil|duyuru-iptal|uygulama|admin|belge|satin-al)(\/|$)/;

// Paylaşım önizlemesi (WhatsApp, X, LinkedIn): marka görseli app/public/og/anahtar.jpg (1200x630, scripts/blog/og.mjs marka).
const OG_IMAGE = 'https://anahtar.io/og/anahtar.jpg';
const SEGMENT_NAMES = { 'mulk-sahibi': 'Mülk sahibi', kiraci: 'Kiracı', 'emlak-ofisi': 'Emlak ofisi', 'site-yonetimi': 'Site yönetimi', avm: 'AVM', gyo: 'GYO', 'depo-lojistik': 'Depo ve lojistik', 'family-office': 'Aile ofisi' };
const ORG = { '@type': 'Organization', '@id': 'https://anahtar.io/#org', name: 'anahtar', alternateName: 'anahtar.io', legalName: 'DEVREDİN BİLGİ TEKNOLOJİLERİ YAZILIM VE TİCARET ANONİM ŞİRKETİ',
  url: 'https://anahtar.io/', logo: { '@type': 'ImageObject', url: 'https://anahtar.io/icon-512.png' },
  sameAs: ['https://www.instagram.com/anahtar_io/', 'https://www.tiktok.com/@anahtar.io', 'https://www.facebook.com/share/19o78yxmTv/', 'https://x.com/anahtar_io'],
  contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: 'info@anahtar.io', availableLanguage: ['tr', 'en'] } };
/** Sayfada görünen bilgiyi yansıtan yapılandırılmış veri: ana sayfada kuruluş, site ve uygulama; çözüm sayfalarında yol (breadcrumb). */
const jsonLd = (key) => {
  const g = [];
  if (key === '') {
    g.push(ORG,
      { '@type': 'WebSite', '@id': 'https://anahtar.io/#site', url: 'https://anahtar.io/', name: 'anahtar', inLanguage: 'tr-TR', publisher: { '@id': 'https://anahtar.io/#org' } },
      { '@type': 'SoftwareApplication', name: 'anahtar', applicationCategory: 'BusinessApplication', operatingSystem: 'Web, iOS, Android', inLanguage: 'tr-TR',
        description: 'Kira, aidat, depozito, arıza ve belge takibi tek yerde; mülk sahibi, kiracı ve site yönetimi için.', publisher: { '@id': 'https://anahtar.io/#org' } });
  }
  const m = key.match(/^cozumler\/([a-z-]+)$/);
  if (m && SEGMENT_NAMES[m[1]]) {
    g.push({ '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Ana sayfa', item: 'https://anahtar.io/' },
      { '@type': 'ListItem', position: 2, name: 'Çözümler', item: 'https://anahtar.io/cozumler/' },
      { '@type': 'ListItem', position: 3, name: SEGMENT_NAMES[m[1]], item: `https://anahtar.io/${key}/` }] });
  }
  return g.length ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': g }).replace(/</g, '\\u003c')}</script>` : '';
};

let count = 0;
for (const file of walk(out)) {
  let html = readFileSync(file, 'utf8');
  if (cssV) {
    const v = html.replace(/(href="(?:\.\.\/|\/)?site\.css)(?:\?v=[0-9a-f]+)?"/g, `$1?v=${cssV}"`);
    if (v !== html) { html = v; writeFileSync(file, html); }
  }
  // Elle yazılmış ve üretilmiş sayfaların (blog, destek) canonical/og:url adresi de sondaki eğik çizgiyle yazılır.
  const fixed = html.replace(/(<link rel="canonical" href="|<meta property="og:url" content=")(https:\/\/anahtar\.io)(\/[^"?#]*)(")/g, (_, a, h, p, q) => a + h + slash(p) + q);
  if (fixed !== html) { html = fixed; writeFileSync(file, html); }
  if (html.includes('http-equiv="Content-Security-Policy"')) continue;      // zaten sertleştirilmiş
  // translate="no": tarayıcının otomatik çevirisi sayfa metnini React bağlanmadan değiştirirse "hydration" hatası (React #418) olur.
  // Uygulamanın kendi dil seçimi (Türkçe/English) var; çeviri oradan yapılır.
  html = html.replace('<html lang="en">', '<html lang="tr" translate="no">');
  const guard = `<script>${FRAME_GUARD}</script>`;
  const hashes = [...new Set([...inline(html), FRAME_GUARD].map(sha))];
  // titles.json değeri ya başlık ya da { title, desc } (sayfaya özel açıklama).
  const entry = titleFor(file);
  const title = typeof entry === 'string' ? entry : entry.title;
  const desc = typeof entry === 'string' ? DESC : (entry.desc || DESC);
  // Elle yazılmış sayfalar (destek, yasal metinler) kendi başlık ve açıklamasını taşır; onlara yenisi eklenmez.
  const key = pageKey(file);
  const own = /<title>/.test(html);
  const head = [
    `<meta http-equiv="Content-Security-Policy" content="${esc(csp(hashes))}"/>`,
    ...(own ? [] : [
      `<title>${title}</title>`,
      `<meta name="description" content="${esc(desc)}"/>`,
      `<link rel="canonical" href="https://anahtar.io${slash('/' + key)}"/>`,
      `<meta property="og:title" content="${title}"/>`,
      `<meta property="og:description" content="${esc(desc)}"/>`,
      '<meta property="og:site_name" content="anahtar"/>',
      '<meta property="og:type" content="website"/>',
      `<meta property="og:url" content="https://anahtar.io${slash('/' + key)}"/>`,
      `<meta property="og:image" content="${OG_IMAGE}"/>`,
      '<meta property="og:image:width" content="1200"/>',
      '<meta property="og:image:height" content="630"/>',
      '<meta name="twitter:card" content="summary_large_image"/>',
      `<meta name="twitter:title" content="${title}"/>`,
      `<meta name="twitter:description" content="${esc(desc)}"/>`,
      `<meta name="twitter:image" content="${OG_IMAGE}"/>`,
      ...(NOINDEX_PAGES.test(key) ? ['<meta name="robots" content="noindex,nofollow"/>'] : [])
    ]),
    '<meta name="referrer" content="strict-origin-when-cross-origin"/>',
    '<meta property="og:locale" content="tr_TR"/>',
    '<meta name="theme-color" content="#FAF5F0"/>',
    '<meta name="apple-mobile-web-app-capable" content="yes"/>',
    '<meta name="apple-mobile-web-app-title" content="anahtar"/>',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default"/>',
    `<link rel="manifest" href="${base}/manifest.webmanifest"/>`,
    `<link rel="apple-touch-icon" href="${base}/apple-touch-icon.png"/>`
  ].join('');
  // CSP en başta olmalı ki sonraki kaynaklara da uygulansın; çerçeve koruması hemen ardından.
  html = html.replace('<head>', `<head>${head}${guard}${preconnect(file)}${own ? '' : fontCss() + jsonLd(key)}`);
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
