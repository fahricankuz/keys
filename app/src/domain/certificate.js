/* Kira geçmişi belgesi: kiracı onaylı kira ödemelerinden belge üretir; belge herkese açık bir kodla doğrulanır
   (anahtar.io/belge?kod=…). Sunucu kuralları: supabase/migrations/*_kira_gecmisi_belgesi.sql. */

import { client } from './backend.js';
import { CONFIG } from './config.js';

function must(res){
  if (res.error) throw res.error;
  return res.data;
}
export const certUrl = (code) => CONFIG.publicUrl.replace(/\/?$/, '/') + 'belge?kod=' + encodeURIComponent(code);

/** @returns {Promise<{ code: string, data: any }>} */
export async function createCertificate(pid, from, to){
  return must(await (await client()).rpc('create_rent_certificate', { pid, from_month: from, to_month: to }));
}
export async function myCertificates(pid){
  const r = await (await client()).from('rent_certificates').select('code, from_month, to_month, created_at').eq('property_id', pid).order('created_at', { ascending: false });
  return r.error ? [] : r.data || [];
}
export async function verifyCertificate(code){
  const r = await (await client()).rpc('verify_rent_certificate', { cert: String(code || '').trim().toUpperCase() });
  return r.error ? null : r.data;
}
