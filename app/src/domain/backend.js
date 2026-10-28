/* Sunucu katmanı (Supabase).

   Uygulamanın geri kalanı veriyi yine S üzerinde okur ve değiştirir; bu modül kaydedilen her
   değişikliği önceki sunucu haliyle karşılaştırıp yalnızca farkı yazar (bkz. mapping.js).
   Başka cihazlardan gelen değişiklikler anlık alınır. Yerel hesap modunda (LIVE=false) hiçbir
   işlevi çalışmaz.

   Denetim: dekont, belge ve faturalar yönetici onaylayana kadar karşı tarafa görünmez
   (supabase/schema.sql → reviews). Yükleyen kendi yüklemesinin durumunu ui.reviews'ten görür. */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from './i18n.js';
import { CONFIG, LIVE } from './config.js';
import { S, ui, VERSION, useStorageKey, replaceState, saveLocal, hooks, emit } from './state.js';
import { buildProperty, diffProperty, pendingMedia, storedPaths, storedPath, isStored, SB } from './mapping.js';
import { host } from './host.js';
import { storage } from './storage.js';
import { uid } from './util.js';
import { refreshOrgs, isOrgCode, acceptOrgInvite } from './org.js';
import { refreshSiteUnits, isSiteCode, acceptSiteInvite } from './site.js';

/** @type {any} */
export const live = {
  client: null,
  user: null,
  profile: null,
  isAdmin: false,
  status: 'idle',      // idle | syncing | synced | offline | error
  loaded: false,
  access: null,        // my_access(): rol, deneme, abonelik (bkz. billing.js)
  orgs: null,          // my_orgs(): yöneticisi olduğu kurumlar (bkz. org.js)
  siteUnits: null      // my_site_units(): malik ya da kiracısı olduğu site daireleri (bkz. site.js)
};

const DEFAULT_SETTINGS = { rentDays:3, renewDays:60, insDays:30, evictDays:90, reqUpdates:true, lateNotice:true };

let synced = {};            // pid → son bilinen sunucu hali (JSON)
let syncedSettings = '';
let flushTimer = null, flushing = false, again = false;
let channel = null;
const refreshQueue = new Set();
let refreshTimer = null;

export const sb = () => live.client;

/* Çevrimdışı dayanıklılık: sunucuda bilinen son hal (baseline) cihazda da saklanır. Uygulama yeniden açıldığında
   yerel kayıt ile baseline'ın farkı, sunucuya gitmemiş değişikliklerdir; yüklemeden önce gönderilir, gönderilemezse
   yerel veri sunucu verisiyle ezilmez. */
const BASE = uid => 'kiracim-live-base:' + uid;
function persistBase(){
  if (!me()) return;
  try { storage.setItem(BASE(me()), JSON.stringify({ synced, settings: syncedSettings, profile: live.profile, roles: ui.memberRoles })); } catch(e){}
}
function hasUnsynced(){
  const ids = new Set([...Object.keys(synced), ...S.order]);
  for (const pid of ids){
    const now = S.props[pid] ? JSON.stringify(S.props[pid]) : null;
    if (now !== (synced[pid] || null)) return true;
  }
  return !!syncedSettings && JSON.stringify(S.settings) !== syncedSettings;
}
const me = () => live.user?.id;

function must(res){
  if (res.error) throw res.error;
  return res.data;
}

/* ------------------------------------------------------------------ */
/* İstemci ve oturum                                                   */
/* ------------------------------------------------------------------ */

/** @returns {Promise<any>} */
export async function client(){
  if (live.client) return live.client;
  if (CONFIG.supabaseUrl.startsWith('fake:')){
    // Yalnızca testler: tarayıcıda çalışan sahte sunucu (app/src/testing/fake-supabase.js).
    const { createClient } = await import('../testing/fake-supabase.js');
    live.client = createClient();
  } else {
    const { createClient } = await import('@supabase/supabase-js');
    live.client = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false }
    });
  }
  if (typeof window !== 'undefined' && window.addEventListener){
    window.addEventListener('online', () => { if (live.user) { setStatus('syncing'); scheduleSync(0); } });
    window.addEventListener('offline', () => setStatus('offline'));
    // Çevrimdışı/hatalı kalan eşitleme 30 saniyede bir yeniden denenir (tarayıcı "online" olayı göndermese de).
    setInterval(() => { if (live.user && live.loaded && (live.status === 'offline' || live.status === 'error')) scheduleSync(0); }, 30000);
  }
  return live.client;
}

