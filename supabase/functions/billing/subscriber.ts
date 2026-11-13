// RevenueCat abone kaydını subscriptions tablosu satırına çevirir ve satırın üzerine yazılıp yazılmayacağına karar verir.
// Saf fonksiyonlar: Deno'ya bağımlı değildir, testlerde doğrudan sınanır.

export type Row = {
  user_id: string;
  entitlement: string;
  product_id: string | null;
  store: string | null;
  period_type: string | null;
  expires_at: string | null;
  active: boolean;
  will_renew: boolean;
  billing_issue: boolean;
  environment: string | null;
  updated_at: string;
};

const CANONICAL = /^(tek|bes)_[1-9]_(aylik|yillik)$/;

/**
 * Mağaza ürününü sunucunun tanıdığı tek biçime ("tek_3_aylik" = paket_adet_dönem) çevirir.
 *  - App Store: kimlik zaten "tek_3_aylik" / "bes_5_yillik".
 *  - Google Play: iki abonelik (`tek`, `bes`), her birinde 18 temel plan ("3-aylik", "5-yillik"). RevenueCat REST (v1) aboneliği
 *    soneksiz kimlikle ("tek") verir ve temel planı ayrı alanda (`product_plan_identifier`: "3-aylik") taşır; yeni ürünlerde kimlik
 *    "tek:3-aylik" biçiminde de gelebilir; eski kurulumlarda "tek_3" + "aylik" ya da "tek_3:aylik" görülür. Hepsi aynı sonuca varır.
 * Tanınmayan kimlik (evim_aylik gibi eski ürünler) olduğu gibi döner; adet taşımayan ürünlerde paketin varsayılan sınırı uygulanır.
 */
