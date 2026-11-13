// Abonelik: RevenueCat kaydının tablo satırına çevrilmesi.
import { test, expect } from '@playwright/test';
import { rowFromSubscriber, affectedUsers, isUserId, normalizeProduct, decideWrite, isCurrent, transferredAway } from '../supabase/functions/billing/subscriber.ts';

const U = '11111111-2222-3333-4444-555555555555';
const NOW = Date.parse('2026-09-23T12:00:00Z');

const subscriber = (ent, sub) => ({
  entitlements: ent ? { pro: ent } : {},
  subscriptions: sub ? { evim_aylik: sub } : {}
});

test('aktif abonelik: süre, mağaza ve yenileme bilgisi', () => {
  const r = rowFromSubscriber(U, subscriber(
    { expires_date:'2026-10-23T12:00:00Z', product_identifier:'evim_aylik' },
    { store:'app_store', period_type:'normal', unsubscribe_detected_at:null, billing_issues_detected_at:null, is_sandbox:false }
  ), 'pro', NOW);
  expect(r).toMatchObject({ user_id:U, active:true, will_renew:true, store:'app_store', product_id:'evim_aylik',
    expires_at:'2026-10-23T12:00:00Z', environment:'production', billing_issue:false });
});

test('iptal edilmiş ama süresi dolmamış abonelik erişim verir, yenilenmez', () => {
  const r = rowFromSubscriber(U, subscriber(
    { expires_date:'2026-10-01T00:00:00Z', product_identifier:'evim_aylik' },
    { store:'play_store', unsubscribe_detected_at:'2026-09-20T00:00:00Z' }
  ), 'pro', NOW);
  expect(r).toMatchObject({ active:true, will_renew:false, store:'play_store' });
});

test('süresi dolmuş abonelik erişim vermez; ödeme sorununda ek süre sayılır', () => {
  expect(rowFromSubscriber(U, subscriber({ expires_date:'2026-09-01T00:00:00Z', product_identifier:'evim_aylik' }, {}), 'pro', NOW).active).toBe(false);
  const grace = rowFromSubscriber(U, subscriber(
    { expires_date:'2026-09-20T00:00:00Z', grace_period_expires_date:'2026-09-30T00:00:00Z', product_identifier:'evim_aylik' },
    { billing_issues_detected_at:'2026-09-20T00:00:00Z', is_sandbox:true }
  ), 'pro', NOW);
  expect(grace).toMatchObject({ active:true, billing_issue:true, environment:'sandbox' });
});

test('yetkisi olmayan ya da süresiz (promosyon) abone', () => {
  expect(rowFromSubscriber(U, subscriber(null, null), 'pro', NOW)).toMatchObject({ active:false, expires_at:null });
  expect(rowFromSubscriber(U, subscriber({ expires_date:null, product_identifier:'rc_promo_pro_lifetime' }, null), 'pro', NOW))
    .toMatchObject({ active:true, expires_at:null, store:'promotional', will_renew:false });
});

test('webhook olayındaki kullanıcılar: anonim kimlikler atlanır, aktarım iki tarafı da günceller', () => {
  const V = '99999999-2222-3333-4444-555555555555';
  expect(affectedUsers({ app_user_id:U, original_app_user_id:'$RCAnonymousID:abc', aliases:[U] })).toEqual([U]);
  expect(affectedUsers({ type:'TRANSFER', transferred_from:[U], transferred_to:[V] }).sort()).toEqual([U, V].sort());
  expect(isUserId('$RCAnonymousID:x')).toBe(false);
});

test('Google Play kimliği (abonelik:temel-plan) sunucunun tanıdığı biçime çevrilir; App Store kimliği aynen kalır', () => {
  const g = rowFromSubscriber(U, { entitlements: { pro: { expires_date:'2026-10-23T12:00:00Z', product_identifier:'bes_3:yillik' } },
    subscriptions: { 'bes_3:yillik': { store:'play_store', period_type:'normal' } } }, 'pro', NOW);
  expect(g).toMatchObject({ product_id:'bes_3_yillik', store:'play_store', active:true });
  const a = rowFromSubscriber(U, { entitlements: { pro: { expires_date:'2026-10-23T12:00:00Z', product_identifier:'tek_1_aylik' } },
    subscriptions: { tek_1_aylik: { store:'app_store' } } }, 'pro', NOW);
  expect(a.product_id).toBe('tek_1_aylik');
});

/* ---- Ürün kimliği: her mağaza biçimi tek biçime (paket_adet_dönem) çevrilir ---- */

