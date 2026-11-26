/* Duyurular: kullanıcıya uygulama içi kart / şerit ve yönetici panelinde (Müşteriler › Duyurular) hazırlama ve gönderim.
   Sunucu: supabase/migrations/*_duyurular.sql (announcements, announcement_recipients, my_announcements, announcement_mark,
   admin_announcement_save / _count / _test / _send / _cancel, admin_announcements, announcement_unsubscribe). */
import { client } from './backend.js';
import { getLang, t } from './i18n.js';

function must(res){ if (res.error) throw res.error; return res.data; }

export const KINDS = () => [['info', t('Bilgilendirme')], ['feature', t('Yeni özellik')], ['maintenance', t('Bakım')]];
export const kindLabel = (k) => (KINDS().find((x) => x[0] === k) || KINDS()[0])[1];
export const ROLES = () => [['landlord', t('Mülk sahibi')], ['tenant', t('Kiracı')], ['resident', t('Site sakini')], ['org', t('Kurum yöneticisi')], ['team', t('Ekip')]];

/** Duyurunun kullanıcının dilindeki metni (İngilizce boşsa Türkçe). */
export function localized(a){
  const en = getLang() === 'en' && a.title_en;
  return { title: en ? a.title_en : a.title, body: en ? (a.body_en || a.body) : a.body, cta: en ? (a.cta_en || a.cta) : a.cta };
}

/** Bana gelen, kapatmadığım duyurular (sunucuya ulaşılamazsa boş liste). */
export async function myAnnouncements(){
  try { const c = await client(); return must(await c.rpc('my_announcements')) || []; } catch { return []; }
}
/** 'seen' | 'dismiss' | 'click' (hata yutulur: duyuru gösterimini bozmaz). */
export async function markAnnouncement(id, what){
  try { const c = await client(); must(await c.rpc('announcement_mark', { aid: id, what })); } catch { /* yok say */ }
}
export async function unsubscribeAnnouncements(token){
  const c = await client();
  return must(await c.rpc('announcement_unsubscribe', { t: token }));
}

// ---- Yönetici ----
export async function adminAnnouncements(){ const c = await client(); return must(await c.rpc('admin_announcements')) || []; }
export async function adminAnnouncementCount(audience){ const c = await client(); return must(await c.rpc('admin_announcement_count', { aud: audience || {} })); }
export async function adminAnnouncementSave(a){ const c = await client(); return must(await c.rpc('admin_announcement_save', { p: a })); }
export async function adminAnnouncementTest(id){ const c = await client(); must(await c.rpc('admin_announcement_test', { aid: id })); }
/** {quiet:true} gece saati uyarısı (force ile yeniden çağrılır), {scheduled:true} ya da {sent:true, recipients}. */
export async function adminAnnouncementSend(id, force = false){ const c = await client(); return must(await c.rpc('admin_announcement_send', { aid: id, force })); }
export async function adminAnnouncementCancel(id){ const c = await client(); must(await c.rpc('admin_announcement_cancel', { aid: id })); }

/** Form → sunucu yükü. Bitiş/başlangıç "GG.AA.YYYY SS:DD" ya da boş. */
export function parseWhen(s){
  const m = String(s || '').trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4] || 0), Number(m[5] || 0));
  return isNaN(d.getTime()) ? null : d.toISOString();
}
