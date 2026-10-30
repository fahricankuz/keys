/* Oturum. Supabase kuruluysa gerçek hesap; değilse bu cihaza özel yerel hesap.
   Uygulama (/uygulama) yalnızca oturumla açılır. */
import { CAPTCHA_KEY, captchaPending, captchaSpent, captchaToken } from './captcha';
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { hydrate, storage } from '../domain/storage';
import { LIVE, CONFIG } from '../domain/config';
import { closeLocal, openLocal, ui } from '../domain/state';
import { t, getLang } from '../domain/i18n';
import { account, adoptPlanChoice, PLAN_CHOICE } from '../domain/billing';
import * as backend from '../domain/backend';
import { playOnNextOpen } from '../app-ui/OpenSplash';

export type Role = 'tenant' | 'landlord' | 'team';
export type Entry = 'tenant' | 'landlord' | 'admin';
export type User = { id: string; email: string; name: string; role: Role; createdAt?: number; admin?: boolean; phone?: string };

/** Görünüm rolü: ekip üyeleri mülk sahibi arayüzünü (yetkileri kadar) kullanır. */
const viewRole = (r: Role): 'tenant' | 'landlord' => (r === 'tenant' ? 'tenant' : 'landlord');

const ACCOUNTS = 'kiracim-hesaplar';
const SESSION = 'kiracim-oturum';
const INVITE = 'kiracim-davet';

type Account = User & { hash: string; salt: string; createdAt?: number };

const readAccounts = (): Account[] => { try { return JSON.parse(storage.getItem(ACCOUNTS) || '[]'); } catch { return []; } };
// Yerel hesap (sunucusuz kurulum) şifre özeti ve kimlikleri: expo-crypto yalnız bu anda yüklenir.
const crypto = () => import('expo-crypto');
const hashPw = async (pw: string, salt: string) => { const C = await crypto(); return C.digestStringAsync(C.CryptoDigestAlgorithm.SHA256, salt + ':' + pw); };

type Ctx = {
  user: User | null; ready: boolean; live: boolean;
  /** `as`: hangi girişten gelindi; hesap türü uyuşmazsa oturum açılmaz. */
  signIn(e: string, p: string, as?: Entry): Promise<string | null>;
  signUp(a: { name: string; email: string; password: string; role: Role }): Promise<string | null>;
  reset(email: string): Promise<string | null>;
  /** E-posta onay bağlantısıyla açılan oturumu benimser (panel açılırken giriş geçişi oynar). */
  adopt(): Promise<User | null>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
  /** Davet koduyla mülke bağlan (gerçek hesap, kiracı). */
  join(code: string): Promise<string | null>;
  /** Ayarlar: ad ve telefon. */
  saveProfile(a: { name: string; phone: string }): Promise<string | null>;
  /** Yeni e-posta; gerçek hesapta onay bağlantısı gönderilir ('CONFIRM' döner). */
  changeEmail(email: string): Promise<string | null>;
  changePassword(current: string, next: string): Promise<string | null>;
};
const AuthCtx = createContext<Ctx>(null as unknown as Ctx);
export const useAuth = () => useContext(AuthCtx);

/** Veri bu sürümde cihazdadır (hesap başına ayrı anahtar); sunucu eşitlemesi sonraki aşamadır. */
function enter(u: User) {
  ui.role = viewRole(u.role);
  account.since = u.createdAt || Date.now();
  openLocal('kiracim-veri-' + u.id, u.role);
}

/** Oturum kapanınca arayüz durumunu sıfırlar. */
function leave() { ui.role = 'tenant'; ui.team = false; ui.memberRoles = {}; }

/** Bekleyen davet kodu (/katil bağlantısından gelir); giriş sonrası kabul edilir. */
export const keepInvite = (code: string) => { try { storage.setItem(INVITE, code.trim().toUpperCase()); } catch {} };
/** Kayıt formunda gösterilecek bekleyen davet kodu. */
export const pendingInvite = (): string => { try { return storage.getItem(INVITE) || ''; } catch { return ''; } };

