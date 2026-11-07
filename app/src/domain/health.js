/* Müşteri sağlığı: anahtar ekibinin ilgilenmezse kaybedeceği müşteriler (saf işlev, birim testli).
   Her kayıt: kişi ya da kurum, nedenler (code, label, sev: 3 acil · 2 önemli · 1 izle) ve son temas. */

import { t } from './i18n.js';

const DAY = 864e5;
const days = (a, b) => Math.floor((b - a) / DAY);

/**
 * @param {{ users?: any[], landlords?: any[], payments?: any[], subs?: any[], invites?: any[], orgs?: any[], sites?: Record<string, any>, contacts?: any[], now?: number }} o
 *   landlords: admin-derive (props → tenants, invited), payments: admin-derive, subs: admin_subscriptions,
 *   invites: bekleyen davetler ({property_id, created_at}), orgs: admin_orgs, sites: kurum → { units, people, linked }
 */
export function healthList(o){
  const now = o.now ?? Date.now();
  const subBy = Object.fromEntries((o.subs || []).map((s) => [s.id, s]));
  const userBy = Object.fromEntries((o.users || []).map((u) => [u.id, u]));
  const contactsOf = (key, id) => (o.contacts || []).filter((c) => c[key] === id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const lastContact = (key, id) => contactsOf(key, id)[0] || null;
  const out = [];

  for (const l of o.landlords || []){
    const u = userBy[l.id] || l;
    if (u.banned || u.is_admin) continue;
    const s = subBy[l.id] || {};
    const reasons = [];
    const joined = l.props.reduce((n, p) => n + p.tenants.length, 0);
    if (s.billing_issue) reasons.push({ code: 'billing', sev: 3, label: t('Ödeme sorunu: kartından çekim yapılamadı') });
    if (s.in_trial && s.trial_ends){
      const left = Math.max(0, Math.ceil((Date.parse(s.trial_ends) - now) / DAY));
      if (left <= 7) reasons.push(joined
        ? { code: 'trial', sev: 2, label: t('Denemesi {n} gün içinde bitiyor', { n: left }) }
        : { code: 'trial', sev: 3, label: t('Denemesi {n} gün içinde bitiyor ve henüz kiracı bağlamadı', { n: left }) });
    }
    const age = days(Date.parse(u.created_at), now);
    if (!l.props.length && age >= 7) reasons.push({ code: 'noprop', sev: 2, label: t('{n} gündür mülk eklemedi', { n: age }) });
    const pids = new Set(l.props.map((p) => p.id));
    const stale = (o.invites || []).filter((i) => pids.has(i.property_id) && days(Date.parse(i.created_at), now) >= 5).length;
    if (stale) reasons.push({ code: 'invite', sev: 2, label: t('{n} kiracı daveti 5 günden uzun süredir kabul edilmedi', { n: stale }) });
    if (joined){
      const recent = (o.payments || []).some((p) => pids.has(p.property_id) && p.status === 'approved' && days(Date.parse(p.paid_on || p.updated_at), now) <= 30);
      if (!recent) reasons.push({ code: 'nopay', sev: 1, label: t('30 gündür onaylanan ödeme yok') });
    }
    if (reasons.length) out.push({ kind: 'user', id: l.id, name: u.name || u.email, email: u.email, phone: u.phone || '',
      sub: s.subscribed ? 'paying' : s.in_trial ? 'trial' : 'none', reasons, sev: Math.max(...reasons.map((r) => r.sev)), last: lastContact('user_id', l.id), notes: contactsOf('user_id', l.id).slice(0, 5) });
  }

  for (const org of o.orgs || []){
    if (org.status !== 'active') continue;
    const st = (o.sites || {})[org.id];
    if (!st) continue;
    const age = days(Date.parse(org.created_at), now);
    const reasons = [];
    if (!st.units && age >= 7) reasons.push({ code: 'nounits', sev: 2, label: t('{n} gündür birim oluşturmadı', { n: age }) });
    else if (st.people && age >= 7 && st.linked / st.people < 0.3)
      reasons.push({ code: 'orginvite', sev: 2, label: t('Sakin ve kiracıların yalnız %{p}’i katıldı', { p: Math.round((st.linked / st.people) * 100) }) });
    else if (st.units && !st.people && age >= 7) reasons.push({ code: 'nopeople', sev: 2, label: t('Kişi eklenmedi') });
    if (reasons.length) out.push({ kind: 'org', id: org.id, name: org.name, email: org.master?.email || '', phone: '', sector: org.sector,
      reasons, sev: Math.max(...reasons.map((r) => r.sev)), last: lastContact('org_id', org.id), notes: contactsOf('org_id', org.id).slice(0, 5) });
  }
  return out.sort((a, b) => b.sev - a.sev || String(a.last?.created_at || '').localeCompare(String(b.last?.created_at || '')) || String(a.name).localeCompare(String(b.name), 'tr'));
}
