/* Mağaza içi satın alma: web sürümü. Web'de satın alma sanal POS sayfasından (/satin-al) yapılır;
   bu dosya yalnız telefon sürümüyle aynı arayüzü verir. Telefon: iap.native.js (RevenueCat). */

export const storeAvailable = () => false;
export async function storeProduct(plan, units, yearly){ void plan; void units; void yearly; return null; }
export async function buyStore(plan, units, yearly){ void plan; void units; void yearly; throw new Error('Mağaza bu cihazda kullanılamıyor.'); }
export async function restoreStore(){ return false; }
export async function manageStore(){ return false; }
export async function logOutStore(){}
