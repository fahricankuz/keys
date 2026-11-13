/* Mağaza içi satın alma: telefon sürümü (App Store / Google Play, RevenueCat üzerinden).
   Kullanıcı RevenueCat'e Supabase kimliğiyle bağlanır; satın almadan sonra billing fonksiyonu RevenueCat'ten okuyup
   subscriptions tablosuna yazar (webhook gecikse de erişim hemen açılır). Web: iap.js.

   iOS: 36 ayrı abonelik (tek_3_aylik …) tek abonelik grubunda; geçişi (yükseltme, düşürme, dönem değişimi) Apple yönetir.
   Android: 2 abonelik (`tek`, `bes`) × 18 temel plan (`3-aylik`); RevenueCat bunları `tek:3-aylik` diye verir. Satın alma temel planın
   seçeneğiyle yapılır. Kullanıcının etkin bir Play aboneliği varsa Play'e eski ürün ve değiştirme kipi verilir, böylece plan değişikliği
   paralel ikinci abonelik açmaz: yükseltme hemen başlar (kalan süre orantılı hesaba katılır), düşürme ve dönem kısaltma dönem sonunda. */

import { Platform } from 'react-native';
import Purchases, { PRODUCT_CATEGORY, STORE_REPLACEMENT_MODE } from 'react-native-purchases';
import { t } from './i18n.js';
import { CONFIG, LIVE } from './config.js';
import { client, live, refreshAccess } from './backend.js';
import { storeProductId, parseStoreProductId, playSubscriptionId, playBasePlanId, changeKind, STORE_PLANS } from './store-ids.js';

const android = () => Platform.OS === 'android';
const key = () => (Platform.OS === 'ios' ? CONFIG.billing.revenuecatIosKey : CONFIG.billing.revenuecatAndroidKey);
export const storeAvailable = () => LIVE && (Platform.OS === 'ios' || Platform.OS === 'android') && !!key();

let configured = false, rcUser = null;
async function rc(){
  const uid = live.user?.id;
  if (!uid) throw new Error(t('Önce giriş yap.'));
  if (!storeAvailable()) throw new Error(t('Mağaza bu cihazda kullanılamıyor.'));
  if (!configured){ Purchases.configure({ apiKey: key(), appUserID: uid }); configured = true; rcUser = uid; }
  else if (rcUser !== uid){ await Purchases.logIn(uid); rcUser = uid; }
  return Purchases;
}

/** Sunucudaki aboneliği RevenueCat'ten tazeler, sonra erişim durumunu yeniden okur. */
async function sync(){
  try { await (await client()).functions.invoke('billing', { body: {} }); } catch (e) { console.warn('Abonelik eşitlenemedi', e); }
  await refreshAccess();
}

/* ---- Ürünleri bulma ---------------------------------------------------------------------------------------------- */

const CACHE_MS = 60 * 1000;
const lists = new Map();    // sorgu kimliği → { at, items }

/** Mağaza ürünlerini sorar; aynı sorgu kısa süre önbellekten gelir (adet değiştikçe ağa gidilmez). */
async function fetchProducts(P, ask){
  const hit = lists.get(ask);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.items;
  const items = (await P.getProducts([ask], PRODUCT_CATEGORY.SUBSCRIPTION)) || [];
  lists.set(ask, { at: Date.now(), items });
  return items;
}

/** Android: temel planın satın alma seçeneği (abonelik seçeneklerinde temel plan kimliğiyle eşleşen). */
function baseOption(product, basePlan){
  return (product.subscriptionOptions || []).find((o) => o.isBasePlan && o.id === basePlan) || null;
}

/** Seçilen paket, adet ve dönemin mağaza ürünü. Fiyat metni mağazanın para birimiyle gelir. Bulunamazsa null.
    Dönen: { id (kanonik: tek_3_aylik), storeId (iOS: aynı; Android: tek:3-aylik), price, title, product, option }. */
export async function storeProduct(plan, units, yearly){
  const P = await rc();
  const id = storeProductId(plan, units, yearly, 'ios');
  const storeId = storeProductId(plan, units, yearly, Platform.OS);
  const ask = android() ? playSubscriptionId(plan) : id;
  const list = await fetchProducts(P, ask);
  let product = list.find((x) => x.identifier === storeId) || null;
  let option = null;
  if (android()){
    const basePlan = playBasePlanId(units, yearly);
    // RevenueCat Play abonelikleri temel plan başına ayrı ürün (`tek:3-aylik`) verir; tek temel planlı eski biçimde seçenekler ürünün içindedir.
    if (!product) product = list.find((x) => baseOption(x, basePlan)) || null;
    if (!product) return null;      // temel plan bu abonelikte tanımlı değil ya da etkin değil
    option = baseOption(product, basePlan);
  } else if (!product) return null;
  const price = (option && option.fullPricePhase && option.fullPricePhase.price && option.fullPricePhase.price.formatted) || product.priceString;
  return { id, storeId, price, title: product.title, product, option };
}

/** Mağaza gerçekten satış yapabiliyor mu? Anahtar yoksa false; anahtar varsa bir ürün sorgusu yapılır (ağ ya da mağaza
    hatası, ürünlerin tanımsız olması = false). Başarı 1 dakika, hata 15 saniye hatırlanır (arayüz tekrar tekrar sormasın). */
