// Hoş geldin e-postası şablonu (supabase/functions/welcome/template.ts): türe ve pakete göre içerik, dil, güvenli kaçış.
import { test, expect } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { renderWelcome } from '../supabase/functions/welcome/template.ts';

const app = 'https://anahtar.io';

test('kiracı: ücretsiz kiracı içeriği, paket kutusu yok, panel ve destek bağlantıları', () => {
  const m = renderWelcome({ kind: 'tenant', name: 'Mehmet Kiracı', appUrl: app });
  expect(m.subject).toBe('Hoş geldin! Kiran artık tek yerde');
  expect(m.html).toContain('Merhaba Mehmet,');
  expect(m.html).toContain('Kiracı hesabı · her zaman ücretsiz');
  expect(m.html).toContain('Evine bağlan');
  expect(m.html).not.toContain('Seçtiğin paket');
  expect(m.html).toContain('href="https://anahtar.io/uygulama"');
  expect(m.html).toContain('href="https://anahtar.io/destek/"');
  expect(m.text).toContain('Panelime git: https://anahtar.io/uygulama');
});

test('mülk sahibi: seçtiği pakete göre (Başlangıç / Profesyonel) kutu, fiyat ve deneme bitişi', () => {
  const tek = renderWelcome({ kind: 'tek', name: 'Ayşe', appUrl: app, trialEnds: '2026-11-29T09:00:00Z' });
  expect(tek.subject).toBe('Hoş geldin! Başlangıç paketin hazır');
  expect(tek.html).toContain('Seçtiğin paket');
  expect(tek.html).toContain('₺99,99');
  expect(tek.html).toContain('Deneme süresi 29 Kasım 2026 tarihine kadar.');
  expect(tek.html).not.toContain('₺199,99');
  const bes = renderWelcome({ kind: 'bes', name: 'Ayşe', appUrl: app, trialEnds: null });
  expect(bes.subject).toBe('Hoş geldin! Profesyonel paketin hazır');
  expect(bes.html).toContain('₺199,99');
  expect(bes.html).toContain('Ekip üyeleri ve roller');
  expect(bes.html).not.toContain('Deneme süresi');                     // ücretli abonelikte deneme notu yok
});

test('ekip hesabı ve İngilizce sürüm', () => {
  expect(renderWelcome({ kind: 'team', appUrl: app }).html).toContain('Ekibe katıl');
  const en = renderWelcome({ kind: 'bes', name: 'Ayse', lang: 'en', appUrl: app, trialEnds: '2026-11-29T09:00:00Z' });
  expect(en.subject).toBe('Welcome! Your Professional plan is ready');
  expect(en.html).toContain('Hi Ayse,');
  expect(en.html).toContain('Your trial runs until 29 November 2026.');
  expect(en.html).toContain('lang="en"');
});

test('ad HTML olarak yorumlanmaz', () => {
  const m = renderWelcome({ kind: 'tenant', name: '<img src=x onerror=alert(1)>', appUrl: app });
  expect(m.html).not.toContain('<img');
  expect(m.html).toContain('&lt;img');
});

test('önizlemeler (test-results/hosgeldin)', () => {
  const dir = new URL('../test-results/hosgeldin/', import.meta.url).pathname;
  mkdirSync(dir, { recursive: true });
  for (const kind of ['tenant', 'tek', 'bes', 'team']) writeFileSync(dir + kind + '.html', renderWelcome({ kind, name: 'Ayşe', appUrl: app, trialEnds: '2026-11-29T09:00:00Z' }).html);
});
