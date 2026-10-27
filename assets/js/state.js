/* Uygulama durumu: demo verisi, kalıcılık ve tema. */

import { t0, iso, add, addM, mkey, parse, DAY } from './util.js';
import { VERSION, LEGACY_KEYS, migrate } from './migrate.js';
import { LIVE } from './config.js';

export { VERSION };
export const KEY = 'evim';

export const STEPS = ['Açıldı','Görüldü','İşlemde','Çözüldü'];
export const CATS = ['Arıza','Tadilat','Ek talep'];
export const DOC_CATS = ['Kira sözleşmesi','Tahliye taahhütnamesi','DASK poliçesi','Konut sigortası','İşyeri sigortası','Giriş–çıkış tutanağı','Fatura ve aidat','Stopaj makbuzu','İşyeri ruhsatı','Teminat mektubu','Diğer'];
/** Yalnızca konutta / yalnızca işyerinde anlamlı belge kategorileri. */
const DOC_KONUT = ['Konut sigortası'];
const DOC_ISYERI = ['İşyeri sigortası','Stopaj makbuzu','İşyeri ruhsatı'];

export const PROP_TYPES = ['Konut','Ofis','Mağaza','Depo'];
export const DEPOSIT_KINDS = ['Nakit','Teminat mektubu'];
export const TENANT_KINDS = ['Bireysel','Şirket / esnaf'];

/** Tipe göre tutanak alanları (mülk eklenince önerilir). */
export const AREA_TEMPLATES = {
  'Konut':  ['Salon','Mutfak','Yatak odası','Banyo'],
  'Ofis':   ['Açık ofis','Toplantı odası','Mutfak','WC'],
  'Mağaza': ['Satış alanı','Vitrin','Depo','Cephe ve tabela','WC'],
  'Depo':   ['Depolama alanı','Yükleme alanı','Elektrik tesisatı']
};

/** Tipe göre sık açılan talepler (yeni talep formunda öneri). */
export const REQ_SUGGEST = {
  'Konut':  ['Kombi arızası','Su kaçağı','Elektrik arızası','Klima montajı','Boya badana'],
  'Ofis':   ['Klima arızası','Elektrik tesisatı','İnternet altyapısı','Aydınlatma','Asansör arızası'],
  'Mağaza': ['Vitrin camı','Tabela','Kepenk arızası','Klima arızası','Elektrik tesisatı'],
  'Depo':   ['Kepenk arızası','Çatı akıntısı','Elektrik tesisatı','Zemin onarımı']
};

export function isCommercial(p){ return !!p && p.type !== 'Konut'; }
export function docCatsFor(p){
  return DOC_CATS.filter(c => isCommercial(p) ? !DOC_KONUT.includes(c) : !DOC_ISYERI.includes(c) || p.docs.some(d => d.cat === c));
}
export const COST_OPTS = ['Belirlenmedi','Mülk sahibi','Kiracı','Paylaşımlı'];
export const EXPENSE_CATS = ['Tamir ve bakım','Emlak vergisi','DASK ve sigorta','Aidat','Yönetim ve komisyon','Vergi ve harç','Diğer'];
export const CONDITIONS = ['Aynı','Yıpranmış','Hasarlı','Eksik'];
export const DEDUCTION_PRESETS = ['Temizlik','Boya','Onarım','Eksik eşya','Ödenmemiş fatura','Ödenmemiş aidat'];

/**
 * Sıfırdan demo verisi üretir; tüm tarihler bugüne göredir.
 * Temel kurgu v2 biçiminde yazılır ve geçiş zincirinden geçirilir —
 * böylece geçişler her demo açılışında da sınanmış olur.
 */
export function seed(){
  return enrich(migrate(baseSeed()));
}

/**
 * Sözleşme başından bugüne kadarki ayları onaylı ödeme olarak doldurur.
 * `skipLast` kadar son ay boş bırakılır (gecikme ya da onay bekleyen ay kurgusu için).
 */
