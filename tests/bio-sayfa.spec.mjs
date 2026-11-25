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
