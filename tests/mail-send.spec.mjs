// Gönderim kuyruğu e-postaları (supabase/functions/mail-send/template.ts): hesap silindi, ekibe paket seçimi, kurum daveti.
import { test, expect } from '@playwright/test';
import { renderOutbox } from '../supabase/functions/mail-send/template.ts';

const app = 'https://anahtar.io';

test('hesap silindi: kendisi sildi ve yönetici sildi (gerekçeyle) metinleri; destek adresi; kırmızı bantta kırmızı logo', () => {
  const self = renderOutbox({ kind: 'account_deleted', data: { name: 'Ayşe Yılmaz', by: 'self' } }, app);
  expect(self.subject).toBe('anahtar hesabın silindi');
  expect(self.html).toContain('Merhaba Ayşe,');
  expect(self.html).toContain('Talebin üzerine anahtar hesabın silindi.');
  expect(self.html).not.toContain('Gerekçe');
  expect(self.html).toContain('info@anahtar.io');
  expect(self.html).toContain('anahtar-logo-mail-kirmizi.png');
  const adm = renderOutbox({ kind: 'account_deleted', data: { name: 'Ali', by: 'admin', reason: 'Sahte hesap' } }, app);
  expect(adm.html).toContain('askıya alındıktan sonra silindi');
  expect(adm.html).toContain('Gerekçe');
  expect(adm.html).toContain('Sahte hesap');
  expect(adm.text).toContain('Gerekçe: Sahte hesap');
  const en = renderOutbox({ kind: 'account_deleted', lang: 'en', data: { name: 'Ayse', by: 'self' } }, app);
  expect(en.subject).toBe('Your anahtar account has been deleted');
  expect(en.html).toContain('Hi Ayse,');
  expect(en.html).toContain('lang="en"');
});

test('ekibe paket seçimi: konu, tablo ve yönetici paneli bağlantısı', () => {
  const m = renderOutbox({ kind: 'plan_choice', data: { name: 'Ayşe Mülk', email: 'ayse@ornek.com', plan: 'bes', units: '4', yearly: true } }, app + '/');
  expect(m.subject).toBe('Yeni paket seçimi: Ayşe Mülk → Profesyonel · 4 mülk');
  expect(m.html).toContain('ayse@ornek.com');
  expect(m.html).toContain('Yıllık');
  expect(m.html).toContain('href="https://anahtar.io/admin"');
  expect(m.html).toContain('Henüz ödeme yapılmadı');
  expect(renderOutbox({ kind: 'plan_choice', data: { name: 'B', plan: 'tek', units: '1', yearly: false } }, app).html).toContain('Aylık');
});

test('kurum yöneticisi daveti: kurum adı, kod ve kayıt bağlantısı (kod adrese güvenli yazılır)', () => {
  const m = renderOutbox({ kind: 'org_master_invite', data: { org: 'Örnek AVM', code: 'ABC123' } }, app);
  expect(m.subject).toBe('Örnek AVM için anahtar yönetici davetin');
  expect(m.html).toContain('href="https://anahtar.io/katil?kod=ABC123"');
  expect(m.html).toContain('ABC123');
  expect(m.text).toContain('Daveti kabul et: https://anahtar.io/katil?kod=ABC123');
  const en = renderOutbox({ kind: 'org_master_invite', lang: 'en', data: { org: 'X', code: 'Z9' } }, app);
  expect(en.html).toContain('Accept the invitation');
});

test('kullanıcı metni HTML olarak yorumlanmaz; bilinmeyen tür gönderilmez', () => {
  const m = renderOutbox({ kind: 'account_deleted', data: { name: '<script>alert(1)</script>', by: 'admin', reason: '"><img src=x onerror=1>' } }, app);
  expect(m.html).not.toContain('<script>');
  expect(m.html).not.toContain('<img src=x');
  expect(m.html).toContain('&lt;img src=x');
  expect(renderOutbox({ kind: 'garip', data: {} }, app)).toBeNull();
});
