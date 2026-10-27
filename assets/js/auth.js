/* Hesap ekranları: giriş, kayıt, şifre sıfırlama, davetle katılma.
   Gerçek hesap modunda oturum açılmadan uygulamaya girilmez; kiracı ve ev
   sahibi yalnızca kendi arayüzünü görür. Oturum cihazda saklanır, bir kez
   giriş yapmak yeter. */

import { t } from './i18n.js';
import { S, ui } from './state.js';
import { LIVE, CONFIG } from './config.js';
import { go, current } from './router.js';
import { notify } from './notify.js';
import { esc } from './util.js';
import { ic } from './icons.js';
import * as backend from './backend.js';
import { LANGS, getLang } from './i18n.js';

export const AUTH_ROUTES = ['giris', 'kayit', 'sifre', 'yeni-sifre', 'katil', 'davet'];
const PUBLIC_ROUTES = ['giris', 'kayit', 'sifre', 'katil'];
const INVITE_KEY = 'evim-davet';

/* ------------------------------------------------------------------ */
/* Yönlendirme kuralları                                               */
/* ------------------------------------------------------------------ */

/** Oturum sahibinin ana ekranı. */
export function home(){
  const role = backend.live.profile?.role;
  if (role === 'landlord') return '/mulk-sahibi';
  return S.myHome ? '/kiraci' : '/davet';
}

/**
 * Gerçek hesap modunda her rota değişiminde çalışır; gidilmemesi gereken
 * bir adresse yönlendirilecek adresi döndürür.
 */
export function guard(route){
  if (!LIVE) return null;
  const { user, profile } = backend.live;

  if (!user) return route.auth && PUBLIC_ROUTES.includes(route.auth) ? null : '/giris';
  if (!profile) return null;                                  // yükleniyor

  if (route.auth){
    if (['giris', 'kayit', 'sifre'].includes(route.auth)) return home();
    if (route.auth === 'davet' && profile.role !== 'tenant') return home();
    return null;
  }
  if (profile.role === 'landlord' && route.role !== 'landlord') return '/mulk-sahibi';
  if (profile.role === 'tenant'){
    if (!S.myHome) return '/davet';
    if (route.role !== 'tenant') return '/kiraci';
  }
  return null;
}

/** backend'den gelen oturum olayları. */
/** Şifre sıfırlama bağlantısıyla gelindi: oturum açılınca yeni şifre ekranına git. */
let recoveryPending = false;
export function markRecovery(){ recoveryPending = true; }

export async function onAuthEvent(evt){
  if (evt === 'signed-in' || evt === 'signed-out') ui.signupRole = null;
  if (evt === 'signed-in'){
    try { await backend.openSession(); }
    catch(e){ notify({ title:t('Veriler yüklenemedi'), body: backend.humanError(e), icon:'bell' }, false); }
    ui.meTenant = backend.live.user?.id;
    await acceptPendingInvite();
    go(recoveryPending ? '/yeni-sifre' : home(), { replace:true });
    recoveryPending = false;
  } else if (evt === 'signed-out'){
    go('/giris', { replace:true });
  } else if (evt === 'recovery'){
    go('/yeni-sifre', { replace:true });
  }
}

async function acceptPendingInvite(){
  let code = null;
  try { code = localStorage.getItem(INVITE_KEY); } catch(e){}
  if (!code || backend.live.profile?.role !== 'tenant') return;
  try {
    await backend.acceptInvite(code);
    notify({ title:t('Mülke katıldın'), body:t('Mülk sahibinle artık aynı paneldesiniz.'), icon:'home' }, false);
  } catch(e){
    notify({ title:t('Davet kabul edilemedi'), body: backend.humanError(e), icon:'home' }, false);
  }
  try { localStorage.removeItem(INVITE_KEY); } catch(e){}
}

