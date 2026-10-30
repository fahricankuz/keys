// anahtar — hoş geldin e-postası (Supabase Edge Function, Deno).
//
// Uygulama, kişi paneline ilk girdiğinde bu fonksiyonu kişinin oturumuyla çağırır (Authorization: Bearer <jeton>).
// Fonksiyon kişiyi jetondan tanır; e-postanın türünü ve paketini veritabanından okur (welcome_info), gönderimi bir kez
// ayırır (welcome_claim) ve Resend ile gönderir. Kişi yalnız kendi e-postasını tetikleyebilir; ikinci çağrı bir şey göndermez.
//
// Kurulum: supabase functions deploy welcome
// Gizli değişkenler (rapor e-postasıyla aynı): RESEND_API_KEY, EMAIL_FROM. İsteğe bağlı: APP_URL (varsayılan https://anahtar.io).
// SUPABASE_URL, SUPABASE_ANON_KEY ve SUPABASE_SERVICE_ROLE_KEY Supabase tarafından otomatik sağlanır.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { renderWelcome, type WelcomeKind } from './template.ts';

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
  const uid = who.user.id;

  const { data: info, error } = await admin.rpc('welcome_info', { uid });
  if (error || !info) return json({ error: error?.message ?? 'profil yok' }, 500);
  const kind = info.kind as WelcomeKind | 'skip';
  // Gönderilmeyecek hesaplar da işaretlenir; uygulama bir daha sormaz.
  const { data: claimed } = await admin.rpc('welcome_claim', { uid, k: kind });
  if (!claimed) return json({ ok: true, sent: false, reason: 'already' });
  if (kind === 'skip') return json({ ok: true, sent: false, reason: 'skip' });
  if (!env('RESEND_API_KEY') || !env('EMAIL_FROM') || !info.email) {
    await admin.from('welcome_mail').delete().eq('user_id', uid);
    return json({ error: 'RESEND_API_KEY / EMAIL_FROM eksik' }, 500);
  }

  const mail = renderWelcome({ kind, name: info.name, lang: info.lang, appUrl: env('APP_URL') || 'https://anahtar.io', trialEnds: info.trial_ends });
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env('EMAIL_FROM'), to: info.email, subject: mail.subject, html: mail.html, text: mail.text, reply_to: 'info@anahtar.io' })
  });
  if (!res.ok) {
    // Gönderilemedi: kayıt silinir, bir sonraki girişte yeniden denenir.
    await admin.from('welcome_mail').delete().eq('user_id', uid);
    return json({ error: await res.text() }, 502);
  }
  return json({ ok: true, sent: true, kind });
});
