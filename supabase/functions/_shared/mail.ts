// anahtar — ortak e-posta göndericisi (Edge Function'lar).
// SMTP_HOST tanımlıysa e-posta Hostinger posta kutusundan SMTP ile gider (465, SSL); tanımlı değilse eskisi gibi Resend ile.
//
// Hostinger (SMTP) için gizli değişkenler:
//   SMTP_HOST   smtp.hostinger.com        SMTP_PORT   465 (varsayılan)
//   SMTP_USER   info@anahtar.io (posta kutusunun tam adresi)    SMTP_PASS   posta kutusunun parolası
//   EMAIL_FROM  anahtar <info@anahtar.io>   (adres SMTP_USER ile aynı olmalı)
//   SMTP_SECURE "0" yalnızca testlerde (şifresiz yerel sunucu); canlıda boş bırak
// Resend (SMTP_HOST yoksa): RESEND_API_KEY, EMAIL_FROM.
// Supabase Edge Function'ları 25 ve 587 numaralı çıkış portlarını engeller; 465 kullanılır.

import nodemailer from 'npm:nodemailer@10.3.1';

const env = (k: string) => Deno.env.get(k) ?? '';

export type Mail = { to: string; subject: string; html: string; text: string; replyTo?: string };
export type SendResult = { ok: boolean; error?: string };

const useSmtp = () => !!env('SMTP_HOST');

/** Gönderim ayarları tam mı? (Eksikse fonksiyonlar 500 döner.) */
export function mailConfigured(): boolean {
  if (!env('EMAIL_FROM')) return false;
  return useSmtp() ? !!(env('SMTP_USER') && env('SMTP_PASS')) : !!env('RESEND_API_KEY');
}
export const mailMissing = () => (useSmtp() ? 'SMTP_USER / SMTP_PASS / EMAIL_FROM eksik' : 'RESEND_API_KEY / EMAIL_FROM eksik');

/** Başlık enjeksiyonuna karşı satır sonlarını atar. */
const oneLine = (s: string) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim();

export async function sendMail(m: Mail): Promise<SendResult> {
  const to = oneLine(m.to), subject = oneLine(m.subject), replyTo = m.replyTo ? oneLine(m.replyTo) : undefined;
  if (!/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(to)) return { ok: false, error: 'Geçersiz alıcı adresi' };
  try {
    if (useSmtp()) {
      const port = Number(env('SMTP_PORT') || 465);
      const transport = nodemailer.createTransport({
        host: env('SMTP_HOST'), port, secure: env('SMTP_SECURE') !== '0' && port === 465,
        auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
        // Yalnız testlerde (şifresiz yerel sunucu): TLS hiç kullanılmaz; sertifika doğrulaması kapatılmaz.
        ...(env('SMTP_SECURE') === '0' ? { ignoreTLS: true } : {})
      });
      await transport.sendMail({ from: env('EMAIL_FROM'), to, replyTo, subject, html: m.html, text: m.text });
      return { ok: true };
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env('EMAIL_FROM'), to, subject, html: m.html, text: m.text, reply_to: replyTo }),
      signal: AbortSignal.timeout(15000)
    });
    return res.ok ? { ok: true } : { ok: false, error: `Resend ${res.status}: ${await res.text()}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
