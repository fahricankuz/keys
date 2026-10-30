// anahtar — site / portföy daveti e-postası (Supabase Edge Function, Deno).
//
// Kurum panelinde "Davet gönder"e basılınca uygulama bu fonksiyonu yöneticinin oturumuyla çağırır ({ resident: <kimlik> }).
// Yetki ve içerik veritabanından gelir (site_invite_mail: "Malik ve kiracılar" yetkisi, e-postası olan ve katılmamış kişi);
// fonksiyon yalnızca Resend ile gönderir.
//
// Kurulum: supabase functions deploy site-invite
// Gizli değişkenler (hoş geldin e-postasıyla aynı): RESEND_API_KEY, EMAIL_FROM. İsteğe bağlı: APP_URL (varsayılan https://anahtar.io).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { renderInvite } from './template.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS'
};
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: CORS });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const auth = req.headers.get('authorization') ?? '';
  if (!/^Bearer\s+\S+/i.test(auth)) return json({ error: 'unauthorized' }, 401);
  const { resident } = await req.json().catch(() => ({}));
  if (!resident || typeof resident !== 'string') return json({ error: 'resident' }, 400);

  // Yöneticinin kendi oturumuyla: yetki denetimi veritabanında (RLS ve site_invite_mail).
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { authorization: auth } }, auth: { persistSession: false } });
  const { data: info, error } = await db.rpc('site_invite_mail', { rid: resident });
  if (error || !info) return json({ error: error?.message ?? 'davet yok' }, 403);
  if (!env('RESEND_API_KEY') || !env('EMAIL_FROM')) return json({ error: 'RESEND_API_KEY / EMAIL_FROM eksik' }, 500);

  const mail = renderInvite({ ...info, appUrl: env('APP_URL') || 'https://anahtar.io' });
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env('EMAIL_FROM'), to: info.email, subject: mail.subject, html: mail.html, text: mail.text, reply_to: 'info@anahtar.io' })
  });
  if (!res.ok) return json({ error: await res.text() }, 502);
  return json({ ok: true, sent: true });
});
