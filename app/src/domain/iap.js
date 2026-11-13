/* Mağaza içi satın alma: web sürümü. Web'de satın alma yoktur: abonelik iPhone ve Android uygulamasından başlar (satın alma sayfası
   /satin-al bunu anlatır); bu dosya yalnız telefon sürümüyle (iap.native.js) aynı arayüzü verir. */

export const storeAvailable = () => false;
export async function storeReady(){ return false; }
export async function storeProduct(plan, units, yearly){ void plan; void units; void yearly; return null; }
export async function buyStore(plan, units, yearly){ void plan; void units; void yearly; throw new Error('Mağaza bu cihazda kullanılamıyor.'); }
export async function restoreStore(){ return false; }
export async function manageStore(){ return false; }
export async function syncStoreIfDue(){ return false; }
export async function logOutStore(){}
