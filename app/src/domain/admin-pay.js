/* Kurumsal ödeme (yönetici paneli): banka hesapları, ödeme istekleri (Havale/EFT, Sanal POS), sonuçlandırma.
   Sunucu: supabase/migrations/*_kurumsal_odeme.sql (pay_accounts, corp_payments, admin_pay_request, admin_pay_set) ve
   supabase/functions/pos (Sanal POS bağlantısı; sağlayıcı bilgileri girilene kadar kapalı). */
import { t } from './i18n.js';
import { client } from './backend.js';
import { waLink } from './wa.js';
import { tl } from './util.js';

function must(res){ if (res.error) throw res.error; return res.data; }

/** IBAN: boşluksuz, büyük harf; geçerliyse TR + 24 rakam. */
export const ibanClean = (s) => String(s || '').replace(/\s+/g, '').toUpperCase();
export const ibanOk = (s) => /^TR\d{24}$/.test(ibanClean(s));
export const ibanShow = (s) => ibanClean(s).replace(/(.{4})/g, '$1 ').trim();

export async function loadPayAccounts(){
  const c = await client();
  return must(await c.from('pay_accounts').select('*').order('created_at')) || [];
}
export async function savePayAccount(a){
  const c = await client();
  const row = { bank: String(a.bank || '').trim(), holder: String(a.holder || '').trim(), iban: ibanClean(a.iban), note: String(a.note || '').trim(), is_default: !!a.is_default };
  if (row.is_default) must(await c.from('pay_accounts').update({ is_default: false }).eq('is_default', true));
  must(a.id ? await c.from('pay_accounts').update(row).eq('id', a.id) : await c.from('pay_accounts').insert(row));
}
export async function deletePayAccount(id){
  const c = await client();
  must(await c.from('pay_accounts').delete().eq('id', id));
}
export async function loadCorpPayments(){
  const c = await client();
  return must(await c.from('corp_payments').select('*').order('created_at', { ascending: false }).limit(200)) || [];
}
/** p: {method, plan, units, sector, until, amount, account_id, why} → {id, ref, email, phone, name, account}. */
export async function payRequest(uid, p){
  const c = await client();
  return must(await c.rpc('admin_pay_request', { uid, p }));
}
export async function paySet(id, st){
  const c = await client();
  must(await c.rpc('admin_pay_set', { pid: id, st }));
}
/** Sanal POS bağlı mı: {configured, provider}. Fonksiyona ulaşılamazsa kapalı sayılır. */
export async function posStatus(){
  try { const c = await client(); const r = await c.functions.invoke('pos', { body: { action: 'status' } }); return r.error ? { configured: false } : r.data; }
  catch { return { configured: false }; }
}
export async function posLink(id){
  const c = await client();
  const r = await c.functions.invoke('pos', { body: { action: 'link', id } });
  if (r.error || !r.data?.url) throw new Error(t('Ödeme bağlantısı alınamadı.'));
  return r.data.url;
}

/** Müşteriye WhatsApp ile gidecek ödeme metni. */
export function payText(r, amount){
  const a = r.account || {};
  return r.url
    ? t('Merhaba, anahtar paketinin ödemesini bu bağlantıdan kartla yapabilirsin: {url} (tutar {amount}, ödeme kodu {ref}).', { url: r.url, amount: tl(amount), ref: r.ref })
    : t('Merhaba, anahtar paketinin ödeme bilgileri: Tutar {amount} · Banka {bank} · Alıcı {holder} · IBAN {iban} · Açıklamaya ödeme kodunu yaz: {ref}', {
        amount: tl(amount), bank: a.bank || '', holder: a.holder || '', iban: ibanShow(a.iban), ref: r.ref });
}
export const payWa = (r, amount) => waLink(r.phone || '', payText(r, amount));
