/* Sunucu katmanı (Supabase).

   Uygulamanın geri kalanı veriyi yine S üzerinde okur ve değiştirir; bu modül
   kaydedilen her değişikliği önceki sunucu haliyle karşılaştırıp yalnızca
   farkı yazar (bkz. mapping.js). Başka cihazlardan gelen değişiklikler anlık
   olarak alınır. Demo modunda bu modülün hiçbir işlevi çalışmaz. */

import { t } from './i18n.js';
import { CONFIG, LIVE } from './config.js';
import { S, ui, VERSION, useStorageKey, replaceState, saveLocal, hooks } from './state.js';
import { buildProperty, diffProperty, pendingMedia, storedPaths, storedPath, isStored, SB } from './mapping.js';
import { notify } from './notify.js';
import { shrink, uid } from './util.js';
import { isNative, nativePlatform, secureStorage, nativePushState, nativePushRegister, nativePushUnregister } from './native.js';

export const live = {
  client: null,
  session: null,
  user: null,
  profile: null,
  status: 'idle',      // idle | syncing | synced | offline | error
  loaded: false,
  access: null         // my_access(): rol, deneme, abonelik (bkz. billing.js)
};

const DEFAULT_SETTINGS = { rentDays:3, renewDays:60, insDays:30, evictDays:90, reqUpdates:true, lateNotice:true };

let synced = {};            // pid → son bilinen sunucu hali (JSON)
let syncedSettings = '';
let flushTimer = null, flushing = false, again = false;
let channel = null;
const refreshQueue = new Set();
let refreshTimer = null;

/** Veri değişince çizim için main.js'in verdiği geri çağırım. */
let onData = () => {};
/** Oturum değişince (giriş/çıkış/şifre sıfırlama) main.js'e haber verir. */
let onAuth = () => {};

export function setHandlers(h){
  onData = h.onData || onData;
  onAuth = h.onAuth || onAuth;
}

const sb = () => live.client;
const me = () => live.user?.id;

function must(res){
  if (res.error) throw res.error;
  return res.data;
}

/* ------------------------------------------------------------------ */
/* Açılış ve oturum                                                    */
/* ------------------------------------------------------------------ */

export async function init(){
  if (!LIVE) return false;
  const mod = await import(CONFIG.supabaseJs);
  live.client = mod.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
    // Oturum cihazda saklanır ve kendiliğinden yenilenir: bir kez giriş yeter.
    // Telefonda oturum Keychain / Keystore'da durur; e-posta dönüşü uygulamayı
    // açan bağlantıyla gelir (exchangeCode).
    auth: Object.assign(
      { persistSession: true, autoRefreshToken: true, detectSessionInUrl: !isNative, flowType: 'pkce' },
      isNative ? { storage: secureStorage() } : {}
    )
  });

  live.client.auth.onAuthStateChange((event, session) => {
    const prev = live.user?.id;
    live.session = session;
    live.user = session?.user || null;
    if (event === 'PASSWORD_RECOVERY') onAuth('recovery');
    else if (event === 'SIGNED_OUT') onAuth('signed-out');
    else if (event === 'SIGNED_IN' && live.user && live.user.id !== prev) onAuth('signed-in');
  });

  const { data } = await live.client.auth.getSession();
  live.session = data.session;
  live.user = data.session?.user || null;

  // E-posta bağlantısından dönüşte (PKCE) adresteki ?code parametresini temizle.
  if (/[?&]code=/.test(location.search)){
    history.replaceState(null, '', location.pathname + (location.hash || '#/'));
  }

  hooks.afterSave = scheduleSync;
  addEventListener('online', () => { if (live.user) { setStatus('syncing'); scheduleSync(0); } });
  addEventListener('offline', () => setStatus('offline'));
  return true;
}

function setStatus(s){
  if (live.status === s) return;
  live.status = s;
  onData();
}

/* ---- kimlik doğrulama ---- */

/**
 * E-posta bağlantılarının döneceği adres. Telefonda: yayın adresi (Universal /
 * App Link) ya da evim:// şeması; web'de sayfanın kendisi.
 */
export function redirect(){
  if (isNative) return CONFIG.publicUrl ? CONFIG.publicUrl.replace(/\/?$/, '/') + 'auth' : 'evim://auth';
  return location.origin + location.pathname;
}

