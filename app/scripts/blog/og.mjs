// Blog paylaşım görselleri (1200×630): `node scripts/blog/og.mjs` — Playwright gerekir.
// Çıktı: public/blog/og/<yazı>.jpg ve blog.jpg. Yazı eklenince ya da başlık değişince yeniden çalıştırın.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POSTS, CATEGORIES } from './posts.mjs';

const { chromium } = createRequire(import.meta.url)('playwright');
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '../../public/blog/og');
const MONO = readFileSync(join(HERE, 'logo.svg'), 'utf8').match(/<path d="(M388[^"]+)"/)[1];
const BG = { gul: ['#C8302E', '#8E1F1D', '#FAF5F0'], bal: ['#F2B544', '#D88E12', '#1D1A19'], fes: ['#2A6B3A', '#1C4A28', '#FAF5F0'], kil: ['#1D1A19', '#5C4F4A', '#FAF5F0'] };
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const page = (title, label, tone) => {
  const [a, b, ink] = BG[tone];
  return `<html><body style="margin:0;width:1200px;height:630px;background:linear-gradient(135deg,${a},${b});font-family:Inter,'Segoe UI',system-ui,sans-serif;color:${ink};position:relative;overflow:hidden">
<svg viewBox="0 0 1000 1000" style="position:absolute;right:-90px;bottom:-140px;width:620px;height:620px;opacity:.13"><g transform="translate(180,190) scale(0.64)"><path d="${MONO}" fill="${ink}" fill-rule="evenodd"/></g></svg>
<div style="position:absolute;left:80px;top:72px;display:flex;align-items:center;gap:18px">
<svg viewBox="0 0 1000 1000" width="64" height="64"><rect width="1000" height="1000" rx="230" fill="${ink}"/><g transform="translate(180,190) scale(0.64)"><path d="${MONO}" fill="${a}" fill-rule="evenodd"/></g></svg>
<span style="font-size:40px;font-weight:800;letter-spacing:-1.5px">anahtar</span>
<span style="font-size:22px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:.75;margin-left:14px">${esc(label)}</span></div>
<div style="position:absolute;left:80px;right:220px;bottom:84px;font-size:${title.length > 48 ? 62 : 72}px;line-height:1.04;font-weight:800;letter-spacing:-2.6px;text-wrap:balance">${esc(title)}</div>
</body></html>`;
};

mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
for (const post of POSTS) {
  await p.setContent(page(post.h1, CATEGORIES[post.category].name, CATEGORIES[post.category].tone));
  await p.screenshot({ path: join(OUT, post.slug + '.jpg'), type: 'jpeg', quality: 86 });
}
await p.setContent(page('Kira işleri, sade anlatımla.', 'Blog', 'gul'));
await p.screenshot({ path: join(OUT, 'blog.jpg'), type: 'jpeg', quality: 86 });
await b.close();
console.log('og: ' + (POSTS.length + 1) + ' görsel');
