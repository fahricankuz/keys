// anahtar — bildirim e-postasının HTML'i (mesaj, talep, ödeme hatırlatması vb.). Saf işlev (Deno ve Node'da çalışır; testler önizleme üretir).
// E-posta istemcileri için: tablo düzeni, satır içi stil, sistem yazı tipi (welcome/template.ts ile aynı dil).

const C = { tugla: '#C8302E', kirec: '#FAF5F0', kart: '#FFFDFB', baca: '#1D1A19', kahve: '#5C4F4A', duman: '#A39A95', kil: '#E8DDD5' };
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
/** Marka logosu (koyu zeminli; anahtar.io/mail altında yayında durur). */
const LOGO_URL = 'https://anahtar.io/mail/anahtar-logo-mail.png';
const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function renderNotice(o: { title: string; body: string; link?: string }): { html: string; text: string } {
  const link = o.link || '';
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:${C.kirec}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.kirec}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${C.kart};border:1px solid ${C.kil};border-radius:24px;overflow:hidden">
<tr><td style="background:${C.baca};padding:22px 28px"><img src="${LOGO_URL}" width="150" height="27" alt="anahtar" style="display:block;border:0;outline:none;text-decoration:none"></td></tr>
<tr><td style="padding:28px 28px 8px"><div style="font:800 22px/1.25 ${FONT};color:${C.baca}">${esc(o.title)}</div>
<div style="font:400 16px/1.55 ${FONT};color:${C.kahve};margin-top:10px;white-space:pre-line">${esc(o.body)}</div></td></tr>
${link ? `<tr><td style="padding:18px 28px 28px"><a href="${esc(link)}" style="display:inline-block;background:${C.tugla};color:#fff;text-decoration:none;font:700 15px ${FONT};padding:13px 26px;border-radius:999px">Aç</a></td></tr>` : '<tr><td style="padding:0 0 20px"></td></tr>'}
</table>
<div style="font:400 12px/1.5 ${FONT};color:${C.duman};margin-top:14px;text-align:center">anahtar · Kira işinin anahtarı · anahtar.io</div>
</td></tr></table></body></html>`;
  return { html, text: `${o.body}\n\n${link}\n\n— anahtar` };
}
