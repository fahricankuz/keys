/* Yatırımcı raporu belgesi: üç A4 sayfası (kapak, özet, ayrıntılar), yazdırılır ve "PDF olarak kaydet" ile PDF olur.
   Marka: tuğla kırmızısı, krem zemin, Inter. Sayılar kesilmez (white-space: nowrap, sabit sütunlar, uzun değerde küçülen yazı),
   Türkçe biçim ve hizalı rakamlar (tabular-nums). Uzun listeler sayfaya sığacak kadar gösterilir, kalanı "ve n tane daha" olur. */
import { t, locale } from './i18n.js';
import { fmtMoney, fmtShort } from './money.js';
import { fxSymbol } from './fx.js';
import { fmtFull, monthYear, parse } from './util.js';

const C = { tugla: '#C8302E', tuglaKoyu: '#A8231F', krem: '#FAF5F0', kart: '#FFFDFB', baca: '#1D1A19', kahve: '#5C4F4A', duman: '#8A807A',
            kil: '#E8DDD5', kilKoyu: '#D8CBC1', yesil: '#2A6B3A', bal: '#F2B544' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (x, digits = 1) => (x == null || !isFinite(x) ? '—' : '%' + (Math.round(x * 100 * 10 ** digits) / 10 ** digits).toLocaleString(locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }));
const num = (x) => Math.round(Number(x) || 0).toLocaleString(locale());
const years = (x) => (x == null ? '—' : t('{n} yıl', { n: x.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) }));
const day = (v) => (v ? fmtFull(parse(String(v).slice(0, 10))) : '—');
const change = (a, b) => (b ? (a - b) / Math.abs(b) : null);
/** Uzun değer kutusundan taşmasın: karakter sayısına göre yazı boyutu. */
const fit = (s, base, min) => Math.max(min, Math.min(base, Math.floor(base * 11 / Math.max(11, String(s).length))));

function more(list, max){
  return { rows: list.slice(0, max), rest: Math.max(0, list.length - max) };
}

