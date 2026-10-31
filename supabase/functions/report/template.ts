// anahtar — aylık / yıllık rapor e-postasının HTML'i. Saf işlev (Deno ve Node'da çalışır; testler önizleme üretir).
// E-posta istemcileri için: tablo düzeni, satır içi stil, SVG yok, web yazı tipi yerine sistem yazı tipi.

export type Report = {
  period: 'month' | 'year'; from: string; to: string;
  units: number; occupied: number; expected: number; collected: number; spent: number;
  requests: { opened: number; done: number; open: number }; renewals: number;
  properties: { name: string; rent: number; expected: number; collected: number; spent: number;
                paidMonths: number; activeMonths: number; hasTenant: boolean }[];
};

const C = { tugla: '#C8302E', kirec: '#FAF5F0', kart: '#FFFDFB', baca: '#1D1A19', kahve: '#5C4F4A', duman: '#A39A95',
            kil: '#E8DDD5', fes: '#D5EBD7', fesKoyu: '#2A6B3A', bal: '#F2B544', balAcik: '#F7DDB0', gul: '#F0CFC8', gulKoyu: '#A8231F' };
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
/** Marka logosu (kenarlıksız, koyu zeminli; anahtar.io/mail altında yayında durur). */
const LOGO_URL = 'https://anahtar.io/mail/anahtar-logo-mail.png';

const TXT = {
  tr: {
    month: (d: Date) => d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) + ' raporu',
    year: (d: Date) => d.getFullYear() + ' yıllık raporu',
    hi: (n: string) => n ? `Merhaba ${n},` : 'Merhaba,',
    introM: 'Geçen ayın kira, gider ve talep özetini hazırladık.',
    introY: 'Geçen yılın kira, gider ve talep özetini hazırladık.',
    rate: 'Tahsilat oranı', of: (a: string, b: string) => `${b} beklenen kiranın ${a} tutarı tahsil edildi`,
    expected: 'Beklenen kira', collected: 'Tahsil edilen', spent: 'Giderler', net: 'Net gelir',
    units: (n: number, o: number) => `${n} mülk · ${o} kiracılı`,
    reqs: 'Talepler', opened: 'açıldı', done: 'tamamlandı', open: 'açık bekliyor',
    renew: (n: number) => n ? `${n} sözleşmenin bitişine 90 günden az kaldı.` : 'Önümüzdeki 90 günde biten sözleşme yok.',
    props: 'Mülkler', paid: 'Ödendi', partial: 'Kısmi', due: 'Bekliyor', empty: 'Boş',
    cta: 'Raporu panelde aç', foot: 'Bu e-postayı Kurumsal paketin kapsamında alıyorsun.',
    off: 'Ayarlar → Bildirimler bölümünden kapatabilirsin.', sub: (s: string) => `anahtar · ${s}`
  },
  en: {
    month: (d: Date) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) + ' report',
    year: (d: Date) => d.getFullYear() + ' annual report',
    hi: (n: string) => n ? `Hi ${n},` : 'Hi,',
    introM: 'Here is last month’s summary of rent, expenses and requests.',
    introY: 'Here is last year’s summary of rent, expenses and requests.',
    rate: 'Collection rate', of: (a: string, b: string) => `${a} collected of ${b} expected rent`,
    expected: 'Expected rent', collected: 'Collected', spent: 'Expenses', net: 'Net income',
    units: (n: number, o: number) => `${n} ${n === 1 ? 'property' : 'properties'} · ${o} with tenants`,
    reqs: 'Requests', opened: 'opened', done: 'completed', open: 'still open',
    renew: (n: number) => n ? `${n} ${n === 1 ? 'lease ends' : 'leases end'} within 90 days.` : 'No leases end in the next 90 days.',
    props: 'Properties', paid: 'Paid', partial: 'Partial', due: 'Due', empty: 'Vacant',
    cta: 'Open the report', foot: 'You receive this email as part of the Enterprise plan.',
    off: 'Turn it off under Settings → Notifications.', sub: (s: string) => `anahtar · ${s}`
  }
};

const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function renderReport(r: Report, o: { name?: string; lang?: string; appUrl: string }) {
  const lang = o.lang === 'en' ? 'en' : 'tr';
  const L = TXT[lang];
  const money = (n: number) => '₺' + Math.round(Number(n) || 0).toLocaleString(lang === 'en' ? 'en-US' : 'tr-TR');
  const start = new Date(r.from + 'T12:00:00Z');
  const title = r.period === 'year' ? L.year(start) : L.month(start);
  const pct = r.expected > 0 ? Math.min(100, Math.round((r.collected / r.expected) * 100)) : 0;
  const pctText = lang === 'en' ? pct + '%' : '%' + pct;
  const net = r.collected - r.spent;
  const url = o.appUrl.replace(/\/$/, '') + '/uygulama/rapor';

  const tile = (label: string, value: string, bg: string, ink: string) =>
    `<td width="50%" style="padding:6px"><div style="background:${bg};border-radius:18px;padding:16px 18px">
       <div style="font:600 13px ${FONT};color:${ink};opacity:.8">${label}</div>
       <div style="font:800 24px/1.2 ${FONT};color:${ink};letter-spacing:-.5px;margin-top:4px">${value}</div></div></td>`;

  const chip = (p: Report['properties'][number]) => {
    const [t, bg, ink] = !p.hasTenant ? [L.empty, C.kil, C.kahve]
      : p.paidMonths >= p.activeMonths && p.activeMonths > 0 ? [L.paid, C.fes, C.fesKoyu]
      : p.collected > 0 ? [L.partial, C.balAcik, '#6B4A00'] : [L.due, C.gul, C.gulKoyu];
    return `<span style="display:inline-block;background:${bg};color:${ink};font:700 12px ${FONT};padding:4px 10px;border-radius:999px">${t}</span>`;
  };

  const rows = r.properties.map((p, i) => `
    <tr><td style="padding:12px 0;${i ? `border-top:1px solid ${C.kil};` : ''}font:700 15px ${FONT};color:${C.baca}">${esc(p.name)}
          <div style="font:500 13px ${FONT};color:${C.kahve};margin-top:2px">${money(p.collected)} / ${money(p.expected)}</div></td>
        <td align="right" style="padding:12px 0;${i ? `border-top:1px solid ${C.kil};` : ''}">${chip(p)}</td></tr>`).join('');

  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.kirec}">
