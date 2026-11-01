// anahtar — müşteriye giden "talebini aldık" e-postası (kurumsal teklif, Bize ulaş, paket yükseltme, içe aktarma, hukuki destek).
// Saf işlev (Deno ve Node'da çalışır; testler önizleme üretir). Tablo düzeni ve satır içi stil: e-posta istemcileri için.
// Kırmızı başlık bandı kırmızı zeminli logoyla (anahtar-logo-mail-kirmizi.png) aynı renkte olmalı; karanlık modda da bozulmaz.

const C = { tugla: '#C8302E', kirec: '#FAF5F0', kart: '#FFFDFB', baca: '#1D1A19', kahve: '#5C4F4A', duman: '#8A807B', kil: '#E8DDD5', krem: '#F3ECE5' };
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const LOGO = 'https://anahtar.io/mail/anahtar-logo-mail-kirmizi.png';
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export type AckKind = 'kurumsal' | 'import' | 'upgrade' | 'genel' | 'hukuki';
export type AckInput = {
  kind: AckKind | string;
  name?: string;
  ref?: string;                       // talep numarası (H-0001 ya da T-AB12CD)
  rows?: [string, string][];          // talep özeti (etiket, değer)
  message?: string;
  lang?: 'tr' | 'en' | string;
  appUrl?: string;
  contact?: string;                   // yanıt adresi (varsayılan info@anahtar.io)
};

type Copy = { subject: string; title: string; lead: string };
const TR: Record<AckKind, Copy> = {
  kurumsal: { subject: 'Kurumsal teklif talebini aldık', title: 'Teşekkürler, talebin bize ulaştı',
    lead: 'anahtar Kurumsal paketi için bize ulaştığın için teşekkür ederiz. Ekiplerimiz talebini inceleyip en kısa sürede seninle iletişime geçecek ve sana özel teklifi hazırlayacak.' },
  import: { subject: 'Toplu içe aktarma talebini aldık', title: 'Talebin bize ulaştı',
    lead: 'Toplu içe aktarma desteği için bize ulaştığın için teşekkür ederiz. Ekiplerimiz talebini inceleyip en kısa sürede seninle iletişime geçecek.' },
  upgrade: { subject: 'Paket yükseltme talebini aldık', title: 'Talebin bize ulaştı',
    lead: 'Paket yükseltme talebin için teşekkür ederiz. Ekiplerimiz en kısa sürede seninle iletişime geçecek.' },
  genel: { subject: 'Mesajını aldık', title: 'Bize ulaştığın için teşekkürler',
    lead: 'Mesajın bize ulaştı. Ekiplerimiz en kısa sürede seninle iletişime geçecek.' },
  hukuki: { subject: 'Hukuki destek talebini aldık', title: 'Hukuki destek talebin bize ulaştı',
    lead: 'Talebin ekibimize ulaştı ve incelenecek. Gelişmeleri uygulama bildirimlerinden ve e-postayla ileteceğiz.' }
};
const EN: Record<AckKind, Copy> = {
  kurumsal: { subject: 'We received your Enterprise quote request', title: 'Thank you, your request reached us',
    lead: 'Thank you for contacting us about the anahtar Enterprise plan. Our team will review your request and get back to you shortly with a tailored quote.' },
  import: { subject: 'We received your bulk import request', title: 'Your request reached us',
    lead: 'Thank you for contacting us about bulk import support. Our team will review your request and get back to you shortly.' },
  upgrade: { subject: 'We received your plan upgrade request', title: 'Your request reached us',
    lead: 'Thank you for your plan upgrade request. Our team will get back to you shortly.' },
  genel: { subject: 'We received your message', title: 'Thank you for getting in touch',
    lead: 'Your message reached us. Our team will get back to you shortly.' },
  hukuki: { subject: 'We received your legal support request', title: 'Your legal support request reached us',
    lead: 'Your request has reached our team and will be reviewed. We will keep you posted through app notifications and e-mail.' }
};

