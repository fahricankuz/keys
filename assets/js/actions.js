/* Etkileşimler: tıklama, form ve alan değişiklikleri. */

import { S, ui, save, reset as resetState, replaceState, setTheme, seed, VERSION, STEPS, AREA_TEMPLATES, TENANT_KINDS } from './state.js';
import { go, openSheet, closeSheet, current, setParams } from './router.js';
import {
  P, period, statusOf, remaining, yearIncome, monthCollection, rentAt, expectedAt, normalize, tenantsLabel,
  meTenant, senderName, unpaid, moveOutSummary, yearNumbers, sum
} from './logic.js';
import { estimate } from './tax.js';
import { taxInput } from './views.js';
import { render, refreshLayer } from './render.js';
import { notify } from './notify.js';
import { ask } from './confirm.js';
import { migrate } from './migrate.js';
import { t, locale, setLang, getLang } from './i18n.js';
import { install } from './pwa.js';
import * as billing from './billing.js';
import { setLock } from './native.js';
import { LIVE } from './config.js';
import * as backend from './backend.js';
import { AUTH_ACTIONS, AUTH_FORMS, authSubmit } from './auth.js';
import { startTour, nextStep, prevStep, endTour, TOUR } from './tour.js';
import {
  iso, t0, parse, fmt, fmtFull, monthYear, tl, daysTo, shrink, download, esc, announce, uid, percent
} from './util.js';

/* ---------------- abonelik kilidi ---------------- */

/** Mülk sahibinin kayıt değiştiren işlemleri (abonelik yoksa kapalı). */
const WRITE_ACTS = new Set(['advance','rewind','decide','okCost','approvePay','nudge','sendRenewal','cancelRenewal',
  'removeDoc','removeRoom','removeShot','approveInspect','nudgeInspect','removeProp','removeTenant','chooseQuote','removeQuote',
  'removeExpense','addUnpaidDeduction','removeDeduction','removeExitShot','approveMoveOut','cancelMoveOut','copyInvite']);
/** Kilitliyken de açık formlar: mesaj ve hesap işlemleri. */
const OPEN_FORMS = new Set(['msg', ...AUTH_FORMS]);
const WRITE_INPUTS = new Set(['cost','roomNote','roomPhoto','exitNote','exitCond','exitPhoto']);

function locked(){
  if (billing.canWrite()) return false;
  openSheet('abonelik');
  notify({ title:t('Abonelik gerekli'), body:t('Deneme süren bitti. Kayıtları değiştirmek için abone ol; okuma ve mesajlaşma açık.'), icon:'key' }, false);
  return true;
}

/** main.js tıklama yöneticisi çağırır: işlem kilitliyse true. */
export function blockedAct(act){ return WRITE_ACTS.has(act) && locked(); }

/** Formdaki kiracı türü alanlarından şirket bilgisi ve stopaj. */
function lesseeFrom(fd){
  if (String(fd.get('tenantKind') || TENANT_KINDS[0]) !== TENANT_KINDS[1]) return { company:null, stopaj:false };
  return {
    company:{ name:String(fd.get('coName') || '').trim(), taxNo:String(fd.get('coTaxNo') || '').trim(), taxOffice:String(fd.get('coTaxOffice') || '').trim() },
    stopaj: !!fd.get('stopaj')
  };
}

/** Mesaja kimlik verir; sunucu mesajları kimlikle eşleştirir. */
function pushMsg(p, m){ p.msgs.push(Object.assign({ id: uid('m') }, m)); }
function sysMsg(p, text){ pushMsg(p, { from:'system', text, at:Date.now() }); }
function logReq(r, text){ (r.log = r.log || []).push({ at:Date.now(), text }); }
function reqOf(p, id){ return p.requests.find(r => r.id === id); }

/** Tur açıkken adım adresine gider. */
function tourGo(){
  const s = ui.tour != null ? TOUR[ui.tour] : null;
  if (s) go(s.path); else render();
}

