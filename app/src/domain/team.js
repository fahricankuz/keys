/* Ekip üyeleri ve yetkiler.

   Mülk sahibi; emlakçı, muhasebeci ve personeli mülklerine ekip üyesi olarak ekler.
   Her mülkte oturum sahibinin rolü ui.memberRoles'ta durur (sunucudan gelir); rol
   bilinmiyorsa görünüme göre kiracı ya da mülk sahibi kabul edilir. Asıl kural
   sunucudadır, buradaki denetim yalnızca arayüzü düzenler. */

import { ui } from './state.js';
import { t } from './i18n.js';

export const TEAM_ROLES = ['agent', 'accountant', 'staff'];

/** Rolün yapabildiği işler; null = her şey (mülk sahibi). */
const PERMS = {
  landlord: null,
  agent: ['pay', 'decide', 'request', 'message', 'document', 'shared', 'expense_read', 'expense'],
  staff: ['request', 'message', 'document'],
  accountant: ['expense_read'],
  tenant: ['pay', 'request', 'message', 'document', 'shared']
};

export function memberRole(pid){
  return (ui.memberRoles && ui.memberRoles[pid]) || (ui.role === 'tenant' ? 'tenant' : 'landlord');
}

export function can(pid, perm){
  const p = PERMS[memberRole(pid)];
  return p === null || (!!p && p.includes(perm));
}

export function isOwnerOf(pid){ return memberRole(pid) === 'landlord'; }
export function isTeam(){ return !!ui.team; }
export function canAny(pids, perm){ return (pids || []).some(pid => can(pid, perm)); }

export function roleLabel(role){
  return ({
    agent: t('Emlakçı'), accountant: t('Muhasebeci'), staff: t('Personel'),
    landlord: t('Mülk sahibi'), tenant: t('Kiracı')
  })[role] || role;
}

export function roleBlurb(role){
  return ({
    agent: t('Atandığı mülklerde ödeme, talep, mesaj, belge, tutanak ve giderleri yönetir. Mülk silemez, kirayı ve aboneliği değiştiremez.'),
    accountant: t('Ödeme, gider, rapor ve vergi tahminini okur, CSV indirir. Hiçbir şey yazamaz, mesajları göremez.'),
    staff: t('Talepleri ve mesajları yönetir, belge yükler. Ödeme onaylayamaz, kirayı ve sözleşmeyi değiştiremez.')
  })[role] || '';
}
