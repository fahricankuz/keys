/* Türetilmiş veriler: dönem hesabı, hatırlatmalar, raporlar, arama. */

import { t } from './i18n.js';
import { S, ui, STEPS, isCommercial } from './state.js';
import { stopajRate } from './tax.js';
import { t0, iso, add, addM, mkey, between, daysTo, parse, fmt, fmtFull, monthName, monthYear, tl, match } from './util.js';

export function P(id){ return S.props[id]; }
export function role(){ return ui.role; }

export const ST = {
  approved:[t('Ödendi'),'ok'],
  review:[t('Onay bekliyor'),'wait'],
  partial:[t('Kısmi ödeme'),'wait'],
  rejected:[t('Dekont reddedildi'),'bad'],
  pending:[t('Bekliyor'),''],
  late:[t('Gecikti'),'bad']
};

export function chip(st){
  const s = ST[st] || ST.pending;
  return '<span class="chip '+s[1]+'">'+s[0]+'</span>';
}

/** Bir ayın ödeme durumu; kayıt yoksa vadeye göre bekliyor/gecikti. */
export function statusOf(p, key){
  const rec = p.pay[key];
  if (rec) return rec.status;
  const d = parse(key+'-01');
  const due = new Date(d.getFullYear(), d.getMonth(), p.dueDay);
  return t0() > due ? 'late' : 'pending';
}

export function dueDate(p, key){
  const d = parse(key+'-01');
  return new Date(d.getFullYear(), d.getMonth(), p.dueDay);
}

/**
 * Odaklanılacak dönem: sözleşme başından bu yana kapanmamış ilk ay,
 * hepsi kapalıysa gelecek ay. Böylece geçmiş bir gecikme gözden kaçmaz.
 */
export function period(p){
  const today = t0(), cur = mkey(today);
  // Sözleşme başından tara; çok eski kayıtlarda 24 ayla sınırla.
  const start = p.startDate ? parse(p.startDate) : addM(today, -11);
  let cursor = new Date(Math.max(start.getTime(), addM(today, -24).getTime()));
  cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);

  while (mkey(cursor) <= cur){
    const key = mkey(cursor);
    const st = statusOf(p, key);
    if (st !== 'approved'){
      return { key, due: dueDate(p, key), status: st, rec: p.pay[key] };
    }
    cursor = addM(cursor, 1);
  }
  const nx = addM(new Date(today.getFullYear(), today.getMonth(), 1), 1), nk = mkey(nx);
  return { key: nk, due: dueDate(p, nk), status: statusOf(p, nk), rec: p.pay[nk] };
}

/**
 * Belirli bir ay (YYYY-MM) ya da tarih (YYYY-MM-DD) için geçerli kira.
 * Kira tutarı geçmişinden okunur; yenilemeden sonra yeni tutar kendiliğinden devreye girer.
 */
export function rentAt(p, when){
  const hist = (p.rentHistory || []).slice().sort((a, b) => a.from < b.from ? -1 : 1);
  if (!hist.length) return p.rent;
  // Ay anahtarı verilmişse o ayın vade gününe bakılır.
  const date = String(when).length === 7 ? when + '-' + String(p.dueDay).padStart(2, '0') : String(when);
  let amount = hist[0].amount;
  for (const h of hist) if (h.from <= date) amount = h.amount;
  return amount;
}

/**
 * Kiracının o ay mülk sahibine ödeyeceği tutar. Kiracı stopaj kesiyorsa
 * sözleşmedeki brüt kiradan stopaj düşülür; stopajı kiracı vergi dairesine öder.
 */
export function expectedAt(p, key){
  const gross = rentAt(p, key);
  return p.stopaj ? Math.round(gross * (1 - stopajRate(String(key).slice(0, 4)))) : gross;
}

/** Ödenen net tutarın brüt karşılığı ve kesilen stopaj. */
export function grossOf(p, key, net){
  if (!p.stopaj) return { gross:net, withheld:0 };
  const gross = Math.round(net / (1 - stopajRate(String(key).slice(0, 4))));
  return { gross, withheld: gross - net };
}

/** Kısmi ödemede kalan bakiye. */
export function remaining(p, key){
  const rec = p.pay[key];
  if (!rec || rec.status !== 'partial') return 0;
  return Math.max(0, expectedAt(p, key) - (Number(rec.amount) || 0));
}

/**
 * Ödenmemiş kira: sözleşme başından bugüne vadesi geçmiş ve kapanmamış aylar.
 * Çıkışta depozitodan düşülecek kalemi önermek için kullanılır.
 */
