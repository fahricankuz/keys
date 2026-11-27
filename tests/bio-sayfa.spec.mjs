// Bio bağlantısı sayfası (app/public/merhaba): sosyal medya profillerinde kullanılır. Siteden bağlantı verilmez,
// site haritasında ve robots.txt'de yoktur, arama motorlarına kapalıdır; betik içermez (katı CSP).
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const ROOT = new URL('../app/public/', import.meta.url).pathname;
const page = readFileSync(ROOT + 'merhaba/index.html', 'utf8');
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(d + f).isDirectory() ? walk(d + f + '/') : [d + f]));

test('bio sayfası: dizinlenmez, betik yok, bağlantılar doğru', () => {
  expect(page).toContain('<meta name="robots" content="noindex,nofollow"/>');
  expect(page).not.toMatch(/<script\b/i);
  expect(page).not.toMatch(/\son[a-z]+\s*=/i);
  for (const href of ['https://apps.apple.com/tr/app/id6834434284', 'https://play.google.com/store/apps/details?id=io.anahtar.app',
    '/kayit/', '/kurumsal/', '/destek/', 'mailto:info@anahtar.io', 'https://www.instagram.com/anahtar_io/', 'https://www.tiktok.com/@anahtar.io', 'https://www.facebook.com/share/19o78yxmTv/', 'https://x.com/anahtar_io'])
    expect(page, href).toContain(`href="${href}"`);
});

test('bio sayfası gizli: site haritasında, robots.txt’de ve başka hiçbir sayfada bağlantısı yok', () => {
  expect(readFileSync(ROOT + 'sitemap.xml', 'utf8')).not.toContain('merhaba');
  expect(readFileSync(ROOT + 'robots.txt', 'utf8')).not.toContain('merhaba');
  const others = walk(ROOT).filter((f) => /\.(html|xml|txt|js|json|webmanifest)$/.test(f) && !f.endsWith('merhaba/index.html'));
  for (const f of others) expect(readFileSync(f, 'utf8'), f).not.toMatch(/\/merhaba\b/);
  const src = walk(new URL('../app/src/', import.meta.url).pathname).filter((f) => /\.(tsx?|jsx?)$/.test(f));
  for (const f of src) expect(readFileSync(f, 'utf8'), f).not.toMatch(/['"`]\/merhaba/);
});

test('bio sayfası açılışı telefonda akıcı: SVG maskesi ve SMIL yok, giriş animasyonlarında blur yok, giriş açılıştan sonra başlar', () => {
  const intro = page.slice(page.indexOf('<div class="intro"'), page.indexOf('</div>', page.indexOf('<div class="intro"')));
  expect(intro).not.toMatch(/<mask|<animate|<set\b|mask=/i);
  const css = page.slice(page.indexOf('<style>'), page.indexOf('</style>'));
  expect(css).toContain('.intro{');
  for (const sel of ['.up{', '.card{', '.pop{']) expect(css.slice(css.indexOf(sel), css.indexOf('}', css.indexOf(sel))), sel).not.toContain('filter');
  expect(css).not.toMatch(/@keyframes (up|card)\{[^}]*filter/);
  // Sayfanın girişi (--t0), açılışın süresine (2,02 sn) eşit ya da sonra başlar
  expect(css).toMatch(/--t0:2\.02s/);
  expect(css).toContain('animation:ilogo 2.02s');
  // İlk görünen yazılar önceden yüklenir
  expect(page).toContain('href="/fonts/inter-700.woff2" as="font"');
  expect(page).toContain('href="/fonts/intertight-800.woff2" as="font"');
});