function setStatus(s){
  if (live.status === s) return;
  live.status = s;
  emit();
}

/** Giriş sonrası: profil, yönetici mi, veri. Yönetici hesapları ev verisi yüklemez. */
export async function openSession(user){
  live.user = user;
  const c = await client();
  let base = null;
  try { base = JSON.parse(storage.getItem(BASE(user.id))); } catch(e){}
  try {
    live.profile = must(await c.from('profiles').select('*').eq('id', user.id).single());
  } catch(e){
    if (base && base.profile) live.profile = base.profile;          // çevrimdışı açılış: son bilinen profil
    else throw e;
  }
  ui.team = live.profile?.role === 'team';
  ui.memberRoles = (base && base.roles) || {};
  live.isAdmin = !!(await c.rpc('is_admin')).data;
  if (live.isAdmin) return { admin: true, profile: live.profile };
  // Askıya alınmış hesap: Auth girişi zaten kapalıdır; bu, açık kalmış oturumu da kapatır.
  const ban = (await c.from('bans').select('reason').eq('user_id', user.id).maybeSingle()).data;
  if (ban) { await closeSession(); const e = new Error('banned'); e.banned = ban.reason || ''; throw e; }
  useStorageKey('kiracim-live:' + user.id);
  let cached = null;
  try { cached = JSON.parse(storage.getItem('kiracim-live:' + user.id)); } catch(e){}
  if (cached && cached.v === VERSION && cached.props){
    replaceState(cached, { silent:true });
    if (base && base.synced){
      // Önbellekten açılış: eşitleme çalışabilir; sunucuya ulaşılamasa da ekran kayıtlı veriyle açılır.
      synced = base.synced; syncedSettings = base.settings || '';
      live.loaded = true;
    }
    emit();
  }
  hooks.afterSave = scheduleSync;
  if (live.loaded && hasUnsynced()) await flush();          // kuyrukta bekleyen yerel değişiklikleri önce gönder
  await loadAll();
  subscribe();
  return { admin: false, profile: live.profile };
}

export async function closeSession(){
  if (channel && live.client){ live.client.removeChannel(channel); channel = null; }
  const uidWas = me();
  try { await live.client?.auth.signOut(); } catch(e){}
  if (uidWas){ storage.removeItem('kiracim-live:' + uidWas); storage.removeItem(BASE(uidWas)); }
  synced = {};
  live.user = null; live.profile = null; live.access = null; live.orgs = null; live.siteUnits = null; live.loaded = false; live.isAdmin = false;
  hooks.afterSave = null;
  useStorageKey(null);
}

export async function refreshAccess(redraw = true){
  if (!me()) return null;
  try {
    live.access = must(await sb().rpc('my_access'));
  } catch(e){
    console.warn('Erişim durumu okunamadı', e);
  }
  await Promise.all([refreshOrgs(false), refreshSiteUnits(false)]);
  if (redraw) emit();
  return live.access;
}

export async function updateProfile({ name, phone }){
  must(await sb().from('profiles').update({ name, phone }).eq('id', me()));
  must(await sb().from('memberships').update({ display_name: name, phone }).eq('user_id', me()));
  live.profile = Object.assign({}, live.profile, { name, phone });
  await loadAll();
}

/** Kurumsal paket başvurusu (sitedeki form; oturum gerekmez). Sunucu yoksa yalnızca doğrular. */
export async function submitLead(p){
  if (!LIVE) return null;
  return must(await (await client()).rpc('submit_lead', { p }));
}

