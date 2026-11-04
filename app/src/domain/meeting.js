/* Genel kurul ve görüş yoklaması (site yönetimi). Sunucu: migration genel_kurul_yoklama
   (site_meetings, site_meeting_replies, site_polls, site_votes; site_meeting_reply, site_poll_vote, site_poll_results).
   Yoklama bağlayıcı değildir: Kat Mülkiyeti Kanunu'na göre kararlar genel kurulda alınır ve karar defterine yazılır. */

import { t } from './i18n.js';
import { client } from './backend.js';
import { tl, fmtFull } from './util.js';
import { siteReport, unitLabel, sortUnits, isCommercial, mySiteUnits } from './site.js';

function must(res){
  if (res.error) throw res.error;
  return res.data;
}
const db = async () => client();
const rows = (p) => p.then((r) => (r.error ? [] : r.data || []));

export const ANSWERS = () => ({ katilacak: t('Katılacağım'), katilmayacak: t('Katılmayacağım'), vekalet: t('Vekâlet verdim') });
export const isOpenPoll = (p, now = new Date()) => new Date(p.ends_at) > now;

/** Kurumun toplantıları, yoklamaları, yanıtlar, oylar ve yoklama sonuçları. */
export async function loadMeetings(oid){
  const c = await db();
  const [meetings, replies, polls, votes] = await Promise.all([
    rows(c.from('site_meetings').select('*').eq('org_id', oid)),
    rows(c.from('site_meeting_replies').select('*').eq('org_id', oid)),
    rows(c.from('site_polls').select('*').eq('org_id', oid)),
    rows(c.from('site_votes').select('*').eq('org_id', oid))
  ]);
  const results = Object.fromEntries(await Promise.all(polls.map(async (p) => [p.id, await pollResults(p.id).catch(() => null)])));
  return {
    meetings: meetings.sort((a, b) => String(b.held_at).localeCompare(String(a.held_at))),
    polls: polls.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    replies, votes, results
  };
}

/** Sakinin sitelerindeki toplantılar ve yoklamalar (kendi dairelerinin yanıt ve oylarıyla). */
export async function loadMyMeetings(){
  const ids = [...new Set(mySiteUnits().filter((u) => !isCommercial(u.sector)).map((u) => u.org_id))];
  if (!ids.length) return { meetings: [], polls: [], replies: [], votes: [], results: {} };
  const c = await db();
  const [meetings, replies, polls, votes] = await Promise.all([
    rows(c.from('site_meetings').select('*').in('org_id', ids)),
    rows(c.from('site_meeting_replies').select('*').in('org_id', ids)),
    rows(c.from('site_polls').select('*').in('org_id', ids)),
    rows(c.from('site_votes').select('*').in('org_id', ids))
  ]);
  const results = Object.fromEntries(await Promise.all(polls.map(async (p) => [p.id, await pollResults(p.id).catch(() => null)])));
  return {
    meetings: meetings.filter((m) => m.status !== 'iptal').sort((a, b) => String(b.held_at).localeCompare(String(a.held_at))),
    polls: polls.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    replies, votes, results
  };
}

export async function saveMeeting(oid, m){
  const row = {
    org_id: oid, title: String(m.title || '').trim() || t('Olağan genel kurul'), kind: m.kind === 'olaganustu' ? 'olaganustu' : 'olagan',
    held_at: new Date(m.held_at).toISOString(), second_at: m.second_at ? new Date(m.second_at).toISOString() : null,
    place: String(m.place || '').trim(), agenda: (m.agenda || []).map((x) => String(x).trim()).filter(Boolean)
  };
  if (m.id) return must(await (await db()).from('site_meetings').update(row).eq('id', m.id));
  return must(await (await db()).from('site_meetings').insert(row));
}
export async function finishMeeting(id, minutes){ must(await (await db()).from('site_meetings').update({ status: 'yapildi', minutes: String(minutes || '') }).eq('id', id)); }
export async function cancelMeeting(id){ must(await (await db()).from('site_meetings').update({ status: 'iptal' }).eq('id', id)); }
export async function replyMeeting(mid, unit, answer, proxy = ''){ must(await (await db()).rpc('site_meeting_reply', { mid, unit, answer, proxy })); }

