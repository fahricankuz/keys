/* Giriş tutanağı belgesi (A4): taraflar, oda özeti, fotoğraf albümü (her fotoğrafın kendi açıklamasıyla), iki tarafın dijital onayı
   (ayrı ayrı tarih ve saat) ve kilit bilgisi. Yazdırılır ve "PDF olarak kaydet" ile PDF olur (yatırımcı raporuyla aynı yol).
   Tasarım: anahtar kimliği (koyu başlık bandı, tuğla kırmızısı vurgu, krem zemin, Inter). Belgede betik yoktur (uygulamanın
   içerik güvenliği kuralı yeni pencereye de geçer); yazdırmayı belgeyi açan sayfa tetikler (openInspectReport).
   Fotoğraflar `shots[j]` ile açıklamalar `caps[j]` aynı sırada eşlenir; her fotoğraf kendi açıklamasıyla tek bir <figure> içindedir
   (sayfa sonunda ayrılmaz), böylece açıklama başka fotoğrafın altına düşmez. */
import { t, locale } from './i18n.js';

const C = { tugla: '#C8302E', krem: '#FAF5F0', kart: '#FFFDFB', baca: '#1D1A19', kahve: '#5C4F4A', duman: '#8A807A', kil: '#E8DDD5', yesil: '#2A6B3A', yesilBg: '#E4F1E7', bal: '#8A5A00', balBg: '#FBEFD2' };
const TZ = 'Europe/Istanbul';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const loc = () => (locale() === 'en-GB' ? 'en-GB' : 'tr-TR');
/** Belgedeki yazı tipi ve logo adresleri için kaynak: yalnız "http(s)://alan[:kapı]" biçimi geçer (stil bloğuna ve adreslere
    kullanıcı ya da adres çubuğu kaynaklı değer karışamasın); aksi halde boş (göreli adres). */
function safeOrigin(o){
  const m = /^(https?):\/\/([A-Za-z0-9.-]+)(:[0-9]{1,5})?$/.exec(String(o || '').trim().replace(/\/$/, ''));
  return m ? m[1] + '://' + m[2] + (m[3] || '') : '';
}
/** Fotoğraf adresi: https, blob ya da görsel data adresi. "javascript:" gibi şemalar belgeye girmez. */
const safeImg = (u) => (/^(https?:\/\/|blob:|data:image\/)/i.test(String(u || '')) ? String(u) : '');

/** Onay anı: tarih ve saat ayrı ayrı (İstanbul saati). Geçersiz ya da yoksa null. */
export function stamp(v){
  const d = v ? new Date(v) : null;
  if (!d || isNaN(d.getTime())) return null;
  return {
    date: d.toLocaleDateString(loc(), { day: 'numeric', month: 'long', year: 'numeric', timeZone: TZ }),
    time: d.toLocaleTimeString(loc(), { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: TZ })
  };
}

/**
 * d: { name, addr, type, area, landlord:{name,phone}, tenant:{name,phone}, inspect, urls (shots'un görüntü adresleri, rooms ile aynı yapıda),
 *      docs:[{cat}] , generated (Date) }
 * o: { origin }
 */
