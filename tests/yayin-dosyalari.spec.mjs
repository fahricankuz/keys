// Yayın hazırlığı dosyaları (mağaza + web): CSP'de Sentry kaynağı, Turnstile sayfası, canonical/site haritası, evrensel bağlantı dosyaları,
// kaynak haritası temizliği, uygulama simgeleri, app.json / eas.json, .htaccess, iş akışları ve .gitignore. Tarayıcı gerekmez.
import { test, expect } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = (p) => new URL('../' + p, import.meta.url).pathname;
const read = (p) => readFileSync(root(p), 'utf8');
const json = (p) => JSON.parse(read(p));
const tmp = () => mkdtempSync(join(tmpdir(), 'anahtar-yayin-'));
const DSN = 'https://abc123def456@o4510000000.ingest.de.sentry.io/4510000001';
const API = 'https://abcd.supabase.co';
const CLEAN_ENV = { EXPO_PUBLIC_SUPABASE_URL: API, EXPO_PUBLIC_TURNSTILE_SITE_KEY: '', EXPO_PUBLIC_SENTRY_DSN_WEB: '', EXPO_BASE_URL: '' };

test.describe.configure({ mode: 'serial' });

// ---------- harden-html.mjs ----------
function fixture() {
  const d = tmp();
  const page = (extra = '', body = '<script>window.__a=1</script>') => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>${extra}</head><body>${body}</body></html>`;
  mkdirSync(join(d, 'turnstile'), { recursive: true });
  mkdirSync(join(d, 'blog'), { recursive: true });
  writeFileSync(join(d, 'index.html'), page());
  writeFileSync(join(d, 'giris.html'), page());
  writeFileSync(join(d, 'turnstile/index.html'), page('', '<div id="w"></div><script>window.__t=1</script><script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>'));
  writeFileSync(join(d, 'blog/yazi.html'), page('<title>Yazı</title><link rel="canonical" href="https://anahtar.io/blog/yazi"/><meta property="og:url" content="https://anahtar.io/blog/yazi"/><link rel="canonical" href="https://anahtar.io/blog/"/>'));
  return d;
}
const harden = (dir, env = {}) => execFileSync('node', [root('app/scripts/harden-html.mjs'), dir], { env: { ...process.env, ...CLEAN_ENV, ...env }, encoding: 'utf8' });
const csp = (dir, f) => Object.fromEntries(readFileSync(join(dir, f), 'utf8').match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1].split('; ').map((x) => [x.split(' ')[0], x.split(' ').slice(1)]));

test('CSP: Sentry DSN verilince connect-src yalnız alım adresinin kaynağını ekler (anahtar ve yol yok); verilmezse hiçbir Sentry adresi yok', () => {
  const d = fixture();
  harden(d, { EXPO_PUBLIC_SENTRY_DSN_WEB: DSN });
  for (const f of ['index.html', 'giris.html']) {
    const c = csp(d, f);
    expect(c['connect-src'], f).toEqual(["'self'", 'blob:', 'data:', API, 'wss://abcd.supabase.co', 'https://o4510000000.ingest.de.sentry.io']);
    for (const k of ['script-src', 'img-src', 'frame-src', 'default-src']) expect(c[k].join(' '), f + ' ' + k).not.toMatch(/sentry/);
    expect(readFileSync(join(d, f), 'utf8')).not.toMatch(/abc123def456|4510000001/);
  }
  const d2 = fixture();
  harden(d2);
  expect(csp(d2, 'index.html')['connect-src'].join(' ')).not.toMatch(/sentry|ingest/);
  const d3 = fixture();
  harden(d3, { EXPO_PUBLIC_SENTRY_DSN_WEB: 'geçersiz değer' });
  expect(csp(d3, 'index.html')['connect-src'].join(' ')).not.toMatch(/sentry|geçersiz/);
});

test('/turnstile/ sayfası: site anahtarı değişkeni olmasa da challenges.cloudflare.com\'a betik, çerçeve ve bağlantı izni; arama motorlarına kapalı; başlık ve canonical eklenmez', () => {
  const d = fixture();
  harden(d, { EXPO_PUBLIC_SENTRY_DSN_WEB: DSN });
  const c = csp(d, 'turnstile/index.html');
  const CF = 'https://challenges.cloudflare.com';
  expect(c['script-src']).toContain(CF);
  expect(c['frame-src']).toEqual([CF]);
  expect(c['connect-src']).toContain(CF);
  expect(c['script-src'].join(' ')).not.toContain("'unsafe-inline'");
  const html = readFileSync(join(d, 'turnstile/index.html'), 'utf8');
  expect(html).toContain('<meta name="robots" content="noindex,nofollow"/>');
  expect(html).not.toMatch(/<title>|rel="canonical"|og:|rel="manifest"|apple-touch-icon|theme-color/);
  // Satır içi betiklerin ikisi de özetle izinli.
  for (const m of html.matchAll(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    const hash = `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`;
    expect(c['script-src'], m[1].slice(0, 40)).toContain(hash);
  }
  // Sitenin öbür sayfaları Turnstile anahtarı yokken çerçeve izni almaz.
  expect(csp(d, 'index.html')['frame-src']).toEqual(["'none'"]);
  expect(csp(d, 'index.html')['script-src'].join(' ')).not.toContain('cloudflare');
});

test('gerçek /turnstile/ sayfası (app/public/turnstile/index.html): satır içi olay niteliği ve javascript: bağlantısı yok, CSP ile çalışır', () => {
  const file = root('app/public/turnstile/index.html');
  test.skip(!existsSync(file), 'sayfa henüz yok');
  const d = tmp();
  mkdirSync(join(d, 'turnstile'));
  writeFileSync(join(d, 'turnstile/index.html'), readFileSync(file));
  harden(d);
  const html = readFileSync(join(d, 'turnstile/index.html'), 'utf8');
  expect(html).not.toMatch(/\son[a-z]+\s*=\s*["']/i);      // onload="…" gibi nitelikler CSP'ye takılır
  expect(html).not.toMatch(/javascript:/i);
  expect(csp(d, 'turnstile/index.html')['script-src']).toContain('https://challenges.cloudflare.com');
});

test('canonical ve og:url her sayfada sondaki eğik çizgiyle; yeniden çalıştırmak bir şeyi değiştirmez', () => {
  const d = fixture();
  harden(d);
  const get = (f) => readFileSync(join(d, f), 'utf8');
  expect(get('index.html')).toContain('<link rel="canonical" href="https://anahtar.io/"/>');
  expect(get('giris.html')).toContain('<link rel="canonical" href="https://anahtar.io/giris/"/>');
  expect(get('blog/yazi.html')).toContain('<link rel="canonical" href="https://anahtar.io/blog/yazi/"/>');
  expect(get('blog/yazi.html')).toContain('<meta property="og:url" content="https://anahtar.io/blog/yazi/"/>');
  expect(get('blog/yazi.html')).toContain('<link rel="canonical" href="https://anahtar.io/blog/"/>');   // zaten eğik çizgili
  for (const f of ['index.html', 'giris.html', 'blog/yazi.html']) expect(get(f)).not.toMatch(/rel="canonical" href="https:\/\/anahtar\.io\/[^"]*[^/"]"/);
  const before = ['index.html', 'giris.html', 'blog/yazi.html', 'turnstile/index.html'].map(get);
  harden(d);
  expect(['index.html', 'giris.html', 'blog/yazi.html', 'turnstile/index.html'].map(get)).toEqual(before);
});

// ---------- well-known.mjs ----------
const wk = () => import(pathToFileURL(root('app/scripts/well-known.mjs')).href);
const SHA_A = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';
const SHA_B = 'ab'.repeat(32);

test('well-known: apple-app-site-association ve assetlinks.json geçerli JSON, doğru kimlik ve yollarla yazılır', async () => {
  const { writeWellKnown } = await wk();
  const d = tmp();
  expect(writeWellKnown(d, {})).toEqual([]);
  expect(existsSync(join(d, '.well-known'))).toBe(false);                 // değişken yoksa dosya da dizin de yok
  expect(writeWellKnown(d, { APPLE_TEAM_ID: 'ABCDE12345', ANDROID_SHA256: `${SHA_A}, ${SHA_B.toLowerCase()} ,` }).sort()).toEqual(['apple-app-site-association', 'assetlinks.json']);
  const aasa = JSON.parse(readFileSync(join(d, '.well-known/apple-app-site-association'), 'utf8'));
  expect(aasa).toEqual({ applinks: { apps: [], details: [{ appID: 'ABCDE12345.io.anahtar.app', paths: ['/katil*', '/dogrula*', '/yeni-sifre*'] }] } });
  const links = JSON.parse(readFileSync(join(d, '.well-known/assetlinks.json'), 'utf8'));
  expect(links).toEqual([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'io.anahtar.app', sha256_cert_fingerprints: [SHA_A, SHA_B.toUpperCase().match(/../g).join(':')] } }]);
  // Yalnız biri tanımlıysa yalnız o yazılır.
  const d2 = tmp();
  expect(writeWellKnown(d2, { APPLE_TEAM_ID: 'ABCDE12345' })).toEqual(['apple-app-site-association']);
  expect(readdirSync(join(d2, '.well-known'))).toEqual(['apple-app-site-association']);
});

test('well-known: bozuk değer yayını durdurur (yanlış kimlikle bağlantı dosyası çıkmaz)', async () => {
  const { appleAssociation, assetLinks } = await wk();
  for (const bad of ['', 'abcde12345', 'ABC', 'ABCDE123456', 'ABCDE 2345']) expect(() => appleAssociation(bad), bad).toThrow(/APPLE_TEAM_ID/);
  for (const bad of ['', 'AA:BB', 'zz'.repeat(32), SHA_A + ':00']) expect(() => assetLinks(bad), bad).toThrow(/ANDROID_SHA256/);
  const d = tmp();
  const r = spawnSync('node', [root('app/scripts/well-known.mjs'), d], { env: { ...process.env, APPLE_TEAM_ID: 'kısa', ANDROID_SHA256: '' }, encoding: 'utf8' });
  expect(r.status).toBe(1);
  expect(r.stderr).toMatch(/APPLE_TEAM_ID geçersiz/);
  const ok = spawnSync('node', [root('app/scripts/well-known.mjs'), d], { env: { ...process.env, APPLE_TEAM_ID: '', ANDROID_SHA256: '' }, encoding: 'utf8' });
  expect(ok.status).toBe(0);                                              // değişken yoksa uyarı verir ama yayını durdurmaz
  expect(ok.stdout).toMatch(/::warning title=APPLE_TEAM_ID/);
});

// ---------- sentry-sourcemaps.mjs ----------
test('kaynak haritaları: jeton yokken yüklenmez, harita dosyaları silinir, sourceMappingURL kalkar, debugId kalır', () => {
  const d = tmp();
  const js = join(d, '_expo/static/js/web');
  mkdirSync(js, { recursive: true });
  writeFileSync(join(js, 'entry-1.js'), 'console.log(1);\n//# sourceMappingURL=/_expo/static/js/web/entry-1.js.map\n//# debugId=2df7d600-8640-4b06-b9cc-86f79edd8dad');
  writeFileSync(join(js, 'entry-1.js.map'), '{"version":3,"debug_id":"2df7d600-8640-4b06-b9cc-86f79edd8dad"}');
  writeFileSync(join(js, 'plain.js'), 'console.log(2);\n');
  const r = spawnSync('node', [root('app/scripts/sentry-sourcemaps.mjs'), d], { env: { ...process.env, SENTRY_AUTH_TOKEN: '' }, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
  expect(readdirSync(js).sort()).toEqual(['entry-1.js', 'plain.js']);
  expect(readFileSync(join(js, 'entry-1.js'), 'utf8')).toBe('console.log(1);\n//# debugId=2df7d600-8640-4b06-b9cc-86f79edd8dad');
  expect(readFileSync(join(js, 'plain.js'), 'utf8')).toBe('console.log(2);\n');
  expect(r.stdout).toMatch(/SENTRY_AUTH_TOKEN yok, 1 harita yüklenmeden silinecek/);
});

// ---------- Simgeler ----------
/** 8 bit, aralıksız (interlace yok) RGB/RGBA PNG çözücü: yalnız bu testteki görseller için. */
function png(file) {
  const b = readFileSync(file);
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  let o = 8, ihdr, idat = [], hasTrns = false;
  while (o < b.length) {
    const len = b.readUInt32BE(o), type = b.subarray(o + 4, o + 8).toString(), data = b.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') ihdr = { w: data.readUInt32BE(0), h: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    if (type === 'IDAT') idat.push(data);
    if (type === 'tRNS') hasTrns = true;
    o += 12 + len;
  }
  expect(ihdr.depth).toBe(8); expect(ihdr.interlace).toBe(0); expect([2, 6]).toContain(ihdr.color);
  const bpp = ihdr.color === 6 ? 4 : 3, stride = ihdr.w * bpp, raw = inflateSync(Buffer.concat(idat)), px = Buffer.alloc(stride * ihdr.h);
  for (let y = 0; y < ihdr.h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, up = y ? px[(y - 1) * stride + x] : 0, c = x >= bpp && y ? px[(y - 1) * stride + x - bpp] : 0;
      const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c);
      const pred = [0, a, up, (a + up) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? up : c][f];
      px[y * stride + x] = (line[x] + pred) & 255;
    }
  }
  return { ...ihdr, alpha: ihdr.color === 6, hasTrns, at: (x, y) => { const i = y * stride + x * bpp; return { r: px[i], g: px[i + 1], b: px[i + 2], a: bpp === 4 ? px[i + 3] : 255 }; } };
}
function glyph(img) {
  let n = 0, minX = img.w, maxX = 0, minY = img.h, maxY = 0, far = 0;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    if (img.at(x, y).a <= 8) continue;
    n++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    far = Math.max(far, Math.hypot(x + 0.5 - img.w / 2, y + 0.5 - img.h / 2));
  }
  return { n, minX, maxX, minY, maxY, far };
}

test('simgeler: iOS simgesi opak 1024 (alfa yok), Android glifi güvenli bölgede ve ortada, açılış görselleri doldurulmuş, bildirim simgesi 96 beyaz', () => {
  const A = 'app/assets/';
  const icon = png(root(A + 'icon.png'));
  expect([icon.w, icon.h, icon.alpha, icon.hasTrns]).toEqual([1024, 1024, false, false]);
  expect(icon.at(0, 0)).toEqual({ r: 200, g: 48, b: 46, a: 255 });         // eski şeffaf köşe artık kendi zemini (#C8302E)
  expect(icon.at(1023, 1023)).toEqual({ r: 200, g: 48, b: 46, a: 255 });
  for (const f of ['android-icon-foreground.png', 'android-icon-monochrome.png', 'splash-icon.png', 'splash-icon-dark.png']) {
    const img = png(root(A + f));
    expect([img.w, img.h, img.alpha], f).toEqual([1024, 1024, true]);
    const g = glyph(img);
    expect(g.n, f).toBeGreaterThan(50000);
    expect(g.far, f + ': glif güvenli bölge dairesinin (çap %61) içinde').toBeLessThanOrEqual(1024 * 0.305);
    expect(Math.abs((g.minX + g.maxX) / 2 - 511.5), f + ' yatay ortada').toBeLessThanOrEqual(8);
    expect(Math.abs((g.minY + g.maxY) / 2 - 511.5), f + ' dikey ortada').toBeLessThanOrEqual(8);
  }
  const mono = png(root(A + 'android-icon-monochrome.png')), fg = png(root(A + 'android-icon-foreground.png'));
  expect(mono.at(512, 330)).toMatchObject({ r: 0, g: 0, b: 0 });                    // tek renk; Android yalnız alfayı kullanır
  expect(fg.at(512, 330)).toMatchObject({ r: 255, g: 255, b: 255 });
  expect(png(root(A + 'splash-icon.png')).at(512, 330)).toMatchObject({ r: 200, g: 48, b: 46, a: 255 });
  expect(png(root(A + 'splash-icon-dark.png')).at(512, 330)).toMatchObject({ r: 216, g: 64, b: 61, a: 255 });
  const note = png(root(A + 'notification-icon.png'));
  expect([note.w, note.h, note.alpha]).toEqual([96, 96, true]);
  for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) { const p = note.at(x, y); if (p.a > 0) expect([p.r, p.g, p.b], `${x},${y}`).toEqual([255, 255, 255]); }
  expect(glyph(note).n).toBeGreaterThan(1500);
});

// ---------- app.json / eas.json / metro ----------
test('app.json: iPhone, evrensel bağlantılar, App Links, yedek kapalı, AD_ID engelli, bildirim ve açılış ekranı ayarlı, gizlilik bildirimi gerçek toplamayla eşleşir', () => {
  const x = json('app/app.json').expo;
  expect(x.ios.supportsTablet).toBe(false);
  expect(x.newArchEnabled).toBeUndefined();
  expect(x.ios.associatedDomains).toEqual(['applinks:anahtar.io']);
  expect(x.android.allowBackup).toBe(false);
  expect(x.android.blockedPermissions).toContain('com.google.android.gms.permission.AD_ID');
  const f = x.android.intentFilters;
  expect(f.length).toBe(1);
  expect(f[0]).toMatchObject({ action: 'VIEW', autoVerify: true, category: ['BROWSABLE', 'DEFAULT'] });
  expect(f[0].data).toEqual(['/katil', '/dogrula', '/yeni-sifre'].map((pathPrefix) => ({ scheme: 'https', host: 'anahtar.io', pathPrefix })));

  const types = x.ios.privacyManifests.NSPrivacyCollectedDataTypes;
  const names = types.map((t) => t.NSPrivacyCollectedDataType.replace('NSPrivacyCollectedDataType', ''));
  for (const n of ['PurchaseHistory', 'PerformanceData', 'OtherDiagnosticData', 'CrashData', 'UserID', 'DeviceID']) expect(names, n).toContain(n);
  expect(names).not.toContain('PaymentInfo');                               // uygulama kart verisi işlemez
  expect(new Set(names).size).toBe(names.length);
  for (const t of types) expect(t).toMatchObject({ NSPrivacyCollectedDataTypeLinked: true, NSPrivacyCollectedDataTypeTracking: false, NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'] });
  expect(x.ios.privacyManifests.NSPrivacyTracking).toBe(false);

  const plug = (n) => x.plugins.find((p) => (Array.isArray(p) ? p[0] : p) === n);
  expect(plug('@sentry/react-native/expo')[1]).toEqual({ url: 'https://de.sentry.io/' });   // kuruluş/proje SENTRY_ORG ve SENTRY_PROJECT'ten, jeton SENTRY_AUTH_TOKEN'dan
  expect(plug('expo-notifications')[1]).toMatchObject({ icon: './assets/notification-icon.png', defaultChannel: 'evim' });
  expect(plug('expo-splash-screen')[1]).toMatchObject({ image: './assets/splash-icon.png', backgroundColor: '#FAF5F0', dark: { image: './assets/splash-icon-dark.png', backgroundColor: '#1D1A19' } });
  for (const p of ['./assets/notification-icon.png', './assets/splash-icon.png', './assets/splash-icon-dark.png', x.icon, x.android.adaptiveIcon.foregroundImage, x.android.adaptiveIcon.monochromeImage]) expect(existsSync(root('app/' + p.replace('./', ''))), p).toBe(true);
  expect(JSON.stringify(x)).not.toMatch(/authToken|sntrys_|sentry\.io\/api|ingest/i);
});

test('eas.json: profil başına ortam, Node sabit, gizli değer yok, mağaza gönderimi taslak ve iç test kanalı', () => {
  const e = json('app/eas.json');
  expect(e.cli.version).toBeTruthy();
  expect(e.build.base.node).toMatch(/^22\.\d+\.\d+$/);
  for (const name of ['development', 'preview', 'production']) {
    const p = e.build[name];
    expect(p.extends, name).toBe('base');
    expect(p.environment, name).toBe(name);                               // EAS ortam değişkenleri (Sentry DSN, RevenueCat, Turnstile, jetonlar) bu ortamdan gelir
    expect(p.env.EXPO_PUBLIC_APP_ENV, name).toBe(name);
    expect(p.env.EXPO_PUBLIC_SUPABASE_URL, name).toBe(e.build.base.env.EXPO_PUBLIC_SUPABASE_URL);
    expect(p.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, name).toMatch(/^sb_publishable_/);
  }
  expect(e.build.production).toMatchObject({ autoIncrement: true, android: { buildType: 'app-bundle' } });
  expect(e.build.development.developmentClient).toBe(true);
  expect(JSON.stringify(e)).not.toMatch(/SENTRY_AUTH_TOKEN|EXPO_PUBLIC_RC_|SENTRY_DSN|GOOGLE_SERVICES|service_role|secret|sntrys_|\.p8|\.jks/i);
  expect(e.submit.production).toEqual({ android: { track: 'internal', releaseStatus: 'draft' }, ios: { ascAppId: '6834434284', appleTeamId: 'F5DQK4ZWFP' } });   // iOS: App Store Connect uygulama kimliği ve takım (gizli değil); Android: taslak, iç test
});

test('metro.config.js: Sentry hata ayıklama kimlikleri, web\'de replay/geri bildirim/sürüm kodu yok, reanimated web karşılığı korunur', () => {
  const m = read('app/metro.config.js');
  expect(m).toContain("getSentryExpoConfig(__dirname, { includeWebReplay: false, includeWebFeedback: false, injectReleaseForWeb: false })");
  expect(m).toMatch(/platform === 'web' && name === 'react-native-reanimated'/);
  expect(m).toContain('(upstream || context.resolveRequest)(context, name, platform)');
});

test('package.json: kaynak haritalı web derlemesi ve Hostinger paketi sırası', () => {
  const s = json('app/package.json').scripts;
  expect(s['build:web']).toBe('expo export -p web --output-dir dist && node scripts/harden-html.mjs dist');
  expect(s['build:web:maps']).toBe('expo export -p web --output-dir dist --source-maps && node scripts/harden-html.mjs dist && node scripts/sentry-sourcemaps.mjs dist');
  expect(s['build:hostinger']).toBe('npm run build:web:maps && node scripts/well-known.mjs dist && rm -rf ../hostinger-site && cp -r dist ../hostinger-site');
});

// ---------- Site haritası, .htaccess ----------
test('site haritası: tüm adresler sondaki eğik çizgiyle, tekrar yok, yönlendirilen /cozumler/portfoy yok', () => {
  const xml = read('app/public/sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(locs.length).toBeGreaterThan(20);
  expect(new Set(locs).size).toBe(locs.length);
  for (const l of locs) expect(l, l).toMatch(/^https:\/\/anahtar\.io\/([a-z0-9-]+\/)*$/);
  expect(locs).toContain('https://anahtar.io/');
  expect(xml).not.toContain('portfoy');
  // Üretici (blog/build.mjs) aynı biçimi üretir.
  const gen = read('app/scripts/blog/build.mjs');
  expect(gen).not.toMatch(/<loc>\$\{SITE\}[^<]*[^/}]<\/loc>/);
});

test('.htaccess: doğrulama dosyaları yönlendirmesiz ve JSON olarak, kaldırılan sayfa tek adımda eğik çizgili adrese', () => {
  const h = read('app/public/.htaccess');
  const exempt = h.indexOf('RewriteRule ^\\.well-known/(apple-app-site-association|assetlinks\\.json)$ - [L]');
  expect(exempt).toBeGreaterThan(0);
  expect(exempt).toBeLessThan(h.indexOf('RewriteCond %{HTTP_HOST} ^www'));       // www ve https yönlendirmelerinden önce
  expect(exempt).toBeLessThan(h.indexOf('RewriteCond %{HTTPS} !=on'));
  expect(h).toMatch(/<Files "apple-app-site-association">\s*ForceType application\/json\s*<\/Files>/);
  expect(h).toContain('RewriteRule ^cozumler/portfoy/?$ /cozumler/mulk-sahibi/ [L,R=301]');
  expect(h).toMatch(/<FilesMatch "\^turnstile\\\.js\$">\s*Header set Cache-Control "no-cache"/);   // özetsiz dosya adı: yıllık önbelleğe girmez
  expect(h).toMatch(/RewriteCond %\{REQUEST_URI\} !\^\/\\\.well-known\//);       // gizli dosya engeli .well-known'ı hâlâ açık bırakır
});

// ---------- İş akışları, .gitignore ----------
test('hostinger.yml: salt okunur varsayılan, yazma yalnız paket işinde, yalnız varsayılan daldan paketlenir, kimlik saklanmaz, Sentry ve bağlantı değişkenleri var', () => {
  const y = read('.github/workflows/hostinger.yml');
  expect(y).toMatch(/^permissions:\n  contents: read\n/m);
  const pkg = y.slice(y.indexOf('\n  package:'));
  expect(pkg).toMatch(/\n    permissions:\n      contents: write\n/);
  expect(pkg.match(/if: \$\{\{[^\n]*\}\}/)[0]).toContain("github.ref == format('refs/heads/{0}', github.event.repository.default_branch)");
  expect(pkg.match(/if: \$\{\{[^\n]*\}\}/)[0]).not.toContain('workflow_dispatch');
  expect(pkg).toMatch(/actions\/checkout@v4\n\s+with:\n\s+persist-credentials: false/);
  for (const v of ['EXPO_PUBLIC_SENTRY_DSN_WEB: ${{ vars.SENTRY_DSN_WEB }}', 'EXPO_PUBLIC_SENTRY_RELEASE: ${{ github.sha }}', 'SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}',
    'APPLE_TEAM_ID: ${{ vars.APPLE_TEAM_ID }}', 'ANDROID_SHA256: ${{ vars.ANDROID_SHA256 }}', "SENTRY_ORG: ${{ vars.SENTRY_ORG || 'anahtar' }}", "SENTRY_URL: ${{ vars.SENTRY_URL || 'https://de.sentry.io/' }}"]) expect(pkg, v).toContain(v);
  expect((y.match(/^\s+contents: write$/gm) || []).length).toBe(1);
});

test('expo-mobile.yml: EAS CLI sürümü sabit, checkout kimlik saklamaz', () => {
  const y = read('.github/workflows/expo-mobile.yml');
  expect(y).toContain('eas-version: 27.9.0');
  expect(y).not.toMatch(/eas-version: latest/);
  expect((y.match(/persist-credentials: false/g) || []).length).toBe((y.match(/actions\/checkout@v4/g) || []).length);
});

test('.gitignore: gizli dosyalar (anahtarlar, sertifikalar, Firebase/Apple kimlikleri, .env, MCP ayarı) hem kökte hem app/ içinde', () => {
  for (const f of ['.gitignore', 'app/.gitignore']) {
    const lines = read(f).split('\n').map((l) => l.trim());
    for (const p of ['.env', '.env.*', '*.p8', '*.p12', '*.jks', '*.keystore', '*.mobileprovision', 'GoogleService-Info.plist', 'credentials.json', '.mcp.json']) expect(lines, f + ' ' + p).toContain(p);
  }
  expect(read('.gitignore').split('\n')).toContain('google-services.json');
  expect(read('app/.gitignore').split('\n')).toContain('google-services.json');
});
