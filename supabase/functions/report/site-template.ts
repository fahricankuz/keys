// anahtar — site yönetim kurulu raporu e-postası (aylık / yıllık). Saf işlev; görünüm template.ts ile aynı dilde.

export type SiteReport = {
  org: string; period: 'month' | 'year'; from: string; to: string; units: number;
  charges: { kind: string; charged: number; collected: number }[];
  expenses: { cat: string; total: number }[];
  budget: { year: number; total: number; approved_on: string | null; items: { cat: string; amount: number }[] } | null;
  debtors: { unit: string; unpaid: number }[];
  requests: { opened: number; open: number };
};

const C = { tugla: '#C8302E', kirec: '#FAF5F0', kart: '#FFFDFB', baca: '#1D1A19', kahve: '#5C4F4A', duman: '#A39A95',
            kil: '#E8DDD5', fes: '#D5EBD7', fesKoyu: '#2A6B3A', bal: '#F2B544', gul: '#F0CFC8', gulKoyu: '#A8231F' };
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
const KIND: Record<string, string> = { aidat: 'Aidat', yakit: 'Yakıt', demirbas: 'Demirbaş', ozel: 'Özel toplama' };
const esc = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const money = (n: number) => '₺' + Math.round(Number(n) || 0).toLocaleString('tr-TR');

export function renderSiteReport(r: SiteReport, o: { name?: string; appUrl: string }) {
  const start = new Date(r.from + 'T12:00:00Z');
  const title = r.period === 'year' ? `${start.getFullYear()} yıllık yönetim raporu` : start.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) + ' yönetim raporu';
  const charged = r.charges.reduce((a, x) => a + Number(x.charged), 0);
  const collected = r.charges.reduce((a, x) => a + Number(x.collected), 0);
  const spent = r.expenses.reduce((a, x) => a + Number(x.total), 0);
  const pct = charged > 0 ? Math.min(100, Math.round((collected / charged) * 100)) : 0;
  const url = o.appUrl.replace(/\/$/, '') + '/uygulama/site';
  const row = (a: string, b: string, i: number, color = C.baca) =>
    `<tr><td style="padding:10px 0;${i ? `border-top:1px solid ${C.kil};` : ''}font:600 14px ${FONT};color:${C.baca}">${a}</td>
         <td align="right" style="padding:10px 0;${i ? `border-top:1px solid ${C.kil};` : ''}font:700 14px ${FONT};color:${color}">${b}</td></tr>`;
  const section = (h: string, body: string) => `<div style="font:800 16px ${FONT};color:${C.baca};margin:22px 6px 4px">${h}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:0 6px">${body}</table>`;
  // Bütçe karşılaştırması: işletme projesindeki yıllık kalem, dönemde harcananla (aylık raporda yıllık tutarın 1/12'si).
  const share = r.period === 'year' ? 1 : 1 / 12;
  const budgetRows = r.budget ? r.budget.items.map((it, i) => {
    const used = r.expenses.filter((e) => e.cat.toLocaleLowerCase('tr') === String(it.cat).toLocaleLowerCase('tr')).reduce((a, e) => a + Number(e.total), 0);
    const plan = Number(it.amount) * share;
    return row(esc(it.cat), `${money(used)} / ${money(plan)}`, i, used > plan ? C.gulKoyu : C.baca);
  }).join('') : '';

  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${C.kirec}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.kirec}"><tr><td align="center" style="padding:28px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
  <tr><td style="background:${C.tugla};border-radius:28px 28px 0 0;padding:28px 30px 30px">
    <div style="font:800 28px ${FONT};color:${C.kirec};letter-spacing:-1px">anahtar</div>
    <div style="font:600 13px ${FONT};color:${C.kirec};opacity:.85;margin-top:22px;text-transform:uppercase;letter-spacing:1.2px">${esc(r.org)} · ${r.units} daire</div>
    <div style="font:800 32px/1.1 ${FONT};color:${C.kirec};letter-spacing:-1.2px;margin-top:6px">${esc(title.charAt(0).toUpperCase() + title.slice(1))}</div>
  </td></tr>
  <tr><td style="background:${C.kart};border:1px solid ${C.kil};border-top:0;border-radius:0 0 28px 28px;padding:28px 24px 30px">
    <div style="font:500 16px/1.5 ${FONT};color:${C.baca};padding:0 6px">${o.name ? `Merhaba ${esc(o.name)},` : 'Merhaba,'}<br>Sitenin tahakkuk, tahsilat, gider ve talep özetini hazırladık.</div>
    <div style="background:${C.baca};border-radius:22px;padding:22px;margin:22px 0 8px">
      <div style="font:600 13px ${FONT};color:${C.duman}">Tahsilat oranı</div>
      <div style="font:800 44px/1.1 ${FONT};color:${C.kirec};letter-spacing:-1.5px;margin-top:4px">%${pct}</div>
      <div style="background:#3A3330;border-radius:999px;height:10px;margin-top:14px;overflow:hidden"><div style="background:${C.bal};width:${pct}%;height:10px"></div></div>
      <div style="font:500 13px ${FONT};color:${C.duman};margin-top:10px">${money(charged)} tahakkukun ${money(collected)} tutarı tahsil edildi · giderler ${money(spent)}</div>
    </div>
    ${r.charges.length ? section('Tahakkuk ve tahsilat', r.charges.map((x, i) => row(KIND[x.kind] || esc(x.kind), `${money(x.collected)} / ${money(x.charged)}`, i)).join('')) : ''}
    ${r.expenses.length ? section('Giderler', r.expenses.map((x, i) => row(esc(x.cat), money(x.total), i)).join('')) : ''}
    ${r.budget ? section(`İşletme projesi ${r.budget.year}${r.budget.approved_on ? ' (onaylı)' : ''} · harcanan / öngörülen`, budgetRows) : ''}
    ${r.debtors.length ? section('Borçlu daireler', r.debtors.map((x, i) => row(esc(x.unit), money(x.unpaid), i, C.gulKoyu)).join('')) : ''}
    <div style="border:1px solid ${C.kil};border-radius:20px;padding:16px 18px;margin-top:18px;font:500 14px ${FONT};color:${C.kahve}">
      Talepler: <b style="color:${C.baca}">${r.requests.opened}</b> açıldı · <b style="color:${C.baca}">${r.requests.open}</b> açık bekliyor</div>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px auto 0"><tr><td style="background:${C.baca};border-radius:999px">
      <a href="${esc(url)}" style="display:inline-block;padding:15px 28px;font:700 15px ${FONT};color:${C.kirec};text-decoration:none">Site panelini aç →</a></td></tr></table>
  </td></tr>
  <tr><td style="padding:22px 20px 0;text-align:center;font:500 12.5px/1.6 ${FONT};color:${C.duman}">Bu e-postayı site yönetiminde “Raporlar” yetkin olduğu için alıyorsun.<br>Ayarlar → Bildirimler bölümünden kapatabilirsin.<br>anahtar · anahtar.io</td></tr>
</table></td></tr></table></body></html>`;

  const text = [title, '', `Tahsilat oranı: %${pct} — ${money(charged)} tahakkukun ${money(collected)} tutarı tahsil edildi.`, `Giderler: ${money(spent)}`,
    ...r.debtors.map((d) => `• ${d.unit}: ${money(d.unpaid)}`), '', url].join('\n');
  return { subject: `anahtar · ${r.org} · ${title.charAt(0).toUpperCase() + title.slice(1)}`, html, text };
}