export function unpaid(p){
  const today = t0(), cur = mkey(today);
  let c = parse(p.startDate);
  c = new Date(c.getFullYear(), c.getMonth(), 1);
  const months = [];
  let total = 0;
  while (mkey(c) <= cur){
    const key = mkey(c);
    const st = statusOf(p, key);
    let owed = 0;
    if (st === 'late' || st === 'rejected') owed = expectedAt(p, key);
    else if (st === 'partial') owed = remaining(p, key);
    if (owed > 0){ months.push({ key, owed }); total += owed; }
    c = addM(c, 1);
  }
  return { total, months };
}

/**
 * Sözleşme süresi dolmuşsa bir yıl uzatır (konut kirasında sözleşme
 * kendiliğinden yenilenir) ve güncel kirayı geçmişten yeniden okur.
 * Değişiklik olduysa true döner.
 */
export function normalize(p){
  let changed = false;
  const today = iso(t0());
  while (p.contractEnd < today){
    const d = parse(p.contractEnd);
    p.contractEnd = iso(new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()));
    if (p.renewal) p.renewal = null;
    changed = true;
  }
  const r = rentAt(p, today);
  if (r !== p.rent){ p.rent = r; changed = true; }
  return changed;
}

export function normalizeAll(){
  let changed = false;
  Object.values(S.props).forEach(p => { if (normalize(p)) changed = true; });
  return changed;
}

/* ---- kiracılar ---- */

export function tenantsLabel(p){
  const names = (p.tenants || []).map(x => x.name);
  if (!names.length) return t('Kiracı yok');
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(', ') + ' ' + t('ve') + ' ' + names[names.length - 1];
}

/** Demo'da kiracı görünümü evin ilk kiracısı olarak açılır; gerçek hesapta oturum sahibidir. */
export function meTenant(p){
  const id = ui.meTenant && p.tenants.some(x => x.id === ui.meTenant) ? ui.meTenant : p.tenants[0]?.id;
  return p.tenants.find(x => x.id === id) || null;
}

export function senderName(p, m){
  if (m.from === 'landlord') return p.landlord.name;
  if (m.from === 'system') return t('Sistem');
  return (p.tenants.find(x => x.id === m.by) || p.tenants[0] || { name:'Kiracı' }).name;
}

/* ---- giderler ---- */

export function expensesIn(p, year){
  return (p.expenses || []).filter(e => String(e.date).startsWith(String(year)));
}
export function sum(list, f = x => x.amount){ return list.reduce((a, x) => a + (Number(f(x)) || 0), 0); }

/* ---- çıkış ve depozito ---- */

export function moveOutSummary(p){
  const mo = p.moveOut;
  const deducted = mo ? sum(mo.deductions || []) : 0;
  const deposit = Number(p.deposit) || 0;
  return {
    deposit, deducted,
    refund: Math.max(0, deposit - deducted),
    extra: Math.max(0, deducted - deposit)
  };
}

export function openReqs(p){ return p.requests.filter(r => r.status < 3); }
export function newReqs(p){ return p.requests.filter(r => r.status === 0); }

export function otherPerson(p){
  if (ui.role === 'tenant') return p.landlord;
  return { name: tenantsLabel(p), phone: p.tenants[0]?.phone || '' };
}
export function otherLabel(){ return ui.role === 'tenant' ? t('Mülk sahibi') : t('Kiracı'); }

/** Kiracı tarafının görünen adı: şirketse unvan, değilse kişiler. */
export function lesseeLabel(p){ return p.company && p.company.name ? p.company.name : tenantsLabel(p); }

/** Bu ayın tahsilat tablosu — portföy kartındaki oranın kaynağı. */
export function monthCollection(){
  const key = mkey(t0());
  let expected = 0, collected = 0, waiting = 0, late = 0;
  S.order.forEach(id => {
    const p = P(id);
    const due = expectedAt(p, key);
    expected += due;
    const rec = p.pay[key];
    const st = statusOf(p, key);
    if (st === 'approved') collected += Number(rec?.amount) || due;
    else if (st === 'partial'){ collected += Number(rec?.amount) || 0; waiting += remaining(p, key); }
    else if (st === 'review') waiting += Number(rec?.amount) || due;
    else if (st === 'late' || st === 'rejected') late += due;
  });
  return { key, expected, collected, waiting, late, pct: expected ? collected/expected : 0 };
}

