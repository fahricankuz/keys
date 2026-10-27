// Abonelik: RevenueCat kaydının tablo satırına çevrilmesi.
import { test, expect } from '@playwright/test';
import { rowFromSubscriber, affectedUsers, isUserId } from '../supabase/functions/billing/subscriber.ts';

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
