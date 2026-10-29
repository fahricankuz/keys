/* Mülk sahibi aboneliği.

   Kiracılar ücretsizdir. Mülk sahibi 1 aylık (30 gün) denemeyle başlar; süre bitince
   abonelik yoksa kayıtlar salt okunur olur (okuma ve mesajlaşma açık). Paketler mülk
   sayısına göre fiyatlanır: mülk başına aylık / yıllık, 1–9 mülk; 10 ve üstü Kurumsal (plans.js).
   Satın alma App Store / Google Play üzerinden RevenueCat ile yapılır; bu
   sürümde web, abonelik durumunu gösterir ve telefondan abone olmayı anlatır. */

import { t } from './i18n.js';
import { CONFIG, LIVE } from './config.js';
import { S, ui, save } from './state.js';
import { storage } from './storage.js';
import { live } from './backend.js';
import { tiers, FEATURES, maxUnits } from './plans.js';

export { PLAN_LABEL, planLabel, tiers, tierOf, unitsText, rangeText, priceText, monthlyEquivalent, totalPrice, totalText, productId, parseProduct, maxUnits, tierPoints, FEATURES } from './plans.js';

const DAY = 86400000;
export const TRIAL_DAYS = 30;


/** Hesap açılış zamanı (auth.tsx ayarlar); deneme buradan sayılır. */
export const account = { since: Date.now(), subscribed: null };

export function access(){
  if (LIVE) return live.access || { access:true, pending:true };
  const d = ui.demoBilling;
  if (d && d.state === 'subscribed')
    return { access:true, subscribed:true, inTrial:false, store:'demo', willRenew:true, productId:d.plan, plan:d.plan,
      units:(tiers().find(x => x.id === d.plan) || { units:null }).units,
      expiresAt: new Date(Date.now() + 30 * DAY).toISOString() };
  const ends = account.since + TRIAL_DAYS * DAY;
  if ((d && d.state === 'expired') || Date.now() > ends)
    return { access:false, subscribed:false, inTrial:false, trialDays:TRIAL_DAYS };
  return { access:true, subscribed:false, inTrial:true, trialDays:TRIAL_DAYS, trialEnds:new Date(ends).toISOString(),
    plan:'trial', units:CONFIG.billing.trialUnits };
}

export function trialDaysLeft(a = access()){
  if (!a.inTrial || !a.trialEnds) return 0;
  return Math.max(0, Math.ceil((Date.parse(a.trialEnds) - Date.now()) / DAY));
}

/** Görünüm mülk sahibiyse ve erişimi yoksa kayıt değiştirilemez. */
export function canWrite(){
  return ui.role !== 'landlord' || access().access !== false;
}

/** Satın alma kapalı mı (fiyatlar henüz tanımlı değil). */
export function paused(){ return !!CONFIG.billing.paused; }

/** Paketin mülk sınırı; null = sınırsız. */
export function unitLimit(a = access()){ return a && a.units !== undefined ? a.units : null; }

/** Mülk sahibinin kendi mülk sayısı (ekip olarak eriştikleri sayılmaz). */
export function ownedCount(){
  const id = live.user?.id;
  return S.order.filter(pid => !S.props[pid]?.ownerId || !id || S.props[pid].ownerId === id).length;
}

/** n mülk daha eklenebilir mi? Eklenemezse önerilen yol döner: 'adet' (satın alınan mülk sayısını artır) ya da
    'kurumsal' (10 ve üstü); need: istenen toplam mülk sayısı. */
export function roomFor(n = 1, have = ownedCount(), a = access()){
  const limit = unitLimit(a);
  if (limit == null || have + n <= limit) return { ok:true, limit, have };
  const need = have + n;
  return { ok:false, limit, have, need, suggest: need > maxUnits() ? 'kurumsal' : 'adet' };
}

/** Paket bu özelliği içeriyor mu? (plans.js → FEATURES). Plan bilinmiyorsa açık kabul edilir. */
export function hasFeature(f, a = access()){
  if (ui.role !== 'landlord') return true;
  const plan = a && a.plan;
  if (!plan) return true;
  return (FEATURES[f] || []).includes(plan);
}

/* ---- Satın alma sayfasındaki seçim ---------------------------------
   Ödeme sistemi bağlanana kadar "1 ay ücretsiz başla" kayda yönlendirir. Seçilen paket, mülk adedi ve dönem
   önce cihazda tutulur, mülk sahibi hesabıyla oturum açılınca profil ayarlarına (profiles.settings.planChoice)
   yazılır; yönetici panelinde Abonelikler'de görünür, satın alma açılınca bu seçimle başlanır. */
export const PLAN_CHOICE = 'anahtar-paket-secimi';

export function savePlanChoice(c){
  if (!c || !['tek', 'bes'].includes(c.plan)) return;
  S.settings.planChoice = { plan: c.plan, units: Math.max(1, Number(c.units) || 1), yearly: !!c.yearly, at: new Date().toISOString() };
  save();
}
/** Cihazda bekleyen seçimi mülk sahibinin profiline taşır (girişten hemen sonra). */
export function adoptPlanChoice(role){
  let c = null;
  try { c = JSON.parse(storage.getItem(PLAN_CHOICE) || 'null'); } catch(e){}
  if (!c) return;
  if (role === 'landlord') savePlanChoice(c);
  try { storage.removeItem(PLAN_CHOICE); } catch(e){}
}
