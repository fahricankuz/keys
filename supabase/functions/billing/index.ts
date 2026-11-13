// anahtar — abonelik eşitleyici (Supabase Edge Function, Deno).
//
// Üç yoldan çağrılır:
//  1. RevenueCat webhook'u: her satın alma, yenileme, iptal ve süre bitiminde.
//     Authorization başlığı RevenueCat panelinde girilen değerle aynı olmalı.
//  2. Uygulama: satın alma ya da "geri yükle" sonrasında, kullanıcının oturum
//     anahtarıyla (supabase.functions.invoke('billing')). Webhook gecikse de
//     erişim hemen açılır. Aynı kullanıcı için 30 saniyede en çok bir kez çalışır (429).
//  3. Günlük uzlaştırma (pg_cron; ayrıca silinen hesapların RevenueCat abonelerini siler: public.revenuecat_deletions): POST {"action":"reconcile"} ve x-anahtar-secret başlığı (BILLING_CRON_SECRET). Süresi
//     2 gün içinde dolacak ya da dolmuş mağaza aboneliklerini (public.billing_reconcile_candidates) RevenueCat'ten tazeler;
//     kaçan webhook'ların güvenlik ağıdır.
// Her durumda abone bilgisi RevenueCat'ten okunur (tek doğru kaynak, REST v1 /v1/subscribers) ve subscriptions tablosuna
// yazılır. Tabloya yalnızca bu fonksiyon yazar; yönetici/promosyon paketleri ve daha yeni bir satır ezilmez (subscriber.ts).
// Yanıtlarda RevenueCat metni ya da hata ayrıntısı yoktur; ayrıntı yalnızca loglara (function_logs) yazılır.
//
// Gerekli gizli değişkenler (supabase secrets set ...):
//   REVENUECAT_SECRET_KEY    — RevenueCat → Project settings → API keys → Secret API key (v1 anahtarı, sk_…)
//   REVENUECAT_WEBHOOK_AUTH  — RevenueCat webhook'unda "Authorization header value"
//   BILLING_CRON_SECRET      — günlük uzlaştırma çağrısının x-anahtar-secret başlığı (≥32 bayt rastgele; tanımsızsa uzlaştırma kapalıdır)
// İsteğe bağlı:
//   REVENUECAT_ENTITLEMENT   — yetki kimliği (varsayılan: pro)
// SUPABASE_URL ve SUPABASE_SECRET_KEYS (yoksa SUPABASE_SERVICE_ROLE_KEY) Supabase tarafından otomatik sağlanır.

import { decideWrite, isUserId, rowFromSubscriber, affectedUsers, transferredAway, type Existing } from './subscriber.ts';
import { serviceClient } from '../_shared/keys.ts';
import { logger } from '../_shared/log.ts';
import { sentryServe } from '../_shared/sentry.ts';

const log = logger('billing');

const env = (k: string) => Deno.env.get(k) ?? '';
const ENTITLEMENT = env('REVENUECAT_ENTITLEMENT') || 'pro';

const admin = serviceClient();

const COOLDOWN_MS = 30_000;          // aynı kullanıcının uygulamadan tetiklediği eşitleme aralığı
const RECONCILE_MAX = 500;           // bir uzlaştırma çalışmasında en çok kullanıcı
const RECONCILE_PARALLEL = 3;        // RevenueCat'e aynı anda en çok istek
const RECONCILE_PAUSE_MS = 400;      // gruplar arası bekleme (RevenueCat istek sınırına saygı)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
// Gizli değer karşılaştırması sabit sürede yapılır (zamanlama farkından değer sezdirmez).
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, ...extra, 'Content-Type': 'application/json' } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** RevenueCat'e ulaşılamadı ya da hata döndü; ayrıntı loglanır, istemciye yalnız genel ileti gider. */
class UpstreamError extends Error {
  constructor(public status: number) { super('RevenueCat ' + status); }
}