export async function deleteAccount(){
  must(await sb().rpc('delete_my_account'));
  await closeSession();
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

/** Benim yüklediklerimin denetim durumu: kind:pid:ref → { status, note }. */
async function loadReviews(){
  try {
    const rows = must(await sb().from('reviews').select('kind, property_id, ref_id, status, note').eq('uploader', me()));
    const map = {};
    rows.forEach(r => { map[r.kind + ':' + r.property_id + ':' + r.ref_id] = { status: r.status, note: r.note || '' }; });
    ui.reviews = map;
  } catch(e){ console.warn('Denetim durumu okunamadı', e); }
}

/** Bir yüklemenin denetim durumu ('pending' | 'approved' | 'rejected' | undefined). */
export function reviewOf(kind, pid, ref){
  return (ui.reviews || {})[kind + ':' + pid + ':' + ref];
}

export async function loadAll(opts = {}){
  if (!me()) return;
  if (!opts.force && live.loaded && hasUnsynced()){
    await flush();                                        // önce bekleyen yerel değişiklikleri gönder
    if (hasUnsynced()){ if (live.status === 'syncing') setStatus('offline'); return; }   // gönderilemedi: yerel veri korunur
  }
  setStatus('syncing');
  try {
    live.profile = must(await sb().from('profiles').select('*').eq('id', me()).single());
    await refreshAccess(false);
    const mine = must(await sb().from('memberships').select('property_id, role').eq('user_id', me()));
    const ids = mine.map(m => m.property_id);
    ui.memberRoles = Object.fromEntries(mine.map(m => [m.property_id, m.role]));
    const built = ids.length ? await fetchRows(ids, false) : [];
    built.sort((a, b) => String(a.created).localeCompare(String(b.created)));
    await loadReviews();

    const notes = must(await sb().from('notifications').select('*').eq('user_id', me())
      .order('created_at', { ascending: false }).limit(40));

    const next = emptyState();
    next.lang = S.lang || live.profile.lang || 'tr';
    next.theme = S.theme || 'system';
    next.settings = Object.assign({}, DEFAULT_SETTINGS, live.profile.settings || {});
    next.inbox = notes.reverse().map(noteToInbox);
    synced = {};
    built.forEach(({ p }) => {
      next.props[p.id] = p;
      next.order.push(p.id);
      synced[p.id] = JSON.stringify(p);
    });
    next.myHome = (built.find(b => b.myRole === 'tenant') || {}).p?.id || null;
    // Okundu bilgisi cihazlar arasında eşitlenir; ilk açılışta mevcut mesajlar okunmuş sayılır.
    const reads = await sb().from('message_reads').select('property_id, read_at').eq('user_id', me());
    next.reads = Object.fromEntries((reads.data || []).map(r => [r.property_id, Date.parse(r.read_at)]));
    if (!reads.error){
      const fresh = next.order.filter(pid => next.reads[pid] === undefined);
      fresh.forEach(pid => { const m = next.props[pid].msgs; next.reads[pid] = (m.length && Number(m[m.length - 1].at)) || 0; });
      if (fresh.length) sb().from('message_reads')
        .upsert(fresh.map(pid => ({ user_id: me(), property_id: pid, read_at: new Date(next.reads[pid]).toISOString() })), { onConflict: 'user_id,property_id' })
        .then(() => {}, () => {});
    }
    syncedSettings = JSON.stringify(next.settings);

    replaceState(next);
    live.loaded = true;
    persistBase();
    setStatus('synced');
    resolveMedia(Object.values(next.props).flatMap(storedPaths));
    emit();
  } catch(e){
    console.warn('Yükleme hatası', e);
    setStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error');
    if (!live.loaded) throw e;
  }
}

/** Tek bir evi sunucudan yeniden okur (başka cihazdan değişiklik geldiğinde). */
export async function refreshProperty(pid){
  if (S.props[pid] && JSON.stringify(S.props[pid]) !== synced[pid]){ scheduleSync(0); refreshQueue.add(pid); return; }
  const built = await fetchRows([pid], true).catch(e => { console.error(e); return null; });
  if (!built) return;
  await loadReviews();
  if (!built.length){
    delete S.props[pid];
    delete synced[pid];
    S.order = S.order.filter(x => x !== pid);
    if (S.myHome === pid) S.myHome = S.order.find(id => S.props[id]?.ownerId !== me()) || null;
    saveLocal();
    emit();
    return;
  }
  const { p } = built[0];
  const json = JSON.stringify(p);
  synced[pid] = json;
  persistBase();
  if (JSON.stringify(S.props[pid]) === json){ emit(); return; }
  S.props[pid] = p;
  if (!S.order.includes(pid)) S.order.push(pid);
  saveLocal();
  resolveMedia(storedPaths(p));
  emit();
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

/** Bu mülkte oturum sahibinin yetkileri (eşitlemede hangi alanların gönderileceği). */
function roleIn(p){
  const pid = p && p.id;
  const r = pid && ui.memberRoles[pid] ? ui.memberRoles[pid] : (p && p.ownerId === me() ? 'landlord' : 'tenant');
  return { role: r === 'tenant' ? 'tenant' : 'landlord', meId: me(), owner: r === 'landlord', expense: r === 'landlord' || r === 'agent' };
}

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
      const ops = diffProperty(before, after, roleIn(after || before));
      for (const op of ops) await apply(op);
      if (afterJson) synced[pid] = afterJson; else delete synced[pid];
      persistBase();
    }

    const settingsJson = JSON.stringify(S.settings);
    if (settingsJson !== syncedSettings){
      must(await sb().from('profiles').update({ settings: S.settings }).eq('id', me()));
      syncedSettings = settingsJson;
      persistBase();
    }
    await loadReviews();
    setStatus('synced');
    if (refreshQueue.size) queueRefresh([...refreshQueue][0]);
  } catch(e){
    console.warn('Eşitleme hatası', e);
    if ((typeof navigator !== 'undefined' && navigator.onLine === false) || /fetch|network/i.test(String(e.message))){
      setStatus('offline');
    } else {
      setStatus('error');
      host.notify({ title:t('Kaydedilemedi'), body: humanError(e), icon:'bell' });
      // Sunucunun reddettiği değişikliği geri al: güncel hali yeniden yükle.
      await loadAll({ force:true }).catch(() => {});
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
  if (e?.code === 'EV403' || /Paket sınırı/.test(m)) return t('Paketinin mülk sınırına ulaştın. Daha fazla mülk için paketini yükselt.');
  if (e?.code === 'EV402' || /Abonelik gerekli/.test(m)) return t('Deneme süren bitti. Kayıtları değiştirmek için abone ol; okuma ve mesajlaşma açık.');
  if (/user is banned|banned/i.test(m)) return t('Hesabın askıya alındı. Bilgi için info@anahtar.io adresine yaz.');
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

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64ToBytes(b64){
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4){
    const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i+1]) << 12) | ((B64.indexOf(clean[i+2]) & 63) << 6) | (B64.indexOf(clean[i+3]) & 63);
    out[o++] = (n >> 16) & 255;
    if (clean[i+2] !== undefined) out[o++] = (n >> 8) & 255;
    if (clean[i+3] !== undefined) out[o++] = n & 255;
  }
  return out.slice(0, o);
}