/** /katil/<kod> adresine gelindiğinde: oturum varsa kabul et, yoksa kodu sakla. */
export async function handleJoinRoute(route){
  if (!LIVE || route.auth !== 'katil' || !route.code) return;
  try { localStorage.setItem(INVITE_KEY, route.code.toUpperCase()); } catch(e){}
  if (backend.live.user && backend.live.profile){
    if (backend.live.profile.role !== 'tenant'){
      ui.authMsg = { kind:'error', text:t('Davetler kiracı hesapları içindir. Kiracı hesabıyla giriş yapmalısın.') };
      try { localStorage.removeItem(INVITE_KEY); } catch(e){}
      return;
    }
    await acceptPendingInvite();
    go(recoveryPending ? '/yeni-sifre' : home(), { replace:true });
    recoveryPending = false;
  }
}

/* ------------------------------------------------------------------ */
/* Ekranlar                                                            */
/* ------------------------------------------------------------------ */

/** Giriş ekranlarının altındaki dil bağlantısı. */
function langLinks(){
  return '<div class="authalt">' + LANGS.filter(([c]) => c !== getLang())
    .map(([c, name]) => '<button class="linkbtn" data-act="lang" data-v="'+c+'" lang="'+c+'">'+name+'</button>').join(' ') + '</div>';
}

function brand(sub){
  return '<div class="authbrand"><div class="mark">'+ic('home', 26)+'</div>' +
    ('<div><div class="authname">'+t('Kiracım')+'</div><div class="muted">')+esc(sub)+'</div></div></div>';
}

function message(){
  const m = ui.authMsg;
  if (!m) return '';
  return '<div class="note'+(m.kind === 'error' ? ' warn' : '')+'" role="'+(m.kind === 'error' ? 'alert' : 'status')+'">'+esc(m.text)+'</div>';
}

function pendingCode(){
  try { return localStorage.getItem(INVITE_KEY); } catch(e){ return null; }
}

export function authScreen(route){
  // Her hesap ekranının altına dil bağlantısı eklenir.
  return screenFor(route).replace(/<\/div>$/, langLinks() + '</div>');
}

function screenFor(route){
  if (!LIVE) return demoNotice();
  switch (route.auth){
    case 'kayit': return signupScreen();
    case 'sifre': return forgotScreen();
    case 'yeni-sifre': return newPasswordScreen();
    case 'katil': return joinScreen(route);
    case 'davet': return inviteCodeScreen();
    default: return loginScreen();
  }
}

function demoNotice(){
  return '<div class="auth">' + brand(t('Demo sürüm')) +
    ('<div class="note">'+t('Bu sürüm demo modunda çalışıyor: hesap gerekmez, veriler yalnızca bu tarayıcıda saklanır.')+' ') +
    (t('Gerçek hesaplar için sunucu kurulumu gerekir (docs/kurulum.md).')+'</div>') +
    ('<button class="btn primary block" data-act="nav" data-go="/kiraci">'+t('Demoyu aç')+'</button></div>');
}

function loginScreen(){
  const code = pendingCode();
  return '<div class="auth">' + brand(t('Kira takibi, iki taraf için tek yerde')) +
    ('<h1>'+t('Giriş yap')+'</h1>') +
    (code ? ('<div class="note">'+t('Davet kodun kaydedildi:')+' <b>')+esc(code)+('</b>'+t('. Giriş yapınca mülke bağlanacaksın.')+'</div>') : '') +
    message() +
    '<form class="stack" data-form="login" novalidate>' +
      ('<label class="field">'+t('E-posta')+'<input name="email" type="email" required autocomplete="email" inputmode="email"></label>') +
      ('<label class="field">'+t('Şifre')+'<input name="password" type="password" required autocomplete="current-password" minlength="8"></label>') +
      ('<button class="btn primary block">'+t('Giriş yap')+'</button>') +
    '</form>' +
    ('<button class="linkbtn" data-act="nav" data-go="/sifre">'+t('Şifremi unuttum')+'</button>') +
    ('<div class="authalt">'+t('Hesabın yok mu?')+' <button class="linkbtn" data-act="nav" data-go="/kayit">'+t('Kayıt ol')+'</button></div>') +
  '</div>';
}

