// anahtar — kiracı davet e-postası (Supabase Edge Function, Deno).
//
// Mülk sahibi e-postalı bir kiracı eklediğinde uygulama bu fonksiyonu mülk sahibinin oturumuyla çağırır
// (Authorization: Bearer <jeton>, gövde: { code }). Fonksiyon kişiyi jetondan tanır; daveti yalnız oluşturan kişi
// e-postalayabilir (invite_mail_claim), aynı davet 2 dakikada bir kez gönderilir. E-posta Resend ile gider ve
// davet kodunu ile ad ve e-postası hazır doldurulmuş kayıt bağlantısını (/kayit/kiraci?kod=…) içerir.
//
// Kurulum: supabase functions deploy invite-mail
// Gizli değişkenler (hoş geldin e-postasıyla aynı): RESEND_API_KEY, EMAIL_FROM. İsteğe bağlı: APP_URL (varsayılan https://anahtar.io).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { renderInvite } from './template.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS'
};
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: CORS });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'unauthorized' }, 401);
  const { data: who, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !who?.user) return json({ error: 'unauthorized' }, 401);
  const body = await req.json().catch(() => ({}));
  const code = String(body?.code ?? '').trim();
  if (!code) return json({ error: 'code' }, 400);

  const { data: info, error } = await admin.rpc('invite_mail_claim', { uid: who.user.id, invite_code: code });
  if (error) return json({ error: error.message }, 500);
  if (!info) return json({ ok: true, sent: false, reason: 'none' });
  if (info.throttled) return json({ ok: true, sent: false, reason: 'throttled' });
  if (!env('RESEND_API_KEY') || !env('EMAIL_FROM')) {
    await admin.from('invites').update({ mailed_at: null }).eq('code', info.code);
    return json({ error: 'RESEND_API_KEY / EMAIL_FROM eksik' }, 500);
  }

  const mail = renderInvite({ code: info.code, name: info.name, email: info.email, owner: info.owner, property: info.property, lang: info.lang, appUrl: env('APP_URL') || 'https://anahtar.io', expires: info.expires });
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env('EMAIL_FROM'), to: info.email, subject: mail.subject, html: mail.html, text: mail.text, reply_to: 'info@anahtar.io' })
  });
  if (!res.ok) {
    await admin.from('invites').update({ mailed_at: null }).eq('code', info.code);
    return json({ error: await res.text() }, 502);
  }
  return json({ ok: true, sent: true });
});