async function fetchSubscriber(userId: string) {
  const res = await fetch('https://api.revenuecat.com/v1/subscribers/' + encodeURIComponent(userId), {
    headers: { Authorization: 'Bearer ' + env('REVENUECAT_SECRET_KEY'), Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    await log.error('RevenueCat yanıtı başarısız', { status: res.status, body: (await res.text().catch(() => '')).slice(0, 200) });
    throw new UpstreamError(res.status);
  }
  const { subscriber } = await res.json();
  return subscriber;
}

type SyncResult = { active: boolean; expires_at: string | null; kept?: 'grant' | 'stale' };

/** Kullanıcıyı RevenueCat'ten okuyup tabloya yazar (korunan ya da daha yeni satır ezilmez); tablodaki geçerli durumu döndürür. */
async function syncUser(userId: string, authoritative = false): Promise<SyncResult> {
  const incoming = rowFromSubscriber(userId, await fetchSubscriber(userId), ENTITLEMENT);
  // Satırın units/sector alanları yöneticinin verdiği paketlere aittir; mağaza satırında adet ürün kimliğinden gelir.
  const payload = { ...incoming, units: null, sector: null };

  // Okuma ile yazma arasında başka bir eşitleme (webhook + uygulama) araya girerse updated_at değişir; yeniden okunur.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: existing, error: readErr } = await admin.from('subscriptions')
      .select('store, product_id, expires_at, active, updated_at').eq('user_id', userId).maybeSingle();
    if (readErr) throw readErr;
    const d = decideWrite(existing as Existing | null, incoming, Date.now(), authoritative);
    if (!d.write) {
      await log.info('abonelik satırı korundu', { reason: d.reason, user: userId });
      return { active: !!existing?.active, expires_at: existing?.expires_at ?? null, kept: d.reason };
    }
    if (!existing) {
      const { error } = await admin.from('subscriptions').insert(payload);
      if (!error) return { active: incoming.active, expires_at: incoming.expires_at };
      if (error.code === '23503') return { active: false, expires_at: null };   // profili olmayan kimlik (silinmiş hesap): atlanır
      if (error.code !== '23505') throw error;                                  // 23505: aynı anda başka eşitleme ekledi; yeniden oku
      continue;
    }
    const { data: done, error } = await admin.from('subscriptions').update(payload)
      .eq('user_id', userId).eq('updated_at', existing.updated_at).select('user_id');
    if (error) {
      if (error.code === '23503') return { active: false, expires_at: null };
      throw error;
    }
    if (done?.length) return { active: incoming.active, expires_at: incoming.expires_at };
  }
  await log.warn('abonelik satırı eşzamanlı güncellemeler yüzünden yazılamadı', { user: userId });
  return { active: incoming.active, expires_at: incoming.expires_at, kept: 'stale' };
}

/* ---- Uygulamadan tetiklenen eşitlemeye kullanıcı başına bekleme süresi ---- */
const lastUserSync = new Map<string, number>();
function cooldownLeft(userId: string, now: number): number {
  const at = lastUserSync.get(userId);
  return at !== undefined && now - at < COOLDOWN_MS ? Math.ceil((COOLDOWN_MS - (now - at)) / 1000) : 0;
}
function startCooldown(userId: string, now: number) {
  if (lastUserSync.size > 5000) for (const [k, t] of lastUserSync) if (now - t >= COOLDOWN_MS) lastUserSync.delete(k);
  lastUserSync.set(userId, now);
}

/* ---- Silinen hesapların RevenueCat aboneleri ----
   delete_my_account() kimliği public.revenuecat_deletions kuyruğuna yazar. Her uzlaştırmada RevenueCat'ten abone silinir
   (DELETE /v1/subscribers/{app_user_id}; 404 = zaten yok) ve satır kuyruktan kalkar. Başarısız olan sonraki uzlaştırmada yeniden denenir;
   7 günü geçen satırdan vazgeçilir ve function_logs'a uyarı yazılır. Tablo henüz yoksa (migration uygulanmadan) sessizce atlanır. */
const DELETION_GIVE_UP_MS = 7 * 86_400_000;
const DELETION_MAX = 50;
async function processDeletions() {
  const out = { deleted: 0, retry: 0, gave_up: 0 };
  const { data, error } = await admin.from('revenuecat_deletions').select('user_id, created_at');
  if (error) return out;
  const rows = ((data ?? []) as { user_id: unknown; created_at: unknown }[]).filter((r) => isUserId(r.user_id)).slice(0, DELETION_MAX);
  for (const r of rows) {
    const id = String(r.user_id);
    let ok = false;
    try {
      const res = await fetch('https://api.revenuecat.com/v1/subscribers/' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: { Authorization: 'Bearer ' + env('REVENUECAT_SECRET_KEY'), Accept: 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      ok = res.ok || res.status === 404;
      if (!ok) await log.error('RevenueCat abone silme başarısız', { status: res.status, user: id });
    } catch (e) {
      await log.error('RevenueCat abone silme ulaşılamadı', { user: id, error: e });
    }
    const age = Date.now() - Date.parse(String(r.created_at));
    if (ok || (Number.isFinite(age) && age > DELETION_GIVE_UP_MS)) {
      const del = await admin.from('revenuecat_deletions').delete().eq('user_id', id);
      if (del.error) { await log.error('revenuecat_deletions satırı silinemedi', del.error.message); continue; }
      if (ok) out.deleted++;
      else { out.gave_up++; await log.warn('RevenueCat abonesi 7 günde silinemedi, vazgeçildi', { user: id }); }
    } else out.retry++;
  }
  return out;
}

/* ---- Günlük uzlaştırma ---- */
async function reconcile(): Promise<Response> {
  const deletions = await processDeletions();
  const { data, error } = await admin.rpc('billing_reconcile_candidates');
  if (error) {
    await log.error('billing_reconcile_candidates okunamadı', error.message);
    return json({ error: 'Sunucu hatası' }, 500);
  }
  const all = ((data ?? []) as unknown[]).map((r) => (r && typeof r === 'object' ? Object.values(r as Record<string, unknown>)[0] : r)).filter(isUserId);
  const ids = [...new Set(all)].slice(0, RECONCILE_MAX);
  const out = { candidates: ids.length, synced: 0, kept: 0, failed: 0, rate_limited: false, truncated: new Set(all).size > ids.length, deletions };

  for (let i = 0; i < ids.length && !out.rate_limited; i += RECONCILE_PARALLEL) {
    await Promise.all(ids.slice(i, i + RECONCILE_PARALLEL).map(async (id) => {
      try {
        const r = await syncUser(id);
        if (r.kept) out.kept++; else out.synced++;
      } catch (e) {
        out.failed++;
        if (e instanceof UpstreamError && e.status === 429) out.rate_limited = true;
        else if (!(e instanceof UpstreamError)) await log.error('uzlaştırma: kullanıcı eşitlenemedi', { user: id, error: e });
      }
    }));
    if (i + RECONCILE_PARALLEL < ids.length) await sleep(RECONCILE_PAUSE_MS);
  }
  if (out.failed) await log.warn('uzlaştırma tamamlandı, bazı kullanıcılar eşitlenemedi', out);
  return json({ ok: out.failed === 0, ...out }, out.failed ? 502 : 200);
}

sentryServe('billing', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Yalnızca POST' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  const hook = env('REVENUECAT_WEBHOOK_AUTH');
  const body = await req.json().catch(() => null);

  try {
    // 3) Günlük uzlaştırma (pg_cron): gizli başlık sabit sürede karşılaştırılır; tanımsızsa kapalıdır.
    if (body?.action === 'reconcile' || new URL(req.url).pathname.endsWith('/reconcile')) {
      const secret = env('BILLING_CRON_SECRET');
      if (!secret) {
        await log.warn('BILLING_CRON_SECRET tanımlı değil; uzlaştırma kapalı');
        return json({ error: 'Yetkisiz' }, 401);
      }
      if (!safeEqual(req.headers.get('x-anahtar-secret') ?? '', secret)) return json({ error: 'Yetkisiz' }, 401);
      return await reconcile();
    }

    // 1) RevenueCat webhook'u
    if (hook && (safeEqual(auth, hook) || safeEqual(auth, 'Bearer ' + hook))) {
      const event = body?.event;
      if (!event) return json({ error: 'Olay yok' }, 400);
      if (event.type === 'TEST') return json({ ok: true, test: true });
      const users = affectedUsers(event);
      const away = new Set(transferredAway(event));
      for (const id of users) await syncUser(id, away.has(id));
      return json({ ok: true, users: users.length });
    }

    // 2) Uygulamadan: oturum sahibinin aboneliğini tazele.
    const token = auth.replace(/^Bearer\s+/i, '');
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return json({ error: 'Yetkisiz' }, 401);
    const uid = data.user.id;
    const now = Date.now();
    const wait = cooldownLeft(uid, now);
    if (wait) return json({ error: 'Çok sık istek', retry_after: wait }, 429, { 'Retry-After': String(wait) });
    startCooldown(uid, now);
    try {
      const r = await syncUser(uid);
      return json({ ok: true, active: r.active, expires_at: r.expires_at, ...(r.kept ? { kept: r.kept } : {}) });
    } catch (e) {
      lastUserSync.delete(uid);   // başarısız denemeden sonra kullanıcı hemen yeniden deneyebilsin
      throw e;
    }
  } catch (e) {
    await log.error('beklenmeyen hata', e);
    return e instanceof UpstreamError ? json({ error: 'Abonelik hizmetine ulaşılamadı' }, 502) : json({ error: 'Sunucu hatası' }, 500);
  }
});
