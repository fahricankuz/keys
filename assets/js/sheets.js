/* Alt sayfalar (sheet'ler). Hangi sheet'in açık olduğu adresten okunur:
   ?s=<ad> — böylece geri tuşu sheet'i kapatır, link paylaşımı sheet'i açar. */

import { t } from './i18n.js';
import { S, ui, CATS, COST_OPTS, STEPS, EXPENSE_CATS, DEDUCTION_PRESETS, PROP_TYPES, DEPOSIT_KINDS, TENANT_KINDS, REQ_SUGGEST, isCommercial, docCatsFor } from './state.js';
import { I, ic } from './icons.js';
import { current } from './router.js';
import { P, period, statusOf, remaining, ST, reminders, otherPerson, rentAt, expectedAt, moveOutSummary } from './logic.js';
import { stopajLine } from './views.js';
import { searchBody, isCurrent, installBlock, langSwitch } from './views.js';
import { esc, opts, tl, fmt, fmtFull, monthYear, parse, iso, t0, daysTo, tm, ago } from './util.js';
import { screenMap } from './router.js';
import { LIVE, CONFIG } from './config.js';
import { access, trialDaysLeft, planPrices, manageUrl, platform, PLAN_LABEL, canPurchaseHere } from './billing.js';
import { isNative, lockEnabled, nativePlatform } from './native.js';
import { live, mediaSrc, inviteLink, markInboxRead, pushState } from './backend.js';
import { isStored, storedPath } from './mapping.js';

function reqOf(p, id){ return p.requests.find(r => r.id === id); }

/** Telefonda doğrudan kamerayı açan düğme; çekilen fotoğraf formdaki dosya alanına eklenir. */
function cameraBtn(target){
  const touch = isNative || matchMedia('(pointer: coarse)').matches;
  if (!touch) return '';
  return '<label class="btn small ghost" style="cursor:pointer;align-self:flex-start">'+ic('cam', 16)+' '+t('Kamerayla çek') +
    '<input type="file" accept="image/*" capture="environment" class="sr" data-input="cameraPick" data-target="'+target+'"></label>';
}

/** Açık sheet'in gövdesi; null dönerse katman boş kalır. */
export function sheetBody(route){
  const name = route.sheet;
  if (!name) return null;
  const pid = route.params.pid || route.pid || S.myHome;
  const p = S.props[pid] ? P(pid) : P(S.myHome);

  switch (name){
    case 'arama': return searchBody();
    case 'harita': return mapSheet(route);
    case 'bildirim': return inboxSheet();
    case 'ayarlar': return settingsSheet();
    case 'yeni-talep': return newReqSheet(p);
    case 'talep': return reqSheet(p, route.params.id || route.reqId);
    case 'belge': return uploadSheet(p, route.params.cat);
    case 'dekont': return receiptSheet(p, route.params.key);
    case 'odeme': return payFormSheet(p, route.params.key);
    case 'red': return rejectSheet(p, route.params.key);
    case 'yenileme': return renewalSheet(p);
    case 'ev-ekle': return addPropSheet();
    case 'ev-duzenle': return editPropSheet(p);
    case 'metin': return textSheet();
    case 'kiraci-ekle': return addTenantSheet(p);
    case 'gider': return expenseSheet(p, route.params.id);
    case 'teklif': return quoteSheet(p, route.params.id);
    case 'fatura': return invoiceSheet(p, route.params.id);
    case 'cikis-baslat': return startMoveOutSheet(p);
    case 'kesinti': return deductionSheet(p);
    case 'iade': return refundSheet(p);
    case 'hesap': return LIVE ? accountSheet() : null;
    case 'davet-paylas': return shareInviteSheet(p, route.params.code || route.params.key);
    case 'abonelik': return subscriptionSheet();
    default: return null;
  }
}

function mapSheet(route){
  const map = screenMap();
  const items = route.role === 'tenant' ? map.tenant : map.landlord;
  return ('<h3>'+t('Ekran haritası')+'</h3>') +
    (LIVE ? '' :
    ('<div class="seg" role="group" aria-label="'+t('Rol')+'" style="margin-bottom:12px">') +
      '<button data-act="nav" data-go="/kiraci" aria-pressed="'+(route.role === 'tenant')+('">'+t('Kiracı')+'</button>') +
      '<button data-act="nav" data-go="/mulk-sahibi" aria-pressed="'+(route.role === 'landlord')+('">'+t('Mülk sahibi')+'</button></div>')) +
    '<div class="maplist">' + items.map(it =>
      '<button class="'+(it.depth ? 'depth' : '')+'" data-act="nav" data-go="'+esc(it.path)+'"' +
      (isCurrent(route, it) ? ' aria-current="true"' : '')+'>'+(it.depth ? '' : ic(it.icon, 17))+esc(it.label)+'</button>').join('') +
    '</div>' +
    (LIVE ? '' : '<button class="btn ghost block" style="margin-top:14px" data-act="startTour">'+ic('flag', 16)+(' '+t('Rehberli tura başla')+'</button>'));
}

function inboxSheet(){
  if (S.inbox.some(n => !n.read)) markInboxRead().catch(() => {});
  S.inbox.forEach(n => { n.read = true; });
  const rem = reminders();
  return ('<div class="row" style="justify-content:space-between"><h3 style="margin:0">'+t('Bildirimler')+'</h3>') +
      (S.inbox.length ? ('<button class="btn small ghost" data-act="clearInbox">'+t('Geçmişi temizle')+'</button>') : '') + '</div>' +
    ('<h2 style="margin:16px 0 4px">'+t('Hatırlatmalar')+'</h2><div class="list">') +
      (rem.length
        ? rem.map(r => '<button class="li" data-act="nav" data-go="'+esc(r.go)+'">' +
            '<div><b>'+esc(r.t)+'</b><div class="muted">'+esc(r.b)+'</div></div>' +
            '<span class="chip '+(r.w > 1 ? 'bad' : 'wait')+('">'+t('Git')+'</span></button>')).join('')
        : ('<div class="muted" style="padding:10px 0">'+t('Şu an hatırlatma yok.')+'</div>')) + '</div>' +
    ('<h2 style="margin:18px 0 4px">'+t('Son olaylar')+'</h2><div class="list">') +
      (S.inbox.length
        ? S.inbox.slice().reverse().map(n => '<div class="li"><div><b>'+esc(n.title)+'</b>' +
            '<div class="muted">'+esc(n.body)+'</div></div>' +
            '<span class="muted" style="flex:none">'+esc(ago(n.at))+'</span></div>').join('')
        : ('<div class="muted" style="padding:10px 0">'+t('Henüz olay yok.')+'</div>')) + '</div>';
}