export const A = {
  /* ---- gezinme ---- */
  nav: d => go(d.go),
  sheet: d => {
    openSheet(d.s, { pid:d.pid, key:d.key, cat:d.cat, id:d.id });
    if (d.s === 'hesap'){
      ui.authMsg = null;
      backend.pushState().then(st => { ui.pushState = st; refreshLayer(); }).catch(() => {});
    }
  },

  copyInvite: async () => {
    const el = document.getElementById('inviteLink');
    try { await navigator.clipboard.writeText(el.value); notify({ title:t('Kopyalandı'), body:t('Davet bağlantısı panoya alındı.'), icon:'doc' }, false); }
    catch(e){ el.select(); }
  },
  closeSheet: () => closeSheet(),

  switchRole: () => {
    const toLandlord = ui.role === 'tenant';
    go(toLandlord ? '/mulk-sahibi' : '/kiraci');
    notify({
      title: toLandlord ? t('Mülk sahibi görünümü') : t('Kiracı görünümü'),
      body: toLandlord ? t('Mülklerinin genel durumunu görüyorsun.') : t('Moda’daki evin kiracısı olarak görüyorsun.'),
      icon:'home'
    }, false);
  },

  goMsg: d => go(ui.role === 'tenant' ? '/kiraci/mesajlar' : '/mulk-sahibi/mulk/'+d.pid+'/mesaj'),

  reqTab: d => { ui.reqTab = d.v; render(); },
  propFilter: d => { ui.propFilter = d.v; render(); },

  /* ---- abonelik ---- */
  billingPlan: d => { ui.billingPlan = d.v; refreshLayer(); },
  subscribe: async d => {
    try {
      const ok = await billing.purchase(d.v || ui.billingPlan || 'annual');
      if (ok === 'redirect') return;
      if (ok){
        closeSheet(); render();
        notify({ title:t('Aboneliğin başladı'), body:t('Teşekkürler! Tüm özellikler açık.'), icon:'key' });
      }
    } catch(e){
      notify({ title:t('Satın alma tamamlanamadı'), body: String(e?.message || e), icon:'card' }, false);
    }
  },
  restorePurchases: async () => {
    try {
      const ok = await billing.restore();
      render(); refreshLayer();
      notify({ title: ok ? t('Aboneliğin geri yüklendi') : t('Geri yüklenecek abonelik bulunamadı'), body: ok ? t('Tüm özellikler açık.') : t('Aynı mağaza hesabıyla giriş yaptığından emin ol.'), icon:'key' }, false);
    } catch(e){
      notify({ title:t('Geri yükleme tamamlanamadı'), body: String(e?.message || e), icon:'card' }, false);
    }
  },
  demoBilling: d => { billing.demoSet(d.v); render(); refreshLayer(); },
  newPropType: d => {
    // Formdaki yazılanları koruyarak tipi değiştir.
    const f = document.querySelector('form[data-form="addProp"]');
    const keep = f ? Object.fromEntries(new FormData(f)) : {};
    ui.newPropType = d.v;
    refreshLayer();
    const nf = document.querySelector('form[data-form="addProp"]');
    if (nf) Object.entries(keep).forEach(([k, v]) => { const el = nf.elements[k]; if (el && k !== 'type' && el.type !== 'checkbox') el.value = v; });
  },
  suggestTitle: d => {
    const el = document.querySelector('form[data-form="newReq"] [name=title]');
    if (el){ el.value = d.v; el.focus(); }
  },

  openReq: d => openSheet('talep', { pid:d.pid, id:d.id }),

  /* ---- talepler ---- */
  advance: d => {
    const p = P(d.pid), r = reqOf(p, d.id);
    r.status = Math.min(3, r.status + 1);
    logReq(r, (t('Durum:')+' ')+t(STEPS[r.status]));
    sysMsg(p, (t('Talep durumu:')+' ')+r.title+' · '+t(STEPS[r.status]));
    save(); render();
    if (S.settings.reqUpdates)
      notify({ title:t('Talep güncellendi'), body:r.title+' → '+t(STEPS[r.status])+t('. Kiracıya bildirildi.'), icon:'wrench' });
  },

  rewind: d => {
    const p = P(d.pid), r = reqOf(p, d.id);
    r.status = Math.max(0, r.status - 1);
    logReq(r, (t('Durum geri alındı:')+' ')+t(STEPS[r.status]));
    save(); render();
  },

  decide: d => {
    const p = P(d.pid), r = reqOf(p, d.id);
    r.decision = d.v; r.status = 3;
    logReq(r, (t('Karar:')+' ')+d.v);
    sysMsg(p, (t('Ek talep:')+' ')+r.title+' · '+d.v);
    save(); render();
    notify({ title:t('Karar kaydedildi'), body:r.title+': '+d.v, icon:'wrench' });
  },

  okCost: d => {
    const p = P(d.pid), r = reqOf(p, d.id);
    r.costOk = true;
    logReq(r, (t('Masraf paylaşımı onaylandı:')+' ')+t(r.cost));
    sysMsg(p, (t('Masraf paylaşımı onaylandı:')+' ')+t(r.cost));
    save(); render();
  },

  closeReq: d => {
    const p = P(d.pid), r = reqOf(p, d.id);
    r.status = 3;
    logReq(r, t('Kiracı talebi çözüldü olarak işaretledi'));
    sysMsg(p, (t('Talep kapatıldı:')+' ')+r.title);
    save(); render();
    notify({ title:t('Talep kapatıldı'), body:r.title, icon:'wrench' });
  },

  /* ---- ödemeler ---- */
  approvePay: d => {
    const p = P(d.pid), rec = p.pay[d.key];
    if (!rec) return;
    rec.status = 'approved';
    rec.approvedAt = Date.now();
    delete rec.rejectReason;
    sysMsg(p, monthYear(d.key)+(' '+t('kirası onaylandı')));
    save(); closeSheet(); render();
    notify({ title:t('Ödeme onaylandı'), body:p.name+' · '+monthYear(d.key)+(' '+t('kirası. Kiracıya bildirildi.')), icon:'card' });
  },

  nudge: d => {
    const p = P(d.pid), per = period(p);
    pushMsg(p, {
      from:'landlord',
      text:(t('Merhaba,')+' ')+monthYear(per.key)+(' '+t('kirası için hatırlatma. Ödediysen dekontu uygulamaya yükleyebilir misin? Teşekkürler.')),
      at: Date.now()
    });
    save(); render();
    notify({ title:t('Hatırlatma gönderildi'), body:tenantsLabel(p)+(' '+t('için nazik bir mesaj iletildi.')), icon:'chat' });
  },

  /* ---- yenileme ---- */
  sendRenewal: d => {
    const p = P(d.pid);
    const cpi = Number(ui.renewal.cpi);
    if (!isFinite(cpi)) return;
    const max = Math.round(p.rent * (1 + cpi/100));
    const amt = Math.min(Number(ui.renewal.amount) || max, max);
    p.renewal = { amount:amt, max, cpi, status:'sent', at:Date.now() };
    sysMsg(p, (t('Yenileme teklifi:')+' ')+tl(amt)+(' '+t('(yasal üst sınır')+' ')+tl(max)+')');
    ui.renewal = { cpi:null, amount:null };
    save(); closeSheet(); render();
    notify({ title:t('Teklif gönderildi'), body:t('Kiracı uygulamada kabul edebilir ya da mesajla görüşebilir.'), icon:'card' });
  },

  acceptRenewal: d => {
    const p = P(d.pid);
    p.renewal.status = 'accepted';
    // Yeni tutar sözleşme bitişinden itibaren geçerli; kira geçmişine yazılır.
    p.rentHistory = (p.rentHistory || []).filter(h => h.from !== p.contractEnd);
    p.rentHistory.push({ from:p.contractEnd, amount:p.renewal.amount, note:t('Yenileme · TÜFE {pct}', { pct:percent(p.renewal.cpi, 2) }) });
    normalize(p);
    sysMsg(p, (t('Yenileme teklifi kabul edildi:')+' ')+tl(p.renewal.amount));
    save(); render();
    notify({ title:t('Teklifi kabul ettin'), body:(t('Yeni kira')+' ')+fmtFull(parse(p.contractEnd))+(' '+t('itibarıyla')+' ')+tl(p.renewal.amount)+'.', icon:'card' });
  },

  cancelRenewal: async d => {
    if (!await ask({ title:t('Teklif geri çekilsin mi?'), body:t('Kiracı artık teklifi göremez.'), ok:t('Geri çek') })) return;
    const p = P(d.pid);
    p.renewal = null;
    sysMsg(p, t('Yenileme teklifi geri çekildi'));
    save(); render();
  },

  /* ---- belgeler ve tutanak ---- */
  removeDoc: async d => {
    const p = P(d.pid);
    const doc = p.docs.find(x => x.id === d.id);
    if (!doc) return;
    if (!await ask({ title:t('Belge silinsin mi?'), body:'“'+doc.name+t('” kalıcı olarak kaldırılır.'), ok:t('Sil'), danger:true })) return;
    p.docs = p.docs.filter(x => x.id !== d.id);
    save(); render();
  },

  removeRoom: async d => {
    const p = P(d.pid);
    const room = p.inspect.rooms[Number(d.i)];
    if (!room) return;
    if (!await ask({ title:room.n+' silinsin mi?', body:t('Odanın notu ve fotoğrafları silinir; tutanak onayları sıfırlanır.'), ok:t('Sil'), danger:true })) return;
    p.inspect.rooms.splice(Number(d.i), 1);
    p.inspect.tenantOk = false; p.inspect.landlordOk = false;
    save(); render();
  },

  removeShot: d => {
    const room = P(d.pid).inspect.rooms[Number(d.i)];
    room.shots.splice(Number(d.j), 1);
    save(); render();
  },

  approveInspect: d => {
    const p = P(d.pid);
    if (ui.role === 'tenant') p.inspect.tenantOk = true; else p.inspect.landlordOk = true;
    sysMsg(p, t('Giriş tutanağı {who} tarafından onaylandı', { who: ui.role === 'tenant' ? t('kiracı') : t('mülk sahibi') }));
    save(); render();
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

  /* ---- dışa aktarma ---- */
  exportChat: d => {
    const p = P(d.pid);
    const body = p.name+' · '+p.addr+'\n\n' + p.msgs.map(m =>
      new Date(m.at).toLocaleString(locale())+' · '+senderName(p, m)+': '+m.text).join('\n');
    openText(t('Yazışma dökümü'), body);
  },

  shareReport: () => {
    const year = String(ui.reportYear || new Date().getFullYear());
    const yn = yearNumbers(year);
    const e = estimate(taxInput(yn), { year:Number(year), noExemption:!!ui.noExemption });
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

  exportCsv: () => {
    const rows = [[t('Tür'),t('Mülk'),t('Dönem / tarih'),t('Durum / kategori'),t('Tutar'),t('Açıklama')]];
    S.order.forEach(id => {
      const p = P(id);
      Object.keys(p.pay).sort().forEach(k => {
        const r = p.pay[k];
        rows.push([t('Ödeme'), p.name, k, r.status, r.amount != null ? r.amount : expectedAt(p, k), r.date || '']);
      });
      (p.expenses || []).slice().sort((a, b) => a.date < b.date ? -1 : 1).forEach(e => {
        rows.push([t('Gider'), p.name, e.date, e.cat, e.amount, e.note || '']);
      });
    });
    const csv = rows.map(r => r.map(c => '"'+String(c).replace(/"/g,'""')+'"').join(';')).join('\n');
    download('evim-kayitlar.csv', '\uFEFF'+csv, 'text/csv;charset=utf-8');
    notify({ title:t('CSV indirildi'), body:t('Ödemeler ve giderler dosyası hazırlandı.'), icon:'chart' }, false);
  },

  exportData: () => {
    download('evim-verileri.json', JSON.stringify(S, null, 2));
    notify({ title:t('Veriler indirildi'), body:t('JSON dosyasını içe aktararak geri yükleyebilirsin.'), icon:'doc' }, false);
  },

  copyText: async () => {
    const box = document.getElementById('txtOut');
    try {
      await navigator.clipboard.writeText(box.value);
      notify({ title:t('Kopyalandı'), body:t('Metin panoya alındı.'), icon:'doc' }, false);
    } catch(e){
      box.select();
      notify({ title:t('Kopyalanamadı'), body:t('Metin seçildi; Ctrl/Cmd + C ile kopyalayabilirsin.'), icon:'doc' }, false);
    }
  },

  downloadText: () => {
    const txt = ui.text || { title:'metin', body:'' };
    download(txt.title.toLocaleLowerCase(locale()).replace(/\s+/g,'-')+'.txt', txt.body, 'text/plain;charset=utf-8');
  },

  /* ---- bildirim, tema, veri ---- */
  clearInbox: () => { S.inbox = []; save(); backend.clearInboxRemote(); render(); },

  theme: d => { setTheme(d.v); render(); },

  reset: async () => {
    if (!await ask({ title:t('Demo sıfırlansın mı?'), body:t('Girdiğin her şey silinir ve örnek veri yeniden yüklenir.'), ok:t('Sıfırla'), danger:true })) return;
    resetState();
    go('/kiraci', { replace:true });
    render();
    notify({ title:t('Sıfırlandı'), body:t('Demo verisi yeniden yüklendi.'), icon:'home' }, false);
  },

  removeProp: async d => {
    const name = P(d.pid)?.name || t('Bu mülk');
    if (!await ask({ title:name+(' '+t('kaldırılsın mı?')), body:t('Mülkün ödemeleri, talepleri, mesajları ve belgeleri de silinir.'), ok:t('Kaldır'), danger:true })) return;
    delete S.props[d.pid];
    S.order = S.order.filter(x => x !== d.pid);
    if (S.myHome === d.pid) S.myHome = S.order[0];
    save();
    go('/mulk-sahibi', { replace:true });
    render();
  },

  preview: d => {
    closeSheet();
    const moda = P('moda') || P(S.order[0]);
    const cih = P('cihangir') || P(S.order[0]);
    const map = {
      rent:{ title:t('Kira günü yaklaşıyor'), body: monthYear(period(moda).key)+(' '+t('kirası yaklaşıyor. Ödeyince dekontu yükle.')), icon:'card',
             actions:[{ label:t('Ödemelere git'), run:() => go('/kiraci/odemeler') }] },
      reqUpd:{ title:t('Talebin güncellendi'), body:t('Kombi basıncı düşüyor → Usta çağrıldı. Masraf mülk sahibinde.'), icon:'wrench',
             actions:[{ label:t('Talebi aç'), run:() => go('/kiraci/talepler') }] },
      renew:{ title:t('Yenileme teklifi geldi'), body:t('Mülk sahibin yeni dönem için teklif gönderdi. Yasal üst sınırla karşılaştırarak incele.'), icon:'card',
             actions:[{ label:t('İncele'), run:() => go('/kiraci/odemeler') }] },
      evict:{ title:t('Tahliye tarihi yaklaşıyor'), body:t('Taahhütnamedeki tarihe yaklaşıldı.'), icon:'doc',
             actions:[{ label:t('Belgeler'), run:() => go('/kiraci/belgeler') }] },
      receipt:{ title:cih.name+': dekont geldi', body:t('Bu ayın kirası için dekont yüklendi. Onayını bekliyor.'), icon:'card',
             actions:[{ label:t('Onayla'), run:() => go('/mulk-sahibi/mulk/'+cih.id+'/odeme') }] },
      late:{ title:t('Kira gecikti'), body:t('Bu ayın kirası henüz ödenmedi. Nazik bir hatırlatma gönderebilirsin.'), icon:'card',
             actions:[{ label:t('Portföye git'), run:() => go('/mulk-sahibi') }] },
      newReq:{ title:cih.name+': yeni talep', body:t('Banyo aspiratörü değişimi · fotoğraf ekli.'), icon:'wrench',
             actions:[{ label:t('Talebi aç'), run:() => go('/mulk-sahibi/mulk/'+cih.id+'/talep') }] },
      dask:{ title:t('DASK yenileme'), body:cih.name+(' '+t('poliçesi')+' ')+daysTo(cih.dask)+(' '+t('gün içinde bitiyor.')), icon:'doc',
             actions:[{ label:t('Belgelere git'), run:() => go('/mulk-sahibi/mulk/'+cih.id+'/belge') }] }
    };
    notify(map[d.v]);
  },

  /* ---- kiracılar ---- */
  removeTenant: async d => {
    const p = P(d.pid);
    const tn = p.tenants.find(x => x.id === d.id);
    if (!tn) return;
    if (!await ask({ title:tn.name+(' '+t('mülkten çıkarılsın mı?')), body:t('Bu kiracı artık mülkün ödemelerini, taleplerini ve yazışmalarını göremez. Geçmiş kayıtlar korunur.'), ok:t('Çıkar'), danger:true })) return;
    if (LIVE){
      try {
        if (tn.pending) await backend.deleteInvite(p.id, tn.code);
        else await backend.removeMember(p.id, tn.id);
        render();
      } catch(e){ notify({ title:t('İşlem yapılamadı'), body: backend.humanError(e), icon:'home' }, false); }
      return;
    }
    p.tenants = p.tenants.filter(x => x.id !== d.id);
    sysMsg(p, tn.name+(' '+t('mülkten çıkarıldı')));
    save(); render();
  },

  /* ---- teklifler ---- */
  chooseQuote: d => {
    const p = P(d.pid), r = reqOf(p, d.id);
    r.quotes.forEach(q => { q.chosen = q.id === d.q; });
    const q = r.quotes.find(x => x.chosen);
    logReq(r, (t('Teklif seçildi:')+' ')+q.vendor+' · '+tl(q.amount));
    sysMsg(p, (t('Talep için usta seçildi:')+' ')+q.vendor+' ('+tl(q.amount)+') · '+r.title);
    if (r.status < 2){ r.status = 2; logReq(r, (t('Durum:')+' ')+t(STEPS[2])); }
    save(); render();
    notify({ title:t('Usta seçildi'), body:q.vendor+' · '+tl(q.amount)+t('. Kiracıya bildirildi.'), icon:'wrench' });
  },

  removeQuote: d => {
    const p = P(d.pid), r = reqOf(p, d.id);
    r.quotes = r.quotes.filter(q => q.id !== d.q);
    save(); render();
  },

  /* ---- giderler ---- */
  removeExpense: async d => {
    const p = P(d.pid);
    const e = p.expenses.find(x => x.id === d.id);
    if (!e) return;
    if (!await ask({ title:t('Gider silinsin mi?'), body:e.cat+' · '+tl(e.amount), ok:t('Sil'), danger:true })) return;
    p.expenses = p.expenses.filter(x => x.id !== d.id);
    // Talep faturasına bağlıysa bağlantıyı kopar.
    p.requests.forEach(r => { if (r.invoice && r.invoice.expenseId === d.id) r.invoice.expenseId = null; });
    save(); closeSheet(); render();
  },

  /* ---- çıkış ---- */
  addUnpaidDeduction: d => {
    const p = P(d.pid), due = unpaid(p);
    if (!due.total) return;
    p.moveOut.deductions.push({
      id:uid('k'), kind:'rent', label:t('Ödenmemiş kira'), amount:due.total,
      note: due.months.map(m => monthYear(m.key)+' '+tl(m.owed)).join(', ')
    });
    resetMoveOutApprovals(p);
    save(); render();
  },

  removeDeduction: d => {
    const p = P(d.pid);
    p.moveOut.deductions = p.moveOut.deductions.filter(x => x.id !== d.id);
    resetMoveOutApprovals(p);
    save(); render();
  },

  removeExitShot: d => {
    const p = P(d.pid);
    p.moveOut.rooms[Number(d.i)].shots.splice(Number(d.j), 1);
    resetMoveOutApprovals(p);
    save(); render();
  },

  approveMoveOut: d => {
    const p = P(d.pid), mo = p.moveOut;
    if (ui.role === 'tenant') mo.tenantOk = true; else mo.landlordOk = true;
    const both = mo.tenantOk && mo.landlordOk;
    sysMsg(p, t('Çıkış hesabı {who} tarafından onaylandı', { who: ui.role === 'tenant' ? t('kiracı') : t('mülk sahibi') })+(both ? (' '+t('· iade:')+' ')+tl(moveOutSummary(p).refund) : ''));
    save(); render();
    notify({ title:t('Çıkış hesabı onaylandı'), body: both ? t('İki taraf da onayladı; iade tutarı kesinleşti.') : t('Karşı tarafın onayı bekleniyor.'), icon:'key' });
  },

  cancelMoveOut: async d => {
    if (!await ask({ title:t('Çıkış süreci iptal edilsin mi?'), body:t('Çıkış notları, fotoğraflar ve kesintiler silinir.'), ok:t('İptal et'), danger:true })) return;
    const p = P(d.pid);
    p.moveOut = null;
    sysMsg(p, t('Çıkış süreci iptal edildi'));
    save(); render();
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

  install: async () => { await install(); render(); },

  lang: async d => {
    if (d.v === getLang()) return;
    if (LIVE && backend.live.user) await backend.setProfileLang(d.v).catch(() => {});
    S.lang = d.v;
    save();
    setLang(d.v);          // tercihi kaydeder ve sayfayı yeniden yükler
  },

  /* ---- tur ---- */
  startTour: () => { startTour(); closeSheet(); tourGo(); render(); },
  tourNext: () => { nextStep(); tourGo(); render(); },
  tourPrev: () => { prevStep(); tourGo(); render(); },
  tourEnd: () => { endTour(); render(); }
};

/** Bir kalem değişince iki tarafın da yeniden onaylaması gerekir. */
function resetMoveOutApprovals(p){
  if (!p.moveOut) return;
  p.moveOut.tenantOk = false;
  p.moveOut.landlordOk = false;
}

Object.assign(A, AUTH_ACTIONS);

function openText(title, body){
  ui.text = { title, body };
  openSheet('metin');
}

/* ---------------- formlar ---------------- */

export async function onSubmit(ev){
  const f = ev.target.closest('[data-form]');
  if (!f) return;
  ev.preventDefault();

  const fd = new FormData(f);
  const type = f.dataset.form;
  const p = f.dataset.pid ? P(f.dataset.pid) : null;

  if (AUTH_FORMS.includes(type)) return authSubmit(type, fd, f);
  if (!OPEN_FORMS.has(type) && locked()) return;

  if (type === 'msg'){
    const text = String(fd.get('text') || '').trim();
    if (!text) return;
    pushMsg(p, { from: ui.role, by: ui.role === 'tenant' ? meTenant(p)?.id : undefined, text, at: Date.now() });
    save(); render();
    document.getElementById('msgIn')?.focus();
    if (!LIVE && ui.role === 'tenant'){
      setTimeout(() => {
        pushMsg(p, { from:'landlord', text:t('Tamam, not aldım.'), at: Date.now() });
        save();
        if (current().tab === 'msg') render();
        notify({ title:p.landlord.name, body:t('Tamam, not aldım.'), icon:'chat' }, false);
      }, 2500);
    }
    return;
  }

  if (type === 'newReq'){
    const files = [...(f.querySelector('input[type=file]').files || [])];
    const shots = [];
    for (const file of files.slice(0, 4)){
      const v = await backend.storeFile(p.id, file, { maxSide:720 });
      if (v) shots.push(v);
    }
    const r = {
      id:uid('r'), cat:fd.get('cat'), title:String(fd.get('title')).trim(),
      desc:String(fd.get('desc') || '').trim(), urgency:fd.get('urgency'),
      status:0, cost:'Belirlenmedi', costOk:false, decision:null,
      date: iso(t0()), photos:0, shots,
      log:[{ at:Date.now(), text:t('Talep açıldı') }]
    };
    p.requests.unshift(r);
    sysMsg(p, (t('Yeni talep açıldı:')+' ')+r.title);
    save();
    go(ui.role === 'tenant' ? '/kiraci/talepler' : '/mulk-sahibi/mulk/'+p.id+'/talep', { replace:true });
    render();
    notify({ title:t('Talep gönderildi'), body:t('Mülk sahibine bildirildi. Durum değiştikçe haber vereceğiz.'), icon:'wrench' });
    return;
  }

  if (type === 'pay'){
    const key = f.dataset.key;
    const file = f.querySelector('input[type=file]').files[0];
    if (!file) return;
    const amount = Math.max(0, Number(fd.get('amount')) || 0);
    const prev = p.pay[key];
    const already = prev && prev.status === 'partial' ? Number(prev.amount) || 0 : 0;
    const total = already + amount;
    const due = expectedAt(p, key);

    const rec = {
      status: total < due ? 'partial' : 'review',
      date: String(fd.get('date') || iso(t0())),
      amount: total,
      receipt: file.name,
      note: String(fd.get('note') || '').trim() || undefined
    };
    // Görsel küçültülür; gerçek hesapta PDF dahil dosya depoya yüklenir.
    const stored = await backend.storeFile(p.id, file);
    if (stored) rec.photo = stored;

    p.pay[key] = rec;
    sysMsg(p, monthYear(key)+(' '+t('kirası için dekont yüklendi'))+(rec.status === 'partial' ? (' '+t('(kısmi:')+' ')+tl(total)+')' : ''));
    save();
    closeSheet();
    render();
    notify({
      title: rec.status === 'partial' ? t('Kısmi ödeme kaydedildi') : t('Dekont yüklendi'),
      body: rec.status === 'partial'
        ? tl(due - total)+(' '+t('bakiye görünüyor; kalanı yükleyince onaya gider.'))
        : t('Mülk sahibinin onayı bekleniyor. Onaylanınca haber vereceğiz.'),
      icon:'card'
    });
    return;
  }

  if (type === 'reject'){
    const key = f.dataset.key, rec = p.pay[key];
    if (!rec) return;
    const note = String(fd.get('note') || '').trim();
    rec.status = 'rejected';
    rec.rejectReason = t(String(fd.get('reason'))) + (note ? ' · '+note : '');
    sysMsg(p, t('{month} dekontu reddedildi: {reason}', { month: monthYear(key), reason: rec.rejectReason }));
    save();
    closeSheet();
    render();
    notify({ title:t('Dekont reddedildi'), body:t('Kiracıya gerekçe iletildi.'), icon:'card' });
    return;
  }

  if (type === 'upload'){
    const file = f.querySelector('input[type=file]').files[0];
    if (!file) return;
    const until = fd.get('until');
    const cat = fd.get('cat');
    const path = LIVE ? await backend.storeFile(p.id, file) : null;
    p.docs.push(Object.assign({ id:uid('d'), cat, name:file.name, at: iso(t0()), until: until || undefined }, path ? { path } : {}));
    if (cat === 'DASK poliçesi' && until) p.dask = until;
    sysMsg(p, cat+(' '+t('yüklendi:')+' ')+file.name);
    save();
    closeSheet();
    render();
    notify({ title:t('Belge yüklendi'), body: cat + (until ? ' · '+fmtFull(parse(until))+(' '+t('için hatırlatma kuruldu')) : ''), icon:'doc' });
    return;
  }

  if (type === 'room'){
    const n = String(fd.get('n') || '').trim();
    if (!n) return;
    p.inspect.rooms.push({ n, photos:0, shots:[], note:'' });
    p.inspect.tenantOk = false;
    p.inspect.landlordOk = false;
    save(); render();
    return;
  }

  if (type === 'addProp'){
    const id = uid('p'), today = t0();
    const name = String(fd.get('name')).trim();
    const ptype = String(fd.get('type') || 'Konut');
    const lessee = lesseeFrom(fd);
    const rent = Number(fd.get('rent')) || 0;
    const phone = String(fd.get('phone') || '');
    S.props[id] = {
      id, type:ptype, area:null, company:lessee.company, stopaj:lessee.stopaj, depositKind:'Nakit',
      name, addr:String(fd.get('addr')).trim(),
      // Gerçek hesapta kiracı davetle katılır; demoda yer tutucu eklenir.
      tenants: LIVE ? [] : [{ id:uid('t'), name:'Davet bekleniyor', phone, email:'' }],
      landlord: LIVE ? { name: backend.live.profile?.name || t('Mülk sahibi'), phone: backend.live.profile?.phone || '' } : (S.order.length ? P(S.order[0]).landlord : { name:t('Mülk sahibi'), phone:'' }),
      ownerId: LIVE ? backend.live.user?.id : undefined,
      rent, dueDay: Number(fd.get('due')) || 1,
      rentHistory:[{ from: iso(today), amount: rent, note:t('Sözleşme başlangıcı') }],
      expenses:[], value:null, moveOut:null,
      aidat:0, aidatPayer:'Kiracı', deposit:0, depositNote:'—',
      startDate: iso(today), contractEnd: iso(new Date(today.getFullYear()+1, today.getMonth(), today.getDate())),
      // DASK yalnızca konutta zorunlu; işyerinde tarih girilirse hatırlatılır.
      dask: ptype === 'Konut' ? iso(new Date(today.getFullYear()+1, today.getMonth(), today.getDate())) : null,
      bills:[], pay:{}, requests:[], msgs:[], docs:[],
      inspect:{ tenantOk:false, landlordOk:false, rooms:(AREA_TEMPLATES[ptype] || AREA_TEMPLATES['Konut']).map(n => ({ n:t(n), photos:0, shots:[], note:'' })) },
      renewal:null
    };
    S.order.push(id);
    ui.newPropType = null;
    save();
    go('/mulk-sahibi/mulk/'+id, { replace:true });
    render();

    if (LIVE){
      // Ev sunucuya yazılınca kiracı için davet kodu üretilir.
      try {
        const code = await backend.createInvite(id, { name:'', email:'', phone });
        openSheet('davet-paylas', { pid:id, code });
      } catch(e){ notify({ title:t('Davet oluşturulamadı'), body: backend.humanError(e), icon:'home' }, false); }
      return;
    }

    const ph = phone.replace(/\D/g, '');
    notify({
      title:t('Mülk eklendi'), body:t('Kiracıya davet linkini gönder.'), icon:'home',
      actions:[{ label:t('WhatsApp ile davet et'), run:() => {
        const num = ph ? '9' + ph.replace(/^9/, '') : '';
        window.open('https://wa.me/'+num+'?text='+encodeURIComponent((t('Merhaba,')+' ')+name+(' '+t('için Kiracım’da ortak panelimize katılır mısın? [davet linki]'))), '_blank', 'noopener');
      } }]
    });
    return;
  }

  if (type === 'addTenant'){
    const name = String(fd.get('name')).trim();
    const email = String(fd.get('email') || '').trim();
    const phone = String(fd.get('phone') || '').trim();
    if (LIVE){
      try {
        const code = await backend.createInvite(p.id, { name, email, phone });
        closeSheet();
        setTimeout(() => openSheet('davet-paylas', { pid:p.id, code }), 60);
      } catch(e){ notify({ title:t('Davet oluşturulamadı'), body: backend.humanError(e), icon:'home' }, false); }
      return;
    }
    p.tenants.push({ id:uid('t'), name, email, phone });
    sysMsg(p, name+(' '+t('mülke kiracı olarak eklendi')));
    save(); closeSheet(); render();
    setTimeout(() => openSheet('davet-paylas', { pid:p.id, code:'DEMO' + String(Math.floor(Math.random() * 9000) + 1000) }), 60);
    return;
    const digits = phone.replace(/\D/g, '');
    notify({
      title:t('Kiracı eklendi'),
      body: email ? name+(' '+t('için davet')+' ')+email+(' '+t('adresine gönderilecek.')) : name+(' '+t('eklendi. Davet bağlantısını paylaşabilirsin.')),
      icon:'home',
      actions: digits ? [{ label:t('WhatsApp ile davet et'), run:() => window.open('https://wa.me/9'+digits.replace(/^9/, '')+'?text='+encodeURIComponent((t('Merhaba,')+' ')+p.name+(' '+t('için Kiracım’da ortak panelimize katılır mısın? [davet linki]'))), '_blank', 'noopener') }] : undefined
    });
    return;
  }

  if (type === 'quote'){
    const r = reqOf(p, f.dataset.id);
    const q = { id:uid('q'), vendor:String(fd.get('vendor')).trim(), phone:String(fd.get('phone') || '').trim(),
      amount:Number(fd.get('amount')) || 0, note:String(fd.get('note') || '').trim(), chosen:false };
    r.quotes = r.quotes || [];
    r.quotes.push(q);
    logReq(r, (t('Teklif eklendi:')+' ')+q.vendor+' · '+tl(q.amount));
    save(); closeSheet(); render();
    return;
  }

  if (type === 'invoice'){
    const r = reqOf(p, f.dataset.id);
    const amount = Number(fd.get('amount')) || 0;
    const date = String(fd.get('date'));
    const file = f.querySelector('input[type=file]').files[0];
    let expenseId = null;
    if (fd.get('toExpense') && r.cost !== 'Kiracı'){
      expenseId = uid('e');
      p.expenses = p.expenses || [];
      p.expenses.push({
        id:expenseId, cat:'Tamir ve bakım', amount: r.cost === 'Paylaşımlı' ? Math.round(amount / 2) : amount,
        date, note: r.title + (r.cost === 'Paylaşımlı' ? (' '+t('(yarı pay)')) : ''), reqId:r.id
      });
    }
    const path = file && LIVE ? await backend.storeFile(p.id, file) : null;
    r.invoice = Object.assign({ amount, date, name: file ? file.name : 'fatura', expenseId }, path ? { path } : {});
    logReq(r, (t('Fatura işlendi:')+' ')+tl(amount));
    sysMsg(p, (t('Talep faturası:')+' ')+r.title+' · '+tl(amount));
    save(); closeSheet(); render();
    notify({ title:t('Fatura kaydedildi'), body: expenseId ? t('Gider defterine de işlendi.') : t('Gider defterine eklenmedi.'), icon:'doc' }, false);
    return;
  }

  if (type === 'expense'){
    p.expenses = p.expenses || [];
    const data = { cat:String(fd.get('cat')), amount:Number(fd.get('amount')) || 0, date:String(fd.get('date')), note:String(fd.get('note') || '').trim() };
    const id = f.dataset.id;
    if (id) Object.assign(p.expenses.find(e => e.id === id), data);
    else p.expenses.push(Object.assign({ id:uid('e') }, data));
    ui.expenseYear = data.date.slice(0, 4);
    save(); closeSheet(); render();
    notify({ title: id ? t('Gider güncellendi') : t('Gider eklendi'), body:data.cat+' · '+tl(data.amount), icon:'chart' }, false);
    return;
  }

  if (type === 'startMoveOut'){
    p.moveOut = {
      started: Date.now(), date: String(fd.get('date')),
      rooms: p.inspect.rooms.map(r => ({ n:r.n, note:'', shots:[], condition:'' })),
      deductions: [], tenantOk:false, landlordOk:false, refunded:null
    };
    sysMsg(p, (t('Çıkış süreci başlatıldı ·')+' ')+fmtFull(parse(p.moveOut.date)));
    save(); closeSheet(); render();
    notify({ title:t('Çıkış süreci başladı'), body:t('Odaları birlikte değerlendirip kesintileri onaylayın.'), icon:'key' });
    return;
  }

  if (type === 'deduction'){
    p.moveOut.deductions.push({ id:uid('k'), label:String(fd.get('label')).trim(), amount:Number(fd.get('amount')) || 0, note:String(fd.get('note') || '').trim() });
    resetMoveOutApprovals(p);
    save(); closeSheet(); render();
    return;
  }

  if (type === 'refund'){
    const amount = Number(fd.get('amount')) || 0, date = String(fd.get('date'));
    p.moveOut.refunded = { amount, date };
    sysMsg(p, (t('Depozito iadesi yapıldı:')+' ')+tl(amount));
    save(); closeSheet(); render();
    notify({ title:t('İade kaydedildi'), body:tl(amount)+' · '+fmtFull(parse(date))+t('. Kiracıya bildirildi.'), icon:'key' });
    return;
  }

  if (type === 'editProp'){
    p.name = String(fd.get('name')).trim();
    p.addr = String(fd.get('addr')).trim();
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
    save();
    closeSheet();
    render();
    notify({ title:t('Kaydedildi'), body:p.name+(' '+t('bilgileri güncellendi.')), icon:'home' }, false);
  }
}

/* ---------------- anlık alan değişiklikleri ---------------- */

export function onInput(ev){
  const d = ev.target.dataset || {};
  const n = d.input;
  if (!n) return;
  if (WRITE_INPUTS.has(n) && !billing.canWrite()){ render(); locked(); return; }

  if (n === 'q'){
    ui.q = ev.target.value;
    const pos = ev.target.selectionStart;
    refreshLayer();
    const again = document.getElementById('searchIn');
    if (again){ again.focus(); try { again.setSelectionRange(pos, pos); } catch(e){} }
    return;
  }

  if (n === 'cpi' || n === 'amount'){
    const route = current();
    const p = P(route.params.pid || route.pid || S.myHome);
    ui.renewal[n] = ev.target.value === '' ? null : Number(ev.target.value);
    const out = document.getElementById('maxOut');
    if (!out) return;

    if (ui.renewal.cpi == null){
      out.innerHTML = t('Oranı girince yasal üst sınır burada görünür.');
    } else {
      const max = Math.round(p.rent * (1 + ui.renewal.cpi/100));
      if (n === 'cpi'){
        out.innerHTML = (t('Yasal üst sınır:')+' <b>')+tl(max)+'</b> (+'+tl(max - p.rent)+')';
        const am = document.querySelector('[data-input="amount"]');
        if (am && !ui.renewal.amount) am.value = max;
      } else if (ui.renewal.amount > max){
        out.innerHTML = t('Önerdiğin tutar yasal üst sınırı (')+tl(max)+t(') aşıyor; teklif sınırla gönderilir.');
      } else {
        out.innerHTML = (t('Yasal üst sınır:')+' <b>')+tl(max)+'</b> (+'+tl(max - p.rent)+')';
      }
    }
    const sb = document.querySelector('[data-act="sendRenewal"]');
    if (sb) sb.disabled = ui.renewal.cpi == null;
    return;
  }

  if (n === 'roomNote'){
    P(d.pid).inspect.rooms[Number(d.i)].note = ev.target.value;
    save();
  }

  if (n === 'exitNote'){
    // Onaylar yazarken değil, alan bırakılınca sıfırlanır (bkz. change).
    P(d.pid).moveOut.rooms[Number(d.i)].note = ev.target.value;
    save();
  }
}

export async function onChangeField(ev){
  const d = ev.target.dataset || {};
  const n = d.input;
  if (!n) return;
  if (WRITE_INPUTS.has(n) && !billing.canWrite()){ render(); locked(); return; }

  if (n === 'cost'){
    const p = P(d.pid), r = reqOf(p, d.id);
    r.cost = ev.target.value;
    r.costOk = false;
    logReq(r, (t('Masraf önerisi:')+' ')+t(r.cost));
    sysMsg(p, (t('Masraf önerisi:')+' ')+r.cost+' ('+r.title+')');
    save(); render();
    return;
  }

  if (n === 'set'){
    S.settings[d.k] = Math.max(0, Number(ev.target.value) || 0);
    save(); render();
    return;
  }

  if (n === 'exitNote'){ resetMoveOutApprovals(P(d.pid)); save(); render(); return; }

  if (n === 'exitCond'){
    const p = P(d.pid);
    p.moveOut.rooms[Number(d.i)].condition = ev.target.value;
    resetMoveOutApprovals(p);
    save(); render();
    return;
  }

  if (n === 'exitPhoto'){
    const files = [...(ev.target.files || [])];
    if (!files.length) return;
    const p = P(d.pid), room = p.moveOut.rooms[Number(d.i)];
    for (const file of files.slice(0, 6)){
      const v = await backend.storeFile(d.pid, file, { maxSide:720 });
      if (v) room.shots.push(v);
    }
    resetMoveOutApprovals(p);
    const ok = save();
    render();
    if (!ok) notify({ title:t('Yer kalmadı'), body:t('Tarayıcı depolaması doldu; fotoğraflar kaydedilemedi.'), icon:'cam' }, false);
    return;
  }

  if (n === 'tenantKind'){
    const box = ev.target.closest('form')?.querySelector('[data-company]');
    if (box) box.classList.toggle('hidden', ev.target.value !== TENANT_KINDS[1]);
    return;
  }

  if (n === 'signupRole'){
    // Formu yeniden çizmeden seçimi göster (yazılanlar kaybolmasın).
    ui.signupRole = ev.target.value;
    document.querySelectorAll('.rolecard').forEach(c => c.classList.toggle('on', c.querySelector('input').checked));
    return;
  }

  if (n === 'cameraPick'){
    // Kameradan gelen fotoğrafı formun asıl dosya alanına ekle (zorunlu alan dolmuş olur).
    const shot = ev.target.files && ev.target.files[0];
    const main = ev.target.closest('form')?.elements[d.target];
    if (!shot || !main) return;
    const dt = new DataTransfer();
    if (main.multiple) [...main.files].forEach(f => dt.items.add(f));
    dt.items.add(shot);
    main.files = dt.files;
    announce(t('Fotoğraf eklendi: {name}', { name: shot.name }));
    return;
  }

  if (n === 'appLock'){
    const want = ev.target.checked;
    const ok = await setLock(want);
    if (!ok){
      ev.target.checked = !want;
      notify({ title:t('Kilit açılamadı'), body:t('Cihazda Face ID, parmak izi ya da ekran kilidi tanımlı olmalı.'), icon:'key' }, false);
    }
    return;
  }

  if (n === 'expenseYear'){ ui.expenseYear = ev.target.value; render(); return; }
  if (n === 'reportYear'){ ui.reportYear = ev.target.value; render(); return; }
  if (n === 'noExemption'){ ui.noExemption = ev.target.checked; render(); return; }

  if (n === 'setb'){
    S.settings[d.k] = ev.target.checked;
    save();
    return;
  }

  if (n === 'roomPhoto'){
    const files = [...(ev.target.files || [])];
    if (!files.length) return;
    const room = P(d.pid).inspect.rooms[Number(d.i)];
    room.shots = room.shots || [];
    for (const file of files.slice(0, 6)){
      const v = await backend.storeFile(d.pid, file, { maxSide:720 });
      if (v) room.shots.push(v);
    }
    P(d.pid).inspect.tenantOk = false;
    P(d.pid).inspect.landlordOk = false;
    const ok = save();
    render();
    if (!ok) notify({ title:t('Yer kalmadı'), body:t('Tarayıcı depolaması doldu; fotoğraflar kaydedilemedi.'), icon:'cam' }, false);
    return;
  }

  if (n === 'importData'){
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !parsed.props || !parsed.order || (parsed.v || 1) > VERSION) throw new Error('bad');
      replaceState(migrate(parsed));
      go('/kiraci', { replace:true });
      render();
      notify({ title:t('Veri yüklendi'), body:t('Dosyadaki durum geri yüklendi.'), icon:'doc' }, false);
    } catch(e){
      notify({ title:t('Dosya okunamadı'), body:t('Bu dosya Kiracım verisi gibi görünmüyor.'), icon:'doc' }, false);
    }
    ev.target.value = '';
  }
}