function fillPays(amount, startISO, skipLast = 0){
  const t = t0(), o = {};
  const start = parse(startISO);
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endKey = mkey(addM(new Date(t.getFullYear(), t.getMonth(), 1), -skipLast));
  while (mkey(cur) <= endKey){
    o[mkey(cur)] = {
      status:'approved',
      date: iso(new Date(cur.getFullYear(), cur.getMonth(), 3)),
      amount,
      receipt: 'dekont_'+mkey(cur)+'.pdf',
      approvedAt: new Date(cur.getFullYear(), cur.getMonth(), 4).getTime()
    };
    cur = addM(cur, 1);
  }
  return o;
}

function baseSeed(){
  const t = t0(), now = Date.now();

  const START = { moda: iso(add(t,-313)), cihangir: iso(add(t,-195)), atasehir: iso(add(t,-337)) };

  const pays = (rent, startISO, skipLast = 0) => fillPays(rent, startISO, skipLast);

  const landlord = { name:'[Mülk sahibi adı]', phone:'05000000000' };

  const moda = {
    id:'moda', name:'Moda’daki ev', addr:'Moda Cd. No:[__] D:4, Kadıköy',
    tenant:{ name:'[Kiracı adı]', phone:'05000000001' }, landlord,
    rent:32500, dueDay:5, aidat:2750, aidatPayer:'Kiracı', deposit:65000, depositNote:'Banka hesabında',
    startDate: START.moda, contractEnd: iso(add(t,52)), dask: iso(add(t,120)),
    bills:[{n:'Elektrik',who:'Kiracı'},{n:'Doğalgaz',who:'Kiracı'},{n:'Su',who:'Kiracı'},{n:'İnternet',who:'Kiracı'}],
    pay: pays(32500, START.moda, 0),
    requests:[
      { id:'r1', cat:'Arıza', title:'Kombi basıncı düşüyor',
        desc:'Basınç her sabah 0,5 bara iniyor, iki gündür sıcak su kesiliyor.',
        urgency:'Normal', status:2, cost:'Ev sahibi', costOk:true, decision:null,
        date: iso(add(t,-7)), photos:2, shots:[],
        log:[
          { at: now-7*DAY, text:'Talep açıldı' },
          { at: now-6*DAY, text:'Mülk sahibi görüntüledi' },
          { at: now-5*DAY, text:'Masraf mülk sahibinde olarak onaylandı' },
          { at: now-5*DAY+7200000, text:'Servis çağrıldı · İşlemde' }
        ] },
      { id:'r2', cat:'Ek talep', title:'Salona klima montajı',
        desc:'Masrafı bana ait olmak üzere salona klima taktırmak istiyorum.',
        urgency:'Normal', status:0, cost:'Kiracı', costOk:false, decision:null,
        date: iso(add(t,-2)), photos:0, shots:[],
        log:[{ at: now-2*DAY, text:'Talep açıldı' }] }
    ],
    msgs:[
      { from:'tenant', text:'Merhaba, kombi için talep açtım, fotoğraflar ekte.', at: now-6*DAY },
      { from:'landlord', text:'Gördüm, yarın servis arayacak.', at: now-6*DAY+3600000 },
      { from:'system', text:'Talep durumu: İşlemde · Masraf mülk sahibinde, onaylandı', at: now-5*DAY }
    ],
    docs:[
      { id:'d1', cat:'Kira sözleşmesi', name:'kira_sozlesmesi_imzali.pdf', at: iso(add(t,-313)) },
      { id:'d2', cat:'DASK poliçesi', name:'dask_police.pdf', at: iso(add(t,-245)), until: iso(add(t,120)) },
      { id:'d3', cat:'Giriş–çıkış tutanağı', name:'giris_tutanagi.pdf', at: iso(add(t,-312)) }
    ],
    inspect:{ tenantOk:true, landlordOk:false, rooms:[
      { n:'Salon', photos:8, shots:[], note:'Sayaçlar okundu' },
      { n:'Mutfak', photos:6, shots:[], note:'Dolap kapağı menteşesi gevşek' },
      { n:'Yatak odası', photos:5, shots:[], note:'' },
      { n:'Banyo', photos:4, shots:[], note:'Fayansta kılcal çatlak' },
      { n:'Balkon', photos:0, shots:[], note:'' }
    ] },
    renewal:null
  };

  const cihangir = {
    id:'cihangir', name:'Cihangir 1+1', addr:'Sıraselviler Cd. No:[__] D:2, Beyoğlu',
    tenant:{ name:'[Kiracı 2]', phone:'05000000002' }, landlord,
    rent:41000, dueDay:10, aidat:1500, aidatPayer:'Kiracı', deposit:82000, depositNote:'Nakit alındı',
    startDate: START.cihangir, contractEnd: iso(add(t,170)), dask: iso(add(t,22)),
    bills:[{n:'Elektrik',who:'Kiracı'},{n:'Su',who:'Ev sahibi'}],
    pay: (() => {
      const o = pays(41000, START.cihangir, 1);
      o[mkey(t)] = { status:'review', date: iso(add(t,-1)), amount:41000, receipt:'dekont_bu_ay.jpg' };
      return o;
    })(),
    requests:[
      { id:'r3', cat:'Tadilat', title:'Banyo aspiratörü değişimi',
        desc:'Aspiratör ses yapıyor ve çekmiyor.', urgency:'Normal', status:0,
        cost:'Belirlenmedi', costOk:false, decision:null, date: iso(add(t,-1)), photos:1, shots:[],
        log:[{ at: now-DAY, text:'Talep açıldı' }] }
    ],
    msgs:[ { from:'tenant', text:'Bu ayın dekontunu yükledim.', at: now-DAY } ],
    docs:[
      { id:'d4', cat:'Kira sözleşmesi', name:'sozlesme_cihangir.pdf', at: iso(add(t,-195)) },
      { id:'d5', cat:'DASK poliçesi', name:'dask_cihangir.pdf', at: iso(add(t,-343)), until: iso(add(t,22)) }
    ],
    inspect:{ tenantOk:true, landlordOk:true, rooms:[
      { n:'Salon', photos:6, shots:[], note:'' },
      { n:'Yatak odası', photos:4, shots:[], note:'' },
      { n:'Banyo', photos:3, shots:[], note:'' }
    ] },
    renewal:null
  };

  const atasehir = {
    id:'atasehir', name:'Ataşehir 2+1', addr:'Atatürk Mah. [__] Sk. No:[__], Ataşehir',
    tenant:{ name:'[Kiracı 3]', phone:'05000000003' }, landlord,
    rent:27000, dueDay:1, aidat:3200, aidatPayer:'Kiracı', deposit:54000, depositNote:'Banka hesabında',
    startDate: START.atasehir, contractEnd: iso(add(t,28)), dask: iso(add(t,200)),
    bills:[{n:'Elektrik',who:'Kiracı'},{n:'Doğalgaz',who:'Kiracı'}],
    pay: pays(27000, START.atasehir, 1),
    requests:[], msgs:[],
    docs:[
      { id:'d6', cat:'Kira sözleşmesi', name:'sozlesme_atasehir.pdf', at: iso(add(t,-337)) },
      { id:'d7', cat:'Tahliye taahhütnamesi', name:'tahliye_taahhut.pdf', at: iso(add(t,-337)), until: iso(add(t,75)) }
    ],
    inspect:{ tenantOk:true, landlordOk:true, rooms:[
      { n:'Salon', photos:7, shots:[], note:'' },
      { n:'Mutfak', photos:5, shots:[], note:'' }
    ] },
    renewal:null
  };

  return {
    v: 2,
    myHome:'moda',
    props:{ moda, cihangir, atasehir },
    order:['moda','cihangir','atasehir'],
    settings:{ rentDays:3, renewDays:60, insDays:30, evictDays:90, reqUpdates:true, lateNotice:true },
    inbox:[],
    theme:'system',
    seenHint:false,
    tourDone:false
  };
}