function signupScreen(){
  const code = pendingCode();
  const role = code ? 'tenant' : (ui.signupRole || 'tenant');
  const card = (v, title, sub) =>
    '<label class="rolecard'+(role === v ? ' on' : '')+(code && v !== 'tenant' ? ' off' : '')+'">' +
      '<input type="radio" name="role" value="'+v+'"'+(role === v ? ' checked' : '')+(code && v !== 'tenant' ? ' disabled' : '')+' data-input="signupRole">' +
      '<b>'+title+'</b><span class="muted">'+sub+'</span></label>';
  return '<div class="auth">' + brand(t('Hesap oluştur')) +
    ('<h1>'+t('Kayıt ol')+'</h1>') +
    (code ? ('<div class="note">'+t('Davet kodu')+' <b>')+esc(code)+('</b> '+t('ile kiracı hesabı açıyorsun. Kayıttan sonra mülke otomatik bağlanacaksın.')+'</div>') : '') +
    message() +
    '<form class="stack" data-form="signup" novalidate>' +
      ('<fieldset class="roles"><legend class="label">'+t('Hesap türü')+'</legend>') +
        card('tenant', t('Kiracıyım'), t('Kiramı öder, taleplerimi takip ederim')) +
        card('landlord', t('Mülk sahibiyim'), t('Mülklerimi ve kiracılarımı yönetirim')) +
      '</fieldset>' +
      ('<label class="field">'+t('Ad soyad')+'<input name="name" required autocomplete="name" maxlength="60"></label>') +
      ('<label class="field">'+t('E-posta')+'<input name="email" type="email" required autocomplete="email" inputmode="email"></label>') +
      ('<label class="field">'+t('Şifre')+'<input name="password" type="password" required autocomplete="new-password" minlength="8" aria-describedby="pwHint"></label>') +
      ('<div class="muted" id="pwHint" style="margin-top:-6px">'+t('En az 8 karakter.')+'</div>') +
      ('<label class="check"><input type="checkbox" name="consent" required> <span>'+t('{terms} kabul ediyorum; {privacy} okudum.', {
          terms: '<a href="'+esc(CONFIG.legal.terms)+'" target="_blank" rel="noopener">'+t('Kullanım Koşulları’nı')+'</a>',
          privacy: '<a href="'+esc(CONFIG.legal.privacy)+'" target="_blank" rel="noopener">'+t('Gizlilik ve KVKK Aydınlatma Metni’ni')+'</a>'
        })+'</span></label>') +
      ('<button class="btn primary block">'+t('Hesap oluştur')+'</button>') +
    '</form>' +
    ('<div class="authalt">'+t('Hesabın var mı?')+' <button class="linkbtn" data-act="nav" data-go="/giris">'+t('Giriş yap')+'</button></div>') +
  '</div>';
}

function forgotScreen(){
  return '<div class="auth">' + brand(t('Şifre sıfırlama')) +
    ('<h1>'+t('Şifreni mi unuttun?')+'</h1>') +
    ('<p class="muted">'+t('E-posta adresini yaz; şifreni yenilemen için bir bağlantı gönderelim.')+'</p>') +
    message() +
    '<form class="stack" data-form="forgot" novalidate>' +
      ('<label class="field">'+t('E-posta')+'<input name="email" type="email" required autocomplete="email" inputmode="email"></label>') +
      ('<button class="btn primary block">'+t('Bağlantı gönder')+'</button>') +
    '</form>' +
    ('<button class="linkbtn" data-act="nav" data-go="/giris">'+t('Girişe dön')+'</button></div>');
}

function newPasswordScreen(){
  return '<div class="auth">' + brand(t('Yeni şifre')) +
    ('<h1>'+t('Yeni şifreni belirle')+'</h1>') + message() +
    '<form class="stack" data-form="newpass" novalidate>' +
      ('<label class="field">'+t('Yeni şifre')+'<input name="password" type="password" required autocomplete="new-password" minlength="8"></label>') +
      ('<label class="field">'+t('Yeni şifre (tekrar)')+'<input name="password2" type="password" required autocomplete="new-password" minlength="8"></label>') +
      ('<button class="btn primary block">'+t('Kaydet')+'</button>') +
    '</form></div>';
}

