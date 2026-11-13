// anahtar — gönderim kuyruğu e-postaları (Supabase Edge Function, Deno).
//
// mail_outbox tablosuna eklenen her satır için Database Webhook bu fonksiyonu çağırır (hesap silindi, ekibe paket seçimi,
// kurum yöneticisi daveti). Gövde yalnızca satır kimliğini taşır; içerik veritabanından okunur (mail_claim ayırır, mail_done kapatır).
// Gönderilemeyen satırlar için Supabase Cron {"sweep":true} ile bu fonksiyonu 15 dakikada bir çağırabilir (5 denemeye kadar).
//
// Kurulum: supabase functions deploy mail-send
//   Supabase → Database → Webhooks → yeni webhook: tablo public.mail_outbox, olay INSERT, tür "Supabase Edge Functions" → mail-send,
//   başlık x-anahtar-secret: <MAIL_SECRET>.
// Gizli değişkenler: MAIL_SECRET, SMTP_HOST/SMTP_USER/SMTP_PASS ya da RESEND_API_KEY, EMAIL_FROM; isteğe bağlı LEAD_TO (ekip adresi, varsayılan info@anahtar.io), APP_URL.
// SUPABASE_URL ve SUPABASE_SECRET_KEYS (yoksa SUPABASE_SERVICE_ROLE_KEY) Supabase tarafından otomatik sağlanır.

import { renderOutbox } from './template.ts';
import { mailConfigured, mailMissing, sendMail } from '../_shared/mail.ts';
import { serviceClient } from '../_shared/keys.ts';
import { logger } from '../_shared/log.ts';
import { sentryServe } from '../_shared/sentry.ts';

const log = logger('mail-send');

const env = (k: string) => Deno.env.get(k) ?? '';
const admin = serviceClient();

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

/** Tek satırı gönderir: 'sent' | 'skipped' (başkası ayırmış / gönderilmiş / 5 deneme) | 'failed'. */
async function sendOne(id: number): Promise<'sent' | 'skipped' | 'failed'> {
  const { data: row, error } = await admin.rpc('mail_claim', { rid: id });
  if (error) { await log.error('mail_claim', error.message); return 'failed'; }
  if (!row || !row.id) return 'skipped';
  const contact = env('LEAD_TO') || 'info@anahtar.io';
  const to = row.to_email || contact;
  const mail = renderOutbox(row, env('APP_URL'), contact);
  if (!mail) { await log.error('bilinmeyen e-posta türü', { id, kind: row.kind }); await admin.rpc('mail_fail', { rid: id, msg: 'Bilinmeyen tür: ' + row.kind }); return 'failed'; }
  const res = await sendMail({ to, replyTo: contact, subject: mail.subject, html: mail.html, text: mail.text });
  if (!res.ok) { await log.warn('e-posta gönderilemedi', { id, kind: row.kind, error: res.error }); await admin.rpc('mail_fail', { rid: id, msg: res.error ?? 'gönderilemedi' }); return 'failed'; }
  await admin.rpc('mail_done', { rid: id });
  return 'sent';
}

sentryServe('mail-send', async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const secret = env('MAIL_SECRET');
  if (!secret || !safeEqual(req.headers.get('x-anahtar-secret') ?? '', secret)) return new Response('unauthorized', { status: 401 });
  if (!mailConfigured()) return Response.json({ error: mailMissing() }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  let ids: number[] = [];
  if (body?.sweep) {
    const { data, error } = await admin.rpc('mail_retry');
    if (error) await log.error('mail_retry', error.message);
    ids = ((data ?? []) as unknown[]).map((x) => Number(x)).filter((x) => Number.isFinite(x));
  } else if (body?.table === 'mail_outbox' && body?.type === 'INSERT' && body?.record?.id) {
    ids = [Number(body.record.id)];
  } else {
    return Response.json({ ok: true, ignored: true });
  }
  const out = { sent: 0, skipped: 0, failed: 0 };
  for (const id of ids) out[await sendOne(id)]++;
  return Response.json({ ok: out.failed === 0, ...out }, { status: out.failed ? 502 : 200 });
});