function dataUrlParts(u){
  const [head, body] = u.split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  return { mime, bytes: base64ToBytes(body) };
}

const extOf = type => ({ 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp', 'application/pdf':'pdf' }[type] || 'bin');

async function upload(pid, bytes, mime){
  const path = pid + '/' + uid('') + '.' + extOf(mime);
  must(await sb().storage.from('evim').upload(path, bytes, { contentType: mime, upsert: false }));
  return path;
}

/**
 * Bir dosyayı saklar ve uygulamada tutulacak değeri döndürür.
 * Yerel hesap: küçültülmüş görsel data URL olarak. Gerçek hesap: depoya yüklenir, "sb:<yol>" döner.
 * @param {{name:string, dataUrl?:string|null, uri?:string, mime?:string, size?:number}} file
 */
export async function storeFile(pid, file){
  const small = file.dataUrl || null;
  if (!LIVE || !live.user) return small;
  try {
    if (small){
      const { mime, bytes } = dataUrlParts(small);
      const path = await upload(pid, bytes, mime);
      ui.media[path] = small;
      return SB + path;
    }
    if (file.uri){
      if (file.size && file.size > 10 * 1024 * 1024){
        host.notify({ title:t('Dosya çok büyük'), body:t('En fazla 10 MB yüklenebilir.'), icon:'doc' });
        return null;
      }
      const res = await fetch(file.uri);
      const bytes = new Uint8Array(await res.arrayBuffer());
      const mime = file.mime || 'application/pdf';
      const path = await upload(pid, bytes, mime);
      return SB + path;
    }
    return null;
  } catch(e){
    console.warn('Yükleme hatası', e);
    if (small) return small;            // eşitlemede yeniden denenir
    host.notify({ title:t('Dosya yüklenemedi'), body: humanError(e), icon:'doc' });
    return null;
  }
}

async function uploadPendingMedia(){
  let changed = false;
  for (const pid of S.order){
    for (const { obj, key } of pendingMedia(S.props[pid])){
      const dataUrl = obj[key];
      const { mime, bytes } = dataUrlParts(dataUrl);
      const path = await upload(pid, bytes, mime);
      ui.media[path] = dataUrl;
      obj[key] = SB + path;
      changed = true;
    }
  }
  if (changed) saveLocal();
}

const TRANSPARENT = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const pendingResolve = new Set();
let resolveTimer = null;

/** "sb:" değerini görüntülenebilir adrese çevirir; imzalı bağlantı yoksa ister. */
export function mediaSrc(v){
  if (!isStored(v)) return v;
  const path = storedPath(v);
  if (ui.media[path]) return ui.media[path];
  resolveMedia([path]);
  return TRANSPARENT;
}

export function resolveMedia(paths){
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
      emit();
    } catch(e){ console.warn('Bağlantı alınamadı', e); }
  }, 60);
}

