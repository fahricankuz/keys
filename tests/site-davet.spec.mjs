// Site daveti e-postası şablonu (supabase/functions/site-invite/template.ts): site ve ticari metin, kod, bağlantı, güvenli kaçış.
import { test, expect } from '@playwright/test';
import { renderInvite } from '../supabase/functions/site-invite/template.ts';

const app = 'https://anahtar.io';

test('site daveti: konu, malik rozeti, davet kodu ve kayıt bağlantısı', () => {
  const m = renderInvite({ name: 'Ayşe Yılmaz', role: 'malik', org: 'Dalyan Sitesi', unit: 'A Blok No 3', code: 'S1A2B3C4', sector: 'site', by: 'Site Müdürü', appUrl: app + '/' });
  expect(m.subject).toBe('Dalyan Sitesi: A Blok No 3 için anahtar davetin');
  expect(m.html).toContain('Merhaba Ayşe,');
  expect(m.html).toContain('Malik daveti · ücretsiz');
  expect(m.html).toContain('S1A2B3C4');
  expect(m.html).toContain('href="https://anahtar.io/katil?kod=S1A2B3C4"');
  expect(m.html).toContain('Aidatını gör');
  expect(m.text).toContain('Daveti kabul et: https://anahtar.io/katil?kod=S1A2B3C4');
});

test('ticari davet kira dilinde; kullanıcı girdisi kaçışlanır', () => {
  const m = renderInvite({ name: '<b>Moda</b>', org: 'Kordon & AVM', unit: 'Zemin kat · Z-12', code: 'S0000001', sector: 'avm', appUrl: app });
  expect(m.html).toContain('Kiranı gör');
  expect(m.html).not.toContain('Aidatını gör');
  expect(m.html).toContain('Kordon &amp; AVM');
  expect(m.html).not.toContain('<b>Moda</b>');
});