export function yearIncome(){
  const y = String(new Date().getFullYear());
  const per = {};
  let total = 0;
  S.order.forEach(id => {
    const p = P(id);
    let s = 0;
    Object.keys(p.pay).forEach(k => {
      const rec = p.pay[k];
      if (k.startsWith(y) && (rec.status === 'approved' || rec.status === 'partial')) s += Number(rec.amount) || 0;
    });
    per[id] = s;
    total += s;
  });
  return { per, total, year:y };
}

/**
 * Yıl bazında tahsilat, gider ve net — rapor ve vergi tahmini için.
 * received: hesaba geçen; gross: stopaj dahil brüt kira; withheld: kiracının kestiği stopaj.
 * Net getiri hesaba geçenden değil brütten hesaplanır: stopaj mülk sahibinin vergisidir.
 */
export function yearNumbers(year){
  const y = String(year);
  const rows = S.order.map(id => {
    const p = P(id);
    let received = 0, gross = 0, withheld = 0;
    Object.keys(p.pay).forEach(k => {
      const rec = p.pay[k];
      if (!k.startsWith(y) || !(rec.status === 'approved' || rec.status === 'partial')) return;
      const amount = Number(rec.amount) || 0;
      const g = grossOf(p, k, amount);
      received += amount; gross += g.gross; withheld += g.withheld;
    });
    const exp = sum(expensesIn(p, y));
    const net = gross - exp;
    // Vergi grubu: konut / stopajlı işyeri / stopajsız işyeri.
    const group = !isCommercial(p) ? 'konut' : p.stopaj ? 'stopajli' : 'diger';
    return { id, name:p.name, type:p.type, group, received, gross, withheld, exp, net, value:p.value, yieldPct: p.value ? net / p.value : null };
  });
  const groups = {};
  ['konut','stopajli','diger'].forEach(g => {
    const rs = rows.filter(r => r.group === g);
    groups[g] = { gross: sum(rs, r => r.gross), withheld: sum(rs, r => r.withheld), exp: sum(rs, r => r.exp) };
  });
  return {
    year: y, rows, groups,
    received: sum(rows, r => r.received),
    gross: sum(rows, r => r.gross),
    withheld: sum(rows, r => r.withheld),
    exp: sum(rows, r => r.exp),
    net: sum(rows, r => r.net)
  };
}

/** Kayıtlarda geçen yıllar (ödeme ya da gider), yeniden eskiye. */
export function dataYears(){
  const ys = new Set([String(new Date().getFullYear())]);
  S.order.forEach(id => {
    const p = P(id);
    Object.keys(p.pay).forEach(k => ys.add(k.slice(0, 4)));
    (p.expenses || []).forEach(e => ys.add(String(e.date).slice(0, 4)));
  });
  return [...ys].sort().reverse();
}

/** Ev bazlı yaklaşan işler — hem gündem listesinde hem takvimde kullanılır. */
export function agendaItems(p){
  const items = [];
  openReqs(p).forEach(r => items.push({
    kind:'req', title:r.title, sub:t(r.cat)+' · '+t(STEPS[r.status]),
    go:'/'+(ui.role==='tenant' ? 'kiraci/talepler/'+r.id : 'mulk-sahibi/mulk/'+p.id+'/talep?req='+r.id),
    chip:t('Talep'), cls:'acc'
  }));
  const per = period(p);
  if (per.status !== 'approved') items.push({
    kind:'pay', title: monthYear(per.key)+(' '+t('kirası')), sub: t('Vade {date}', { date:fmtFull(per.due) }),
    go:'/'+(ui.role==='tenant' ? 'kiraci/odemeler' : 'mulk-sahibi/mulk/'+p.id+'/odeme'),
    chip: between(t0(), per.due) + (' '+t('gün')), days: between(t0(), per.due)
  });
  items.push({
    kind:'contract', title:t('Sözleşme yenileme'), sub: fmtFull(parse(p.contractEnd)),
    go:'/'+(ui.role==='tenant' ? 'kiraci/odemeler' : 'mulk-sahibi/mulk/'+p.id+'/odeme'),
    chip: t('{n} gün', { n:daysTo(p.contractEnd) }), days: daysTo(p.contractEnd)
  });
  if (p.dask) items.push({
    kind:'dask', title:t('DASK poliçesi'), sub: t('Bitiş {date}', { date:fmtFull(parse(p.dask)) }),
    go:'/'+(ui.role==='tenant' ? 'kiraci/belgeler' : 'mulk-sahibi/mulk/'+p.id+'/belge'),
    chip: t('{n} gün', { n:daysTo(p.dask) }), days: daysTo(p.dask)
  });
  if (p.moveOut && !p.moveOut.refunded){
    const done = p.moveOut.tenantOk && p.moveOut.landlordOk;
    items.push({
      kind:'moveout', title:t('Çıkış ve depozito iadesi'),
      sub: done ? t('İki taraf onayladı · iade bekleniyor') : t('Onay bekleniyor'),
      go: ui.role === 'tenant' ? '/kiraci/belgeler/cikis' : '/mulk-sahibi/mulk/'+p.id+'/cikis',
      chip: p.moveOut.date ? t('{n} gün', { n:daysTo(p.moveOut.date) }) : t('Süreçte'),
      days: p.moveOut.date ? daysTo(p.moveOut.date) : null, cls:'acc'
    });
  }
  p.docs.forEach(d => {
    // DASK poliçesinin bitişi yukarıdaki DASK satırında zaten var.
    if (!d.until || d.cat === 'DASK poliçesi') return;
    items.push({
      kind:'doc', title:t(d.cat),
      sub: d.cat === 'Tahliye taahhütnamesi' ? t('Tahliye {date}', { date:fmtFull(parse(d.until)) }) : t('Bitiş {date}', { date:fmtFull(parse(d.until)) }),
      go:'/'+(ui.role==='tenant' ? 'kiraci/belgeler' : 'mulk-sahibi/mulk/'+p.id+'/belge'),
      chip: t('{n} gün', { n:daysTo(d.until) }), days: daysTo(d.until)
    });
  });
  return items;
}

