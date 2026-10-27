// Testler için sahte supabase-js (yalnızca EXPO_PUBLIC_SUPABASE_URL=fake: iken yüklenir). Uygulamanın kullandığı API alt kümesini,
// localStorage'da tutulan bellek içi bir veritabanıyla taklit eder.
// Sunucu kuralları (RLS, tetikleyiciler) gerçek Postgres'te ayrıca sınanır
// (tests/sql.spec.mjs); burada yalnızca istemcinin akışları doğrulanır.

const KEY = '__fakedb';
const TABLES = ['profiles','properties','property_shared','memberships','invites','payments','rent_history',
                'requests','messages','documents','expenses','notifications','push_subscriptions','subscriptions','device_tokens','admins','reviews','bans','admin_audit'];

function load(){
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d){ TABLES.forEach(t => d.tables[t] = d.tables[t] || []); return d; } } catch(e){}
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
  invites:['code'], payments:['property_id','month'], rent_history:['id'], requests:['id'], messages:['id'],
  documents:['id'], expenses:['id'], notifications:['id'], push_subscriptions:['endpoint'], subscriptions:['user_id'], device_tokens:['token'],
  admins:['user_id'], reviews:['kind','property_id','ref_id'], bans:['user_id'], admin_audit:['id']
};

function defaults(table, row, db){
  const r = Object.assign({}, row);
  if (table === 'properties'){ r.id = r.id || uuid(); r.created_at = r.created_at || now(); }
  if (table === 'invites'){ r.code = r.code || Math.random().toString(36).slice(2, 10).toUpperCase(); r.created_at = now(); r.accepted_by = null; }
  if (table === 'messages'){ r.at = r.at || now(); if (r.by_user === undefined) r.by_user = db.session?.user.id || null; }
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
const isAdmin = (db, uid) => db.tables.admins.some(a => a.user_id === uid);
const roleIn = (db, uid, pid) => (db.tables.memberships.find(m => m.property_id === pid && m.user_id === uid) || {}).role;
const stripSb = v => (v ? String(v).replace(/^sb:/, '') : null);
const reviewOk = (db, kind, pid, ref) => { const r = db.tables.reviews.find(x => x.kind === kind && x.property_id === pid && x.ref_id === ref); return !r || r.status === 'approved'; };

function upsertReview(db, kind, pid, ref, uploader, label, path, amount){
  const r = db.tables.reviews.find(x => x.kind === kind && x.property_id === pid && x.ref_id === ref);
  if (r) Object.assign(r, { uploader, label, path, amount, status:'pending', note:null, reviewed_by:null, reviewed_at:null, created_at:now() });
  else db.tables.reviews.push({ kind, property_id:pid, ref_id:ref, uploader, label, path, amount, status:'pending', note:null, reviewed_by:null, reviewed_at:null, created_at:now() });
}

function notify(db, uid, title, body){
  db.tables.notifications.push({ id:(db.tables.notifications.reduce((m, x) => Math.max(m, x.id), 0) || 0) + 1, user_id:uid, title, body, url:'', created_at:now(), read_at:null });
}

function trackReviews(db, table, row, before, actor){
  if (!actor || isAdmin(db, actor)) return;
  if (table === 'payments' && roleIn(db, actor, row.property_id) !== 'landlord' && ['review','partial'].includes(row.status)){
    if (!before || before.receipt_path !== row.receipt_path || before.receipt_name !== row.receipt_name || before.amount !== row.amount)
      upsertReview(db, 'payment', row.property_id, row.month, actor, row.receipt_name, stripSb(row.receipt_path), row.amount);
  }
  if (table === 'documents' && (!before || before.path !== row.path || before.name !== row.name))
    upsertReview(db, 'document', row.property_id, row.id, row.uploaded_by || actor, row.name, stripSb(row.path), null);
  if (table === 'requests' && row.invoice && (!before || !before.invoice || before.invoice.path !== row.invoice.path || before.invoice.amount !== row.invoice.amount))
    upsertReview(db, 'invoice', row.property_id, row.id, actor, row.invoice.name || 'fatura', stripSb(row.invoice.path), Number(row.invoice.amount) || null);
}

/* Okuma kuralı: karşı taraf, yönetici onaylayana kadar yüklemeyi görmez. */
function visible(db, table, row, actor){
  if (!actor || isAdmin(db, actor)) return true;
  if (table === 'payments') return roleIn(db, actor, row.property_id) === 'tenant' || reviewOk(db, 'payment', row.property_id, row.month);
  if (table === 'documents') return row.uploaded_by === actor || reviewOk(db, 'document', row.property_id, row.id);
  if (table === 'reviews') return row.uploader === actor;
  return true;
}

function decideEffects(db, r, was){
  if (r.status === was || r.status === 'pending') return;
  if (r.kind === 'payment'){
    if (r.status === 'approved') db.tables.memberships.filter(m => m.property_id === r.property_id && m.role === 'landlord').forEach(m => notify(db, m.user_id, 'Dekont geldi', r.ref_id + ' kirası için ödeme yapıldı.'));
    else { const p = db.tables.payments.find(x => x.property_id === r.property_id && x.month === r.ref_id && ['review','partial'].includes(x.status)); if (p){ p.status = 'rejected'; p.reject_reason = 'Denetim: ' + r.note; } }
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
  return { role:p.role, access: p.role === 'tenant' || subscribed || inTrial, subscribed, inTrial, trialEnds, trialDays:TRIAL_DAYS,
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
  is(k, v){ this.filters.push(r => (r[k] ?? null) === v); return this; }
  order(k, o){ this.orderBy = [k, o?.ascending !== false]; return this; }
  limit(n){ this.lim = n; return this; }
  single(){ this.one = true; return this; }
  maybeSingle(){ this.one = 'maybe'; return this; }
  then(res, rej){ return Promise.resolve().then(() => this.run()).then(res, rej); }

  run(){
    const db = load();
    this.c._calls.push({ table:this.t, op:this.op });
    // Kesinti benzetimi (testler): __fakefail=1 yazmalar, =2 her şey "Failed to fetch" verir.
    const ff = localStorage.getItem('__fakefail');
    if (ff === '2' || (ff === '1' && this.op !== 'select')) return { data:null, error:{ message:'Failed to fetch' } };
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
        db.tables.profiles.push({ id:user.id, role: meta.role === 'landlord' ? 'landlord' : 'tenant', name: meta.name || email, phone:'', lang:'tr', settings:{}, created_at: now() });
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
      async updateUser({ password }){
        const db = load();
        const u = db.users.find(x => x.id === db.session?.user.id);
        if (u && password) u.password = password;
        persist(db);
        return { data:{ user: db.session?.user }, error:null };
      }
    },
    from(t){ return new Query(client, t); },
    async rpc(name, args){
      if (localStorage.getItem('__fakefail') === '2') return { data:null, error:{ message:'Failed to fetch' } };
      const db = load();
      const me = db.session?.user.id;
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
      if (/^admin_(set_ban|threads|messages|delete_message|audit_log)$/.test(name)){
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
      async invoke(name){
        const db = load();
        client._calls.push({ fn:name });
        const me = db.session?.user.id;
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
            persist(db);
            return { data:{ path }, error:null };
          },
          async createSignedUrl(path){ return { data:{ signedUrl:GIF }, error:null }; },
          async createSignedUrls(paths){ return { data: paths.map(p => ({ path:p, signedUrl:GIF })), error:null }; }
        };
      }
    },
    channel(){ const ch = { on(){ return ch; }, subscribe(){ return ch; } }; return ch; },
    removeChannel(){}
  };
  globalThis.__fakeClient = client;
  return client;
}
