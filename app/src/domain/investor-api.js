/* Yatırımcı raporu sunucu işlemleri: dönem notu (public.site_investor_notes) ve "mailime gönder" (investor_report_mail). */
import { client } from './backend.js';

function must(res){ if (res.error) throw res.error; return res.data; }

export async function loadInvestorNote(oid, period){
  const c = await client();
  const rows = must(await c.from('site_investor_notes').select('note').eq('org_id', oid).eq('period', period));
  return (rows && rows[0] && rows[0].note) || '';
}

/** Boş not satırı siler (raporda bölüm görünmez). */
export async function saveInvestorNote(oid, period, note){
  const c = await client();
  const text = String(note || '').trim().slice(0, 2000);
  if (!text) { must(await c.from('site_investor_notes').delete().eq('org_id', oid).eq('period', period)); return ''; }
  must(await c.from('site_investor_notes').upsert({ org_id: oid, period, note: text, updated_at: new Date().toISOString() }, { onConflict: 'org_id,period' }));
  return text;
}

export async function mailInvestorReport(oid, period, summary){
  must(await (await client()).rpc('investor_report_mail', { oid, period, summary }));
}
