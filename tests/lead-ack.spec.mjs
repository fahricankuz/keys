// Müşteriye giden "talebini aldık" e-postası (supabase/functions/lead-mail/ack.ts): tür, dil, özet, güvenli kaçış, logo/renk.
import { test, expect } from '@playwright/test';
import { renderAck } from '../supabase/functions/lead-mail/ack.ts';

test('kurumsal teklif: teşekkür, ekibin dönüşü, talep özeti ve referans', () => {
  const m = renderAck({ kind: 'kurumsal', name: 'Ayşe Yılmaz', ref: 'T-AB12CD', rows: [['Şirket / kurum', 'Örnek AVM'], ['Mülk adedi', '120']], message: 'Teklif istiyoruz' });
  expect(m.subject).toBe('Kurumsal teklif talebini aldık');
  expect(m.html).toContain('Merhaba Ayşe,');
  expect(m.html).toContain('Ekiplerimiz talebini inceleyip en kısa sürede seninle iletişime geçecek');
  expect(m.html).toContain('Referans: T-AB12CD');
  expect(m.html).toContain('Örnek AVM');
  expect(m.html).toContain('Teklif istiyoruz');
  expect(m.html).toContain('info@anahtar.io');
  expect(m.html).toContain('anahtar-logo-mail-koyu.png');               // koyu bantta koyu zeminli logo
  expect(m.text).toContain('Referans: T-AB12CD');
});

test('her tür kendi konusunu taşır; bilinmeyen tür genel olur; hukuki talepte H- numarası', () => {
  expect(renderAck({ kind: 'import' }).subject).toBe('Toplu içe aktarma talebini aldık');
  expect(renderAck({ kind: 'upgrade' }).subject).toBe('Paket yükseltme talebini aldık');
  expect(renderAck({ kind: 'garip' }).subject).toBe('Mesajını aldık');
  const h = renderAck({ kind: 'hukuki', ref: 'H-0007', name: 'Mehmet' });
  expect(h.subject).toBe('Hukuki destek talebini aldık');
  expect(h.html).toContain('H-0007');
  expect(renderAck({ kind: 'genel' }).html).toContain('Merhaba,');         // ad yoksa genel selamlama
});

test('İngilizce sürüm', () => {
  const m = renderAck({ kind: 'kurumsal', name: 'Ayse', lang: 'en', ref: 'T-1' });
  expect(m.subject).toBe('We received your Enterprise quote request');
  expect(m.html).toContain('Hi Ayse,');
  expect(m.html).toContain('lang="en"');
  expect(m.html).not.toContain('Merhaba');
});

test('kullanıcı metni HTML olarak yorumlanmaz', () => {
  const m = renderAck({ kind: 'genel', name: '<img src=x onerror=alert(1)>', rows: [['Not', '<script>x</script>']], message: '"><b>kalın</b>' });
  expect(m.html).not.toContain('<script>');
  expect(m.html).not.toContain('<img src=x');
  expect(m.html).not.toContain('<b>kalın</b>');
  expect(m.html).toContain('&lt;script&gt;');
});