/** Kayıt yeni bir uygulama sürümünden geliyorsa üzerine yazmamak için. */
let readOnly = false;
/** Açılışta ne olduğunu kullanıcıya söylemek için (main.js okur). */
export const bootInfo = { migratedFrom:null, newer:false, corrupt:false };

function read(key){
  try { return JSON.parse(localStorage.getItem(key)); } catch(e){ return undefined; }
}

/** v3 ile gelen alanlar için örnek içerik. */
function enrich(d){
  const t = t0(), now = Date.now();
  const { moda, cihangir, atasehir } = d.props;
  const y = t.getFullYear();

  // Cihangir'de iki kiracı: ev arkadaşları.
  cihangir.tenants.push({ id:'t2', name:'[Ev arkadaşı]', phone:'05000000004', email:'' });
  cihangir.msgs.push({ from:'tenant', by:'t2', text:'Aspiratör için ben de buradayım, hafta içi akşam uygun.', at: now - 20*3600000 });

  // Gider defteri.
  moda.value = 6500000;
  moda.expenses = [
    { id:'e1', cat:'Emlak vergisi', amount:4200, date: y+'-05-20', note:'1. taksit' },
    { id:'e2', cat:'DASK ve sigorta', amount:1850, date: iso(add(t,-245)), note:'DASK poliçesi' },
    { id:'e3', cat:'Tamir ve bakım', amount:2400, date: iso(add(t,-4)), note:'Kombi servisi', reqId:'r1' }
  ];
  cihangir.value = 8200000;
  cihangir.expenses = [
    { id:'e4', cat:'Emlak vergisi', amount:5100, date: y+'-05-20', note:'1. taksit' },
    { id:'e5', cat:'Yönetim ve komisyon', amount:41000, date: cihangir.startDate, note:'Emlakçı komisyonu' }
  ];
  atasehir.value = 5400000;
  atasehir.expenses = [
    { id:'e6', cat:'Emlak vergisi', amount:3300, date: y+'-05-20', note:'1. taksit' }
  ];

  // Kombi talebi: iki teklif, biri seçildi, fatura işlendi.
  const r1 = moda.requests.find(r => r.id === 'r1');
  r1.quotes = [
    { id:'q1', vendor:'Yetkili servis', phone:'05000000011', amount:2400, note:'Genleşme tankı + basınç ayarı', chosen:true },
    { id:'q2', vendor:'Mahalle ustası', phone:'05000000012', amount:1900, note:'Yalnızca basınç ayarı', chosen:false }
  ];
  r1.invoice = { amount:2400, name:'servis_faturasi.pdf', date: iso(add(t,-4)), expenseId:'e3' };
  r1.log.push({ at: now - 4*86400000, text:'Teklif seçildi: Yetkili servis · ₺2.400' });

  // v4: işyerleri. Ofisin kiracısı bir şirket, kirayı stopajı keserek öder.
  const landlord = moda.landlord;
  const room = n => ({ n, photos:3, shots:[], note:'' });
  const levent = {
    id:'levent', type:'Ofis', name:'Levent ofis', addr:'Büyükdere Cd. No:[__] K:7, Şişli', area:140,
    company:{ name:'[Şirket A.Ş.]', taxNo:'0000000000', taxOffice:'Zincirlikuyu' }, stopaj:true,
    tenants:[{ id:'t1', name:'[Ofis yöneticisi]', phone:'05000000005', email:'' }], landlord,
    rent:60000, dueDay:5, aidat:6500, aidatPayer:'Kiracı', deposit:180000, depositKind:'Nakit', depositNote:'Üç aylık kira, banka hesabında',
    startDate: iso(add(t,-250)), contractEnd: iso(add(t,480)), dask:null,
    rentHistory:[{ from: iso(add(t,-250)), amount:60000, note:'Sözleşme başlangıcı' }],
    bills:[{n:'Elektrik',who:'Kiracı'},{n:'İnternet',who:'Kiracı'}],
    pay: fillPays(48000, iso(add(t,-250)), 0),
    requests:[
      { id:'r4', cat:'Arıza', title:'Toplantı odası kliması soğutmuyor', desc:'Klima çalışıyor ama soğuk hava vermiyor.',
        urgency:'Acil', status:1, cost:'Belirlenmedi', costOk:false, decision:null, date: iso(add(t,-1)), photos:1, shots:[],
        log:[{ at: now-DAY, text:'Talep açıldı' }, { at: now-20*3600000, text:'Mülk sahibi görüntüledi' }], quotes:[], invoice:null }
    ],
    msgs:[ { from:'tenant', by:'t1', text:'Stopaj makbuzunu muhtasar beyannameden sonra yükleyeceğiz.', at: now-3*DAY } ],
    docs:[
      { id:'d8', cat:'Kira sözleşmesi', name:'ofis_sozlesme.pdf', at: iso(add(t,-250)) },
      { id:'d9', cat:'İşyeri sigortası', name:'isyeri_sigorta.pdf', at: iso(add(t,-250)), until: iso(add(t,115)) },
      { id:'d10', cat:'Stopaj makbuzu', name:'muhtasar_'+mkey(addM(t,-1))+'.pdf', at: iso(add(t,-9)) }
    ],
    inspect:{ tenantOk:true, landlordOk:true, rooms: AREA_TEMPLATES['Ofis'].map(room) },
    renewal:null, expenses:[{ id:'e7', cat:'Emlak vergisi', amount:9800, date: y+'-05-20', note:'1. taksit' }],
    value:14000000, moveOut:null
  };
  const bagdat = {
    id:'bagdat', type:'Mağaza', name:'Bağdat Cd. mağaza', addr:'Bağdat Cd. No:[__], Kadıköy', area:85,
    company:{ name:'[Esnaf kiracı]', taxNo:'0000000000', taxOffice:'Kozyatağı' }, stopaj:true,
    tenants:[{ id:'t1', name:'[Mağaza sahibi]', phone:'05000000006', email:'' }], landlord,
    rent:45000, dueDay:10, aidat:0, aidatPayer:'Kiracı', deposit:0, depositKind:'Teminat mektubu', depositNote:'Banka teminat mektubu · ₺135.000',
    startDate: iso(add(t,-400)), contractEnd: iso(add(t,330)), dask:null,
    rentHistory:[{ from: iso(add(t,-400)), amount:38000, note:'Sözleşme başlangıcı' }, { from: iso(add(t,-35)), amount:45000, note:'Sözleşme yenileme' }],
    bills:[{n:'Elektrik',who:'Kiracı'},{n:'Su',who:'Kiracı'}],
    pay: (() => {
      const o = fillPays(30400, iso(add(t,-400)), 0);
      // Yenilemeden sonraki aylar yeni tutarla.
      Object.keys(o).forEach(k => { if (k + '-10' >= iso(add(t,-35))) o[k].amount = 36000; });
      delete o[mkey(t)];
      return o;
    })(),
    requests:[], msgs:[],
    docs:[
      { id:'d11', cat:'Kira sözleşmesi', name:'magaza_sozlesme.pdf', at: iso(add(t,-400)) },
      { id:'d12', cat:'Teminat mektubu', name:'teminat_mektubu.pdf', at: iso(add(t,-400)), until: iso(add(t,340)) },
      { id:'d13', cat:'İşyeri ruhsatı', name:'ruhsat.pdf', at: iso(add(t,-390)) }
    ],
    inspect:{ tenantOk:true, landlordOk:false, rooms: AREA_TEMPLATES['Mağaza'].map(room) },
    renewal:null, expenses:[], value:11000000, moveOut:null
  };
  d.props.levent = levent;
  d.props.bagdat = bagdat;
  d.order.push('levent', 'bagdat');

  d.lang = 'tr';
  return d;
}

