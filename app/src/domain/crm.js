/* CRM (yönetici paneli): potansiyel aboneler, pipeline aşamaları, potansiyel getiri ve not geçmişi (migration crm).
   Potansiyel getiri: paket fiyatı × mülk adedi (yıllık pakette aylık karşılığı yıllık fiyatın 1/12'si); Kurumsal'da elle girilen aylık tutar. */
import { t } from './i18n.js';
import { CONFIG } from './config.js';

export const STAGES = () => [
  { key: 'yeni', label: t('Yeni') },
  { key: 'iletisim', label: t('İletişime geçildi') },
  { key: 'gorusme', label: t('Görüşme / demo') },
  { key: 'teklif', label: t('Teklif') },
  { key: 'kazanildi', label: t('Kazanıldı') },
  { key: 'kaybedildi', label: t('Kaybedildi') }
];
export const OPEN_STAGES = ['yeni', 'iletisim', 'gorusme', 'teklif'];
export const SOURCES = () => [['web', t('Web formu')], ['telefon', t('Telefon')], ['referans', t('Referans')], ['etkinlik', t('Etkinlik')], ['sosyal', t('Sosyal medya')], ['diger', t('Diğer')]];
export const stageLabel = (k) => (STAGES().find((s) => s.key === k) || { label: k }).label;

/** Potansiyel aylık ve yıllık getiri (TL); fiyatı tanımsızsa (Kurumsal, tutar girilmemiş) null. */
export function potential(lead, tiers = CONFIG.billing.tiers){
  if (lead.plan === 'kurumsal'){
    const m = Number(lead.monthly_value);
    return m > 0 ? { monthly: m, yearly: m * 12 } : null;
  }
  const tier = tiers.find((x) => x.id === lead.plan);
  if (!tier || tier.price == null) return null;
  const units = Math.max(1, Number(lead.units) || 1);
  const monthly = lead.yearly && tier.yearly != null ? (tier.yearly * units) / 12 : tier.price * units;
  return { monthly, yearly: monthly * 12 };
}

/** Aşama toplamları ve pipeline değeri (açık aşamalar). */
export function pipeline(leads = []){
  const by = Object.fromEntries(STAGES().map((s) => [s.key, { count: 0, monthly: 0 }]));
  leads.forEach((l) => {
    const p = potential(l);
    const g = by[l.stage] || (by[l.stage] = { count: 0, monthly: 0 });
    g.count++; g.monthly += p ? p.monthly : 0;
  });
  const open = OPEN_STAGES.reduce((a, k) => a + by[k].monthly, 0);
  const won = by.kazanildi.count, lost = by.kaybedildi.count;
  return { by, openMonthly: open, openYearly: open * 12, winRate: won + lost ? won / (won + lost) : null };
}

/** Takip durumu: takip günü geçmiş ya da bugünse "due"; açık kişi 30 günden uzun süredir aranmadıysa "idle". */
export function followUp(lead, today = new Date()){
  if (!OPEN_STAGES.includes(lead.stage)) return null;
  const d = today.toISOString().slice(0, 10);
  if (lead.next_at && String(lead.next_at).slice(0, 10) <= d) return 'due';
  const last = Date.parse(lead.last_contact_at || lead.created_at || '');
  if (last && (today.getTime() - last) / 864e5 >= 30) return 'idle';
  return null;
}

/* ---- sunucu ---- */
async function db(){ const { client } = await import('./backend.js'); return client(); }
function must(r){ if (r.error) throw r.error; return r.data; }

export async function loadLeads(){
  const c = await db();
  const [leads, notes] = await Promise.all([
    c.from('crm_leads').select('*').order('updated_at', { ascending: false }),
    c.from('crm_notes').select('*').order('created_at', { ascending: false })
  ]);
  return { leads: must(leads) || [], notes: must(notes) || [] };
}

const FIELDS = ['name', 'phone', 'email', 'company', 'sector', 'plan', 'units', 'yearly', 'monthly_value', 'stage', 'source', 'next_at', 'lost_reason', 'note', 'request_id', 'org_id', 'user_id'];
export async function saveLead(l){
  const row = Object.fromEntries(FIELDS.filter((k) => k in l).map((k) => [k, l[k] === '' && ['next_at', 'monthly_value', 'request_id', 'org_id', 'user_id'].includes(k) ? null : l[k]]));
  row.units = Math.max(1, Number(row.units) || 1);
  if (row.monthly_value != null) row.monthly_value = Number(String(row.monthly_value).replace(',', '.')) || null;
  const c = await db();
  if (l.id) return must(await c.from('crm_leads').update(row).eq('id', l.id).select().single());
  return must(await c.from('crm_leads').insert(row).select().single());
}
export async function setStage(id, stage){ must(await (await db()).from('crm_leads').update({ stage }).eq('id', id)); }
export async function deleteLead(id){ must(await (await db()).from('crm_leads').delete().eq('id', id)); }
export async function addLeadNote(id, note){ must(await (await db()).from('crm_notes').insert({ lead_id: id, note: String(note).trim() })); }