function settingsSheet(){
  const s = S.settings;
  const previews = ui.role === 'tenant'
    ? [['rent',t('Kira yaklaşıyor')],['reqUpd',t('Talep güncellendi')],['renew',t('Yenileme teklifi')],['evict',t('Tahliye tarihi')]]
    : [['receipt',t('Dekont geldi')],['late',t('Kira gecikti')],['newReq',t('Yeni talep')],['dask',t('DASK bitiyor')]];

  return ('<h3>'+t('Ayarlar')+'</h3>') +
    ('<div class="muted" style="margin-bottom:6px">'+t('Hatırlatma eşikleri')+' ')+(ui.role === 'tenant' ? t('kiracı') : t('mülk sahibi'))+(' '+t('görünümüne uygulanır.')+'</div>') +
    ('<label class="toggle">'+t('Kira günü hatırlatması (gün önce)')+'<input type="number" min="0" max="15" value="')+s.rentDays+'" data-input="set" data-k="rentDays"></label>' +
    ('<label class="toggle">'+t('Sözleşme yenileme (gün önce)')+'<input type="number" min="7" max="120" value="')+s.renewDays+'" data-input="set" data-k="renewDays"></label>' +
    (ui.role === 'landlord' ? ('<label class="toggle">'+t('DASK ve sigorta (gün önce)')+'<input type="number" min="7" max="90" value="')+s.insDays+'" data-input="set" data-k="insDays"></label>' : '') +
    ('<label class="toggle">'+t('Tahliye tarihi (gün önce)')+'<input type="number" min="7" max="180" value="')+s.evictDays+'" data-input="set" data-k="evictDays"></label>' +
    ('<label class="toggle">'+t('Talep güncellemeleri')+'<input type="checkbox" data-input="setb" data-k="reqUpdates"')+(s.reqUpdates ? ' checked' : '')+'></label>' +

    ('<h2 style="margin:18px 0 8px">'+t('Tema')+'</h2><div class="seg" role="group" aria-label="'+t('Tema')+'">') +
      ['system','light','dark'].map((v, i) => '<button data-act="theme" data-v="'+v+'" aria-pressed="'+(S.theme === v)+'">'+[t('Sistem'),t('Açık'),t('Koyu')][i]+'</button>').join('') +
    '</div>' +

    ('<h2 style="margin:18px 0 8px">'+t('Dil')+'</h2>') + langSwitch() +

    (ui.role === 'landlord'
      ? ('<h2 style="margin:18px 0 8px">'+t('Abonelik')+'</h2>') +
        '<button class="btn small ghost block" data-act="sheet" data-s="abonelik">'+esc(subSummary())+'</button>'
      : '') +

    (LIVE
      ? ('<h2 style="margin:18px 0 8px">'+t('Hesap')+'</h2><button class="btn small ghost block" data-act="sheet" data-s="hesap">'+t('Hesap ve bildirim ayarları')+'</button>')
      : ('<h2 style="margin:18px 0 8px">'+t('Bildirimleri dene')+'</h2><div class="grid2">') +
          previews.map(([v, label]) => '<button class="btn small ghost" data-act="preview" data-v="'+v+'">'+label+'</button>').join('') +
        '</div>') +

    (installBlock() ? ('<h2 style="margin:18px 0 8px">'+t('Uygulama')+'</h2>') + installBlock() : '') +
    (isNative
      ? ('<h2 style="margin:18px 0 8px">'+t('Güvenlik')+'</h2>') +
        '<label class="toggle">'+(nativePlatform === 'ios' ? t('Face ID / Touch ID ile kilitle') : t('Parmak izi ya da ekran kilidiyle kilitle')) +
          '<input type="checkbox" data-input="appLock"'+(lockEnabled() ? ' checked' : '')+'></label>' +
        '<div class="muted" style="font-size:12.5px">'+t('Açıldığında ve bir dakikadan uzun arka planda kaldığında kimlik doğrulaması istenir.')+'</div>'
      : '') +
    ('<h2 style="margin:18px 0 8px">'+t('Veri')+'</h2><div class="stack" style="gap:8px">') +
      (LIVE ? '' : '<button class="btn small ghost" data-act="startTour">'+ic('flag', 15)+(' '+t('Rehberli tur')+'</button>')) +
      '<button class="btn small ghost" data-act="sheet" data-s="harita">'+ic('map', 15)+(' '+t('Ekran haritası')+'</button>') +
      '<button class="btn small ghost" data-act="exportData">'+(LIVE ? t('Verilerimi indir (JSON)') : t('Verileri dışa aktar (JSON)'))+'</button>' +
      (LIVE ? '' :
        ('<label class="btn small ghost" style="cursor:pointer">'+t('Veri içe aktar')+'<input type="file" accept="application/json" class="sr" data-input="importData"></label>') +
        ('<button class="btn small danger" data-act="reset">'+t('Demo verisini sıfırla')+'</button>')) +
    '</div>' +
    ('<h2 style="margin:18px 0 8px">'+t('Yardım ve yasal')+'</h2><div class="stack" style="gap:8px">') +
      '<a class="btn small ghost" href="mailto:'+esc(CONFIG.supportEmail)+'">'+ic('chat', 15)+' '+t('Destek: {email}', { email:esc(CONFIG.supportEmail) })+'</a>' +
      '<a class="btn small ghost" href="'+esc(CONFIG.legal.support)+'" target="_blank" rel="noopener">'+t('Sık sorulanlar')+'</a>' +
      '<a class="btn small ghost" href="'+esc(CONFIG.legal.terms)+'" target="_blank" rel="noopener">'+t('Kullanım ve abonelik koşulları')+'</a>' +
      '<a class="btn small ghost" href="'+esc(CONFIG.legal.privacy)+'" target="_blank" rel="noopener">'+t('Gizlilik ve KVKK aydınlatma metni')+'</a>' +
    '</div>' +
    '<p class="foot">'+(LIVE ? t('Verilerin sunucuda, yalnızca mülkün üyelerinin erişebileceği şekilde saklanır.') : t('Veriler yalnızca bu tarayıcıda saklanır.'))+'</p>';
}

function newReqSheet(p){
  return ('<h3>'+t('Yeni talep')+'</h3><form class="stack" data-form="newReq" data-pid="')+p.id+'">' +
    ('<label class="field">'+t('Tür')+'<select name="cat">')+opts(CATS, 'Arıza')+'</select></label>' +
    ('<label class="field">'+t('Başlık')+'<input name="title" required maxlength="80" list="reqSuggest" placeholder="'+t('Ör. Mutfak musluğu damlatıyor')+'"></label>') +
    '<datalist id="reqSuggest">'+(REQ_SUGGEST[p.type] || REQ_SUGGEST['Konut']).map(x => '<option value="'+esc(t(x))+'">').join('')+'</datalist>' +
    '<div class="row" style="flex-wrap:wrap;gap:6px">'+(REQ_SUGGEST[p.type] || REQ_SUGGEST['Konut']).map(x =>
      '<button type="button" class="chip" data-act="suggestTitle" data-v="'+esc(t(x))+'">'+esc(t(x))+'</button>').join('')+'</div>' +
    ('<label class="field">'+t('Açıklama')+'<textarea name="desc" maxlength="600" placeholder="'+t('Ne zamandır sürüyor, nerede, nasıl?')+'"></textarea></label>') +
    ('<label class="field">'+t('Aciliyet')+'<select name="urgency">')+opts(['Normal','Acil'], 'Normal')+'</select></label>' +
    ('<label class="field">'+t('Fotoğraf')+'<input type="file" name="files" accept="image/*" multiple style="padding-top:10px"></label>') + cameraBtn('files') +
    ('<div class="row"><button type="button" class="btn ghost" style="flex:1" data-act="closeSheet">'+t('Vazgeç')+'</button>') +
    ('<button class="btn primary" style="flex:1">'+t('Talebi gönder')+'</button></div></form>');
}