function load(){
  // v2 sürümü 'evim-v2' anahtarını kullanıyordu; önce onu tek anahtara taşı.
  const keys = [KEY, 'evim-v2', ...LEGACY_KEYS];
  for (const key of keys){
    const raw = read(key);
    if (raw === undefined){ if (key === KEY && localStorage.getItem(KEY)) bootInfo.corrupt = true; continue; }
    if (!raw || !raw.props || !raw.order) continue;

    const v = raw.v || 1;
    if (v > VERSION){
      // Daha yeni bir sürümün verisi: okunur ama asla üzerine yazılmaz.
      readOnly = true;
      bootInfo.newer = true;
      return raw;
    }
    if (v === VERSION && key === KEY) return raw;

    try {
      // Geçişten önce ham veriyi yedekle.
      try { localStorage.setItem('evim-yedek-v' + v, JSON.stringify(raw)); } catch(e){}
      const next = migrate(raw);
      bootInfo.migratedFrom = v;
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch(e){}
      return next;
    } catch(e){
      console.error('Veri geçişi başarısız', e);
      bootInfo.corrupt = true;
    }
  }
  return seed();
}

/** Gerçek hesap modunda başlangıçta boş durum; veri oturum açılınca gelir. */
export function emptyState(){
  return {
    v: VERSION, lang:'tr', theme:'system', seenHint:true, tourDone:true,
    myHome:null, props:{}, order:[], inbox:[],
    settings:{ rentDays:3, renewDays:60, insDays:30, evictDays:90, reqUpdates:true, lateNotice:true }
  };
}

