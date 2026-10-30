/* Eylemler ve formlar. Eski actions.js'in DOM'suz hali: durumu değiştirir,
   kaydeder; ekran güncellemesini state.js'in abonelik mekanizması yapar. */

import { Platform } from 'react-native';
import { S, ui, save, reset as resetState, replaceState, setTheme, VERSION, STEPS, AREA_TEMPLATES, TENANT_KINDS } from './state.js';
import {
  P, ST, period, remaining, rentAt, expectedAt, normalize, tenantsLabel, meTenant, senderName, unpaid, moveOutSummary, yearNumbers, payMap, dueOf
} from './logic.js';
import { estimate } from './tax.js';
import { migrate } from './migrate.js';
import { t, locale, setLang } from './i18n.js';
import * as billing from './billing.js';
import * as backend from './backend.js';
import { LIVE, CONFIG } from './config.js';
import { can } from './team.js';
import { fileName, slug } from './files.js';
import { toCsv, toXlsx } from './sheet.js';
import { host } from './host.js';
import { toApp } from './nav.js';
import { iso, t0, parse, fmtFull, monthYear, tl, daysTo, uid, percent } from './util.js';
import { formatAddress } from './address.js';

const go = path => host.go(toApp(path));
const notify = (n, log) => {
  if (log !== false){
    S.inbox.push({ title:n.title, body:n.body, at:Date.now(), read:false, go:n.go || null });
    if (S.inbox.length > 40) S.inbox.shift();
    save();
  }
  host.notify(n);
};
const ask = o => host.ask(o);

/* ---------------- abonelik kilidi ---------------- */

/** Mülk sahibinin kayıt değiştiren işlemleri (abonelik yoksa kapalı). */
const WRITE_ACTS = new Set(['advance','rewind','decide','okCost','approvePay','nudge','sendRenewal','cancelRenewal',
  'removeDoc','removeRoom','removeShot','approveInspect','nudgeInspect','removeProp','removeTenant','chooseQuote','removeQuote',
  'removeExpense','addUnpaidDeduction','removeDeduction','removeExitShot','approveMoveOut','cancelMoveOut',
  'setCost','setRoomNote','setExitNote','setExitCond','addExitPhotos','addRoomPhotos','closeReq','acceptRenewal']);
const OPEN_FORMS = new Set(['msg']);

function locked(){
  if (billing.canWrite()) return false;
  host.openSheet('abonelik');
  notify({ title:t('Abonelik gerekli'), body:t('Deneme süren bitti. Kayıtları değiştirmek için abone ol; okuma ve mesajlaşma açık.'), icon:'key' }, false);
  return true;
}

function lesseeFrom(fd){
  if (String(fd.get('tenantKind') || TENANT_KINDS[0]) !== TENANT_KINDS[1]) return { company:null, stopaj:false };
  return {
    company:{ name:String(fd.get('coName') || '').trim(), taxNo:String(fd.get('coTaxNo') || '').trim(), taxOffice:String(fd.get('coTaxOffice') || '').trim() },
    stopaj: !!fd.get('stopaj')
  };
}

function pushMsg(p, m){ p.msgs.push(Object.assign({ id: uid('m') }, m)); }
/** Sistem mesajı; `req` verilirse talebe bağlanır (mesajlarda dokununca talep açılır). */
function sysMsg(p, text, req){ pushMsg(p, Object.assign({ from:'system', text, at:Date.now() }, req ? { req } : {})); }
function logReq(r, text){ (r.log = r.log || []).push({ at:Date.now(), text }); }
function reqOf(p, id){ return p.requests.find(r => r.id === id); }
function resetMoveOutApprovals(p){
  if (!p.moveOut) return;
  p.moveOut.tenantOk = false;
  p.moveOut.landlordOk = false;
}
function openText(title, body){ ui.text = { title, body }; host.openSheet('metin'); }
const fileImage = f => (f && f.dataUrl) || null;
/** Dosyayı saklar: gerçek hesapta depoya yüklenir ('sb:yol'), yerelde küçültülmüş görsel döner. */
const keep = (pid, f) => (LIVE ? backend.storeFile(pid, f) : Promise.resolve(fileImage(f)));
async function keepAll(pid, files, max){
  const out = [];
  for (const f of (files || []).slice(0, max)){ const v = await keep(pid, f); if (v) out.push(v); }
  return out;
}
const failed = (title, e) => notify({ title, body: backend.humanError(e), icon:'home' }, false);

/** Talep masrafında mülk sahibinin payı. */
const ownerShare = (r, amount) => r.cost === 'Kiracı' ? 0 : r.cost === 'Paylaşımlı' ? Math.round(amount / 2) : amount;

/** Talebe bağlı gider kaydını açar, günceller ya da (tutar 0 ise) siler; gider kimliğini döner. */
function reqExpense(p, r, amount, date, extra){
  p.expenses = p.expenses || [];
  const i = p.expenses.findIndex(e => e.reqId === r.id);
  if (!(amount > 0)){ if (i >= 0) p.expenses.splice(i, 1); return null; }
  const data = { cat:'Tamir ve bakım', amount, date, note: r.title + (r.cost === 'Paylaşımlı' ? ' ' + t('(yarı pay)') : '') + (extra ? ' · ' + extra : ''), reqId: r.id };
  if (i >= 0){ Object.assign(p.expenses[i], data); return p.expenses[i].id; }
  const id = uid('e');
  p.expenses.push(Object.assign({ id }, data));
  return id;
}

/** Yeni mülk kaydı (form ve toplu içe aktarma ortak). */
function newProperty(d){
  const today = t0();
  const start = d.startDate || iso(today), s = parse(start);
  const ptype = d.type || 'Konut';
  const p = {
    id: uid('p'), type: ptype, area: d.area ?? null, company: d.company || null, stopaj: !!d.stopaj, depositKind: d.depositKind || 'Nakit',
    name: d.name, addr: d.addr || '', address: d.address || null, tenants: d.tenants || [],
    landlord: LIVE ? { name: backend.live.profile?.name || t('Mülk sahibi'), phone: backend.live.profile?.phone || '' } : (S.order.length ? P(S.order[0]).landlord : { name:t('Mülk sahibi'), phone:'' }),
    ownerId: LIVE ? backend.live.user?.id : undefined,
    rent: d.rent || 0, dueDay: d.dueDay || 1,
    rentHistory:[{ from: start, amount: d.rent || 0, note:t('Sözleşme başlangıcı') }],
    expenses:[], value:null, moveOut:null,
    aidat: d.aidat || 0, aidatPayer: d.aidatPayer || 'Kiracı', deposit: d.deposit || 0, depositNote:'—',
    startDate: start, contractEnd: d.contractEnd || iso(new Date(s.getFullYear()+1, s.getMonth(), s.getDate())),
    dask: d.dask ?? null,
    bills:[], pay:{}, requests:[], msgs:[], docs:[],
    inspect:{ tenantOk:false, landlordOk:false, rooms:(AREA_TEMPLATES[ptype] || AREA_TEMPLATES['Konut']).map(n => ({ n:t(n), photos:0, shots:[], note:'' })) },
    renewal:null
  };
  S.props[p.id] = p;
  S.order.push(p.id);
  return p;
}