function chartSvg(data, cur){
  const W = 640, H = 150, pad = 4, bw = (W - pad * 11) / 12;
  const max = Math.max(1, ...data.map((x) => x.value));
  const bars = data.map((x, i) => {
    // Üstte etiket payı (14 px): en yüksek çubuğun değeri kesilmez.
    const h = x.value ? Math.max(2, (x.value / max) * (H - 18 - 18)) : 0;
    const xPos = i * (bw + pad);
    return `<rect x="${xPos.toFixed(1)}" y="${(H - 18 - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${x.missing ? C.kilKoyu : i === data.length - 1 ? C.tugla : C.baca}"/>
<text x="${(xPos + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="9" fill="${C.duman}">${esc(monthYear(x.month).split(' ')[0].slice(0, 3))}</text>
<text x="${(xPos + bw / 2).toFixed(1)}" y="${(H - 22 - h).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="${C.kahve}">${x.value ? esc(fmtShort(x.value, cur)) : ''}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(t('12 aylık gelir'))}" style="font-family:Inter,sans-serif;font-variant-numeric:tabular-nums">${bars}</svg>`;
}

function bar(x){
  const w = x == null ? 0 : Math.round(Math.max(0, Math.min(1, x)) * 100);
  return `<span class="bar"><span style="width:${w}%"></span></span>`;
}

/**
 * r: investorReport çıktısı. o: { origin, generated (Date) }. Belgede betik yoktur (uygulamanın içerik güvenliği kuralı
 * blob belgesine de geçer); yazdırmayı belgeyi açan sayfa tetikler (openInvestorReport).
 */
export function investorHtml(r, o = {}){
  const origin = (o.origin || '').replace(/\/$/, '');
  const M = (n) => fmtMoney(n, r.cur);
  const TL = (n) => fmtMoney(n, 'TRY');
  const sym = fxSymbol(r.cur);
  const gen = o.generated || new Date();
  const title = `${r.org} · ${t('Yatırımcı raporu')} · ${r.range.label}`;
  const foot = (n) => `<div class="foot"><span>${esc(r.org)} · ${esc(r.range.label)}</span><span>${esc(t('anahtar · anahtar.io'))}</span><span>${n} / 3</span></div>`;

  // Sayfa 1: kapak
  const kpis = [
    [t('Dönem geliri'), M(r.kpi.revenue), t('Brüt kira + ortak gider tahakkuku')],
    [t('NOI marjı'), pct(r.kpi.margin), t('NOI {v}', { v: M(r.now.noi) })],
    [t('Doluluk'), pct(r.kpi.occupancy), t('{a} / {b} m²', { a: num(r.occupancy.occArea), b: num(r.occupancy.area) })],
    [t('WALE'), years(r.kpi.wale), t('Kira ağırlıklı · m² ağırlıklı {v}', { v: years(r.kpi.waleArea) })]
  ];
  const cover = `<section class="page cover">
  <div class="band">
    <img src="${esc(origin)}/marka/anahtar-logo-seffaf-beyaz.png" alt="anahtar" class="logo">
    <div class="kicker">${esc(t('Yatırımcı raporu'))}</div>
    <h1 style="font-size:${fit(r.org, 44, 26)}px">${esc(r.org)}</h1>
    <div class="period">${esc(r.range.label)}</div>
    <div class="dates">${esc(day(r.range.from))} – ${esc(day(r.range.to))}</div>
  </div>
  <div class="kpis">${kpis.map(([a, b, s]) => `<div class="kpi"><div class="kl">${esc(a)}</div><div class="kv" style="font-size:${fit(b, 34, 20)}px">${esc(b)}</div><div class="ks">${esc(s)}</div></div>`).join('')}</div>
  <div class="cover-note">
    <p>${esc(t('Tutarlar {c} cinsindendir; her işlem kendi gününün TCMB döviz satış kuruyla çevrilmiştir.', { c: r.cur === 'EUR' ? t('avro') : t('dolar') }))}${r.rate ? ' ' + esc(t('Dönem sonu kuru: 1 {s} = {v}.', { s: sym, v: fmtMoney(r.rate, 'TRY', 2) })) : ''}</p>
    <p>${esc(t('Hazırlanma: {d}', { d: day(gen.toISOString ? isoLocal(gen) : gen) }))} · ${esc(t('Doluluk, WALE ve sözleşme bilgileri {d} tarihindeki durumdur.', { d: day(r.asOf) }))}</p>
  </div>
  ${foot(1)}
</section>`;

  // Sayfa 2: özet
  const rows = [
    [t('Brüt kira'), r.tl.gross, r.now.gross, r.prev.gross, 1],
    [t('Ortak gider tahakkuku'), r.tl.service, r.now.service, r.prev.service, 1],
    [t('Ortak gider harcaması'), -r.tl.serviceCost, -r.now.serviceCost, -r.prev.serviceCost, 0],
    [t('İşletme gideri'), -r.tl.opex, -r.now.opex, -r.prev.opex, 0],
    [t('NOI'), r.tl.noi, r.now.noi, r.prev.noi, 2]
  ];
  const summary = `<table class="t sum">
    <colgroup><col style="width:34%"><col style="width:18%"><col style="width:16%"><col style="width:18%"><col style="width:14%"></colgroup>
    <tr><th>${esc(t('Kalem'))}</th><th class="n">TL</th><th class="n">${esc(r.cur)}</th><th class="n">${esc(t('Önceki dönem'))} (${esc(r.cur)})</th><th class="n">${esc(t('Değişim'))}</th></tr>
    ${rows.map(([a, tl, now, prev, kind]) => `<tr class="${kind === 2 ? 'strong' : ''}"><td>${esc(a)}</td><td class="n">${esc(TL(tl))}</td><td class="n">${esc(M(now))}</td><td class="n">${esc(M(prev))}</td><td class="n">${esc(pct(change(now, prev)))}</td></tr>`).join('')}
    <tr><td>${esc(t('NOI marjı'))}</td><td class="n">${esc(pct(r.tl.margin))}</td><td class="n">${esc(pct(r.now.margin))}</td><td class="n">${esc(pct(r.prev.margin))}</td><td class="n"></td></tr>
    <tr><td>${esc(t('Tahsilat oranı'))}</td><td class="n">${esc(pct(r.tl.collection))}</td><td class="n">${esc(pct(r.now.collection))}</td><td class="n">${esc(pct(r.prev.collection))}</td><td class="n"></td></tr>
    <tr><td>${esc(t('Kur farkı'))}</td><td class="n">${esc(TL(r.tl.diff))}</td><td class="n">${esc(M(r.now.diff))}</td><td class="n">${esc(M(r.prev.diff))}</td><td class="n"></td></tr>
  </table>
  <div class="small">${esc(t('Önceki dönem: {p}. Kur farkı: dövizli sözleşmelerde tahsil edilen TL’nin ödeme günündeki karşılığı ile sözleşme tutarı arasındaki fark.', { p: r.prevRange.label }))}</div>`;
  const assets = more(r.assets, 6);
  const exp = more(r.expiries, 7);
  const page2 = `<section class="page">
  <h2>${esc(t('Özet'))}</h2>${summary}
  <h3>${esc(t('12 aylık gelir ({c})', { c: r.cur }))}</h3>${chartSvg(r.chart, r.cur)}
  <div class="cols">
    <div><h3>${esc(t('Varlık bazında doluluk (m²)'))}</h3>
      <table class="t"><colgroup><col style="width:38%"><col style="width:22%"><col style="width:40%"></colgroup>
      <tr><th>${esc(t('Varlık'))}</th><th class="n">m²</th><th>${esc(t('Doluluk'))}</th></tr>
      ${assets.rows.map((a) => `<tr><td class="clip">${esc(a.name)}</td><td class="n">${esc(num(a.area))}</td><td><span class="pv">${esc(pct(a.rate, 0))}</span>${bar(a.rate)}</td></tr>`).join('')}
      ${assets.rest ? `<tr><td colspan="3" class="small">${esc(t('ve {n} varlık daha', { n: assets.rest }))}</td></tr>` : ''}</table></div>
    <div><h3>${esc(t('Yıllara göre biten sözleşmeler'))}</h3>
      <table class="t"><colgroup><col style="width:22%"><col style="width:20%"><col style="width:22%"><col style="width:36%"></colgroup>
      <tr><th>${esc(t('Yıl'))}</th><th class="n">${esc(t('Adet'))}</th><th class="n">m²</th><th>${esc(t('Kira payı'))}</th></tr>
      ${exp.rows.length ? exp.rows.map((x) => `<tr><td>${esc(x.year)}</td><td class="n">${esc(x.count)}</td><td class="n">${esc(num(x.area))}</td><td><span class="pv">${esc(pct(x.share, 0))}</span>${bar(x.share)}</td></tr>`).join('') : `<tr><td colspan="4" class="small">${esc(t('Sözleşme bitiş tarihi girilmemiş.'))}</td></tr>`}
      ${exp.rest ? `<tr><td colspan="4" class="small">${esc(t('ve {n} yıl daha', { n: exp.rest }))}</td></tr>` : ''}</table></div>
  </div>
  ${foot(2)}
</section>`;

  // Sayfa 3: ayrıntılar
  const inc = more(r.increases, 6), rec = more(r.receivables, 6);
  const note = r.note ? `<h3>${esc(t('Yönetimin notu'))}</h3><div class="note">${esc(r.note.slice(0, 900))}${r.note.length > 900 ? '…' : ''}</div>` : '';
  const page3 = `<section class="page">
  <h2>${esc(t('Ayrıntılar'))}</h2>
  <h3>${esc(t('En büyük 10 kiracı'))}</h3>
  <table class="t"><colgroup><col style="width:34%"><col style="width:14%"><col style="width:20%"><col style="width:12%"><col style="width:20%"></colgroup>
    <tr><th>${esc(t('Kiracı'))}</th><th class="n">m²</th><th class="n">${esc(t('Yıllık kira'))} (${esc(r.cur)})</th><th class="n">${esc(t('Pay'))}</th><th class="n">${esc(t('Bitiş'))}</th></tr>
    ${r.tenants.length ? r.tenants.map((x) => `<tr><td class="clip">${esc(x.name)}${x.name !== x.unit ? `<span class="sub">${esc(x.unit)}</span>` : ''}</td><td class="n">${esc(num(x.area))}</td><td class="n">${esc(M(x.rent))}</td><td class="n">${esc(pct(x.share))}</td><td class="n">${esc(x.end ? day(x.end) : t('Süresiz'))}</td></tr>`).join('') : `<tr><td colspan="5" class="small">${esc(t('Kiracı kaydı yok.'))}</td></tr>`}
  </table>
  <div class="cols">
    <div><h3>${esc(t('Dönemdeki kira artışları'))}</h3>
      <table class="t"><colgroup><col style="width:34%"><col style="width:22%"><col style="width:22%"><col style="width:22%"></colgroup>
      <tr><th>${esc(t('Birim'))}</th><th>${esc(t('Tür'))}</th><th class="n">${esc(t('Oran'))}</th><th class="n">${esc(t('Tarih'))}</th></tr>
      ${inc.rows.length ? inc.rows.map((x) => `<tr><td class="clip">${esc(x.tenant || x.unit)}</td><td>${esc(x.kind === 'tufe' ? t('TÜFE') : x.kind === 'sabit' ? t('Sabit') : t('Diğer'))}</td><td class="n">${esc(pct(x.rate))}</td><td class="n">${esc(day(x.date))}</td></tr>`).join('') : `<tr><td colspan="4" class="small">${esc(t('Dönemde kira artışı yok.'))}</td></tr>`}
      ${inc.rest ? `<tr><td colspan="4" class="small">${esc(t('ve {n} artış daha', { n: inc.rest }))}</td></tr>` : ''}</table></div>
    <div><h3>${esc(t('30 günü geçen alacaklar'))}</h3>
      <table class="t"><colgroup><col style="width:44%"><col style="width:32%"><col style="width:24%"></colgroup>
      <tr><th>${esc(t('Kiracı'))}</th><th class="n">${esc(t('Tutar'))}</th><th class="n">${esc(t('Gün'))}</th></tr>
      ${rec.rows.length ? rec.rows.map((x) => `<tr><td class="clip">${esc(x.tenant || x.unit)}</td><td class="n">${esc(M(x.amount))}</td><td class="n">${esc(x.days)}</td></tr>`).join('') : `<tr><td colspan="3" class="small">${esc(t('30 günü geçen alacak yok.'))}</td></tr>`}
      ${rec.rest ? `<tr><td colspan="3" class="small">${esc(t('ve {n} kiracı daha', { n: rec.rest }))}</td></tr>` : ''}
      ${r.receivables.length ? `<tr class="strong"><td>${esc(t('Toplam'))}</td><td class="n">${esc(M(r.receivablesTotal))}</td><td></td></tr>` : ''}</table></div>
  </div>
  ${note}
  <h3>${esc(t('Yöntem notu'))}</h3>
  <div class="method">
    <p>${esc(t('Bu rapor anahtar’a girilen kayıtlardan hazırlanmıştır; denetlenmiş finansal tablo ya da değerleme raporu yerine geçmez.'))}</p>
    <p>${esc(t('Kur: TCMB döviz satış kuru. Her işlem kendi gününün kuruyla çevrilir: tahsilat ödeme günü, istenen tutar son ödeme günü, gider harcama günü; hafta sonu ve tatilde son iş gününün kuru. Ödeme günü girilmemiş tahsilatta son ödeme günü kullanılır. Dövizli sözleşmede sözleşmedeki döviz tutarı esas alınır.'))}</p>
    <p>${esc(t('NOI = brüt kira (kira ve ciro farkı) + ortak gider tahakkuku − ortak gider harcaması − işletme gideri. WALE kira ağırlıklıdır. Doluluk m² üzerinden, kiracısı olan ve sözleşmesi süren birimlerle hesaplanır.'))}</p>
    ${r.missing ? `<p>${esc(t('Bazı işlemlerin günü için kur bulunamadı; bu işlemler döviz toplamlarına katılmadı.'))}</p>` : ''}
  </div>
  ${foot(3)}
</section>`;

  const font = (w, f) => `@font-face{font-family:Inter;font-weight:${w};font-display:swap;src:url(${origin}/fonts/${f}) format('woff2')}`;
  return `<!doctype html><html lang="${locale() === 'en-GB' ? 'en' : 'tr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
${font(400, 'inter-400.woff2')}${font(500, 'inter-500.woff2')}${font(600, 'inter-600.woff2')}${font(700, 'inter-700.woff2')}
@font-face{font-family:InterTight;font-weight:800;font-display:swap;src:url(${origin}/fonts/intertight-800.woff2) format('woff2')}
@page{size:A4;margin:0}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;background:#D9D2CC;font-family:Inter,system-ui,sans-serif;color:${C.baca};font-variant-numeric:tabular-nums}
.page{position:relative;width:210mm;height:297mm;margin:12px auto;background:${C.krem};padding:16mm 15mm 18mm;overflow:hidden;box-shadow:0 2px 14px rgba(0,0,0,.18)}
.foot{position:absolute;left:15mm;right:15mm;bottom:8mm;display:flex;justify-content:space-between;font-size:8.5px;color:${C.duman};border-top:1px solid ${C.kil};padding-top:4px}
h1,h2{font-family:InterTight,Inter,sans-serif;font-weight:800;letter-spacing:-.02em;margin:0}
h2{font-size:22px;color:${C.baca};border-bottom:3px solid ${C.tugla};padding-bottom:5px;margin-bottom:10px}
h3{font-size:12.5px;font-weight:700;margin:14px 0 5px;color:${C.baca}}
.cover{padding:0}
.band{background:${C.tugla};color:${C.krem};padding:20mm 16mm 18mm;height:150mm;display:flex;flex-direction:column}
.logo{width:150px;height:auto;display:block}
.kicker{margin-top:auto;font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;opacity:.9}
.band h1{color:${C.krem};line-height:1.05;margin-top:8px;overflow-wrap:anywhere}
.period{font-size:22px;font-weight:700;margin-top:10px}
.dates{font-size:12px;opacity:.85;margin-top:3px}
.kpis{display:grid;grid-template-columns:1fr 1fr;gap:5mm;padding:9mm 15mm 0}
.kpi{background:${C.kart};border:1px solid ${C.kil};border-radius:14px;padding:5mm 5mm 4mm;min-width:0}
.kl{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${C.kahve}}
.kv{font-family:InterTight,Inter,sans-serif;font-weight:800;margin-top:2mm;white-space:nowrap;letter-spacing:-.02em}
.ks{font-size:9.5px;color:${C.duman};margin-top:1mm}
.cover-note{padding:7mm 15mm 0;font-size:9.5px;color:${C.kahve};line-height:1.5}.cover-note p{margin:0 0 2mm}
.t{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px}
.t th{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${C.kahve};text-align:left;padding:4px 5px;border-bottom:1.5px solid ${C.baca}}
.t td{padding:4px 5px;border-bottom:1px solid ${C.kil};vertical-align:middle}
.t .n{text-align:right;white-space:nowrap}
.t tr.strong td{font-weight:700;border-top:1.5px solid ${C.baca}}
.sum td{font-size:10.5px}
.clip{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sub{display:block;font-size:8.5px;color:${C.duman}}
.small{font-size:8.5px;color:${C.duman};margin-top:3px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
.bar{display:inline-block;vertical-align:middle;width:calc(100% - 36px);height:6px;border-radius:3px;background:${C.kil};margin-left:4px}
.bar span{display:block;height:6px;border-radius:3px;background:${C.tugla}}
.pv{display:inline-block;width:30px;text-align:right;white-space:nowrap}
.note{background:${C.kart};border:1px solid ${C.kil};border-left:3px solid ${C.tugla};border-radius:8px;padding:8px 10px;font-size:10px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;max-height:44mm;overflow:hidden}
.method{font-size:8.8px;color:${C.kahve};line-height:1.45}.method p{margin:0 0 1.6mm}
@media print{html,body{background:${C.krem}}.page{margin:0;box-shadow:none;page-break-after:always;break-after:page}.page:last-child{page-break-after:auto;break-after:auto}}
</style></head><body>
${cover}${page2}${page3}
</body></html>`;
}

function isoLocal(d){
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/** Belgeyi yeni sekmede açar (web); print: açılınca yazdırma penceresi (PDF olarak kaydet). */
export function openInvestorReport(r, { print = true } = {}){
  if (typeof window === 'undefined') return false;
  const html = investorHtml(r, { origin: window.location.origin, generated: new Date() });
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  // Yazı tipleri ve logo yüklendikten sonra yazdırma penceresi ("PDF olarak kaydet").
  if (w && print) w.addEventListener('load', () => setTimeout(() => { try { w.focus(); w.print(); } catch { /* kullanıcı kendisi yazdırır */ } }, 500));
  setTimeout(() => URL.revokeObjectURL(url), 120000);
  return !!w;
}
