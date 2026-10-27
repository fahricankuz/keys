/* Yönetici paneli verisi (Supabase). Yönetici satır kuralları gereği tüm kayıtları okur
   (supabase/schema.sql → admin_* politikaları). Bu modül ham satırları panel için birleştirir. */

import { client, humanError } from './backend.js';
import { derive } from './admin-derive.js';

function must(res){
  if (res.error) throw res.error;
  return res.data;
}

/** Tüm veriyi okur ve panelin kullanacağı biçime çevirir. */
export async function loadAdmin(){
  const c = await client();
  const [users, props, members, invites, payments, reviews] = await Promise.all([
    c.rpc('admin_users'),
    c.from('properties').select('id, owner_id, name, addr, rent, due_day, prop_type, created_at'),
    c.from('memberships').select('property_id, user_id, role, display_name, phone, email'),
    c.from('invites').select('code, property_id, name, email, phone, accepted_by, expires_at'),
    c.from('payments').select('property_id, month, status, amount, paid_on, receipt_name, receipt_path, reject_reason, updated_at'),
    c.from('reviews').select('kind, property_id, ref_id, uploader, label, path, amount, status, note, reviewed_at, created_at')
  ].map(p => p.then(must)));
  return derive({ users, props, members, invites, payments, reviews });
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

/** "Bize ulaş" talepleri (kurumsal, içe aktarma, genel). */
export async function loadSupport(){
  const c = await client();
  return must(await c.from('support_requests')
    .select('id, user_id, kind, units, name, email, phone, message, status, created_at')
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