/** Uygulamayı açan e-posta bağlantısındaki PKCE kodunu oturuma çevirir. */
export async function exchangeCode(code){
  const res = await sb().auth.exchangeCodeForSession(code);
  if (res.error) throw res.error;
  return res.data;
}

export async function signUp({ name, email, password, role }){
  const res = await sb().auth.signUp({
    email, password,
    options: { data: { name, role, lang: S.lang || 'tr' }, emailRedirectTo: redirect() }
  });
  if (res.error) throw res.error;
  // E-posta doğrulaması açıksa oturum hemen gelmez.
  return { needsConfirm: !res.data.session };
}

export async function signIn({ email, password }){
  const res = await sb().auth.signInWithPassword({ email, password });
  if (res.error) throw res.error;
  return res.data;
}

export async function signOut(){
  try { await disablePush(true); } catch(e){}
  if (channel){ sb().removeChannel(channel); channel = null; }
  const uidWas = me();
  await sb().auth.signOut();
  // Paylaşılan cihazda veri kalmasın.
  try { if (uidWas) localStorage.removeItem('evim-live:' + uidWas); } catch(e){}
  synced = {};
  live.profile = null;
  live.access = null;
  live.loaded = false;
  replaceState(emptyState());
}

export async function resetPassword(email){
  const res = await sb().auth.resetPasswordForEmail(email, { redirectTo: redirect() });
  if (res.error) throw res.error;
}

export async function updatePassword(password){
  const res = await sb().auth.updateUser({ password });
  if (res.error) throw res.error;
}

export async function updateProfile({ name, phone }){
  must(await sb().from('profiles').update({ name, phone }).eq('id', me()));
  // Evlerdeki görünen ad da güncellensin.
  must(await sb().from('memberships').update({ display_name: name, phone }).eq('user_id', me()));
  live.profile = Object.assign({}, live.profile, { name, phone });
  await loadAll();
}

/** Sunucunun göndereceği bildirimlerin dili. */
export async function setProfileLang(lang){
  must(await sb().from('profiles').update({ lang }).eq('id', me()));
}

/* ---- abonelik ---- */

/** Erişim durumunu sunucudan okur (deneme, abonelik). */
export async function refreshAccess(redraw = true){
  if (!me()) return null;
  try {
    live.access = must(await sb().rpc('my_access'));
  } catch(e){
    // Okunamazsa sunucu yine de kuralı uygular; arayüz kilitlenmesin.
    console.warn('Erişim durumu okunamadı', e);
  }
  if (redraw) onData();
  return live.access;
}

/** Aboneliği RevenueCat'ten tazeletir (satın alma ya da geri yükleme sonrası). */
export async function syncBilling(){
  if (!me()) return null;
  const res = await sb().functions.invoke('billing', { body:{ action:'sync' } });
  if (res.error) console.warn('Abonelik eşitlenemedi', res.error);
  return refreshAccess();
}

export async function deleteAccount(){
  must(await sb().rpc('delete_my_account'));
  await signOut();
}

/* ------------------------------------------------------------------ */
/* Veri yükleme                                                        */
/* ------------------------------------------------------------------ */

function emptyState(){
  return {
    v: VERSION, lang: S.lang || 'tr', theme: S.theme || 'system', seenHint: true, tourDone: true,
    myHome: null, props: {}, order: [], settings: Object.assign({}, DEFAULT_SETTINGS), inbox: []
  };
}

/** Önce cihazdaki kopyayı gösterir (hızlı açılış, çevrimdışı), sonra sunucudan tazeler. */
export async function openSession(){
  useStorageKey('evim-live:' + me());
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem('evim-live:' + me())); } catch(e){}
  if (cached && cached.v === VERSION && cached.props){
    replaceState(cached, { silent:true });
    live.profile = cached._profile || live.profile;
    onData();
  }
  await loadAll();
  subscribe();
}

