// anahtar — site / portföy daveti e-postası. Saf işlev (Deno ve Node'da çalışır; testler önizleme üretir).
// Hoş geldin e-postasıyla aynı görsel dil: tablo düzeni, satır içi stil, görsel yok, sistem yazı tipi.

export type InviteInput = { name?: string; role?: string; org: string; unit: string; code: string; sector?: string; by?: string; appUrl: string };

const C = { tugla: '#C8302E', kirec: '#FAF5F0', kart: '#FFFDFB', baca: '#1D1A19', kahve: '#5C4F4A', duman: '#A39A95',
            kil: '#E8DDD5', bal: '#F2B544', gulKoyu: '#A8231F', zemin: '#F3ECE5' };
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
/** Marka logosu (kenarlıksız, koyu zeminli; anahtar.io/mail altında yayında durur). */
const LOGO_URL = 'https://anahtar.io/mail/anahtar-logo-mail.png';
const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function renderInvite(o: InviteInput): { subject: string; html: string; text: string } {
  const site = !o.sector || o.sector === 'site';
  const link = o.appUrl.replace(/\/$/, '') + '/katil?kod=' + encodeURIComponent(o.code);
  const first = (o.name || '').trim().split(/\s+/)[0] || '';
  const subject = `${o.org}: ${o.unit} için anahtar davetin`;
  const badge = site ? (o.role === 'malik' ? 'Malik daveti · ücretsiz' : 'Kiracı daveti · ücretsiz') : 'Kiracı daveti · ücretsiz';
  const title = site ? 'Siten artık anahtar’da.' : 'Kiran artık anahtar’da.';
  const lead = site
    ? `${o.org} yönetimi seni ${o.unit} için davet etti. Aidatını, duyuruları ve taleplerini tek yerden izleyeceksin.`
    : `${o.org} yönetimi seni ${o.unit} için davet etti. Kiranı, faturalarını ve taleplerini tek yerden izleyeceksin.`;
  const steps: [string, string][] = site ? [
    ['Hesabını aç', 'Bağlantıya dokun; bilgilerin hazır gelir, yalnızca şifreni belirle. Hesap her zaman ücretsiz.'],
    ['Aidatını gör', 'Ay ay tahakkuklar ve son ödeme günü; dekontu yükleyince yönetim onaylar.'],
    ['Duyuru ve talepler', 'Yönetimin duyurularını al, arıza ya da öneri için talep aç.']
  ] : [
    ['Hesabını aç', 'Bağlantıya dokun; bilgilerin hazır gelir, yalnızca şifreni belirle. Hesap her zaman ücretsiz.'],
    ['Kiranı gör', 'Ay ay tahakkuklar ve vade; dekontu yükleyince yönetim onaylar.'],
    ['Talepler', 'Arıza ve bakım taleplerini aç, durumunu izle.']
  ];
  const rows = steps.map(([a, b], i) => `<tr><td width="44" valign="top" style="padding:10px 0"><div style="width:32px;height:32px;border-radius:50%;background:${C.tugla};color:#fff;font:800 15px/32px ${FONT};text-align:center">${i + 1}</div></td>
<td style="padding:10px 0"><div style="font:700 15px ${FONT};color:${C.baca}">${esc(a)}</div><div style="font:400 14px/1.5 ${FONT};color:${C.kahve};margin-top:2px">${esc(b)}</div></td></tr>`).join('');

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.kirec}">
<div style="display:none;max-height:0;overflow:hidden">${esc(lead)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.kirec};padding:24px 0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:${C.kart};border-radius:28px;overflow:hidden;border:1px solid ${C.kil}">
<tr><td style="background:${C.kart};padding:24px 32px 22px"><img src="${LOGO_URL}" width="168" height="31" alt="anahtar" style="display:block;border:0;outline:none;text-decoration:none"></td></tr>
<tr><td style="background:${C.baca};padding:26px 32px 30px">
<div style="display:inline-block;margin-top:0;background:${C.bal};color:${C.baca};font:700 12px ${FONT};padding:5px 12px;border-radius:999px">${esc(badge)}</div>
<div style="font:800 32px/1.12 ${FONT};color:#FFF3EA;letter-spacing:-1px;margin-top:12px">${esc(title)}</div>
<div style="font:400 15px/1.55 ${FONT};color:#BDB1AB;margin-top:10px">${esc(lead)}</div></td></tr>
<tr><td style="padding:26px 32px 4px;font:400 15px/1.55 ${FONT};color:${C.baca}">${first ? `Merhaba ${esc(first)},` : 'Merhaba,'}</td></tr>
<tr><td style="padding:8px 32px 0"><div style="background:${C.zemin};border-radius:20px;padding:18px 20px;text-align:center">
<div style="font:600 12px ${FONT};color:${C.kahve};letter-spacing:.6px;text-transform:uppercase">${esc(o.org)} · ${esc(o.unit)}</div>
<div style="font:600 12px ${FONT};color:${C.duman};margin-top:12px">Davet kodun</div>
<div style="font:800 30px ${FONT};color:${C.baca};letter-spacing:6px;margin-top:2px">${esc(o.code)}</div></div></td></tr>
<tr><td align="center" style="padding:22px 32px 6px"><a href="${link}" style="display:inline-block;background:${C.tugla};color:#fff;text-decoration:none;font:700 16px ${FONT};padding:15px 34px;border-radius:999px">Daveti kabul et</a>
<div style="font:400 13px ${FONT};color:${C.duman};margin-top:10px">Düğme çalışmazsa: <a href="${link}" style="color:${C.gulKoyu}">${esc(link)}</a></div></td></tr>
<tr><td style="padding:14px 32px 0"><div style="font:800 18px ${FONT};color:${C.baca}">Nasıl çalışır</div><table role="presentation" width="100%">${rows}</table></td></tr>
<tr><td style="padding:16px 32px 28px"><div style="border-top:1px solid ${C.kil};padding-top:16px;font:400 13px/1.55 ${FONT};color:${C.kahve}">Bu e-postayı ${esc(o.org)} yönetimi${o.by ? ` (${esc(o.by)})` : ''} anahtar üzerinden gönderdi. Seni ilgilendirmiyorsa dikkate alma; davet kodu kullanılmadıkça hesap açılmaz.<br>Sorunda <a href="mailto:info@anahtar.io" style="color:${C.gulKoyu};font-weight:700">info@anahtar.io</a> adresine yazabilirsin.</div>
<div style="font:400 12px ${FONT};color:${C.duman};margin-top:14px">anahtar · Kira işinin anahtarı · anahtar.io</div></td></tr>
</table></td></tr></table></body></html>`;

  const text = [first ? `Merhaba ${first},` : 'Merhaba,', '', title, lead, '', `${o.org} · ${o.unit}`, `Davet kodun: ${o.code}`, `Daveti kabul et: ${link}`, '',
    ...steps.map(([a, b], i) => `${i + 1}. ${a}: ${b}`), '', `Bu e-postayı ${o.org} yönetimi anahtar üzerinden gönderdi.`, 'info@anahtar.io'].join('\n');
  return { subject, html, text };
}
