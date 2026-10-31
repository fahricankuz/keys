// anahtar — kiracı davet e-postasının HTML'i. Saf işlev (Deno ve Node'da çalışır; testler önizleme üretir).
// E-posta istemcileri için: tablo düzeni, satır içi stil, görsel yok, sistem yazı tipi (welcome/template.ts ile aynı dil).

export type InviteInput = { code: string; name?: string; email?: string; owner?: string; property?: string; lang?: string; appUrl: string; expires?: string | null };

const C = { tugla: '#C8302E', kirec: '#FAF5F0', kart: '#FFFDFB', baca: '#1D1A19', kahve: '#5C4F4A', duman: '#A39A95', kil: '#E8DDD5', zemin: '#F3ECE5' };
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
/** Marka logosu (kenarlıksız, koyu zeminli; anahtar.io/mail altında yayında durur). */
const LOGO_URL = 'https://anahtar.io/mail/anahtar-logo-mail.png';
const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const TXT = {
  tr: {
    subject: (o: string, p: string) => `${o || 'Mülk sahibin'} seni ${p ? p + ' için ' : ''}anahtar’a davet etti`,
    hi: (n: string) => (n ? `Merhaba ${n},` : 'Merhaba,'),
    lead: (o: string, p: string) => `${o || 'Mülk sahibin'}, ${p ? `<b>${p}</b> için ` : ''}seni anahtar’a davet etti. Kira ödemeleri, arıza talepleri, belgeler ve yazışmalar tek yerde; kiracı hesabı her zaman ücretsiz.`,
    leadText: (o: string, p: string) => `${o || 'Mülk sahibin'}, ${p ? p + ' için ' : ''}seni anahtar’a davet etti.`,
    codeLabel: 'Davet kodun', cta: 'Hesabımı oluştur', note: 'Bağlantı ad, e-posta ve davet kodunu senin için doldurur; yalnızca şifre belirlemen yeterli.',
    expires: (d: string) => `Kod ${d} tarihine kadar geçerli.`, ifNot: 'Bu daveti beklemiyorsan e-postayı yok sayabilirsin.',
    foot: 'anahtar · Kira işinin anahtarı · anahtar.io', date: (d: Date) => d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' })
  },
  en: {
    subject: (o: string, p: string) => `${o || 'Your landlord'} invited you to anahtar${p ? ' for ' + p : ''}`,
    hi: (n: string) => (n ? `Hi ${n},` : 'Hi,'),
    lead: (o: string, p: string) => `${o || 'Your landlord'} invited you to anahtar${p ? ` for <b>${p}</b>` : ''}. Rent payments, repair requests, documents and messages in one place; a tenant account is always free.`,
    leadText: (o: string, p: string) => `${o || 'Your landlord'} invited you to anahtar${p ? ' for ' + p : ''}.`,
    codeLabel: 'Your invite code', cta: 'Create my account', note: 'The link fills in your name, email and invite code; you only need to choose a password.',
    expires: (d: string) => `The code is valid until ${d}.`, ifNot: 'If you were not expecting this invitation, you can ignore this email.',
    foot: 'anahtar · anahtar.io', date: (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Istanbul' })
  }
};

/** Hazır doldurulmuş kayıt bağlantısı: /kayit/kiraci?kod=…&ad=…&e=… (kayıt sayfası kod, ad ve e-postayı doldurur). */
export function signupUrl(o: Pick<InviteInput, 'appUrl' | 'code' | 'name' | 'email'>): string {
  const q = new URLSearchParams({ kod: o.code });
  if (o.name) q.set('ad', o.name);
  if (o.email) q.set('e', o.email);
  return o.appUrl.replace(/\/$/, '') + '/kayit/kiraci?' + q.toString();
}

export function renderInvite(o: InviteInput): { subject: string; html: string; text: string } {
  const lang = o.lang === 'en' ? 'en' : 'tr';
  const L = TXT[lang];
  const owner = (o.owner || '').trim(), prop = (o.property || '').trim();
  const url = signupUrl(o);
  const first = (o.name || '').trim().split(/\s+/)[0] || '';
  const exp = o.expires ? L.date(new Date(o.expires)) : '';
  const subject = L.subject(owner, prop);
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.kirec}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.kirec}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
<tr><td style="padding:0 4px 16px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#1D1A19;border-radius:12px;padding:9px 14px"><img src="${LOGO_URL}" width="140" height="26" alt="anahtar" style="display:block;border:0;outline:none;text-decoration:none"></td></tr></table></td></tr>
<tr><td style="background:${C.kart};border:1px solid ${C.kil};border-radius:20px;padding:30px 28px">
<div style="font:800 24px/1.2 ${FONT};color:${C.baca}">${esc(L.hi(first))}</div>
<div style="font:400 16px/1.55 ${FONT};color:${C.kahve};margin-top:12px">${L.lead(esc(owner), esc(prop))}</div>
<div style="background:${C.zemin};border-radius:14px;padding:16px;margin:22px 0;text-align:center"><div style="font:600 12px ${FONT};color:${C.kahve};letter-spacing:.6px;text-transform:uppercase">${esc(L.codeLabel)}</div>
<div style="font:800 30px ${FONT};color:${C.baca};letter-spacing:6px;margin-top:6px">${esc(o.code)}</div></div>
<div style="text-align:center"><a href="${esc(url)}" style="display:inline-block;background:${C.tugla};color:#fff;text-decoration:none;font:700 16px ${FONT};padding:14px 30px;border-radius:999px">${esc(L.cta)}</a></div>
<div style="font:400 13px/1.5 ${FONT};color:${C.kahve};margin-top:14px;text-align:center">${esc(L.note)}</div>
${exp ? `<div style="font:400 13px/1.5 ${FONT};color:${C.duman};margin-top:8px;text-align:center">${esc(L.expires(exp))}</div>` : ''}
</td></tr>
<tr><td style="padding:16px 8px;font:400 12px/1.5 ${FONT};color:${C.duman};text-align:center">${esc(L.ifNot)}<br>${esc(L.foot)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [L.hi(first), '', L.leadText(owner, prop), '', `${L.codeLabel}: ${o.code}`, `${L.cta}: ${url}`, '', L.note, ...(exp ? [L.expires(exp)] : []), L.ifNot].join('\n');
  return { subject, html, text };
}