function joinScreen(route){
  const code = (route.code || '').toUpperCase();
  return '<div class="auth">' + brand(t('Davet')) +
    ('<h1>'+t('Kiraladığın mülke davet edildin')+'</h1>') +
    ('<p class="muted">'+t('Mülk sahibin seni Kiracım’a davet etti. Hesabını oluştur ya da giriş yap; kiraladığın mülke otomatik bağlanacaksın.')+'</p>') +
    '<div class="codebox">'+esc(code)+'</div>' + message() +
    ('<button class="btn primary block" data-act="nav" data-go="/kayit">'+t('Kiracı hesabı oluştur')+'</button>') +
    ('<button class="btn ghost block" data-act="nav" data-go="/giris">'+t('Hesabım var, giriş yap')+'</button></div>');
}

function inviteCodeScreen(){
  const name = backend.live.profile?.name || '';
  return '<div class="auth">' + brand(name ? (t('Merhaba')+' ') + name : t('Hoş geldin')) +
    ('<h1>'+t('Mülkine bağlan')+'</h1>') +
    ('<p class="muted">'+t('Mülk sahibinden aldığın davet kodunu gir. Kodu mülk sahibin Kiracım’da “Kiracı ekle” ile oluşturur.')+'</p>') +
    message() +
    '<form class="stack" data-form="join" novalidate>' +
      ('<label class="field">'+t('Davet kodu')+'<input name="code" required autocomplete="one-time-code" autocapitalize="characters" maxlength="12" style="text-transform:uppercase;letter-spacing:.12em;font-weight:800"></label>') +
      ('<button class="btn primary block">'+t('Mülke bağlan')+'</button>') +
    '</form>' +
    ('<button class="linkbtn" data-act="signOut">'+t('Çıkış yap')+'</button></div>');
}

/* ------------------------------------------------------------------ */
/* Formlar ve eylemler                                                 */
/* ------------------------------------------------------------------ */

export const AUTH_FORMS = ['login', 'signup', 'forgot', 'newpass', 'join', 'profile'];

function busy(form, on, label){
  const b = form.querySelector('button:not([type=button]):not(.linkbtn)');
  if (!b) return;
  if (on){ b.dataset.label = b.textContent; b.disabled = true; b.textContent = label || t('Bekle…'); }
  else { b.disabled = false; if (b.dataset.label) b.textContent = b.dataset.label; }
}

/**
 * Hata mesajını formu yeniden çizmeden gösterir; yazılanlar kaybolmaz ve
 * ekran okuyucu mesajı duyurur.
 */
function fail(text, form){
  ui.authMsg = { kind:'error', text };
  const host = (form && form.closest('.auth, .sheet')) || document.querySelector('#screen .auth');
  if (!host){ rerender(); return; }
  let box = host.querySelector('[data-authmsg]');
  if (!box){
    box = document.createElement('div');
    box.setAttribute('data-authmsg', '');
    (form || host.querySelector('form') || host.lastChild).before(box);
  }
  host.querySelectorAll('.note[role]').forEach(n => { if (n !== box) n.remove(); });
  box.className = 'note warn';
  box.setAttribute('role', 'alert');
  box.textContent = text;
  if (form) busy(form, false);
}

let rerender = () => {};
export function setRerender(fn){ rerender = fn; }