/** Excel / CSV dışa aktarma: ödemeler ve giderler iki ayrı sayfa (pid verilirse yalnız o mülk). */
function exportSheets(pid){
  const ids = pid ? [pid] : S.order;
  const pays = [], exps = [];
  ids.forEach(id => {
    const p = P(id);
    Object.keys(p.pay).sort().forEach(k => {
      const r = p.pay[k];
      const paid = r.status === 'approved' || r.status === 'partial' || r.status === 'review' ? Number(r.amount) || 0 : null;
      pays.push([p.name, monthYear(k), (ST[r.status] || ST.pending)[0], expectedAt(p, k), paid, r.date || null, r.receipt || '', r.note || r.rejectReason || '']);
    });
    (p.expenses || []).slice().sort((a, b) => a.date < b.date ? -1 : 1)
      .forEach(e => exps.push([p.name, e.date, t(e.cat), Number(e.amount) || 0, e.note || '']));
  });
  const text = h => ({ header: h, type: 'text' }), money = h => ({ header: h, type: 'money' }), date = h => ({ header: h, type: 'date' });
  return {
    sheets: [
      { name: t('Ödemeler'), totalLabel: t('Toplam'), totals: [3, 4], rows: pays,
        columns: [text(t('Mülk')), text(t('Dönem')), text(t('Durum')), money(t('Beklenen (₺)')), money(t('Ödenen (₺)')), date(t('Ödeme tarihi')), text(t('Dekont')), text(t('Not'))] },
      { name: t('Giderler'), totalLabel: t('Toplam'), totals: [3], rows: exps,
        columns: [text(t('Mülk')), date(t('Tarih')), text(t('Kategori')), money(t('Tutar (₺)')), text(t('Açıklama'))] }
    ],
    file: 'anahtar-' + (pid ? slug(P(pid).name) : 'portfoy') + '-' + iso(t0())
  };
}

/**
 * Toplu içe aktarma (importer.js → toSave). Paket sınırı ya da tek seferlik üst sınır aşılırsa ilgili sayfa açılır.
 * Dönen: [{ id, line, name, code, phone, tenant }] ya da null.
 */
export async function importProps(rows){
  if (locked()) return null;
  const adding = rows.filter(r => !r.updateId).length;
  if (rows.length > CONFIG.billing.importMax){ host.openSheet('destek-talebi', { kind:'import', units: billing.ownedCount() + adding }); return null; }
  const room = billing.roomFor(adding);
  if (!room.ok){ host.openSheet('paket', { need: room.have + adding, suggest: room.suggest }); return null; }
  if (LIVE){
    try { return await backend.importProperties(rows); }
    catch(e){ failed(t('İçe aktarılamadı'), e); return null; }
  }
  const out = rows.map(r => {
    const hasTenant = !!(r.tenantName || r.tenantPhone || r.tenantEmail);
    const data = { name:r.name, addr:r.addr, type:r.type, area:r.area, rent:r.rent, dueDay:r.dueDay, aidat:r.aidat, aidatPayer:r.aidatPayer,
      deposit:r.deposit, depositKind:r.depositKind, startDate:r.startDate, contractEnd:r.contractEnd, dask:r.dask, stopaj:r.stopaj, company:r.company };
    let p = r.updateId ? S.props[r.updateId] : null;
    if (p){
      const rentChanged = r.rent != null && r.rent !== p.rent;
      Object.entries(data).forEach(([k, v]) => { if (v != null && v !== '' && k !== 'name') p[k] = v; });
      if (rentChanged) p.rentHistory.push({ from: iso(t0()), amount: r.rent, note: t('Toplu içe aktarma') });
    } else p = newProperty(data);
    const invite = hasTenant && !p.tenants.length;
    if (invite) p.tenants.push({ id:uid('t'), name: r.tenantName || 'Davet bekleniyor', phone: r.tenantPhone || '', email: r.tenantEmail || '' });
    return { id:p.id, line:r.line, name:p.name, code: invite ? 'DEMO' + String(Math.floor(Math.random() * 9000) + 1000) : null, phone: r.tenantPhone || '', tenant: r.tenantName || '' };
  });
  save();
  return out;
}

/* ---------------- eylemler ---------------- */