<div style="display:none;max-height:0;overflow:hidden">${esc(L.of(money(r.collected), money(r.expected)))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.kirec}"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
  <tr><td style="background:${C.tugla};border-radius:28px 28px 0 0;padding:28px 30px 30px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#FAF5F0;border-radius:12px;padding:9px 14px"><img src="${LOGO_URL}" width="140" height="26" alt="anahtar" style="display:block;border:0;outline:none;text-decoration:none"></td></tr></table>
    <div style="font:600 13px ${FONT};color:${C.kirec};opacity:.85;margin-top:22px;text-transform:uppercase;letter-spacing:1.2px">${esc(L.units(r.units, r.occupied))}</div>
    <div style="font:800 34px/1.1 ${FONT};color:${C.kirec};letter-spacing:-1.2px;margin-top:6px">${esc(title.charAt(0).toUpperCase() + title.slice(1))}</div>
  </td></tr>
  <tr><td style="background:${C.kart};border:1px solid ${C.kil};border-top:0;border-radius:0 0 28px 28px;padding:28px 24px 30px">
    <div style="font:500 16px/1.5 ${FONT};color:${C.baca};padding:0 6px">${esc(L.hi(o.name || ''))}<br>${r.period === 'year' ? L.introY : L.introM}</div>

    <div style="background:${C.baca};border-radius:22px;padding:22px 22px 20px;margin:22px 0 8px">
      <div style="font:600 13px ${FONT};color:${C.duman}">${L.rate}</div>
      <div style="font:800 44px/1.1 ${FONT};color:${C.kirec};letter-spacing:-1.5px;margin-top:4px">${pctText}</div>
      <div style="background:#3A3330;border-radius:999px;height:10px;margin-top:14px;overflow:hidden"><div style="background:${C.bal};width:${pct}%;height:10px;border-radius:999px"></div></div>
      <div style="font:500 13px ${FONT};color:${C.duman};margin-top:10px">${esc(L.of(money(r.collected), money(r.expected)))}</div>
    </div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -6px">
      <tr>${tile(L.expected, money(r.expected), C.kirec, C.baca)}${tile(L.collected, money(r.collected), C.fes, C.fesKoyu)}</tr>
      <tr>${tile(L.spent, money(r.spent), C.gul, C.gulKoyu)}${tile(L.net, money(net), C.balAcik, '#6B4A00')}</tr>
    </table>

    <div style="border:1px solid ${C.kil};border-radius:20px;padding:16px 18px;margin-top:14px">
      <div style="font:800 16px ${FONT};color:${C.baca}">${L.reqs}</div>
      <div style="font:500 14px/1.6 ${FONT};color:${C.kahve};margin-top:4px">
        <b style="color:${C.baca}">${r.requests.opened}</b> ${L.opened} · <b style="color:${C.baca}">${r.requests.done}</b> ${L.done} · <b style="color:${C.baca}">${r.requests.open}</b> ${L.open}<br>${L.renew(r.renewals)}</div>
    </div>

    ${r.properties.length ? `<div style="font:800 16px ${FONT};color:${C.baca};margin:22px 6px 4px">${L.props}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:0 6px">${rows}</table>` : ''}

    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px auto 0"><tr><td style="background:${C.baca};border-radius:999px">
      <a href="${esc(url)}" style="display:inline-block;padding:15px 28px;font:700 15px ${FONT};color:${C.kirec};text-decoration:none">${L.cta} →</a></td></tr></table>
  </td></tr>
  <tr><td style="padding:22px 20px 0;text-align:center;font:500 12.5px/1.6 ${FONT};color:${C.duman}">${L.foot}<br>${L.off}<br>${L.sub('anahtar.io')}</td></tr>
</table></td></tr></table></body></html>`;

  const text = [title, '', L.hi(o.name || ''), r.period === 'year' ? L.introY : L.introM, '',
    `${L.rate}: ${pctText} — ${L.of(money(r.collected), money(r.expected))}`,
    `${L.spent}: ${money(r.spent)} · ${L.net}: ${money(net)}`,
    `${L.reqs}: ${r.requests.opened} ${L.opened}, ${r.requests.done} ${L.done}, ${r.requests.open} ${L.open}`,
    L.renew(r.renewals), '', ...r.properties.map((p) => `• ${p.name}: ${money(p.collected)} / ${money(p.expected)}`), '', url].join('\n');

  return { subject: `anahtar · ${title.charAt(0).toUpperCase() + title.slice(1)}`, html, text };
}