export function inspectHtml(d, o = {}){
  const origin = safeOrigin(o.origin);
  const ins = d.inspect || {};
  const rooms = ins.rooms || [];
  const both = !!(ins.tenantOk && ins.landlordOk);
  const gen = d.generated || new Date();
  const lockAt = stamp(ins.lockedAt) || (both ? stamp(laterOf(ins.tenantAt, ins.landlordAt)) : null);
  const photos = rooms.reduce((n, r) => n + (r.shots || []).length + (r.photos || 0), 0);
  const docId = ins.hash ? String(ins.hash).slice(0, 12).toUpperCase() : '';
  const title = `${d.name} · ${t('Giriş tutanağı')}`;
  const font = (w, f) => `@font-face{font-family:Inter;font-weight:${w};font-display:swap;src:url(${origin}/fonts/${f}) format('woff2')}`;

  const party = (label, who) => `<div class="card"><div class="lbl red">${esc(label)}</div>
    <div class="fl">${esc(t('Ad Soyad'))}</div><div class="fv">${esc(who.name || '—')}</div>
    <div class="fl">${esc(t('Telefon'))}</div><div class="fv">${esc(who.phone || '—')}</div></div>`;

  const roomRows = rooms.map((r) => {
    const n = (r.shots || []).length + (r.photos || 0);
    return `<tr><td class="b">${esc(r.n)}</td><td class="c">${n || '—'}</td><td>${esc(r.note || '—')}</td></tr>`;
  }).join('') || `<tr><td colspan="3" class="mut">${esc(t('Oda kaydı yok.'))}</td></tr>`;

  const album = rooms.map((r, i) => {
    const shots = r.shots || [];
    const urls = (d.urls && d.urls[i]) || [];
    if (!shots.length && !r.photos) return '';
    const figs = shots.map((_, j) => {
      const cap = ((r.caps || [])[j] || '').trim();
      const src = safeImg(urls[j]);
      return `<figure><div class="ph">${src ? `<img src="${esc(src)}" alt="${esc(r.n)} ${j + 1}">` : ''}</div>
        <figcaption><b>${esc(r.n)} · ${esc(t('Fotoğraf {n}', { n: j + 1 }))}</b><span class="${cap ? '' : 'mut'}">${esc(cap || t('Açıklama yok'))}</span></figcaption></figure>`;
    }).join('');
    const extra = r.photos ? `<p class="mut">${esc(t('+ {n} fotoğraf bu belgede yer almıyor (eski kayıt).', { n: r.photos }))}</p>` : '';
    return `<section class="room"><h3>${esc(r.n)} <small>${esc(t('{n} fotoğraf', { n: shots.length + (r.photos || 0) }))}</small></h3>${r.note ? `<p class="rn">${esc(r.note)}</p>` : ''}<div class="grid">${figs}</div>${extra}</section>`;
  }).join('');

  const has = (re) => (d.docs || []).some((x) => re.test(String(x.cat || '')));
  const checks = [
    [t('Fotoğraf albümü (oda oda çekim)'), photos > 0],
    [t('Kira sözleşmesi (imzalı)'), has(/sözleşme/i)],
    [t('Depozito makbuzu'), has(/depozito|makbuz/i)],
    [t('DASK poliçesi'), has(/dask/i)]
  ].map(([l, ok]) => `<li class="${ok ? 'on' : ''}"><i>${ok ? '✓' : ''}</i>${esc(l)}</li>`).join('');

  const sign = (label, who, ok, at, by) => {
    const s = ok ? stamp(at) : null;
    return `<div class="sig ${ok ? 'ok' : ''}"><div class="lbl ${ok ? 'green' : ''}">${esc(label)}</div>
      <div class="st">${ok ? '✓ ' + esc(t('Dijital olarak onaylandı')) : esc(t('Onay bekleniyor'))}</div>
      <div class="fl">${esc(t('Ad Soyad'))}</div><div class="fv">${esc((ok && by) || who.name || '—')}</div>
      <div class="two"><div><div class="fl">${esc(t('Onay tarihi'))}</div><div class="fv">${esc(s ? s.date : ok ? t('Kayıtlı değil') : '—')}</div></div>
      <div><div class="fl">${esc(t('Onay saati'))}</div><div class="fv">${esc(s ? s.time : ok ? t('Kayıtlı değil') : '—')}</div></div></div></div>`;
  };

  const lockText = both
    ? (lockAt
      ? t('Bu giriş tutanağı, her iki tarafın onayıyla {date} tarihinde {time} itibarıyla onaylanmış ve kilitlenmiştir. Onay sonrasında tutanak üzerinde herhangi bir değişiklik yapılamaz.', { date: lockAt.date, time: lockAt.time })
      : t('Bu giriş tutanağı, her iki tarafın onayıyla onaylanmış ve kilitlenmiştir. Onay sonrasında tutanak üzerinde herhangi bir değişiklik yapılamaz.'))
    : t('Bu tutanak taslaktır: iki taraf da onaylayınca kilitlenir ve değiştirilemez.');

  const status = both ? `<span class="chip ok">${esc(t('Onaylandı · Kilitli'))}</span>` : `<span class="chip warn">${esc(t('Taslak · Onay bekleniyor'))}</span>`;
  const genS = stamp(gen);

  return `<!doctype html><html lang="${loc() === 'en-GB' ? 'en' : 'tr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>
${font(400, 'inter-400.woff2')}${font(500, 'inter-500.woff2')}${font(600, 'inter-600.woff2')}${font(700, 'inter-700.woff2')}
@font-face{font-family:InterTight;font-weight:800;font-display:swap;src:url(${origin}/fonts/intertight-800.woff2) format('woff2')}
@page{size:A4;margin:12mm 12mm 14mm}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;background:#D9D2CC;font-family:Inter,system-ui,sans-serif;color:${C.baca};font-size:11px;line-height:1.45}
table.doc{width:186mm;margin:12px auto;background:${C.krem};border-collapse:collapse;box-shadow:0 2px 14px rgba(0,0,0,.18)}
table.doc>tbody>tr>td{padding:0}
tfoot{display:table-footer-group}
.body{padding:0 0 4mm}
.pad{padding:0 8mm}
.band{background:${C.baca};color:#fff;border-radius:14px;margin:0 8mm 6mm;padding:9mm 9mm;display:flex;justify-content:space-between;align-items:center}
.logo{width:150px;height:auto;display:block}
.bt{text-align:right}.bt .a{font-family:InterTight,Inter,sans-serif;font-weight:800;font-size:22px;line-height:1.1;letter-spacing:-.01em}
.bt .a em{font-style:normal;color:${C.tugla}}.bt .s{font-size:8.5px;letter-spacing:.14em;text-transform:uppercase;color:#CFC6BF;margin-top:3px}
.meta{display:flex;justify-content:space-between;align-items:flex-start;gap:8mm;padding:0 8mm 4mm}
.meta h1{font-family:InterTight,Inter,sans-serif;font-weight:800;font-size:19px;margin:0;letter-spacing:-.015em;overflow-wrap:anywhere}
.meta .ad{color:${C.kahve};margin-top:2px}
.chip{display:inline-block;border-radius:999px;padding:3px 10px;font-weight:700;font-size:10px;white-space:nowrap}
.chip.ok{background:${C.yesilBg};color:${C.yesil}}.chip.warn{background:${C.balBg};color:${C.bal}}
h2{font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:${C.duman};margin:6mm 8mm 2.5mm;font-weight:700;break-after:avoid}
.cards{display:grid;grid-template-columns:1fr 1fr;gap:5mm;padding:0 8mm}
.card,.sig{background:${C.kart};border:1px solid ${C.kil};border-radius:12px;padding:4mm 5mm;break-inside:avoid}
.lbl{font-size:9px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:${C.kahve}}.lbl.red{color:${C.tugla}}.lbl.green{color:${C.yesil}}
.fl{font-size:8.5px;color:${C.duman};margin-top:2.2mm}.fv{font-weight:600;font-size:11.5px;border-bottom:1px solid ${C.kil};padding-bottom:1.2mm;min-height:5mm;overflow-wrap:anywhere}
table.rooms{width:calc(100% - 16mm);margin:0 8mm;border-collapse:collapse;background:${C.kart};border:1px solid ${C.kil}}
table.rooms th{background:${C.baca};color:#fff;font-size:9px;text-align:left;padding:2.2mm 3mm}
table.rooms td{padding:2.2mm 3mm;border-top:1px solid ${C.kil};vertical-align:top;overflow-wrap:anywhere}
table.rooms td.b{font-weight:700;width:34%}table.rooms td.c{width:14%;text-align:center}table.rooms tr{break-inside:avoid}
.room{padding:0 8mm;break-inside:avoid}.room h3{font-size:12.5px;margin:5mm 0 1.5mm;font-weight:800;break-after:avoid}.room h3 small{font-weight:500;color:${C.duman};font-size:9.5px;margin-left:6px}
.rn{margin:0 0 2mm;color:${C.kahve};font-style:italic}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:4mm}
figure{margin:0;background:${C.kart};border:1px solid ${C.kil};border-radius:10px;overflow:hidden;break-inside:avoid}
.ph{height:58mm;background:#EFE7E0;display:flex;align-items:center;justify-content:center}.ph img{width:100%;height:100%;object-fit:cover;display:block}
figcaption{padding:2.2mm 3mm 2.6mm;display:flex;flex-direction:column;gap:1px;font-size:10px;overflow-wrap:anywhere}figcaption b{font-size:9.5px;color:${C.kahve}}
.mut{color:${C.duman}}
ul.ck{list-style:none;margin:0 8mm;padding:4mm 5mm;background:${C.kart};border:1px solid ${C.kil};border-radius:12px;break-inside:avoid}
ul.ck li{display:flex;align-items:center;gap:3mm;padding:1mm 0}ul.ck i{width:4mm;height:4mm;border:1.4px solid ${C.duman};border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-style:normal;font-size:9px;font-weight:800;color:#fff}
ul.ck li.on i{background:${C.yesil};border-color:${C.yesil}}
.sigs{break-inside:avoid}
.sig .st{font-weight:800;font-size:11.5px;margin-top:1.5mm;color:${C.duman}}.sig.ok .st{color:${C.yesil}}
.two{display:grid;grid-template-columns:1fr 1fr;gap:4mm}
.lock{margin:5mm 8mm 0;padding:4mm 5mm;border-radius:12px;font-size:10.5px;line-height:1.55;break-inside:avoid;background:${both ? C.yesilBg : C.balBg};color:${both ? C.yesil : C.bal};font-weight:600}
.hash{margin:3mm 8mm 0;font-size:8px;color:${C.duman};overflow-wrap:anywhere;break-inside:avoid}.hash b{color:${C.kahve}}
.foot{display:flex;justify-content:space-between;gap:6mm;border-top:1px solid ${C.kil};margin:4mm 8mm 0;padding:2mm 0 0;font-size:8px;color:${C.duman}}
@media print{html,body{background:${C.krem}}table.doc{margin:0;width:100%;box-shadow:none}}
</style></head><body>
<table class="doc"><tbody><tr><td><div class="body">
<div class="band"><img class="logo" src="${esc(origin)}/marka/anahtar-logo-seffaf-beyaz.png" alt="anahtar">
<div class="bt"><div class="a">${esc(t('Giriş'))}<br><em>${esc(t('Tutanağı'))}</em></div><div class="s">${esc(t('Mülk teslim formu'))}</div></div></div>
<div class="meta"><div><h1>${esc(d.name)}</h1><div class="ad">${esc(d.addr || '')}</div><div class="mut">${esc([d.type ? t(d.type) : '', d.area ? d.area + ' m²' : ''].filter(Boolean).join(' · '))}</div></div><div>${status}</div></div>
<h2>${esc(t('Taraf bilgileri'))}</h2>
<div class="cards">${party(t('Mülk sahibi'), d.landlord || {})}${party(t('Kiracı'), d.tenant || {})}</div>
<h2>${esc(t('Mülkün genel durumu'))}</h2>
<table class="rooms"><thead><tr><th>${esc(t('Oda / Alan'))}</th><th style="text-align:center">${esc(t('Fotoğraf'))}</th><th>${esc(t('Notlar'))}</th></tr></thead><tbody>${roomRows}</tbody></table>
<h2>${esc(t('Tutanağa eklenen belgeler'))}</h2>
<ul class="ck">${checks}</ul>
${album ? `<h2>${esc(t('Fotoğraf albümü'))}</h2>${album}` : ''}
<div class="sigs"><h2>${esc(t('Dijital onay'))}</h2>
<div class="cards">${sign(t('Mülk sahibi'), d.landlord || {}, !!ins.landlordOk, ins.landlordAt, ins.landlordBy)}${sign(t('Kiracı'), d.tenant || {}, !!ins.tenantOk, ins.tenantAt, ins.tenantBy)}</div>
<div class="lock">${esc(lockText)}</div>
${ins.hash ? `<div class="hash"><b>${esc(t('Belge özeti (SHA-256)'))}:</b> ${esc(ins.hash)}</div>` : ''}</div>
</div></td></tr></tbody>
<tfoot><tr><td><div class="foot"><span>${esc(t('Bu tutanak anahtar.io platformu üzerinden dijital olarak saklanabilir.'))}${docId ? ' · ' + esc(t('Belge no')) + ' ' + esc(docId) : ''}</span><span>${esc(t('Oluşturulma'))}: ${esc(genS ? genS.date + ' ' + genS.time.slice(0, 5) : '')} · anahtar.io</span></div></td></tr></tfoot></table>
</body></html>`;
}