/** Girişten gelinen tür hesapla uyuşmuyorsa kullanıcıya doğru girişi söyler. */
function wrongEntry(u: User, as: Entry): string | null {
  if (as === 'admin') return u.admin ? null : t('Bu hesap yönetici hesabı değil.');
  if (u.admin) return t('Bu bir yönetici hesabı. Yönetici girişini kullan.');
  if (viewRole(u.role) === as) return null;
  if (u.role === 'team') return t('Bu bir ekip hesabı. Mülk sahibi girişini kullan.');
  return as === 'tenant' ? t('Bu hesap bir mülk sahibi hesabı. Mülk sahibi girişini kullan.') : t('Bu hesap bir kiracı hesabı. Kiracı girişini kullan.');
}

/** Gerçek hesap: sunucudan profil ve veriyi yükler; yönetici hesabı ev verisi yüklemez. */
async function enterLive(au: { id: string; email?: string }): Promise<User> {
  const res: any = await backend.openSession({ id: au.id, email: au.email });
  const p = backend.live.profile || {};
  const u: User = { id: au.id, email: au.email || '', name: p.name || '', phone: p.phone || '', role: (p.role as Role) || 'tenant', admin: !!res.admin };
  if (!u.admin) {
    ui.role = viewRole(u.role);
    const code = storage.getItem(INVITE);
    if (code) {
      try { await backend.acceptInvite(code); } catch {}
      storage.removeItem(INVITE);
    }
    adoptPlanChoice(u.role);          // satın alma sayfasında seçilen paket (varsa) profile yazılır
    backend.welcomeOnce(u.id);         // ilk girişte hoş geldin e-postası (tür ve pakete göre)
  }
  return u;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await hydrate();
        // Kayıtlı oturum yoksa sunucu kütüphanesi yüklenmez (herkese açık sayfalar daha hızlı açılır).
        if (LIVE) {
          if (await backend.hasStoredSession()) {
            const c = await backend.client();
            const { data } = await c.auth.getSession();
            const s = data.session;
            if (s) setUser(await enterLive(s.user));
          }
        } else {
          const id = storage.getItem(SESSION);
          const a = id && readAccounts().find((x) => x.id === id);
          if (a) { const u = { id: a.id, email: a.email, name: a.name, phone: a.phone, role: a.role, createdAt: a.createdAt }; enter(u); setUser(u); }
        }
      } catch {}
      setReady(true);
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string, as?: Entry) => {
    email = email.trim().toLowerCase();
    if (!email || !password) return t('E-posta ve şifreni gir.');
    try {
      if (LIVE) {
        if (captchaPending()) return t('Güvenlik doğrulaması bitsin, sonra tekrar dene.');
        const c = await backend.client();
        const { data, error } = await c.auth.signInWithPassword({ email, password, options: { captchaToken: captchaToken() ?? undefined } });
        captchaSpent();
        if (error) return backend.humanError(error);
        const u = await enterLive(data.user);
        const wrong = as && wrongEntry(u, as);
        if (wrong) { await backend.closeSession(); closeLocal(); leave(); return wrong; }
        playOnNextOpen(); setUser(u); return null;
      }
      if (as === 'admin') return t('Yönetici girişi yalnızca sunucuya bağlı kurulumda çalışır.');
      const a = readAccounts().find((x) => x.email === email);
      if (!a || a.hash !== (await hashPw(password, a.salt))) return t('E-posta ya da şifre yanlış.');
      if (as && viewRole(a.role) !== as) return wrongEntry({ ...a, admin: false }, as);
      storage.setItem(SESSION, a.id);
      const u = { id: a.id, email: a.email, name: a.name, phone: a.phone, role: a.role, createdAt: a.createdAt };
      playOnNextOpen(); enter(u); setUser(u); return null;
    } catch (e: any) {
      if (e?.banned !== undefined) return t('Hesabın askıya alındı: {m}', { m: e.banned || t('gerekçe belirtilmedi') }) + ' ' + t('Bilgi için info@anahtar.io adresine yaz.');
      return t('Bağlantı kurulamadı. Biraz sonra yeniden dene.');
    }
  }, []);

  const signUp = useCallback(async ({ name, email, password, role }: { name: string; email: string; password: string; role: Role }) => {
    email = email.trim().toLowerCase(); name = name.trim();
    if (!name || !email || password.length < 8) return t('Adını, e-postanı ve en az 8 karakterli bir şifre gir.');
    try {
      if (LIVE) {
        if (captchaPending()) return t('Güvenlik doğrulaması bitsin, sonra tekrar dene.');
        const c = await backend.client();
        // Onay e-postasındaki bağlantı /dogrula sayfasına döner: oturum açılır, kişi doğrudan paneline geçer
        // (Supabase → Redirect URLs listesinde anahtar.io/** olmalı).
        // Mülk sahibinin seçtiği paket hesap bilgisine de yazılır: onayı başka cihazda yapsa da hoş geldin e-postası doğru paketi anlatır.
        let plan: string | undefined;
        try { const pc = JSON.parse(storage.getItem(PLAN_CHOICE) || 'null'); if (role === 'landlord' && pc && ['tek', 'bes'].includes(pc.plan)) plan = pc.plan; } catch {}
        const { data, error } = await c.auth.signUp({ email, password, options: { data: { name, role, lang: getLang(), ...(plan ? { plan } : {}) }, captchaToken: captchaToken() ?? undefined,
          emailRedirectTo: CONFIG.publicUrl.replace(/\/?$/, '/') + 'dogrula' } });
        captchaSpent();
        if (error) return t('Hesap oluşturulamadı: {m}', { m: backend.humanError(error) });
        if (!data.session) return 'CONFIRM';
        playOnNextOpen(); setUser(await enterLive(data.user!)); return null;
      }
      if (role === 'team') return t('Ekip hesapları yalnızca sunucuya bağlı kurulumda açılır.');
      const list = readAccounts();
      if (list.some((x) => x.email === email)) return t('Bu e-posta ile bir hesap zaten var.');
      const Crypto = await crypto();
      const salt = Crypto.randomUUID();
      const id = Crypto.randomUUID().slice(0, 12);
      const createdAt = Date.now();
      list.push({ id, email, name, role, salt, createdAt, hash: await hashPw(password, salt) });
      storage.setItem(ACCOUNTS, JSON.stringify(list));
      storage.setItem(SESSION, id);
      const u = { id, email, name, role, createdAt };
      playOnNextOpen(); enter(u); setUser(u); return null;
    } catch { return t('Bağlantı kurulamadı. Biraz sonra yeniden dene.'); }
  }, []);

  const adopt = useCallback(async () => {
    if (!LIVE) return null;
    const c = await backend.client();
    const { data } = await c.auth.getSession();
    if (!data.session) return null;
    const u = await enterLive(data.session.user);
    playOnNextOpen(); setUser(u); setReady(true);
    return u;
  }, []);

  const reset = useCallback(async (email: string) => {
    email = email.trim().toLowerCase();
    if (!email) return t('E-posta adresini yaz.');
    if (!LIVE) return t('Yerel hesap modunda şifre sıfırlanamaz. Sunucu kurulunca e-posta ile sıfırlanır.');
    try {
      if (captchaPending()) return t('Güvenlik doğrulaması bitsin, sonra tekrar dene.');
      const c = await backend.client();
      const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: CONFIG.publicUrl + 'yeni-sifre', captchaToken: captchaToken() ?? undefined });
      captchaSpent();
      return error ? t('Bağlantı gönderilemedi.') : null;
    } catch { return t('Bağlantı kurulamadı. Biraz sonra yeniden dene.'); }
  }, []);

  const signOut = useCallback(async () => {
    try { if (LIVE) await backend.closeSession(); } catch {}
    storage.removeItem(SESSION);
    closeLocal(); leave(); setUser(null);
  }, []);

  /** Hesabı ve bu cihazdaki verisini siler (mağaza kuralı: uygulama içinden hesap silme). */
  const deleteAccount = useCallback(async () => {
    const id = user?.id;
    if (LIVE) { try { await backend.deleteAccount(); } catch {} storage.removeItem(SESSION); closeLocal(); leave(); setUser(null); return; }
    if (id) {
      storage.setItem(ACCOUNTS, JSON.stringify(readAccounts().filter((x) => x.id !== id)));
      storage.removeItem('kiracim-veri-' + id);
    }
    await signOut();
  }, [user, signOut]);

  const join = useCallback(async (code: string) => {
    code = code.trim().toUpperCase();
    if (!code) return t('Davet kodunu gir.');
    if (!LIVE) return t('Davet kodları sunucuya bağlı kurulumda çalışır. Site sunucuya bağlanınca kodunla mülküne bağlanabilirsin.');
    try { await backend.acceptInvite(code); storage.removeItem(INVITE); return null; } catch (e) { return backend.humanError(e); }
  }, []);

  /** Yerel hesabın kaydını günceller. */
  const patchLocal = (id: string, patch: Partial<Account>) =>
    storage.setItem(ACCOUNTS, JSON.stringify(readAccounts().map((x) => (x.id === id ? { ...x, ...patch } : x))));

  const saveProfile = useCallback(async ({ name, phone }: { name: string; phone: string }) => {
    name = name.trim(); phone = phone.trim();
    if (!user) return t('Önce giriş yap.');
    if (!name) return t('Adını yaz.');
    try {
      if (LIVE) await backend.updateProfile({ name, phone });
      else patchLocal(user.id, { name, phone });
      setUser({ ...user, name, phone }); return null;
    } catch (e) { return backend.humanError(e); }
  }, [user]);

  const changeEmail = useCallback(async (email: string) => {
    email = email.trim().toLowerCase();
    if (!user) return t('Önce giriş yap.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return t('Geçerli bir e-posta adresi yaz.');
    if (email === user.email) return t('Bu zaten şu anki e-posta adresin.');
    try {
      if (LIVE) {
        const c = await backend.client();
        const { error } = await c.auth.updateUser({ email }, { emailRedirectTo: CONFIG.publicUrl });
        return error ? backend.humanError(error) : 'CONFIRM';
      }
      if (readAccounts().some((x) => x.email === email && x.id !== user.id)) return t('Bu e-posta ile bir hesap zaten var.');
      patchLocal(user.id, { email });
      setUser({ ...user, email }); return null;
    } catch (e) { return backend.humanError(e); }
  }, [user]);

  const changePassword = useCallback(async (current: string, next: string) => {
    if (!user) return t('Önce giriş yap.');
    if (next.length < 8) return t('Yeni şifre en az 8 karakter olmalı.');
    if (next === current) return t('Yeni şifre eskisiyle aynı olamaz.');
    try {
      if (LIVE) {
        const c = await backend.client();
        // Mevcut şifre doğrulanır; bot koruması açıkken giriş isteği jeton ister, o durumda oturum yeterli sayılır.
        if (!CAPTCHA_KEY) {
          const { error } = await c.auth.signInWithPassword({ email: user.email, password: current });
          if (error) return t('Mevcut şifren yanlış.');
        }
        const { error } = await c.auth.updateUser({ password: next });
        return error ? backend.humanError(error) : null;
      }
      const a = readAccounts().find((x) => x.id === user.id);
      if (!a || a.hash !== (await hashPw(current, a.salt))) return t('Mevcut şifren yanlış.');
      const salt = (await crypto()).randomUUID();
      patchLocal(user.id, { salt, hash: await hashPw(next, salt) });
      return null;
    } catch (e) { return backend.humanError(e); }
  }, [user]);

  const value = useMemo(() => ({ user, ready, live: LIVE, signIn, signUp, reset, adopt, signOut, deleteAccount, join, saveProfile, changeEmail, changePassword }),
    [user, ready, signIn, signUp, reset, adopt, signOut, deleteAccount, join, saveProfile, changeEmail, changePassword]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
