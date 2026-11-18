// Hizmet ve tedarikçi sözleşmeleri (migration site_sozlesmeler): asansör bakımı, sigorta, temizlik… Bitiş hatırlatmasını sunucu gönderir
// (site_contract_reminders, her gün 09:10 İstanbul). Okuma: Giderler ya da Raporlar yetkisi; yazma: Giderler yetkisi.
import { t } from './i18n.js';
import { client } from './backend.js';
import { iso, parse, t0, between } from './util.js';

export const CONTRACT_KINDS = () => [
  ['asansor', t('Asansör bakımı')], ['sigorta', t('Sigorta')], ['temizlik', t('Temizlik')], ['guvenlik', t('Güvenlik')],
  ['bahce', t('Bahçe ve peyzaj')], ['bakim', t('Teknik bakım')], ['diger', t('Diğer')]
];
export const CONTRACT_PERIODS = () => [['yillik', t('Yıllık')], ['aylik', t('Aylık')], ['tek', t('Tek seferlik')]];
export const contractKindLabel = (k) => (CONTRACT_KINDS().find(([x]) => x === k) || [k, t('Diğer')])[1];

/** Bitişe kalan gün (bugün 0; geçmişse eksi). */
export const daysLeft = (c, today = t0()) => between(today, parse(c.ends_on));

/** "30, 15, 7" → [30, 15, 7]: 1–365 arası, en çok 5, tekrarsız, büyükten küçüğe. */
export function parseRemind(s) {
  const list = [...new Set(String(s || '').split(/[^0-9]+/).filter(Boolean).map(Number).filter((n) => n >= 1 && n <= 365))].sort((a, b) => b - a);
  return list.slice(0, 5);
}

/** Yenileme: yeni dönem eski bitişin ertesi günü başlar; yıllıkta 1 yıl, aylıkta 1 ay sürer (tek seferlikte 1 yıl önerilir). */
export function renewed(c) {
  const start = parse(c.ends_on); start.setDate(start.getDate() + 1);
  const end = new Date(start); if (c.period === 'aylik') end.setMonth(end.getMonth() + 1); else end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  return { starts_on: iso(start), ends_on: iso(end) };
}

function must(res) { if (res.error) throw res.error; return res.data; }

export async function loadContracts(oid) {
  const c = await client();
  return must(await c.from('site_contracts').select('*').eq('org_id', oid).order('ends_on'));
}

export async function saveContract(oid, x) {
  const vendor = String(x.vendor || '').trim();
  if (!vendor) throw new Error(t('Firma adını yaz.'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x.ends_on || ''))) throw new Error(t('Bitiş tarihini seç.'));
  if (x.starts_on && x.starts_on > x.ends_on) throw new Error(t('Başlangıç bitişten sonra olamaz.'));
  const remind = Array.isArray(x.remind_days) ? x.remind_days : parseRemind(x.remind_days);
  if (!remind.length) throw new Error(t('En az bir hatırlatma günü yaz (ör. 30, 15, 7).'));
  const row = {
    org_id: oid, kind: x.kind || 'diger', vendor: vendor.slice(0, 120), phone: String(x.phone || '').trim().slice(0, 30),
    starts_on: x.starts_on || null, ends_on: x.ends_on, amount: x.amount === '' || x.amount == null ? null : Number(x.amount),
    period: ['aylik', 'yillik', 'tek'].includes(x.period) ? x.period : 'yillik', remind_days: remind,
    note: String(x.note || '').trim().slice(0, 500), updated_at: new Date().toISOString()
  };
  const c = await client();
  if (x.id) return must(await c.from('site_contracts').update(row).eq('id', x.id));
  return must(await c.from('site_contracts').insert(row).select().single());
}

export async function deleteContract(id) {
  const c = await client();
  return must(await c.from('site_contracts').delete().eq('id', id));
}