async function fetchRows(ids, single){
  const byProp = (table, col = 'property_id') => single
    ? sb().from(table).select('*').eq(col, ids[0])
    : sb().from(table).select('*').in(col, ids);

  const [props, shared, members, invites, payments, history, requests, messages, documents, expenses] = await Promise.all([
    byProp('properties', 'id'),
    byProp('property_shared'),
    byProp('memberships'),
    byProp('invites'),
    byProp('payments'),
    byProp('rent_history'),
    byProp('requests'),
    byProp('messages').order('at', { ascending: true }),
    byProp('documents'),
    byProp('expenses')
  ].map(p => p.then(must)));

  const userIds = [...new Set(members.map(m => m.user_id))];
  const profiles = {};
  if (userIds.length){
    must(await sb().from('profiles').select('id, name, phone, role').in('id', userIds)).forEach(p => { profiles[p.id] = p; });
  }

  const group = (list, key = 'property_id') => {
    const g = {};
    list.forEach(r => (g[r[key]] = g[r[key]] || []).push(r));
    return g;
  };
  const G = {
    shared: group(shared), members: group(members), invites: group(invites), payments: group(payments),
    history: group(history), requests: group(requests), messages: group(messages),
    documents: group(documents), expenses: group(expenses)
  };

  return props.map(prop => ({
    created: prop.created_at,
    p: buildProperty({
      prop, shared: (G.shared[prop.id] || [])[0], members: G.members[prop.id], profiles,
      invites: G.invites[prop.id], payments: G.payments[prop.id], history: G.history[prop.id],
      requests: G.requests[prop.id], messages: G.messages[prop.id], documents: G.documents[prop.id],
      expenses: G.expenses[prop.id]
    }),
    myRole: (G.members[prop.id] || []).find(m => m.user_id === me())?.role
  }));
}

export async function loadAll(){
  if (!me()) return;
  setStatus('syncing');
  try {
    live.profile = must(await sb().from('profiles').select('*').eq('id', me()).single());
    await refreshAccess(false);
    const mine = must(await sb().from('memberships').select('property_id, role').eq('user_id', me()));
    const ids = mine.map(m => m.property_id);
    const built = ids.length ? await fetchRows(ids, false) : [];
    built.sort((a, b) => String(a.created).localeCompare(String(b.created)));

    const notes = must(await sb().from('notifications').select('*').eq('user_id', me())
      .order('created_at', { ascending: false }).limit(40));

    const next = emptyState();
    next.lang = S.lang || live.profile.lang || 'tr';
    next.theme = S.theme || 'system';
    next.tourDone = S.tourDone;
    next.settings = Object.assign({}, DEFAULT_SETTINGS, live.profile.settings || {});
    next.inbox = notes.reverse().map(noteToInbox);
    synced = {};
    built.forEach(({ p }) => {
      next.props[p.id] = p;
      next.order.push(p.id);
      synced[p.id] = JSON.stringify(p);
    });
    next.myHome = (built.find(b => b.myRole === 'tenant') || {}).p?.id || null;
    next._profile = live.profile;
    syncedSettings = JSON.stringify(next.settings);

    replaceState(next);
    live.loaded = true;
    setStatus('synced');
    resolveMedia(Object.values(next.props).flatMap(storedPaths));
    onData();
  } catch(e){
    console.warn('Yükleme hatası', e);
    setStatus(navigator.onLine ? 'error' : 'offline');
    if (!live.loaded) throw e;
  }
}

/** Tek bir evi sunucudan yeniden okur (başka cihazdan değişiklik geldiğinde). */
async function refreshProperty(pid){
  // Gönderilmemiş yerel değişiklik varsa önce onlar gitsin.
  if (S.props[pid] && JSON.stringify(S.props[pid]) !== synced[pid]){ scheduleSync(0); refreshQueue.add(pid); return; }
  const built = await fetchRows([pid], true).catch(e => { console.error(e); return null; });
  if (!built) return;
  if (!built.length){
    // Artık üye değiliz (ör. evden çıkarıldık).
    delete S.props[pid];
    delete synced[pid];
    S.order = S.order.filter(x => x !== pid);
    if (S.myHome === pid) S.myHome = S.order.find(id => S.props[id]?.ownerId !== me()) || null;
    saveLocal();
    onData();
    return;
  }
  const { p } = built[0];
  const json = JSON.stringify(p);
  synced[pid] = json;
  if (JSON.stringify(S.props[pid]) === json) return;     // yankı: bizim yazdığımız
  S.props[pid] = p;
  if (!S.order.includes(pid)) S.order.push(pid);
  saveLocal();
  resolveMedia(storedPaths(p));
  onData({ soft: true });
}

function queueRefresh(pid){
  if (!pid) return;
  refreshQueue.add(pid);
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    const ids = [...refreshQueue];
    refreshQueue.clear();
    ids.forEach(refreshProperty);
  }, 250);
}

/* ------------------------------------------------------------------ */
/* Eşitleme                                                            */
/* ------------------------------------------------------------------ */