export async function createPoll(oid, p){
  const options = (p.options || []).map((x) => String(x).trim()).filter(Boolean);
  must(await (await db()).from('site_polls').insert({
    org_id: oid, meeting_id: p.meeting_id || null, question: String(p.question || '').trim(), options,
    weighted: !!p.weighted, voters: p.voters === 'herkes' ? 'herkes' : 'malik', ends_at: new Date(p.ends_at).toISOString()
  }));
}
export async function closePoll(id){ must(await (await db()).from('site_polls').update({ ends_at: new Date().toISOString() }).eq('id', id)); }
export async function deletePoll(id){ must(await (await db()).from('site_polls').delete().eq('id', id)); }
export async function vote(pid, unit, choice){ must(await (await db()).rpc('site_poll_vote', { pid, unit, choice })); }
export async function pollResults(pid){ return must(await (await db()).rpc('site_poll_results', { pid })); }

/** Sonuç satırları: oran daire sayısına ya da (ağırlıklıysa) arsa payına göre, katılanlar içinde. */
export function pollRows(poll, r){
  if (!r) return [];
  const w = !!poll.weighted && Number(r.voted_share) > 0;
  const base = w ? Number(r.voted_share) : Number(r.voted);
  return (r.options || []).map((o, i) => {
    const v = w ? Number(o.share) : Number(o.count);
    return { i, label: o.label, count: Number(o.count), share: Number(o.share), pct: base ? Math.round((v / base) * 1000) / 10 : 0 };
  });
}

/* ---- Toplantı paketi (yazdırılır ya da PDF olarak kaydedilir) ---- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const when = (v) => { const d = new Date(v); return fmtFull(d) + ' ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }); };

/** Paket: çağrı ve gündem, hazirun cetveli, vekâletname örneği, gelir-gider özeti, işletme projesi.
    d: loadSiteAdmin verisi; m: toplantı; replies: yanıtlar. */
