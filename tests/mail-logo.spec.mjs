// E-postalarda anahtar logosu: şablonlar logoyu (img + alt) kullanır; logo dosyaları (şeffaf zeminli, koyu yazılı) yayında durur;
// Supabase giriş e-postası şablonları (kayıt onayı, şifre sıfırlama…) logoyu ve Supabase değişkenlerini içerir.
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { renderWelcome } from '../supabase/functions/welcome/template.ts';
import { renderInvite as renderTenantInvite } from '../supabase/functions/invite-mail/template.ts';
import { renderInvite as renderSiteInvite } from '../supabase/functions/site-invite/template.ts';
import { renderNotice } from '../supabase/functions/push/template.ts';

const LOGO = 'https://anahtar.io/mail/anahtar-logo-mail-v2.png';
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
  for (const f of ['report/template.ts', 'report/site-template.ts']) expect(readFileSync(root('supabase/functions/' + f), 'utf8')).toContain('<img src="${LOGO_URL}"');
  expect(readFileSync(root('supabase/functions/lead-mail/index.ts'), 'utf8')).toContain(`<img src="${LOGO}"`);
});

test('logo dosyaları: doğru boyut, şeffaf zemin (açık başlıkta durur), başka sitelerden yüklenebilir', () => {
  const png = (p) => readFileSync(root(p));
  const dims = (b) => [b.readUInt32BE(16), b.readUInt32BE(20)];
  expect(dims(png('app/public/mail/anahtar-logo-mail-v2.png'))).toEqual([480, 88]);
  expect(png('app/public/mail/anahtar-logo-mail-v2.png').equals(png('app/public/mail/anahtar-logo-mail.png'))).toBe(true);   // eski adres (gönderilmiş e-postalar) aynı yeni logoyu verir
  expect(dims(png('app/public/mail/anahtar-ikon-mail.png'))).toEqual([192, 192]);
  expect(dims(png('app/public/marka/anahtar-logo.png'))).toEqual([2000, 366]);
  expect(dims(png('app/public/marka/anahtar-ikon.png'))).toEqual([1024, 1024]);
  // Yazılı logo şeffaf zeminlidir (PNG renk türü 6 = RGBA) ve e-postalarda koyu değil açık başlıkta durur.
  expect(png('app/public/mail/anahtar-logo-mail-v2.png')[25]).toBe(6);
  expect(png('app/public/marka/anahtar-logo.png')[25]).toBe(6);
  expect(readFileSync(root('app/public/.htaccess'), 'utf8')).toMatch(/anahtar-\(logo\|ikon\)-mail[\s\S]*Cross-Origin-Resource-Policy "cross-origin"/);
});

test('Supabase giriş e-postası şablonları: logo, değişkenler ve kullanım kılavuzu', () => {
  const dir = root('supabase/email-templates');
  const files = readdirSync(dir).filter((f) => f.endsWith('.html')).sort();
  expect(files).toEqual(['confirmation.html', 'email_change.html', 'invite.html', 'magic_link.html', 'reauthentication.html', 'recovery.html']);
  for (const f of files) expect(readFileSync(dir + '/' + f, 'utf8'), f).toContain(`src="${LOGO}"`);
  const rec = readFileSync(dir + '/recovery.html', 'utf8');
  expect(rec).toContain('{{ .ConfirmationURL }}');
  expect(rec).toContain('Yeni şifre belirle');
  expect(readFileSync(dir + '/email_change.html', 'utf8')).toContain('{{ .NewEmail }}');
  expect(readFileSync(dir + '/reauthentication.html', 'utf8')).toContain('{{ .Token }}');
  expect(readFileSync(dir + '/OKU-BENI.md', 'utf8')).toContain('Authentication');
});

test('derlemede /mail ve /marka klasörleri siteyle birlikte yayına çıkar', async () => {
  const { ensureDist } = await import('./app-helpers.mjs');
  const dist = root('app/dist-fake');
  test.setTimeout(300_000);
  await ensureDist(dist);
  for (const f of ['mail/anahtar-logo-mail-v2.png', 'mail/anahtar-ikon-mail.png', 'marka/anahtar-logo.png', 'marka/anahtar-ikon.png']) expect(existsSync(dist + '/' + f), f).toBe(true);
});
