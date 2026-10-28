/* Kurumlar (kurumsal müşteri hesabı, yol planı Faz 0).

   Kurum: site yönetimi, AVM, GYO, depo, emlak ofisi, family office gibi kurumsal müşteri. Bir master yöneticisi
   vardır; diğer yöneticilerin yetkisi kurumun rollerinden gelir. Roller ve yetkileri master düzenler.
   Yetki ve modül listeleri supabase/schema.sql (16. bölüm) ile aynıdır; sunucu her işlemi ayrıca denetler. */

import { t } from './i18n.js';
import { client, live } from './backend.js';
import { emit } from './state.js';

/** Sektörler: ad, simge ve bu sektörde kullanılan sözcükler. */
export const SECTORS = () => [
  { key: 'site', label: t('Site ve bina yönetimi'), icon: 'grid' },
  { key: 'avm', label: t('AVM'), icon: 'shop' },
  { key: 'gyo', label: t('GYO'), icon: 'chart' },
  { key: 'depo', label: t('Depo ve lojistik'), icon: 'box' },
  { key: 'emlak', label: t('Emlak ofisi'), icon: 'office' },
  { key: 'family', label: t('Family office'), icon: 'safe' },
  { key: 'diger', label: t('Diğer'), icon: 'landlord' }
];
export const sectorOf = (key) => SECTORS().find((s) => s.key === key) || SECTORS()[SECTORS().length - 1];

/** Sektöre göre sözcükler: aynı ekranlar, sektörün diliyle (ör. sitede kira yerine aidat, kiracı yerine sakin). */
export function terms(sector){
  if (sector === 'site') return { unit: t('Daire'), units: t('Daireler'), occupant: t('Sakin'), occupants: t('Sakinler'), charge: t('Aidat') };
  if (sector === 'avm') return { unit: t('Mağaza'), units: t('Mağazalar'), occupant: t('Mağaza kiracısı'), occupants: t('Kiracılar'), charge: t('Kira') };
  if (sector === 'depo') return { unit: t('Depo'), units: t('Depolar'), occupant: t('Kiracı'), occupants: t('Kiracılar'), charge: t('Kira') };
  return { unit: t('Birim'), units: t('Birimler'), occupant: t('Kiracı'), occupants: t('Kiracılar'), charge: t('Kira') };
}

/** Yetki kataloğu (sırası ekranda gösterim sırasıdır). */
export const PERMS = () => [
  { key: 'org.settings', label: t('Kurum bilgileri'), desc: t('Kurum adı, fatura ve iletişim bilgilerini düzenler.') },
  { key: 'org.members', label: t('Yönetici ekleme'), desc: t('Yönetici davet eder, rollerini değiştirir, kurumdan çıkarır.') },
  { key: 'units.manage', label: t('Birim yönetimi'), desc: t('Blok, daire, mağaza ve depo kayıtlarını düzenler.') },
  { key: 'residents.manage', label: t('Sakin ve kiracılar'), desc: t('Sakin, malik ve kiracı davet eder, bilgilerini düzenler.') },
  { key: 'charges.manage', label: t('Tahakkuk'), desc: t('Aidat ve kira tahakkuku girer, düzeltir.') },
  { key: 'payments.approve', label: t('Dekont onayı'), desc: t('Yüklenen dekontları onaylar ya da reddeder.') },
  { key: 'expenses.manage', label: t('Giderler'), desc: t('Ortak giderleri ve faturaları girer.') },
  { key: 'requests.manage', label: t('Talepler'), desc: t('Arıza ve talepleri yanıtlar, durumunu değiştirir.') },
  { key: 'announce', label: t('Duyurular'), desc: t('Sakinlere ve kiracılara duyuru gönderir.') },
  { key: 'documents.manage', label: t('Belgeler'), desc: t('Belge ve sözleşme yükler, siler.') },
  { key: 'reports.view', label: t('Raporlar'), desc: t('Tahsilat ve gider raporlarını görür.') }
];