let probeAt = 0, probeOk = false, probing = null;
export async function storeReady(){
  if (!storeAvailable()) return false;
  const ttl = probeOk ? 60000 : 15000;
  if (probeAt && Date.now() - probeAt < ttl) return probeOk;
  if (probing) return probing;
  probing = (async () => {
    try {
      const P = await rc();
      const ask = android() ? playSubscriptionId('tek') : storeProductId('tek', 1, false, 'ios');
      lists.delete(ask);
      probeOk = (await fetchProducts(P, ask)).length > 0;
    } catch { probeOk = false; }
    probeAt = Date.now(); probing = null;
    return probeOk;
  })();
  return probing;
}

/* ---- Satın alma ------------------------------------------------------------------------------------------------- */

/** Android: etkin bir Play aboneliği varsa değişiklik bilgisi (eski ürün + değiştirme kipi), yoksa null. Aynı ürünse hata fırlatır. */
async function androidChangeInfo(P, target){
  const info = await P.getCustomerInfo();
  const active = Object.values((info && info.entitlements && info.entitlements.active) || {})
    .filter((e) => e && e.isActive !== false && e.store === 'PLAY_STORE')
    .sort((a, b) => (b.latestPurchaseDateMillis || 0) - (a.latestPurchaseDateMillis || 0));
  const cur = active[0];
  if (!cur) return null;
  const parts = String(cur.productIdentifier || '').split(':');
  const subId = parts[0];
  if (!STORE_PLANS.includes(subId)) return null;               // bizim aboneliğimiz değil (ör. promosyon yetkisi)
  const basePlan = cur.productPlanIdentifier || parts[1] || '';
  const from = parseStoreProductId(subId + ':' + basePlan);
  const kind = changeKind(CONFIG.billing.tiers, from, target);
  if (kind === 'same') throw new Error(t('Bu paket zaten aboneliğinde. Değiştirmek için başka bir paket seç.'));
  // Play'de değiştirilen aboneliğin kimliği temel plansız abonelik kimliğidir (oldProductIdentifier = "tek" / "bes").
  return {
    oldProductIdentifier: subId,
    replacementMode: kind === 'upgrade' ? STORE_REPLACEMENT_MODE.WITH_TIME_PRORATION : STORE_REPLACEMENT_MODE.DEFERRED
  };
}

/** Satın alma. true: abonelik açıldı; false: kullanıcı vazgeçti. */
export async function buyStore(plan, units, yearly){
  const p = await storeProduct(plan, units, yearly);
  if (!p) throw new Error(t('Bu paket mağazada bulunamadı.'));
  try {
    if (android()){
      const change = await androidChangeInfo(Purchases, { plan, units, yearly: !!yearly });
      if (p.option) await Purchases.purchaseSubscriptionOption(p.option, change);
      else await Purchases.purchaseStoreProduct(p.product, change);
    } else {
      // iOS: abonelik grubundaki geçişi (yükseltme hemen, düşürme dönem sonunda) Apple yönetir.
      await Purchases.purchaseStoreProduct(p.product);
    }
  } catch (e) { if (e && e.userCancelled) return false; throw e; }
  await sync();
  return true;
}

/** Satın alımları geri yükle (yeni telefon, uygulamayı yeniden kurma). true: etkin abonelik bulundu. */
export async function restoreStore(){
  const P = await rc();
  const info = await P.restorePurchases();
  await sync();
  return !!(info && info.entitlements && Object.keys(info.entitlements.active || {}).length);
}

/** Mağazanın abonelik yönetimi ekranı (iptal, dönem değiştirme). */
export async function manageStore(){
  const P = await rc();
  await P.showManageSubscriptions();
  return true;
}

/** Öne gelince: mağaza aboneliğinin süresi 2 gün içinde bitiyor ya da bitmişse sunucudaki kayıt RevenueCat'ten tazelenir
    (kaçan webhook'ları yakalar; günlük sunucu taramasının ikinci güvencesi). 6 saatte en çok bir kez. true: tazelendi. */
const DUE_MS = 2 * 86400000, EVERY_MS = 6 * 3600000;
let lastDue = 0;
export async function syncStoreIfDue(){
  if (!LIVE || !live.user?.id) return false;
  const a = live.access;
  if (!a || !['app_store', 'play_store'].includes(String(a.store))) return false;
  const exp = a.expiresAt ? Date.parse(a.expiresAt) : NaN;
  if (!(exp - Date.now() < DUE_MS)) return false;
  if (Date.now() - lastDue < EVERY_MS) return false;
  lastDue = Date.now();
  await sync();
  return true;
}

/** Çıkışta RevenueCat kimliği bırakılır (sonraki hesap kendi kimliğiyle bağlanır). */
export async function logOutStore(){
  lastDue = 0; lists.clear(); probeAt = 0;
  if (!configured || !rcUser) return;
  try { await Purchases.logOut(); } catch {}
  rcUser = null;   // sonraki girişte rc() aynı yapılandırmayla logIn yapar
}
