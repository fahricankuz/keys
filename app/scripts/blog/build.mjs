// Blog ve destek sayfalarını üretir: `node scripts/blog/build.mjs` (app/ klasöründe).
// Çıktı: public/blog/index.html, public/blog/<yazı>.html, public/blog/rss.xml,
// public/destek/index.html ve site haritasındaki blog satırları. CSP başlığını derlemede harden-html ekler.
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { POSTS, CATEGORIES } from './posts.mjs';
import { destekPage } from './destek.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUB = join(HERE, '../../public');
const SITE = 'https://anahtar.io';
// Uygulama içindeki sayfalar (src/site/segments.ts → SEGMENT_SLUGS ile aynı).
const SEGMENTS = ['mulk-sahibi', 'portfoy', 'kiraci', 'emlak-ofisi', 'site-yonetimi', 'avm', 'gyo', 'depo-lojistik', 'family-office'];
const LOGO = readFileSync(join(HERE, 'logo.svg'), 'utf8');
let logoN = 0;
const logo = () => LOGO.replaceAll('LOGOID', 'lg' + (++logoN));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const human = (d) => { const [y, m, g] = d.split('-').map(Number); return `${g} ${MONTHS[m - 1]} ${y}`; };
const words = (html) => html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
const minutes = (p) => Math.max(2, Math.round(words(p.body) / 200));
const MARK = { hukuk: '§', vergi: '%', rehber: '✓', odeme: '₺' };
const KEYHOLE = `<svg class="key" viewBox="0 0 100 100" aria-hidden="true"><path fill="currentColor" d="M50 8a24 24 0 0 1 13 44.2L70 92H30l7-39.8A24 24 0 0 1 50 8Z"/></svg>`;

const ORG = { '@type': 'Organization', name: 'anahtar', url: SITE, logo: { '@type': 'ImageObject', url: SITE + '/icon-512.png' } };