/** Modül kataloğu. ready: bugün üründe çalışıyor; diğerleri yol planında (kuruma şimdiden atanabilir). */
export const MODULES = () => [
  { key: 'kira', label: t('Kira takibi'), ready: true },
  { key: 'aidat', label: t('Aidat takibi'), ready: false },
  { key: 'gider_dagitim', label: t('Gider dağıtımı'), ready: false },
  { key: 'duyuru', label: t('Duyurular'), ready: false },
  { key: 'ortak_gider', label: t('Ortak alan gideri'), ready: false },
  { key: 'ciro_kira', label: t('Ciroya bağlı kira'), ready: false },
  { key: 'endeksleme', label: t('Endeksleme (TÜFE, döviz)'), ready: false },
  { key: 'doluluk', label: t('Doluluk raporu'), ready: false },
  { key: 'onay_akisi', label: t('Onay akışı'), ready: false },
  { key: 'rapor', label: t('Aylık ve yıllık rapor'), ready: true },
  { key: 'api', label: t('API ve dışa aktarma'), ready: false }
];

/** Sektörün varsayılan modülleri (sunucudaki sector_modules ile aynı). */
export function sectorModules(sector){
  return ({
    site: ['aidat', 'gider_dagitim', 'duyuru', 'rapor'],
    avm: ['kira', 'ortak_gider', 'ciro_kira', 'doluluk', 'rapor'],
    depo: ['kira', 'ortak_gider', 'endeksleme', 'rapor'],
    gyo: ['kira', 'ortak_gider', 'doluluk', 'onay_akisi', 'rapor', 'api']
  })[sector] || ['kira', 'rapor'];
}

function must(res){
  if (res.error) throw res.error;
  return res.data;
}
const rpc = async (name, args) => must(await (await client()).rpc(name, args));

/* ---- Kurum yöneticisi (uygulama) ---------------------------------- */

/** Oturumdaki kişinin kurumları (yoksa boş). */
export const myOrgs = () => live.orgs || [];
export const orgCan = (org, perm) => !!org && (org.master || (org.perms || []).includes(perm));

export async function refreshOrgs(redraw = true){
  try { live.orgs = (await rpc('my_orgs')) || []; } catch(e){ console.warn('Kurumlar okunamadı', e); }
  if (redraw) emit();
  return live.orgs || [];
}

export const orgDetail = (oid) => rpc('org_detail', { oid });
export const saveRole = (oid, rid, nm, perms) => rpc('org_role_save', { oid, rid: rid || null, nm, perms });
export const deleteRole = (rid) => rpc('org_role_delete', { rid });
export const createOrgInvite = (oid, rid, mail = '') => rpc('org_invite_create', { oid, rid: rid || null, mail });
export const deleteOrgInvite = (c) => rpc('org_invite_delete', { c });
export const setMemberRole = (oid, member, rid) => rpc('org_member_set', { oid, member, rid: rid || null });
export const removeOrgMember = (oid, member) => rpc('org_member_remove', { oid, member });
export const transferMaster = (oid, member) => rpc('org_transfer_master', { oid, member });

/** Kurum davet kodu "K" ile başlar (mülk davet kodları yalnız 0-9 ve A-F içerir). */
export const isOrgCode = (code) => /^K[0-9A-F]{7}$/.test(String(code || '').trim().toUpperCase());
export async function acceptOrgInvite(code){
  const oid = await rpc('accept_org_invite', { invite_code: String(code).trim().toUpperCase() });
  await refreshOrgs();
  return oid;
}

/* ---- anahtar yöneticisi (yönetici paneli) ------------------------- */

export const adminOrgs = async () => (await rpc('admin_orgs')) || [];
export const adminSaveOrg = (p) => rpc('admin_org_save', { p });
export const adminSetMaster = (oid, mail) => rpc('admin_org_set_master', { oid, mail });
