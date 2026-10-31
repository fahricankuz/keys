// anahtar — yeni kurumsal başvuru, "Bize ulaş" talebi ve hukuki destek talebini info@anahtar.io'ya e-postalar
// (Supabase Edge Function, Deno).
//
// Kurulum: Supabase → Database → Webhooks → yeni webhook: tablo public.support_requests, olay INSERT,
// tür "Supabase Edge Functions" → lead-mail, başlık x-anahtar-secret: <LEAD_SECRET>.
// Hukuki destek için aynı ayarlarla ikinci bir webhook: tablo public.legal_requests, olay INSERT.
// Gizli değişkenler: LEAD_SECRET, RESEND_API_KEY, EMAIL_FROM; isteğe bağlı LEAD_TO (varsayılan info@anahtar.io), APP_URL.

const env = (k: string) => Deno.env.get(k) ?? '';

function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const KIND: Record<string, string> = { kurumsal: 'Kurumsal paket başvurusu', import: 'Toplu içe aktarma desteği', upgrade: 'Paket yükseltme', genel: 'Genel soru' };

const TOPIC: Record<string, string> = { gecikme: 'Kira gecikmesi', artis: 'Kira artışı', tahliye: 'Tahliye', depozito: 'Depozito', sozlesme: 'Sözleşme', diger: 'Diğer' };

/** Hukuki destek talebi (schema.sql 22. bölüm) e-posta satırlarına. */
function legalRecord(x: any) {
  const c = x.contact ?? {}, p = x.context?.property ?? {};
  const late = (x.context?.payments ?? []).filter((m: any) => m.status === 'late').map((m: any) => m.month).join(', ');
  return {
    ref: 'H-' + String(x.no ?? 0).padStart(4, '0'), name: c.name, email: c.email, company: '', message: x.body,
    rows: [
      ['Ad soyad', c.name], ['E-posta', c.email], ['Telefon', c.phone], ['Rol', x.role === 'tenant' ? 'Kiracı' : 'Mülk sahibi'],
      ['Konu', TOPIC[x.topic] ?? x.topic], ['Mülk', x.property_name], ['Adres', p.addr], ['Geciken aylar', late],
      ['Ek dosya', String((x.files ?? []).length)], ['Ücret', (x.price ?? 3000) + ' TL (KDV dahil)']
    ].filter(([, v]) => String(v ?? '').trim()) as [string, string][]
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const secret = env('LEAD_SECRET');
  if (!secret || !safeEqual(req.headers.get('x-anahtar-secret') ?? '', secret)) return new Response('unauthorized', { status: 401 });
  if (!env('RESEND_API_KEY') || !env('EMAIL_FROM')) return Response.json({ error: 'RESEND_API_KEY / EMAIL_FROM eksik' }, { status: 500 });

  const body = await req.json().catch(() => ({}));
  const legal = body.table === 'legal_requests';
  const r = legal ? legalRecord(body.record ?? {}) : body.record ?? {};
  const d = r.details ?? {};
  const rows: [string, string][] = legal ? r.rows : [
    ['Ad soyad', r.name], ['Şirket / kurum', r.company], ['E-posta', r.email], ['Telefon', r.phone],
    ['Mülk adedi', r.units ?? ''], ['Mülk tipi', (d.types ?? []).join(', ')], ['Rol', d.role], ['Şehir', d.city],
    ['Başlangıç', d.timeline], ['Kaynak', r.source === 'web' ? 'Web sitesi formu' : 'Uygulama içi']
  ].filter(([, v]) => String(v ?? '').trim()) as [string, string][];
  const title = legal ? 'Hukuki destek talebi ' + r.ref : KIND[r.kind] ?? 'Talep';
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:auto;color:#1D1A19">
<div style="background:#C8302E;color:#FAF5F0;border-radius:18px 18px 0 0;padding:20px 24px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#FAF5F0;border-radius:12px;padding:9px 14px"><img src="https://anahtar.io/mail/anahtar-logo-mail.png" width="140" height="26" alt="anahtar" style="display:block;border:0;outline:none;text-decoration:none"></td></tr></table>
<div style="font-weight:800;font-size:24px;margin-top:10px">${esc(title)}</div></div>
<div style="border:1px solid #E8DDD5;border-top:0;border-radius:0 0 18px 18px;padding:18px 24px;background:#FFFDFB">
<table style="width:100%;border-collapse:collapse;font-size:15px">${rows.map(([k, v]) => `<tr><td style="padding:7px 0;color:#5C4F4A;width:38%">${esc(k)}</td><td style="padding:7px 0;font-weight:600">${esc(v)}</td></tr>`).join('')}</table>
${r.message ? `<div style="margin-top:12px;padding:14px;background:#F3ECE5;border-radius:12px;white-space:pre-wrap">${esc(r.message)}</div>` : ''}
<p style="margin:16px 0 0;font-size:13px;color:#A39A95">Yönetici paneli → ${legal ? 'Hukuki talepler' : 'Talepler'} bölümünde de görünür${env('APP_URL') ? `: ${esc(env('APP_URL'))}/admin` : ''}.</p></div></div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env('RESEND_API_KEY')}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env('EMAIL_FROM'), to: env('LEAD_TO') || 'info@anahtar.io', reply_to: r.email || undefined,
      subject: `${title}: ${r.company || r.name || r.email || ''}`.trim(),
      html, text: rows.map(([k, v]) => `${k}: ${v}`).join('\n') + (r.message ? `\n\n${r.message}` : '')
    })
  });
  if (!res.ok) return Response.json({ error: await res.text() }, { status: 502 });
  return Response.json({ ok: true });
});
