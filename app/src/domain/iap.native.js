/* Mağaza içi satın alma: telefon sürümü (App Store / Google Play, RevenueCat üzerinden).
   Kullanıcı RevenueCat'e Supabase kimliğiyle bağlanır; satın almadan sonra billing fonksiyonu RevenueCat'ten okuyup
   subscriptions tablosuna yazar (webhook gecikse de erişim hemen açılır). Web: iap.js (sanal POS). */

import { Platform } from 'react-native';
import Purchases, { PRODUCT_CATEGORY } from 'react-native-purchases';
import { t } from './i18n.js';
import { CONFIG, LIVE } from './config.js';
import { client, live, refreshAccess } from './backend.js';
import { storeProductId } from './store-ids.js';

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

/** Seçilen paket, adet ve dönemin mağaza ürünü (fiyat metni mağazanın para birimiyle). Bulunamazsa null. */
export async function storeProduct(plan, units, yearly){
  const P = await rc();
  const id = storeProductId(plan, units, yearly, Platform.OS);
  // Google Play: abonelik kimliğiyle ("tek_3") sorulur, temel planlar "tek_3:aylik" ve "tek_3:yillik" olarak döner.
  const ask = Platform.OS === 'android' ? id.split(':')[0] : id;
  const list = await P.getProducts([ask], PRODUCT_CATEGORY.SUBSCRIPTION);
  const p = (list || []).find((x) => x.identifier === id);
  return p ? { id, price: p.priceString, title: p.title, product: p } : null;
}

/** Satın alma. true: abonelik açıldı; false: kullanıcı vazgeçti. */
export async function buyStore(plan, units, yearly){
  const p = await storeProduct(plan, units, yearly);
  if (!p) throw new Error(t('Bu paket mağazada bulunamadı.'));
  try { await Purchases.purchaseStoreProduct(p.product); }
  catch (e) { if (e && e.userCancelled) return false; throw e; }
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

/** Çıkışta RevenueCat kimliği bırakılır (sonraki hesap kendi kimliğiyle bağlanır). */
export async function logOutStore(){
  if (!configured || !rcUser) return;
  try { await Purchases.logOut(); } catch {}
  rcUser = null;   // sonraki girişte rc() aynı yapılandırmayla logIn yapar
}