/** Ayarlardaki eşiklere göre öne çıkan hatırlatmalar. */
export function reminders(){
  const out = [], s = S.settings;
  const ids = ui.role === 'tenant' ? [S.myHome] : S.order;

  ids.forEach(id => {
    const p = P(id);
    const per = period(p);
    const dd = between(t0(), per.due);
    const pre = ui.role === 'landlord' ? p.name + ': ' : '';
    const payGo = ui.role === 'tenant' ? '/kiraci/odemeler' : '/mulk-sahibi/mulk/'+id+'/odeme';
    const docGo = ui.role === 'tenant' ? '/kiraci/belgeler' : '/mulk-sahibi/mulk/'+id+'/belge';

    if (ui.role === 'tenant'){
      if ((per.status === 'pending') && dd <= s.rentDays)
        out.push({ t:t('Kira günü yaklaşıyor'), b: dd === 0
          ? t('{month} kirası bugün ödenmeli.', { month: monthYear(per.key) })
          : t('{month} kirası {n} gün sonra ödenmeli.', { month: monthYear(per.key), n: dd }), go:payGo, w:1 });
      if (per.status === 'late')
        out.push({ t:t('Kira gecikti'), b: t('{month} kirası için dekont yüklenmedi ({n} gün).', { month: monthYear(per.key), n: -dd }), go:payGo, w:2 });
      if (per.status === 'partial')
        out.push({ t:t('Kısmi ödeme'), b: t('{month} için {amount} bakiye görünüyor.', { month: monthYear(per.key), amount: tl(remaining(p, per.key)) }), go:payGo, w:2 });
      if (per.status === 'rejected')
        out.push({ t:t('Dekont reddedildi'), b:(per.rec?.rejectReason || t('Mülk sahibi dekontu onaylamadı.')), go:payGo, w:2 });
      if (p.renewal && p.renewal.status === 'sent')
        out.push({ t:t('Yenileme teklifi bekliyor'), b: tl(p.renewal.amount)+(' '+t('önerildi; yanıtını bekliyor.')), go:payGo, w:2 });
    } else {
      if (per.status === 'review')
        out.push({ t:pre+t('dekont onayı bekliyor'), b: monthYear(per.key)+(' '+t('kirası için dekont yüklendi.')), go:payGo, w:2 });
      if (per.status === 'partial')
        out.push({ t:pre+t('kısmi ödeme'), b: t('{month} için {amount} eksik.', { month: monthYear(per.key), amount: tl(remaining(p, per.key)) }), go:payGo, w:2 });
      if (per.status === 'late')
        out.push({ t:pre+t('kira gecikti'), b: t('{month} kirası {n} gündür ödenmedi.', { month: monthYear(per.key), n: -dd }), go:payGo, w:2 });
      if (newReqs(p).length)
        out.push({ t:pre+t('yeni talep'), b: t('{n} talep yanıt bekliyor.', { n: newReqs(p).length }), go:'/mulk-sahibi/mulk/'+id+'/talep', w:1 });
      if (p.dask && daysTo(p.dask) <= s.insDays)
        out.push({ t:pre+t('DASK yenileme'), b: t('Poliçe {date} tarihinde bitiyor.', { date: fmtFull(parse(p.dask)) }), go:docGo, w:2 });
    }

    const rd = daysTo(p.contractEnd);
    if (rd <= s.renewDays && !(p.renewal && p.renewal.status === 'accepted'))
      out.push({ t:pre+t('sözleşme yenileme'), b: fmtFull(parse(p.contractEnd))+' · '+t('{n} gün kaldı', { n:rd }), go:payGo, w: rd <= 30 ? 2 : 1 });

    p.docs.forEach(d => {
      if (d.until && d.cat === 'Tahliye taahhütnamesi' && daysTo(d.until) <= s.evictDays)
        out.push({ t:pre+t('tahliye tarihi yaklaşıyor'), b:(t('Taahhütnamedeki tarih:')+' ')+fmtFull(parse(d.until)), go:docGo, w:1 });
    });

    if (p.moveOut && !p.moveOut.refunded){
      const mine = ui.role === 'tenant' ? p.moveOut.tenantOk : p.moveOut.landlordOk;
      const both = p.moveOut.tenantOk && p.moveOut.landlordOk;
      const go = ui.role === 'tenant' ? '/kiraci/belgeler/cikis' : '/mulk-sahibi/mulk/'+id+'/cikis';
      if (!mine) out.push({ t:pre+t('çıkış tutanağı onayını bekliyor'), b:t('Kesintileri inceleyip onayla.'), go, w:2 });
      else if (both && ui.role === 'landlord') out.push({ t:pre+t('depozito iadesi'), b: t('{amount} iade edilecek.', { amount: tl(moveOutSummary(p).refund) }), go, w:2 });
    }

    if (!(p.inspect.tenantOk && p.inspect.landlordOk))
      out.push({ t:pre+t('tutanak onayı eksik'), b:t('Giriş tutanağını iki taraf da onaylamalı.'),
        go: ui.role === 'tenant' ? '/kiraci/belgeler/tutanak' : '/mulk-sahibi/mulk/'+id+'/tutanak', w:1 });
  });

  return out.sort((a,b) => b.w - a.w);
}

