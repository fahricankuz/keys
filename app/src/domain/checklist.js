/* Kurulum kontrol listesi: panelde "yarım kalan" adımlar. Adımlar mevcut veriden hesaplanır (saf işlevler, birim testli);
   veritabanı değişikliği yoktur. Hepsi bitince ya da kişi "Gizle" deyince kart görünmez (S.settings). */

import { t } from './i18n.js';

/** Mülk sahibi: props = mülk listesi (mapping.buildProperty biçimi). */
export function landlordSteps(props){
  const ps = props || [];
  const first = ps[0];
  const noTenant = ps.find((p) => !(p.tenants || []).length) || first;
  const waiting = ps.find((p) => (p.tenants || []).some((x) => x.pending));
  const noDoc = ps.find((p) => !(p.docs || []).some((d) => d.cat === 'Kira sözleşmesi')) || first;
  const noDask = ps.find((p) => !p.dask) || first;
  const anyPay = (p) => [...Object.values(p.pay || {}), ...Object.values(p.aidatPay || {})];
  const toApprove = ps.find((p) => anyPay(p).some((r) => r.status === 'review' || r.status === 'partial')) || first;
  return [
    { key: 'prop', label: t('İlk mülkünü ekle'), done: ps.length > 0, act: { sheet: 'ev-ekle' } },
    { key: 'invite', label: t('Kiracını davet et'), done: ps.some((p) => (p.tenants || []).length > 0), act: noTenant ? { sheet: 'kiraci-ekle', pid: noTenant.id } : null },
    { key: 'joined', label: t('Kiracın katıldı'), done: ps.some((p) => (p.tenants || []).some((x) => !x.pending)),
      hint: waiting ? t('Davet bekliyor; kodu yeniden gönderebilirsin.') : '', act: waiting ? { go: '/mulk-sahibi/mulk/' + waiting.id } : null },
    { key: 'contract', label: t('Kira sözleşmesini yükle'), done: ps.some((p) => (p.docs || []).some((d) => d.cat === 'Kira sözleşmesi')),
      act: noDoc ? { go: '/mulk-sahibi/mulk/' + noDoc.id + '/belge' } : null },
    { key: 'dask', label: t('DASK bitiş tarihini gir'), done: ps.some((p) => !!p.dask), act: noDask ? { sheet: 'ev-duzenle', pid: noDask.id } : null },
    { key: 'paid', label: t('İlk dekontu onayla'), done: ps.some((p) => anyPay(p).some((r) => r.status === 'approved')),
      act: toApprove ? { go: '/mulk-sahibi/mulk/' + toApprove.id + '/odeme' } : null }
  ];
}

const pct = (a, b) => (b ? a / b : 0);

/** Kurum (site, AVM, depo, GYO): d = loadSiteAdmin verisi. Kişi ve davet adımları %80'de tamam sayılır.
    @returns {{ key: string, label: string, done: boolean, progress?: number, act?: any }[]} */
export function orgSteps(d, modules = []){
  const site = d.sector === 'site';
  const units = d.units || [], people = d.residents || [];
  const withPerson = units.filter((u) => people.some((r) => r.unit_id === u.id)).length;
  const invited = people.filter((r) => r.user_id || r.invited_at).length;
  const steps = [
    { key: 'units', label: site ? t('Daireleri oluştur') : t('Birimleri oluştur'), done: units.length > 0, act: { section: 'birimler' } },
    { key: 'area', label: t('m²’leri tamamla'), done: units.length > 0 && units.every((u) => Number(u.area) > 0), act: { section: 'birimler' } },
    site ? null : { key: 'lease', label: t('Kira sözleşmelerini gir'), done: units.length > 0 && units.every((u) => Number(u.rent) > 0), act: { section: 'birimler' } },
    { key: 'people', label: site ? t('Malik ve kiracıları ekle') : t('Kiracıları ekle'), done: units.length > 0 && pct(withPerson, units.length) >= 0.8,
      progress: units.length ? pct(withPerson, units.length) : 0, act: { section: 'birimler' } },
    { key: 'invite', label: t('Davetleri gönder'), done: people.length > 0 && pct(invited, people.length) >= 0.8,
      progress: people.length ? pct(invited, people.length) : 0, act: { section: 'birimler' } },
    site && modules.includes('aidat') ? { key: 'auto', label: t('Otomatik aidatı aç'), done: !!(d.auto && d.auto.enabled), act: { section: 'tahakkuk' } } : null,
    !site ? { key: 'charge', label: t('İlk kirayı oluştur'), done: (d.charges || []).length > 0, act: { section: 'tahakkuk' } } : null,
    modules.includes('duyuru') ? { key: 'note', label: t('İlk duyuruyu yap'), done: (d.notes || []).length > 0, act: { section: 'duyurular' } } : null
  ];
  return /** @type {any[]} */ (steps.filter(Boolean));
}

export const progressOf = (steps) => ({ done: steps.filter((s) => s.done).length, total: steps.length });
