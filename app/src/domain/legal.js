/* Hukuki süreç desteği: talep başına ücretli ek hizmet (tüm paketlerde, mülk sahibi ve kiracı).

   Hizmet idari takip ve koordinasyondur: anahtar ekibi talebi inceler, ödemeyi alır ve anlaşmalı hukuk bürosuna
   elle iletir. Talebi yalnız açan kişi ve anahtar yöneticileri görür; karşı taraf görmez.
   Sunucu kuralları: supabase/schema.sql 22. bölüm (fiyat, durum ve iletişim bilgisi sunucuda belirlenir). */

import { t } from './i18n.js';
import { CONFIG, LIVE } from './config.js';
import { client, live, storeFile } from './backend.js';
import { storedPath } from './mapping.js';
import { emit, ui } from './state.js';
import { P, statusOf, expectedAt, moveOutSummary, lesseeLabel } from './logic.js';
import { mkey, t0 } from './util.js';

function must(res){
  if (res.error) throw res.error;
  return res.data;
}

export const LEGAL_PRICE = () => CONFIG.legalPrice;

/** Konular (sırası formdaki sıradır). */
export const TOPICS = () => [
  { key: 'gecikme', label: t('Kira gecikmesi') },
  { key: 'artis', label: t('Kira artışı') },
  { key: 'tahliye', label: t('Tahliye') },
  { key: 'depozito', label: t('Depozito') },
  { key: 'sozlesme', label: t('Sözleşme') },
  { key: 'diger', label: t('Diğer') }
];
export const topicLabel = (k) => (TOPICS().find((x) => x.key === k) || { label: k }).label;

/** Durumlar: ad ve renk tonu. Akış: alındı → ödeme alındı → büroya iletildi → sonuçlandı (ya da iptal). */
export const STEPS = ['received', 'paid', 'forwarded', 'closed'];
export const STATUS = () => ({
  received: [t('Alındı'), 'neutral'],
  paid: [t('Ödeme alındı'), 'accent'],
  forwarded: [t('Büroya iletildi'), 'warn'],
  closed: [t('Sonuçlandı'), 'ok'],
  cancelled: [t('İptal edildi'), 'neutral']
});
export const statusLabel = (s) => (STATUS()[s] || [s])[0];
export const legalRef = (no) => 'H-' + String(no || 0).padStart(4, '0');

/** Gerçek hesapta mı? Örnek modda talep gönderilmez. */
export const legalReady = () => LIVE && !!live.user;

/* ---- Kişinin talepleri ---------------------------------------------- */

export const myLegal = () => live.legal || [];

export async function refreshLegal(redraw = true){
  if (!legalReady()) return [];
  try {
    live.legal = must(await (await client()).from('legal_requests').select('*').eq('user_id', live.user.id)) || [];
    live.legal.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  } catch(e){ console.warn('Hukuki talepler okunamadı', e); }
  if (redraw) emit();
  return live.legal || [];
}

/** Talebe kendiliğinden eklenenler: mülk özeti, sözleşme belgeleri ve son 12 ayın kira ödemeleri. */
export function legalContext(pid){
  const p = pid ? P(pid) : null;
  if (!p) return { property: null, docs: [], payments: [] };
  const docs = (p.docs || []).filter((d) => d.cat === 'Kira sözleşmesi' || d.cat === 'Tahliye taahhütnamesi')
    .map((d) => ({ name: d.name, cat: d.cat, path: d.path ? storedPath(d.path) || null : null }));
  const today = t0(), payments = [];
  for (let i = 0; i < 12; i++){
    const key = mkey(new Date(today.getFullYear(), today.getMonth() - i, 1));
    if (p.startDate && key < String(p.startDate).slice(0, 7)) break;
    const rec = (p.pay || {})[key] || {};
    payments.push({ month: key, status: statusOf(p, key), expected: expectedAt(p, key), paid: rec.amount != null ? Number(rec.amount) : null, date: rec.date || null });
  }
  const mo = p.moveOut ? moveOutSummary(p) : null;
  return {
    property: {
      name: p.name, addr: p.addr || '', type: p.type, rent: p.rent, deposit: p.deposit || 0,
      start: p.startDate || null, end: p.contractEnd || null,
      landlord: p.landlord?.name || '', tenant: lesseeLabel(p) || '',
      moveOut: mo ? { date: p.moveOut.date || null, deducted: mo.deducted, refund: mo.refund, refunded: !!p.moveOut.refunded } : null
    },
    docs, payments
  };
}

/** Talep açar: ek dosyalar kişinin "hukuk-<kimlik>" klasörüne yüklenir.
    @param {{ pid?: string, topic: string, body: string, files?: any[] }} req */
export async function openLegal(req){
  const { pid, topic, body, files = [] } = req;
  if (!legalReady()) throw new Error(t('Talep göndermek için hesabınla giriş yap.'));
  const folder = 'hukuk-' + live.user.id;
  const up = [];
  for (const f of files){
    const stored = await storeFile(folder, f);
    const path = stored ? storedPath(stored) : null;
    if (!path) throw new Error(t('Dosya yüklenemedi'));
    up.push({ name: f.name || t('Belge'), path });
  }
  const p = pid ? P(pid) : null;
  const row = must(await (await client()).from('legal_requests').insert({
    user_id: live.user.id, role: ui.role === 'tenant' ? 'tenant' : 'landlord',
    property_id: p ? p.id : null, property_name: p ? p.name : '',
    topic, body: String(body || '').trim(), files: up, context: legalContext(p ? p.id : null)
  }).select('*').single());
  live.legal = [row, ...myLegal().filter((r) => r.id !== row.id)];
  emit();
  return row;
}

/** İnceleme başlamadan (durum "alındı") talebi iptal eder. */
export async function cancelLegal(id){
  must(await (await client()).from('legal_requests').update({ status: 'cancelled' }).eq('id', id));
  await refreshLegal();
}

/* ---- anahtar yöneticisi (yönetici paneli) ------------------------- */

export async function adminLegal(){
  const c = await client();
  const rows = must(await c.from('legal_requests').select('*').order('created_at', { ascending: false })) || [];
  const notes = must(await c.from('legal_notes').select('request_id, note')) || [];
  const byId = Object.fromEntries(notes.map((n) => [n.request_id, n.note]));
  return rows.map((r) => ({ ...r, note: byId[r.id] || '' }));
}

/** Durum ve kişiye görünen yanıt (değişince kişiye bildirim gider). */
export async function adminLegalSave(id, patch){
  must(await (await client()).from('legal_requests').update(patch).eq('id', id));
}

/** Ekibin iç notu (kişi görmez). */
export async function adminLegalNote(id, note){
  must(await (await client()).from('legal_notes').upsert({ request_id: id, note: String(note || ''), updated_at: new Date().toISOString() }));
}
