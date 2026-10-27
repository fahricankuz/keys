// RevenueCat abone kaydını subscriptions tablosu satırına çevirir.
// Saf fonksiyon: Deno'ya bağımlı değildir, testlerde doğrudan sınanır.

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

/**
 * @param userId      Supabase kullanıcı kimliği
 * @param subscriber  GET /v1/subscribers/{id} yanıtındaki `subscriber`
 * @param entitlement RevenueCat'teki yetki kimliği (varsayılan "pro")
 */
export function rowFromSubscriber(userId: string, subscriber: any, entitlement = 'pro', now = Date.now()): Row {
  const ent = subscriber?.entitlements?.[entitlement];
  const base: Row = {
    user_id: userId, entitlement, product_id: null, store: null, period_type: null,
    expires_at: null, active: false, will_renew: false, billing_issue: false,
    environment: null, updated_at: new Date(now).toISOString(),
  };
  if (!ent) return base;

  const sub = subscriber?.subscriptions?.[ent.product_identifier] || {};
  // Ödeme sorunu yaşayan aboneye mağazanın tanıdığı ek süre de erişim sayılır.
  const expires: string | null = ent.grace_period_expires_date || ent.expires_date || null;
  const active = expires === null ? true : Date.parse(expires) > now;
  return Object.assign(base, {
    product_id: ent.product_identifier || null,
    store: sub.store || (expires === null ? 'promotional' : null),
    period_type: sub.period_type || null,
    expires_at: expires,
    active,
    will_renew: active && expires !== null && !sub.unsubscribe_detected_at,
    billing_issue: !!sub.billing_issues_detected_at,
    environment: sub.is_sandbox ? 'sandbox' : 'production',
  });
}