function initial(){
  if (!LIVE) return load();
  const s = emptyState();
  // Tema ve dil tercihi oturumdan bağımsızdır.
  try {
    const pref = JSON.parse(localStorage.getItem('evim-tercih')) || {};
    if (pref.theme) s.theme = pref.theme;
    if (pref.lang) s.lang = pref.lang;
  } catch(e){}
  return s;
}

export let S = initial();
export function isReadOnly(){ return readOnly; }

/** Kayıt anahtarı: demo 'evim', gerçek hesapta kullanıcıya özel. */
let storageKey = LIVE ? null : KEY;
export function useStorageKey(k){ storageKey = k; }

/** save() sonrası çağrılır; gerçek hesapta sunucu eşitlemesini tetikler. */
export const hooks = { afterSave: null };

/** Kalıcılık. Kota dolarsa fotoğrafları atıp yeniden dener. */
/** Değişikliği kaydeder: cihaza yazar ve (gerçek hesapta) sunucuya gönderir. */
export function save(){
  if (readOnly) return false;
  const ok = saveLocal();
  if (hooks.afterSave) hooks.afterSave();
  return ok;
}

/** Yalnızca cihaza yazar. Kota dolarsa fotoğrafları atıp yeniden dener. */
export function saveLocal(){
  try { localStorage.setItem('evim-tercih', JSON.stringify({ theme:S.theme, lang:S.lang })); } catch(e){}
  if (readOnly || !storageKey) return false;
  try {
    localStorage.setItem(storageKey, JSON.stringify(S));
    return true;
  } catch(e){
    try {
      const slim = JSON.parse(JSON.stringify(S));
      Object.values(slim.props).forEach(p => {
        p.inspect.rooms.forEach(r => { r.shots = []; });
        p.requests.forEach(r => { r.shots = []; });
        Object.values(p.pay).forEach(rec => { delete rec.photo; });
      });
      localStorage.setItem(storageKey, JSON.stringify(slim));
      S = slim;
      return false;
    } catch(e2){ return false; }
  }
}

/** Durumu tamamen değiştirir (sıfırlama ve içe aktarma için). */
/** Durumu tamamen değiştirir (sıfırlama, içe aktarma, sunucudan yükleme). */
export function replaceState(next, { silent = false } = {}){
  readOnly = false;
  S = next;
  if (!silent) saveLocal();
  applyTheme();
}

export function reset(){ replaceState(seed()); }

/** Geçici, kaydedilmeyen arayüz durumu. */
export const ui = {
  reqTab:'open',
  q:'',
  renewal:{ cpi:null, amount:null },
  lastChatKey:null,
  tour:null,
  media:{},        // depo yolu → görüntülenebilir adres (imzalı bağlantı ya da data URL)
  authMsg:null     // giriş ekranlarında gösterilecek durum mesajı
};

export function applyTheme(){
  const el = document.documentElement;
  if (S.theme === 'system') el.removeAttribute('data-theme');
  else el.setAttribute('data-theme', S.theme);
}

export function setTheme(v){ S.theme = v; save(); applyTheme(); themeHook.fn(); }
/** Tema değişince (ör. telefonda durum çubuğu rengi). */
export const themeHook = { fn: () => {} };
