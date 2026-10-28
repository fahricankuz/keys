// anahtar — aylık ve yıllık rapor e-postası (Kurumsal paket; Supabase Edge Function, Deno).
//
// Zamanlama (Supabase → Integrations → Cron → Edge Function "report", POST, başlık x-anahtar-secret):
//   aylık:  0 6 1 * *   gövde {"period":"month"}  → geçen ayın raporu
//   yıllık: 30 6 1 1 *  gövde {"period":"year"}   → geçen yılın raporu
// Site kurumlarında "Raporlar" yetkisi olan yöneticilere aynı zamanlamayla yönetim kurulu raporu da gider (site_report).
// İsteğe bağlı gövde alanları: "ref" (YYYY-MM-DD; raporlanacak dönemden bir gün), "only" (tek kullanıcı kimliği, deneme için).
//
// Gerekli gizli değişkenler (supabase secrets set ...):
//   REPORT_SECRET    — x-anahtar-secret başlığıyla aynı değer
//   RESEND_API_KEY, EMAIL_FROM (ör. "anahtar <rapor@anahtar.io>")
// İsteğe bağlı: APP_URL (varsayılan https://anahtar.io)
// SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY Supabase tarafından otomatik sağlanır.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { renderReport, type Report } from './template.ts';
import { renderSiteReport, type SiteReport } from './site-template.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

/** Varsayılan dönem: aylıkta geçen ay, yıllıkta geçen yıl. */
function defaultRef(period: string): string {
  const d = new Date();
  if (period === 'year') return `${d.getUTCFullYear() - 1}-06-01`;
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const secret = env('REPORT_SECRET');
  if (!secret || !safeEqual(req.headers.get('x-anahtar-secret') ?? '', secret)) return new Response('unauthorized', { status: 401 });
  if (!env('RESEND_API_KEY') || !env('EMAIL_FROM')) return Response.json({ error: 'RESEND_API_KEY / EMAIL_FROM eksik' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const period = body.period === 'year' ? 'year' : 'month';
  const ref = /^\d{4}-\d{2}-\d{2}$/.test(body.ref ?? '') ? body.ref : defaultRef(period);
  const appUrl = env('APP_URL') || 'https://anahtar.io';

  const { data: people, error } = await admin.rpc('report_recipients', { period });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let sent = 0, failed = 0;
  for (const p of (people ?? []) as { user_id: string; email: string; name: string; lang: string }[]) {
    if (body.only && body.only !== p.user_id) continue;
    try {
      const { data: r, error: e } = await admin.rpc('owner_report', { uid: p.user_id, period, ref });
      if (e) throw e;
      const mail = renderReport(r as Report, { name: (p.name || '').split(' ')[0], lang: p.lang, appUrl });
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: env('EMAIL_FROM'), to: p.email, subject: mail.subject, html: mail.html, text: mail.text })
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      sent++;
    } catch (e) {
      failed++;
      console.error('rapor gönderilemedi', p.user_id, (e as Error).message);
    }
  }
  // Site yönetim kurulu raporu.
  const { data: siteTo, error: se } = await admin.rpc('site_report_recipients');
  if (se) console.error('site raporu alıcıları okunamadı', se.message);
  const cache = new Map<string, SiteReport>();
  for (const p of (siteTo ?? []) as { org_id: string; user_id: string; email: string; name: string }[]) {
    if (body.only && body.only !== p.user_id) continue;
    try {
      if (!cache.has(p.org_id)) {
        const { data: r, error: e } = await admin.rpc('site_report', { oid: p.org_id, period, ref });
        if (e) throw e;
        cache.set(p.org_id, r as SiteReport);
      }
      const mail = renderSiteReport(cache.get(p.org_id)!, { name: (p.name || '').split(' ')[0], appUrl });
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: env('EMAIL_FROM'), to: p.email, subject: mail.subject, html: mail.html, text: mail.text })
      });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      sent++;
    } catch (e) {
      failed++;
      console.error('site raporu gönderilemedi', p.user_id, (e as Error).message);
    }
  }
  return Response.json({ period, ref, sent, failed });
});
