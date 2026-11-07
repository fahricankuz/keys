// Testler için sahte supabase-js (yalnızca EXPO_PUBLIC_SUPABASE_URL=fake: iken yüklenir). Uygulamanın kullandığı API alt kümesini,
// localStorage'da tutulan bellek içi bir veritabanıyla taklit eder.
// Sunucu kuralları (RLS, tetikleyiciler) gerçek Postgres'te ayrıca sınanır
// (tests/sql.spec.mjs); burada yalnızca istemcinin akışları doğrulanır.

const KEY = '__fakedb';
const TABLES = ['profiles','properties','property_shared','memberships','invites','payments','rent_history',
                'requests','messages','documents','expenses','notifications','push_subscriptions','subscriptions','device_tokens','admins','reviews','bans','admin_audit',
                'organizations','org_roles','org_members','org_invites',
                'site_units','site_residents','site_charges','site_expenses','site_announcements','site_requests','site_budgets','site_turnovers','site_rent_changes','site_auto','site_meetings','site_meeting_replies','site_polls','site_votes','site_documents','site_investor_notes','mail_outbox','site_cash','site_recurring_expenses',
                'fx_rates','legal_requests','legal_notes','client_errors','function_logs','content_reports','user_blocks','customer_contacts','rent_certificates','admin_costs','admin_emails'];

function load(){
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d){ TABLES.forEach(t => d.tables[t] = d.tables[t] || []); d.tables.payments.forEach(r => { r.kind = r.kind || 'kira'; }); return d; } } catch(e){}
  const d = { users:[], session:null, storage:{}, tables:{} };
  TABLES.forEach(t => d.tables[t] = []);
  return d;
}
function persist(d){ localStorage.setItem(KEY, JSON.stringify(d)); }
const uuid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

const KEYS = {
  profiles:['id'], properties:['id'], property_shared:['property_id'], memberships:['property_id','user_id'],
  invites:['code'], payments:['property_id','month','kind'], rent_history:['id'], requests:['id'], messages:['id'],
  documents:['id'], expenses:['id'], notifications:['id'], push_subscriptions:['endpoint'], subscriptions:['user_id'], device_tokens:['token'],
  site_meeting_replies:['meeting_id','unit_id'], site_votes:['poll_id','unit_id'], site_investor_notes:['org_id','period'], site_cash:['org_id'],
  site_budgets:['org_id','year'], site_auto:['org_id'], site_turnovers:['unit_id','month'], legal_notes:['request_id'], user_blocks:['user_id','blocked'],
  admins:['user_id'], reviews:['kind','property_id','ref_id'], bans:['user_id'], admin_audit:['id']
};

function defaults(table, row, db){
  const r = Object.assign({}, row);
  if (table === 'properties'){ r.id = r.id || uuid(); r.created_at = r.created_at || now(); }
  if (table === 'payments'){ r.kind = r.kind || 'kira'; r.method = r.method || 'dekont'; }
  if (table.startsWith('site_')){ r.id = r.id || uuid(); r.created_at = r.created_at || now(); }
  if (table === 'customer_contacts'){ r.id = r.id || uuid(); r.created_at = r.created_at || now(); }
  if (table === 'site_residents'){ r.code = r.code || 'S' + Math.random().toString(16).slice(2, 9).toUpperCase().padEnd(7, '0'); r.user_id = r.user_id || null; r.lives_here = r.lives_here !== false; }
  if (table === 'site_budgets'){ r.updated_at = now(); }
  if (table === 'site_turnovers'){ r.status = r.status || 'reported'; r.reported_by = r.reported_by || db.session?.user.id || null; }
  if (table === 'site_units'){ r.payer = r.payer || 'kiraci'; r.block = r.block || ''; r.currency = r.currency || 'TRY'; r.index_kind = r.index_kind || 'tufe'; r.vat = !!r.vat; r.stopaj = !!r.stopaj; }
  if (table === 'site_charges'){ r.status = r.status || 'open'; r.paid_amount = r.paid_amount || 0; r.title = r.title || ''; r.method = r.method || 'dekont'; r.currency = r.currency || 'TRY'; }
  if (table === 'site_requests'){ r.status = r.status || 0; r.reply = r.reply || ''; }
  if (table === 'site_meetings'){ r.status = r.status || 'cagrildi'; r.minutes = r.minutes || ''; r.agenda = r.agenda || []; r.kind = r.kind || 'olagan'; r.place = r.place || ''; }
  if (table === 'site_documents'){ r.audience = r.audience || 'herkes'; r.unit_id = r.unit_id || null; r.uploaded_by = r.uploaded_by || db.session?.user.id || null; }
  if (table === 'site_polls'){ r.weighted = !!r.weighted; r.voters = r.voters || 'malik'; }
  if (table === 'invites'){ r.code = r.code || Math.random().toString(36).slice(2, 10).toUpperCase(); r.created_at = now(); r.accepted_by = null; }
  if (table === 'messages'){ r.at = r.at || now(); if (r.by_user === undefined) r.by_user = db.session?.user.id || null; }
  if (table === 'legal_requests'){
    // schema.sql 22. bölüm → guard_legal: numara, fiyat, durum ve iletişim sunucuda belirlenir.
    const u = db.users.find(x => x.id === r.user_id) || {}, pr = db.tables.profiles.find(x => x.id === r.user_id) || {};
    Object.assign(r, { id: uuid(), no: (db.tables.legal_requests.reduce((m, x) => Math.max(m, x.no || 0), 0) || 0) + 1, price: 3000, status: 'received', reply: '',
      paid_at: null, forwarded_at: null, closed_at: null, created_at: now(), updated_at: now(), consent_at: now(), scope_at: now(),
      files: r.files || [], context: r.context || {}, contact: { name: pr.name || '', phone: pr.phone || '', email: u.email || '' } });
  }
  if (table === 'content_reports'){ r.id = r.id || uuid(); r.status = 'open'; r.resolution = ''; r.created_at = now(); }
  if (table === 'user_blocks'){ r.created_at = now(); }
  if (table === 'notifications'){ r.id = (db.tables.notifications.reduce((m, x) => Math.max(m, x.id), 0) || 0) + 1; r.created_at = now(); r.read_at = null; }
  return r;
}

function afterInsert(table, row, db){
  if (table === 'properties'){
    const prof = db.tables.profiles.find(p => p.id === row.owner_id) || {};
    db.tables.memberships.push({ property_id:row.id, user_id:row.owner_id, role:'landlord', display_name:prof.name || '', phone:'', email:'' });
    db.tables.property_shared.push({ property_id:row.id, inspect:{ tenantOk:false, landlordOk:false, rooms:[] }, move_out:null, renewal:null });
    if (!db.tables.rent_history.some(h => h.id === row.id + ':' + row.start_date))
      db.tables.rent_history.push({ id:row.id + ':' + row.start_date, property_id:row.id, from_date:row.start_date, amount:row.rent, note:'Sözleşme başlangıcı' });
  }
}

/* Denetim: schema.sql → track_*_review / upsert_review / on_review_change ile aynı kural. */
/** Kişinin site daireleri: doğrudan kaydı ve bağlı mülkünün kiracısı olarak (schema.sql → site_links). */
function siteLinks(db, uid){
  const T = db.tables, out = (T.site_residents || []).filter(r => r.user_id === uid).map(r => ({ unit_id:r.unit_id, org_id:r.org_id, role:r.role }));
  T.properties.filter(p => p.site_unit_id && T.memberships.some(m => m.property_id === p.id && m.user_id === uid && m.role === 'tenant')).forEach(p => {
    const u = (T.site_units || []).find(x => x.id === p.site_unit_id);
    if (u) out.push({ unit_id:u.id, org_id:u.org_id, role:'kiraci' });
  });
  return out;
}
/** Denetim anahtarı (schema.sql → pay_ref): kira için ay, aidat için "aidat:ay". */
const payRef = (row) => ((row.kind || 'kira') === 'kira' ? row.month : row.kind + ':' + row.month);
const isAdmin = (db, uid) => db.tables.admins.some(a => a.user_id === uid);
const roleIn = (db, uid, pid) => (db.tables.memberships.find(m => m.property_id === pid && m.user_id === uid) || {}).role;
const reviewOk = (db, kind, pid, ref) => { const r = db.tables.reviews.find(x => x.kind === kind && x.property_id === pid && x.ref_id === ref); return !r || r.status === 'approved'; };


function notify(db, uid, title, body){
  db.tables.notifications.push({ id:(db.tables.notifications.reduce((m, x) => Math.max(m, x.id), 0) || 0) + 1, user_id:uid, title, body, url:'', created_at:now(), read_at:null });
}

function trackReviews(db, table, row, before, actor){
  if (!actor || isAdmin(db, actor)) return;
  // Dekont anahtar denetimine düşmez (migration 20261103231123): yüklendiği anda mülk sahibine "dekont geldi" bildirimi gider.
  if (table === 'payments' && roleIn(db, actor, row.property_id) !== 'landlord' && ['review','partial'].includes(row.status)){
    if (!before || before.status !== row.status || before.receipt_path !== row.receipt_path || before.receipt_name !== row.receipt_name || before.amount !== row.amount)
      db.tables.memberships.filter(m => m.property_id === row.property_id && m.role === 'landlord').forEach(m => notify(db, m.user_id, 'Dekont geldi', payRef(row) + ' kirası için ödeme yapıldı.'));
  }
  // Belge ve fatura da denetime düşmez (migration 20261104065604): dosya değişince eski denetim kaydı silinir, diğer üyelere bildirim gider.
  const others = (pid) => db.tables.memberships.filter(m => m.property_id === pid && m.user_id !== actor);
  if (table === 'documents' && (!before || before.path !== row.path || before.name !== row.name)){
    db.tables.reviews = db.tables.reviews.filter(r => !(r.kind === 'document' && r.property_id === row.property_id && r.ref_id === row.id));
    others(row.property_id).forEach(m => notify(db, m.user_id, 'Yeni belge', row.name));
  }
  if (table === 'requests' && row.invoice && (!before || !before.invoice || before.invoice.path !== row.invoice.path || before.invoice.amount !== row.invoice.amount)){
    db.tables.reviews = db.tables.reviews.filter(r => !(r.kind === 'invoice' && r.property_id === row.property_id && r.ref_id === row.id));
    others(row.property_id).forEach(m => notify(db, m.user_id, 'Fatura eklendi', row.invoice.name || 'fatura'));
  }
}