export function scheduleSync(delay = 300){
  if (!live.user || !live.loaded) return;
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, delay);
}

function roleIn(p){ return p && p.ownerId === me() ? 'landlord' : 'tenant'; }

async function flush(){
  if (flushing){ again = true; return; }
  flushing = true;
  setStatus('syncing');
  try {
    await uploadPendingMedia();

    const ids = new Set([...Object.keys(synced), ...S.order]);
    for (const pid of ids){
      const afterJson = S.props[pid] ? JSON.stringify(S.props[pid]) : null;
      if (afterJson === (synced[pid] || null)) continue;
      const before = synced[pid] ? JSON.parse(synced[pid]) : null;
      const after = afterJson ? JSON.parse(afterJson) : null;
      const ops = diffProperty(before, after, { role: roleIn(after || before), meId: me() });
      for (const op of ops) await apply(op);
      if (afterJson) synced[pid] = afterJson; else delete synced[pid];
    }

    const settingsJson = JSON.stringify(S.settings);
    if (settingsJson !== syncedSettings){
      must(await sb().from('profiles').update({ settings: S.settings }).eq('id', me()));
      syncedSettings = settingsJson;
    }
    setStatus('synced');
    if (refreshQueue.size) queueRefresh([...refreshQueue][0]);
  } catch(e){
    console.warn('Eşitleme hatası', e);
    if (!navigator.onLine || /fetch|network/i.test(String(e.message))){
      setStatus('offline');           // bağlantı gelince yeniden denenir
    } else {
      setStatus('error');
      notify({ title:t('Kaydedilemedi'), body: humanError(e), icon:'bell' }, false);
      // Sunucunun reddettiği değişikliği geri al: güncel hali yeniden yükle.
      await loadAll().catch(() => {});
    }
  } finally {
    flushing = false;
    if (again){ again = false; scheduleSync(0); }
  }
}

async function apply(op){
  const tbl = sb().from(op.table);
  let q;
  if (op.kind === 'insert') q = tbl.insert(op.rows);
  else if (op.kind === 'upsert') q = tbl.upsert(op.rows, { onConflict: op.onConflict });
  else {
    q = op.kind === 'update' ? tbl.update(op.values) : tbl.delete();
    Object.entries(op.match).forEach(([k, v]) => { q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v); });
  }
  must(await q);
}

export function humanError(e){
  const m = String(e?.message || e || '');
  if (e?.code === 'EV402' || /Abonelik gerekli/.test(m)) return t('Deneme süren bitti. Kayıtları değiştirmek için abone ol; okuma ve mesajlaşma açık.');
  if (/Invalid login credentials/i.test(m)) return t('E-posta ya da şifre hatalı.');
  if (/Email not confirmed/i.test(m)) return t('E-posta adresini henüz doğrulamadın. Gelen kutunu kontrol et.');
  if (/User already registered/i.test(m)) return t('Bu e-posta ile bir hesap zaten var. Giriş yapmayı dene.');
  if (/Password should be at least/i.test(m)) return t('Şifre en az 8 karakter olmalı.');
  if (/rate limit/i.test(m)) return t('Çok fazla deneme yapıldı. Biraz sonra tekrar dene.');
  if (/Failed to fetch|NetworkError|network/i.test(m)) return t('Sunucuya ulaşılamadı. Bağlantını kontrol et.');
  if (e?.code === '42501' || /row-level security|permission/i.test(m)) return m && !/row-level/.test(m) ? m : t('Bu işlem için yetkin yok.');
  return m || t('Beklenmeyen bir hata oluştu.');
}

/* ------------------------------------------------------------------ */
/* Dosyalar                                                            */
/* ------------------------------------------------------------------ */

const TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const pendingResolve = new Set();
let resolveTimer = null;

