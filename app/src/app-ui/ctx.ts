/* Rol bağlamları: aynı e-posta birden çok rol taşıyabilir (mülk sahibi, başka mülkte kiracı, site/portföy yöneticisi, ekip).
   Giriş sonrası üstteki seçici, kişinin gerçekten sahip olduğu rolleri listeler; seçim paneli ve menüyü günceller.
   Rol, hesabın verisinden türetilir (yeni bir rol tablosu yok); seçim cihazda hatırlanır. */
import { S, ui, emit } from '../domain/state';
import { t } from '../domain/i18n';
import { live } from '../domain/backend';
import { access, trialDaysLeft } from '../domain/billing';
import { planLabel, unitsText } from '../domain/plans';
import { myOrgs, PORTFOLIO_SECTORS } from '../domain/org';
import { storage } from '../domain/storage';
import { P } from '../domain/logic';
import { isTeam, roleLabel, memberRole } from '../domain/team';

export type Ctx = { key: string; label: string; sub: string; icon: string };

const KEY = (id: string) => 'anahtar-rol:' + id;
const portfolioOrgs = () => myOrgs().filter((o: any) => PORTFOLIO_SECTORS.includes(o.sector));

/** Mülk sahibi rolünün paketi: "Başlangıç · 3 mülke kadar", "Deneme · 12 gün", "Paket yok". */
function packageText(): string {
  const a: any = access();
  if (!a || a.pending) return '';
  if (a.subscribed) return [a.plan ? planLabel(a.plan) : t('Abonelik'), a.units !== undefined ? unitsText(a.units) : ''].filter(Boolean).join(' · ');
  if (a.inTrial) return t('Deneme') + ' · ' + t('{n} gün', { n: trialDaysLeft(a) });
  return a.access === false ? t('Paket yok') : '';
}

/** Kişinin sahip olduğu roller (en az iki ise seçici görünür). */
export function myContexts(): Ctx[] {
  const role = live.profile?.role;
  if (!live.user || !role) return [];
  const out: Ctx[] = [];
  if (role === 'landlord') out.push({ key: 'ev', label: t('Mülk sahibi'), sub: packageText(), icon: 'landlord' });
  else if (role === 'team') out.push({ key: 'ev', label: S.order.length ? roleLabel(memberRole(S.order[0])) : t('Ekip üyesi'), sub: t('Ekip'), icon: 'landlord' });
  if (S.myHome && role !== 'tenant') out.push({ key: 'kiraci', label: t('Kiracı'), sub: (P(S.myHome) as any)?.name || t('Evim'), icon: 'home' });
  if (S.myHome && role === 'tenant' && portfolioOrgs().length) out.push({ key: 'kiraci', label: t('Kiracı'), sub: (P(S.myHome) as any)?.name || t('Evim'), icon: 'home' });
  for (const o of portfolioOrgs()) out.push({ key: 'site:' + o.id, label: o.sector === 'site' ? t('Site yöneticisi') : t('Portföy yöneticisi'), sub: o.name, icon: 'grid' });
  return out;
}

/** Şu an seçili bağlam anahtarı (geçersizse varsayılan: kurum yöneticisiyse kurum, değilse hesabın rolü). */
export function activeCtx(list: Ctx[] = myContexts()): string {
  if (ui.ctx && list.some((x) => x.key === ui.ctx)) return ui.ctx as string;
  const org = list.find((x) => x.key.startsWith('site:'));
  return org ? org.key : (list[0]?.key || 'ev');
}

/** Bağlamı seçer: görünüm rolünü ve kurum seçimini ayarlar, hatırlar, ekranı yeniler. Dönen değer: açılacak sayfa. */
export function selectCtx(key: string): string {
  ui.ctx = key;
  if (key === 'kiraci') ui.role = 'tenant';
  else ui.role = 'landlord';
  if (key.startsWith('site:')) ui.siteOrg = key.slice(5);
  try { if (live.user) storage.setItem(KEY(live.user.id), key); } catch {}
  emit();
  return key.startsWith('site:') ? '/uygulama/site' : '/uygulama';
}

/** Girişten sonra, kayıtlı seçimi uygular (bir kez). Geçersizse varsayılan kalır. */
export function restoreCtx() {
  const id = live.user?.id;
  if (!id || ui.ctxFor === id) return;
  ui.ctxFor = id;
  let saved: string | null = null;
  try { saved = storage.getItem(KEY(id)); } catch {}
  const list = myContexts();
  if (saved && list.some((x) => x.key === saved)) selectCtx(saved);
}