/** Dosyayı yeni sekmede / sistem görüntüleyicide açmak için imzalı adres. */
export async function fileUrl(v){
  if (!isStored(v)) return v;
  const path = storedPath(v);
  if (ui.media[path] && !ui.media[path].startsWith('data:')) return ui.media[path];
  const res = await sb().storage.from('evim').createSignedUrl(path, 60 * 60);
  return res.data?.signedUrl || null;
}

/* ------------------------------------------------------------------ */
/* Anlık güncellemeler                                                 */
/* ------------------------------------------------------------------ */

const PROPERTY_TABLES = ['property_shared','memberships','invites','payments','rent_history','requests','messages','documents','expenses'];

function subscribe(){
  if (!live.client || !me()) return;
  if (channel) sb().removeChannel(channel);
  const ids = S.order.slice();
  channel = sb().channel('kiracim-' + me());

  if (ids.length){
    const inList = 'in.(' + ids.join(',') + ')';
    PROPERTY_TABLES.forEach(table => channel.on('postgres_changes',
      { event:'*', schema:'public', table, filter:'property_id=' + inList },
      payload => queueRefresh((payload.new && payload.new.property_id) || (payload.old && payload.old.property_id))));
    channel.on('postgres_changes', { event:'*', schema:'public', table:'properties', filter:'id=' + inList },
      payload => queueRefresh((payload.new && payload.new.id) || (payload.old && payload.old.id)));
  }
  // Denetim kararı: ilgili evi tazele (ör. dekont onaylanınca mülk sahibi görmeye başlar).
  channel.on('postgres_changes', { event:'*', schema:'public', table:'reviews' },
    payload => queueRefresh((payload.new && payload.new.property_id) || (payload.old && payload.old.property_id)));
  channel.on('postgres_changes', { event:'*', schema:'public', table:'memberships', filter:'user_id=eq.' + me() },
    () => loadAll().then(subscribe));
  channel.on('postgres_changes', { event:'INSERT', schema:'public', table:'notifications', filter:'user_id=eq.' + me() },
    payload => onNotification(payload.new));
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
  emit();
  host.notify({ title: item.title, body: item.body, icon:'bell' });
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
  if (isOrgCode(code)) return acceptOrgInvite(code);       // kurum yöneticisi daveti
  if (isSiteCode(code)) return acceptSiteInvite(code);     // site dairesi (malik ya da kiracı) daveti
  const pid = must(await sb().rpc('accept_invite', { invite_code: code }));
  await loadAll();
  subscribe();
  return pid;
}