test('normalizeProduct: App Store, Google Play (soneksiz kimlik + temel plan), sonekli kimlik ve eski kimlikler', () => {
  // App Store
  expect(normalizeProduct('tek_3_aylik')).toBe('tek_3_aylik');
  expect(normalizeProduct('bes_9_yillik')).toBe('bes_9_yillik');
  // Google Play: RevenueCat REST abonelik kimliğini soneksiz verir, temel planı ayrı alanda taşır
  expect(normalizeProduct('tek', '3-aylik')).toBe('tek_3_aylik');
  expect(normalizeProduct('bes', '9-yillik')).toBe('bes_9_yillik');
  expect(normalizeProduct('bes', '1-yillik')).toBe('bes_1_yillik');
  // Google Play: kimlik soneklidir
  expect(normalizeProduct('tek:3-aylik')).toBe('tek_3_aylik');
  expect(normalizeProduct('bes:5-yillik', '5-yillik')).toBe('bes_5_yillik');
  // eski kurulumlar: adet kimlikte, dönem plan alanında ya da soneksiz
  expect(normalizeProduct('tek_3', 'aylik')).toBe('tek_3_aylik');
  expect(normalizeProduct('tek_3:aylik')).toBe('tek_3_aylik');
  expect(normalizeProduct('bes_3:yillik')).toBe('bes_3_yillik');
  // büyük harf ve boşluk
  expect(normalizeProduct(' TEK ', '3-Aylik')).toBe('tek_3_aylik');
  // tanınmayan ya da eksik bilgi: olduğu gibi (adet bilinmeyen paketin varsayılan sınırı uygulanır)
  expect(normalizeProduct('evim_aylik')).toBe('evim_aylik');
  expect(normalizeProduct('tek')).toBe('tek');
  expect(normalizeProduct('tek', '12-aylik')).toBe('tek');
  expect(normalizeProduct('rc_promo_pro_lifetime')).toBe('rc_promo_pro_lifetime');
  expect(normalizeProduct(null)).toBeNull();
  expect(normalizeProduct('')).toBeNull();
  // sunucu tarafı (product_units) yalnız kanonik biçimi tanır
  for (const id of ['tek_1_aylik', 'tek_9_yillik', 'bes_4_aylik'])
    expect(normalizeProduct(id.split('_')[0], `${id.split('_')[1]}-${id.split('_')[2]}`)).toMatch(/^(tek|bes)_[1-9]_(aylik|yillik)$/);
});

test('Google Play REST kaydı (tek + product_plan_identifier) 3 mülklü aylık Başlangıç olarak okunur; sandbox erişim verir ve kaydedilir', () => {
  const sub = { entitlements: { pro: { expires_date: '2026-10-23T12:00:00Z', product_identifier: 'tek', product_plan_identifier: '3-aylik' } },
    subscriptions: { tek: { store: 'play_store', period_type: 'normal', is_sandbox: true, product_plan_identifier: '3-aylik' } } };
  expect(rowFromSubscriber(U, sub, 'pro', NOW)).toMatchObject({ product_id: 'tek_3_aylik', store: 'play_store', active: true, environment: 'sandbox' });
  // plan yalnız abonelik kaydında
  const sub2 = { entitlements: { pro: { expires_date: '2026-10-23T12:00:00Z', product_identifier: 'bes' } },
    subscriptions: { bes: { store: 'play_store', product_plan_identifier: '5-yillik' } } };
  expect(rowFromSubscriber(U, sub2, 'pro', NOW).product_id).toBe('bes_5_yillik');
  // abonelik sonekli anahtarla tutulmuşsa da bulunur
  const sub3 = { entitlements: { pro: { expires_date: '2026-10-23T12:00:00Z', product_identifier: 'tek', product_plan_identifier: '2-yillik' } },
    subscriptions: { 'tek:2-yillik': { store: 'play_store', period_type: 'trial' } } };
  expect(rowFromSubscriber(U, sub3, 'pro', NOW)).toMatchObject({ product_id: 'tek_2_yillik', store: 'play_store', period_type: 'trial' });
});

/* ---- Satırın üzerine yazma kararı ---- */

const IN = (o = {}) => ({ user_id: U, entitlement: 'pro', product_id: 'tek_1_aylik', store: 'app_store', period_type: 'normal', expires_at: '2026-10-23T12:00:00Z',
  active: true, will_renew: true, billing_issue: false, environment: 'production', updated_at: new Date(NOW).toISOString(), ...o });
const EX = (o = {}) => ({ store: 'app_store', product_id: 'tek_1_aylik', expires_at: '2026-10-01T12:00:00Z', active: true, ...o });
const NONE = IN({ product_id: null, store: null, period_type: null, expires_at: null, active: false, will_renew: false, environment: null });

