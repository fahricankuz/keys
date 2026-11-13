// Mağaza içi satın alma (iap.native.js), telefon bildirimi (native-push.native.js) ve sunucu ayarı (app-config.js):
// RevenueCat, expo-notifications ve backend küçük taklitlerle değiştirilir; alan mantığı Node'da esbuild ile paketlenip çalışır.
import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const D = new URL('../app/src/domain/', import.meta.url).pathname;
const STUBS = new URL('./stubs/', import.meta.url).pathname;

const FAKES = {
  'react-native': `export const Platform = globalThis.__platform; export default { Platform };`,
  'react-native-purchases': `
    const rc = () => globalThis.__rc;
    const P = {
      configure(o){ rc().configured = o; }, async logIn(){}, async logOut(){},
      async getProducts(ids){ rc().asked.push(ids[0]); if (rc().failProducts) throw new Error('store down'); return rc().products[ids[0]] || []; },
      async getCustomerInfo(){ return rc().info; },
      async purchaseStoreProduct(p, change){ rc().calls.push(['store', p.identifier, change || null]); if (rc().cancel) throw { userCancelled: true }; return {}; },
      async purchaseSubscriptionOption(o, change){ rc().calls.push(['option', o.storeProductId, o.id, change || null]); if (rc().cancel) throw { userCancelled: true }; return {}; },
      async restorePurchases(){ return rc().info; }, async showManageSubscriptions(){}
    };
    export default P;
    export const PRODUCT_CATEGORY = { SUBSCRIPTION: 'SUBSCRIPTION' };
    export const STORE_REPLACEMENT_MODE = { WITH_TIME_PRORATION: 'WITH_TIME_PRORATION', DEFERRED: 'DEFERRED' };`,
  'expo-notifications': `
    const n = () => globalThis.__notif;
    export const AndroidImportance = { HIGH: 4 };
    export function setNotificationHandler(){}
    export async function setNotificationChannelAsync(id){ n().channels.push(id); }
    export async function getPermissionsAsync(){ return n().perm; }
    export async function requestPermissionsAsync(){ n().asked++; n().perm = n().next; return n().perm; }
    export async function getDevicePushTokenAsync(){ return { data: n().token }; }
    export function addPushTokenListener(fn){ n().listener = fn; return { remove(){ n().listener = null; } }; }
    export async function getLastNotificationResponseAsync(){ return null; }
    export function addNotificationResponseReceivedListener(){ return { remove(){} }; }`
};