export function normalizeProduct(id: unknown, plan?: unknown): string | null {
  if (typeof id !== 'string' || !id.trim()) return null;
  const raw = id.trim();
  const lower = raw.toLowerCase();
  if (CANONICAL.test(lower)) return lower;
  const colon = lower.indexOf(':');
  const prod = colon < 0 ? lower : lower.slice(0, colon);
  const planText = [colon < 0 ? '' : lower.slice(colon + 1), typeof plan === 'string' ? plan.toLowerCase() : ''].join(' ');
  const m = /^(tek|bes)(?:_([1-9]))?$/.exec(prod);
  if (!m) return raw;
  const units = m[2] ?? /(?:^|[^0-9])([1-9])(?![0-9])/.exec(planText)?.[1];
  const period = /(aylik|yillik)/.exec(planText)?.[1];
  return units && period ? `${m[1]}_${units}_${period}` : raw;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Uygulama RevenueCat'e Supabase kullanıcı kimliğiyle bağlanır; anonim kimlikler atlanır. */
export function isUserId(id: unknown): id is string {
  return typeof id === 'string' && UUID.test(id);
}

/** Webhook olayından etkilenen kullanıcılar (aktarım dahil). */
export function affectedUsers(event: Record<string, unknown>): string[] {
  const ids = [
    event.app_user_id, event.original_app_user_id,
    ...((event.aliases as unknown[]) || []),
    ...((event.transferred_to as unknown[]) || []),
    ...((event.transferred_from as unknown[]) || []),
  ];
  return [...new Set(ids.filter(isUserId))];
}

/** Aboneliği başka hesaba aktarılan kullanıcılar (TRANSFER olayı): onlar için "yetki yok" anlık görüntüsü gerçektir. */
export function transferredAway(event: Record<string, unknown>): string[] {
  return event.type === 'TRANSFER' ? ((event.transferred_from as unknown[]) || []).filter(isUserId) : [];
}

/**
 * @param userId      Supabase kullanıcı kimliği
 * @param subscriber  GET /v1/subscribers/{id} yanıtındaki `subscriber`
 * @param entitlement RevenueCat'teki yetki kimliği (varsayılan "pro")
 */
// deno-lint-ignore no-explicit-any
export function rowFromSubscriber(userId: string, subscriber: any, entitlement = 'pro', now = Date.now()): Row {
  const ent = subscriber?.entitlements?.[entitlement];
  const base: Row = {
    user_id: userId, entitlement, product_id: null, store: null, period_type: null,
    expires_at: null, active: false, will_renew: false, billing_issue: false,
    environment: null, updated_at: new Date(now).toISOString(),
  };
  if (!ent) return base;

  // Google Play'de abonelikler soneksiz kimlikle ("tek") anahtarlanır; temel plan ayrı alandadır. Sonekli anahtar da denenir.
  const subs = subscriber?.subscriptions || {};
  const plan = ent.product_plan_identifier ?? subs[ent.product_identifier]?.product_plan_identifier;
  const sub = subs[ent.product_identifier] || (plan ? subs[`${ent.product_identifier}:${plan}`] : null) || {};
  // Ödeme sorunu yaşayan aboneye mağazanın tanıdığı ek süre de erişim sayılır.
  const expires: string | null = ent.grace_period_expires_date || ent.expires_date || null;
  const active = expires === null ? true : Date.parse(expires) > now;
  return Object.assign(base, {
    product_id: normalizeProduct(ent.product_identifier, plan ?? sub.product_plan_identifier),
    store: sub.store || (expires === null ? 'promotional' : null),
    period_type: sub.period_type || null,
    expires_at: expires,
    active,
    will_renew: active && expires !== null && !sub.unsubscribe_detected_at,
    billing_issue: !!sub.billing_issues_detected_at,
    // Sandbox (test) satın alımları erişim verir; ortam kaydedilir, gelir göstergelerinden veritabanı ayıklar.
    environment: sub.is_sandbox ? 'sandbox' : 'production',
  });
}

/** Tablodaki mevcut satırın karar için gereken alanları. */
export type Existing = Pick<Row, 'store' | 'product_id' | 'expires_at' | 'active'>;
export type Decision = { write: true } | { write: false; reason: 'grant' | 'stale' };

/** Satır şu an erişim veriyor mu (aktif ve süresi dolmamış)? */
export const isCurrent = (r: Pick<Row, 'expires_at' | 'active'>, now: number) =>
  !!r.active && (r.expires_at === null || r.expires_at === undefined || Date.parse(r.expires_at) > now);

/**
 * Mağaza eşitlemesi satırın üzerine yazabilir mi?
 *  1. Yöneticinin verdiği (store = 'admin') ve süresi dolmamış paket hiçbir eşitlemeyle ezilmez. Promosyon (store = 'promotional')
 *     yalnız yine promosyon olan aktif bir anlık görüntüyle tazelenir (RevenueCat kendi promosyonunu uzatabilir). Süresi dolmuş
 *     bir hibe artık korunmaz: aksi halde satın alma hiç yansımazdı.
 *  2. Erişim veren satır, "yetki yok" ya da başka ürünün bitişini anlatan anlık görüntüyle silinmez; aynı ürünün gerçek bitişi
 *     (iade, süre dolumu) yazılır. Aynı ürün için daha erken bitişli aktif anlık görüntü eski/sıra dışı kabul edilir ve yazılmaz;
 *     ürün değişimi (plan değişikliği) RevenueCat'in son durumudur ve yazılır.
 *  3. `authoritative`: RevenueCat'in o kullanıcı için kesin bilgisi (aboneliğin başka hesaba aktarılması); 2. kural atlanır.
 */
export function decideWrite(existing: Existing | null | undefined, incoming: Row, now = Date.now(), authoritative = false): Decision {
  if (!existing) return { write: true };
  const cur = isCurrent(existing, now);
  const store = existing.store ?? '';

  if (cur && store === 'admin') return { write: false, reason: 'grant' };
  if (cur && store === 'promotional' && !(incoming.active && incoming.store === 'promotional')) return { write: false, reason: 'grant' };

  if (cur && !authoritative) {
    if (!incoming.active) {
      const sameEnded = incoming.expires_at !== null && incoming.product_id === existing.product_id && incoming.store === existing.store;
      return sameEnded ? { write: true } : { write: false, reason: 'stale' };
    }
    const older = incoming.product_id === existing.product_id && incoming.expires_at !== null && existing.expires_at !== null
      && Date.parse(incoming.expires_at) < Date.parse(existing.expires_at);
    if (older) return { write: false, reason: 'stale' };
  }
  return { write: true };
}