test('satır yoksa yazılır; süresi dolmuş satırın üzerine her anlık görüntü yazılır', () => {
  expect(decideWrite(null, IN(), NOW)).toEqual({ write: true });
  expect(decideWrite(EX({ expires_at: '2026-09-01T00:00:00Z' }), NONE, NOW)).toEqual({ write: true });
  expect(isCurrent(EX(), NOW)).toBe(true);
  expect(isCurrent(EX({ expires_at: '2026-09-01T00:00:00Z' }), NOW)).toBe(false);
  expect(isCurrent(EX({ active: false }), NOW)).toBe(false);
});

test('yönetici paketi (admin) ve promosyon: mağaza eşitlemesi ezmez; "yetki yok" eşitlemesi de ezmez', () => {
  const admin = EX({ store: 'admin', product_id: 'tek_5_aylik', expires_at: null });
  expect(decideWrite(admin, NONE, NOW)).toEqual({ write: false, reason: 'grant' });          // restore: yetki yok
  expect(decideWrite(admin, IN(), NOW)).toEqual({ write: false, reason: 'grant' });          // mağaza aboneliği de ezmez
  expect(decideWrite(admin, NONE, NOW, true)).toEqual({ write: false, reason: 'grant' });    // kesin bilgi (aktarım) de ezmez
  const promo = EX({ store: 'promotional', product_id: 'rc_promo', expires_at: '2026-12-01T00:00:00Z' });
  expect(decideWrite(promo, NONE, NOW)).toEqual({ write: false, reason: 'grant' });
  expect(decideWrite(promo, IN(), NOW)).toEqual({ write: false, reason: 'grant' });
  // RevenueCat kendi promosyonunu uzatabilir
  expect(decideWrite(promo, IN({ store: 'promotional', product_id: 'rc_promo', expires_at: '2027-01-01T00:00:00Z' }), NOW)).toEqual({ write: true });
  // süresi dolmuş hibe korunmaz: aksi halde satın alma hiç yansımazdı
  expect(decideWrite(EX({ store: 'admin', expires_at: '2026-09-01T00:00:00Z' }), IN(), NOW)).toEqual({ write: true });
  expect(decideWrite(EX({ store: 'promotional', expires_at: '2026-09-01T00:00:00Z' }), IN(), NOW)).toEqual({ write: true });
});

test('erişim veren satır eski ya da boş anlık görüntüyle değiştirilmez; gerçek bitiş, yenileme ve plan değişimi yazılır', () => {
  // "yetki yok": gecikmiş RevenueCat / başka kimlik → erişim korunur
  expect(decideWrite(EX(), NONE, NOW)).toEqual({ write: false, reason: 'stale' });
  // aynı ürün, daha erken bitiş → eski anlık görüntü
  expect(decideWrite(EX(), IN({ expires_at: '2026-09-25T00:00:00Z' }), NOW)).toEqual({ write: false, reason: 'stale' });
  // yenileme (daha geç bitiş) ve aynı bitiş (iptal bayrağı değişti) yazılır
  expect(decideWrite(EX(), IN({ expires_at: '2026-11-01T00:00:00Z' }), NOW)).toEqual({ write: true });
  expect(decideWrite(EX(), IN({ expires_at: '2026-10-01T12:00:00Z', will_renew: false }), NOW)).toEqual({ write: true });
  // plan değişimi: ürün farklıysa RevenueCat'in son durumu yazılır (yıllıktan aylığa bitiş erken olsa da)
  expect(decideWrite(EX({ product_id: 'bes_3_yillik', expires_at: '2027-09-01T00:00:00Z' }), IN({ product_id: 'bes_3_aylik', expires_at: '2026-10-10T00:00:00Z' }), NOW)).toEqual({ write: true });
  // aynı ürünün gerçek bitişi (iade / iptal edilip süresi dolan): yazılır
  expect(decideWrite(EX(), IN({ active: false, expires_at: '2026-09-20T00:00:00Z', will_renew: false }), NOW)).toEqual({ write: true });
  // başka ürünün bitişi (eski plan) güncel satırı silmez
  expect(decideWrite(EX({ product_id: 'bes_2_aylik' }), IN({ active: false, expires_at: '2026-09-20T00:00:00Z' }), NOW)).toEqual({ write: false, reason: 'stale' });
  // aktarım: RevenueCat'in kesin bilgisi "yetki yok" ise yazılır
  expect(decideWrite(EX(), NONE, NOW, true)).toEqual({ write: true });
});

test('TRANSFER olayında aboneliği kaybeden kullanıcılar ayrılır', () => {
  const V = '99999999-2222-3333-4444-555555555555';
  expect(transferredAway({ type: 'TRANSFER', transferred_from: [U, '$RCAnonymousID:x'], transferred_to: [V] })).toEqual([U]);
  expect(transferredAway({ type: 'RENEWAL', transferred_from: [U] })).toEqual([]);
});