function reqSheet(p, id){
  const r = reqOf(p, id);
  if (!r) return ('<h3>'+t('Talep bulunamadı')+'</h3><button class="btn ghost block" data-act="closeSheet">'+t('Kapat')+'</button>');

  let steps = '';
  for (let i = 0; i < 4; i++){
    steps += '<i class="'+(i <= r.status ? 'on' : '')+'"></i>' + (i < 3 ? '<b class="'+(i < r.status ? 'on' : '')+'"></b>' : '');
  }

  let ctrl = '';
  if (ui.role === 'landlord'){
    if (r.cat === 'Ek talep' && !r.decision)
      ctrl += '<div class="row"><button class="btn primary" style="flex:1" data-act="decide" data-pid="'+p.id+'" data-id="'+r.id+('" data-v="Onaylandı">'+t('Onayla')+'</button>') +
        '<button class="btn ghost" style="flex:1" data-act="decide" data-pid="'+p.id+'" data-id="'+r.id+('" data-v="Reddedildi">'+t('Reddet')+'</button></div>');
    else if (r.status < 3)
      ctrl += '<button class="btn primary block" data-act="advance" data-pid="'+p.id+'" data-id="'+r.id+('">'+t('Durumu ilerlet:')+' ')+t(STEPS[r.status+1])+'</button>';
    if (r.status > 0 && r.cat !== 'Ek talep')
      ctrl += '<button class="btn ghost block" data-act="rewind" data-pid="'+p.id+'" data-id="'+r.id+('">'+t('Bir adım geri al')+'</button>');
    ctrl += ('<label class="field">'+t('Masrafı kim karşılıyor?')+'<select data-input="cost" data-pid="')+p.id+'" data-id="'+r.id+'">'+opts(COST_OPTS, r.cost)+'</select></label>';
  } else {
    if (r.cost !== 'Belirlenmedi' && !r.costOk && r.cat !== 'Ek talep')
      ctrl += ('<div class="note">'+t('Mülk sahibi masrafın')+' <b>')+esc(t(r.cost))+('</b> '+t('tarafından karşılanmasını önerdi.')+'</div>') +
        '<button class="btn primary block" data-act="okCost" data-pid="'+p.id+'" data-id="'+r.id+('">'+t('Masraf paylaşımını onayla')+'</button>');
    if (r.status < 3)
      ctrl += '<button class="btn ghost block" data-act="closeReq" data-pid="'+p.id+'" data-id="'+r.id+('">'+t('Talebi kapat (çözüldü)')+'</button>');
  }

  const shots = (r.shots || []).map((src, j) =>
    '<div class="thumb"><img src="'+esc(mediaSrc(src))+('" alt="'+t('Talep fotoğrafı')+' ')+(j+1)+'"></div>').join('');
  const placeholders = Array.from({ length: Math.min(r.photos || 0, 5) }, () => '<div class="ph">foto</div>').join('');

  const timeline = (r.log || []).slice().reverse().map(e =>
    '<div class="li"><div><b style="font-size:14px">'+esc(e.text)+'</b><div class="muted">'+esc(ago(e.at))+'</div></div></div>').join('');

  return '<div class="label" style="color:var(--accent)">'+esc(t(r.cat))+' · '+esc(t(r.urgency))+' · '+fmtFull(parse(r.date))+'</div>' +
    '<h3 style="margin-top:4px">'+esc(r.title)+'</h3><div class="stack">' +
    '<div class="muted" style="font-size:15px">'+esc(r.desc || t('Açıklama yok.'))+'</div>' +
    (shots || placeholders ? '<div class="thumbs">'+shots+placeholders+'</div>' : '') +
    (r.cat !== 'Ek talep'
      ? '<div><div class="steps">'+steps+'</div><div class="steplbl">'+STEPS.map((s,i) => '<span class="'+(i === r.status ? 'on' : '')+'">'+t(s)+'</span>').join('')+'</div></div>'
      : (r.decision
          ? '<span class="chip '+(r.decision === 'Onaylandı' ? 'ok' : 'bad')+'">'+esc(t(r.decision))+'</span>'
          : ('<span class="chip wait">'+t('Mülk sahibinin kararı bekleniyor')+'</span>'))) +
    ('<div class="kv"><span>'+t('Masraf')+'</span><span>')+esc(t(r.cost))+(r.costOk ? (' '+t('· onaylı')) : r.cost !== 'Belirlenmedi' ? (' '+t('· onay bekliyor')) : '')+'</span></div>' +
    ctrl +
    quotesSection(p, r) +
    (timeline ? ('<section><h2 style="margin-bottom:4px">'+t('Geçmiş')+'</h2><div class="list">')+timeline+'</div></section>' : '') +
    '<button class="btn ghost block" data-act="goMsg" data-pid="'+p.id+('">'+t('Bu talep hakkında yaz')+'</button></div>');
}

function uploadSheet(p, cat){
  return ('<h3>'+t('Belge yükle')+'</h3><form class="stack" data-form="upload" data-pid="')+p.id+'">' +
    ('<label class="field">'+t('Kategori')+'<select name="cat">')+opts(docCatsFor(p), cat || 'Kira sözleşmesi')+'</select></label>' +
    ('<label class="field">'+t('Dosya')+'<input type="file" name="file" accept="application/pdf,image/*" required style="padding-top:10px"></label>') +
    ('<label class="field">'+t('Bitiş veya tahliye tarihi (varsa)')+'<input type="date" name="until"></label>') +
    ('<div class="muted">'+t('Tarih girersen, yaklaştığında iki tarafa da hatırlatma gider. Tahliye taahhütnamesi ve sigorta poliçeleri için önerilir.')+'</div>') +
    ('<div class="row"><button type="button" class="btn ghost" style="flex:1" data-act="closeSheet">'+t('Vazgeç')+'</button>') +
    ('<button class="btn primary" style="flex:1">'+t('Yükle')+'</button></div></form>');
}

function receiptSheet(p, key){
  const rc = p.pay[key] || {};
  const st = statusOf(p, key);
  return '<h3>'+monthYear(key)+' dekontu</h3><div class="stack">' +
    receiptPreview(rc) +
    ('<div class="kv"><span>'+t('Tutar')+'</span><span>')+tl(rc.amount != null ? rc.amount : expectedAt(p, key))+'</span></div>' +
    ('<div class="kv"><span>'+t('Beklenen')+'</span><span>')+tl(expectedAt(p, key))+'</span></div>' +
    (p.stopaj ? '<div class="muted">'+esc(stopajLine(p, key))+'</div>' : '') +
    ('<div class="kv"><span>'+t('Ödeme tarihi')+'</span><span>')+(rc.date ? fmtFull(parse(rc.date)) : '—')+'</span></div>' +
    ('<div class="kv"><span>'+t('Durum')+'</span><span>')+esc((ST[st] || ST.pending)[0])+'</span></div>' +
    (rc.note ? ('<div class="kv"><span>'+t('Not')+'</span><span>')+esc(rc.note)+'</span></div>' : '') +
    (rc.rejectReason ? ('<div class="note warn">'+t('Red gerekçesi:')+' ')+esc(rc.rejectReason)+'</div>' : '') +
    (ui.role === 'landlord' && (st === 'review' || st === 'partial')
      ? '<div class="row"><button class="btn primary" style="flex:1" data-act="approvePay" data-pid="'+p.id+'" data-key="'+key+('">'+t('Onayla')+'</button>') +
        '<button class="btn ghost" style="flex:1" data-act="sheet" data-s="red" data-pid="'+p.id+'" data-key="'+key+('">'+t('Reddet')+'</button></div>')
      : '') +
    (ui.role === 'tenant' && (st === 'rejected' || st === 'late' || st === 'pending')
      ? '<button class="btn primary block" data-act="sheet" data-s="odeme" data-pid="'+p.id+'" data-key="'+key+('">'+t('Dekont yükle')+'</button>')
      : '') +
    '</div>';
}

