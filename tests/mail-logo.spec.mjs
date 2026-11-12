// E-postalarda anahtar logosu: şablonlar logoyu (img + alt) kullanır; logo dosyaları (şeffaf zeminli, koyu yazılı) yayında durur;
// Supabase giriş e-postası şablonları (kayıt onayı, şifre sıfırlama…) logoyu ve Supabase değişkenlerini içerir.
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { renderWelcome } from '../supabase/functions/welcome/template.ts';
import { renderInvite as renderTenantInvite } from '../supabase/functions/invite-mail/template.ts';
import { renderInvite as renderSiteInvite } from '../supabase/functions/site-invite/template.ts';
import { renderNotice } from '../supabase/functions/push/template.ts';

const BASE = 'https://anahtar.io/mail/anahtar-logo-mail-';
const LOGO = BASE + 'koyu.png';        // koyu zeminli logo: koyu başlık bantlarında
const root = (p) => new URL('../' + p, import.meta.url).pathname;
const img = new RegExp(`<img src="${LOGO.replace(/[.]/g, '\\.')}"[^>]*alt="anahtar"`);

test('hoş geldin, kiracı daveti, site daveti ve bildirim e-postaları logoyu görsel olarak kullanır', () => {
  expect(renderWelcome({ kind: 'tenant', appUrl: 'https://anahtar.io' }).html).toMatch(img);
  expect(renderWelcome({ kind: 'bes', appUrl: 'https://anahtar.io' }).html).toMatch(img);
  expect(renderTenantInvite({ code: 'AB12CD34', appUrl: 'https://anahtar.io' }).html).toMatch(img);
  expect(renderSiteInvite({ name: 'Ayşe', role: 'malik', org: 'Dalyan Sitesi', unit: 'A3', code: 'S1A2B3C4', sector: 'site', appUrl: 'https://anahtar.io' }).html).toMatch(img);
  const n = renderNotice({ title: 'Mehmet', body: 'Merhaba', link: 'https://anahtar.io/uygulama/mesajlar' });
  expect(n.html).toMatch(img);
  expect(n.html).toContain('href="https://anahtar.io/uygulama/mesajlar"');
  expect(n.text).toContain('Merhaba');
});

test('rapor ve talep e-postaları da logoyu kullanır (şablon kaynağı)', () => {
  for (const f of ['report/template.ts', 'report/site-template.ts']) {
    const src = readFileSync(root('supabase/functions/' + f), 'utf8');
    expect(src).toContain('<img src="${LOGO_URL}"');
    expect(src).toContain(`const LOGO_URL = '${LOGO}'`);                      // koyu başlıkta koyu zeminli logo
    expect(src).not.toContain('bgcolor="#C8302E"');
  }
  expect(readFileSync(root('supabase/functions/lead-mail/index.ts'), 'utf8')).toContain(`<img src="${LOGO}"`);
});

test('logo dosyaları: beş sürüm depoda; boyutlar, zemin türü ve başka sitelerden yüklenebilirlik', () => {
  const png = (p) => readFileSync(root(p));
  const dims = (b) => [b.readUInt32BE(16), b.readUInt32BE(20)];
  const kind = (b) => b[25];                                                  // PNG renk türü: 2 = RGB (opak zeminli), 6 = RGBA (şeffaf)
  const set = { 'kirmizi-zemin': 2, 'koyu-zemin': 2, 'krem-zemin': 2, 'seffaf-koyu': 6, 'seffaf-beyaz': 6 };
  for (const [n, t] of Object.entries(set)) {
    const b = png(`app/public/marka/anahtar-logo-${n}.png`);
    expect(dims(b), n).toEqual([2000, 366]);
    expect(kind(b), n).toBe(t);
  }
  const mail = { kirmizi: 2, koyu: 2, krem: 2, 'seffaf-koyu': 6, 'seffaf-beyaz': 6 };
  for (const [n, t] of Object.entries(mail)) {
    const b = png(`app/public/mail/anahtar-logo-mail-${n}.png`);
    expect(dims(b), n).toEqual([480, 88]);
    expect(kind(b), n).toBe(t);
  }
  expect(dims(png('app/public/mail/anahtar-ikon-mail.png'))).toEqual([192, 192]);
  expect(dims(png('app/public/marka/anahtar-ikon.png'))).toEqual([1024, 1024]);
  expect(readFileSync(root('app/public/.htaccess'), 'utf8')).toMatch(/anahtar-\(logo\|ikon\)-mail[\s\S]*Cross-Origin-Resource-Policy "cross-origin"/);
});