async function load(entry) {
  const out = join(mkdtempSync(join(tmpdir(), 'iap-')), 'm.mjs');
  await build({
    stdin: { contents: entry, resolveDir: D, loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { '@react-native-async-storage/async-storage': STUBS + 'async-storage.js' },
    plugins: [{
      name: 'fakes',
      setup(b) {
        b.onResolve({ filter: /^(react-native|react-native-purchases|expo-notifications)$/ }, (a) => ({ path: a.path, namespace: 'fake' }));
        b.onResolve({ filter: /(^|\/)backend\.js$/ }, () => ({ path: 'backend', namespace: 'fake' }));
        b.onLoad({ filter: /.*/, namespace: 'fake' }, (a) => ({
          loader: 'js',
          contents: a.path === 'backend'
            ? `export const live = globalThis.__live; export async function client(){ return globalThis.__client; } export async function refreshAccess(){ globalThis.__refreshed++; }`
            : FAKES[a.path]
        }));
      }
    }]
  });
  // Ortam değişkenleri yalnızca yükleme anında okunur (config.js); sonra geri alınır, başka testleri etkilemesin.
  const keep = { ...process.env };
  Object.assign(process.env, {
    EXPO_PUBLIC_SUPABASE_URL: 'https://proje.supabase.co', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'anon', EXPO_PUBLIC_RC_IOS_KEY: 'appl_test', EXPO_PUBLIC_RC_ANDROID_KEY: 'goog_test'
  });
  try { return await import(pathToFileURL(out).href); }
  finally { for (const k of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY', 'EXPO_PUBLIC_RC_IOS_KEY', 'EXPO_PUBLIC_RC_ANDROID_KEY']) { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; } }
}

const IAP = `export * from '${D}iap.native.js';`;
const PUSH = `export * from '${D}native-push.native.js'; export { storage } from '${D}storage.js';`;
const CFG = `export * from '${D}app-config.js';`;

function world(os) {
  globalThis.__platform = { OS: os };
  globalThis.__live = { user: { id: 'u1' }, access: null };
  globalThis.__refreshed = 0;
  globalThis.__invoked = [];
  globalThis.__client = { functions: { invoke: async (name) => { globalThis.__invoked.push(name); return {}; } } };
  globalThis.__rc = { asked: [], calls: [], products: {}, info: { entitlements: { active: {} } }, configured: null };
}

/** Play: RevenueCat her temel planı ayrı ürün olarak verir (tek:3-aylik); temel planın seçeneği ürünün içindedir. */
const playProduct = (sub, n, period, price) => ({
  identifier: `${sub}:${n}-${period}`, title: `${sub} ${n}`, priceString: price,
  subscriptionOptions: [{ id: `${n}-${period}`, isBasePlan: true, storeProductId: `${sub}:${n}-${period}`, productId: sub, fullPricePhase: { price: { formatted: price } } }]
});
const iosProduct = (id, price) => ({ identifier: id, title: id, priceString: price });
const playSub = (sub, base) => ({ entitlements: { active: { pro: { isActive: true, store: 'PLAY_STORE', productIdentifier: sub, productPlanIdentifier: base, latestPurchaseDateMillis: 1 } } } });

/* ------------------------------------------------------------------ iap.native.js */

test('Android: ürün temel planla bulunur (tek:3-aylik), fiyat seçenekten gelir ve sorgu önbelleğe alınır', async () => {
  world('android');
  const M = await load(IAP);
  globalThis.__rc.products.tek = [playProduct('tek', 3, 'aylik', '₺299,99'), playProduct('tek', 3, 'yillik', '₺2.999,99')];
  const p = await M.storeProduct('tek', 3, false);
  expect(p).toMatchObject({ id: 'tek_3_aylik', storeId: 'tek:3-aylik', price: '₺299,99' });
  expect((await M.storeProduct('tek', 3, true)).price).toBe('₺2.999,99');
  expect(await M.storeProduct('tek', 4, false)).toBeNull();                 // 4 mülk temel planı tanımlı değil
  expect(globalThis.__rc.asked).toEqual(['tek']);                            // abonelik kimliğiyle sorulur, bir kez
  expect(globalThis.__rc.configured).toMatchObject({ apiKey: 'goog_test', appUserID: 'u1' });
});

test('Android: etkin abonelik yoksa temel plan seçeneği satın alınır, değişiklik bilgisi yoktur; sunucu eşitlenir', async () => {
  world('android');
  const M = await load(IAP);
  globalThis.__rc.products.bes = [playProduct('bes', 2, 'yillik', '₺3.999,99')];
  expect(await M.buyStore('bes', 2, true)).toBe(true);
  expect(globalThis.__rc.calls).toEqual([['option', 'bes:2-yillik', '2-yillik', null]]);
  expect(globalThis.__invoked).toEqual(['billing']);
  expect(globalThis.__refreshed).toBe(1);
});

test('Android: etkin Play aboneliği varken yükseltme hemen (orantılı), düşürme ve dönem kısaltma dönem sonunda; eski ürün abonelik kimliğidir', async () => {
  world('android');
  const M = await load(IAP);
  globalThis.__rc.products.tek = [playProduct('tek', 2, 'aylik', 'x'), playProduct('tek', 3, 'yillik', 'x'), playProduct('tek', 3, 'aylik', 'x')];
  globalThis.__rc.products.bes = [playProduct('bes', 3, 'aylik', 'x')];
  globalThis.__rc.info = playSub('tek', '3-aylik');
  const last = () => globalThis.__rc.calls[globalThis.__rc.calls.length - 1][3];

  await M.buyStore('bes', 3, false);                                          // Başlangıç 3 → Profesyonel 3: yükseltme
  expect(last()).toEqual({ oldProductIdentifier: 'tek', replacementMode: 'WITH_TIME_PRORATION' });
  await M.buyStore('tek', 2, false);                                          // 3 → 2 mülk: düşürme
  expect(last()).toEqual({ oldProductIdentifier: 'tek', replacementMode: 'DEFERRED' });
  await M.buyStore('tek', 3, true);                                           // aylık → yıllık aynı paket: dönem sonunda
  expect(last()).toEqual({ oldProductIdentifier: 'tek', replacementMode: 'DEFERRED' });
  const n = globalThis.__rc.calls.length;
  await expect(M.buyStore('tek', 3, false)).rejects.toThrow(/zaten/);         // aynı ürün: ikinci abonelik açılmaz
  expect(globalThis.__rc.calls).toHaveLength(n);
});

test('Android: promosyon (bize ait olmayan) yetki değişiklik bilgisi sayılmaz; kullanıcı vazgeçerse false', async () => {
  world('android');
  const M = await load(IAP);
  globalThis.__rc.products.tek = [playProduct('tek', 1, 'aylik', 'x')];
  globalThis.__rc.info = { entitlements: { active: { pro: { isActive: true, store: 'PLAY_STORE', productIdentifier: 'rc_promo_pro', productPlanIdentifier: null } } } };
  await M.buyStore('tek', 1, false);
  expect(globalThis.__rc.calls[0][3]).toBeNull();
  globalThis.__rc.cancel = true;
  expect(await M.buyStore('tek', 1, false)).toBe(false);
});

test('iOS: ürün kimliği tek_3_aylik, satın alma purchaseStoreProduct ile (grup içi geçişi Apple yönetir)', async () => {
  world('ios');
  const M = await load(IAP);
  globalThis.__rc.products.tek_3_aylik = [iosProduct('tek_3_aylik', '₺299,99')];
  expect((await M.storeProduct('tek', 3, false)).price).toBe('₺299,99');
  expect(await M.buyStore('tek', 3, false)).toBe(true);
  expect(globalThis.__rc.calls).toEqual([['store', 'tek_3_aylik', null]]);
  expect(globalThis.__rc.configured.apiKey).toBe('appl_test');
});

test('mağaza hazır mı: ürün varsa true; ürün hatası ya da boş liste false (satın alma ve fiyat gizlenir)', async () => {
  world('android');
  let M = await load(IAP);
  expect(await M.storeReady()).toBe(false);                                  // ürün tanımsız
  world('android');
  M = await load(IAP);
  globalThis.__rc.products.tek = [playProduct('tek', 1, 'aylik', 'x')];
  expect(await M.storeReady()).toBe(true);
  world('ios');
  M = await load(IAP);
  globalThis.__rc.failProducts = true;
  expect(await M.storeReady()).toBe(false);                                  // mağaza hatası
});

test('öne gelince eşitleme: yalnız mağaza aboneliği 2 gün içinde bitiyorsa ya da bitmişse, 6 saatte bir', async () => {
  world('ios');
  const M = await load(IAP);
  const L = globalThis.__live;
  const day = 86400000;
  L.access = { subscribed: true, store: 'app_store', expiresAt: new Date(Date.now() + 20 * day).toISOString() };
  expect(await M.syncStoreIfDue()).toBe(false);
  L.access = { subscribed: true, store: 'admin', expiresAt: new Date(Date.now() + day).toISOString() };
  expect(await M.syncStoreIfDue()).toBe(false);                               // elle verilen paket mağazaya sorulmaz
  L.access = { subscribed: true, store: 'play_store', expiresAt: new Date(Date.now() + day).toISOString() };
  expect(await M.syncStoreIfDue()).toBe(true);
  expect(await M.syncStoreIfDue()).toBe(false);                               // az önce eşitlendi
  expect(globalThis.__invoked).toEqual(['billing']);
});

/* ------------------------------------------------------------------ native-push.native.js */

function pushWorld(os, perm) {
  world(os);
  globalThis.__notif = { perm, next: { granted: true, canAskAgain: true }, asked: 0, channels: [], token: 'tok-1', listener: null };
  globalThis.__rpc = []; globalThis.__table = [];
  globalThis.__client.rpc = async (fn, args) => { globalThis.__rpc.push([fn, args]); return globalThis.__rpcResult ? globalThis.__rpcResult(fn) : { error: null }; };
  globalThis.__client.from = (tb) => ({
    upsert: async (row, o) => { globalThis.__table.push(['upsert', tb, row, o]); return { error: null }; },
    delete: () => ({ eq: async (c, v) => { globalThis.__table.push(['delete', tb, c, v]); return { error: null }; } })
  });
  globalThis.__rpcResult = null;
}
const GRANTED = { granted: true, canAskAgain: true }, ASK = { granted: false, canAskAgain: true }, DENIED = { granted: false, canAskAgain: false };

test('bildirim: izin zaten varsa sessizce register_device_token ile kaydedilir; izin yoksa pencere AÇILMAZ', async () => {
  pushWorld('ios', GRANTED);
  let M = await load(PUSH);
  expect(await M.registerDevice()).toBe('on');
  expect(globalThis.__rpc).toEqual([['register_device_token', { p_token: 'tok-1', p_platform: 'ios' }]]);
  pushWorld('android', ASK);
  M = await load(PUSH);
  expect(await M.registerDevice()).toBe('ask');
  expect(globalThis.__notif.asked).toBe(0);
  expect(globalThis.__notif.channels).toEqual(['evim']);                     // Android kanalı izin sorulmadan önce açılır
  expect(globalThis.__rpc).toEqual([]);
  expect(await M.pushPermission()).toBe('ask');
  pushWorld('ios', DENIED);
  M = await load(PUSH);
  expect(await M.registerDevice()).toBe('denied');
});

test('bildirim: sistem izni yalnızca enableDevicePush ile sorulur ve verilirse cihaz kaydedilir', async () => {
  pushWorld('ios', ASK);
  const M = await load(PUSH);
  expect(await M.enableDevicePush()).toBe('on');
  expect(globalThis.__notif.asked).toBe(1);
  expect(globalThis.__rpc[0]).toEqual(['register_device_token', { p_token: 'tok-1', p_platform: 'ios' }]);
  pushWorld('ios', ASK);
  globalThis.__notif.next = DENIED;
  const N = await load(PUSH);
  expect(await N.enableDevicePush()).toBe('denied');
  expect(globalThis.__rpc).toEqual([]);
});

test('bildirim: işlev henüz yoksa (PGRST202) eski tablo yolu kullanılır', async () => {
  pushWorld('android', GRANTED);
  globalThis.__rpcResult = () => ({ error: { code: 'PGRST202', message: 'Could not find the function public.register_device_token' } });
  const M = await load(PUSH);
  expect(await M.registerDevice()).toBe('on');
  expect(globalThis.__table).toEqual([['upsert', 'device_tokens', { token: 'tok-1', user_id: 'u1', platform: 'android' }, { onConflict: 'token' }]]);
});

test('bildirim: çıkışta anahtar uygulama yeniden başlatılmış olsa da (bellekte yokken) cihazdan okunup unregister_device_token ile silinir', async () => {
  pushWorld('ios', GRANTED);
  const M = await load(PUSH);                                                // yeni süreç: registerDevice hiç çağrılmadı
  await M.unregisterDevice();
  expect(globalThis.__rpc).toEqual([['unregister_device_token', { p_token: 'tok-1' }]]);
  pushWorld('ios', GRANTED);
  globalThis.__rpcResult = () => ({ error: { code: '42883', message: 'function public.unregister_device_token(text) does not exist' } });
  const N = await load(PUSH);
  await N.unregisterDevice();
  expect(globalThis.__table).toEqual([['delete', 'device_tokens', 'token', 'tok-1']]);
});

test('bildirim: iOS dokunuşunda url kökte, body içinde (nesne ya da JSON metni) ya da trigger.payload altında olabilir; dış adres panele döner', async () => {
  pushWorld('ios', GRANTED);
  const M = await load(PUSH);
  const r = (content, trigger) => ({ notification: { request: { content: { data: content }, trigger } } });
  expect(M.pathOf(r({ url: '/uygulama/talepler' }))).toBe('/uygulama/talepler');
  expect(M.pathOf(r({ body: { url: '/uygulama/sitem' } }))).toBe('/uygulama/sitem');
  expect(M.pathOf(r({ body: '{"url":"/uygulama/mesajlar"}' }))).toBe('/uygulama/mesajlar');
  expect(M.pathOf(r({}, { payload: { body: { url: '/uygulama/belgeler' } } }))).toBe('/uygulama/belgeler');
  expect(M.pathOf(r({}, { payload: { url: '/uygulama/odemeler' } }))).toBe('/uygulama/odemeler');
  for (const bad of ['https://kotu.example/', '//kotu.example/', '/\\kotu.example/', 12]) expect(M.pathOf(r({ url: bad }))).toBe('/uygulama');
  expect(M.pathOf(null)).toBe('/uygulama');
});

test('bildirim izni açıklaması: ilk oturumda gösterilmez; ikinci oturumdan itibaren, reddedilirse 14 gün sonra, en çok 3 kez', async () => {
  pushWorld('ios', ASK);
  const M = await load(PUSH);
  M.noteSession(); M.noteSession();                                           // aynı açılışta iki çağrı tek oturum sayılır
  expect(await M.shouldPrimePush()).toBe(false);
  M.storage.setItem('anahtar-bildirim-oturum:u1', '2');                      // ikinci açılış
  expect(await M.shouldPrimePush()).toBe(true);
  M.markPrimed();
  expect(await M.shouldPrimePush()).toBe(false);                              // "Şimdi değil": 14 gün sorulmaz
  M.storage.setItem('anahtar-bildirim-sorulan-at:u1', String(Date.now() - 15 * 86400000));
  expect(await M.shouldPrimePush()).toBe(true);
  M.storage.setItem('anahtar-bildirim-sorulan:u1', '3');
  expect(await M.shouldPrimePush()).toBe(false);                              // üç kez soruldu
  globalThis.__notif.perm = GRANTED;
  M.storage.setItem('anahtar-bildirim-sorulan:u1', '0');
  expect(await M.shouldPrimePush()).toBe(false);                              // izin zaten verilmiş
});

/* ------------------------------------------------------------------ app-config.js */

test('billing_paused: değer sunucudan okunur ve önbelleğe alınır; hata ya da anlaşılmaz değerde config.js yedeği kullanılır', async () => {
  const sel = (res) => ({ from: (tb) => { expect(tb).toBe('app_config'); return { select: () => ({ eq: (c, v) => { expect([c, v]).toEqual(['key', 'billing_paused']); return { maybeSingle: async () => res }; } }) }; } });
  world('ios');
  globalThis.__client = sel({ data: { key: 'billing_paused', value: false }, error: null });
  let M = await load(CFG);
  expect(M.billingPaused()).toBe(true);                                       // yüklenene kadar yedek
  expect(await M.loadAppConfig()).toBe(false);
  expect(M.billingPaused()).toBe(false);
  globalThis.__client = sel({ data: null, error: { message: 'permission denied' } });
  expect(await M.loadAppConfig(true)).toBe(false);                            // hata: önceki değer kalır
  world('ios');
  globalThis.__client = sel({ data: null, error: { message: 'relation "app_config" does not exist' } });
  M = await load(CFG);
  expect(await M.loadAppConfig()).toBe(true);                                 // hiç okunamadı: yedek (true)
  world('ios');
  globalThis.__client = sel({ data: { value: 'abc' }, error: null });
  M = await load(CFG);
  expect(await M.loadAppConfig()).toBe(true);                                 // anlaşılmayan değer: yedek
  expect([true, false, 'true', 'false', 1, 0, { paused: false }, { value: 'true' }, 'x', null].map(M.parsePaused)).toEqual([true, false, true, false, true, false, false, true, null, null]);
});