/** Konu, HTML ve düz metin. Bilinmeyen tür "genel" sayılır; ad boşsa selamlama genel kalır. */
export function renderAck(o: AckInput): { subject: string; html: string; text: string } {
  const en = o.lang === 'en';
  const kind = (['kurumsal', 'import', 'upgrade', 'genel', 'hukuki'].includes(String(o.kind)) ? o.kind : 'genel') as AckKind;
  const c = (en ? EN : TR)[kind];
  const first = String(o.name ?? '').trim().split(/\s+/)[0] || '';
  const hello = en ? (first ? `Hi ${first},` : 'Hi,') : (first ? `Merhaba ${first},` : 'Merhaba,');
  const contact = o.contact || 'info@anahtar.io';
  const refLabel = en ? 'Reference' : 'Referans';
  const summaryTitle = en ? 'Your request' : 'Talebin';
  const reply = en ? `You can reply to this e-mail to add more details, or write to ${contact}.` : `Ek bilgi iletmek için bu e-postayı yanıtlayabilir ya da ${contact} adresine yazabilirsin.`;
  const foot = en ? 'anahtar · The key to your rentals · anahtar.io' : 'anahtar · Kira işinin anahtarı · anahtar.io';
  const rows = (o.rows ?? []).filter(([, v]) => String(v ?? '').trim());
  const table = rows.length
    ? `<tr><td style="padding:6px 28px 0"><div style="font:700 13px ${FONT};color:${C.kahve};text-transform:uppercase;letter-spacing:.4px">${esc(summaryTitle)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;font:400 15px/1.5 ${FONT}">${rows.map(([k, v]) =>
      `<tr><td style="padding:5px 0;color:${C.kahve};width:38%;vertical-align:top">${esc(k)}</td><td style="padding:5px 0;color:${C.baca};font-weight:600">${esc(v)}</td></tr>`).join('')}</table></td></tr>` : '';
  const msg = o.message && String(o.message).trim()
    ? `<tr><td style="padding:12px 28px 0"><div style="padding:14px;background:${C.krem};border-radius:12px;font:400 15px/1.55 ${FONT};color:${C.baca};white-space:pre-wrap">${esc(String(o.message).slice(0, 1500))}</div></td></tr>` : '';
  const ref = o.ref ? `<div style="font:600 13px ${FONT};color:rgba(250,245,240,.85);margin-top:6px">${esc(refLabel)}: ${esc(o.ref)}</div>` : '';

  const html = `<!doctype html><html lang="${en ? 'en' : 'tr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.kirec}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.kirec}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${C.kart};border:1px solid ${C.kil};border-radius:24px;overflow:hidden">
<tr><td bgcolor="${C.tugla}" style="background:${C.tugla};padding:22px 28px"><img src="${LOGO}" width="168" height="31" alt="anahtar" style="display:block;border:0;outline:none;text-decoration:none">
<div style="font:800 24px/1.25 ${FONT};color:${C.kirec};margin-top:12px">${esc(c.title)}</div>${ref}</td></tr>
<tr><td style="padding:24px 28px 8px"><div style="font:400 16px/1.6 ${FONT};color:${C.baca}">${esc(hello)}</div>
<div style="font:400 16px/1.6 ${FONT};color:${C.kahve};margin-top:8px">${esc(c.lead)}</div></td></tr>
${table}${msg}
<tr><td style="padding:16px 28px 26px"><div style="font:400 14px/1.55 ${FONT};color:${C.kahve}">${esc(reply)}</div></td></tr>
</table>
<div style="font:400 12px/1.5 ${FONT};color:${C.duman};margin-top:14px;text-align:center">${esc(foot)}</div>
</td></tr></table></body></html>`;

  const text = [hello, '', c.lead, '', o.ref ? `${refLabel}: ${o.ref}` : '', ...rows.map(([k, v]) => `${k}: ${v}`), o.message ? `\n${String(o.message).slice(0, 1500)}` : '', '', reply, '', '— anahtar']
    .filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n');
  return { subject: c.subject, html, text };
}
