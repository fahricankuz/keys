/* Yönetici paneli verisi (Supabase). Yönetici satır kuralları gereği tüm kayıtları okur
   (supabase/schema.sql → admin_* politikaları). Bu modül ham satırları panel için birleştirir. */

import { client, humanError } from './backend.js';
import { derive } from './admin-derive.js';

function must(res){
  if (res.error) throw res.error;
  return res.data;
}

/** Tüm veriyi okur ve panelin kullanacağı biçime çevirir. */
/** Sunucu tek istekte en çok 1000 satır döndürür: listeler sayfa sayfa (sıralı) okunur, hiçbiri sessizce eksik kalmaz. */
const PAGE = 1000;
async function all(make){
  const out = [];
  for (let from = 0; ; from += PAGE){
    const q = make();
    if (typeof q.range !== 'function') return must(await q) || [];
    const rows = must(await q.range(from, from + PAGE - 1)) || [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}
/** Ödemeler son `months` ay (panelde "Daha eski ödemeleri yükle" ile artar); denetimde bekleyenlerin hepsi ve son 500 karar. */
const monthsAgo = (n) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - (n - 1)); return d.toISOString().slice(0, 7); };

export async function loadAdmin({ months = 12 } = {}){
  const c = await client();
  const from = monthsAgo(months);
  const [users, props, members, invites, payments, pending, decided] = await Promise.all([
    all(() => { const q = c.rpc('admin_users'); return typeof q.order === 'function' ? q.order('id') : q; }),
    all(() => c.from('properties').select('id, owner_id, name, addr, rent, due_day, prop_type, created_at').order('id')),
    all(() => c.from('memberships').select('property_id, user_id, role, display_name, phone, email').order('property_id').order('user_id')),
    all(() => c.from('invites').select('code, property_id, name, email, phone, accepted_by, expires_at').order('code')),
    all(() => c.from('payments').select('property_id, month, kind, status, amount, paid_on, receipt_name, receipt_path, reject_reason, updated_at')
      .gte('month', from).order('month', { ascending: false }).order('property_id').order('kind')),
    all(() => c.from('reviews').select('kind, property_id, ref_id, uploader, label, path, amount, status, note, reviewed_at, created_at')
      .eq('status', 'pending').order('created_at')),
    c.from('reviews').select('kind, property_id, ref_id, uploader, label, path, amount, status, note, reviewed_at, created_at')
      .neq('status', 'pending').order('created_at', { ascending: false }).limit(500).then(must)
  ]);
  return Object.assign(derive({ users, props, members, invites, payments, reviews: [...pending, ...(decided || [])] }), { months, paymentsFrom: from });
}

export { derive };

/** Hesabı askıya alır (gerekçe zorunlu) ya da kaldırır. */
export async function setBan(uid, ban, why){
  const c = await client();
  must(await c.rpc('admin_set_ban', { uid, ban, why: why || '' }));
}

/** Mesajlaşması olan mülkler (özet). */
export async function loadThreads(){
  const c = await client();
  return must(await c.rpc('admin_threads'));
}

/** Bir mülkün yazışması, eskiden yeniye. Her okuma denetim kaydına yazılır. */
export async function loadMessages(pid){
  const c = await client();
  const rows = must(await c.rpc('admin_messages', { pid, lim: 300 }));
  return rows.slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

export async function deleteMessage(mid){
  const c = await client();
  must(await c.rpc('admin_delete_message', { mid }));
}

/** Yöneticinin yaptığı işlemlerin değiştirilemez kaydı. */
export async function loadAudit(){
  const c = await client();
  return must(await c.rpc('admin_audit_log', { lim: 300 }));
}

/** Genel bakış göstergeleri (son `days` gün). */
export async function loadKpis(days = 30){
  const c = await client();
  return must(await c.rpc('admin_kpis', { days }));
}

/** Mülk sahiplerinin deneme / paket durumu. */
export async function loadSubscriptions(){
  const c = await client();
  return must(await c.rpc('admin_subscriptions')) || [];
}

export async function extendTrial(uid, addDays, why){
  const c = await client();
  return must(await c.rpc('admin_extend_trial', { uid, add_days: addDays, why }));
}

/** Paket ver ya da kaldır (plan boşsa kaldırılır); until boşsa süresiz. */
export async function setPlan(uid, plan, until, why){
  const c = await client();
  must(await c.rpc('admin_set_plan', { uid, plan: plan || '', until: until || null, why }));
}

/** Yasal kira artış oranları (TÜFE 12 aylık ortalama), yeni aydan eskiye. */
export async function loadCpi(){
  const c = await client();
  return must(await c.from('cpi_rates').select('month, avg12, source, updated_at').order('month', { ascending: false }).limit(60)) || [];
}

/** Bir ayın oranını girer ya da siler (rate boşsa). */
export async function setCpi(month, rate){
  const c = await client();
  must(await c.rpc('admin_set_cpi', { m: month, rate: rate === '' || rate == null ? null : Number(rate) }));
}

/** "Bize ulaş" talepleri (kurumsal, içe aktarma, genel). */
export async function loadSupport(){
  const c = await client();
  return must(await c.from('support_requests')
    .select('id, user_id, kind, units, name, email, phone, message, company, source, details, status, created_at')
    .order('created_at', { ascending: false })) || [];
}

export async function setSupportStatus(id, status){
  const c = await client();
  must(await c.from('support_requests').update({ status }).eq('id', id));
}

/** Bir yüklemeye karar verir. Red için gerekçe zorunludur (veritabanı da zorunlu tutar). */
export async function decide(r, status, note){
  const c = await client();
  must(await c.from('reviews').update({ status, note: status === 'rejected' ? note : null })
    .eq('kind', r.kind).eq('property_id', r.property_id).eq('ref_id', r.ref_id));
}

/** Önizleme için kısa ömürlü adres. */
export async function previewUrl(path){
  if (!path) return null;
  const c = await client();
  const res = await c.storage.from('evim').createSignedUrl(path, 60 * 30);
  return (res.data && res.data.signedUrl) || null;
}

export { humanError };

/** Anahtar ekibi: bir müşteri (mülk sahibi ya da kurum master yöneticisi) adına mülk ekler.
    Dönen: { id, count, limit, over } — over: sözleşme / paket sınırı aşıldı. */
export async function adminAddProperty(ownerId, p){
  const c = await client();
  return must(await c.rpc('admin_add_property', { owner_uid: ownerId, p }));
}

/** Uygulama hata kaydı (schema.sql 25. bölüm): son 500 kayıt, yeniden eskiye. */
export async function loadErrors(){
  const c = await client();
  return must(await c.from('client_errors').select('id, at, user_id, route, message, stack, kind, platform, version')
    .order('at', { ascending: false }).limit(500)) || [];
}
/** Tüm hata kayıtlarını siler (düzeltilen sürüm yayınlandıktan sonra). */
export async function clearErrors(){
  const c = await client();
  must(await c.from('client_errors').delete().gte('id', 0));
}