function laterOf(a, b){
  const x = a ? new Date(a).getTime() : 0, y = b ? new Date(b).getTime() : 0;
  const m = Math.max(x || 0, y || 0);
  return m ? new Date(m).toISOString() : null;
}

/**
 * Belgeyi yeni pencerede açar (web) ve açılınca yazdırma penceresini ("PDF olarak kaydet") çağırır.
 * Pencere tıklama anında açılır (açılır pencere engeli aşılır), görüntü adresleri sonradan çözülünce belge yazılır.
 * resolve: () => Promise<{ doc }> — inspectHtml girdisini hazırlar (fotoğraf adresleri dahil).
 */
export async function openInspectReport(resolve, { print = true } = {}){
  if (typeof window === 'undefined') return false;
  const w = window.open('', '_blank');
  if (!w) return false;
  try { w.document.title = t('Giriş tutanağı'); w.document.body.innerHTML = `<p style="font:14px system-ui;padding:24px">${esc(t('Tutanak hazırlanıyor…'))}</p>`; } catch { /* yoksay */ }
  let html;
  try { html = inspectHtml(await resolve(), { origin: window.location.origin }); }
  catch (e) { try { w.close(); } catch { /* yoksay */ } throw e; }
  w.document.open(); w.document.write(html); w.document.close();
  if (print){
    // Fotoğraflar ve yazı tipleri yüklenince (en çok 10 sn) yazdırma penceresi.
    const t0 = Date.now();
    const ready = () => {
      try {
        const imgs = [...w.document.images];
        if (imgs.every((i) => i.complete) || Date.now() - t0 > 10000){ w.focus(); setTimeout(() => { try { w.print(); } catch { /* kullanıcı kendisi yazdırır */ } }, 300); return; }
      } catch { return; }
      setTimeout(ready, 250);
    };
    setTimeout(ready, 400);
  }
  return true;
}