/* ------------------------------------------------------------------ */
/* Ekip                                                                */
/* ------------------------------------------------------------------ */

/** Ekip daveti: scope 'portfolio' tüm mülklere, 'property' yalnız pid'e erişim verir. */
export async function createTeamInvite(pid, { role, scope, name = '', phone = '' }){
  if (!synced[pid]){ clearTimeout(flushTimer); await flush(); }
  return must(await sb().from('invites').insert({ property_id: pid, name, phone, email: '', created_by: me(), role, scope }).select().single()).code;
}

/** Kabul edilmemiş ekip davetlerim. */
export async function teamInvites(){
  return must(await sb().from('invites')
    .select('code, property_id, name, phone, role, scope, created_at, expires_at')
    .eq('created_by', me()).neq('role', 'tenant').is('accepted_by', null)
    .order('created_at', { ascending: false })) || [];
}

export async function teamList(){ return must(await sb().rpc('team_list')) || []; }

export async function teamSet(member, role, scope, pids = []){
  must(await sb().rpc('team_set', { member, new_role: role, new_scope: scope, pids }));
}

/** Ekipten çıkar; owner verilirse ekip üyesi kendisi ayrılıyordur. */
export async function teamRemove(member, owner = null){
  must(await sb().rpc('team_remove', { member, owner }));
  if (member === me()) await loadAll({ force: true });
}

/** İşlem kaydı (mülk sahibi ve ekip görür). */
export async function activityFeed(lim = 200, pid = null){
  return must(await sb().rpc('activity_feed', { lim, pid })) || [];
}

/** Davet kodunun kime ait olduğunu oturum açmadan gösterir (/katil sayfası). */
export async function invitePreview(code){
  const c = await client();
  const r = await c.rpc('invite_preview', { invite_code: code });
  return r.error ? null : r.data;
}

/** "Bize ulaş" talebi: kurumsal paket, toplu içe aktarma ya da genel. */
export async function createSupportRequest({ kind, units = null, message = '', phone = '' }){
  must(await sb().from('support_requests').insert({
    user_id: me(), kind, units, message, phone, name: live.profile?.name || '', email: live.user?.email || ''
  }));
}

/** Toplu içe aktarma: satırlar sunucuda tek işlemde eklenir ya da güncellenir. */
export async function importProperties(rows){
  clearTimeout(flushTimer); await flush();
  const items = rows.map(r => ({
    line: r.line, update_id: r.updateId || null, name: r.name, addr: r.addr, type: r.type, area: r.area,
    rent: r.rent, due_day: r.dueDay, aidat: r.aidat, aidat_payer: r.aidatPayer, deposit: r.deposit, deposit_kind: r.depositKind,
    start_date: r.startDate, contract_end: r.contractEnd, dask: r.dask, stopaj: r.stopaj, company: r.company,
    tenant_name: r.tenantName, tenant_phone: r.tenantPhone, tenant_email: r.tenantEmail
  }));
  const res = must(await sb().rpc('import_properties', { items })) || [];
  await loadAll({ force: true });
  return res;
}

/** Yazışmanın okunduğu anı sunucuya yazar (diğer cihazlarda okunmamış sayısı düşer). */
export function markRead(pid, at){
  if (!me()) return;
  sb().from('message_reads')
    .upsert({ user_id: me(), property_id: pid, read_at: new Date(at).toISOString() }, { onConflict: 'user_id,property_id' })
    .then(() => {}, () => {});
}

/** Davet bağlantısı: yayın adresindeki /katil sayfası kodu kaydeder. */
export function inviteLink(code){
  return CONFIG.publicUrl.replace(/\/?$/, '/') + 'katil?kod=' + encodeURIComponent(code);
}