function payFormSheet(p, key){
  const k = key || period(p).key;
  const rec = p.pay[k] || {};
  const paid = rec.status === 'partial' ? Number(rec.amount) || 0 : 0;
  const due = expectedAt(p, k);
  const suggest = Math.max(0, due - paid);
  return '<h3>'+monthYear(k)+(' '+t('ödemesi')+'</h3><form class="stack" data-form="pay" data-pid="')+p.id+'" data-key="'+k+'">' +
    ('<div class="kv"><span>'+(p.stopaj ? t('Hesaba yatacak tutar') : t('Bu ayın kirası'))+'</span><span>')+tl(due)+'</span></div>' +
    (p.stopaj ? '<div class="muted">'+esc(stopajLine(p, k))+'</div>' : '') +
    (paid ? ('<div class="kv"><span>'+t('Şimdiye kadar ödenen')+'</span><span>')+tl(paid)+'</span></div>' : '') +
    ('<label class="field">'+t('Ödenen tutar (₺)')+'<input name="amount" type="number" min="0" step="1" required value="')+suggest+'" inputmode="numeric"></label>' +
    ('<label class="field">'+t('Ödeme tarihi')+'<input name="date" type="date" required value="')+iso(t0())+'" max="'+iso(t0())+'"></label>' +
    ('<label class="field">'+t('Dekont (görsel ya da PDF)')+'<input type="file" name="file" accept="image/*,application/pdf" required style="padding-top:10px"></label>') + cameraBtn('file') +
    ('<label class="field">'+t('Not (isteğe bağlı)')+'<input name="note" maxlength="120" placeholder="'+t('Ör. havale açıklaması')+'"></label>') +
    ('<div class="muted">'+t('Tutar kiranın altındaysa ödeme kısmi olarak işaretlenir ve kalan bakiye takip edilir.')+'</div>') +
    ('<div class="row"><button type="button" class="btn ghost" style="flex:1" data-act="closeSheet">'+t('Vazgeç')+'</button>') +
    ('<button class="btn primary" style="flex:1">'+t('Gönder')+'</button></div></form>');
}

function rejectSheet(p, key){
  return ('<h3>'+t('Dekontu reddet')+'</h3><form class="stack" data-form="reject" data-pid="')+p.id+'" data-key="'+key+'">' +
    ('<div class="muted">'+t('Kiracıya gerekçe iletilir; ödeme yeniden yüklenebilir.')+'</div>') +
    ('<label class="field">'+t('Gerekçe')+'<select name="reason">')+opts(['Tutar eksik','Dekont okunmuyor','Farklı hesaba yatmış','Tarih uyuşmuyor','Diğer'], 'Tutar eksik')+'</select></label>' +
    ('<label class="field">'+t('Açıklama (isteğe bağlı)')+'<input name="note" maxlength="120"></label>') +
    ('<div class="row"><button type="button" class="btn ghost" style="flex:1" data-act="closeSheet">'+t('Vazgeç')+'</button>') +
    ('<button class="btn danger" style="flex:1">'+t('Reddet')+'</button></div></form>');
}

function renewalSheet(p){
  const cpi = ui.renewal.cpi == null ? '' : ui.renewal.cpi;
  const max = cpi === '' ? 0 : Math.round(p.rent * (1 + Number(cpi)/100));
  return ('<h3>'+t('Kira artışı hesaplama')+'</h3><div class="stack">') +
    ('<div class="kv"><span>'+t('Mevcut kira')+'</span><span>')+tl(p.rent)+'</span></div>' +
    ('<div class="kv"><span>'+t('Sözleşme bitişi')+'</span><span>')+fmtFull(parse(p.contractEnd))+'</span></div>' +
    ('<label class="field">'+t('Son 12 aylık TÜFE ortalaması (%)')) +
      '<input type="number" step="0.01" min="0" max="200" value="'+cpi+('" data-input="cpi" placeholder="'+t('TÜİK’in açıkladığı oran')+'" inputmode="decimal"></label>') +
    '<div class="note" id="maxOut">' +
      (cpi === '' ? t('Oranı girince yasal üst sınır burada görünür.') : (t('Yasal üst sınır:')+' <b>')+tl(max)+'</b> (+'+tl(max - p.rent)+')') + '</div>' +
    (ui.role === 'landlord'
      ? ('<label class="field">'+t('Önereceğin kira')+'<input type="number" min="0" value="')+(ui.renewal.amount || max || '')+'" data-input="amount" inputmode="numeric"></label>' +
        '<button class="btn primary block" data-act="sendRenewal" data-pid="'+p.id+'"'+(cpi === '' ? ' disabled' : '')+('>'+t('Teklifi kiracıya gönder')+'</button>')
      : '') +
    ('<div class="muted">'+t('Oranı TÜİK’in resmi açıklamasından kontrol et. Taraflar daha düşük bir artışta anlaşabilir.')+'</div></div>');
}

/** Kiracı türü ve şirket bilgileri — ekleme ve düzenleme formlarında ortak. */
function lesseeFields(p){
  const company = p && p.company;
  const kind = company ? TENANT_KINDS[1] : TENANT_KINDS[0];
  return ('<label class="field">'+t('Kiracı türü')+'<select name="tenantKind" data-input="tenantKind">')+opts(TENANT_KINDS, kind)+'</select></label>' +
    '<div class="stack'+(company ? '' : ' hidden')+'" data-company style="gap:12px">' +
      ('<label class="field">'+t('Unvan')+'<input name="coName" maxlength="120" value="')+esc(company?.name || '')+('" placeholder="'+t('Ör. Örnek Ticaret Ltd. Şti.')+'"></label>') +
      ('<div class="grid2"><label class="field">'+t('Vergi no')+'<input name="coTaxNo" maxlength="11" inputmode="numeric" value="')+esc(company?.taxNo || '')+'"></label>' +
      ('<label class="field">'+t('Vergi dairesi')+'<input name="coTaxOffice" maxlength="60" value="')+esc(company?.taxOffice || '')+'"></label></div>' +
      ('<label class="toggle" style="border-top:0;padding:4px 0">'+t('Kiracı kira stopajı keser (%20)')+'<input type="checkbox" name="stopaj"')+(!p || p.stopaj || !company ? ' checked' : '')+'></label>' +
      ('<div class="muted">'+t('Şirket ya da esnaf kiracı, kiranın %20’sini keserek vergi dairesine öder; sana net tutar yatar. Kira alanına sözleşmedeki brüt tutarı yaz.')+'</div>') +
    '</div>';
}

function addPropSheet(){
  const type = ui.newPropType || 'Konut';
  return ('<h3>'+t('Mülk ekle')+'</h3><form class="stack" data-form="addProp">') +
    ('<div class="seg" role="group" aria-label="'+t('Mülk tipi')+'">') +
      PROP_TYPES.map(tp => '<button type="button" data-act="newPropType" data-v="'+esc(tp)+'" aria-pressed="'+(tp === type)+'">'+esc(t(tp))+'</button>').join('') + '</div>' +
    '<input type="hidden" name="type" value="'+esc(type)+'">' +
    ('<label class="field">'+t('Mülk adı')+'<input name="name" required maxlength="60" placeholder="'+(type === 'Konut' ? t('Ör. Kadıköy 3+1') : type === 'Ofis' ? t('Ör. Levent ofis') : type === 'Mağaza' ? t('Ör. Bağdat Cd. mağaza') : t('Ör. Hadımköy depo'))+'"></label>') +
    ('<label class="field">'+t('Adres')+'<input name="addr" required maxlength="120"></label>') +
    ('<div class="grid2"><label class="field">'+t('Aylık kira (₺)')+'<input name="rent" type="number" min="0" required inputmode="numeric"></label>') +
    ('<label class="field">'+t('Ödeme günü')+'<input name="due" type="number" min="1" max="28" value="1" inputmode="numeric"></label></div>') +
    (type !== 'Konut' ? lesseeFields(null) : '') +
    ('<label class="field">'+t('Kiracının telefonu')+'<input name="phone" type="tel" placeholder="05__ ___ __ __"></label>') +
    ('<div class="muted">'+t('Kaydettiğinde kiracıya WhatsApp ile davet linki hazırlanır; katıldığında mülk iki taraflı panele dönüşür.')+'</div>') +
    ('<div class="row"><button type="button" class="btn ghost" style="flex:1" data-act="closeSheet">'+t('Vazgeç')+'</button>') +
    ('<button class="btn primary" style="flex:1">'+t('Kaydet ve davet et')+'</button></div></form>');
}

