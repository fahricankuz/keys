/* Kurumda toplu birim ekleme (sitede daire, AVM/depo/GYO'da birim): Excel ya da CSV şablonu → önizleme → kayıt.
   Satırdaki malik ve kiracı kişi olarak eklenir; e-postası olanlara davet e-postası kendiliğinden gider.
   Hata metinleri çeviri anahtarıdır ({msg, p}); ekran t() ile gösterir. Dosya okuma ve şablon: importer.js. */

import { norm, num } from './importer.js';
import { client } from './backend.js';
import { sendSiteInvite, RESIDENT_COLS } from './site.js';

export const SITE_COLUMNS = [
  { key: 'block', header: 'Blok', example: 'A', aliases: ['blok', 'block', 'bina'] },
  { key: 'no', header: 'Daire no', required: true, example: '1', aliases: ['no', 'daire', 'daire no', 'kapi no', 'unit', 'flat'] },
  { key: 'area', header: 'm²', required: true, example: '120', aliases: ['m2', 'metrekare', 'alan', 'area'] },
  { key: 'share', header: 'Arsa payı', example: '2', aliases: ['arsa payi', 'pay', 'share'] },
  { key: 'aidat', header: 'Aylık aidat (₺)', example: '1500', aliases: ['aidat', 'aylik aidat', 'aylik aidat tl', 'aidat tl', 'dues'] },
  { key: 'ownerName', header: 'Malik adı', example: 'Ayşe Yılmaz', aliases: ['malik', 'malik adi', 'malik ad soyad', 'owner'] },
  { key: 'ownerPhone', header: 'Malik telefonu', example: '0532 000 00 00', aliases: ['malik telefon', 'malik telefonu', 'owner phone'] },
  { key: 'ownerEmail', header: 'Malik e-posta', example: 'ayse@ornek.com', aliases: ['malik eposta', 'malik e posta', 'owner email'] },
  { key: 'tenantName', header: 'Kiracı adı', example: '', aliases: ['kiraci', 'kiraci adi', 'kiraci ad soyad', 'tenant'] },
  { key: 'tenantPhone', header: 'Kiracı telefonu', example: '', aliases: ['kiraci telefon', 'kiraci telefonu', 'tenant phone'] },
  { key: 'tenantEmail', header: 'Kiracı e-posta', example: '', aliases: ['kiraci eposta', 'kiraci e posta', 'tenant email'] },
  { key: 'payer', header: 'Aidatı kim öder', example: 'Kiracı', aliases: ['aidati kim oder', 'aidat odeyen', 'odeyen', 'payer'] }
];

export const COMMERCIAL_COLUMNS = [
  { key: 'block', header: 'Kat / bölüm', example: 'Zemin kat', aliases: ['kat', 'bolum', 'kat bolum', 'blok', 'bina', 'varlik'] },
  { key: 'no', header: 'Birim no', required: true, example: 'Z-12', aliases: ['no', 'birim', 'birim no', 'magaza', 'magaza no', 'depo no', 'unit'] },
  { key: 'area', header: 'm²', required: true, example: '200', aliases: ['m2', 'metrekare', 'alan', 'area'] },
  { key: 'rent', header: 'Aylık kira', example: '85000', aliases: ['kira', 'aylik kira', 'rent'] },
  { key: 'currency', header: 'Para birimi', example: 'TRY', aliases: ['para', 'para birimi', 'doviz', 'currency'] },
  { key: 'aidat', header: 'Ortak gider (₺)', example: '', aliases: ['ortak gider', 'ortak gider tl', 'aidat'] },
  { key: 'tenantName', header: 'Kiracı', example: 'Moda Giyim A.Ş.', aliases: ['kiraci', 'kiraci adi', 'firma', 'tenant'] },
  { key: 'tenantPhone', header: 'Kiracı telefonu', example: '0212 000 00 00', aliases: ['kiraci telefon', 'kiraci telefonu', 'telefon', 'phone'] },
  { key: 'tenantEmail', header: 'Kiracı e-posta', example: 'muhasebe@ornek.com', aliases: ['kiraci eposta', 'kiraci e posta', 'eposta', 'e posta', 'email'] }
];

export const unitColumns = (commercial) => (commercial ? COMMERCIAL_COLUMNS : SITE_COLUMNS);
const MAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;
const key = (block, no) => norm(block) + '|' + norm(no);

/**
 * Dosya satırları → { fatal, items }. items: { line, unit, people, errors }.
 * existing: kurumdaki birimler (aynı blok ve no varsa satır hatalı sayılır).
 */