export const A = {
  goMsg: d => go(ui.role === 'tenant' ? '/kiraci/mesajlar' : '/mulk-sahibi/mulk/'+d.pid+'/mesaj'),
  /** Talepten "iletişime geç": talebe bağlı otomatik mesaj karşı tarafın mesajlarına düşer, mesajlar açılır.
      Aynı talep için kart varsa yenisi açılmaz. */
  askAbout: d => {
    const p = P(d.pid), r = reqOf(p, d.id);
    if (r && !p.msgs.some(m => m.req === r.id && m.from !== 'system')){
      pushMsg(p, { from:ui.role, by:ui.role === 'tenant' ? meTenant(p)?.id : undefined, text:t('Bu talep hakkında yazıyorum.'), at:Date.now(), req:r.id });
      save();
    }
    A.goMsg(d);
  },

  advance: d => {
    const p = P(d.pid), r = reqOf(p, d.id);
    r.status = Math.min(3, r.status + 1);
    logReq(r, (t('Durum:')+' ')+t(STEPS[r.status]));
    sysMsg(p, (t('Talep durumu:')+' ')+r.title+' · '+t(STEPS[r.status]), r.id);
    // Çözülen talepte seçili teklif varsa ve fatura yoksa teklif tutarı gidere işlenir (fatura gelince güncellenir).
    const chosen = (r.quotes || []).find(q => q.chosen);
    if (r.status === 3 && chosen && r.costOk && !r.invoice && ownerShare(r, chosen.amount) > 0 && can(p.id, 'expense')
      && !(p.expenses || []).some(e => e.reqId === r.id)){
      reqExpense(p, r, ownerShare(r, chosen.amount), iso(t0()), chosen.vendor + ' ' + t('(teklif tutarı)'));
      logReq(r, t('Gider defterine işlendi:') + ' ' + tl(ownerShare(r, chosen.amount)));
      notify({ title:t('Gider defterine işlendi'), body: r.title + ' · ' + tl(ownerShare(r, chosen.amount)) + ' · ' + t('Fatura eklersen tutar güncellenir.'), icon:'chart' }, false);
    }
    save();
    if (S.settings.reqUpdates)
      notify({ title:t('Talep güncellendi'), body:r.title+' → '+t(STEPS[r.status])+t('. Kiracıya bildirildi.'), icon:'wrench' });
  },
  rewind: d => {
    const p = P(d.pid), r = reqOf(p, d.id);
    r.status = Math.max(0, r.status - 1);
    logReq(r, (t('Durum geri alındı:')+' ')+t(STEPS[r.status]));
    save();
  },
  decide: d => {
    const p = P(d.pid), r = reqOf(p, d.id);
    r.decision = d.v; r.status = 3;
    logReq(r, (t('Karar:')+' ')+d.v);
    sysMsg(p, (t('Ek talep:')+' ')+r.title+' · '+d.v, r.id);
    save();
    notify({ title:t('Karar kaydedildi'), body:r.title+': '+d.v, icon:'wrench' });
  },
  okCost: d => {
    const p = P(d.pid), r = reqOf(p, d.id);
    r.costOk = true;
    logReq(r, (t('Masraf paylaşımı onaylandı:')+' ')+t(r.cost));
    sysMsg(p, (t('Masraf paylaşımı onaylandı:')+' ')+t(r.cost), r.id);
    save();
  },
  setCost: d => {
    const p = P(d.pid), r = reqOf(p, d.id);
    r.cost = d.v;
    r.costOk = false;
    logReq(r, (t('Masraf önerisi:')+' ')+t(r.cost));
    sysMsg(p, (t('Masraf önerisi:')+' ')+r.cost+' ('+r.title+')', r.id);
    save();
  },
  closeReq: d => {
    const p = P(d.pid), r = reqOf(p, d.id);
    r.status = 3;
    logReq(r, t('Kiracı talebi çözüldü olarak işaretledi'));
    sysMsg(p, (t('Talep kapatıldı:')+' ')+r.title, r.id);
    save();
    notify({ title:t('Talep kapatıldı'), body:r.title, icon:'wrench' });
  },

  approvePay: d => {
    const p = P(d.pid), aidat = d.kind === 'aidat', rec = payMap(p, d.kind)[d.key];
    if (!rec) return;
    rec.status = 'approved';
    rec.approvedAt = Date.now();
    delete rec.rejectReason;
    sysMsg(p, monthYear(d.key)+(' '+(aidat ? t('aidatı onaylandı') : t('kirası onaylandı'))));
    save(); host.closeSheet();
    host.haptic();
    host.celebrate({ title:t('Ödeme onaylandı') });
    notify({ title:t('Ödeme onaylandı'), body:p.name+' · '+monthYear(d.key)+(' '+(aidat ? t('aidatı. Kiracıya bildirildi.') : t('kirası. Kiracıya bildirildi.'))), icon:'card' });
  },
  nudge: d => {
    const p = P(d.pid), per = period(p);
    pushMsg(p, {
      from:'landlord',
      text:(t('Merhaba,')+' ')+monthYear(per.key)+(' '+t('kirası için hatırlatma. Ödediysen dekontu uygulamaya yükleyebilir misin? Teşekkürler.')),
      at: Date.now()
    });
    save();
    notify({ title:t('Hatırlatma gönderildi'), body:tenantsLabel(p)+(' '+t('için nazik bir mesaj iletildi.')), icon:'chat' });
  },

  sendRenewal: d => {
    const p = P(d.pid);
    const cpi = Number(ui.renewal.cpi);
    if (ui.renewal.cpi == null || !isFinite(cpi)) return;
    const max = Math.round(p.rent * (1 + cpi/100));
    const amt = Math.min(Number(ui.renewal.amount) || max, max);
    p.renewal = { amount:amt, max, cpi, status:'sent', at:Date.now() };
    sysMsg(p, (t('Yenileme teklifi:')+' ')+tl(amt)+(' '+t('(yasal üst sınır')+' ')+tl(max)+')');
    ui.renewal = { cpi:null, amount:null };
    save(); host.closeSheet();
    notify({ title:t('Teklif gönderildi'), body:t('Kiracı uygulamada kabul edebilir ya da mesajla görüşebilir.'), icon:'card' });
  },
  acceptRenewal: d => {
    const p = P(d.pid);
    p.renewal.status = 'accepted';
    p.rentHistory = (p.rentHistory || []).filter(h => h.from !== p.contractEnd);
    p.rentHistory.push({ from:p.contractEnd, amount:p.renewal.amount, note:t('Yenileme · TÜFE {pct}', { pct:percent(p.renewal.cpi, 2) }) });
    normalize(p);
    sysMsg(p, (t('Yenileme teklifi kabul edildi:')+' ')+tl(p.renewal.amount));
    save();
    notify({ title:t('Teklifi kabul ettin'), body:(t('Yeni kira')+' ')+fmtFull(parse(p.contractEnd))+(' '+t('itibarıyla')+' ')+tl(p.renewal.amount)+'.', icon:'card' });
  },
  cancelRenewal: async d => {
    if (!await ask({ title:t('Teklif geri çekilsin mi?'), body:t('Kiracı artık teklifi göremez.'), ok:t('Geri çek') })) return;
    const p = P(d.pid);
    p.renewal = null;
    sysMsg(p, t('Yenileme teklifi geri çekildi'));
    save();
  },

  removeDoc: async d => {
    const p = P(d.pid);
    const doc = p.docs.find(x => x.id === d.id);
    if (!doc) return;
    if (!await ask({ title:t('Belge silinsin mi?'), body:'“'+doc.name+t('” kalıcı olarak kaldırılır.'), ok:t('Sil'), danger:true })) return;
    p.docs = p.docs.filter(x => x.id !== d.id);
    save();
  },
  removeRoom: async d => {
    const p = P(d.pid);
    const room = p.inspect.rooms[Number(d.i)];
    if (!room) return;
    if (!await ask({ title:room.n+' silinsin mi?', body:t('Odanın notu ve fotoğrafları silinir; tutanak onayları sıfırlanır.'), ok:t('Sil'), danger:true })) return;
    p.inspect.rooms.splice(Number(d.i), 1);
    p.inspect.tenantOk = false; p.inspect.landlordOk = false;
    save();
  },
  removeShot: d => { P(d.pid).inspect.rooms[Number(d.i)].shots.splice(Number(d.j), 1); save(); },
  setRoomNote: d => { P(d.pid).inspect.rooms[Number(d.i)].note = d.v; save(); },
  addRoomPhotos: async d => {
    const p = P(d.pid), room = p.inspect.rooms[Number(d.i)];
    room.shots = room.shots || [];
    (await keepAll(p.id, d.files, 6)).forEach(v => room.shots.push(v));
    p.inspect.tenantOk = false; p.inspect.landlordOk = false;
    if (!save()) notify({ title:t('Yer kalmadı'), body:t('Depolama doldu; fotoğraflar kaydedilemedi.'), icon:'cam' }, false);
  },
  approveInspect: d => {
    const p = P(d.pid);
    if (ui.role === 'tenant') p.inspect.tenantOk = true; else p.inspect.landlordOk = true;
    sysMsg(p, t('Giriş tutanağı {who} tarafından onaylandı', { who: ui.role === 'tenant' ? t('kiracı') : t('mülk sahibi') }));
    save();
    notify({
      title:t('Tutanak onaylandı'),
      body: p.inspect.tenantOk && p.inspect.landlordOk ? t('İki taraf da onayladı; tutanak kilitlendi.') : t('Karşı tarafın onayı bekleniyor.'),
      icon:'doc'
    });
  },
  nudgeInspect: () => notify({ title:t('Hatırlatma gönderildi'), body:t('Karşı tarafa tutanağı onaylaması için bildirim gitti.'), icon:'doc' }),
  exportInspect: d => {
    const p = P(d.pid);
    const body = p.name+' · '+p.addr+('\n'+t('Giriş tutanağı ·')+' ')+fmtFull(new Date())+'\n\n' +
      p.inspect.rooms.map(r => '- '+r.n+': '+t('{n} fotoğraf', { n:(r.photos||0)+(r.shots||[]).length })+(r.note ? ' · '+r.note : '')).join('\n') +
      ('\n\n'+t('Kiracı onayı:')+' ')+(p.inspect.tenantOk ? t('var') : t('yok'))+('\n'+t('Mülk sahibi onayı:')+' ')+(p.inspect.landlordOk ? t('var') : t('yok'));
    openText(t('Tutanak dökümü'), body);
  },
  exportChat: async d => {
    if (LIVE) await backend.allMessages(d.pid).catch(() => {});      // döküm yazışmanın tamamını içersin
    const p = P(d.pid);
    const body = p.name+' · '+p.addr+'\n\n' + p.msgs.map(m =>
      new Date(m.at).toLocaleString(locale())+' · '+senderName(p, m)+': '+(m.text || '')+(m.img ? ' ['+t('fotoğraf')+']' : '')).join('\n');
    openText(t('Yazışma dökümü'), body);
  },

  shareReport: () => {
    const year = String(ui.reportYear || new Date().getFullYear());
    const yn = yearNumbers(year);
    const e = estimate({ konut: yn.groups.konut, stopajli: yn.groups.stopajli, diger: yn.groups.diger }, { year:Number(year), noExemption:!!ui.noExemption });
    const pay = m => m.payable < 0 ? t('İade {amount}', { amount:tl(-m.payable) }) : tl(m.payable);
    const body = t('{year} yılı kira geliri özeti', { year })+'\n\n' +
      yn.rows.map(r => { const p = P(r.id); return p.name+' · '+t(p.type)+' ('+p.addr+')\n  '+t('Brüt kira')+': '+tl(r.gross) +
        (r.withheld ? '  ·  '+t('Stopaj')+': '+tl(r.withheld) : '')+('  '+t('·  Giderler:')+' ')+tl(r.exp); }).join('\n') +
      ('\n\n'+t('Konut kira geliri')+': ')+tl(e.konut.gross) +
      (e.stopajli.gross ? '\n'+t('İşyeri kira geliri (stopajlı)')+': '+tl(e.stopajli.gross)+' · '+t('Stopaj')+': '+tl(e.stopajli.withheld) +
        (e.includeW ? '' : ' — '+t('beyan sınırının altında, beyana eklenmez')) : '') +
      (e.diger.gross ? '\n'+t('İşyeri kira geliri (stopajsız)')+': '+tl(e.diger.gross) : '') +
      ('\n'+t('Toplam belgeli gider:')+' ')+tl(yn.exp) +
      (e.konut.gross ? ('\n'+t('İstisna ('))+e.rates.year+'): '+(ui.noExemption ? t('uygulanmıyor') : tl(e.istisna)) : '') +
      (e.belowExemption ? ('\n\n'+t('Bu yıl için kira geliri beyanı gerekmeyebilir.')) :
        '\n'+t('Beyana giren gelir')+': '+tl(e.declared) +
        (e.credit ? '\n'+t('Mahsup edilecek stopaj')+': '+tl(e.credit) : '') +
        ('\n\n'+t('Tahmini vergi — götürü gider:')+' ')+pay(e.goturu)+(' '+t('· gerçek gider:')+' ')+pay(e.gercek) +
        ('\n'+t('Daha avantajlı yöntem:')+' ')+(e.best === 'gercek' ? t('gerçek gider') : t('götürü gider'))) +
      (e.rates.approx ? ('\n\n'+t('Uyarı:')+' ')+year+(' '+t('oranları eklenmediği için')+' ')+e.rates.year+(' '+t('oranları kullanıldı.')) : '') +
      ('\n\n'+t('Not: Onaylanmış ve kısmi ödemelerden hesaplanmıştır. Tahmindir; beyan için mali müşavirinize danışın.'));
    openText(t('Beyanname özeti'), body);
  },
  exportCsv: d => {
    const { sheets, file } = exportSheets(d && d.pid);
    host.saveFile(file + '.csv', toCsv(sheets, locale() === 'en-GB' ? 'en' : 'tr'), 'text/csv;charset=utf-8');
    notify({ title:t('CSV hazır'), body:t('Ödemeler ve giderler dosyası hazırlandı.'), icon:'chart' }, false);
  },
  exportXlsx: async d => {
    const { sheets, file } = exportSheets(d && d.pid);
    host.saveFile(file + '.xlsx', await toXlsx(sheets), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    notify({ title:t('Excel dosyası hazır'), body:t('Ödemeler ve giderler ayrı sayfalarda.'), icon:'chart' }, false);
  },
  /** Yazışma açıldı: okunmamış sayacı sıfırlanır, sunucuda da işaretlenir. */
  markRead: d => {
    const p = P(d.pid);
    if (!p) return;
    const last = (p.msgs.length && Number(p.msgs[p.msgs.length - 1].at)) || 0;
    const at = Math.max(Date.now(), last);
    const reads = S.reads || {};
    if (reads[d.pid] !== undefined && reads[d.pid] >= last) return;
    S.reads = Object.assign({}, reads, { [d.pid]: at });
    save();
    if (LIVE) backend.markRead(d.pid, at);
  },
  exportData: () => {
    host.saveFile('anahtar-verileri.json', JSON.stringify(S, null, 2), 'application/json');
    notify({ title:t('Veriler hazır'), body:t('JSON dosyasını içe aktararak geri yükleyebilirsin.'), icon:'doc' }, false);
  },
  importData: d => {
    try {
      const parsed = JSON.parse(d.text);
      if (!parsed || !parsed.props || !parsed.order || (parsed.v || 1) > VERSION) throw new Error('bad');
      replaceState(migrate(parsed));
      go('/kiraci');
      notify({ title:t('Veri yüklendi'), body:t('Dosyadaki durum geri yüklendi.'), icon:'doc' }, false);
    } catch(e){
      notify({ title:t('Dosya okunamadı'), body:t('Bu dosya anahtar verisi gibi görünmüyor.'), icon:'doc' }, false);
    }
  },
  downloadText: () => {
    const txt = ui.text || { title:'metin', body:'' };
    host.saveFile(txt.title.toLocaleLowerCase(locale()).replace(/\s+/g,'-')+'.txt', txt.body, 'text/plain;charset=utf-8');
  },

  clearInbox: () => { S.inbox = []; save(); },
  theme: d => { setTheme(d.v); },
  setSetting: d => { S.settings[d.k] = d.bool ? !!d.v : Math.max(0, Number(d.v) || 0); save(); },
  lang: d => {
    S.lang = d.v; save(); setLang(d.v);
    // Modül düzeyindeki etiketler (durum adları, sekmeler) dil değişince yeniden kurulsun diye web'de sayfa yenilenir.
    if (Platform.OS === 'web' && typeof location !== 'undefined') setTimeout(() => location.reload(), 50);
  },

  reset: async () => {
    if (!await ask({ title:t('Demo verisi sıfırlansın mı?'), body:t('Girdiğin her şey silinir ve örnek veri yeniden yüklenir.'), ok:t('Sıfırla'), danger:true })) return;
    resetState();
    go('/kiraci');
    notify({ title:t('Sıfırlandı'), body:t('Örnek veri yeniden yüklendi.'), icon:'home' }, false);
  },
  removeProp: async d => {
    const name = P(d.pid)?.name || t('Bu mülk');
    if (!await ask({ title:name+(' '+t('kaldırılsın mı?')), body:t('Mülkün ödemeleri, talepleri, mesajları ve belgeleri de silinir.'), ok:t('Kaldır'), danger:true })) return;
    delete S.props[d.pid];
    S.order = S.order.filter(x => x !== d.pid);
    if (S.myHome === d.pid) S.myHome = S.order[0];
    save(); host.closeSheet();
    go('/mulk-sahibi');
  },
  removeTenant: async d => {
    const p = P(d.pid);
    const tn = p.tenants.find(x => x.id === d.id);
    if (!tn) return;
    if (!await ask({ title:tn.name+(' '+t('mülkten çıkarılsın mı?')), body:t('Bu kiracı artık mülkün ödemelerini, taleplerini ve yazışmalarını göremez. Geçmiş kayıtlar korunur.'), ok:t('Çıkar'), danger:true })) return;
    if (LIVE){
      try {
        if (tn.pending) await backend.deleteInvite(p.id, tn.code);
        else await backend.removeMember(p.id, tn.id);
      } catch(e){ failed(t('İşlem yapılamadı'), e); }
      return;
    }
    p.tenants = p.tenants.filter(x => x.id !== d.id);
    sysMsg(p, tn.name+(' '+t('mülkten çıkarıldı')));
    save();
  },

  chooseQuote: d => {
    const p = P(d.pid), r = reqOf(p, d.id);
    r.quotes.forEach(q => { q.chosen = q.id === d.q; });
    const q = r.quotes.find(x => x.chosen);
    logReq(r, (t('Teklif seçildi:')+' ')+q.vendor+' · '+tl(q.amount));
    sysMsg(p, (t('Talep için usta seçildi:')+' ')+q.vendor+' ('+tl(q.amount)+') · '+r.title, r.id);
    if (r.status < 2){ r.status = 2; logReq(r, (t('Durum:')+' ')+t(STEPS[2])); }
    save();
    notify({ title:t('Usta seçildi'), body:q.vendor+' · '+tl(q.amount)+t('. Kiracıya bildirildi.'), icon:'wrench' });
  },
  removeQuote: d => {
    const p = P(d.pid), r = reqOf(p, d.id);
    const own = ui.role === 'tenant';
    r.quotes = r.quotes.filter(q => q.id !== d.q || q.chosen || (own && q.by !== 'tenant'));
    save();
  },
  removeExpense: async d => {
    const p = P(d.pid);
    const e = p.expenses.find(x => x.id === d.id);
    if (!e) return;
    if (!await ask({ title:t('Gider silinsin mi?'), body:e.cat+' · '+tl(e.amount), ok:t('Sil'), danger:true })) return;
    p.expenses = p.expenses.filter(x => x.id !== d.id);
    p.requests.forEach(r => { if (r.invoice && r.invoice.expenseId === d.id) r.invoice.expenseId = null; });
    save(); host.closeSheet();
  },

  addUnpaidDeduction: d => {
    const p = P(d.pid), due = unpaid(p);
    if (!due.total) return;
    p.moveOut.deductions.push({
      id:uid('k'), kind:'rent', label:t('Ödenmemiş kira'), amount:due.total,
      note: due.months.map(m => monthYear(m.key)+' '+tl(m.owed)).join(', ')
    });
    resetMoveOutApprovals(p);
    save();
  },
  removeDeduction: d => {
    const p = P(d.pid);
    p.moveOut.deductions = p.moveOut.deductions.filter(x => x.id !== d.id);
    resetMoveOutApprovals(p);
    save();
  },
  setExitNote: d => { P(d.pid).moveOut.rooms[Number(d.i)].note = d.v; save(); },
  commitExitNote: d => { resetMoveOutApprovals(P(d.pid)); save(); },
  setExitCond: d => {
    const p = P(d.pid);
    p.moveOut.rooms[Number(d.i)].condition = d.v;
    resetMoveOutApprovals(p);
    save();
  },
  addExitPhotos: async d => {
    const p = P(d.pid), room = p.moveOut.rooms[Number(d.i)];
    (await keepAll(p.id, d.files, 6)).forEach(v => room.shots.push(v));
    resetMoveOutApprovals(p);
    if (!save()) notify({ title:t('Yer kalmadı'), body:t('Depolama doldu; fotoğraflar kaydedilemedi.'), icon:'cam' }, false);
  },
  removeExitShot: d => {
    const p = P(d.pid);
    p.moveOut.rooms[Number(d.i)].shots.splice(Number(d.j), 1);
    resetMoveOutApprovals(p);
    save();
  },
  approveMoveOut: d => {
    const p = P(d.pid), mo = p.moveOut;
    if (ui.role === 'tenant') mo.tenantOk = true; else mo.landlordOk = true;
    const both = mo.tenantOk && mo.landlordOk;
    sysMsg(p, t('Çıkış hesabı {who} tarafından onaylandı', { who: ui.role === 'tenant' ? t('kiracı') : t('mülk sahibi') })+(both ? (' '+t('· iade:')+' ')+tl(moveOutSummary(p).refund) : ''));
    save();
    notify({ title:t('Çıkış hesabı onaylandı'), body: both ? t('İki taraf da onayladı; iade tutarı kesinleşti.') : t('Karşı tarafın onayı bekleniyor.'), icon:'key' });
  },
  cancelMoveOut: async d => {
    if (!await ask({ title:t('Çıkış süreci iptal edilsin mi?'), body:t('Çıkış notları, fotoğraflar ve kesintiler silinir.'), ok:t('İptal et'), danger:true })) return;
    const p = P(d.pid);
    p.moveOut = null;
    sysMsg(p, t('Çıkış süreci iptal edildi'));
    save();
  },
  exportMoveOut: d => {
    const p = P(d.pid), mo = p.moveOut, sm = moveOutSummary(p);
    const body = p.name+' · '+p.addr+('\n'+t('Çıkış raporu'))+(mo.date ? ' · '+fmtFull(parse(mo.date)) : '')+'\n' +
      (t('Kiracı:')+' ')+tenantsLabel(p)+'\n\n' +
      (t('ODALAR')+'\n') + mo.rooms.map(r => {
        const entry = p.inspect.rooms.find(x => x.n === r.n);
        return '- '+r.n+': '+(r.condition || t('değerlendirilmedi')) +
          ('\n    '+t('Giriş:')+' ')+(entry ? (entry.note || t('not yok')) : t('kayıt yok')) +
          ('\n    '+t('Çıkış:')+' ')+(r.note || t('not yok'))+' · '+t('{n} fotoğraf', { n:(r.shots || []).length });
      }).join('\n') +
      ('\n\n'+t('KESİNTİLER')+'\n') + (mo.deductions.length ? mo.deductions.map(x => '- '+x.label+': '+tl(x.amount)+(x.note ? ' ('+x.note+')' : '')).join('\n') : '- yok') +
      ('\n\n'+t('Depozito:')+' ')+tl(sm.deposit)+('\n'+t('Kesinti toplamı:')+' ')+tl(sm.deducted)+('\n'+t('İade:')+' ')+tl(sm.refund) +
      (sm.extra ? ('\n'+t('Kiracıdan ayrıca talep:')+' ')+tl(sm.extra) : '') +
      ('\n\n'+t('Kiracı onayı:')+' ')+(mo.tenantOk ? t('var') : t('yok'))+('\n'+t('Mülk sahibi onayı:')+' ')+(mo.landlordOk ? t('var') : t('yok')) +
      (mo.refunded ? ('\n'+t('İade yapıldı:')+' ')+tl(mo.refunded.amount)+' · '+fmtFull(parse(mo.refunded.date)) : '');
    openText(t('Çıkış raporu'), body);
  },

  /* ---- abonelik ---- */
  demoBilling: d => { ui.demoBilling = d.v ? { state:d.v, plan: d.plan || 'bes' } : null; save(); },
  /** Paket satın alma: fiyatlar tanımlanana kadar kapalıdır. */
  buy: () => billing.paused()
    ? host.ask({
      title:t('Ödeme sistemimizi güncelliyoruz'),
      body:t('Paket satın alma ve yükseltme kısa süre içinde açılacak. Bu sürede hesabın ve kayıtların korunur. Acil bir ihtiyacın varsa bize yaz: {email}', { email: CONFIG.supportEmail }),
      ok:t('Tamam'), alone:true
    })
    : notify({ title:t('Aboneliği telefondan başlat'), body:t('anahtar’ın iPhone ya da Android uygulamasından abone olabilirsin; aynı hesapla web’de de geçerli olur.'), icon:'key' }, false)
};

/** Eylemi çalıştırır; kilitliyse sheet açar. */
export function act(name, d = {}){
  if (WRITE_ACTS.has(name) && locked()) return;
  const fn = A[name];
  return fn ? fn(d) : undefined;
}

/* ---------------- formlar ---------------- */

/**
 * @param {string} type  form adı
 * @param {Record<string, any>} v  alan değerleri (metin) ve files: [{ name, dataUrl }]
 */
export async function submit(type, v){
  const fd = { get: k => (v[k] === undefined ? null : v[k]) };
  const files = v.files || [];
  const p = v.pid ? P(v.pid) : null;
  if (!OPEN_FORMS.has(type) && locked()) return false;

  if (type === 'msg'){
    const text = String(fd.get('text') || '').trim();
    const img = files.length ? await keep(p.id, files[0]) : null;
    if (!text && !img) return false;
    pushMsg(p, Object.assign({ from: ui.role, by: ui.role === 'tenant' ? meTenant(p)?.id : undefined, text, at: Date.now() }, img ? { img } : {}));
    save();
    return true;
  }

  if (type === 'newReq'){
    const shots = await keepAll(p.id, files, 4);
    const r = {
      id:uid('r'), cat:fd.get('cat'), title:String(fd.get('title') || '').trim(),
      desc:String(fd.get('desc') || '').trim(), urgency:fd.get('urgency'),
      status:0, cost:'Belirlenmedi', costOk:false, decision:null,
      date: iso(t0()), photos:0, shots,
      log:[{ at:Date.now(), text:t('Talep açıldı') }]
    };
    if (!r.title) return false;
    p.requests.unshift(r);
    sysMsg(p, (t('Yeni talep açıldı:')+' ')+r.title, r.id);
    save(); host.closeSheet();
    go(ui.role === 'tenant' ? '/kiraci/talepler' : '/mulk-sahibi/mulk/'+p.id+'/talep');
    notify({ title:t('Talep gönderildi'), body:t('Mülk sahibine bildirildi. Durum değiştikçe haber vereceğiz.'), icon:'wrench' });
    return true;
  }

  if (type === 'pay'){
    const key = v.key, kind = v.kind === 'aidat' ? 'aidat' : 'kira', map = payMap(p, kind);
    const file = files[0];
    // Kendi ödediği aidatı mülk sahibi dekontsuz da kaydedebilir; kiracı her zaman dekont yükler.
    const own = kind === 'aidat' && ui.role === 'landlord';
    if (!file && !own) return false;
    const amount = Math.max(0, Number(fd.get('amount')) || 0);
    const prev = map[key];
    const already = prev && prev.status === 'partial' ? Number(prev.amount) || 0 : 0;
    const total = already + amount;
    const due = dueOf(p, kind, key);
    const rec = {
      status: total < due ? 'partial' : own ? 'approved' : 'review',
      date: String(fd.get('date') || iso(t0())),
      amount: total,
      receipt: file ? fileName(p.name, kind === 'aidat' ? 'aidat' : 'dekont', key, Object.values(map).map(x => x.receipt).filter(Boolean), file) : '',
      note: String(fd.get('note') || '').trim() || undefined
    };
    if (own && rec.status === 'approved') rec.approvedAt = Date.now();
    if (own && !file) rec.method = 'havale';               // dekontsuz kayıt: havale / EFT ile ödendi sayılır
    const stored = file ? await keep(p.id, file) : null;
    if (stored) rec.photo = stored;
    map[key] = rec;
    sysMsg(p, monthYear(key)+(' '+(kind === 'aidat' ? t('aidatı için dekont yüklendi') : t('kirası için dekont yüklendi')))+(rec.status === 'partial' ? (' '+t('(kısmi:')+' ')+tl(total)+')' : ''));
    save(); if (!v.keepOpen) host.closeSheet();
    notify(own && rec.status === 'approved' ? { title:t('Aidat kaydedildi'), body:p.name+' · '+monthYear(key), icon:'card' } : {
      title: rec.status === 'partial' ? t('Kısmi ödeme kaydedildi') : t('Dekont yüklendi'),
      body: rec.status === 'partial'
        ? tl(due - total)+(' '+t('bakiye görünüyor; kalanı yükleyince onaya gider.'))
        : LIVE ? t('anahtar ekibi dekontu inceliyor. Onaylanınca mülk sahibine iletilir.') : t('Mülk sahibinin onayı bekleniyor. Onaylanınca haber vereceğiz.'),
      icon:'card'
    });
    return true;
  }

  if (type === 'reject'){
    const key = v.key, rec = payMap(p, v.kind)[key];
    if (!rec) return false;
    const note = String(fd.get('note') || '').trim();
    rec.status = 'rejected';
    rec.rejectReason = t(String(fd.get('reason'))) + (note ? ' · '+note : '');
    sysMsg(p, t('{month} dekontu reddedildi: {reason}', { month: monthYear(key), reason: rec.rejectReason }));
    save(); host.closeSheet();
    notify({ title:t('Dekont reddedildi'), body:t('Kiracıya gerekçe iletildi.'), icon:'card' });
    return true;
  }

  if (type === 'upload'){
    const file = files[0];
    if (!file) return false;
    const until = fd.get('until') || undefined;
    const cat = fd.get('cat');
    const note = String(fd.get('note') || '').trim().slice(0, 120);
    if (cat === 'Diğer' && note.length < 3) return false;
    const path = LIVE ? await backend.storeFile(p.id, file) : null;
    const name = fileName(p.name, cat, iso(t0()), p.docs.map(d => d.name), file);
    p.docs.push(Object.assign({ id:uid('d'), cat, name, at: iso(t0()), until }, note ? { note } : {}, path ? { path } : {}));
    if (cat === 'DASK poliçesi' && until) p.dask = until;
    sysMsg(p, cat+(' '+t('yüklendi:')+' ')+name);
    save(); host.closeSheet();
    notify({ title:t('Belge yüklendi'), body: cat + (until ? ' · '+fmtFull(parse(until))+(' '+t('için hatırlatma kuruldu')) : '') + (LIVE ? ' · '+t('anahtar ekibi inceleyecek.') : ''), icon:'doc' });
    return true;
  }

  if (type === 'room'){
    const n = String(fd.get('n') || '').trim();
    if (!n) return false;
    p.inspect.rooms.push({ n, photos:0, shots:[], note:'' });
    p.inspect.tenantOk = false;
    p.inspect.landlordOk = false;
    save();
    return true;
  }

  if (type === 'addProp'){
    const room = billing.roomFor(1);
    if (!room.ok){ host.closeSheet(); setTimeout(() => host.openSheet('paket', { need: room.have + 1, suggest: room.suggest }), 60); return false; }
    const today = t0(), nextYear = iso(new Date(today.getFullYear()+1, today.getMonth(), today.getDate()));
    const name = String(fd.get('name') || '').trim();
    const ptype = String(fd.get('type') || 'Konut');
    const lessee = lesseeFrom(fd);
    const phone = String(fd.get('phone') || '');
    if (!name) return false;
    const address = fd.get('address') || null;
    const { id } = newProperty({
      name, type:ptype, address, addr: address ? formatAddress(address) : String(fd.get('addr') || '').trim(), area: Number(fd.get('area')) || null,
      company:lessee.company, stopaj:lessee.stopaj,
      rent: Number(fd.get('rent')) || 0, dueDay: Number(fd.get('due')) || 1,
      dask: ptype === 'Konut' ? nextYear : null,
      tenants: LIVE ? [] : [{ id:uid('t'), name:'Davet bekleniyor', phone, email:'' }]
    });
    ui.newPropType = null;
    save(); host.closeSheet();
    go('/mulk-sahibi/mulk/'+id);
    if (LIVE){
      // Ev sunucuya yazılınca kiracı için davet kodu üretilir.
      try {
        const code = await backend.createInvite(id, { name:'', email:'', phone });
        host.openSheet('davet-paylas', { pid:id, code });
      } catch(e){ failed(t('Davet oluşturulamadı'), e); }
      return true;
    }
    const num = phone.replace(/\D/g, '');
    notify({
      title:t('Mülk eklendi'), body:t('Kiracıya davet linkini gönder.'), icon:'home',
      actions:[{ label:t('WhatsApp ile davet et'), run:() => {
        const n = num ? '9' + num.replace(/^9/, '') : '';
        host.openUrl('https://wa.me/'+n+'?text='+encodeURIComponent((t('Merhaba,')+' ')+name+(' '+t('için anahtar’da ortak panelimize katılır mısın? [davet linki]'))));
      } }]
    });
    return true;
  }

  if (type === 'support'){
    const kind = String(fd.get('kind') || 'genel');
    const units = Number(fd.get('units')) || null;
    const message = String(fd.get('message') || '').trim();
    const phone = String(fd.get('phone') || '').trim();
    if (LIVE){
      try { await backend.createSupportRequest({ kind, units, message, phone }); }
      catch(e){ failed(t('Talep gönderilemedi'), e); return false; }
      host.closeSheet();
      notify({ title:t('Talebin alındı'), body:t('En kısa sürede seninle iletişime geçeceğiz.'), icon:'chat' }, false);
      return true;
    }
    host.closeSheet();
    host.openUrl('mailto:' + CONFIG.supportEmail + '?subject=' + encodeURIComponent(t('anahtar iletişim talebi'))
      + '&body=' + encodeURIComponent([message, units ? t('Mülk sayısı: {n}', { n: units }) : '', phone].filter(Boolean).join('\n')));
    return true;
  }

  if (type === 'addTenant'){
    const name = String(fd.get('name') || '').trim();
    if (!name) return false;
    if (LIVE){
      try {
        const code = await backend.createInvite(p.id, { name, email:String(fd.get('email') || '').trim(), phone:String(fd.get('phone') || '').trim() });
        host.closeSheet();
        setTimeout(() => host.openSheet('davet-paylas', { pid:p.id, code }), 60);
      } catch(e){ failed(t('Davet oluşturulamadı'), e); }
      return true;
    }
    p.tenants.push({ id:uid('t'), name, email:String(fd.get('email') || '').trim(), phone:String(fd.get('phone') || '').trim() });
    sysMsg(p, name+(' '+t('mülke kiracı olarak eklendi')));
    save(); host.closeSheet();
    setTimeout(() => host.openSheet('davet-paylas', { pid:p.id, code:'DEMO' + String(Math.floor(Math.random() * 9000) + 1000) }), 60);
    return true;
  }

  if (type === 'quote'){
    const r = reqOf(p, v.id);
    const q = { id:uid('q'), vendor:String(fd.get('vendor') || '').trim(), phone:String(fd.get('phone') || '').trim(),
      amount:Number(fd.get('amount')) || 0, note:String(fd.get('note') || '').trim(), chosen:false, by:ui.role === 'tenant' ? 'tenant' : 'landlord' };
    if (!q.vendor) return false;
    r.quotes = r.quotes || [];
    r.quotes.push(q);
    logReq(r, (t('Teklif eklendi:')+' ')+q.vendor+' · '+tl(q.amount));
    sysMsg(p, (t('Yeni usta teklifi:')+' ')+q.vendor+' ('+tl(q.amount)+') · '+r.title, r.id);
    save(); host.closeSheet();
    return true;
  }

  if (type === 'invoice'){
    const r = reqOf(p, v.id);
    const amount = Number(fd.get('amount')) || 0;
    const date = String(fd.get('date'));
    const file = files[0];
    // Teklif tutarıyla açılmış gider varsa fatura tutarıyla güncellenir; işaret kaldırılırsa silinir.
    const expenseId = reqExpense(p, r, fd.get('toExpense') ? ownerShare(r, amount) : 0, date, '');
    const path = file && LIVE ? await backend.storeFile(p.id, file) : null;
    const name = file ? fileName(p.name, 'fatura', date, p.requests.map(x => x.invoice && x.invoice.name).filter(Boolean), file) : 'fatura';
    r.invoice = Object.assign({ amount, date, name, expenseId }, path ? { path } : {});
    logReq(r, (t('Fatura işlendi:')+' ')+tl(amount));
    sysMsg(p, (t('Talep faturası:')+' ')+r.title+' · '+tl(amount), r.id);
    save(); host.closeSheet();
    notify({ title:t('Fatura kaydedildi'), body: expenseId ? t('Gider defterine de işlendi.') : t('Gider defterine eklenmedi.'), icon:'doc' }, false);
    return true;
  }

  if (type === 'expense'){
    p.expenses = p.expenses || [];
    const data = { cat:String(fd.get('cat')), amount:Number(fd.get('amount')) || 0, date:String(fd.get('date')), note:String(fd.get('note') || '').trim() };
    const id = v.id;
    if (id) Object.assign(p.expenses.find(e => e.id === id), data);
    else p.expenses.push(Object.assign({ id:uid('e') }, data));
    ui.expenseYear = data.date.slice(0, 4);
    save(); host.closeSheet();
    notify({ title: id ? t('Gider güncellendi') : t('Gider eklendi'), body:data.cat+' · '+tl(data.amount), icon:'chart' }, false);
    return true;
  }

  if (type === 'startMoveOut'){
    p.moveOut = {
      started: Date.now(), date: String(fd.get('date')),
      rooms: p.inspect.rooms.map(r => ({ n:r.n, note:'', shots:[], condition:'' })),
      deductions: [], tenantOk:false, landlordOk:false, refunded:null
    };
    sysMsg(p, (t('Çıkış süreci başlatıldı ·')+' ')+fmtFull(parse(p.moveOut.date)));
    save(); host.closeSheet();
    notify({ title:t('Çıkış süreci başladı'), body:t('Odaları birlikte değerlendirip kesintileri onaylayın.'), icon:'key' });
    return true;
  }

  if (type === 'deduction'){
    const label = String(fd.get('label') || '').trim();
    if (!label) return false;
    p.moveOut.deductions.push({ id:uid('k'), label, amount:Number(fd.get('amount')) || 0, note:String(fd.get('note') || '').trim() });
    resetMoveOutApprovals(p);
    save(); host.closeSheet();
    return true;
  }

  if (type === 'refund'){
    const amount = Number(fd.get('amount')) || 0, date = String(fd.get('date'));
    p.moveOut.refunded = { amount, date };
    sysMsg(p, (t('Depozito iadesi yapıldı:')+' ')+tl(amount));
    save(); host.closeSheet();
    host.celebrate({ title:t('İade kaydedildi') });
    notify({ title:t('İade kaydedildi'), body:tl(amount)+' · '+fmtFull(parse(date))+t('. Kiracıya bildirildi.'), icon:'key' });
    return true;
  }

  if (type === 'editProp'){
    p.name = String(fd.get('name') || '').trim();
    const address = fd.get('address');
    if (address){ p.address = address; p.addr = formatAddress(address) || address.note || ''; }
    else p.addr = String(fd.get('addr') || p.addr || '').trim();
    p.type = String(fd.get('type') || p.type);
    p.area = Number(fd.get('area')) || null;
    const lessee = lesseeFrom(fd);
    p.company = lessee.company;
    p.stopaj = lessee.stopaj;
    p.depositKind = String(fd.get('depositKind') || 'Nakit');
    p.depositNote = String(fd.get('depositNote') || '').trim();
    const newRent = Number(fd.get('rent')) || p.rent;
    if (newRent !== p.rent){
      const today = iso(t0());
      p.rentHistory = (p.rentHistory || []).filter(h => h.from !== today);
      p.rentHistory.push({ from: today, amount: newRent, note:t('Elle güncellendi') });
    }
    p.value = Number(fd.get('value')) || null;
    p.dueDay = Math.min(28, Math.max(1, Number(fd.get('due')) || p.dueDay));
    p.aidat = Number(fd.get('aidat')) || 0;
    p.aidatPayer = fd.get('aidatPayer');
    p.deposit = Number(fd.get('deposit')) || 0;
    if (fd.get('contractEnd')) p.contractEnd = String(fd.get('contractEnd'));
    p.dask = fd.get('dask') ? String(fd.get('dask')) : (p.type === 'Konut' ? p.dask : null);
    normalize(p);
    save(); host.closeSheet();
    notify({ title:t('Kaydedildi'), body:p.name+(' '+t('bilgileri güncellendi.')), icon:'home' }, false);
    return true;
  }
  return false;
}