function editPropSheet(p){
  return ('<h3>'+t('Mülk bilgileri')+'</h3><form class="stack" data-form="editProp" data-pid="')+p.id+'">' +
    ('<label class="field">'+t('Mülk adı')+'<input name="name" required maxlength="60" value="')+esc(p.name)+'"></label>' +
    ('<label class="field">'+t('Adres')+'<input name="addr" required maxlength="120" value="')+esc(p.addr)+'"></label>' +
    ('<div class="grid2"><label class="field">'+t('Mülk tipi')+'<select name="type">')+opts(PROP_TYPES, p.type)+'</select></label>' +
    ('<label class="field">'+t('Alan (m²)')+'<input name="area" type="number" min="0" value="')+(p.area || '')+('" placeholder="'+t('İsteğe bağlı')+'"></label></div>') +
    ('<div class="grid2"><label class="field">'+(p.stopaj ? t('Aylık brüt kira (₺)') : t('Aylık kira (₺)'))+'<input name="rent" type="number" min="0" required value="')+p.rent+'"></label>' +
    ('<label class="field">'+t('Ödeme günü')+'<input name="due" type="number" min="1" max="28" value="')+p.dueDay+'"></label></div>' +
    lesseeFields(p) +
    ('<div class="grid2"><label class="field">'+t('Aidat (₺)')+'<input name="aidat" type="number" min="0" value="')+p.aidat+'"></label>' +
    ('<label class="field">'+t('Aidatı ödeyen')+'<select name="aidatPayer">')+opts(['Kiracı','Mülk sahibi'], p.aidatPayer)+'</select></label></div>' +
    ('<div class="grid2"><label class="field">'+t('Depozito türü')+'<select name="depositKind">')+opts(DEPOSIT_KINDS, p.depositKind || 'Nakit')+'</select></label>' +
    ('<label class="field">'+t('Depozito (₺)')+'<input name="deposit" type="number" min="0" value="')+p.deposit+'"></label></div>' +
    ('<label class="field">'+t('Depozito notu')+'<input name="depositNote" maxlength="120" value="')+esc(p.depositNote || '')+('" placeholder="'+t('Ör. banka, mektup tutarı ve vadesi')+'"></label>') +
    ('<label class="field">'+t('Tahmini değer (₺)')+'<input name="value" type="number" min="0" value="')+(p.value || '')+('" placeholder="'+t('İsteğe bağlı')+'"></label>') +
    ('<div class="muted">'+t('Kira tutarını değiştirirsen bugünden geçerli yeni bir dönem olarak kira geçmişine eklenir. Değer, net getiri oranı için kullanılır.')+'</div>') +
    ('<div class="grid2"><label class="field">'+t('Sözleşme bitişi')+'<input name="contractEnd" type="date" value="')+esc(p.contractEnd)+'"></label>' +
    ('<label class="field">'+(isCommercial(p) ? t('DASK bitişi (varsa)') : t('DASK bitişi'))+'<input name="dask" type="date" value="')+esc(p.dask || '')+'"></label></div>' +
    (isCommercial(p) ? ('<div class="muted">'+t('DASK yalnızca konutta zorunludur. İşyeri sigortasını Belgeler’e bitiş tarihiyle yüklersen hatırlatma kurulur.')+'</div>') : '') +

    ('<div class="row"><button type="button" class="btn ghost" style="flex:1" data-act="closeSheet">'+t('Vazgeç')+'</button>') +
    ('<button class="btn primary" style="flex:1">'+t('Kaydet')+'</button></div>') +
    (S.order.length > 1 ? '<button type="button" class="btn small danger block" data-act="removeProp" data-pid="'+p.id+('">'+t('Bu mülkü kaldır')+'</button>') : '') +
    '</form>';
}

function textSheet(){
  const txt = ui.text || { title:t('Metin'), body:'' };
  return '<h3>'+esc(txt.title)+'</h3><div class="stack">' +
    '<textarea id="txtOut" readonly style="min-height:220px;border-radius:12px;border:1px solid var(--line);background:var(--bg);padding:12px;font-size:14px">'+esc(txt.body)+'</textarea>' +
    ('<div class="row"><button class="btn primary" style="flex:1" data-act="copyText">'+t('Kopyala')+'</button>') +
    ('<button class="btn ghost" style="flex:1" data-act="downloadText">'+t('İndir')+'</button></div></div>');
}

/* ---------------- teklifler ve fatura ---------------- */

function quotesSection(p, r){
  const quotes = r.quotes || [];
  const landlord = ui.role === 'landlord';
  if (!quotes.length && !landlord && !r.invoice) return '';
  return '<section class="card stack" style="gap:8px">' +
    ('<div class="row" style="justify-content:space-between"><h2>'+t('Usta ve teklifler')+'</h2>') +
      (landlord && r.status < 3 ? '<button class="btn small ghost" data-act="sheet" data-s="teklif" data-pid="'+p.id+'" data-id="'+r.id+'">'+ic('plus', 15)+(' '+t('Teklif')+'</button>') : '') + '</div>' +
    (quotes.length
      ? '<div class="list">' + quotes.slice().sort((a, b) => a.amount - b.amount).map(q =>
          '<div class="li"><div style="min-width:0"><b>'+esc(q.vendor)+'</b>' +
            '<div class="muted">'+tl(q.amount)+(q.note ? ' · '+esc(q.note) : '')+'</div></div>' +
          '<div class="row" style="gap:6px">' +
            (q.chosen ? ('<span class="chip ok">'+t('Seçildi')+'</span>')
              : landlord && r.status < 3 ? '<button class="btn small ghost" data-act="chooseQuote" data-pid="'+p.id+'" data-id="'+r.id+'" data-q="'+esc(q.id)+('">'+t('Seç')+'</button>') : '') +
            (q.phone ? '<a class="iconbtn sm" href="tel:'+esc(q.phone)+'" aria-label="'+esc(t('{name} ara|telefon', { name:q.vendor }))+'">'+ic('phone', 16)+'</a>' : '') +
            (landlord && !q.chosen ? '<button class="iconbtn sm" data-act="removeQuote" data-pid="'+p.id+'" data-id="'+r.id+'" data-q="'+esc(q.id)+'" aria-label="'+esc(q.vendor)+' teklifini sil">'+ic('x', 16)+'</button>' : '') +
          '</div></div>').join('') + '</div>'
      : ('<div class="muted">'+t('Henüz teklif yok. Ustalardan aldığın fiyatları ekleyip karşılaştırabilirsin.')+'</div>')) +
    (r.invoice
      ? ('<div class="note">'+t('Fatura:')+' ')+tl(r.invoice.amount)+' · ' +
          (r.invoice.path ? '<a class="doclink" href="'+esc(mediaSrc(r.invoice.path))+'" target="_blank" rel="noopener">'+esc(r.invoice.name)+'</a>' : esc(r.invoice.name)) +
          ' · '+fmtFull(parse(r.invoice.date)) +
          (r.invoice.expenseId ? (' '+t('· gider defterine işlendi')) : '')+'</div>'
      : landlord ? '<button class="btn small ghost" data-act="sheet" data-s="fatura" data-pid="'+p.id+'" data-id="'+r.id+('">'+t('Fatura ekle')+'</button>') : '') +
    '</section>';
}

