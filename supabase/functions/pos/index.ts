// anahtar — Sanal POS (Supabase Edge Function, Deno). Yönetici panelinde "Paket ver" → Sanal POS.
//  POST {action:'status'}            (yönetici oturumu) → {configured, provider}: sağlayıcı bilgileri girilmiş mi
//  POST {action:'link', id}          (yönetici oturumu) → bekleyen ödeme isteği için sağlayıcıdan ödeme bağlantısı alır, isteğe yazar → {url}
//  POST|GET ?cb=1&ref=ANH-…          (sağlayıcının geri çağrısı, oturumsuz) → ödemenin durumunu SAĞLAYICIDAN sorar; ödendiyse pay_confirm
// Sağlayıcı ve gizli değerler: provider.ts. Bilgiler girilmeden bağlantı oluşturulmaz (panel "Sanal POS henüz bağlı değil" gösterir).

import { provider } from './provider.ts';
import { serviceClient, userClient } from '../_shared/keys.ts';
import { logger } from '../_shared/log.ts';
import { sentryServe } from '../_shared/sentry.ts';

const log = logger('pos');
const env = (k: string) => Deno.env.get(k) ?? '';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const APP = () => (env('APP_URL') || 'https://anahtar.io').replace(/\/+$/, '');

sentryServe('pos', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = new URL(req.url);
  const pos = provider(env);
  const db = serviceClient();

  // Sağlayıcı geri çağrısı: gövdeye güvenilmez, durum sağlayıcıdan sorulur.
  if (url.searchParams.get('cb')) {
    const ref = String(url.searchParams.get('ref') || '');
    if (!/^ANH-[0-9A-F]{6}$/.test(ref) || !pos.configured()) return json({ ok: false }, 400);
    try {
      const st = await pos.status(ref);
      if (st.paid) {
        const { data, error } = await db.rpc('pay_confirm', { pref: ref, provider_ref: st.providerRef ?? null });
        if (error) throw error;
        await log.info('POS ödemesi onaylandı', { ref, applied: data });
      }
      return json({ ok: true });
    } catch (e) { await log.error('POS geri çağrısı işlenemedi', { ref, err: String(e) }); return json({ ok: false }, 502); }
  }

  const auth = req.headers.get('authorization') || '';
  const { data: isAdmin } = await userClient(auth).rpc('is_admin');
  if (isAdmin !== true) return json({ error: 'Yönetici yetkisi gerekli' }, 403);
  const body = await req.json().catch(() => ({}));

  if (body.action === 'status') return json({ configured: pos.configured(), provider: pos.id });
  if (body.action === 'link') {
    if (!pos.configured()) return json({ error: 'Sanal POS henüz bağlı değil' }, 409);
    const { data: p } = await db.from('corp_payments').select('id, ref, amount, plan, units, status, method, user_id').eq('id', String(body.id || '')).maybeSingle();
    if (!p || p.method !== 'pos' || p.status !== 'pending') return json({ error: 'Bekleyen Sanal POS isteği bulunamadı' }, 404);
    const { data: u } = await db.auth.admin.getUserById(p.user_id);
    const { data: pr } = await db.from('profiles').select('name, phone').eq('id', p.user_id).maybeSingle();
    try {
      const cb = `${env('SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/pos?cb=1&ref=${p.ref}`;
      const r = await pos.createLink({ ref: p.ref, amount: Number(p.amount), description: `anahtar ${p.plan} paketi · ${p.units} mülk · ${p.ref}`,
        email: u?.user?.email || '', name: pr?.name || '', phone: pr?.phone || '', returnUrl: `${APP()}/odeme?ref=${p.ref}`, callbackUrl: cb });
      const { error } = await db.rpc('pay_set_link', { pid: p.id, prov: pos.id, url: r.url, pref: r.providerRef ?? null });
      if (error) throw error;
      return json({ url: r.url });
    } catch (e) { await log.error('POS bağlantısı alınamadı', { ref: p.ref, err: String(e) }); return json({ error: 'Ödeme bağlantısı alınamadı' }, 502); }
  }
  return json({ error: 'Geçersiz istek' }, 400);
});