export function unreadCount(){
  return reminders().length + S.inbox.filter(x => !x.read).length;
}

/** Rol bazlı genel arama: evler, talepler, belgeler, mesajlar. */
export function search(q){
  if (!q || q.trim().length < 2) return [];
  const ids = ui.role === 'tenant' ? [S.myHome] : S.order;
  const out = [];

  ids.forEach(id => {
    const p = P(id);
    const base = ui.role === 'tenant' ? '/kiraci' : '/mulk-sahibi/mulk/'+id;

    if (ui.role === 'landlord' && (match(p.name, q) || match(p.addr, q) || p.tenants.some(x => match(x.name, q))))
      out.push({ icon:'home', title:p.name, sub:p.addr, go:'/mulk-sahibi/mulk/'+id });

    p.requests.forEach(r => {
      if (match(r.title, q) || match(r.desc, q) || match(r.cat, q))
        out.push({ icon:'wrench', title:r.title, sub:p.name+' · '+t(r.cat)+' · '+t(STEPS[r.status]),
          go: ui.role === 'tenant' ? '/kiraci/talepler/'+r.id : base+'/talep?req='+r.id });
    });

    p.docs.forEach(d => {
      if (match(d.name, q) || match(d.cat, q))
        out.push({ icon:'doc', title:d.name, sub:p.name+' · '+t(d.cat), go: base+(ui.role==='tenant'?'/belgeler':'/belge') });
    });

    if (ui.role === 'landlord') (p.expenses || []).forEach(e => {
      if (match(e.note, q) || match(e.cat, q))
        out.push({ icon:'chart', title:t(e.cat)+' · '+tl(e.amount), sub:p.name+(e.note ? ' · '+e.note : ''), go: base+'/gider' });
    });

    p.msgs.forEach(m => {
      if (match(m.text, q))
        out.push({ icon:'chat', title:m.text.slice(0,60), sub:p.name+' · '+t('mesaj'),
          go: ui.role === 'tenant' ? '/kiraci/mesajlar' : base+'/mesaj' });
    });
  });

  return out.slice(0, 24);
}