/* Okuma kuralı: belge ve faturada karşı taraf, yönetici onaylayana kadar yüklemeyi görmez (dekont denetime düşmez). */
function visible(db, table, row, actor){
  if (!actor || isAdmin(db, actor)) return true;
  if (table === 'payments') return roleIn(db, actor, row.property_id) === 'tenant' || reviewOk(db, 'payment', row.property_id, payRef(row));
  if (table === 'documents') return row.uploaded_by === actor || reviewOk(db, 'document', row.property_id, row.id);
  if (table === 'reviews') return row.uploader === actor;
  // Site: yönetim (kurum üyesi) hepsini, sakin yalnız kendi dairesini ve kendi taleplerini görür (schema.sql 17. bölüm).
  if (table.startsWith('site_') && row.org_id){
    if ((db.tables.org_members || []).some(m => m.org_id === row.org_id && m.user_id === actor)) return true;
    const mine = siteLinks(db, actor);
    if (table === 'site_budgets') return mine.some(r => r.org_id === row.org_id);
    if (table === 'site_units') return mine.some(r => r.unit_id === row.id);
    if (table === 'site_charges' || table === 'site_turnovers' || table === 'site_rent_changes') return mine.some(r => r.unit_id === row.unit_id);
    if (table === 'site_residents') return row.user_id === actor;
    if (table === 'site_announcements' || table === 'site_meetings' || table === 'site_polls') return mine.some(r => r.org_id === row.org_id);
    if (table === 'site_meeting_replies' || table === 'site_votes') return mine.some(r => r.unit_id === row.unit_id);
    if (table === 'site_documents') return row.uploaded_by === actor || (row.audience === 'herkes' && mine.some(r => r.org_id === row.org_id))
      || (row.audience === 'daire' && mine.some(r => r.unit_id === row.unit_id));
    if (table === 'site_requests') return row.user_id === actor;
    return false;
  }
  if (table === 'legal_requests') return row.user_id === actor;
  // schema.sql 26. bölüm: engellenen kişinin mesajları görünmez (sistem mesajları hariç).
  if (table === 'messages') return row.from_role === 'system' || !row.by_user || !(db.tables.user_blocks || []).some(b => b.user_id === actor && b.blocked === row.by_user);
  if (table === 'legal_notes' || table === 'client_errors' || table === 'function_logs' || table === 'customer_contacts' || table === 'admin_costs' || table === 'admin_emails' || table === 'mail_outbox') return false;
  if (table === 'content_reports') return row.reporter === actor;
  if (table === 'rent_certificates') return row.tenant_id === actor;
  if (table === 'user_blocks') return row.user_id === actor;
  return true;
}

function decideEffects(db, r, was){
  if (r.status === was || r.status === 'pending') return;
  if (r.kind === 'payment'){
    if (r.status === 'approved') db.tables.memberships.filter(m => m.property_id === r.property_id && m.role === 'landlord').forEach(m => notify(db, m.user_id, 'Dekont geldi', r.ref_id + ' kirası için ödeme yapıldı.'));
    else { const p = db.tables.payments.find(x => x.property_id === r.property_id && payRef(x) === r.ref_id && ['review','partial'].includes(x.status)); if (p){ p.status = 'rejected'; p.reject_reason = 'Denetim: ' + r.note; } }
  } else if (r.status === 'rejected' && r.uploader){
    notify(db, r.uploader, r.kind === 'invoice' ? 'Faturan kabul edilmedi' : 'Belgen kabul edilmedi', r.label + ': ' + r.note);
  }
}

/* Abonelik: schema.sql → access_state / require_access ile aynı kural. */
const TRIAL_DAYS = 30;
function accessOf(db, uid){
  const p = db.tables.profiles.find(x => x.id === uid);
  if (!p) return { access:false };
  const s = db.tables.subscriptions.find(x => x.user_id === uid);
  const subscribed = !!(s && s.active && (!s.expires_at || Date.parse(s.expires_at) > Date.now()));
  const trialEnds = new Date(Date.parse(p.created_at || now()) + TRIAL_DAYS * 86400000).toISOString();
  const inTrial = !subscribed && Date.now() < Date.parse(trialEnds);
  const org = (db.tables.org_members || []).some(m => m.user_id === uid && (db.tables.organizations.find(o => o.id === m.org_id) || {}).status === 'active');
  // schema.sql §21 ile aynı: paket ürün kimliğinden, mülk sınırı ürün kimliğindeki adetten.
  const pid = s?.product_id || '', pm = /^(tek|bes)_([1-9])_(aylik|yillik)$/.exec(pid);
  const plan = subscribed ? (/kurumsal/i.test(pid) ? 'kurumsal' : /(^|[._-])bes/.test(pid) ? 'bes' : /(^|[._-])tek/.test(pid) ? 'tek' : 'pro') : inTrial ? 'trial' : null;
  const units = subscribed && pm ? Number(pm[2]) : ({ tek:9, bes:9, trial:5 }[plan] ?? null);
  return { role:p.role, plan, units, trialPeriod: !!(subscribed && ['trial','intro'].includes(s?.period_type)), cardTrial:false,
    access: p.role === 'tenant' || p.role === 'team' || subscribed || inTrial || org, subscribed, inTrial, trialEnds, trialDays:TRIAL_DAYS,
    expiresAt: s?.expires_at || null, store: s?.store || null, productId: s?.product_id || null, willRenew: !!s?.will_renew, billingIssue: !!s?.billing_issue };
}
const GATED = ['properties','payments','rent_history','requests','documents','expenses','property_shared','invites'];

const matchKey = (table, a, b) => (KEYS[table] || ['id']).every(k => a[k] === b[k]);

class Query {
  constructor(client, table){ this.c = client; this.t = table; this.op = null; this.filters = []; this.opts = {}; }
  select(){ if (!this.op) this.op = 'select'; else this.returning = true; return this; }
  insert(rows){ this.op = 'insert'; this.rows = [].concat(rows); return this; }
  upsert(rows, o){ this.op = 'upsert'; this.rows = [].concat(rows); this.opts = o || {}; return this; }
  update(v){ this.op = 'update'; this.values = v; return this; }
  delete(){ this.op = 'delete'; return this; }
  eq(k, v){ this.filters.push(r => r[k] === v); return this; }
  in(k, v){ this.filters.push(r => v.includes(r[k])); return this; }
  lt(k, v){ this.filters.push(r => r[k] < v); return this; }
  gte(k, v){ this.filters.push(r => r[k] >= v); return this; }
  neq(k, v){ this.filters.push(r => r[k] !== v); return this; }
  range(a, b){ this.rng = [a, b]; return this; }
  gt(k, v){ this.filters.push(r => r[k] > v); return this; }
  is(k, v){ this.filters.push(r => (r[k] ?? null) === v); return this; }
  order(k, o){ this.orderBy = [k, o?.ascending !== false]; return this; }
  limit(n){ this.lim = n; return this; }
  single(){ this.one = true; return this; }
  maybeSingle(){ this.one = 'maybe'; return this; }
  then(res, rej){ return Promise.resolve().then(() => this.run()).then(res, rej); }

