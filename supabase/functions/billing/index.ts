// Kiracım — abonelik eşitleyici (Supabase Edge Function, Deno).
//
// İki yoldan çağrılır:
//  1. RevenueCat webhook'u: her satın alma, yenileme, iptal ve süre bitiminde.
//     Authorization başlığı RevenueCat panelinde girilen değerle aynı olmalı.
//  2. Uygulama: satın alma ya da "geri yükle" sonrasında, kullanıcının oturum
//     anahtarıyla (supabase.functions.invoke('billing')). Webhook gecikse de
//     erişim hemen açılır.
// Her iki durumda da abone bilgisi RevenueCat'ten okunur (tek doğru kaynak) ve
// subscriptions tablosuna yazılır. Tabloya yalnızca bu fonksiyon yazabilir.
//
// Gerekli gizli değişkenler (supabase secrets set ...):
//   REVENUECAT_SECRET_KEY    — RevenueCat → Project settings → API keys → Secret (sk_…)
//   REVENUECAT_WEBHOOK_AUTH  — RevenueCat webhook'unda "Authorization header value"
// İsteğe bağlı:
//   REVENUECAT_ENTITLEMENT   — yetki kimliği (varsayılan: pro)
// SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY Supabase tarafından otomatik sağlanır.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { rowFromSubscriber, affectedUsers } from './subscriber.ts';

const env = (k: string) => Deno.env.get(k) ?? '';
const ENTITLEMENT = env('REVENUECAT_ENTITLEMENT') || 'pro';

const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function syncUser(userId: string) {
  const res = await fetch('https://api.revenuecat.com/v1/subscribers/' + encodeURIComponent(userId), {
    headers: { Authorization: 'Bearer ' + env('REVENUECAT_SECRET_KEY'), Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('RevenueCat ' + res.status + ': ' + (await res.text()).slice(0, 200));
  const { subscriber } = await res.json();
  const row = rowFromSubscriber(userId, subscriber, ENTITLEMENT);
  // Profili olmayan kimlik (silinmiş hesap) yabancı anahtar hatası verir; atlanır.
  const { error } = await admin.from('subscriptions').upsert(row, { onConflict: 'user_id' });
  if (error && error.code !== '23503') throw error;
  return row;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Yalnızca POST' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const hook = env('REVENUECAT_WEBHOOK_AUTH');

  try {
    // 1) RevenueCat webhook'u
    if (hook && (auth === hook || auth === 'Bearer ' + hook)) {
      const payload = await req.json().catch(() => null);
      const event = payload?.event;
      if (!event) return json({ error: 'Olay yok' }, 400);
      if (event.type === 'TEST') return json({ ok: true, test: true });
      const users = affectedUsers(event);
      for (const id of users) await syncUser(id);
      return json({ ok: true, users: users.length });
    }

    // 2) Uygulamadan: oturum sahibinin aboneliğini tazele.
    const token = auth.replace(/^Bearer\s+/i, '');
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return json({ error: 'Yetkisiz' }, 401);
    const row = await syncUser(data.user.id);
    return json({ ok: true, active: row.active, expires_at: row.expires_at });
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
