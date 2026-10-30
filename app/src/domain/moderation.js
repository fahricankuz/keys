/* Kullanıcı içeriği: bildir ve engelle (App Store 1.2, Google Play kullanıcı içeriği politikası).
   Sunucu kuralları: supabase/schema.sql 26. bölüm. Engellenen kişinin mesajları sunucuda gizlenir ve ondan mesaj bildirimi
   gelmez; bildirimler yönetici paneli → Şikâyetler'e düşer. */

import { t } from './i18n.js';
import { client, live, refreshProperty } from './backend.js';
import { emit } from './state.js';

function must(res){
  if (res.error) throw res.error;
  return res.data;
}
const db = async () => client();

export const REASONS = () => [
  { key: 'taciz', label: t('Taciz ya da tehdit') },
  { key: 'uygunsuz', label: t('Uygunsuz içerik') },
  { key: 'spam', label: t('Spam ya da dolandırıcılık') },
  { key: 'diger', label: t('Diğer') }
];
export const reasonLabel = (k) => (REASONS().find((r) => r.key === k) || { label: k }).label;

/** Engellediğim kişiler (kimlik kümesi). */
export const myBlocks = () => live.blocks || [];
export const isBlocked = (uid) => !!uid && myBlocks().some((b) => b.blocked === uid);

export async function refreshBlocks(redraw = true){
  if (!live.user) return [];
  try {
    live.blocks = must(await (await db()).from('user_blocks').select('blocked, created_at').eq('user_id', live.user.id)) || [];
  } catch(e){ console.warn('Engel listesi okunamadı', e); }
  if (redraw) emit();
  return live.blocks || [];
}

/** @param {{ pid?: string, kind: string, ref?: string, user?: string | null, reason: string, note?: string, snapshot?: string }} r */
export async function reportContent(r){
  const { pid, kind, ref = '', user = null, reason, note = '', snapshot = '' } = r;
  must(await (await db()).from('content_reports').insert({
    reporter: live.user?.id, property_id: pid || null, kind, ref_id: String(ref || ''), reported_user: user || null,
    reason, note: String(note || '').slice(0, 1000), snapshot: String(snapshot || '').slice(0, 2000)
  }));
}

/** Engeller ya da engeli kaldırır; yazışma sunucudan yeniden okunur (mesajlar gizlenir ya da geri gelir). */
export async function setBlocked(uid, on, pid){
  const c = await db();
  if (on) must(await c.from('user_blocks').upsert({ user_id: live.user?.id, blocked: uid }));
  else must(await c.from('user_blocks').delete().eq('user_id', live.user?.id).eq('blocked', uid));
  await refreshBlocks(false);
  if (pid) await refreshProperty(pid, true);
  emit();
}

/* ---- anahtar yöneticisi ---- */

export async function adminReports(){
  return must(await (await db()).from('content_reports').select('*').order('created_at', { ascending: false }).limit(500)) || [];
}
export async function closeReport(id, resolution){
  must(await (await db()).from('content_reports').update({ status: 'done', resolution: String(resolution || '') }).eq('id', id));
}
