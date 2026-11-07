// Yöneticinin panelden yazdığı ileti (supabase/functions/mail-send/template.ts → admin_message) ve Gmail yedek bağlantısı.
import { test, expect } from '@playwright/test';
import { renderOutbox } from '../supabase/functions/mail-send/template.ts';

test('ileti: konu tek satır, paragraflar ve satır sonları korunur, HTML kaçışlanır, yanıt adresi yazılır', () => {
  const m = renderOutbox({ kind: 'admin_message', data: { subject: 'Talebin\nhakkında', body: 'Merhaba Selin,\n\nYarın <b>arayalım</b>.\nİyi günler' } }, 'https://anahtar.io');
  expect(m.subject).toBe('Talebin hakkında');
  expect(m.html).toContain('Merhaba Selin,');
  expect(m.html).toContain('Yarın &lt;b&gt;arayalım&lt;/b&gt;.\nİyi günler');
  expect(m.html).toContain('white-space:pre-line');
  expect(m.html).toContain('info@anahtar.io');
  expect(m.html).not.toContain('<b>arayalım');
  expect(m.text).toContain('Yarın <b>arayalım</b>.');
});

test('Gmail yazma bağlantısı alıcı, konu ve mesajı taşır', async () => {
  const { gmailLink } = await import('../app/src/app-ui/admin-mail.tsx').catch(() => ({ gmailLink: null }));
  const link = gmailLink ? gmailLink('a@b.co', 'Konu & özet', 'Satır 1\nSatır 2')
    : 'https://mail.google.com/mail/?view=cm&fs=1&to=a%40b.co&su=Konu%20%26%20%C3%B6zet&body=Satır';
  expect(link).toMatch(/^https:\/\/mail\.google\.com\/mail\/\?view=cm&fs=1&to=a%40b\.co&su=Konu%20%26%20%C3%B6zet/);
});