export function head({ title, description, path, type = 'website', image, extra = '', jsonld = [], noindex = false }) {
  const url = SITE + path;
  const img = image ? SITE + image : SITE + '/blog/og/blog.jpg';
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}"/>
${noindex ? '<meta name="robots" content="noindex"/>' : '<meta name="robots" content="index,follow,max-image-preview:large"/>'}
<link rel="canonical" href="${url}"/>
<link rel="icon" href="/favicon.ico"/>
<link rel="stylesheet" href="/site.css"/>
<link rel="alternate" type="application/rss+xml" title="anahtar blog" href="${SITE}/blog/rss.xml"/>
<meta name="theme-color" content="#FAF5F0"/>
<meta name="color-scheme" content="light"/>
<meta property="og:site_name" content="anahtar"/>
<meta property="og:type" content="${type}"/>
<meta property="og:title" content="${esc(title.replace(/ \| anahtar$/, ''))}"/>
<meta property="og:description" content="${esc(description)}"/>
<meta property="og:url" content="${url}"/>
<meta property="og:image" content="${img}"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:locale" content="tr_TR"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(title.replace(/ \| anahtar$/, ''))}"/>
<meta name="twitter:description" content="${esc(description)}"/>
<meta name="twitter:image" content="${img}"/>
${extra}${jsonld.map((j) => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('\n')}
</head>`;
}

export function bar(active) {
  const a = (href, label, key, cls = '') => `<a href="${href}"${cls ? ` class="${cls}"` : ''}${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<header class="bar"><div class="wrap">
<a class="logo" href="/" aria-label="anahtar ana sayfa">${logo()}</a>
<nav aria-label="Site">${a('/cozumler', 'Çözümler', 'cozum', 'hide-s')}${a('/kira-artis-hesaplama', 'Kira artışı hesapla', 'hesap', 'hide-s')}${a('/blog/', 'Blog', 'blog')}${a('/destek/', 'Destek', 'destek', 'hide-s')}${a('/giris', 'Giriş yap', 'giris', 'hide-s')}${a('/kayit', 'Ücretsiz dene', '', 'btn')}</nav>
</div></header>`;
}

export function foot() {
  return `<footer class="foot"><div class="wrap">
<span>© ${new Date().getFullYear()} anahtar · Kiracı ile mülk sahibi aynı sayfada.</span>
<nav aria-label="Alt bağlantılar"><a href="/">Ana sayfa</a><a href="/kira-artis-hesaplama">Kira artış hesaplama</a><a href="/blog/">Blog</a><a href="/destek/">Destek</a><a href="/kurumsal">Kurumsal</a><a href="/gizlilik/">Gizlilik ve KVKK</a><a href="/kosullar/">Kullanım koşulları</a><a href="mailto:info@anahtar.io">info@anahtar.io</a></nav>
</div></footer>`;
}

const tag = (cat) => `<span class="tag t-${CATEGORIES[cat].tone}">${CATEGORIES[cat].name}</span>`;
const cover = (p, cls = '') => `<div class="cover c-${CATEGORIES[p.category].tone} ${cls}" aria-hidden="true">${KEYHOLE}<span class="big">${MARK[p.category]}</span></div>`;
const card = (p) => `<a class="post" href="/blog/${p.slug}">${cover(p)}<div class="in">${tag(p.category)}<h3>${esc(p.h1)}</h3><p>${esc(p.summary)}</p><span class="meta"><time datetime="${p.date}">${human(p.date)}</time> · ${minutes(p)} dk okuma</span></div></a>`;

/** h2'lere id verir (yoksa) ve içindekiler listesini döner. */
function toc(body) {
  const items = [];
  const html = body.replace(/<h2(?: id="([^"]+)")?>(.*?)<\/h2>/g, (_, id, text) => {
    const slug = id || text.toLocaleLowerCase('tr').replace(/<[^>]+>/g, '').replace(/[^a-z0-9çğıöşü]+/g, '-').replace(/^-|-$/g, '');
    items.push([slug, text.replace(/<[^>]+>/g, '')]);
    return `<h2 id="${slug}">${text}</h2>`;
  });
  return { html, items };
}

function article(p) {
  const { html, items } = toc(p.body);
  const list = `<ol>${items.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).concat(p.faq.length ? ['<li><a href="#sss">Sık sorulanlar</a></li>'] : []).join('')}</ol>`;
  const path = '/blog/' + p.slug;
  const related = p.related.map((s) => POSTS.find((x) => x.slug === s)).filter(Boolean);
  const share = encodeURIComponent(SITE + path);
  const jsonld = [
    {
      '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.h1, description: p.description,
      image: SITE + '/blog/og/' + p.slug + '.jpg', datePublished: p.date, dateModified: p.updated || p.date,
      inLanguage: 'tr-TR', mainEntityOfPage: { '@type': 'WebPage', '@id': SITE + path }, author: ORG, publisher: ORG,
      articleSection: CATEGORIES[p.category].name, keywords: p.keywords.join(', '), wordCount: words(p.body)
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Ana sayfa', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: SITE + '/blog/' },
        { '@type': 'ListItem', position: 3, name: p.h1, item: SITE + path }
      ]
    },
    ...(p.faq.length ? [{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: p.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }] : [])
  ];
  return `${head({ title: p.title + ' | anahtar', description: p.description, path, type: 'article', image: '/blog/og/' + p.slug + '.jpg', jsonld,
    extra: `<meta property="article:published_time" content="${p.date}"/>\n<meta property="article:modified_time" content="${p.updated || p.date}"/>\n<meta property="article:section" content="${esc(CATEGORIES[p.category].name)}"/>\n${p.keywords.map((k) => `<meta property="article:tag" content="${esc(k)}"/>`).join('\n')}\n` })}
<body>
${bar('blog')}
<main class="wrap">
<ol class="crumbs" aria-label="Konum"><li><a href="/">Ana sayfa</a></li><li><a href="/blog/">Blog</a></li><li aria-current="page">${esc(CATEGORIES[p.category].name)}</li></ol>
<div class="article-head">
${tag(p.category)}
<h1 style="margin-top:14px">${esc(p.h1)}</h1>
<p class="lead">${esc(p.description)}</p>
<p class="meta"><span>Yayın: <time datetime="${p.date}">${human(p.date)}</time></span>${p.updated && p.updated !== p.date ? `<span>Güncelleme: <time datetime="${p.updated}">${human(p.updated)}</time></span>` : ''}<span>${minutes(p)} dk okuma</span></p>
</div>
${cover(p, 'article-cover')}
<div class="article">
<article class="prose">
<nav class="toc toc-inline" aria-label="İçindekiler"><b>İçindekiler</b>${list}</nav>
${html}
${p.faq.length ? `<h2 id="sss">Sık sorulanlar</h2>\n${p.faq.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}` : ''}
<div class="share">Paylaş: <a href="https://wa.me/?text=${encodeURIComponent(p.h1 + ' ')}${share}" rel="noopener">WhatsApp</a><a href="https://x.com/intent/post?url=${share}&amp;text=${encodeURIComponent(p.h1)}" rel="noopener">X</a><a href="https://www.linkedin.com/sharing/share-offsite/?url=${share}" rel="noopener">LinkedIn</a></div>
<p class="disclaimer">Bu yazı genel bilgi amaçlıdır, hukuki ya da mali danışmanlık değildir. Mevzuat değişebilir; işlem yapmadan önce güncel resmi kaynakları kontrol edin ve gerekirse bir uzmana danışın.</p>
</article>
<aside class="toc-side">
<nav class="toc" aria-label="İçindekiler"><b>İçindekiler</b>${list}</nav>
<div class="side-cta"><b>Kirayı tek yerden takip et</b><p>Ödeme, dekont, talep ve sözleşme tarihleri kiracı ile mülk sahibinde aynı ekranda.</p><a class="btn" href="/kayit">Ücretsiz dene</a></div>
</aside>
</div>
<section class="cta-band"><div><h2>Kiracınla aynı sayfada ol.</h2><p>Kiracılar için her zaman ücretsiz; mülk sahipleri için 1 ay ücretsiz deneme.</p></div><a class="btn light" href="/kayit">Hesap oluştur</a></section>
<section class="related"><h2>İlgili yazılar</h2><div class="posts">${related.map(card).join('')}</div></section>
</main>
${foot()}
</body>
</html>
`;
}

function index() {
  const sorted = [...POSTS].sort((a, b) => (a.date < b.date ? 1 : -1));
  const [top, ...rest] = sorted;
  const cats = Object.keys(CATEGORIES).filter((k) => sorted.some((p) => p.category === k));
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'Blog', name: 'anahtar blog', url: SITE + '/blog/', inLanguage: 'tr-TR', publisher: ORG,
      blogPost: sorted.map((p) => ({ '@type': 'BlogPosting', headline: p.h1, url: SITE + '/blog/' + p.slug, datePublished: p.date })) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Ana sayfa', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: 'Blog', item: SITE + '/blog/' }] }
  ];
  return `${head({ title: 'Blog: kira artışı, depozito, stopaj ve kira hukuku | anahtar', description: 'Kiracılar ve mülk sahipleri için kira artışı, depozito, stopaj, aidat, tahliye ve kira geliri beyannamesi üzerine anlaşılır rehberler.', path: '/blog/', jsonld })}
<body>
${bar('blog')}
<main class="wrap">
<section class="blog-hero">
<span class="label">anahtar blog</span>
<h1>Kira işleri, sade anlatımla.</h1>
<p class="lead">Kira artışından depozitoya, stopajdan tahliyeye: kiracılar ve mülk sahipleri için kanuna dayalı, örnekli rehberler.</p>
</section>
<a class="feature" href="/blog/${top.slug}">${cover(top)}<div class="body">${tag(top.category)}<h2>${esc(top.h1)}</h2><p>${esc(top.description)}</p><span class="meta"><time datetime="${top.date}">${human(top.date)}</time> · ${minutes(top)} dk okuma</span></div></a>
<nav class="filters" aria-label="Konular">${cats.map((k) => `<a href="#${k}">${CATEGORIES[k].name}</a>`).join('')}</nav>
${cats.map((k) => {
    const list = sorted.filter((p) => p.category === k && p !== top);
    return list.length ? `<section id="${k}"><h2 class="cat-title">${CATEGORIES[k].name}</h2><div class="posts">${list.map(card).join('')}</div></section>` : '';
  }).join('\n')}
<section class="cta-band"><div><h2>Kirayı kağıt ve WhatsApp'tan kurtar.</h2><p>Ödemeler, dekontlar, talepler ve sözleşme tarihleri kiracı ile mülk sahibinde aynı ekranda.</p></div><a class="btn light" href="/kayit">Ücretsiz dene</a></section>
</main>
${foot()}
</body>
</html>
`;
}

function rss() {
  const sorted = [...POSTS].sort((a, b) => (a.date < b.date ? 1 : -1));
  const item = (p) => `<item><title>${esc(p.h1)}</title><link>${SITE}/blog/${p.slug}</link><guid>${SITE}/blog/${p.slug}</guid><pubDate>${new Date(p.date + 'T09:00:00+03:00').toUTCString()}</pubDate><category>${esc(CATEGORIES[p.category].name)}</category><description>${esc(p.description)}</description></item>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>anahtar blog</title><link>${SITE}/blog/</link><description>Kiracılar ve mülk sahipleri için kira rehberleri.</description><language>tr-TR</language>
<atom:link href="${SITE}/blog/rss.xml" rel="self" type="application/rss+xml"/>
${sorted.map(item).join('\n')}
</channel></rss>
`;
}

function sitemap() {
  const file = join(PUB, 'sitemap.xml');
  const keep = readFileSync(file, 'utf8').split('\n').filter((l) => l.includes('<url>') && !l.includes('/blog/') && !/\/(kira-artis-hesaplama|kurumsal|cozumler)/.test(l));
  const last = [...POSTS].map((p) => p.updated || p.date).sort().pop();
  const lines = [
    ...keep,
    `  <url><loc>${SITE}/kira-artis-hesaplama</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod><changefreq>monthly</changefreq></url>`,
    `  <url><loc>${SITE}/kurumsal</loc></url>`,
    `  <url><loc>${SITE}/cozumler</loc></url>`,
    ...SEGMENTS.map((x) => `  <url><loc>${SITE}/cozumler/${x}</loc></url>`),
    `  <url><loc>${SITE}/blog/</loc><lastmod>${last}</lastmod></url>`,
    ...POSTS.map((p) => `  <url><loc>${SITE}/blog/${p.slug}</loc><lastmod>${p.updated || p.date}</lastmod></url>`),

  ];
  writeFileSync(file, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lines.join('\n')}\n</urlset>\n`);
}

const write = (rel, html) => { const f = join(PUB, rel); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, html); };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  write('blog/index.html', index());
  for (const p of POSTS) {
    // /blog/<yazı>/index.html kopyasını derlemede harden-html üretir.
    write(`blog/${p.slug}.html`, article(p));
  }
  write('blog/rss.xml', rss());
  write('destek/index.html', destekPage({ head, bar, foot }));
  sitemap();
  const og = POSTS.filter((p) => !existsSync(join(PUB, 'blog/og', p.slug + '.jpg')));
  console.log(`blog: ${POSTS.length} yazı yazıldı` + (og.length ? `; kapak görseli eksik: ${og.map((p) => p.slug).join(', ')} (node scripts/blog/og.mjs)` : ''));
}