export function meetingPackHtml({ org, m, d, replies = [], now = new Date() }){
  const units = [...d.units].sort(sortUnits);
  const owners = (uid) => d.residents.filter((r) => r.unit_id === uid && r.role === 'malik').map((r) => r.name).filter(Boolean).join(', ');
  const rep = Object.fromEntries(replies.filter((r) => r.meeting_id === m.id).map((r) => [r.unit_id, r]));
  const held = new Date(m.held_at);
  const ref = held.getMonth() < 6 ? (held.getFullYear() - 1) + '-12' : held.getFullYear() + '-' + String(held.getMonth() + 1).padStart(2, '0');
  const rpt = siteReport(d, 'year', ref);
  const year = Number(ref.slice(0, 4));
  const budget = (d.budgets || []).find((b) => Number(b.year) === year + 1) || (d.budgets || []).find((b) => Number(b.year) === year) || null;
  const totalShare = units.reduce((a, u) => a + (Number(u.share) || 0), 0);
  const income = rpt.charges.reduce((a, x) => a + x.collected, 0), spent = rpt.expenses.reduce((a, x) => a + x.total, 0);
  const KIND = { aidat: t('Aidat'), yakit: t('Yakıt'), demirbas: t('Demirbaş'), ozel: t('Özel toplama') };
  const ans = ANSWERS();
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(org)} · ${esc(m.title)}</title>
<style>
body{font:14px/1.5 Inter,system-ui,sans-serif;color:#1D1A19;margin:32px;max-width:820px}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:28px 0 8px;border-bottom:2px solid #C8302E;padding-bottom:4px}
table{width:100%;border-collapse:collapse;margin:6px 0}td,th{border:1px solid #CFC7BF;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#FAF5F0}.n{text-align:right;white-space:nowrap}.muted{color:#6B635E;font-size:12px}.sig{height:28px;width:140px}
.page{page-break-before:always}ol{padding-left:22px}
@media print{body{margin:12mm}button{display:none}}
</style></head><body>
<button onclick="window.print()" style="float:right;padding:8px 14px">${esc(t('Yazdır / PDF olarak kaydet'))}</button>
<h1>${esc(org)}</h1>
<div class="muted">${esc(m.kind === 'olaganustu' ? t('Olağanüstü genel kurul') : t('Olağan genel kurul'))} · ${esc(t('Hazırlanma'))}: ${esc(fmtFull(now))}</div>

<h2>${esc(t('Toplantı çağrısı'))}</h2>
<p>${esc(t('Sayın kat maliki,'))}</p>
<p>${esc(t('{org} kat malikleri genel kurulu aşağıdaki gündemle toplanacaktır. Katılamayacaksanız yazılı vekâletname ile temsil edilebilirsiniz.', { org }))}</p>
<table><tr><th>${esc(t('Tarih ve saat'))}</th><td>${esc(when(m.held_at))}</td></tr>
<tr><th>${esc(t('Yer'))}</th><td>${esc(m.place || '—')}</td></tr>
${m.second_at ? `<tr><th>${esc(t('Çoğunluk sağlanamazsa ikinci toplantı'))}</th><td>${esc(when(m.second_at))}</td></tr>` : ''}</table>
<b>${esc(t('Gündem'))}</b>
<ol>${(m.agenda || []).map((a) => `<li>${esc(a)}</li>`).join('') || `<li>${esc(t('Açılış ve divan seçimi'))}</li>`}</ol>
<p class="muted">${esc(t('Çağrının Kat Mülkiyeti Kanunu’na uygun biçimde (imza karşılığı ya da taahhütlü mektupla, süresi içinde) iletilmesi yönetimin sorumluluğundadır. Uygulamadaki görüş yoklamaları bağlayıcı değildir; kararlar genel kurulda alınır ve karar defterine yazılır.'))}</p>

<h2 class="page">${esc(t('Hazirun cetveli'))}</h2>
<table><tr><th>${esc(t('Bağımsız bölüm'))}</th><th>${esc(t('Malik'))}</th><th class="n">${esc(t('Arsa payı'))}</th><th>${esc(t('Ön bildirim'))}</th><th>${esc(t('Vekil'))}</th><th>${esc(t('İmza'))}</th></tr>
${units.map((u) => { const r = rep[u.id]; return `<tr><td>${esc(unitLabel(u))}</td><td>${esc(owners(u.id) || '')}</td><td class="n">${esc(u.share ?? '')}</td><td>${esc(r ? ans[r.answer] : '')}</td><td>${esc(r && r.answer === 'vekalet' ? r.proxy_name : '')}</td><td class="sig"></td></tr>`; }).join('')}
<tr><th>${esc(t('Toplam'))}: ${units.length}</th><th></th><th class="n">${esc(totalShare || '')}</th><th colspan="3"></th></tr></table>

<h2 class="page">${esc(t('Vekâletname'))}</h2>
<p>${esc(t('{org} kat malikleri genel kurulunun {date} tarihli toplantısında ve ertelenmesi hâlinde yapılacak toplantıda, maliki bulunduğum bağımsız bölüm adına oy kullanmaya ve gerekli işlemleri yapmaya aşağıda adı yazılı kişiyi vekil tayin ediyorum.', { org, date: fmtFull(m.held_at) }))}</p>
<table><tr><th>${esc(t('Bağımsız bölüm'))}</th><td style="height:28px"></td></tr><tr><th>${esc(t('Malik adı soyadı'))}</th><td style="height:28px"></td></tr>
<tr><th>${esc(t('Vekil adı soyadı'))}</th><td style="height:28px"></td></tr><tr><th>${esc(t('Tarih ve imza'))}</th><td style="height:48px"></td></tr></table>

<h2 class="page">${esc(t('Gelir-gider özeti'))} · ${year}</h2>
<table><tr><th>${esc(t('Gelir'))}</th><th class="n">${esc(t('Tahakkuk'))}</th><th class="n">${esc(t('Tahsil edilen'))}</th></tr>
${rpt.charges.map((x) => `<tr><td>${esc(KIND[x.kind] || x.kind)}</td><td class="n">${esc(tl(x.charged))}</td><td class="n">${esc(tl(x.collected))}</td></tr>`).join('') || `<tr><td colspan="3">—</td></tr>`}</table>
<table><tr><th>${esc(t('Gider'))}</th><th class="n">${esc(t('Tutar'))}</th></tr>
${rpt.expenses.map((x) => `<tr><td>${esc(x.cat)}</td><td class="n">${esc(tl(x.total))}</td></tr>`).join('') || `<tr><td colspan="2">—</td></tr>`}
<tr><th>${esc(t('Tahsilat − gider'))}</th><th class="n">${esc(tl(income - spent))}</th></tr></table>
<p class="muted">${esc(t('Uygulamadaki son 13 ayın kayıtlarından hazırlanmıştır.'))}</p>
${budget ? `<h2>${esc(t('İşletme projesi'))} · ${esc(budget.year)}</h2>
<table><tr><th>${esc(t('Kalem'))}</th><th class="n">${esc(t('Yıllık tutar'))}</th></tr>
${(budget.items || []).map((i) => `<tr><td>${esc(i.cat)}</td><td class="n">${esc(tl(i.amount))}</td></tr>`).join('')}
<tr><th>${esc(t('Toplam'))}</th><th class="n">${esc(tl((budget.items || []).reduce((a, i) => a + (Number(i.amount) || 0), 0)))}</th></tr></table>` : ''}
</body></html>`;
}

/** Paketi yeni sekmede açar (web). */
export function openMeetingPack(args){
  if (typeof window === 'undefined') return false;
  const url = URL.createObjectURL(new Blob([meetingPackHtml(args)], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return !!w;
}