function quoteSheet(p, reqId){
  const r = p.requests.find(x => x.id === reqId);
  if (!r) return null;
  return ('<h3>'+t('Teklif ekle')+'</h3><form class="stack" data-form="quote" data-pid="')+p.id+'" data-id="'+r.id+'">' +
    '<div class="muted">'+esc(r.title)+'</div>' +
    ('<label class="field">'+t('Usta ya da firma')+'<input name="vendor" required maxlength="60"></label>') +
    ('<div class="grid2"><label class="field">'+t('Tutar (₺)')+'<input name="amount" type="number" min="0" required inputmode="numeric"></label>') +
    ('<label class="field">'+t('Telefon')+'<input name="phone" type="tel"></label></div>') +
    ('<label class="field">'+t('Not')+'<input name="note" maxlength="120" placeholder="'+t('Ör. parça dahil, 2 gün')+'"></label>') +
    ('<div class="row"><button type="button" class="btn ghost" style="flex:1" data-act="closeSheet">'+t('Vazgeç')+'</button>') +
    ('<button class="btn primary" style="flex:1">'+t('Ekle')+'</button></div></form>');
}

function invoiceSheet(p, reqId){
  const r = p.requests.find(x => x.id === reqId);
  if (!r) return null;
  const q = (r.quotes || []).find(x => x.chosen);
  const landlordPays = r.cost === 'Mülk sahibi' || r.cost === 'Paylaşımlı';
  return ('<h3>'+t('Fatura ekle')+'</h3><form class="stack" data-form="invoice" data-pid="')+p.id+'" data-id="'+r.id+'">' +
    '<div class="muted">'+esc(r.title)+(q ? ' · '+esc(q.vendor) : '')+'</div>' +
    ('<div class="grid2"><label class="field">'+t('Tutar (₺)')+'<input name="amount" type="number" min="0" required value="')+(q ? q.amount : '')+'"></label>' +
    ('<label class="field">'+t('Tarih')+'<input name="date" type="date" required value="')+iso(t0())+'"></label></div>' +
    ('<label class="field">'+t('Fatura dosyası')+'<input type="file" name="file" accept="application/pdf,image/*" style="padding-top:10px"></label>') +
    ('<label class="toggle">'+t('Gider defterine ekle'))+(r.cost === 'Paylaşımlı' ? (' '+t('(yarısı)')) : '') +
      '<input type="checkbox" name="toExpense"'+(landlordPays ? ' checked' : '')+'></label>' +
    ('<div class="muted">'+t('Masraf:')+' ')+esc(t(r.cost))+(t('. Masraf kiracıdaysa gider defterine eklenmez.')+'</div>') +
    ('<div class="row"><button type="button" class="btn ghost" style="flex:1" data-act="closeSheet">'+t('Vazgeç')+'</button>') +
    ('<button class="btn primary" style="flex:1">'+t('Kaydet')+'</button></div></form>');
}

/* ---------------- kiracılar ---------------- */

function addTenantSheet(p){
  return ('<h3>'+t('Kiracı ekle')+'</h3><form class="stack" data-form="addTenant" data-pid="')+p.id+'">' +
    '<div class="muted">'+esc(p.name)+(' '+t('için yeni bir kiracı hesabı. Aynı mülkün kiracıları ödemeleri, talepleri ve yazışmaları birlikte görür.')+'</div>') +
    ('<label class="field">'+t('Ad soyad')+'<input name="name" required maxlength="60"></label>') +
    ('<label class="field">'+t('E-posta')+'<input name="email" type="email" placeholder="'+t('Davet bu adrese gider')+'"></label>') +
    ('<label class="field">'+t('Telefon')+'<input name="phone" type="tel" placeholder="05__ ___ __ __"></label>') +
    ('<div class="row"><button type="button" class="btn ghost" style="flex:1" data-act="closeSheet">'+t('Vazgeç')+'</button>') +
    ('<button class="btn primary" style="flex:1">'+t('Ekle ve davet et')+'</button></div></form>');
}

/* ---------------- giderler ---------------- */

function expenseSheet(p, id){
  const e = id ? (p.expenses || []).find(x => x.id === id) : null;
  return '<h3>'+(e ? t('Gideri düzenle') : t('Gider ekle'))+'</h3><form class="stack" data-form="expense" data-pid="'+p.id+'"'+(e ? ' data-id="'+esc(e.id)+'"' : '')+'>' +
    ('<label class="field">'+t('Kategori')+'<select name="cat">')+opts(EXPENSE_CATS, e ? e.cat : EXPENSE_CATS[0])+'</select></label>' +
    ('<div class="grid2"><label class="field">'+t('Tutar (₺)')+'<input name="amount" type="number" min="0" required value="')+(e ? e.amount : '')+'" inputmode="numeric"></label>' +
    ('<label class="field">'+t('Tarih')+'<input name="date" type="date" required value="')+(e ? esc(e.date) : iso(t0()))+'"></label></div>' +
    ('<label class="field">'+t('Açıklama')+'<input name="note" maxlength="120" value="')+(e ? esc(e.note || '') : '')+'"></label>' +
    ('<div class="row"><button type="button" class="btn ghost" style="flex:1" data-act="closeSheet">'+t('Vazgeç')+'</button>') +
    ('<button class="btn primary" style="flex:1">'+t('Kaydet')+'</button></div>') +
    (e ? '<button type="button" class="btn small danger block" data-act="removeExpense" data-pid="'+p.id+'" data-id="'+esc(e.id)+('">'+t('Gideri sil')+'</button>') : '') +
    '</form>';
}

/* ---------------- çıkış ---------------- */

function startMoveOutSheet(p){
  return ('<h3>'+t('Çıkış sürecini başlat')+'</h3><form class="stack" data-form="startMoveOut" data-pid="')+p.id+'">' +
    ('<div class="muted">'+t('Giriş tutanağındaki')+' ')+p.inspect.rooms.length+(' '+t('alan karşılaştırma için kopyalanır. Kiracı ve mülk sahibi alanları birlikte değerlendirir, kesintiler iki tarafın onayından sonra kesinleşir.')+'</div>') +
    ('<label class="field">'+t('Çıkış tarihi')+'<input name="date" type="date" required value="')+iso(t0())+'"></label>' +
    ('<div class="row"><button type="button" class="btn ghost" style="flex:1" data-act="closeSheet">'+t('Vazgeç')+'</button>') +
    ('<button class="btn primary" style="flex:1">'+t('Başlat')+'</button></div></form>');
}

function deductionSheet(p){
  return ('<h3>'+t('Kesinti ekle')+'</h3><form class="stack" data-form="deduction" data-pid="')+p.id+'">' +
    ('<label class="field">'+t('Kalem')+'<input name="label" required maxlength="60" list="dedPresets" placeholder="'+t('Ör. Boya')+'"></label>') +
    '<datalist id="dedPresets">'+DEDUCTION_PRESETS.map(x => '<option value="'+esc(t(x))+'">').join('')+'</datalist>' +
    ('<label class="field">'+t('Tutar (₺)')+'<input name="amount" type="number" min="0" required inputmode="numeric"></label>') +
    ('<label class="field">'+t('Gerekçe')+'<input name="note" maxlength="140" placeholder="'+t('Hangi odada, girişe göre ne değişti?')+'"></label>') +
    ('<div class="muted">'+t('Kesinti eklemek iki tarafın onayını sıfırlar. Olağan kullanımdan kaynaklı yıpranma için kesinti yapılamaz.')+'</div>') +
    ('<div class="row"><button type="button" class="btn ghost" style="flex:1" data-act="closeSheet">'+t('Vazgeç')+'</button>') +
    ('<button class="btn primary" style="flex:1">'+t('Ekle')+'</button></div></form>');
}

function refundSheet(p){
  const sm = moveOutSummary(p);
  return ('<h3>'+t('Depozito iadesi')+'</h3><form class="stack" data-form="refund" data-pid="')+p.id+'">' +
    ('<div class="kv"><span>'+t('Hesaplanan iade')+'</span><span>')+tl(sm.refund)+'</span></div>' +
    ('<div class="grid2"><label class="field">'+t('İade edilen (₺)')+'<input name="amount" type="number" min="0" required value="')+sm.refund+'"></label>' +
    ('<label class="field">'+t('Tarih')+'<input name="date" type="date" required value="')+iso(t0())+'"></label></div>' +
    ('<div class="row"><button type="button" class="btn ghost" style="flex:1" data-act="closeSheet">'+t('Vazgeç')+'</button>') +
    ('<button class="btn primary" style="flex:1">'+t('Kaydet')+'</button></div></form>');
}

