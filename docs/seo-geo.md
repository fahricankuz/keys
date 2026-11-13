# anahtar.io: SEO and GEO guide

Working guideline for humans and AI agents who touch anything that search engines or AI assistants read on
anahtar.io: titles, meta, canonicals, sitemap, robots, structured data, blog posts, solution pages, legal pages.
Adapted from the DevirVentures SEO/GEO toolkit (the DevirVentures SEO toolkit (`devirventures/seo/` in Erdem's workspace), knowledge docs 10, 20, 30, 40, 50, 60, 80, 91).
Language of this file is English on purpose (agent-facing); Turkish keywords, titles and copy examples stay Turkish
because they are the real targets.

- Audit snapshot: **2026-11-13**. Layer read: raw HTML fetched with `curl` and a desktop-browser User-Agent (what a non-rendering
  crawler receives). No rendered-DOM, Search Console or CrUX data exists yet (see 7). Numbers in section 9 are quoted, not paraphrased.
- Perishable facts (rich-result policy, bot behaviour, vendor prices) follow `seo/knowledge/80-caveats-ledger.md`. Re-check it before
  recommending any schema type or "AI trick".
- This file documents policy and findings. It changes no site code. Fixes are listed in section 10 and ship as normal PRs
  (see `CLAUDE.md`: PR only, tests first, one push).

## 0. The ten rules (read this if nothing else)

1. One intent, one URL, one canonical, always with a trailing slash (decision 2026-11-13): `https://anahtar.io/blog/depozito-kurallari/`.
2. Public pages are indexable and in `sitemap.xml`; every private, utility or app route is `noindex,nofollow` and not in the sitemap.
3. Read the raw HTML, not the browser. If the title, `<h1>`, text, links or JSON-LD are not in the HTML the server sends, they do not exist for most crawlers.
4. Every public page has exactly one `<h1>`, real `<a href>` links, a unique title (<= 60 chars) and a unique description (<= 160 chars).
5. Structured data mirrors visible content only. No invented ratings, reviews, counts, prices or dates.
6. Dates are truthful: `dateModified` and sitemap `lastmod` move only when the content really changed.
7. Legal, tax and KVKK statements need a primary source (Resmî Gazete, mevzuat.gov.tr, TÜİK, GİB, KVKK Kurumu), a date and a worked example. No source, no sentence.
8. Rank first, then get cited. GEO is the same work as SEO plus answer-first writing, entity clarity and citable data. No AI-only hacks, no mass-produced pages.
9. No analytics, cookies or trackers are added without a KVKK/consent decision by Erdem (the privacy page currently promises none).
10. Nothing is "done" until the raw-HTML check passes and the measurement gates (+14d, +30d, +90d) are written down.

## 1. Goals, audience, keyword themes

### 1.1 What the site is

anahtar is a Turkish rent and site/apartment-complex management product (iOS, Android, web). anahtar.io is a static Expo web export
on Hostinger that holds the marketing site, the login/sign-up/app shell, a blog, a help center and the legal pages. It is operated
and published by Devredin Bilgi Teknolojileri Yazılım ve Ticaret A.Ş. (the public company block lives in `app/scripts/blog/destek.mjs`,
constant `COMPANY`, and must stay identical to the legal pages). The brand is written lowercase: **anahtar**.

### 1.2 Audience and what they search

| Audience | Job to be done | Page that should own the intent today |
| --- | --- | --- |
| Mülk sahibi (landlord, 1-9 properties) | track rent, dekont, depozito, contract dates, raise rent legally | `/cozumler/mulk-sahibi/`, blog, `/kira-artis-hesaplama/` |
| Kiracı (tenant) | upload dekont, report arıza, keep documents, understand rights | `/cozumler/kiraci/`, blog |
| Site sakini / site yöneticisi | aidat, talepler, genel kurul, communication | `/cozumler/site-yonetimi/` |
| Emlak ofisi, AVM, GYO, depo, family office (B2B) | portfolio, reports, team access | `/cozumler/<segment>/`, `/kurumsal/` |

### 1.3 Keyword themes (demand is NOT measured yet)

No volumes exist for anahtar: Search Console is not verified and no keyword tool has been run. Treat every theme below as a hypothesis.
Before writing a new page, name its primary keyword and the evidence for demand (GSC impressions once available; otherwise DataForSEO
Google Ads volume with the dotted Turkish spelling, `language_code=tr`, `location=Turkey`; cross-check any large number against GSC;
"no data" is not "no demand"). Read the live SERP composition first: if the top 10 is portals, law firms and news, say so and adjust.

| Theme (Turkish) | Intent | Owner page | State |
| --- | --- | --- | --- |
| kira takibi, kira takip programı, kira yönetimi | commercial | `/` and `/cozumler/mulk-sahibi/` | home title has no theme keyword (P2-2) |
| kira artışı, kira artış oranı 2026, TÜFE 12 aylık ortalama, kira zammı hesaplama | tool + informational | `/kira-artis-hesaplama/` + `/blog/kira-artisi-nasil-hesaplanir/` | exists; rate table missing (P1-5) |
| aidat takibi, site yönetimi programı, aidat kim öder | commercial + informational | `/cozumler/site-yonetimi/`, `/blog/aidat-kim-oder/` | one post only |
| dekont, kira ödemesi banka | informational | `/blog/kira-odemesi-banka-dekont/` | exists |
| depozito (iade, üst sınır) | informational | `/blog/depozito-kurallari/` | exists |
| işyeri kirası stopaj, kira geliri beyannamesi | informational (YMYL tax) | `/blog/isyeri-kirasinda-stopaj/`, `/blog/kira-geliri-beyannamesi/` | exist |
| kiracı tahliyesi | informational (YMYL legal) | `/blog/kiraci-tahliyesi/` | exists |
| giriş/çıkış tutanağı (kira teslim tutanağı) | informational + product feature | none | candidate guide; the app has the feature (`/uygulama/belgeler/tutanak`) |
| emlak vergisi (kim öder, ne zaman) | informational | none | candidate guide |
| kira sözleşmesi örneği / maddeleri | informational | `/blog/kira-sozlesmesinde-dikkat-edilecekler/` | SERP likely saturated; check before expanding |

### 1.4 Success definition

Primary: organic clicks (GSC) to public pages, then organic sign-ups (`/kayit/`) as a weekly proxy from Supabase counts. Secondary: brand
and category mentions/citations in AI answers (section 5.6). There is no promise of a rank position until the first GSC data exists.
First honest target: all public URLs indexed (>= 80% of sitemap URLs at +14d), impressions on every cluster at +30d.

## 2. Page inventory and indexation policy

URL grammar: flat and one-entity. Articles live at `/blog/<slug>/`, solution pages at `/cozumler/<segment>/`, the tool at
`/kira-artis-hesaplama/`. Never create combined-entity URLs (city x topic x year permutations) or one page per query variant:
that is scaled-content abuse. Sub-topics become anchored sections inside the parent page.

| Route family | Index? | In sitemap? | Notes |
| --- | --- | --- | --- |
| `/`, `/cozumler/`, `/cozumler/<8 segments>/`, `/kurumsal/`, `/kira-artis-hesaplama/` | yes | yes | Expo-prerendered; metadata from `app/src/site/titles.json` |
| `/blog/`, `/blog/<slug>/` (8 posts today) | yes | yes | generated static HTML |
| `/destek/` | yes | yes | generated static HTML, FAQ content |
| `/gizlilik/`, `/kosullar/`, `/hesap-silme/` | yes (trust pages) | yes | hand-written static HTML; Turkish with an English section (`lang="en"`) |
| `/giris/*`, `/kayit/*`, `/sifre/`, `/yeni-sifre/`, `/dogrula/`, `/katil/` | **no** (`noindex,nofollow`) | **no** | auth and invite utility pages. Today they have NO noindex (P1-1) |
| `/uygulama/*`, `/admin/*`, `/belge/` | **no** | no | authenticated shell. robots.txt blocks them but they have no noindex (P1-1) |
| `/satin-al/` | no until a real public pricing page exists | no | purchase flow, never test a payment (P2-9) |
| `/turnstile/` | no | no | WebView helper; already `noindex,nofollow` |
| `/adres/*.json`, `/data/*`, `/fonts/*`, `/_expo/*` | n/a | no | assets; `/data/` returns 403, fine |
| `404` | n/a | no | real 404 status (verified) |

Decision test for any new page (from toolkit doc 30): (1) valuable without logging in? (2) primary content in the raw HTML?
(3) unique enough to deserve its own URL? (4) a canonical query intent? (5) converts or assists conversion? Any "no" means noindex or redesign.

## 3. Technical SEO rules for this static Expo site

### 3.1 Where each thing is generated (single source of truth)

| Surface | Source of truth | Generator / injector | Output |
| --- | --- | --- | --- |
| Blog posts, blog index, RSS | `app/scripts/blog/posts.mjs` (`POSTS`, `CATEGORIES`) | `app/scripts/blog/build.mjs` (`head()`, `article()`, `index()`, `rss()`) | `app/public/blog/*.html`, `blog/rss.xml` (committed) |
| Help center | `app/scripts/blog/destek.mjs` (`GROUPS`, `COMPANY`) | `build.mjs` -> `destekPage()` | `app/public/destek/index.html` |
| Sitemap | blog/solution/tool lines are regenerated by `build.mjs` `sitemap()`; other lines are kept as-is | same | `app/public/sitemap.xml` |
| Blog OG images | `POSTS` | `node scripts/blog/og.mjs` (needs Playwright) | `app/public/blog/og/<slug>.jpg`, `blog.jpg` (1200x630 JPG) |
| Expo pages (home, solutions, tool, kurumsal, auth, app) | `app/src/app/**`, `app/src/site/**` | `expo export` then `app/scripts/harden-html.mjs` | `dist/` -> Hostinger |
| Titles and descriptions of Expo pages | `app/src/site/titles.json` (string, or `{ title, desc }`) | `harden-html.mjs` injects `<title>`, description, canonical, `og:title`, `og:description`, `og:locale`; `app/src/app/_layout.tsx` updates `document.title` on navigation | built HTML |
| Canonical slash normalization for static pages | none (post-processing) | `harden-html.mjs` rewrites `canonical` and `og:url` to a trailing slash | built HTML |
| Clean-URL folders (`/x/index.html`) and `404.html` | none | `harden-html.mjs` copies `x.html` to `x/index.html` | built HTML |
| robots.txt | `app/public/robots.txt` (hand-written) | none | served as-is |
| Redirects (www, https, trailing slash), cache, security headers | `app/public/.htaccess` (Hostinger/LiteSpeed). `_headers` is for Cloudflare/Netlify and unused on Hostinger | none | server |
| Legal pages | hand-written `app/public/{gizlilik,kosullar,hesap-silme}/index.html` | none | served as-is |

Rules for editing:

- Never hand-edit `app/public/blog/*.html`, `blog/rss.xml`, `destek/index.html` or the generated sitemap lines. Edit the source and run
  `cd app && node scripts/blog/build.mjs`, then commit source and output together.
- A new Expo public page needs: a route in `app/src/app/`, an entry in `titles.json` with `{ title, desc }`, a sitemap line, and (for
  segments) the `SEGMENTS` list in `build.mjs` kept equal to `app/src/site/segments.ts`.
- Tests that pin this behaviour: `tests/yayin-dosyalari.spec.mjs` (canonical slash, sitemap format, `/turnstile/` noindex) and
  `tests/yasal-sayfalar.spec.mjs` (legal pages, sitemap generator filter, asserted verbatim). Change generator and test together.
  Run one file at a time: `npx playwright test tests/yayin-dosyalari.spec.mjs` (Node 22, see `docs/test.md`).
- Docs-only changes do not trigger a site rebuild (`CLAUDE.md`).

### 3.2 Titles and descriptions

- Title: <= 60 characters including the ` | anahtar` suffix, primary keyword first, unique per URL. For blog posts the `title`
  field excludes the suffix, so keep `title` <= 50 characters (`build.mjs` appends ` | anahtar`; today one post reaches 66).
- Description: 120-158 characters, one plain sentence that answers or promises the answer; no keyword stuffing; unique.
- H1 matches the title's intent, not necessarily its words; exactly one per page.
- Years in titles (`Kira Artış Oranı Hesaplama 2026`) are a maintenance liability: update every January (see 4.5) or drop the year.
- Copy changes to existing pages (home title, hero text) need Erdem's sign-off; this guide proposes them, it does not make them.

### 3.3 Canonicals and the trailing-slash policy (decided 2026-11-13)

- Canonical, `og:url`, sitemap `<loc>`, JSON-LD `url`/`@id`/`item` and all internal links use the trailing-slash form, because the
  server 301-redirects `/x` to `/x/` (folder copies written by `harden-html.mjs`). Verified: `/blog`, `/cozumler`,
  `/kira-artis-hesaplama`, `/blog/aidat-kim-oder` all answer `301` to the slash form; `http://` and `www.` answer `301` to `https://anahtar.io/`.
- Every page is self-canonical. Never combine `noindex` with a canonical pointing elsewhere.
- Files and assets keep their extension (`/sitemap.xml`, `/blog/rss.xml`, `/favicon.ico`).
- Internal links must not rely on the redirect: write `href="/cozumler/"`, not `href="/cozumler"` (today the shared header/footer and post
  bodies use the non-slash form, one wasted 301 hop per click and per crawl, P1-6).
- Known duplicate reachability: `/index.html` and `/blog/<slug>.html` return 200. The canonical tag covers it; an optional 301 is in P3.

### 3.4 Robots and noindex

Current `app/public/robots.txt`: `Disallow: /uygulama`, `/admin`, `/belge`; `Allow: /`; one `Sitemap:` line. No AI-crawler rules.

Rules:

- robots.txt is not a deindexing tool. A blocked URL cannot show its `noindex`, and a blocked URL with external links can still be listed
  without a snippet. The authoritative signal is `<meta name="robots" content="noindex,nofollow"/>` in the page head.
- Policy: every non-public route in section 2 gets the meta tag. Keep the `Disallow` lines for `/uygulama`, `/admin`, `/belge` (never linked
  publicly, saves crawl); if one of them ever appears in GSC as "Indexed, though blocked by robots.txt", lift the `Disallow` temporarily so
  Google can see the `noindex`.
- Implementation spec (not done yet, P1-1): in `app/scripts/harden-html.mjs` add a route regex next to `API_PAGES`, for example
  `NOINDEX_PAGES = /^(giris|kayit|sifre|yeni-sifre|dogrula|katil|uygulama|admin|belge|satin-al|turnstile)(\/|$)/`, and emit the robots meta for
  matches (the existing `util` branch already does it for `/turnstile/`). Add a test in `tests/yayin-dosyalari.spec.mjs` that every route in
  the regex has the meta tag and that none of them is in `sitemap.xml`.
- Public pages carry `index,follow,max-image-preview:large` (blog and destek already do), `index,follow` (legal pages) or no robots meta (default). Never leave a staging
  `noindex` on a public page; none was found in the audit.
- Do not block `/_expo/` (JS), `/fonts/`, `/site.css` or images: crawlers need them to render.
- AI crawlers: see 5.4. The edge currently answers `429` to `GPTBot` and `403` to spoofed Googlebot/Bingbot user agents (section 9.1).

### 3.5 Sitemap

- `app/public/sitemap.xml` lists only canonical, indexable, 200, trailing-slash URLs. 27 URLs today.
- `lastmod` only where the content truly changed. Do not set it from `new Date()` at build time (`build.mjs` `sitemap()` does this for
  `/kira-artis-hesaplama/`, P1-7). Omit it rather than fake it. `changefreq` and `priority` are ignored by Google; do not add them.
- Remove from the sitemap: `/giris/`, `/kayit/` (P1-1). Keep `/hesap-silme/` (store and trust requirement).
- The sitemap is referenced in robots.txt and submitted in Search Console and Bing (section 7).
- Drift guard: one registry should feed routes, sitemap, `llms.txt` and tests (toolkit doc 20). Today the hand-kept head of the sitemap, `SEGMENTS`
  in `build.mjs` and `segments.ts` can diverge (P2-6).
- Size limits are irrelevant at this scale (50,000 URLs / 50 MB per file).

### 3.6 Structured data

| Where | Type | State | Rule |
| --- | --- | --- | --- |
| Home | `Organization` + `WebSite` (+ `SoftwareApplication` for the app) | **missing** | add with `legalName`, `url`, `logo`, `contactPoint` (info@anahtar.io), `sameAs` only for profiles that really exist (none found in the repo, so omit). `alternateName: "anahtar.io"` to separate the brand from the common noun |
| Blog index | `Blog` + `BreadcrumbList` | present | keep |
| Blog post | `BlogPosting` + `BreadcrumbList` (+ `FAQPage`) | present | `author` and `publisher` are the bare `ORG` object (name, url, logo). Add `legalName`; never invent a person author |
| `/destek/` | `FAQPage` | present | keep; the Q&A is visible |
| `/cozumler/<segment>/` | `BreadcrumbList` | missing | add via `harden-html.mjs` injection (Expo pages have no JSON-LD) |
| `/kira-artis-hesaplama/` | `WebApplication` (optional), `FAQPage` only if the FAQ is visible | missing | no `AggregateRating`/`Offer` unless backed by visible, real data |
| Legal pages | none | n/a | none needed |

Rules: JSON-LD must describe what is visible on the same page; `FAQPage` rich results are not a Google growth lever since 2026-05-07
(ledger doc 80), so keep visible Q&A for readers and AI retrieval, not for a SERP feature. Keep one `BreadcrumbList` per page. Escape `<`
when serializing (`JSON.stringify(x).replace(/</g, '\\u003c')`, P3). Validate that every JSON-LD block parses after each build (command in section 11).

### 3.7 Open Graph, Twitter cards, images

- Static pages (blog, destek) emit `og:site_name`, `og:type`, `og:title`, `og:description`, `og:url`, `og:image` (+ width/height 1200x630),
  `og:locale=tr_TR`, `twitter:card=summary_large_image` and the twitter title/description/image. Keep that complete set.
- Expo pages receive only `og:title`, `og:description`, `og:locale`: no `og:image`, `og:url`, `og:type`, `og:site_name` or `twitter:*`. Sharing
  the home page on WhatsApp or X shows no preview image (P1-4). Add a brand image under `app/public/og/` (1200x630 JPG, q85, brand wordmark, content in
  the centre 80%, stable filename without version suffix) and inject the full set in `harden-html.mjs`.
- Blog OG images live in `app/public/blog/og/<slug>.jpg`; regenerate with `node scripts/blog/og.mjs` after adding a post or changing an `h1`.
- Image alt: no `<img>` exists on audited pages (covers and logos are SVG/CSS with `aria-hidden`/`aria-label`). If real images are added:
  descriptive `alt` for content, `alt=""` for decoration, explicit `width`/`height`, WebP q80-85, longest edge <= 1920, `loading="lazy"` except the single LCP image.
- No fabricated screenshots: product mock-ups on the home page must show example data and be labelled as examples.

### 3.8 Rendering: what Expo/react-native-web puts in the HTML

Finding (section 9.2): Expo public pages are prerendered with real text, but built from `div` elements. There is no `<h1>`/`<h2>` and no `<a href>`
anywhere in their raw HTML (links are `div role="link"` driven by `router.push`). Consequences: no heading structure for crawlers or AI
retrievers, and the internal link graph from the home page and solution pages is invisible to non-rendering crawlers (they discover those
URLs only through the sitemap and the static blog pages).

Rule: on every indexable Expo page, the page title must render as `<h1>` and navigation, CTA and cross-links must render as `<a href>` with a
trailing-slash path. In react-native-web terms: headings with `role="heading"` and `aria-level`, links via expo-router `<Link href=...>` (or a
component that renders an anchor with `href`) instead of `Pressable onPress={() => router.push(...)}`. After the change, verify in the built HTML
with `grep -c '<h1' dist/cozumler/mulk-sahibi/index.html` and `grep -o '<a [^>]*href=' ...`, not in the browser.

### 3.9 Performance budget

Targets (mobile, field): LCP <= 2.5 s, CLS <= 0.1, INP <= 200 ms (toolkit doc 50). Measured: **nothing yet** (no CrUX, no Lighthouse run in
this audit); only lab-ish hints below.

- Static pages (blog, destek, legal): HTML 14-29 KB, one 3.9 KB CSS file, no page-level JS. Keep it that way: no frameworks, no third-party scripts.
- Expo marketing pages: raw HTML 57-258 KB (home is the largest), plus about 277 KB (`entry-*.js`) and 273 KB (`__common-*.js`) transferred with Brotli, immutable cache for one year.
  Budget: do not grow either bundle on marketing pages without a measurement; prefer lazy-loading anything below the fold.
- Fonts: self-hosted WOFF2 (about 19-20 KB each), two preloaded, `font-display: swap`. Every subset must keep Latin Extended-A (Ş ş Ğ ğ İ ı) and ₺ (U+20BA);
  glyph coverage was not verified in this audit.
- TTFB from one location was 0.23-0.43 s (single samples). HTML is `no-cache` (always revalidated), hashed assets are immutable.
- Measure before and after any performance change on a production build with mobile throttling; validate with PageSpeed/CrUX after Search Console is live (P2-5).

### 3.10 Internationalization stance

- The indexable site is Turkish only (`<html lang="tr">`, `og:locale=tr_TR`, `inLanguage: tr-TR`). English exists as a client-side toggle on the same
  URLs in the Expo app, and as an English section inside each legal page. Neither creates separate URLs, so there is **no hreflang** today and none must be added.
- Expo pages set `translate="no"` on `<html>` (prevents browser auto-translation breaking hydration). Static pages do not.
- If English pages are ever published (listed in `docs/yol-haritasi.md`), they need their own URLs, self-canonicals, reciprocal hreflang with `x-default`,
  and the Turkish brand/keyword choices are not simply translated (target English terms separately). Do not mix languages on one indexable URL beyond the legal-page English section.

### 3.11 Hosting, CDN and bots

anahtar.io is behind Hostinger's CDN (`server: hcdn`). Observed on 2026-11-13: browser UA `200`; `Mozilla/5.0 (compatible; Googlebot/2.1; ...)` and a spoofed
bingbot UA `403`; `GPTBot` `429` (4 of 4 requests); `ClaudeBot`, `PerplexityBot`, `OAI-SearchBot`, `ChatGPT-User`, plain `curl` `200`. A spoofed user agent from
a non-Google IP failing is expected and is **not proof that real Googlebot is blocked** (doc 80). It does mean we cannot confirm access without Search Console URL Inspection
and Bing Webmaster Tools (P0-2). Never write "Googlebot is blocked" from a curl result.

## 4. Content guidelines

### 4.1 Principles

- Helpful, original, specific to Turkish rent practice. Each post answers one question completely and shows a worked example with numbers.
- Content velocity is never the lever. The toolkit calls mass-produced pages "Mount AI": visibility rises, then collapses, and recovery is slow.
  Fix and consolidate what exists before adding pages. No page-per-keyword-variant, no city/district permutations, no self-published "en iyi X" listicles without a written risk note and sign-off.
- House floor (our rule, not Google's): body >= 600 words plus one worked example, table or checklist, unless the page is a pure definition or tool.
  The 8 current posts have 221-333 words of body. Whether that is enough is unmeasured; run a SERP-composition read for the head term first,
  then expand the posts that are within reach rather than adding new thin ones.

### 4.2 Blog post structure (template)

Fields in `posts.mjs`: `slug` (flat, ASCII, lowercase, hyphens), `title` (<= 50), `h1`, `description` (120-158), `category`, `keywords`, `date`, `updated`,
`summary`, `body` (HTML), `faq` (visible Q&A), `related` (3 slugs). Page layout, top to bottom:

1. H1 (one), `lead` paragraph, byline block: publisher line, "Yayın" and "Güncelleme" dates (real), reading time.
2. **Kısa cevap** box, 40-60 words, self-contained, names the subject in its first sentence, states the rule, the number and the date it applies
   (this does not exist yet: the current lead repeats the meta description; add a `short` field, P1-8).
3. Table of contents (generated), then H2 sections; use question-shaped H2s where natural ("Kira artışı hangi orana göre yapılır?").
4. A worked example with numbers (labelled "örnek"), a table where useful. Source and date next to every statistic and every legal threshold.
5. "Sık sorulanlar": 3-5 questions, each answer <= 60 words, visible text (the `FAQPage` JSON-LD is generated from the same array).
6. "Kaynaklar": links to the primary sources used (mevzuat.gov.tr, Resmî Gazete, TÜİK bulletin, GİB). Not yet implemented (P1-8).
7. Disclaimer (exists): general information, not legal or financial advice; check current sources.
8. Related posts (3) and one product CTA (section 4.6).

### 4.3 E-E-A-T and publisher identity

- Publisher is Devredin Bilgi Teknolojileri Yazılım ve Ticaret A.Ş., operator of anahtar. The company block exists in `destek.mjs` (`COMPANY`),
  `/destek/#sirket`, `/gizlilik/` and `/kosullar/`. Blog posts currently say nothing about it and the footer has no company line. Add a
  "Yayıncı: anahtar, Devredin A.Ş." line linking to `/destek/#sirket` and put `legalName` in the `Organization` JSON-LD (P1-3, P1-8).
- Authors: byline must be real. If no named subject-matter reviewer exists, the byline is the organization and the page links a short
  editorial policy ("Yayın ilkeleri": who writes, who reviews, how sources are cited, how corrections are made). Do not invent personas or credentials.
- Experience signals that are real and allowed: product screenshots with example data, the mechanics of how anahtar handles the rule (as the posts already do in the "anahtar'da" section),
  anonymized scenarios from support. Not allowed: invented customer stories, testimonials, counts ("10.000 mülk"), awards, ratings or app-store stars that do not exist.
- Trust pages must be easy to reach from every page: Gizlilik, Koşullar, Destek, company info, contact email.

### 4.4 Legal and tax accuracy (YMYL)

Posts about TÜFE rent increases, depozito, stopaj, beyanname, tahliye, emlak vergisi, KVKK and site management are "your money, your life" content.

- Primary sources only, cited by name and date in the post: TBK (rent increase TBK m.344, security deposit rules), Gelir Vergisi Kanunu (stopaj GVK m.94, rent income),
  Emlak Vergisi Kanunu, Kat Mülkiyeti Kanunu (aidat, genel kurul), 6698 sayılı KVKK and KVKK Kurumu decisions, TÜİK monthly CPI bulletin, GİB announcements, Resmî Gazete.
  Verify every article number against mevzuat.gov.tr when writing; do not copy it from another post or a competitor.
- Time-sensitive values (TÜFE 12-month average, gelir vergisi dilimleri, konut kira istisnası, beyan sınırı, damga vergisi, stopaj oranı) are stated with the date they apply.
  Tax parameters live in `app/src/domain/tax.js` (`RATES`, updated each January per `docs/yol-haritasi.md`); the posts and the calculator must agree with it.
- Never state "yasal üst sınır" or an official rate without a visible source. A calculator example must be labelled "örnek" and use round numbers.
- Never promise outcomes ("kesin kazanırsınız"), never give case-specific legal advice, never claim anahtar makes a user "KVKK uyumlu" or "yasal olarak güvende".
- Superseded rules must be mentioned as superseded with their end date (the 2022-2024 %25 konut kira artış sınırı ended in July 2024; the posts say so, keep it).
- Review: an agent may draft; a human (Erdem or a lawyer/mali müşavir he names) approves every post that states a legal threshold, tax rate or deadline. Record the reviewer
  and date in the PR description, and in the visible "Güncelleme" line when the review changes the content.
- Third-party statistics enter copy only with a source URL recorded when written. A competitor's snippet is not a source.

### 4.5 Update cadence

| Cadence | Task |
| --- | --- |
| Monthly (after the TÜİK CPI bulletin, normally published on the 3rd) | add the new 12-month-average TÜFE row to the rate table and calculator data; bump `dateModified`/`lastmod` of that page only |
| Every January | new year's tax brackets, konut kira istisnası and beyan sınırı (`tax.js` `RATES`), year in titles/headings (`Kira Artış Oranı Hesaplama 2027`), re-read every YMYL post |
| On change of law or practice (Resmî Gazete, TBK/GVK/KVKK change, relevant Yargıtay line) | update affected posts the same week; add a visible "Güncelleme: <date>, <what changed>" line |
| Quarterly | review all posts for dead links, stale numbers, price/plan mentions (`destek.mjs`, `PlanCard.tsx`), screenshots; change `updated` only if something changed |

`updated` and `lastmod` are never bumped to look fresh. Today all 8 posts share `updated: 2026-10-27` and the blog index `lastmod` follows the newest; that is acceptable
only if a real content review happened on that date; otherwise reset the dates to the real ones.

### 4.6 Internal linking

- Every link is a real `<a href>` with a trailing-slash path and descriptive anchor text. Do not link to `/giris/` from content; link to `/kayit/` for the sign-up CTA.
- Suggested hub-and-spoke map (state in `related` and in body links; today only one post links to the calculator and none links to a solution page):

| Post | Link to calculator / solution pages |
| --- | --- |
| `kira-artisi-nasil-hesaplanir` | `/kira-artis-hesaplama/`, `/cozumler/mulk-sahibi/`, `/cozumler/kiraci/` |
| `isyeri-kirasinda-stopaj` | `/cozumler/mulk-sahibi/`, `/cozumler/avm/`, `/cozumler/emlak-ofisi/` |
| `depozito-kurallari` | `/cozumler/kiraci/`, `/cozumler/mulk-sahibi/` |
| `kira-sozlesmesinde-dikkat-edilecekler` | `/cozumler/mulk-sahibi/`, `/kira-artis-hesaplama/` |
| `kira-odemesi-banka-dekont` | `/cozumler/kiraci/`, `/cozumler/mulk-sahibi/` |
| `aidat-kim-oder` | `/cozumler/site-yonetimi/` |
| `kiraci-tahliyesi` | `/cozumler/mulk-sahibi/` |
| `kira-geliri-beyannamesi` | `/cozumler/mulk-sahibi/`, `/blog/isyeri-kirasinda-stopaj/` |

- Each `/cozumler/<segment>/` page links 2-3 relevant posts; the calculator links the rent-increase post and the other way round. Home links `/blog/`, `/cozumler/`, `/kira-artis-hesaplama/` as anchors.
- Orphans are bugs: every sitemap URL must be reachable through real anchors from the home page within three clicks.

### 4.7 No fake proof

No invented reviews, ratings, case studies, user counts, awards, "as seen in" logos, benchmark numbers or ranking claims. No `AggregateRating`/`Review` markup without real, visible,
verifiable reviews on the same page. Mock phone screens on the home page contain example data; keep them clearly illustrative. Pricing shown anywhere must equal the source of truth
(`destek.mjs` help answers, `app/src/site/PlanCard.tsx`, store listings); when a price changes, update every page and `llms.txt` the same day.

## 5. GEO and AI-search guidelines

### 5.1 Principle

GEO is not a separate layer. Google AI Overviews and AI Mode use the same index, ranking and snippet eligibility as classic search; about 97% of AI Overview citations in the toolkit's
sample came from organic top-20 results, so rank first, then get cited. What helps beyond SEO: answer-first passages, entity clarity, citable data with dates and sources, and being
corroborated elsewhere on the web. What does not: AI-only markup, hidden text, fragmenting pages "for AI", page-per-fan-out-query factories, fabricated statistics.

### 5.2 Entity facts (use one wording everywhere)

| Fact | Canonical wording | Source of truth |
| --- | --- | --- |
| Brand | `anahtar` (lowercase); domain `anahtar.io`; in prose where ambiguity is possible: "anahtar kira yönetimi uygulaması" | this file |
| What it is | Kiracı ile mülk sahibinin kira, ödeme/dekont, depozito, arıza talebi, sözleşme ve belge takibini tek yerde yaptığı kira yönetimi uygulaması (iOS, Android, web) | `titles.json` home description |
| For whom | mülk sahipleri (1-9 mülk), kiracılar (ücretsiz), site/bina yönetimleri, emlak ofisleri, AVM, GYO, depo, aile ofisi | `/cozumler/` |
| Operator and publisher | DEVREDİN BİLGİ TEKNOLOJİLERİ YAZILIM VE TİCARET ANONİM ŞİRKETİ, Beyoğlu/İstanbul | `destek.mjs` `COMPANY` |
| Contact | info@anahtar.io | `destek.mjs` |
| Pricing | per property per month, KDV dahil, 1 ay ücretsiz deneme for landlords, tenants free | `destek.mjs` (Paketler), `PlanCard.tsx`; never hard-code elsewhere |
| Languages | Türkçe, English (in the app) | app |

The brand is a common noun ("anahtar" = key). Brand-name matching in AI answers will therefore be noisy: use disambiguated aliases (`anahtar.io`, `anahtar kira yönetimi`,
`anahtar uygulaması`) in prose, in `Organization.alternateName`, and in the GEO prompt tracker.

### 5.3 Writing for retrieval

- Answer-first: the first 40-60 words of every content page answer the question and name the subject. About 44% of LLM citations come from the first 30% of a page.
- Passages must be self-contained, entity-explicit ("TBK m.344 kapsamında konut kirasında..."), declarative, dense and evidenced (number + unit + date + source).
- Question-shaped H2/H3 and a visible Q&A block with <= 60-word answers. Keep `FAQPage` JSON-LD only as a mirror of that visible text.
- Prefer tables for rate and threshold data. Use clean semantic HTML (`<table>`, `<ol>`, `<time datetime>`), no content hidden in tabs that need JS.

### 5.4 Crawler access and `llms.txt`

- Today robots.txt says nothing about AI crawlers (default allow), but the edge answers `GPTBot` with `429`. Nobody chose that policy (compare the toolkit's actualoptik case:
  an unchosen block voids GEO conclusions). Decision for Erdem (P0-2): allow or block training crawlers; write the decision explicitly in robots.txt.
  Recommendation: allow search/citation agents (`OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `Perplexity-User`, `Googlebot`, `Bingbot`, `Claude-SearchBot`, `Claude-User`) and treat
  training agents (`GPTBot`, `ClaudeBot`, `CCBot`) as a business choice; blocking training-only agents is defensible, blocking search/citation agents is not. `Google-Extended` is flagged as citation-critical for Gemini in the toolkit ledger (doc 80), so
  do not disallow it casually. Vendor user-agent names change: confirm them in each vendor's current crawler documentation before writing rules.
- `/llms.txt` returns 404 today. Shipping it is hygiene for entity parity and agent discoverability, not traffic and not a Google ranking factor (per the toolkit, about 97% of llms.txt files get zero AI-bot
  requests). Never ship it instead of on-page work. If added (P2-1), generate it in `build.mjs` from `POSTS` and the segment list so it cannot drift, serve `text/plain`, and use this shape:

```
# anahtar
> anahtar, kiracı ile mülk sahibinin kira, dekont, depozito, talep ve sözleşme takibini tek yerde yaptığı kira yönetimi uygulamasıdır (iOS, Android, web). Yayıncı: Devredin A.Ş.

## Çözümler
- [Mülk sahibi için kira takibi](https://anahtar.io/cozumler/mulk-sahibi/): 1-9 mülkün kirası, dekontu ve sözleşme tarihleri
- [Site yönetimi](https://anahtar.io/cozumler/site-yonetimi/): aidat, talep ve iletişim

## Araçlar ve rehberler
- [Kira artış oranı hesaplama](https://anahtar.io/kira-artis-hesaplama/): TÜİK 12 aylık ortalama TÜFE ile yasal üst sınır
- [Blog](https://anahtar.io/blog/): kira hukuku, vergi ve ödeme rehberleri

## Kurumsal
- [Destek merkezi ve şirket bilgileri](https://anahtar.io/destek/)
- [Gizlilik ve KVKK](https://anahtar.io/gizlilik/)
```

### 5.5 Citation-worthy data pages

The strongest candidate is the **TÜFE-based rent increase table** on `/kira-artis-hesaplama/`: month, TÜİK 12-month-average CPI change, resulting maximum increase, link to the TÜİK bulletin, "son kontrol" date.
Rules: one URL for the intent (do not create `/kira-artis-orani-2026/` next to it: same intent, cannibalization; no per-month or per-city URLs, use anchored sections);
the table is in the raw HTML (not fetched client-side); each row has a source and a date; only published TÜİK values, never forecasts; update monthly (4.5).
Today the page ships the placeholder "Oran tablosu yakında burada" and the note "Ekim 2026 verisi henüz sistemde yok", and `app/public/data/tufe.json` is empty (live rates come from
Supabase `public.cpi_rates`), so the page has no citable data yet (P1-5). Other citable assets worth building later, only with real data: a downloadable rent-tracking checklist, a
giriş/çıkış tutanağı template, a yearly "kira geliri beyanı: ne zaman, kim verir" table.

### 5.6 Corroboration and monitoring

- Cross-source consensus matters: consistent brand facts on the App Store and Google Play listings, a LinkedIn company page, Devredin's own site, and honest mentions in relevant Turkish
  communities. Keep name, description and URL identical everywhere. Do not buy links, do not fake profiles. Listing in third-party directories beats self-published "best of" lists.
- Own comparison content is allowed and lower-risk than listicles (for example "Excel ile kira takibi mi, uygulama mı?"), but only with real feature comparison, no competitor bashing and an honest
  statement of where the alternative wins. Research the competitor set with `seo competitors` first; do not name competitors from memory.
- Monitoring (toolkit doc 40): register anahtar as a project in the SEO hub (P2-7), build a Turkish prompt set tagged by shape (commercial: "mülk sahipleri için en iyi kira takip uygulaması", category:
  "kira takip programı nedir", informational: "kira artış oranı nasıl hesaplanır", "depozito en fazla kaç kira", "aidat kiracıya mı ev sahibine mi ait", "kira geliri beyannamesi kim verir"), then run
  `seo geo anahtar --runs 5` or more with `--prompts-only` for the cost estimate first. Keep retrieval modes separate: Perplexity (live retrieval and citations) versus plain models (trained recall). Never average them.
  One run per prompt and model is an anecdote; report mention rate with sample size. A 0% share of voice on a new, small domain is directional, not proof; anchor conclusions in GSC.
- Check the AI crawler policy before reading any GEO number (5.4): a blocked crawler makes the measurement meaningless.

## 6. Measurement

| Source | Status | Use |
| --- | --- | --- |
| Google Search Console | **not verified** (no access, 2026-11-13) | ground truth for impressions, clicks, indexing, canonical selection |
| Bing Webmaster Tools | **not verified** | Bing index, sitemap, IndexNow; the Bing index is reportedly used by several AI assistants |
| Analytics | **none by design** | see below |
| Hostinger access logs (hPanel) | available, not reviewed | crawler activity (Googlebot, bingbot, AI bots) without any client-side tracking |
| Supabase | available | weekly sign-up counts per role as the business proxy |
| `seo` hub (`seo gsc`, `seo audit`, `seo geo`, `seo perf`) | anahtar not registered | repeatable audits and diffs once GSC exists |

Analytics stance: the privacy page states that anahtar uses no analytics, advertising or tracking cookies and needs no cookie banner (`/gizlilik/` section "Çerezler"), and `docs/magaza.md`
records "Takip ve reklam: Yok". Therefore: do not add any analytics tag, pixel, session recorder or consent-less third-party script. Default measurement is Search Console plus Bing plus server logs plus
Supabase sign-up counts. If Erdem wants visitor analytics, the decision needs: a cookieless, privacy-friendly tool (self-hosted Umami or Plausible class), an updated KVKK aydınlatma text, a check of
store privacy labels, and a CSP change in `harden-html.mjs`. Do not remove or add tracking to fix a metric.

Rules from the toolkit:

- GSC decides. Use query/page/query-page views, never site-average position. Prefer clicks over impressions when comparing across the 2025-05-13 to 2026-04-27 impression anomaly window.
- Segment by host (`www` still redirects to apex; a domain property spans both) and by page family (blog, solutions, tool, legal).
- Write the gates before shipping: **+14d** indexing (URL Inspection on every new URL, target >= 80% indexed), **+30d** impressions on every cluster, **+90d** positions and AI citations.
  Young-page rank churn is normal; do not refactor before the gate matures; print the gate date next to any young-page number.
- Seasonality: rent-increase interest peaks around lease anniversaries and after the monthly TÜİK release; tax content peaks before beyanname season (March). Judge a cluster on its peak, not its trough.
- Re-run the raw-HTML audit (section 11) after every release that touches `harden-html.mjs`, `build.mjs`, `titles.json`, `.htaccess` or robots/sitemap.

## 7. Owner actions: Search Console and Bing Webmaster (do first)

DNS for anahtar.io is at Hostinger (`NS apollo.dns-parking.com`, `athena.dns-parking.com`); the only TXT record today is SPF (`v=spf1 include:_spf.mail.hostinger.com ~all`). Nothing is verified for Google or Bing yet.

1. Sign in to <https://search.google.com/search-console> with the company Google account that should own the site (not a personal account). Choose **Add property -> Domain** and enter `anahtar.io`.
2. Copy the TXT value Google shows (`google-site-verification=...`).
3. hPanel -> **Domains** -> `anahtar.io` -> **DNS / Nameservers** -> **DNS records** -> add record: Type `TXT`, Name `@`, TXT value = the copied string, default TTL.
   Add it as a second TXT record; do not edit or remove the SPF record.
4. Back in Search Console press **Verify** (usually minutes, up to 24-48 h). Keep the TXT record forever.
5. Settings -> Users and permissions: add Erdem's account as Owner and the SEO-hub service account (read-only is enough; Owner is only needed for the Indexing API, which must not be used for normal pages).
6. Sitemaps -> submit `https://anahtar.io/sitemap.xml`.
7. URL Inspection -> **Test live URL** for `/`, `/blog/`, `/blog/kira-artisi-nasil-hesaplanir/`, `/cozumler/mulk-sahibi/`, `/kira-artis-hesaplama/`. Confirm: crawl allowed, page fetch successful, Google-selected
   canonical equals the trailing-slash URL. This also settles the edge-bot question (P0-2). Do not use "Request indexing" in bulk; a handful of key URLs is fine.
8. <https://www.bing.com/webmasters> -> sign in -> **Import from Google Search Console** (fastest after step 4), or add the site and verify with the DNS CNAME Bing provides. Submit the same sitemap.
   Optional: IndexNow key file as a static file under `app/public/` (P2-11).
9. Record the baseline (indexed count, first impressions) in the agent-brain todo/diary and set the +14d/+30d/+90d checks. Existing checklists that mention this step: `docs/canliya-alma.md` (line 70), `docs/yol-haritasi.md` (line 126).

## 8. Checklist for every new page or blog post

Before opening the PR (raw-HTML checks run against the built output or the live URL after deploy; never submit forms or start any payment flow while testing):

- [ ] Intent: one primary keyword, demand evidence named (GSC or keyword tool, with date), SERP composition read, no existing page already owns the intent.
- [ ] URL: flat, ASCII, lowercase, hyphenated, trailing slash; not a combined-entity URL.
- [ ] `<title>` <= 60 chars incl. brand suffix, unique; description 120-158 chars, unique; exactly one `<h1>`; heading order h1 > h2 > h3.
- [ ] Self-canonical with trailing slash; `og:url` identical; no `noindex` on a public page; robots meta correct for private routes.
- [ ] Listed in `sitemap.xml` with a truthful `lastmod` (or none); not listed if noindex.
- [ ] OG/Twitter complete: `og:title/description/url/type/site_name/image(1200x630)`, `twitter:card` and friends; OG image generated and committed.
- [ ] JSON-LD valid and mirrors visible content (`BlogPosting`/`BreadcrumbList`/`FAQPage` as applicable); publisher identity complete; no fake rating/review/price.
- [ ] Kısa cevap (40-60 words) at the top; question-shaped H2s where natural; worked example; FAQ 3-5 visible Q&A; "Kaynaklar" with primary sources and dates.
- [ ] Legal/tax statements verified against primary sources, dated, reviewed by a human; superseded rules marked; disclaimer present; no unsupported claims ("KVKK uyumlu", "garanti").
- [ ] Internal links: real `<a href>` with trailing slashes; links to the calculator and the right `/cozumler/<segment>/`; 3 related posts; the page is linked from at least two indexable pages.
- [ ] CTA to `/kayit/` (or the segment page); no link to `/giris/` from content.
- [ ] Images: `alt`, dimensions, WebP, lazy-loaded except the LCP image; no stock-photo claims of customers.
- [ ] Performance: no new third-party scripts, no JS added to static pages; Expo bundle not grown without a measurement.
- [ ] Prices, plan names, company facts equal their source of truth (`destek.mjs`, `PlanCard.tsx`, `COMPANY`).
- [ ] Regenerated outputs committed with sources (`node scripts/blog/build.mjs`, `node scripts/blog/og.mjs`); relevant tests updated and run one file at a time.
- [ ] `curl` the deployed URL: status 200, canonical, title, one `<h1>`, JSON-LD parses, sitemap contains it, non-slash URL 301s to it.
- [ ] Search Console: URL Inspection after deploy; gates (+14d/+30d/+90d) written in the PR description.
- [ ] Mentioned in `llms.txt` (once it exists) and, if it is a core page, in the GEO prompt-to-page map.

## 9. Audit snapshot (2026-11-13)

### 9.1 Method and limits

Fetched with `curl` (desktop Chrome UA), a few dozen read-only GET/HEAD requests, no forms, no payments, DNS lookups with `dig`. Layer: raw HTML. Not covered: rendered DOM, Search Console, CrUX/Lighthouse, backlinks, SERPs, real-bot behaviour.
Bot UA tests: Googlebot-UA `403` on every URL tried; bingbot-UA `403`; `GPTBot` `429` x4; `ClaudeBot`, `PerplexityBot`, `OAI-SearchBot`, `ChatGPT-User`, `Google-Extended` string, `curl/8.4.0` all `200`.
Live `sitemap.xml` has the same 27 `<loc>` entries as the repo file; live robots.txt equals the repo file. All 23 canonicals checked are self-referencing with a trailing slash. No stray `noindex` and no
`X-Robots-Tag` on any public response. HTTP `http://` and `www.` redirect to `https://anahtar.io/` in one step.

### 9.2 Per page (raw HTML)

| URL | Title (chars) | Description (chars) | Robots meta | OG image / Twitter | H1 | JSON-LD | `<a href>` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | `anahtar \| Kira işinin anahtarı` (30) | 92, shared default | none | no / no | **0** | none | **0** (22 `role="link"`) |
| `/cozumler/` | 64 (too long) | 131 | none | no / no | **0** | none | **0** |
| `/cozumler/mulk-sahibi/` | 38 | 108 | none | no / no | **0** | none | **0** |
| `/cozumler/kiraci/` | 45 | 98 | none | no / no | **0** | none | **0** |
| `/cozumler/avm/` | 54 | 79 | none | no / no | 0 | none | 0 |
| `/kira-artis-hesaplama/` | 59 | 157 | none | no / no | **0** | none | **0** |
| `/kurumsal/` | 61 (too long) | 144 | none | no / no | 0 | none | 0 |
| `/blog/` | 60 | 134 | `index,follow,max-image-preview:large` | yes / yes | 1 | Blog, BreadcrumbList | 28 |
| `/blog/kira-artisi-nasil-hesaplanir/` | 54 | 129 | same | yes / yes | 1 (9 h2) | BlogPosting, BreadcrumbList, FAQPage | 41 |
| `/destek/` | 24 | 135 | same | yes (blog.jpg) / yes | 1 | FAQPage | 34 |
| `/gizlilik/` | 54 | **187** | `index,follow` | **no / no** | 1 | none | 16 |
| `/kosullar/` | 49 | 158 | `index,follow` | no / no | 1 | none | 17 |
| `/hesap-silme/` | 51 | **198** | `index,follow` | no / no | 1 | none | 13 |
| `/giris/`, `/kayit/`, `/sifre/`, `/katil/`, `/dogrula/`, `/yeni-sifre/`, `/satin-al/`, `/admin/`, `/uygulama/`, `/belge/` | 7-28 | shared default | **none (indexable)** | no / no | 0 | none | 0 |
| `/turnstile/` | 28 | none | `noindex,nofollow` | no | n/a | none | n/a |

### 9.3 Other findings

- `sitemap.xml`: 27 URLs, all trailing-slash, no duplicates, no redirects. It includes `/giris/` and `/kayit/`. `lastmod` exists only for the calculator (`2026-10-29`), `/blog/` and the 8 posts (all `2026-10-27`); the
  calculator's value is produced by `new Date()` in `build.mjs`.
- `robots.txt`: three `Disallow` lines (`/uygulama`, `/admin`, `/belge`), `Allow: /`, sitemap line. No AI-crawler rules. No `llms.txt`, `ai.txt` or `humans.txt` (404).
- Structured data: no `Organization`/`WebSite`/`SoftwareApplication` anywhere; `BlogPosting` author and publisher are `{name: "anahtar", url, logo}` only. `FAQPage` is present on posts and `/destek/` (visible Q&A, OK).
- Blog posts: 8, body 221-333 words each, 3-4 FAQs, 3 related. Only `kira-artisi-nasil-hesaplanir` links to the calculator; no post body links to a `/cozumler/` page; the blog does not mention the publisher company.
  Static pages' header/footer/cards link to `/cozumler`, `/giris`, `/kayit`, `/kira-artis-hesaplama`, `/blog/<slug>` without trailing slash (each a 301 hop).
- Calculator page prerendered text contains "Ekim 2026 verisi henüz sistemde yok", "Oran tablosu yakında burada" and an example result "₺33.363 / %33,45 (yasal üst sınır)" under "Örnek hesap"; the source of that example rate is unverified.
- Home prerendered HTML is 258 KB; solution pages 124-130 KB; visible text exists (about 5,400 characters on the home page) but it is a div soup without headings or anchors.
- Images: no `<img>` tags on any audited page. Favicon, apple-touch-icon, manifest present. `/blog/og/*.jpg` 200 (about 37 KB each).
- Performance hints: two Brotli JS bundles of about 277 KB and 273 KB on every Expo page, immutable; HTML `no-cache`; WOFF2 fonts preloaded; TTFB 0.23-0.43 s from one location.
- Internationalization: `lang="tr"` everywhere, no hreflang (correct while English has no URLs), `lang="en"` blocks inside legal pages.
- No analytics scripts or third-party requests on static pages (CSP `default-src 'self'`; Supabase and Cloudflare Turnstile only where configured).

## 10. Prioritized backlog

Severity follows toolkit doc 10: P0 blocks crawling, indexing or measurement or breaks a policy; P1 strongly damages eligibility, understanding or trust; P2 limits appearance or discovery; P3 polish.
"Owner" = needs Erdem; "agent" = code change by PR. Each code item names the files and an acceptance check on raw HTML.

### P0

| ID | Item | Evidence | Files / system | Owner | Done when |
| --- | --- | --- | --- | --- | --- |
| P0-1 | Verify Google Search Console (Domain property via DNS TXT) and Bing Webmaster; submit the sitemap | no `google-site-verification` TXT in DNS; Search Console showed no access | hPanel DNS, GSC, Bing (section 7) | Erdem | property verified, sitemap shows "Success", baseline recorded |
| P0-2 | Prove real Googlebot, Bingbot and the AI search agents get 200 from the Hostinger edge, and decide the `GPTBot` policy explicitly | spoofed Googlebot/bingbot UA `403`, `GPTBot` `429` x4, others `200` (9.1) | GSC URL Inspection live test, Bing URL Inspection, hPanel security/bot settings; `app/public/robots.txt` if a policy is written | Erdem, then agent | URL Inspection says "Page fetch: Successful" for 5 key URLs; policy written in robots.txt |

### P1

| ID | Item | Evidence | Files | Done when |
| --- | --- | --- | --- | --- |
| P1-1 | `noindex,nofollow` on all private/utility routes; remove `/giris/` and `/kayit/` from the sitemap | 10 routes indexable with no robots meta; sitemap lists `/giris/`, `/kayit/` | `app/scripts/harden-html.mjs` (route regex + meta), `app/public/sitemap.xml`, `app/scripts/blog/build.mjs` (`sitemap()` keep-filter), tests `yayin-dosyalari.spec.mjs`, `yasal-sayfalar.spec.mjs` | built HTML of each route contains `name="robots" content="noindex,nofollow"`; sitemap has none of them |
| P1-2 | Semantic `<h1>` and real `<a href>` links on every public Expo page | h1 count 0 and `<a href>` count 0 on `/`, `/cozumler/*`, `/kira-artis-hesaplama/`, `/kurumsal/` | `app/src/site/Landing.tsx`, `SitePage.tsx`, `Navbar.tsx`, `SegmentParts.tsx`, `app/src/app/kira-artis-hesaplama.tsx`, `kurumsal.tsx`, `cozumler/*` | `grep -c '<h1'` is 1 and nav/CTA anchors exist in `dist/**/index.html` |
| P1-3 | Entity schema: `Organization` (+ `legalName`, `contactPoint`, `alternateName`) and `WebSite` (+ `SoftwareApplication`) on the home page; complete `ORG` in blog JSON-LD | none on home; `ORG` has no `legalName` | `app/scripts/harden-html.mjs` (inject JSON-LD for key `''`), `app/scripts/blog/build.mjs` (`ORG`), `destek.mjs` `COMPANY` | JSON-LD parses, mirrors visible company data |
| P1-4 | Social metadata on Expo public pages (`og:image`, `og:url`, `og:type`, `og:site_name`, `twitter:*`) plus a brand OG image | all Expo pages lack them | `app/scripts/harden-html.mjs`, new `app/public/og/anahtar.jpg` (extend `scripts/blog/og.mjs`), `titles.json` | link preview shows image and title on WhatsApp/X/LinkedIn debuggers |
| P1-5 | Make the calculator page a citable data page: sourced TÜFE table in the raw HTML, remove placeholders, verify the baked example | "Oran tablosu yakında burada", "Ekim 2026 verisi henüz sistemde yok", empty `tufe.json`, unverified `%33,45` example | `app/src/app/kira-artis-hesaplama.tsx`, `app/public/data/tufe.json` or build-time read of `public.cpi_rates` | table with month, TÜİK value, max increase, source link and check date is present in `dist/kira-artis-hesaplama/index.html` |
| P1-6 | Internal link graph and slash-consistent hrefs | posts do not link to `/cozumler/*`; header/footer/cards use non-slash hrefs | `app/scripts/blog/posts.mjs` (body links, `related`), `build.mjs` (`bar()`, `foot()`, `card()`, `rss()`), Expo nav | links per 4.6 table exist; no internal href to a slash-form page lacks the slash |
| P1-7 | Truthful sitemap `lastmod` | calculator `lastmod` comes from `new Date()` at build time | `app/scripts/blog/build.mjs` `sitemap()` | `lastmod` derived from a content-change date, or omitted |
| P1-8 | Post template: Kısa cevap box, "Kaynaklar", publisher line and editorial-policy link, real review/update dates | lead repeats meta description; no sources, no publisher mention; all `updated` equal `2026-10-27` | `posts.mjs` (new `short`, `sources` fields), `build.mjs` `article()` | each post has a 40-60 word answer, 2+ primary sources, publisher line |

### P2

| ID | Item | Evidence / reason | Files |
| --- | --- | --- | --- |
| P2-1 | Generate `/llms.txt` from `POSTS` and segments (hygiene, not a lever) | 404 today | `app/scripts/blog/build.mjs`, `app/public/llms.txt` |
| P2-2 | Home title/description carry the theme ("kira takibi", "kira yönetimi"); needs Erdem's copy approval | title `anahtar \| Kira işinin anahtarı` has no category term | `app/src/site/titles.json` (`""`) |
| P2-3 | Legal pages: description <= 158 chars, add OG/Twitter, align title separator (`·` vs `\|`) | 187 and 198-char descriptions, no OG | `app/public/{gizlilik,hesap-silme,kosullar}/index.html`; keep `tests/yasal-sayfalar.spec.mjs` green |
| P2-4 | Shorten over-long titles | `/cozumler/` 64, `/kurumsal/` 61, post `kira-geliri-beyannamesi` 66 incl. brand | `titles.json`, `posts.mjs` |
| P2-5 | Measure Core Web Vitals (Lighthouse mobile now, CrUX after GSC) for `/`, a solution page, the calculator and a post; set a JS budget for Expo marketing pages | about 550 KB Brotli JS per Expo page, no measurement | n/a, then `app/` build config |
| P2-6 | SEO build guard: static assertions that sitemap equals the indexable route set, one h1, self-canonical with slash, noindex set, OG present, JSON-LD parses, `SEGMENTS` equals `segments.ts` | drift risk between sitemap, generator and routes | extend `tests/yayin-dosyalari.spec.mjs` (keep the verbatim generator assertion in `yasal-sayfalar.spec.mjs` in sync) |
| P2-7 | Register anahtar in the SEO hub and create the Turkish GEO prompt set and baseline | not a configured project | `seo/projects/` in the DevirVentures SEO toolkit |
| P2-8 | Analytics and consent decision (KVKK text, store privacy labels, CSP) | no analytics by design | Erdem; `harden-html.mjs` CSP if approved |
| P2-9 | `/satin-al/`: noindex now, or ship a real public pricing page (`/fiyatlar/`) that is indexable | purchase flow with generic "Paketini seç" title | `titles.json`, new route |
| P2-10 | Content depth review of the 8 posts and new guides (giriş/çıkış tutanağı, emlak vergisi, aidat takibi) after the SERP read and GSC data | body 221-333 words; demand unmeasured | `posts.mjs` |
| P2-11 | IndexNow key file for Bing and others (optional) | no key | `app/public/<key>.txt` |

### P3

- Make `head()` in `build.mjs` emit trailing-slash `canonical`/`og:url` directly (today the committed `public/blog/*.html` have non-slash values and `harden-html.mjs` rewrites them at build; harmless but a trap when reading the source).
- RSS: trailing-slash `<link>`/`<guid>`, `isPermaLink="true"`, add `lastBuildDate`.
- Optional 301 for `/index.html` and `/blog/<slug>.html` duplicates in `.htaccess` (canonical already covers them).
- Escape `<` in serialized JSON-LD; drop `changefreq` from the calculator sitemap line.
- English static pages (listed in `docs/yol-haritasi.md`): separate URLs, self-canonicals, reciprocal hreflang.

## 11. Re-audit commands (read-only)

Use a desktop-browser UA; spoofed Googlebot/Bingbot UAs are rejected by the edge and prove nothing.

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36"
curl -sS -A "$UA" https://anahtar.io/robots.txt
# per sitemap URL: status, canonical, h1 count, anchor count, robots meta
curl -sS -A "$UA" https://anahtar.io/sitemap.xml | grep -o '<loc>[^<]*' | sed 's/<loc>//' | while read -r u; do
  h=$(curl -sS -A "$UA" -o - -w '\n%{http_code}' "$u"); code=${h##*$'\n'}
  echo "$code $u canon=$(echo "$h" | grep -o '<link rel="canonical" href="[^"]*"' | head -1) h1=$(echo "$h" | grep -o '<h1' | wc -l | tr -d ' ') a=$(echo "$h" | grep -o '<a [^>]*href=' | wc -l | tr -d ' ') robots=$(echo "$h" | grep -o '<meta name="robots" content="[^"]*"' | head -1)"
done
# redirects and slash policy
curl -sSI -A "$UA" https://anahtar.io/blog | head -3        # expect 301 -> https://anahtar.io/blog/
curl -sSI -A "$UA" https://www.anahtar.io/ | head -3         # expect 301 -> https://anahtar.io/
# private routes must carry noindex
for p in giris kayit sifre yeni-sifre dogrula katil uygulama admin belge satin-al; do
  echo "$p: $(curl -sS -A "$UA" https://anahtar.io/$p/ | grep -o '<meta name="robots" content="[^"]*"' | head -1)"
done
# JSON-LD must parse
curl -sS -A "$UA" https://anahtar.io/blog/depozito-kurallari/ | grep -o '<script type="application/ld+json">[^<]*' | sed 's/<script type="application\/ld+json">//' | while read -r j; do echo "$j" | python3 -c "import sys,json; json.load(sys.stdin); print('ok')"; done
```

Hub tools once the property exists (the DevirVentures SEO toolkit (`devirventures/seo/` in Erdem's workspace), see `SKILL.md`): `seo audit https://anahtar.io/` (raw-HTML audit), `seo gsc anahtar performance|inspect|coverage`,
`seo perf https://anahtar.io/ psi|crux`, `seo geo anahtar --runs 5 --prompts-only` first for cost, then the real run, and `seo diff anahtar` before recommending anything.