export function validateUnits(table, commercial = false, existing = []){
  const cols = unitColumns(commercial);
  const rows = (table || []).filter((r) => (r || []).some((c) => String(c ?? '').trim() !== ''));
  if (!rows.length) return { fatal: [{ msg: 'Dosya boş.' }], items: [] };
  const map = {};
  rows[0].forEach((h, i) => {
    const n = norm(h);
    const c = n && cols.find((x) => norm(x.header) === n || x.aliases.includes(n));
    if (c && map[c.key] === undefined) map[c.key] = i;
  });
  const missing = cols.filter((c) => c.required && map[c.key] === undefined).map((c) => c.header);
  if (missing.length) return { fatal: [{ msg: 'Şablondaki şu sütunlar bulunamadı: {list}. Şablonu indirip başlıkları değiştirmeden kullan.', p: { list: missing.join(', ') } }], items: [] };
  const seen = new Set(existing.map((u) => key(u.block, u.no)));
  const items = [];
  rows.slice(1).forEach((r, i) => {
    const get = (k) => (map[k] === undefined ? '' : String(r[map[k]] ?? '').trim());
    const errors = [];
    const no = get('no'), block = get('block');
    // Şablondaki örnek satır (değiştirilmeden bırakıldıysa) atlanır.
    if (!no && !get('area')) return;
    if (!no) errors.push({ msg: 'Daire / birim no yok' });
    const area = num(get('area'));
    if (!(area > 0)) errors.push({ msg: 'm² eksik ya da hatalı' });
    const k = key(block, no);
    if (no && seen.has(k)) errors.push({ msg: 'Bu kayıt zaten var ya da dosyada iki kez yazılmış' });
    seen.add(k);
    const unit = { block, no, area: area > 0 ? area : null };
    if (commercial) {
      const rent = num(get('rent'));
      if (Number.isNaN(rent)) errors.push({ msg: 'Kira okunamadı' });
      const cur = get('currency').toUpperCase();
      unit.rent = Number.isNaN(rent) ? null : rent;
      unit.currency = /USD|\$/.test(cur) ? 'USD' : /EUR|€/.test(cur) ? 'EUR' : 'TRY';
    } else {
      const share = num(get('share')), aidat = num(get('aidat'));
      if (Number.isNaN(share)) errors.push({ msg: 'Arsa payı okunamadı' });
      if (Number.isNaN(aidat)) errors.push({ msg: 'Aidat okunamadı' });
      unit.share = Number.isNaN(share) ? null : share;
      unit.aidat = Number.isNaN(aidat) ? null : aidat;
      unit.payer = /malik/i.test(norm(get('payer'))) ? 'malik' : 'kiraci';
    }
    const person = (role, p) => {
      const name = get(p + 'Name'), phone = get(p + 'Phone'), email = get(p + 'Email').toLowerCase();
      if (!name && !phone && !email) return null;
      if (!name) errors.push({ msg: '{who} adı yok', p: { who: role === 'malik' ? 'Malik' : 'Kiracı' } });
      if (email && !MAIL.test(email)) errors.push({ msg: '{who} e-postası hatalı', p: { who: role === 'malik' ? 'Malik' : 'Kiracı' } });
      if (phone && !PHONE.test(phone)) errors.push({ msg: '{who} telefonu hatalı', p: { who: role === 'malik' ? 'Malik' : 'Kiracı' } });
      return { role, name, phone, email };
    };
    const people = commercial ? [person('kiraci', 'tenant')] : [person('malik', 'owner'), person('kiraci', 'tenant')];
    items.push({ line: i + 2, unit, people: people.filter(Boolean), errors });
  });
  if (!items.length) return { fatal: [{ msg: 'Dosyada kayıt satırı yok. Şablondaki örnek satırın altına ekle.' }], items: [] };
  return { fatal: [], items };
}

/** Hatasız satırları kaydeder; kişileri ekler ve e-postası olanlara davet gönderir. Dönen: { units, people, mailed }. */
export async function importUnitItems(oid, items, commercial = false){
  const ok = items.filter((x) => !x.errors.length);
  if (!ok.length) return { units: 0, people: 0, mailed: 0 };
  const c = await client();
  const res = await c.from('site_units').insert(ok.map((x) => Object.assign({ org_id: oid, block: x.unit.block, no: x.unit.no, area: x.unit.area },
    commercial ? { rent: x.unit.rent, currency: x.unit.currency } : { share: x.unit.share, aidat: x.unit.aidat, payer: x.unit.payer }))).select();
  if (res.error) throw res.error;
  const made = res.data || [];
  const rows = ok.flatMap((x, i) => (made[i] ? x.people.map((p) => ({ org_id: oid, unit_id: made[i].id, role: p.role, name: p.name, phone: p.phone, email: p.email })) : []));
  let people = [], mailed = 0;
  if (rows.length) {
    const r = await c.from('site_residents').insert(rows).select(RESIDENT_COLS);
    if (r.error) throw r.error;
    people = r.data || [];
    for (const p of people.filter((x) => x.email)) if (await sendSiteInvite(p) === true) mailed++;
  }
  return { units: made.length, people: people.length, mailed };
}