/* ---------------- dekont önizleme ---------------- */

function receiptPreview(rc){
  const v = rc.photo;
  const isPdf = isStored(v) && /\.pdf$/i.test(storedPath(v));
  if (v && !isPdf)
    return '<div class="ph" style="width:100%;height:190px;font-size:14px"><img src="'+esc(mediaSrc(v))+('" alt="'+t('Dekont görseli')+'" style="width:100%;height:100%;object-fit:contain;border-radius:10px"></div>');
  if (isPdf)
    return '<a class="btn ghost block" href="'+esc(mediaSrc(v))+'" target="_blank" rel="noopener">'+ic('doc', 16)+' '+esc(rc.receipt || t('Dekontu aç'))+'</a>';
  return '<div class="ph" style="width:100%;height:120px;font-size:14px">'+esc(rc.receipt || t('Dekont yok'))+'</div>';
}

/* ---------------- hesap ---------------- */

let pushLoading = false;

function accountSheet(){
  const prof = live.profile || {};
  // Doğrudan bağlantıyla açıldıysa bildirim durumu henüz okunmamış olabilir.
  if (!ui.pushState && !pushLoading){
    pushLoading = true;
    pushState().then(st => { ui.pushState = st; }).catch(() => { ui.pushState = 'unsupported'; })
      .finally(() => { pushLoading = false; import('./render.js').then(m => { if (current().sheet === 'hesap') m.refreshLayer(); }); });
  }
  const push = ui.pushState || 'unknown';
  const pushText = {
    on:t('Açık — kira günü, dekont, talep ve mesajlar telefonuna gelir.'),
    off:t('Kapalı.'),
    denied:t('Tarayıcı ayarlarında engellenmiş. Site ayarlarından izin vermelisin.'),
    install:t('iPhone’da bildirimler için önce Kiracım’ı ana ekrana ekle (Paylaş → Ana Ekrana Ekle).'),
    unsupported:t('Bu tarayıcı anlık bildirimleri desteklemiyor.'),
    unknown:t('Kontrol ediliyor…')
  }[push];
  return ('<h3>'+t('Hesap')+'</h3><div class="stack">') +
    ('<div class="card"><div class="kv"><span>'+t('E-posta')+'</span><span>')+esc(live.user?.email || '')+'</span></div>' +
      ('<div class="kv"><span>'+t('Hesap türü')+'</span><span>')+(prof.role === 'landlord' ? t('Mülk sahibi') : t('Kiracı'))+'</span></div>' +
      (prof.role === 'landlord'
        ? ('<div class="kv"><span>'+t('Abonelik')+'</span><span>')+esc(subSummary())+'</span></div>' +
          '<button class="btn small ghost block" style="margin-top:8px" data-act="sheet" data-s="abonelik">'+t('Aboneliği görüntüle')+'</button>'
        : '') + '</div>' +
    '<form class="stack" data-form="profile">' +
      ('<label class="field">'+t('Ad soyad')+'<input name="name" required maxlength="60" value="')+esc(prof.name || '')+'"></label>' +
      ('<label class="field">'+t('Telefon')+'<input name="phone" type="tel" value="')+esc(prof.phone || '')+'"></label>' +
      ('<button class="btn primary block">'+t('Kaydet')+'</button></form>') +

    ('<section class="card stack" style="gap:8px"><h2>'+t('Bildirimler')+'</h2>') +
      '<div class="muted">'+esc(pushText)+'</div>' +
      (push === 'on' || push === 'off'
        ? '<button class="btn small '+(push === 'on' ? 'ghost' : 'primary')+'" data-act="togglePush">'+(push === 'on' ? t('Anlık bildirimleri kapat') : t('Anlık bildirimleri aç'))+'</button>' : '') +
      ('<label class="toggle">'+t('E-posta ile de bildir')+'<input type="checkbox" data-input="setb" data-k="email"')+(S.settings.email ? ' checked' : '')+'></label>' +
    '</section>' +

    ('<details class="card"><summary><b>'+t('Şifreyi değiştir')+'</b></summary><form class="stack" data-form="newpass" style="margin-top:10px">') +
      ('<label class="field">'+t('Yeni şifre')+'<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>') +
      ('<label class="field">'+t('Yeni şifre (tekrar)')+'<input name="password2" type="password" required minlength="8" autocomplete="new-password"></label>') +
      ('<button class="btn primary block">'+t('Şifreyi güncelle')+'</button></form></details>') +

    (ui.authMsg ? '<div class="note'+(ui.authMsg.kind === 'error' ? ' warn' : '')+'">'+esc(ui.authMsg.text)+'</div>' : '') +
    ('<button class="btn ghost block" data-act="signOut">'+t('Çıkış yap')+'</button>') +
    ('<button class="btn small danger block" data-act="deleteAccount">'+t('Hesabı sil')+'</button>') +
    ('<p class="foot">'+t('Oturumun bu cihazda açık kalır; çıkış yapana kadar tekrar giriş gerekmez.')+'</p></div>');
}

/* ---------------- abonelik ---------------- */

/** Tek satırlık durum: ayarlarda ve hesap sayfasında. */
function subSummary(){
  const a = access();
  if (a.pending) return t('Kontrol ediliyor…');
  if (a.subscribed) return t('Aktif');
  if (a.inTrial) return t('Deneme · {n} gün kaldı', { n:trialDaysLeft(a) });
  return t('Deneme süresi bitti');
}

let pricesLoading = false;

