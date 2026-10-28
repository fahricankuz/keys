// anahtar — anlık bildirim gönderici (Supabase Edge Function, Deno).
//
// notifications tablosuna eklenen her satır için Database Webhook bu
// fonksiyonu çağırır; fonksiyon kullanıcının kayıtlı cihazlarına bildirim
// gönderir: tarayıcılara Web Push, telefon uygulamasına APNs (iOS) ve FCM
// (Android; ayrıntı native.ts). İsteğe bağlı olarak (kullanıcı ayarlarda
// açtıysa) e-posta da yollar.
//
// Gerekli gizli değişkenler (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (ör. mailto:siz@ornek.com)
//   WEBHOOK_SECRET   — webhook'a eklenen x-evim-secret başlığıyla aynı değer
// İsteğe bağlı:
//   RESEND_API_KEY, EMAIL_FROM — e-posta bildirimleri için
//   SMS_PROVIDER ve sağlayıcı bilgileri — tarihli hatırlatmalar için SMS (ayrıntı sms.ts)
//   APP_URL          — bildirim bağlantılarının açılacağı adres (ör. https://kullanici.github.io/project_evim/)
// SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY Supabase tarafından otomatik sağlanır.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { sendApns, sendFcm } from './native.ts';
import { sendSms, smsEnabled } from './sms.ts';

type NotificationRow = {
  id: number; user_id: string; property_id: string | null; title: string; body: string; url: string; tag: string | null;
};

const env = (k: string) => Deno.env.get(k) ?? '';

if (env('VAPID_PUBLIC_KEY')) webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:admin@example.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false }
});

// Gizli değer karşılaştırması sabit sürede yapılır (zamanlama farkından değer sezdirmez).
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

/** Bildirimdeki eski adres biçimini (#/kiraci/odemeler, #/mulk-sahibi/mulk/<id>/odeme) panel yoluna çevirir
    (app/src/domain/nav.js → toApp ile aynı kural). */
function panelPath(url: string): string {
  if (String(url || '').startsWith('/uygulama')) return url;   // yeni biçim (site bildirimleri) olduğu gibi
  const [root, a, b, c] = String(url || '').replace(/^#/, '').split('?')[0].split('/').filter(Boolean);
  if (root === 'kiraci') return a ? (a === 'belgeler' && b ? `/uygulama/belgeler/${b}` : `/uygulama/${a}`) : '/uygulama';
  if (root === 'mulk-sahibi' && a === 'mulk' && b) return `/uygulama/mulk?pid=${encodeURIComponent(b)}&sub=${c || 'ozet'}`;
  if (root === 'mulk-sahibi' && a) return `/uygulama/${a}`;
  return '/uygulama';
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Yalnızca POST', { status: 405 });

  const secret = env('WEBHOOK_SECRET');
  if (!secret || !safeEqual(req.headers.get('x-evim-secret') ?? '', secret)) {
    return new Response('Yetkisiz', { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const n: NotificationRow | undefined = payload?.record;
  if (!n || payload?.table !== 'notifications' || payload?.type !== 'INSERT') {
    return new Response('Yok sayıldı', { status: 200 });
  }

  const appUrl = env('APP_URL');
  const link = appUrl ? appUrl.replace(/\/?$/, '') + panelPath(n.url) : panelPath(n.url);

  // 1. Web Push
  const { data: subs } = await admin.from('push_subscriptions').select('endpoint, keys').eq('user_id', n.user_id);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: s.keys },
        JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.tag ?? undefined }),
        { TTL: 60 * 60 * 24 }
      );
      sent++;
    } catch (e) {
      // 404/410: abonelik artık geçersiz (uygulama kaldırılmış, izin geri alınmış).
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      } else {
        console.error('push hatası', code, (e as Error).message);
      }
    }
  }

  // 2. Telefon uygulaması (APNs / FCM)
  const { data: devices } = await admin.from('device_tokens').select('token, platform').eq('user_id', n.user_id);
  for (const d of devices ?? []) {
    try {
      const note = { title: n.title, body: n.body, url: n.url, tag: n.tag };
      const r = d.platform === 'ios' ? await sendApns(d.token, note) : await sendFcm(d.token, note);
      if (r === 'ok') sent++;
      if (r === 'gone') await admin.from('device_tokens').delete().eq('token', d.token);
    } catch (e) {
      console.error('cihaz bildirimi hatası', d.platform, (e as Error).message);
    }
  }

  const { data: profile } = await admin.from('profiles').select('settings, phone').eq('id', n.user_id).single();

  // 3. SMS: yalnız tarihli hatırlatmalar (kira günü, gecikme, sözleşme, DASK, tahliye, site aidatı); kullanıcı kapatmadıysa.
  let texted = false;
  if (smsEnabled() && profile?.settings?.sms !== false && /^(rent-soon|rent-due|rent-late|renew|dask|evict|aidat-(soon|due|late|late2))-/.test(n.tag ?? '')) {
    let phone = profile?.phone || '';
    if (!phone && n.property_id) {
      const { data: m } = await admin.from('memberships').select('phone').eq('user_id', n.user_id).eq('property_id', n.property_id).maybeSingle();
      phone = m?.phone || '';
    }
    if (phone) texted = await sendSms(phone, `anahtar: ${n.title}. ${n.body} ${link}`).catch(() => false);
  }

  // 4. E-posta (varsayılan açık; kullanıcı kapatmadıysa ve Resend yapılandırıldıysa)
  let mailed = false;
  if (env('RESEND_API_KEY') && env('EMAIL_FROM')) {
    if (profile?.settings?.email !== false) {
      const { data: user } = await admin.auth.admin.getUserById(n.user_id);
      const to = user?.user?.email;
      if (to) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'authorization': `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            from: env('EMAIL_FROM'),
            to,
            subject: n.title,
            text: `${n.body}\n\n${link}\n\n— anahtar`
          })
        });
        mailed = res.ok;
        if (!res.ok) console.error('e-posta hatası', res.status, await res.text());
      }
    }
  }

  return Response.json({ sent, texted, mailed });
});