  run(){
    const db = load();
    this.c._calls.push({ table:this.t, op:this.op });
    // Kesinti benzetimi (testler): __fakefail=1 yazmalar, =2 her şey "Failed to fetch" verir; =3 yazmalar sunucu hatası verir (ağ değil).
    const ff = localStorage.getItem('__fakefail');
    if (ff === '2' || (ff === '1' && this.op !== 'select')) return { data:null, error:{ message:'Failed to fetch' } };
    if (ff === '3' && this.op !== 'select') return { data:null, error:{ message:'Sahte sunucu reddi kiraci@ornek.com', code:'XX000' } };
    if (this.c._fail && this.c._fail(this.t, this.op)) return { data:null, error:{ message:'Sahte sunucu hatası', code:'XX000' } };
    const actor = db.session?.user.id;
    if (actor && GATED.includes(this.t) && ['insert','upsert','update'].includes(this.op)){
      const a = accessOf(db, actor);
      if (a.role === 'landlord' && !a.access) return { data:null, error:{ message:'Abonelik gerekli: deneme süren bitti', code:'EV402' } };
    }
    const list = db.tables[this.t];
    const pass = r => this.filters.every(f => f(r));
    let out;

    if (this.op === 'select'){
      out = list.filter(r => pass(r) && visible(db, this.t, r, actor)).map(r => JSON.parse(JSON.stringify(r)));
      if (this.orderBy){ const [k, asc] = this.orderBy; out.sort((a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (asc ? 1 : -1)); }
      if (this.rng) out = out.slice(this.rng[0], this.rng[1] + 1);
      if (this.lim) out = out.slice(0, this.lim);
    } else if (this.op === 'insert' || this.op === 'upsert'){
      out = [];
      for (const raw of this.rows){
        const existing = this.op === 'upsert' ? list.find(r => matchKey(this.t, r, raw)) : null;
        if (existing){ const before = JSON.parse(JSON.stringify(existing)); Object.assign(existing, raw); trackReviews(db, this.t, existing, before, actor); out.push(existing); continue; }
        if (this.op === 'insert' && list.some(r => matchKey(this.t, r, raw) && KEYS[this.t].every(k => raw[k] != null)))
          return { data:null, error:{ message:'duplicate key', code:'23505' } };
        const row = defaults(this.t, raw, db);
        list.push(row);
        afterInsert(this.t, row, db);
        trackReviews(db, this.t, row, null, actor);
        out.push(row);
      }
    } else if (this.op === 'update'){
      out = list.filter(pass);
      if (this.t === 'reviews'){
        if (!isAdmin(db, actor)) return { data:null, error:{ message:'Denetim kararını yalnızca yönetici verebilir', code:'42501' } };
        if (this.values.status === 'rejected' && !String(this.values.note || '').trim()) return { data:null, error:{ message:'Red için gerekçe yazılmalı', code:'22023' } };
      }
      if (this.t === 'legal_requests'){
        // guard_legal / legal_after: kişi yalnız kendi "alındı" talebini iptal eder; yönetici değiştirince kişiye bildirim.
        const adm = isAdmin(db, actor);
        out = out.filter(r => adm || r.user_id === actor);
        if (!adm && (out.some(r => r.status !== 'received') || Object.keys(this.values).some(k => k !== 'status') || this.values.status !== 'cancelled'))
          return { data:null, error:{ message:'Talebi yalnız ekibimiz güncelleyebilir; inceleme başlamadan iptal edebilirsin.', code:'P0001' } };
        const LBL = { received:'Talebin alındı', paid:'Ödemen alındı', forwarded:'Hukuk bürosuna iletildi', closed:'Sonuçlandı', cancelled:'İptal edildi' };
        out.forEach(r => {
          const was = { status: r.status, reply: r.reply };
          Object.assign(r, this.values, { updated_at: now() });
          if (r.status !== was.status){
            if (['paid','forwarded','closed'].includes(r.status) && !r.paid_at) r.paid_at = now();
            if (['forwarded','closed'].includes(r.status) && !r.forwarded_at) r.forwarded_at = now();
            if (['closed','cancelled'].includes(r.status)) r.closed_at = now();
          }
          if (adm && (r.status !== was.status || r.reply !== was.reply))
            notify(db, r.user_id, 'Hukuki destek H-' + String(r.no).padStart(4, '0') + ': ' + LBL[r.status], r.reply || 'Talebinin durumu güncellendi.');
        });
        persist(db);
        return { data: this.one ? out[0] || null : out, error: null };
      }
      out.forEach(r => {
        const before = JSON.parse(JSON.stringify(r));
        Object.assign(r, this.values);
        if (this.t === 'reviews'){ if (r.status !== before.status){ r.reviewed_by = actor; r.reviewed_at = now(); } decideEffects(db, r, before.status); }
        else trackReviews(db, this.t, r, before, actor);
      });
    } else if (this.op === 'delete'){
      out = list.filter(pass);
      db.tables[this.t] = list.filter(r => !pass(r));
    }
    persist(db);
    if (this.one){
      if (!out.length) return this.one === 'maybe' ? { data:null, error:null } : { data:null, error:{ message:'Kayıt bulunamadı', code:'PGRST116' } };
      return { data:out[0], error:null };
    }
    return { data:out, error:null };
  }
}

export function createClient(url, key, opts){
  const listeners = [];
  const emit = (evt, session) => listeners.forEach(cb => setTimeout(() => cb(evt, session), 0));
  // Testler: sunucunun oturumu kapatmasını taklit eder (yenileme anahtarı geçersiz, başka cihazda şifre değişti).
  if (typeof window !== 'undefined') window.__fakeExpire = () => { const d = load(); d.session = null; persist(d); emit('SIGNED_OUT', null); };

  const client = {
    _calls: [],
    _fail: null,
    _opts: opts,
    auth: {
      async getSession(){ return { data:{ session: load().session }, error:null }; },
      onAuthStateChange(cb){
        listeners.push(cb);
        setTimeout(() => cb('INITIAL_SESSION', load().session), 0);
        return { data:{ subscription:{ unsubscribe(){} } } };
      },
      async signUp({ email, password, options }){
        const db = load();
        if (db.users.some(u => u.email === email)) return { data:{}, error:{ message:'User already registered' } };
        const meta = (options && options.data) || {};
        const user = { id: uuid(), email };
        db.users.push({ ...user, password, meta });
        db.tables.profiles.push({ id:user.id, role: meta.role === 'landlord' ? 'landlord' : 'tenant', name: meta.name || email, phone: meta.phone || '', lang:'tr', settings:{}, created_at: now() });
        // Doğrulama gerektiren kayıt: e-posta 'dogrula' ile başlıyorsa oturum açılmaz.
        if (/^dogrula/.test(email)){ persist(db); return { data:{ user, session:null }, error:null }; }
        db.session = { user, access_token:'fake' };
        persist(db);
        emit('SIGNED_IN', db.session);
        return { data:{ user, session: db.session }, error:null };
      },
      async signInWithPassword({ email, password }){
        const db = load();
        const u = db.users.find(x => x.email === email && x.password === password);
        if (!u) return { data:{}, error:{ message:'Invalid login credentials' } };
        db.session = { user:{ id:u.id, email:u.email }, access_token:'fake' };
        persist(db);
        emit('SIGNED_IN', db.session);
        return { data:{ session: db.session, user: db.session.user }, error:null };
      },
      async signOut(){ const db = load(); db.session = null; persist(db); emit('SIGNED_OUT', null); return { error:null }; },
      async resetPasswordForEmail(email, o){ client._calls.push({ reset:email, redirectTo:o && o.redirectTo }); return { data:{}, error:null }; },
      async exchangeCodeForSession(code){
        client._calls.push({ exchange:code });
        const db = load();
        const u = db.users[0];
        if (!u) return { data:{}, error:{ message:'invalid code' } };
        db.session = { user:{ id:u.id, email:u.email }, access_token:'fake' };
        persist(db);
        emit('SIGNED_IN', db.session);
        return { data:{ session:db.session, user:db.session.user, redirectType: code.startsWith('recovery') ? 'recovery' : null }, error:null };
      },
      async setSession({ access_token, refresh_token }){
        client._calls.push({ setSession:access_token });
        if (access_token === 'bad') return { data:{}, error:{ message:'invalid token' } };
        // "tok-<e-posta>" jetonu o kişinin oturumunu açar; diğerleri ilk kullanıcıyı.
        const db = load(); const u = db.users.find(x => access_token === 'tok-' + x.email) || db.users[0];
        db.session = { user:{ id:u.id, email:u.email }, access_token };
        persist(db); emit('SIGNED_IN', db.session);
        return { data:{ session:db.session, user:db.session.user }, error:null };
      },
      async verifyOtp({ token_hash, type }){
        client._calls.push({ verifyOtp:token_hash, type });
        return this.setSession({ access_token: token_hash, refresh_token:'r' });
      },
      async updateUser({ password, email }, o){
        const db = load();
        const u = db.users.find(x => x.id === db.session?.user.id);
        if (u && password) u.password = password;
        // Gerçek sunucu gibi: yeni e-posta onay bağlantısına tıklanınca geçerli olur.
        if (email) client._calls.push({ emailChange:email, redirectTo:o && o.emailRedirectTo });
        persist(db);
        return { data:{ user: db.session?.user }, error:null };
      }
    },
    from(t){ return new Query(client, t); },
    async rpc(name, args){
      if (localStorage.getItem('__fakefail') === '2') return { data:null, error:{ message:'Failed to fetch' } };
      const db = load();
      const me = db.session?.user.id;
      // schema.sql 24. bölüm: mülk başına son `lim` mesaj (üyelik kuralıyla), eskiden yeniye.
      if (name === 'report_error'){
        const p = args.p || {};
        db.tables.client_errors.push({ id: db.tables.client_errors.length + 1, at: now(), user_id: me || null, route: p.route || '', message: p.message || '',
          stack: p.stack || '', kind: p.kind || 'error', platform: p.platform || '', version: p.version || '', agent: '' });
        persist(db);
        return { data: null, error: null };
      }
      if (name === 'recent_messages'){
        const mine = new Set(db.tables.memberships.filter(m => m.user_id === me).map(m => m.property_id));
        const out = [];
        for (const pid of args.pids || []){
          if (!mine.has(pid)) continue;
          out.push(...db.tables.messages.filter(m => m.property_id === pid && visible(db, 'messages', m, me)).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, args.lim || 200));
        }
        return { data: out.sort((a, b) => (a.at < b.at ? -1 : 1)).map(r => JSON.parse(JSON.stringify(r))), error: null };
      }
      if (name === 'accept_invite'){
        const inv = db.tables.invites.find(i => i.code === String(args.invite_code).toUpperCase().trim());
        if (!inv) return { data:null, error:{ message:'Davet kodu bulunamadı' } };
        const prof = db.tables.profiles.find(p => p.id === me);
        if (prof.role !== 'tenant') return { data:null, error:{ message:'Davetler kiracı hesapları içindir' } };
        if (!db.tables.memberships.some(m => m.property_id === inv.property_id && m.user_id === me))
          db.tables.memberships.push({ property_id:inv.property_id, user_id:me, role:'tenant', display_name:prof.name, phone:'', email:db.session.user.email });
        inv.accepted_by = me;
        db.tables.messages.push({ id:uuid(), property_id:inv.property_id, from_role:'system', by_user:null, body:prof.name + ' eve katıldı', at:now() });
        persist(db);
        return { data:inv.property_id, error:null };
      }
      if (name === 'admin_cost_save' || name === 'admin_cost_delete'){
        // schema.sql (migration panel_gelir_gider): yalnız yönetici; her işlem İşlem kaydı'na.
        if (!isAdmin(db, me)) return { data:null, error:{ message:'Yönetici yetkisi gerekli', code:'42501' } };
        const T = db.tables;
        if (name === 'admin_cost_delete'){
          const x = T.admin_costs.find(r => r.id === args.cid);
          if (!x) return { data:null, error:{ message:'Gider bulunamadı', code:'P0002' } };
          T.admin_costs = T.admin_costs.filter(r => r.id !== args.cid);
          T.admin_audit.push({ id:T.admin_audit.length + 1, admin_id:me, action:'cost.delete', target:x.id, detail:{ title:x.title }, at:now() });
          persist(db); return { data:null, error:null };
        }
        const p = args.p || {};
        if (!String(p.title || '').trim()) return { data:null, error:{ message:'Başlık yaz.', code:'22023' } };
        if (!(Number(p.amount) > 0)) return { data:null, error:{ message:'Tutar sıfırdan büyük olmalı.', code:'22023' } };
        const row = { title:String(p.title).trim(), category:p.category || 'diger', amount:Number(p.amount), currency:p.currency || 'TRY', vat_included:p.vat_included !== false,
          vat_rate:p.vat_rate === '' || p.vat_rate == null ? 20 : Number(p.vat_rate), recurrence:p.recurrence || 'once', start_on:p.start_on || now().slice(0, 10), end_on:p.end_on || null, note:p.note || '', updated_at:now() };
        let id = p.id;
        const x = id && T.admin_costs.find(r => r.id === id);
        if (x) Object.assign(x, row); else { id = uuid(); T.admin_costs.push({ id, ...row, created_by:me, created_at:now() }); }
        T.admin_audit.push({ id:T.admin_audit.length + 1, admin_id:me, action:x ? 'cost.update' : 'cost.create', target:id, detail:{ title:row.title, amount:row.amount, currency:row.currency }, at:now() });
        persist(db); return { data:id, error:null };
      }
      if (name === 'admin_send_email'){
        // schema.sql (migration panel_eposta): yalnız yönetici; kuyruğa admin_message, kayıt ve gerekirse "Son temas" notu.
        if (!isAdmin(db, me)) return { data:null, error:{ message:'Yönetici yetkisi gerekli', code:'42501' } };
        const p = args.p || {}, to = String(p.to || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { data:null, error:{ message:'Geçerli bir e-posta adresi yaz.', code:'22023' } };
        if (!String(p.subject || '').trim() || !String(p.body || '').trim()) return { data:null, error:{ message:'Konu ve mesaj yaz.', code:'22023' } };
        const id = uuid();
        db.tables.mail_outbox.push({ id:db.tables.mail_outbox.length + 1, kind:'admin_message', to_email:to, data:{ subject:p.subject, body:p.body }, created_at:now() });
        db.tables.admin_emails.push({ id, to_email:to, subject:p.subject, body:p.body, request_id:p.request_id || null, user_id:p.user_id || null, org_id:p.org_id || null, sent_by:me, created_at:now() });
        if (p.user_id || p.org_id) db.tables.customer_contacts.push({ id:uuid(), user_id:p.user_id || null, org_id:p.org_id || null, note:'E-posta gönderildi: ' + p.subject, created_by:me, created_at:now() });
        persist(db);
        return { data:id, error:null };
      }
      if (name === 'admin_set_cpi'){
        if (!isAdmin(db, me)) return { data:null, error:{ message:'Yönetici yetkisi gerekli', code:'42501' } };
        db.tables.cpi_rates = (db.tables.cpi_rates || []).filter(r => r.month !== args.m);
        if (args.rate != null) db.tables.cpi_rates.push({ month:args.m, avg12:Math.round(args.rate * 100) / 100, source:'manual', updated_at:now() });
        persist(db);
        return { data:null, error:null };
      }
      if (name === 'submit_lead'){
        const p = args.p || {};
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email || '')) return { data:null, error:{ message:'Geçerli bir e-posta adresi yaz.' } };
        if (!p.consent) return { data:null, error:{ message:'Aydınlatma metnini onayla.' } };
        db.tables.support_requests = db.tables.support_requests || [];
        const id = uuid();
        db.tables.support_requests.push({ id, user_id:me || null, kind:'kurumsal', units: p.units ? Number(p.units) : null, name:p.name, email:p.email, phone:p.phone || '',
          message:p.message || '', company:p.company || '', source:'web', details:{ types:p.types || [], role:p.role || '', city:p.city || '', timeline:p.timeline || '' }, status:'open', created_at:now() });
        persist(db);
        return { data:id, error:null };
      }
      // Kurumlar: schema.sql 16. bölüm ile aynı kurallar (özet).
      if (/^(my_orgs|org_|accept_org_invite|admin_org|admin_add_property|investor_report_mail)/.test(name)){
        const T = db.tables, A = args || {};
        const PERMS = ['org.settings','org.members','units.manage','residents.manage','charges.manage','payments.approve','expenses.manage','requests.manage','announce','documents.manage','reports.view'];
        const MODS = ['kira','aidat','gider_dagitim','duyuru','ciro_kira','ortak_gider','endeksleme','doluluk','onay_akisi','rapor','api','yatirimci'];
        const SECMOD = { site:['aidat','gider_dagitim','duyuru','rapor'], avm:['kira','ortak_gider','ciro_kira','doluluk','rapor'], depo:['kira','ortak_gider','endeksleme','rapor'], gyo:['kira','ortak_gider','endeksleme','doluluk','duyuru','rapor','yatirimci'] };
        const err = (message, code = '42501') => ({ data:null, error:{ message, code } });
        const ok = (data) => { persist(db); return { data, error:null }; };
        const adm = isAdmin(db, me);
        const mem = (oid, uid = me) => T.org_members.find(m => m.org_id === oid && m.user_id === uid);
        const master = (oid) => !!(mem(oid) || {}).is_master;
        const can = (oid, perm) => { const m = mem(oid), o = T.organizations.find(x => x.id === oid); if (!m || !o || o.status !== 'active') return false;
          return m.is_master || ((T.org_roles.find(r => r.id === m.role_id) || {}).perms || []).includes(perm); };
        const code = () => 'K' + Math.random().toString(16).slice(2, 9).toUpperCase().padEnd(7, '0');
        const pname = id => (T.profiles.find(p => p.id === id) || {}).name || '';
        const pmail = id => (db.users.find(u => u.id === id) || {}).email || '';
        const setMaster = (oid, uid) => { T.org_members.forEach(m => { if (m.org_id === oid && m.is_master && m.user_id !== uid) m.is_master = false; });
          const m = mem(oid, uid); if (m) Object.assign(m, { is_master:true, role_id:null }); else T.org_members.push({ org_id:oid, user_id:uid, role_id:null, is_master:true, created_at:now() }); };
        if (name === 'investor_report_mail'){
          if (!can(A.oid, 'reports.view')) return err('Rapor yetkin yok');
          const o = T.organizations.find(x => x.id === A.oid);
          if (!o || !(o.modules || []).includes('yatirimci')) return err('Yatırımcı raporu bu kurumda kapalı');
          const u = db.users.find(x => x.id === me) || {};
          T.mail_outbox.push({ id:T.mail_outbox.length + 1, kind:'investor_report', to_email:u.email || '', data:{ ...(A.summary || {}), org:o.name, oid:o.id, period:A.period, uid:me }, created_at:now() });
          return ok(null);
        }
        if (name === 'my_orgs') return ok(T.org_members.filter(m => m.user_id === me).map(m => {
          const o = T.organizations.find(x => x.id === m.org_id), r = T.org_roles.find(x => x.id === m.role_id);
          return { id:o.id, name:o.name, sector:o.sector, modules:o.modules, status:o.status, units:o.units ?? null, report_currency:o.report_currency || 'USD', master:m.is_master,
                   role: r ? { id:r.id, name:r.name } : null, perms: m.is_master ? PERMS : (r ? r.perms : []) };
        }).sort((a, b) => a.name.localeCompare(b.name)));
        if (name === 'org_detail'){
          if (!mem(A.oid) && !adm) return err('Bu kurumda yetkin yok');
          const o = T.organizations.find(x => x.id === A.oid);
          return ok({ org:o, roles: T.org_roles.filter(r => r.org_id === A.oid).sort((a, b) => a.position - b.position).map(r => ({ id:r.id, name:r.name, perms:r.perms, count:T.org_members.filter(m => m.role_id === r.id).length })),
            members: T.org_members.filter(m => m.org_id === A.oid).map(m => ({ user_id:m.user_id, name:pname(m.user_id), email:pmail(m.user_id), role_id:m.role_id, master:m.is_master, since:m.created_at }))
              .sort((a, b) => (b.master - a.master) || a.name.localeCompare(b.name)),
            invites: (adm || can(A.oid, 'org.members')) ? T.org_invites.filter(i => i.org_id === A.oid && !i.accepted_by).map(i => ({ code:i.code, role_id:i.role_id, master:i.master, email:i.email, expires_at:i.expires_at })) : [] });
        }
        if (name === 'org_role_save'){
          if (!(master(A.oid) && can(A.oid, 'org.members')) && !adm) return err('Rolleri yalnızca master yönetici düzenler');
          const nm = String(A.nm || '').trim();
          if (!nm) return err('Rol adını yaz', '22023');
          if ((A.perms || []).some(x => !PERMS.includes(x))) return err('Geçersiz yetki', '22023');
          if (T.org_roles.some(r => r.org_id === A.oid && r.name.toLowerCase() === nm.toLowerCase() && r.id !== A.rid)) return err('Bu adla bir rol var', '23505');
          const perms = [...new Set(A.perms || [])].sort();
          if (A.rid){ const r = T.org_roles.find(x => x.id === A.rid && x.org_id === A.oid); if (!r) return err('Rol bulunamadı', 'P0002'); Object.assign(r, { name:nm, perms }); return ok(r.id); }
          const id = uuid(); T.org_roles.push({ id, org_id:A.oid, name:nm, perms, position:T.org_roles.filter(r => r.org_id === A.oid).length + 1 }); return ok(id);
        }
        if (name === 'org_role_delete'){
          const r = T.org_roles.find(x => x.id === A.rid); if (!r) return err('Rol bulunamadı', 'P0002');
          if (!(master(r.org_id) && can(r.org_id, 'org.members')) && !adm) return err('Rolleri yalnızca master yönetici düzenler');
          T.org_roles = T.org_roles.filter(x => x.id !== A.rid); T.org_members.forEach(m => { if (m.role_id === A.rid) m.role_id = null; }); return ok(null);
        }
        if (name === 'org_invite_create'){
          if (!can(A.oid, 'org.members') && !adm) return err('Yönetici davet etme yetkin yok');
          if (A.rid && !T.org_roles.some(r => r.id === A.rid && r.org_id === A.oid)) return err('Rol bu kuruma ait değil', '22023');
          const c = code(); T.org_invites.push({ code:c, org_id:A.oid, role_id:A.rid || null, master:false, email:A.mail || '', expires_at:new Date(Date.now() + 14 * 864e5).toISOString(), accepted_by:null }); return ok(c);
        }
        if (name === 'org_invite_delete'){ const i = T.org_invites.find(x => x.code === A.c); if (i && !can(i.org_id, 'org.members') && !adm) return err('Yetki yok'); T.org_invites = T.org_invites.filter(x => x.code !== A.c); return ok(null); }
        if (name === 'accept_org_invite'){
          const i = T.org_invites.find(x => x.code === String(A.invite_code).trim().toUpperCase());
          if (!i) return err('Davet kodu bulunamadı', 'P0002');
          if (i.accepted_by && i.accepted_by !== me) return err('Bu davet kullanılmış', '22023');
          if (i.master) setMaster(i.org_id, me);
          else { const m = mem(i.org_id); if (m){ if (!m.is_master) m.role_id = i.role_id; } else T.org_members.push({ org_id:i.org_id, user_id:me, role_id:i.role_id, is_master:false, created_at:now() }); }
          i.accepted_by = me; return ok(i.org_id);
        }
        if (name === 'org_member_set'){
          if (!can(A.oid, 'org.members') && !adm) return err('Yönetici düzenleme yetkin yok');
          const m = mem(A.oid, A.member); if (!m) return err('Bu kişi kurumda değil', 'P0002');
          if (m.is_master) return err('Master yöneticinin rolü değiştirilemez', '22023');
          m.role_id = A.rid || null; return ok(null);
        }
        if (name === 'org_member_remove'){
          if (A.member !== me && !can(A.oid, 'org.members') && !adm) return err('Yönetici çıkarma yetkin yok');
          if ((mem(A.oid, A.member) || {}).is_master) return err('Master yönetici çıkarılamaz; önce master yetkisini devret', '22023');
          T.org_members = T.org_members.filter(m => !(m.org_id === A.oid && m.user_id === A.member)); return ok(null);
        }
        if (name === 'org_transfer_master'){
          if (!master(A.oid) && !adm) return err('Yalnızca master yönetici devredebilir');
          if (!mem(A.oid, A.member)) return err('Bu kişi kurumda değil', 'P0002');
          setMaster(A.oid, A.member); return ok(null);
        }
        if (!adm) return err('Yönetici yetkisi gerekli');
        const audit = (action, target, detail) => T.admin_audit.push({ id:T.admin_audit.length + 1, admin_id:me, action, target, detail:detail || {}, at:now() });
        if (name === 'admin_orgs') return ok(T.organizations.slice().reverse().map(o => {
          const mm = T.org_members.find(m => m.org_id === o.id && m.is_master), inv = T.org_invites.find(i => i.org_id === o.id && i.master && !i.accepted_by);
          return Object.assign({}, o, { members:T.org_members.filter(m => m.org_id === o.id).length, unit_count:T.properties.filter(p => p.org_id === o.id).length,
            master: mm ? { id:mm.user_id, name:pname(mm.user_id), email:pmail(mm.user_id) } : null, master_invite: inv ? inv.code : null });
        }));
        if (name === 'admin_org_save'){
          const p = A.p || {};
          if (!['site','avm','gyo','depo','emlak','family','diger'].includes(p.sector)) return err('Sektör seç', '22023');
          if (String(p.name || '').trim().length < 2) return err('Kurum adını yaz', '22023');
          const mods = p.modules ? [...new Set(p.modules)].sort() : (SECMOD[p.sector] || ['kira','rapor']);
          if (mods.some(x => !MODS.includes(x))) return err('Geçersiz modül', '22023');
          const fields = { name:String(p.name).trim(), sector:p.sector, modules:mods, units:p.units ? Number(p.units) : null, contract_until:p.contract_until || null, billing:p.billing || {}, note:p.note || '', report_currency:p.report_currency === 'EUR' ? 'EUR' : 'USD' };
          if (!p.id){
            const id = uuid();
            T.organizations.push(Object.assign({ id, status:p.status || 'active', lead_id:p.lead_id || null, created_at:now() }, fields));
            const site = p.sector === 'site';
            [[site ? 'Muhasebe' : 'Muhasebe ve finans', ['charges.manage','payments.approve','expenses.manage','reports.view']],
             [site ? 'Teknik ekip' : 'Operasyon ve teknik', ['requests.manage','documents.manage','units.manage']],
             [site ? 'Güvenlik ve resepsiyon' : 'Kiracı ilişkileri', ['requests.manage','announce','residents.manage']],
             [site ? 'Yönetim kurulu' : 'Salt okunur', ['reports.view']]].forEach(([n, pp], i) => T.org_roles.push({ id:uuid(), org_id:id, name:n, perms:pp, position:i + 1 }));
            if (p.lead_id){ const l = (T.support_requests || []).find(r => r.id === p.lead_id); if (l) l.status = 'done'; }
            audit('org.create', id, { name:fields.name, sector:p.sector });
            return ok(id);
          }
          const o = T.organizations.find(x => x.id === p.id); if (!o) return err('Kurum bulunamadı', 'P0002');
          Object.assign(o, fields, { status:p.status || o.status }); audit('org.update', o.id, { name:o.name }); return ok(o.id);
        }
        if (name === 'admin_org_delete'){
          // schema.sql → admin_org_delete ile aynı kural: yalnız askıdaki kurum; mülkler kalır (org_id boşalır).
          const o = T.organizations.find(x => x.id === A.oid); if (!o) return err('Kurum bulunamadı', 'P0002');
          if (o.status !== 'paused') return err('Önce kurumu askıya al, sonra sil', '22023');
          const props = T.properties.filter(p => p.org_id === o.id), mem = (T.org_members || []).filter(x => x.org_id === o.id);
          audit('org.delete', o.id, { name:o.name, sector:o.sector, members:mem.length, properties:props.length });
          props.forEach(p => { p.org_id = null; });
          T.organizations = T.organizations.filter(x => x.id !== o.id);
          ['org_members','org_roles','org_invites'].forEach(k => { if (T[k]) T[k] = T[k].filter(x => x.org_id !== o.id); });
          return ok(null);
        }
        if (name === 'admin_add_property'){
          // schema.sql §20 admin_add_property ile aynı kural (sınır aşılabilir, "over" bildirilir).
          const prof = T.profiles.find(x => x.id === A.owner_uid);
          if (!prof) return err('Hesap bulunamadı', 'P0002');
          if (prof.role !== 'landlord') return err('Bu hesap mülk sahibi hesabı değil', '22023');
          const q = A.p || {};
          if (String(q.name || '').trim().length < 2) return err('Mülk adını yaz', '22023');
          const mm = T.org_members.find(m => m.user_id === A.owner_uid && m.is_master);
          const org = mm ? T.organizations.find(o => o.id === mm.org_id && o.status === 'active') : null;
          const sd = q.start_date || today();
          const row = defaults('properties', { owner_id:A.owner_uid, name:String(q.name).trim(), addr:q.addr || '', prop_type:q.prop_type || 'Konut', rent:Number(q.rent || 0), due_day:Number(q.due_day || 1),
            deposit:Number(q.deposit || 0), start_date:sd, contract_end:q.contract_end || sd, org_id: org ? org.id : null }, db);
          T.properties.push(row); afterInsert('properties', row, db);
          const n = org ? T.properties.filter(x => x.org_id === org.id || x.owner_id === A.owner_uid).length : T.properties.filter(x => x.owner_id === A.owner_uid).length;
          const lim = org ? (org.units ?? null) : null;
          audit('property.add', row.id, { owner:A.owner_uid, name:row.name });
          return ok({ id:row.id, count:n, limit:lim, over: lim != null && n > lim });
        }
        if (name === 'admin_org_set_master'){
          const mail = String(A.mail || '').trim().toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return err('Geçerli bir e-posta adresi yaz.', '22023');
          const u = db.users.find(x => x.email.toLowerCase() === mail);
          if (u){ setMaster(A.oid, u.id); audit('org.master', A.oid, { email:mail }); return ok({ status:'set', user:u.id }); }
          T.org_invites = T.org_invites.filter(i => !(i.org_id === A.oid && i.master && !i.accepted_by));
          const c = code(); T.org_invites.push({ code:c, org_id:A.oid, role_id:null, master:true, email:mail, expires_at:new Date(Date.now() + 14 * 864e5).toISOString(), accepted_by:null });
          audit('org.master_invite', A.oid, { email:mail }); return ok({ status:'invited', code:c });
        }
      }
      if (name === 'my_site_units'){
        const T = db.tables, by = {};
        siteLinks(db, me).forEach(l => { by[l.unit_id] = by[l.unit_id] === 'malik' || l.role === 'malik' ? 'malik' : 'kiraci'; });
        return { data: Object.keys(by).map(id => {
          const u = T.site_units.find(x => x.id === id) || {}, o = (T.organizations || []).find(x => x.id === u.org_id) || {};
          const prop = T.properties.find(p => p.site_unit_id === id && (p.owner_id === me || T.memberships.some(m => m.property_id === p.id && m.user_id === me)));
          // Sunucudaki site_payer: seçilen rolde hesabı bağlı kimse yoksa (diğerinde varsa) diğer rol öder.
          const roles = new Set([...T.site_residents.filter(r => r.unit_id === id && r.user_id).map(r => r.role),
            ...T.properties.filter(p => p.site_unit_id === id && T.memberships.some(m => m.property_id === p.id && m.role === 'tenant')).map(() => 'kiraci')]);
          const payer = u.payer || 'kiraci', eff = roles.has(payer) || !roles.size ? payer : (payer === 'kiraci' ? 'malik' : 'kiraci');
          return { unit_id:u.id, org_id:o.id, org:o.name, sector:o.sector, block:u.block || '', no:u.no, area:u.area ?? null, aidat:u.aidat ?? null, payer, role:by[id],
                   payer_effective:eff, pays: eff === by[id],
                   rent:u.rent ?? null, currency:u.currency || 'TRY', turnover_rate:u.turnover_rate ?? null, lease_start:u.lease_start || null, lease_end:u.lease_end || null, property_id: prop ? prop.id : null };
        }), error:null };
      }
      if (name === 'link_site_unit'){
        const T = db.tables, p = T.properties.find(x => x.id === args.pid);
        if (!p || p.owner_id !== me) return { data:null, error:{ message:'Yalnızca mülk sahibi bağlayabilir', code:'42501' } };
        if (args.unit && !T.site_residents.some(r => r.unit_id === args.unit && r.user_id === me && r.role === 'malik')) return { data:null, error:{ message:'Bu dairenin maliki olarak kayıtlı değilsin', code:'42501' } };
        p.site_unit_id = args.unit || null; persist(db);
        return { data:null, error:null };
      }
      if (name === 'site_cash_summary'){
        // schema.sql (migration duzenli_gider_seffaflik): yönetim her zaman; sakin yalnız yönetim paylaştıysa.
        const T = db.tables, oid = args.oid, m = args.m;
        const c = (T.site_cash || []).find(x => x.org_id === oid);
        const staff = (T.org_members || []).some(x => x.org_id === oid && x.user_id === me);
        const resident = siteLinks(db, me).some(x => x.org_id === oid);
        if (!staff && !(resident && c && c.share_summary)) return { data:null, error:{ message:'Kasa özeti paylaşılmıyor', code:'42501' } };
        const start = c && c.opening_on ? String(c.opening_on).slice(0, 10) : '0000-00-00', d0 = m + '-01';
        const next = (() => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 10); })();
        const last = (mm) => { const [y, mo] = mm.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
        const col = (T.site_charges || []).filter(x => x.org_id === oid && ['aidat','yakit','demirbas','ozel'].includes(x.kind) && ['paid','partial'].includes(x.status))
          .map(x => ({ day: x.paid_on ? String(x.paid_on).slice(0, 10) : last(x.month), v: x.status === 'paid' ? Number(x.amount) : Number(x.paid_amount) || 0 }));
        const ex = (T.site_expenses || []).filter(x => x.org_id === oid).map(x => ({ day: String(x.spent_on).slice(0, 10), v: Number(x.amount), cat: x.cat, x }));
        const sum = (l, f) => l.filter(f).reduce((a, x) => a + x.v, 0);
        const carry = (Number(c?.opening) || 0) + sum(col, x => x.day >= start && x.day < d0) - sum(ex, x => x.day >= start && x.day < d0);
        const inM = x => x.day >= start && x.day >= d0 && x.day < next;
        const income = sum(col, inM), spent = sum(ex, inM);
        const byCat = Object.entries(ex.filter(inM).reduce((a, x) => { a[x.cat] = (a[x.cat] || 0) + x.v; return a; }, {})).map(([cat, total]) => ({ cat, total })).sort((a, b) => b.total - a.total);
        const receipts = staff || (c && c.share_receipts) ? ex.filter(x => inM(x) && x.x.receipt_path).map(x => ({ cat:x.cat, amount:x.v, day:x.day, name:x.x.receipt_name, path:x.x.receipt_path })) : null;
        return { data:{ month:m, carry, income, spent, left: carry + income - spent, byCat, receipts }, error:null };
      }
      if (name === 'site_linked_tenants'){
        const T = db.tables;
        return { data: T.properties.filter(p => p.site_unit_id && (T.site_units.find(u => u.id === p.site_unit_id) || {}).org_id === args.oid)
          .flatMap(p => T.memberships.filter(m => m.property_id === p.id && m.role === 'tenant').map(m => ({ unit_id:p.site_unit_id, name:m.display_name }))), error:null };
      }
      // Kira geçmişi belgesi (migration kira_gecmisi_belgesi ile aynı kural).
      if (name === 'create_rent_certificate'){
        const T = db.tables, p = T.properties.find(x => x.id === args.pid);
        if (!p || roleIn(db, me, args.pid) !== 'tenant') return { data:null, error:{ message:'Yalnız mülkün kiracısı belge alabilir', code:'42501' } };
        if (args.from_month > args.to_month) return { data:null, error:{ message:'Dönem geçersiz', code:'22023' } };
        const due = Math.min(28, Math.max(1, Number(p.due_day) || 1));
        const onTime = (r) => !!r.paid_on && r.paid_on <= r.month + '-' + String(due).padStart(2, '0');
        const rows = T.payments.filter(y => y.property_id === p.id && (y.kind || 'kira') === 'kira' && y.status === 'approved' && y.month >= args.from_month && y.month <= args.to_month)
          .sort((a, b) => a.month.localeCompare(b.month)).map(y => ({ month:y.month, amount:Number(y.amount), paid_on:y.paid_on || null, on_time:onTime(y) }));
        const pr = T.profiles.find(x => x.id === me) || {}, lp = T.profiles.find(x => x.id === p.owner_id) || {};
        const short = (n) => { const w = String(n || '').trim().split(/\s+/); return w.length > 1 ? w.slice(0, -1).join(' ') + ' ' + w[w.length - 1][0] + '.' : w[0] || ''; };
        const data = { tenant:pr.name, property:p.name, addr:p.addr, landlord:short(lp.name), from:args.from_month, to:args.to_month, rows,
          months:rows.length, on_time:rows.filter(r => r.on_time).length, total:rows.reduce((a, r) => a + r.amount, 0), issued_at:now() };
        const code = Math.random().toString(16).slice(2, 12).toUpperCase().padEnd(10, '0');
        T.rent_certificates.push({ code, property_id:p.id, tenant_id:me, from_month:args.from_month, to_month:args.to_month, data, created_at:now() });
        persist(db);
        return { data:{ code, data }, error:null };
      }
      if (name === 'verify_rent_certificate'){
        const r = db.tables.rent_certificates.find(x => x.code === String(args.cert || '').trim().toUpperCase());
        return { data: r ? Object.assign({}, r.data, { code:r.code }) : null, error:null };
      }
      // Genel kurul ve yoklama (migration genel_kurul_yoklama ile aynı kural).
      if (name === 'site_meeting_reply' || name === 'site_poll_vote'){
        const T = db.tables, links = siteLinks(db, me).filter(l => l.unit_id === args.unit);
        const role = links.some(l => l.role === 'malik') ? 'malik' : links.length ? 'kiraci' : null;
        if (name === 'site_meeting_reply'){
          const m = T.site_meetings.find(x => x.id === args.mid);
          if (!m) return { data:null, error:{ message:'Toplantı bulunamadı', code:'P0002' } };
          if (role !== 'malik') return { data:null, error:{ message:'Yalnız dairenin maliki yanıt verebilir', code:'42501' } };
          if (m.status !== 'cagrildi') return { data:null, error:{ message:'Toplantı kapandı', code:'22023' } };
          if (args.answer === 'vekalet' && String(args.proxy || '').trim().length < 2) return { data:null, error:{ message:'Vekilin adını yaz', code:'22023' } };
          T.site_meeting_replies = T.site_meeting_replies.filter(x => !(x.meeting_id === m.id && x.unit_id === args.unit));
          T.site_meeting_replies.push({ meeting_id:m.id, unit_id:args.unit, org_id:m.org_id, user_id:me, answer:args.answer, proxy_name: args.answer === 'vekalet' ? String(args.proxy).trim() : '', updated_at:now() });
        } else {
          const p = T.site_polls.find(x => x.id === args.pid);
          if (!p) return { data:null, error:{ message:'Yoklama bulunamadı', code:'P0002' } };
          if (!role || (p.voters === 'malik' && role !== 'malik')) return { data:null, error:{ message:'Bu daire adına oy veremezsin', code:'42501' } };
          if (Date.now() >= Date.parse(p.ends_at)) return { data:null, error:{ message:'Yoklama bitti', code:'22023' } };
          if (!(args.choice >= 0 && args.choice < p.options.length)) return { data:null, error:{ message:'Seçenek geçersiz', code:'22023' } };
          T.site_votes = T.site_votes.filter(x => !(x.poll_id === p.id && x.unit_id === args.unit));
          T.site_votes.push({ poll_id:p.id, unit_id:args.unit, org_id:p.org_id, user_id:me, choice:args.choice, updated_at:now() });
        }
        persist(db);
        return { data:null, error:null };
      }
      if (name === 'site_poll_results'){
        const T = db.tables, p = T.site_polls.find(x => x.id === args.pid);
        if (!p) return { data:null, error:null };
        const units = T.site_units.filter(u => u.org_id === p.org_id), share = (id) => Number((units.find(u => u.id === id) || {}).share) || 0;
        const votes = T.site_votes.filter(v => v.poll_id === p.id);
        return { data:{ units:units.length, share:units.reduce((a, u) => a + (Number(u.share) || 0), 0), voted:votes.length,
          voted_share:votes.reduce((a, v) => a + share(v.unit_id), 0), closed: Date.now() >= Date.parse(p.ends_at),
          options:p.options.map((label, i) => { const vs = votes.filter(v => v.choice === i); return { label, count:vs.length, share:vs.reduce((a, v) => a + share(v.unit_id), 0) }; }) }, error:null };
      }
      if (name === 'invite_preview'){
        const i = db.tables.invites.find(x => x.code === String(args.invite_code || '').trim().toUpperCase());
        if (!i) return { data:null, error:null };
        const p = db.tables.properties.find(x => x.id === i.property_id) || {}, o = db.tables.profiles.find(x => x.id === i.created_by) || {};
        return { data:{ role:i.role || 'tenant', scope:i.scope, owner:o.name, property:p.name, valid:!i.accepted_by && (!i.expires_at || new Date(i.expires_at) > new Date()) }, error:null };
      }
      if (name === 'site_invite_info'){
        const T = db.tables, r = T.site_residents.find(x => x.code === String(args.invite_code || '').trim().toUpperCase());
        if (!r) return { data:null, error:null };
        const u = T.site_units.find(x => x.id === r.unit_id) || {}, o = (T.organizations || []).find(x => x.id === r.org_id) || {};
        const unit = o.sector === 'site' ? (u.block ? u.block + ' Blok ' : '') + (/^\d/.test(String(u.no)) ? 'No ' : '') + u.no : (u.block ? u.block + ' · ' : '') + u.no;
        return { data: r.user_id ? { org:o.name, unit, used:true } : { org:o.name, sector:o.sector, unit, role:r.role, name:r.name, phone:r.phone, email:r.email, used:false }, error:null };
      }
      if (name === 'accept_site_invite'){
        const r = db.tables.site_residents.find(x => x.code === String(args.invite_code).trim().toUpperCase());
        if (!r) return { data:null, error:{ message:'Davet kodu bulunamadı', code:'P0002' } };
        if (r.user_id && r.user_id !== me) return { data:null, error:{ message:'Bu davet kullanılmış', code:'22023' } };
        r.user_id = me; persist(db);
        return { data:r.unit_id, error:null };
      }
      if (name === 'is_admin') return { data: !!me && isAdmin(db, me), error:null };
      if (name === 'admin_users'){
        if (!isAdmin(db, me)) return { data:null, error:{ message:'Yönetici yetkisi gerekli', code:'42501' } };
        return { data: db.tables.profiles.map(p => {
          const u = db.users.find(x => x.id === p.id) || {};
          const s = db.tables.subscriptions.find(x => x.user_id === p.id);
          const b = db.tables.bans.find(x => x.user_id === p.id);
          return { id:p.id, email:u.email || '', name:p.name, role:p.role, phone:p.phone || '', created_at:p.created_at, is_admin:isAdmin(db, p.id),
                   subscribed: !!(s && s.active && (!s.expires_at || Date.parse(s.expires_at) > Date.now())), expires_at: s ? s.expires_at : null,
                   banned: !!b, ban_reason: b ? b.reason : null, banned_at: b ? b.banned_at : null };
        }), error:null };
      }
      if (name === 'admin_subscriptions'){
        if (!isAdmin(db, me)) return { data:null, error:{ message:'Yönetici yetkisi gerekli', code:'42501' } };
        return { data: db.tables.profiles.filter(p => p.role === 'landlord').map(p => {
          const u = db.users.find(x => x.id === p.id) || {};
          const a = accessOf(db, p.id);
          const s = db.tables.subscriptions.find(x => x.user_id === p.id);
          return { id:p.id, name:p.name, email:u.email || '', created_at:p.created_at, subscribed:!!a.subscribed, in_trial:!!a.inTrial, trial_ends:a.trialEnds,
                   extra_days:0, plan:a.plan, store:s ? s.store : null, expires_at:s ? s.expires_at : null, will_renew:false, billing_issue:false,
                   banned:db.tables.bans.some(b => b.user_id === p.id), units:db.tables.properties.filter(x => x.owner_id === p.id).length, tenants:0,
                   choice:null, plan_units:s ? s.units || null : null, plan_sector:s ? s.sector || null : null };
        }), error:null };
      }
      if (name === 'admin_set_plan'){
        // schema.sql → admin_set_plan ile aynı doğrulama ve kayıt.
        const bad = m => ({ data:null, error:{ message:m, code:'22023' } });
        if (!isAdmin(db, me)) return { data:null, error:{ message:'Yönetici yetkisi gerekli', code:'42501' } };
        const plan = args.plan || '', n = args.unit_count, sec = args.sec;
        if (!plan) db.tables.subscriptions = db.tables.subscriptions.filter(x => !(x.user_id === args.uid && x.store === 'admin'));
        else {
          if (!['tek','bes','kurumsal'].includes(plan)) return bad('Geçersiz paket');
          let pid = 'kurumsal', sector = sec;
          if (plan !== 'kurumsal'){
            if (!n || n < 1 || n > 9) return bad('Mülk adedi 1-9 olmalı');
            sector = null; pid = plan + '_' + n + '_aylik';
          } else {
            if (!n || n < 1) return bad('Mülk adedi gerekli');
            if (!['site','avm','gyo','depo','emlak','family','diger'].includes(sec)) return bad('Sektör gerekli');
          }
          db.tables.subscriptions = db.tables.subscriptions.filter(x => x.user_id !== args.uid);
          db.tables.subscriptions.push({ user_id:args.uid, entitlement:'pro', product_id:pid, store:'admin', expires_at:args.until || null, active:true, will_renew:false,
                                         billing_issue:false, units:n, sector:sector || null, updated_at:now() });
        }
        db.tables.admin_audit.push({ id:db.tables.admin_audit.length + 1, admin_id:me, action:'plan.set', target:args.uid, detail:{ plan:plan || null, until:args.until || null, reason:args.why, units:n || null, sector:sec || null }, at:now() });
        persist(db);
        return { data:null, error:null };
      }
      if (/^admin_(set_ban|delete_user|threads|messages|delete_message|audit_log)$/.test(name)){
        if (!isAdmin(db, me)) return { data:null, error:{ message:'Yönetici yetkisi gerekli', code:'42501' } };
        const audit = (action, target, detail) => db.tables.admin_audit.push({ id:db.tables.admin_audit.length + 1, admin_id:me, action, target, detail:detail || {}, at:now() });
        const nameOfUser = id => (db.tables.profiles.find(p => p.id === id) || {}).name || null;
        if (name === 'admin_set_ban'){
          if (args.uid === me) return { data:null, error:{ message:'Kendini yasaklayamazsın', code:'22023' } };
          if (isAdmin(db, args.uid)) return { data:null, error:{ message:'Yönetici yasaklanamaz', code:'22023' } };
          if (args.ban){
            if (!String(args.why || '').trim()) return { data:null, error:{ message:'Yasaklama için gerekçe yaz', code:'22023' } };
            db.tables.bans = db.tables.bans.filter(b => b.user_id !== args.uid);
            db.tables.bans.push({ user_id:args.uid, reason:String(args.why).trim(), banned_by:me, banned_at:now() });
          } else db.tables.bans = db.tables.bans.filter(b => b.user_id !== args.uid);
          audit(args.ban ? 'user.ban' : 'user.unban', args.uid, { reason: args.why || '' });
          persist(db);
          return { data:null, error:null };
        }
        if (name === 'admin_delete_user'){
          if (args.uid === me) return { data:null, error:{ message:'Kendi hesabını buradan silemezsin', code:'22023' } };
          if (isAdmin(db, args.uid)) return { data:null, error:{ message:'Yönetici silinemez', code:'22023' } };
          if (!db.tables.bans.some(b => b.user_id === args.uid)) return { data:null, error:{ message:'Önce hesabı yasakla, sonra sil', code:'22023' } };
          const gone = db.users.find(u => u.id === args.uid);
          audit('user.delete', args.uid, { email: gone ? gone.email : '', reason: args.why || '' });
          const ownedIds = db.tables.properties.filter(p => p.owner_id === args.uid).map(p => p.id);
          db.users = db.users.filter(u => u.id !== args.uid);
          db.tables.profiles = db.tables.profiles.filter(p => p.id !== args.uid);
          db.tables.bans = db.tables.bans.filter(b => b.user_id !== args.uid);
          db.tables.memberships = db.tables.memberships.filter(m => m.user_id !== args.uid && !ownedIds.includes(m.property_id));
          db.tables.properties = db.tables.properties.filter(p => p.owner_id !== args.uid);
          persist(db);
          return { data:null, error:null };
        }
        if (name === 'admin_threads'){
          const out = db.tables.properties.map(p => {
            const ms = db.tables.messages.filter(m => m.property_id === p.id).sort((a, b) => String(b.at).localeCompare(String(a.at)));
            if (!ms.length) return null;
            return { property_id:p.id, name:p.name, owner_id:p.owner_id, owner_name:nameOfUser(p.owner_id) || '',
                     tenants: db.tables.memberships.filter(m => m.property_id === p.id && m.role === 'tenant').map(m => m.display_name || nameOfUser(m.user_id)).join(', '),
                     msg_count:ms.length, last_at:ms[0].at, last_body:ms[0].body };
          }).filter(Boolean).sort((a, b) => String(b.last_at).localeCompare(String(a.last_at)));
          return { data: out, error:null };
        }
        if (name === 'admin_messages'){
          audit('messages.view', args.pid); persist(db);
          const ms = db.tables.messages.filter(m => m.property_id === args.pid).sort((a, b) => String(b.at).localeCompare(String(a.at)))
            .map(m => ({ id:m.id, at:m.at, from_role:m.from_role, by_user:m.by_user, by_name:nameOfUser(m.by_user), body:m.body, image_path:m.image_path || null }));
          return { data: ms, error:null };
        }
        if (name === 'admin_delete_message'){
          const m = db.tables.messages.find(x => x.id === args.mid);
          if (!m) return { data:null, error:{ message:'Mesaj bulunamadı', code:'P0002' } };
          db.tables.messages = db.tables.messages.filter(x => x.id !== args.mid);
          audit('message.delete', m.property_id, { message:args.mid, by:m.by_user }); persist(db);
          return { data:null, error:null };
        }
        if (name === 'admin_audit_log')
          return { data: db.tables.admin_audit.slice().reverse().map(a => ({ id:a.id, at:a.at, admin_name:nameOfUser(a.admin_id), action:a.action, target:a.target, detail:a.detail })), error:null };
      }
      if (name === 'admin_kpis'){
        // Yalnızca testler: supabase/schema.sql → admin_kpis ile aynı biçimde, sahte tablolardan hesaplanır.
        if (!isAdmin(db, me)) return { data:null, error:{ message:'Yönetici yetkisi gerekli', code:'42501' } };
        const T = db.tables, d = Math.min(Math.max(Number(args?.days) || 30, 1), 365), day = 864e5, t0 = Date.now();
        const within = (v, n) => v && t0 - Date.parse(v) < n * day;
        const owners = T.profiles.filter(p => p.role === 'landlord');
        const ownsWith = (o, f) => T.properties.some(pr => pr.owner_id === o.id && f(pr));
        const month = new Date().toISOString().slice(0, 7), prev = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);
        const sum = m => T.payments.filter(x => (x.kind || 'kira') === 'kira' && ['approved','partial'].includes(x.status) && x.month === m).reduce((a, x) => a + Number(x.amount || 0), 0);
        const paying = owners.filter(o => accessOf(db, o.id).subscribed).length;
        const sumK = (k, m) => T.payments.filter(x => (x.kind || 'kira') === k && ['approved','partial'].includes(x.status) && x.month === m).reduce((a, x) => a + Number(x.amount || 0), 0);
        const coll = (kinds, m) => (T.site_charges || []).filter(x => kinds.includes(x.kind) && x.month === m && ['paid','partial'].includes(x.status))
          .reduce((a, x) => a + Number(x.status === 'paid' ? x.amount : x.paid_amount || 0), 0);
        const series = Array.from({ length: d }, (_, i) => {
          const dd = new Date(t0 - (d - 1 - i) * day).toISOString().slice(0, 10);
          const on = p => String(p.created_at || '').slice(0, 10) === dd;
          return { d: dd, landlords: T.profiles.filter(p => p.role === 'landlord' && on(p)).length, tenants: T.profiles.filter(p => p.role !== 'landlord' && on(p)).length };
        });
        return { data: {
          days: d,
          users: { total: T.profiles.length, landlords: owners.length, tenants: T.profiles.filter(p => p.role === 'tenant').length, team: T.profiles.filter(p => p.role === 'team').length },
          signups: { period: T.profiles.filter(p => within(p.created_at, d)).length, prev: 0 },
          owners: { total: owners.length, paying, trial: owners.length - paying, expiring: 0, active: owners.length, lapsed: 0 },
          plans: {}, billingIssues: 0, cancelling: 0,
          units: { total: T.properties.length, connected: new Set(T.memberships.filter(m => m.role === 'tenant').map(m => m.property_id)).size },
          rent: { month: sum(month), prevMonth: sum(prev) },
          supportOpen: T.support_requests.filter(r => r.status === 'open').length,
          funnel: { owners: owners.length,
                    withProperty: owners.filter(o => ownsWith(o, () => true)).length,
                    withTenant: owners.filter(o => ownsWith(o, pr => T.memberships.some(m => m.property_id === pr.id && m.role === 'tenant'))).length,
                    withPayment: owners.filter(o => ownsWith(o, pr => T.payments.some(x => x.property_id === pr.id && ['approved','partial'].includes(x.status)))).length },
          activeUsers: { week: T.profiles.length, month: T.profiles.length },
          invites: { created: T.invites.length, accepted: T.invites.filter(i => i.accepted_by).length },
          requests: { open: T.requests.filter(r => r.status < 3).length, done: T.requests.filter(r => r.status === 3).length, period: T.requests.length },
          punctuality: { onTime: 0, late: 0 },
          series,
          // migration panel_gelir_gider: kurum kirası, aidat hacmi, tahmini gelir tabanı, kurum özeti.
          orgRent: { month: coll(['kira','ciro'], month), prevMonth: coll(['kira','ciro'], prev) },
          aidat: { month: sumK('aidat', month), prevMonth: sumK('aidat', prev), siteMonth: coll(['aidat','yakit','demirbas','ozel'], month), sitePrev: coll(['aidat','yakit','demirbas','ozel'], prev) },
          revenueBase: Object.values(owners.reduce((acc, o) => {
            const a = accessOf(db, o.id); if (!a.subscribed) return acc;
            const sb = T.subscriptions.find(x => x.user_id === o.id) || {};
            const yearly = /(yillik|yearly|annual)/i.test(sb.product_id || ''), k = a.plan + ':' + yearly;
            const units = Math.max(1, Number(sb.units) || Number((/_(\d+)_(aylik|yillik)/.exec(sb.product_id || '') || [])[1]) || 1);
            acc[k] = acc[k] || { plan:a.plan, yearly, owners:0, units:0 }; acc[k].owners++; acc[k].units += units; return acc;
          }, {})),
          orgs: { total: (T.organizations || []).length, active: (T.organizations || []).filter(o => o.status === 'active').length,
                  bySector: (T.organizations || []).reduce((a, o) => { a[o.sector] = (a[o.sector] || 0) + 1; return a; }, {}),
                  units: (T.site_units || []).length, contracted: (T.organizations || []).reduce((a, o) => a + (Number(o.units) || 0), 0), ending: 0 }
        }, error:null };
      }
      if (name === 'my_access') return { data: accessOf(db, me), error:null };
      if (name === 'delete_my_account'){
        db.users = db.users.filter(u => u.id !== me);
        db.tables.profiles = db.tables.profiles.filter(p => p.id !== me);
        const owned = db.tables.properties.filter(p => p.owner_id === me).map(p => p.id);
        TABLES.forEach(t => { db.tables[t] = db.tables[t].filter(r => !owned.includes(r.property_id) && !owned.includes(t === 'properties' ? r.id : null)); });
        db.tables.memberships = db.tables.memberships.filter(m => m.user_id !== me);
        persist(db);
        return { data:null, error:null };
      }
      return { data:null, error:{ message:'Bilinmeyen rpc ' + name } };
    },
    functions: {
      // Gerçekte billing fonksiyonu RevenueCat'ten okur; testte satırı db.nextSubscription belirler.
      async invoke(name, opts){
        const db = load();
        client._calls.push({ fn:name });
        const me = db.session?.user.id;
        db.invoked = [...(db.invoked || []), name];          // testler hangi fonksiyonun çağrıldığını buradan okur
        db.invokedBodies = [...(db.invokedBodies || []), { name, body: (opts && opts.body) || null }];
        persist(db);
        if (name === 'billing' && me && db.nextSubscription){
          db.tables.subscriptions = db.tables.subscriptions.filter(x => x.user_id !== me);
          db.tables.subscriptions.push(Object.assign({ user_id:me }, db.nextSubscription));
          persist(db);
        }
        return { data:{ ok:true }, error:null };
      }
    },
    storage: {
      from(){
        const GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
        return {
          async upload(path, blob, o){
            if (localStorage.getItem('__fakefail')) return { data:null, error:{ message:'Failed to fetch' } };
            const db = load();
            db.storage[path] = { size: blob.size || blob.byteLength || 0, type: (o && o.contentType) || blob.type || '' };
            // Testler için görselin yüklenen boyutu (px): küçültmenin işe yaradığı buradan doğrulanır.
            try { const bm = await createImageBitmap(new Blob([blob], { type: db.storage[path].type })); db.storage[path].w = bm.width; db.storage[path].h = bm.height; } catch(e){}
            persist(db);
            return { data:{ path }, error:null };
          },
          async createSignedUrl(path){ return { data:{ signedUrl:GIF }, error:null }; },
          async createSignedUrls(paths){ return { data: paths.map(p => ({ path:p, signedUrl:GIF })), error:null }; }
        };
      }
    },
    // Anlık kanal: testler karşı tarafın değişikliğini window.__fakeRealtime.emit(tablo, olay, satır) ile gönderir,
    // bağlantı durumunu window.__fakeRealtime.status('CHANNEL_ERROR' | 'SUBSCRIBED' | …) ile değiştirir.
    channel(name){
      const ch = { name, _h: [], _cb: null,
        on(type, f, cb){ ch._h.push({ type, f, cb }); return ch; },
        send(msg){ window.__fakeSent = [...(window.__fakeSent || []), { channel: name, ...msg }]; return Promise.resolve('ok'); },
        subscribe(cb){ ch._cb = cb; if (/^evim-/.test(name)){ (client._chs = client._chs || {})[name] = ch; } else client._rt = ch; setTimeout(() => cb && cb('SUBSCRIBED'), 0); return ch; } };
      return ch;
    },
    removeChannel(ch){ if (client._rt === ch) client._rt = null; if (client._chs && ch && client._chs[ch.name] === ch) delete client._chs[ch.name]; }
  };
  globalThis.__fakeClient = client;
  if (typeof window !== 'undefined') window.__fakeRealtime = {
    emit(table, eventType, row){ const ch = client._rt; if (ch) ch._h.filter(h => h.type === 'postgres_changes' && h.f && h.f.table === table).forEach(h => h.cb({ eventType, new: row, old: {} })); },
    status(st){ const ch = client._rt; if (ch && ch._cb) ch._cb(st); },
    // Karşı tarafın "dürtmesi" (Broadcast): kanal evim-<ev kimliği>
    nudge(pid, payload){ const ch = client._chs && client._chs['evim-' + pid]; if (ch) ch._h.filter(h => h.type === 'broadcast').forEach(h => h.cb({ payload })); },
    channels(){ return client._rt ? 1 : 0; }
  };
  return client;
}