test('koyu mod: e-postalar açık tasarımda kalır (color-scheme) ve logo her zaman kendi zemin renginde durur', () => {
  const metaOk = (html, n) => expect(html, n).toContain('supported-color-schemes" content="light"');
  metaOk(renderWelcome({ kind: 'tek', appUrl: 'https://anahtar.io' }).html, 'welcome');
  metaOk(renderTenantInvite({ code: 'AB12CD34', appUrl: 'https://anahtar.io' }).html, 'invite-mail');
  metaOk(renderNotice({ title: 'a', body: 'b' }).html, 'push');
  for (const f of readdirSync(root('supabase/email-templates')).filter((x) => x.endsWith('.html'))) metaOk(readFileSync(root('supabase/email-templates/' + f), 'utf8'), f);
  // Logo, kendi zemin rengiyle aynı bir hücrenin içinde: bütün e-postalarda koyu logo koyu bantta (#1D1A19).
  expect(renderWelcome({ kind: 'tek', appUrl: 'https://anahtar.io' }).html).toMatch(/bgcolor="#1D1A19"[^>]*>\s*<img src="[^"]*koyu\.png"/);
  const rec = readFileSync(root('supabase/email-templates/recovery.html'), 'utf8');
  expect(rec).toMatch(/bgcolor="#1D1A19"[^>]*>\s*<img src="[^"]*koyu\.png"/);
  expect(renderTenantInvite({ code: 'AB12CD34', property: 'Moda Dairesi', appUrl: 'https://anahtar.io' }).html).toMatch(/bgcolor="#1D1A19"[^>]*>\s*<img src="[^"]*koyu\.png"/);
  expect(rec).not.toContain('seffaf');                                         // şeffaf logo koyu modda okunmaz; e-postalarda kullanılmaz
});

test('Supabase giriş e-postası şablonları: logo, değişkenler ve kullanım kılavuzu', () => {
  const dir = root('supabase/email-templates');
  const files = readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
  expect(files).toEqual(['confirmation.html', 'email_change.html', 'invite.html', 'magic_link.html', 'reauthentication.html', 'recovery.html']);
  for (const f of files) {
    const h = readFileSync(dir + '/' + f, 'utf8');
    expect(h, f).toContain(`src="${LOGO}"`);
    if (h.includes('href="{{ .ConfirmationURL }}" style')) expect(h, f).toMatch(/href="\{\{ \.ConfirmationURL \}\}" style="[^"]*border-radius:999px/);   // düğme yuvarlak (hap), öteki e-postalardaki gibi
  }
  const rec = readFileSync(dir + '/recovery.html', 'utf8');
  expect(rec).toContain('{{ .ConfirmationURL }}');
  expect(rec).toContain('Şifremi yenile');
  expect(readFileSync(dir + '/email_change.html', 'utf8')).toContain('{{ .NewEmail }}');
  expect(readFileSync(dir + '/reauthentication.html', 'utf8')).toContain('{{ .Token }}');
  expect(readFileSync(dir + '/OKU-BENI.md', 'utf8')).toContain('Authentication');
});

test('derlemede /mail ve /marka klasörleri siteyle birlikte yayına çıkar', async () => {
  const { ensureDist } = await import('./app-helpers.mjs');
  const dist = root('app/dist-fake');
  test.setTimeout(300_000);
  await ensureDist(dist);
  for (const f of ['mail/anahtar-logo-mail-koyu.png', 'mail/anahtar-logo-mail-kirmizi.png', 'mail/anahtar-logo-mail-krem.png', 'mail/anahtar-ikon-mail.png', 'marka/anahtar-logo-seffaf-beyaz.png', 'marka/anahtar-ikon.png']) expect(existsSync(dist + '/' + f), f).toBe(true);
});