function dataUrlToBlob(u){
  const [head, body] = u.split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(body);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

const extOf = type => ({ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'application/pdf':'pdf' }[type] || 'bin');

async function upload(pid, blob){
  const path = pid + '/' + uid('') + '.' + extOf(blob.type);
  must(await sb().storage.from('evim').upload(path, blob, { contentType: blob.type, upsert: false }));
  return path;
}

/**
 * Bir dosyayı saklar ve uygulamada tutulacak değeri döndürür.
 * Demo: görseller küçültülmüş data URL olarak; diğer dosyalar saklanmaz (null).
 * Gerçek hesap: depoya yüklenir, "sb:<yol>" döner. Çevrimdışıysa görsel
 * yerelde tutulur ve bağlantı gelince yüklenir.
 */
export async function storeFile(pid, file, { maxSide = 900 } = {}){
  const isImage = /^image\//.test(file.type);
  let small = null;
  if (isImage){ try { small = await shrink(file, maxSide); } catch(e){ small = null; } }

  if (!LIVE || !live.user) return small;

  try {
    if (isImage && small){
      const path = await upload(pid, dataUrlToBlob(small));
      ui.media[path] = small;
      return SB + path;
    }
    if (file.size > 10 * 1024 * 1024){
      notify({ title:t('Dosya çok büyük'), body:t('En fazla 10 MB yüklenebilir.'), icon:'doc' }, false);
      return null;
    }
    const path = await upload(pid, file);
    return SB + path;
  } catch(e){
    console.warn('Yükleme hatası', e);
    if (small) return small;            // eşitlemede yeniden denenir
    notify({ title:t('Dosya yüklenemedi'), body: humanError(e), icon:'doc' }, false);
    return null;
  }
}

async function uploadPendingMedia(){
  let changed = false;
  for (const pid of S.order){
    for (const { obj, key } of pendingMedia(S.props[pid])){
      const dataUrl = obj[key];
      const path = await upload(pid, dataUrlToBlob(dataUrl));
      ui.media[path] = dataUrl;
      obj[key] = SB + path;
      changed = true;
    }
  }
  if (changed) saveLocal();
}

/** "sb:" değerini görüntülenebilir adrese çevirir; imzalı bağlantı yoksa ister. */
export function mediaSrc(v){
  if (!isStored(v)) return v;
  const path = storedPath(v);
  if (ui.media[path]) return ui.media[path];
  resolveMedia([path]);
  return TRANSPARENT;
}

function resolveMedia(paths){
  if (!LIVE || !live.client) return;
  paths.filter(p => !ui.media[p]).forEach(p => pendingResolve.add(p));
  if (!pendingResolve.size) return;
  clearTimeout(resolveTimer);
  resolveTimer = setTimeout(async () => {
    const list = [...pendingResolve];
    pendingResolve.clear();
    try {
      const res = must(await sb().storage.from('evim').createSignedUrls(list, 60 * 60 * 6));
      res.forEach(r => { if (r.signedUrl) ui.media[r.path] = r.signedUrl; });
      onData({ soft: true });
    } catch(e){ console.warn('Bağlantı alınamadı', e); }
  }, 60);
}

/* ------------------------------------------------------------------ */
/* Anlık güncellemeler                                                 */
/* ------------------------------------------------------------------ */

const PROPERTY_TABLES = ['property_shared','memberships','invites','payments','rent_history','requests','messages','documents','expenses'];

function subscribe(){
  if (!live.client || !me()) return;
  if (channel) sb().removeChannel(channel);
  const ids = S.order.slice();
  channel = sb().channel('evim-' + me());

  if (ids.length){
    const inList = 'in.(' + ids.join(',') + ')';
    PROPERTY_TABLES.forEach(table => channel.on('postgres_changes',
      { event:'*', schema:'public', table, filter:'property_id=' + inList },
      payload => queueRefresh((payload.new && payload.new.property_id) || (payload.old && payload.old.property_id))));
    channel.on('postgres_changes', { event:'*', schema:'public', table:'properties', filter:'id=' + inList },
      payload => queueRefresh((payload.new && payload.new.id) || (payload.old && payload.old.id)));
  }
  // Yeni bir eve eklendik ya da çıkarıldık: tümünü yeniden yükle.
  channel.on('postgres_changes', { event:'*', schema:'public', table:'memberships', filter:'user_id=eq.' + me() },
    () => loadAll().then(subscribe));
  channel.on('postgres_changes', { event:'INSERT', schema:'public', table:'notifications', filter:'user_id=eq.' + me() },
    payload => onNotification(payload.new));
  // Mağazadan abonelik değişikliği (satın alma, iptal, süre bitimi).
  channel.on('postgres_changes', { event:'*', schema:'public', table:'subscriptions', filter:'user_id=eq.' + me() },
    () => refreshAccess());
  channel.subscribe();
}

function noteToInbox(n){
  return { id: n.id, title: n.title, body: n.body, at: Date.parse(n.created_at), read: !!n.read_at, go: (n.url || '').replace(/^#/, '') || null };
}

function onNotification(n){
  if (!n) return;
  const item = noteToInbox(n);
  S.inbox.push(item);
  if (S.inbox.length > 40) S.inbox.shift();
  saveLocal();
  onData({ soft: true, notification: item });
}

export async function markInboxRead(){
  if (!LIVE || !me()) return;
  await sb().from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', me()).is('read_at', null);
}

export async function clearInboxRemote(){
  if (!LIVE || !me()) return;
  await sb().from('notifications').delete().eq('user_id', me());
}

/* ------------------------------------------------------------------ */
/* Davetler ve üyelik                                                  */
/* ------------------------------------------------------------------ */

export async function createInvite(pid, { name, email, phone }){
  // Yeni eklenen ev henüz sunucuya yazılmadıysa önce onu gönder.
  if (!synced[pid]){ clearTimeout(flushTimer); await flush(); }
  const row = must(await sb().from('invites').insert({ property_id: pid, name, email, phone, created_by: me() }).select().single());
  await refreshProperty(pid);
  return row.code;
}

export async function deleteInvite(pid, code){
  must(await sb().from('invites').delete().eq('code', code));
  await refreshProperty(pid);
}

export async function removeMember(pid, userId){
  must(await sb().from('memberships').delete().eq('property_id', pid).eq('user_id', userId));
  await refreshProperty(pid);
}

export async function acceptInvite(code){
  const pid = must(await sb().rpc('accept_invite', { invite_code: code }));
  await loadAll();
  subscribe();
  return pid;
}

/** Davet bağlantısı. Yayın adresi tanımlıysa yol biçiminde: telefonda uygulamayı açar. */
export function inviteLink(code){
  if (CONFIG.publicUrl) return CONFIG.publicUrl.replace(/\/?$/, '/') + 'katil/' + encodeURIComponent(code);
  if (isNative) return 'evim://katil/' + encodeURIComponent(code);
  return location.origin + location.pathname + '#/katil/' + encodeURIComponent(code);
}

/* ------------------------------------------------------------------ */
/* Anlık bildirim aboneliği                                            */
/* ------------------------------------------------------------------ */

function b64ToBytes(b64){
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

/** 'unsupported' | 'install' (iOS'ta önce ana ekrana eklenmeli) | 'denied' | 'on' | 'off' */
/* Telefonda (Capacitor) anlık bildirim: cihaz anahtarı device_tokens tablosuna yazılır. */
const TOKEN_KEY = 'evim-cihaz-anahtari';
const savedToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch(e){ return null; } };

export let onPushTap = () => {};
export function setPushTap(fn){ onPushTap = fn; }

export async function pushState(){
  if (isNative) return nativePushState(!!savedToken());
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return ios && !standalone ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg || !('pushManager' in reg)) return 'unsupported';
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

export async function enablePush(){
  if (isNative){
    const token = await nativePushRegister(url => onPushTap(url));
    if (!token) return false;
    if (LIVE && me()) must(await sb().from('device_tokens').upsert({ token, user_id: me(), platform: nativePlatform }, { onConflict:'token' }));
    try { localStorage.setItem(TOKEN_KEY, token); } catch(e){}
    return true;
  }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return false;
  const reg = await navigator.serviceWorker.ready;
  if (!LIVE){
    // Demo: yalnızca cihaz bildirimi göster.
    await reg.showNotification(t('Kiracım'), { body:t('Bildirimler bu cihazda açık.'), icon:'assets/icons/icon-192.png' });
    return true;
  }
  if (!CONFIG.vapidPublicKey) throw new Error(t('Anlık bildirim anahtarı (vapidPublicKey) yapılandırılmamış.'));
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CONFIG.vapidPublicKey) });
  const json = sub.toJSON();
  must(await sb().from('push_subscriptions').upsert({ endpoint: json.endpoint, user_id: me(), keys: json.keys }, { onConflict:'endpoint' }));
  return true;
}

export async function disablePush(quiet){
  if (isNative){
    const token = savedToken();
    if (token && LIVE && me()) await sb().from('device_tokens').delete().eq('token', token);
    try { localStorage.removeItem(TOKEN_KEY); } catch(e){}
    await nativePushUnregister();
    if (!quiet) onData();
    return;
  }
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager?.getSubscription();
  if (!sub) return;
  if (LIVE && me()) await sb().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
  if (!quiet) onData();
}