function subscriptionSheet(){
  const a = access();
  // Fiyatlar bir kez, arka planda okunur (mobilde mağazadan).
  if (!ui.billingPrices && !pricesLoading){
    pricesLoading = true;
    planPrices().then(p => { ui.billingPrices = p; pricesLoading = false; refreshLayerSoon(); });
  }
  const prices = ui.billingPrices || {};
  const selected = ui.billingPlan || 'annual';
  const fmtDate = d => d ? fmtFull(new Date(d)) : '';
  const storeName = { app_store:'App Store', play_store:'Google Play', stripe:t('Web'), rc_billing:t('Web'), promotional:t('Hediye'), demo:t('Demo') }[a.store] || '';

  let status;
  if (a.subscribed){
    status = '<div class="card stack" style="gap:6px"><div class="row" style="justify-content:space-between"><b>'+t('Aboneliğin aktif')+'</b><span class="chip ok">'+t('Aktif')+'</span></div>' +
      (a.expiresAt ? '<div class="muted">'+(a.willRenew ? t('{date} tarihinde yenilenir', { date:fmtDate(a.expiresAt) }) : t('{date} tarihinde sona erer', { date:fmtDate(a.expiresAt) }))+'</div>' : '') +
      (storeName ? '<div class="muted">'+t('Satın alındığı yer: {store}', { store:storeName })+'</div>' : '') +
      (a.billingIssue ? '<div class="note warn">'+t('Mağazadaki ödeme yöntemini güncelle; aboneliğin kısa bir süre daha açık kalır.')+'</div>' : '') +
      (manageUrl(a) ? '<a class="btn small ghost" href="'+esc(manageUrl(a))+'" target="_blank" rel="noopener">'+t('Aboneliği yönet')+'</a>' : '') +
      '</div>';
  } else if (a.inTrial){
    status = '<div class="note">'+t('Deneme sürümündesin: {n} gün kaldı. Deneme bitince kayıtların silinmez; abone olana kadar salt okunur olur.', { n:trialDaysLeft(a) })+'</div>';
  } else {
    status = '<div class="note warn">'+t('Deneme süren bitti. Kayıtların duruyor; okuyabilir ve mesajlaşabilirsin. Değiştirmek için abone ol.')+'</div>';
  }

  const plans = a.subscribed ? '' :
    '<div class="plans" role="group" aria-label="'+t('Plan')+'">' + CONFIG.billing.plans.map(pl =>
      '<button type="button" class="plan" data-act="billingPlan" data-v="'+esc(pl.id)+'" aria-pressed="'+(pl.id === selected)+'">' +
        '<b>'+(PLAN_LABEL[pl.id] ? PLAN_LABEL[pl.id]() : esc(pl.id))+'</b>' +
        '<span class="price">'+(prices[pl.id] ? esc(prices[pl.id]) : '—')+'</span>' +
        '<span class="muted" style="font-size:12.5px">'+(pl.id === 'annual' ? t('yıllık ödenir') : t('aylık ödenir'))+'</span></button>').join('') + '</div>' +
    (Object.values(prices).some(Boolean) ? '' : '<div class="muted" style="font-size:12.5px">'+t('Fiyatlar mağaza hesapları bağlanınca burada görünür.')+'</div>') +
    (canPurchaseHere()
      ? '<button class="btn primary block" data-act="subscribe" data-v="'+esc(selected)+'">'+t('Abone ol')+'</button>'
      : '<div class="note">'+t('Aboneliği Kiracım’ın iPhone ya da Android uygulamasından başlatabilirsin; aynı hesapla web’de de geçerli olur.')+'</div>' +
        ((CONFIG.billing.appStoreUrl || CONFIG.billing.playStoreUrl)
          ? '<div class="row" style="gap:8px">' +
              (CONFIG.billing.appStoreUrl ? '<a class="btn ghost" style="flex:1" href="'+esc(CONFIG.billing.appStoreUrl)+'" target="_blank" rel="noopener">App Store</a>' : '') +
              (CONFIG.billing.playStoreUrl ? '<a class="btn ghost" style="flex:1" href="'+esc(CONFIG.billing.playStoreUrl)+'" target="_blank" rel="noopener">Google Play</a>' : '') + '</div>'
          : ''));

  const store = platform() === 'ios' ? 'App Store' : platform() === 'android' ? 'Google Play' : '';
  const legal = '<p class="fine">' +
    (store ? t('Ödeme, onayladığında {store} hesabından alınır.', { store })+' ' : '') +
    t('Abonelik, dönem bitmeden en az 24 saat önce iptal edilmezse aynı süre ve fiyatla kendiliğinden yenilenir. İptal ve yönetim, satın aldığın mağazanın hesap ayarlarından yapılır.') +
    (CONFIG.billing.termsUrl ? ' <a href="'+esc(CONFIG.billing.termsUrl)+'" target="_blank" rel="noopener">'+t('Kullanım koşulları')+'</a>' : '') +
    (CONFIG.billing.privacyUrl ? ' · <a href="'+esc(CONFIG.billing.privacyUrl)+'" target="_blank" rel="noopener">'+t('Gizlilik politikası')+'</a>' : '') + '</p>';

  const demo = LIVE ? '' :
    '<section class="card stack" style="gap:8px"><div class="label">'+t('Demo: durumu dene')+'</div><div class="row" style="flex-wrap:wrap;gap:6px">' +
      [['trial', t('Deneme')], ['expired', t('Süresi bitti')], ['subscribed', t('Abone')]].map(([v, label]) =>
        '<button class="btn small ghost" data-act="demoBilling" data-v="'+v+'">'+label+'</button>').join('') + '</div></section>';

  return '<h3>'+t('Mülk sahibi aboneliği')+'</h3><div class="stack">' + status +
    '<ul class="bullets">' +
      '<li>'+t('Sınırsız mülk: konut, ofis, mağaza, depo')+'</li>' +
      '<li>'+t('Dekont onayı, talepler, tutanak ve depozito iadesi')+'</li>' +
      '<li>'+t('Gider defteri, net getiri ve vergi tahmini')+'</li>' +
      '<li>'+t('Kiracıların için her zaman ücretsiz')+'</li>' +
    '</ul>' +
    plans +
    '<button class="btn ghost block" data-act="restorePurchases">'+t('Satın alımları geri yükle')+'</button>' +
    legal + demo + '</div>';
}

function refreshLayerSoon(){
  import('./render.js').then(m => { if (current().sheet === 'abonelik') m.refreshLayer(); });
}

/* ---------------- davet paylaşımı ---------------- */

function shareInviteSheet(p, code){
  if (!code) return null;
  const link = LIVE ? inviteLink(code) : location.origin + location.pathname + '#/katil/' + code;
  const text = (t('Merhaba,')+' ')+p.name+(' '+t('için Kiracım’da ortak panelimize katılır mısın? Davet kodun:')+' ')+code+' — '+link;
  return ('<h3>'+t('Kiracını davet et')+'</h3><div class="stack">') +
    ('<div class="muted">'+t('Kiracın bu bağlantıyla kayıt olunca ya da kodu girince')+' ')+esc(p.name)+(' '+t('paneline bağlanır. Kod 30 gün geçerlidir.')+'</div>') +
    ('<div class="codebox" aria-label="'+t('Davet kodu')+'">')+esc(code)+'</div>' +
    '<input class="inline" id="inviteLink" readonly value="'+esc(link)+('" aria-label="'+t('Davet bağlantısı')+'">') +
    '<div class="grid2">' +
      '<button class="btn primary" data-act="copyInvite">'+ic('doc', 16)+(' '+t('Kopyala')+'</button>') +
      '<a class="btn ghost" href="https://wa.me/?text='+encodeURIComponent(text)+('" target="_blank" rel="noopener">'+t('WhatsApp')+'</a></div>') +
    '<a class="btn ghost block" href="mailto:?subject='+encodeURIComponent(t('Kiracım daveti'))+'&body='+encodeURIComponent(text)+('">'+t('E-posta ile gönder')+'</a>') +
    (LIVE ? '' : ('<div class="note">'+t('Demo modunda davet gerçek değildir; kod yalnızca akışı göstermek içindir.')+'</div>')) +
    '</div>';
}

/* ---------------- katman yönetimi ve odak tuzağı ---------------- */

let lastFocus = null;

export function renderLayer(route){
  const L = document.getElementById('layer');
  const body = sheetBody(route);

  if (!body){
    if (L.innerHTML){
      L.innerHTML = '';
      if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
      lastFocus = null;
    }
    return;
  }

  const wasOpen = !!L.innerHTML;
  if (!wasOpen) lastFocus = document.activeElement;

  L.innerHTML = '<div class="scrim" data-act="closeSheet" data-self="1">' +
    '<div class="sheet" role="dialog" aria-modal="true" tabindex="-1"><div class="grab"></div>'+body+'</div></div>';

  const sheet = L.querySelector('.sheet');
  if (!wasOpen && sheet){
    const first = sheet.querySelector('input:not([type=hidden]):not(.sr), textarea, select, button');
    (first || sheet).focus({ preventScroll:true });
  }
}

/** Sheet açıkken Tab odağı içeride tutar. */
export function trapFocus(ev){
  const sheet = document.querySelector('#layer .sheet');
  if (!sheet || ev.key !== 'Tab') return;
  const nodes = [...sheet.querySelectorAll('a[href], button:not([disabled]), input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter(el => el.offsetParent !== null || el === document.activeElement);
  if (!nodes.length) return;
  const first = nodes[0], last = nodes[nodes.length-1];
  if (ev.shiftKey && document.activeElement === first){ ev.preventDefault(); last.focus(); }
  else if (!ev.shiftKey && document.activeElement === last){ ev.preventDefault(); first.focus(); }
}