export async function authSubmit(type, fd, form){
  const email = String(fd.get('email') || '').trim().toLowerCase();
  const password = String(fd.get('password') || '');
  ui.authMsg = null;

  if (type === 'login'){
    if (!email || !password) return fail(t('E-posta ve şifreni gir.'), form);
    busy(form, true, t('Giriş yapılıyor…'));
    try { await backend.signIn({ email, password }); }
    catch(e){ return fail(backend.humanError(e), form); }
    return;   // gerisini oturum olayı yürütür
  }

  if (type === 'signup'){
    const name = String(fd.get('name') || '').trim();
    const role = pendingCode() ? 'tenant' : String(fd.get('role') || 'tenant');
    if (!name) return fail(t('Adını yaz.'), form);
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail(t('Geçerli bir e-posta adresi yaz.'), form);
    if (password.length < 8) return fail(t('Şifre en az 8 karakter olmalı.'), form);
    if (!fd.get('consent')) return fail(t('Devam etmek için koşulları kabul ettiğini işaretle.'), form);
    busy(form, true, t('Hesap oluşturuluyor…'));
    try {
      const { needsConfirm } = await backend.signUp({ name, email, password, role });
      if (needsConfirm){
        ui.authMsg = { kind:'info', text: email + (' '+t('adresine bir doğrulama bağlantısı gönderdik. Bağlantıya tıkladıktan sonra giriş yapabilirsin.')) };
        go('/giris', { replace:true });
        rerender();
      }
    } catch(e){ return fail(backend.humanError(e), form); }
    return;
  }

  if (type === 'forgot'){
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail(t('Geçerli bir e-posta adresi yaz.'), form);
    busy(form, true, t('Gönderiliyor…'));
    try {
      await backend.resetPassword(email);
      ui.authMsg = { kind:'info', text:(t('Bir hesap varsa')+' ')+email+(' '+t('adresine sıfırlama bağlantısı gönderildi.')) };
      rerender();
    } catch(e){ fail(backend.humanError(e), form); }
    return;
  }

  if (type === 'newpass'){
    if (password.length < 8) return fail(t('Şifre en az 8 karakter olmalı.'), form);
    if (password !== String(fd.get('password2') || '')) return fail(t('Şifreler aynı değil.'), form);
    busy(form, true, t('Kaydediliyor…'));
    try {
      await backend.updatePassword(password);
      notify({ title:t('Şifre güncellendi'), body:t('Yeni şifrenle giriş yapabilirsin.'), icon:'key' }, false);
      if (current().auth === 'yeni-sifre') go(home(), { replace:true });
      else rerender();
    } catch(e){ fail(backend.humanError(e), form); }
    return;
  }

  if (type === 'join'){
    const code = String(fd.get('code') || '').trim().toUpperCase();
    if (!code) return fail(t('Davet kodunu gir.'), form);
    busy(form, true, t('Bağlanılıyor…'));
    try {
      await backend.acceptInvite(code);
      ui.meTenant = backend.live.user?.id;
      notify({ title:t('Mülke katıldın'), body:t('Mülk sahibinle artık aynı paneldesiniz.'), icon:'home' }, false);
      go(home(), { replace:true });
    } catch(e){ fail(backend.humanError(e), form); }
    return;
  }

  if (type === 'profile'){
    const name = String(fd.get('name') || '').trim();
    const phone = String(fd.get('phone') || '').trim();
    if (!name) return fail(t('Adını yaz.'), form);
    busy(form, true, t('Kaydediliyor…'));
    try {
      await backend.updateProfile({ name, phone });
      notify({ title:t('Kaydedildi'), body:t('Profil bilgilerin güncellendi.'), icon:'home' }, false);
      busy(form, false);
      rerender();
    } catch(e){ fail(backend.humanError(e), form); }
  }
}

export const AUTH_ACTIONS = {
  signOut: async () => {
    await backend.signOut();
    go('/giris', { replace:true });
  },
  deleteAccount: async () => {
    const { ask } = await import('./confirm.js');
    if (!await ask({
      title:t('Hesabın silinsin mi?'),
      body:t('Hesabın ve sahibi olduğun mülklerin tüm kayıtları kalıcı olarak silinir. Bu işlem geri alınamaz.') +
        (backend.live.access?.subscribed && backend.live.access?.willRenew ? ' '+t('Mağaza aboneliğin hesap silinince kendiliğinden iptal olmaz; App Store ya da Google Play’den ayrıca iptal et.') : ''),
      ok:t('Hesabı sil'), danger:true
    })) return;
    try {
      await backend.deleteAccount();
      go('/giris', { replace:true });
      notify({ title:t('Hesabın silindi'), body:t('Tüm verilerin kaldırıldı.'), icon:'home' }, false);
    } catch(e){ notify({ title:t('Silinemedi'), body: backend.humanError(e), icon:'home' }, false); }
  },
  togglePush: async () => {
    try {
      const st = await backend.pushState();
      if (st === 'on') await backend.disablePush();
      else if (st === 'off') {
        const ok = await backend.enablePush();
        if (!ok) notify({ title:t('İzin verilmedi'), body:t('Bildirim izni tarayıcı ayarlarından açılabilir.'), icon:'bell' }, false);
      }
    } catch(e){ notify({ title:t('Bildirimler açılamadı'), body: backend.humanError(e), icon:'bell' }, false); }
    ui.pushState = await backend.pushState().catch(() => 'unsupported');
    rerender();
  }
};
