/* Yönetici paneli: özet, hesaplar (abonelik, mülkler ve kiracılar, hesap işlemleri), kurumlar, ödemeler, mesajlar.
   Yalnızca admins tablosundaki hesaplar açabilir; sunucu kuralları (RLS) zaten başkasına veri vermez. */
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AdminLegal } from './legal';
import { AdminErrors, AdminReports } from './moderation';
import { adminReports } from '../domain/moderation';
import { adminLegal } from '../domain/legal';
import { Image, Linking, ScrollView, Text as RNText, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/auth';
import { loadAdmin, loadSubscriptions, loadHealth, addContact, previewUrl, humanError, setBan, deleteUser, loadThreads, loadMessages, deleteMessage, loadAudit } from '../domain/admin';
import { t, locale } from '../domain/i18n';
import { tl } from '../domain/util';
import { Button, Chip, Field, PressScale, Text } from '../ui/kit';
import { Wordmark } from '../ui/Wordmark';
import { Loader } from '../ui/Loader';
import { fonts, radius, useBreakpoint, useColors } from '../ui/theme';
import { Card, Empty, H2, Muted, Row, Seg, Stack, initials } from './blocks';
import { CpiRates, Growth, Overview, Revenue, SubActions, Support } from './admin-extra';
import { Costs } from './admin-costs';
import { AdminShell, PageHead } from './admin-ui';
import { MailComposer } from './admin-mail';
import { OrgDraft, Orgs, sectorFromRole } from './admin-orgs';
import { AddProperty } from './admin-property';
import OpenSplash from './OpenSplash';
import { planLabel } from '../domain/plans';
import { sectorOf } from '../domain/org';
import { healthList } from '../domain/health';
import { waLink } from '../domain/wa';

type Data = Awaited<ReturnType<typeof loadAdmin>>;
const KIND: Record<string, string> = { payment: 'Dekont', document: 'Belge', invoice: 'Fatura' };
const PAY: Record<string, [string, 'ok' | 'warn' | 'bad' | 'neutral']> = {
  approved: ['Onaylandı', 'ok'], review: ['Onay bekliyor', 'warn'], partial: ['Kısmi', 'warn'], rejected: ['Reddedildi', 'bad']
};
const REV: Record<string, [string, 'ok' | 'warn' | 'bad']> = { approved: ['Onaylı', 'ok'], pending: ['İncelemede', 'warn'], rejected: ['Reddedildi', 'bad'] };
const monthLabel = (m: string) => { const [y, mo] = String(m).split('-').map(Number); return new Date(y, (mo || 1) - 1, 1).toLocaleDateString(locale(), { month: 'long', year: 'numeric' }); };
/** Ödeme denetim anahtarı: "2026-10" (kira) ya da "aidat:2026-10". */
const refLabel = (ref: string) => (String(ref).startsWith('aidat:') ? monthLabel(ref.slice(6)) + ' · ' + t('Aidat') : monthLabel(ref) + ' · ' + t('Kira'));
const day = (s?: string) => (s ? new Date(s).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

export default function AdminPanel() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const c = useColors();
  const { desktop } = useBreakpoint();
  const [tab, setTab] = useState('kpi');
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [orgDraft, setOrgDraft] = useState<OrgDraft | null>(null);
  const [legalOpen, setLegalOpen] = useState(0);
  const [reportsOpen, setReportsOpen] = useState(0);
  useEffect(() => { adminReports().then((d) => setReportsOpen(d.filter((r: any) => r.status === 'open').length)).catch(() => {}); }, []);
  useEffect(() => { adminLegal().then((d) => setLegalOpen(d.filter((r: any) => ['received', 'paid', 'forwarded'].includes(r.status)).length)).catch(() => {}); }, []);

  // Ödemeler son 12 ay yüklenir; "Daha eski ödemeleri yükle" 12'şer ay geriye gider.
  const [months, setMonths] = useState(12);
  const load = useCallback(async () => {
    setBusy(true); setErr(null);
    try { setData(await loadAdmin({ months })); } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  }, [months]);
  useEffect(() => { load(); }, [load]);

  // Bölümler: yan menü sırası, simge ve başlık / açıklama.
  const SECTIONS: [string, string, string, string][] = [
    ['kpi', t('Genel bakış'), 'grid', ''],
    ['growth', t('Büyüme'), 'chart', t('Yeni kayıt eğrisi, deneme → ödeyen dönüşümü, aktivasyon hunisi, kullanım, kurumlar ve yönetilen mülk.')],
    ['revenue', t('Gelir'), 'card', t('Paket fiyatlarından tahmini aylık ve yıllık gelir, pakete göre dağılım, kurum sözleşmeleri ve net (gelir − gider).')],
    ['costs', t('Gider'), 'doc', t('Altyapı, mağaza komisyonu, sanal POS, vergi, pazarlama ve hizmet giderleri. Dövizli giderler o günün TCMB kuruyla TL’ye çevrilir.')],
    ['accounts', t('Hesaplar'), 'key', t('Herkes tek listede: mülk sahibinin paketi ve denemesi, mülkleri ve kiracıları, kiracının hangi mülke bağlı olduğu, askı ve silme. Bir satıra dokun, ayrıntısı açılsın.')],
    ['health', t('Müşteri sağlığı'), 'flag', t('İlgilenilmezse kaybedilebilecek müşteriler: nedeni, iletişim bilgisi ve son temas. Haftalık arama listesi.')],
    ['orgs', t('Kurumlar'), 'office', t('Kurumsal müşteriler: sektör ve modüller, sözleşme, master yönetici, yöneticiler ve roller.')],
    ['cpi', t('Kira artış oranları'), 'chart', t('TÜFE 12 aylık ortalama: sitedeki hesaplayıcı ve uygulamadaki yenileme bu tablodan okur.')],
    ['support', t('Talepler'), 'chat', t('“Bize ulaş” formundan gelen kurumsal, içe aktarma ve genel talepler.')],
    ['reports', t('Şikâyetler'), 'flag', t('Kullanıcıların bildirdiği mesaj ve kişiler: 24 saat içinde incele, gerekirse mesajı sil ya da hesabı askıya al.')],
    ['errors', t('Hatalar'), 'chart', t('Uygulamada kullanıcıların karşılaştığı beklenmeyen hatalar (ekran yolu, platform, sürüm).')],
    ['legal', t('Hukuki talepler'), 'scale', t('Hukuki süreç desteği talepleri: ödemeyi işaretle, büroya ilet, kişiye not yaz. Talebin dosyalarını büroya elle iletirsin.')],
    ['pay', t('Ödemeler'), 'chart', t('Tüm kira ödemeleri ve durumları.')],
    ['msgs', t('Mesajlar'), 'send', t('Yazışmaları okuma ve gerektiğinde silme (her işlem kayda düşer).')],
    ['audit', t('İşlem kaydı'), 'flag', t('Yönetici işlemlerinin değiştirilemez kaydı.')]
  ];
  const cur = SECTIONS.find((x) => x[0] === tab) || SECTIONS[0];
  const items = SECTIONS.map(([key, label, icon]) => ({ key, label, icon, badge: key === 'legal' ? legalOpen : key === 'reports' ? reportsOpen : undefined }));
  return (
    <>
    <AdminShell items={items} active={tab} onPick={setTab} email={user?.email} onReload={load} busy={busy}
      onSignOut={async () => { await signOut(); router.replace('/giris/yonetici'); }}>
      {err ? <Card><Text v="small" color={c.badInk}>{err}</Text></Card> : null}
      {!data && !err ? <View style={{ alignItems: 'center', paddingVertical: 40 }}><Loader size={96} /></View> : null}
      {data ? (
        tab === 'kpi' ? <Overview ops={{ pending: data.stats.pending, banned: data.stats.banned }} go={setTab} /> : (
          <Stack>
            <PageHead label={t('Yönetici')} title={cur[1]} sub={cur[3]} />
            {tab === 'growth' && <Growth />}
            {tab === 'revenue' && <Revenue />}
            {tab === 'costs' && <Costs />}
            {tab === 'accounts' && <Accounts d={data} reload={load} />}
            {tab === 'health' && <Health d={data} />}
            {tab === 'orgs' && <Orgs draft={orgDraft} clearDraft={() => setOrgDraft(null)} />}
            {tab === 'support' && <Support onConvert={(r: any) => {
              setOrgDraft({ name: r.company || r.name, sector: sectorFromRole(r.details?.role), units: r.units, lead_id: r.id, email: r.email,
                note: [r.name, r.email, r.phone].filter(Boolean).join(' · ') });
              setTab('orgs');
            }} />}
            {tab === 'cpi' && <CpiRates />}
            {tab === 'legal' && <AdminLegal onCount={setLegalOpen} />}
            {tab === 'reports' && <AdminReports onCount={setReportsOpen} />}
            {tab === 'errors' && <AdminErrors />}
            {tab === 'pay' && <Payments d={data} onOlder={() => setMonths((m) => m + 12)} busy={busy} />}
            {tab === 'msgs' && <Messages d={data} reload={load} />}
            {tab === 'audit' && <Audit />}
          </Stack>
        )
      ) : null}
    </AdminShell>
    <OpenSplash />
    </>
  );
}

/** Uzun listeler 100'er kayıt çizilir; "Daha fazla göster" sonrakileri ekler (binlerce kart ekranı yavaşlatmasın). */
function Shown<T>({ list, render, step = 100 }: { list: T[]; render: (x: T) => ReactNode; step?: number }) {
  const [n, setN] = useState(step);
  useEffect(() => { setN(step); }, [list.length]);
  return (
    <>
      {list.slice(0, n).map(render)}
      {list.length > n ? <Button kind="ghost" title={t('Daha fazla göster ({n} kaldı)', { n: list.length - n })} onPress={() => setN(n + step)} style={{ alignSelf: 'center' }} /> : null}
    </>
  );
}

/* ---------------- müşteri sağlığı: risk listesi ve temas notları ---------------- */

const SEV: Record<number, [string, 'bad' | 'neutral' | 'accent']> = { 3: ['Acil', 'bad'], 2: ['Önemli', 'accent'], 1: ['İzle', 'neutral'] };

function HealthRow({ x, onSaved }: { x: any; onSaved: () => void }) {
  const c = useColors();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sl, tone] = SEV[x.sev] || SEV[1];
  const [mail, setMail] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const save = async () => {
    if (!note.trim()) return;
    setBusy(true); setErr(null); setDone(null);
    try {
      await addContact(x.kind === 'org' ? { org_id: x.id, note } : { user_id: x.id, note });
      setNote(''); setDone(note.trim()); onSaved();
    } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  return (
    <Card gap={10}>
      <Row between wrap>
        <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
          <Row gap={8} wrap><H2>{x.name || '—'}</H2><Tag label={t(sl)} tone={tone} />{x.kind === 'org' ? <Tag label={sectorOf(x.sector).label} /> : null}</Row>
          <Muted>{[x.email, x.phone].filter(Boolean).join(' · ') || t('İletişim bilgisi yok')}</Muted>
        </View>
        <Row gap={6} wrap>
          {x.phone ? <Button kind="ghost" title={t('WhatsApp')} onPress={() => Linking.openURL(waLink(x.phone, t('Merhaba {name}, anahtar’dan yazıyorum.', { name: String(x.name || '').split(' ')[0] }))).catch(() => {})} /> : null}
          {x.email ? <Button kind="ghost" title={t('E-posta')} onPress={() => setMail(!mail)} /> : null}
        </Row>
      </Row>
      {mail ? <MailComposer target={{ to: x.email, name: x.name, ...(x.kind === 'org' ? { org_id: x.id } : { user_id: x.id }) }} onSent={onSaved} onClose={() => setMail(false)} /> : null}
      <View style={{ gap: 4 }}>{x.reasons.map((r: any) => <Text key={r.code} v="small" color={r.sev === 3 ? c.badInk : c.ink}>• {r.label}</Text>)}</View>
      {x.notes && x.notes.length ? x.notes.map((n: any, i: number) => <Muted key={n.id || i}>{i === 0 ? t('Son temas {d}: {note}', { d: day(n.created_at), note: n.note }) : day(n.created_at) + ': ' + n.note}</Muted>)
        : <Muted>{t('Henüz temas kaydı yok.')}</Muted>}
      <Row gap={8} wrap align="flex-end">
        <View style={{ flexGrow: 1, flexBasis: 240 }}><Field label={t('Temas notu')} value={note} onChangeText={setNote} placeholder={t('Ör. aradım, Excel aktarımında yardım istedi')} maxLength={1000} /></View>
        <Button title={t('Kaydet')} disabled={!note.trim()} loading={busy} onPress={save} style={{ minHeight: 52 }} />
      </Row>
      {done ? <Text v="small" color={c.okInk}>{t('Temas notu kaydedildi: {note}', { note: done })}</Text> : null}
      {err ? <Text v="small" color={c.badInk}>{t('Temas notu kaydedilemedi: {err}', { err })}</Text> : null}
    </Card>
  );
}

/** Müşteri sağlığı: denemesi biten, mülk eklemeyen, daveti bekleyen, ödeme sorunlu müşteriler ve az katılımlı kurumlar. */
function Health({ d }: { d: Data }) {
  const c = useColors();
  const [h, setH] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState('all');
  const load = useCallback(() => { loadHealth().then(setH).catch((e) => setErr(humanError(e))); }, []);
  useEffect(() => { load(); }, [load]);
  const list = useMemo(() => (h ? healthList({ users: d.users, landlords: d.landlords, payments: d.payments, ...h }) : []), [h, d]);
  if (err) return <Text v="small" color={c.badInk}>{err}</Text>;
  if (!h) return <View style={{ alignItems: 'center', paddingVertical: 30 }}><Loader size={64} /></View>;
  const n = (k: string) => list.filter((x: any) => k === 'all' || (k === 'org' ? x.kind === 'org' : x.reasons.some((r: any) => r.code === k))).length;
  const shown = list.filter((x: any) => f === 'all' || (f === 'org' ? x.kind === 'org' : x.reasons.some((r: any) => r.code === f)));
  const opts: [string, string][] = [['all', t('Hepsi')], ['trial', t('Deneme bitiyor')], ['billing', t('Ödeme sorunu')], ['noprop', t('Mülk eklemedi')], ['invite', t('Davet bekliyor')], ['nopay', t('Ödeme yok')], ['org', t('Kurumlar')]];
  return (
    <Stack>
      <Seg scroll value={f} onChange={setF} options={opts.filter(([k]) => k === 'all' || n(k)).map(([k, l]) => [k, l + ' ' + n(k)] as [string, string])} />
      {shown.length ? <Shown list={shown} step={50} render={(x: any) => <HealthRow key={x.kind + x.id} x={x} onSaved={load} />} />
        : <Empty>{t('Şu an risk görünen müşteri yok.')}</Empty>}
    </Stack>
  );
}

/* ---------------- ödemeler ---------------- */

function Payments({ d, onOlder, busy }: { d: Data; onOlder: () => void; busy: boolean }) {
  const c = useColors();
  const [q, setQ] = useState('');
  const [st, setSt] = useState('all');
  const list = useMemo(() => d.payments.filter((p: any) => (st === 'all' || p.status === st) &&
    (!q.trim() || [p.propName, p.landlord, ...p.tenants, p.month].join(' ').toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr')))), [d, q, st]);
  const total = list.filter((p: any) => p.status === 'approved').reduce((n: number, p: any) => n + (Number(p.amount) || 0), 0);
  return (
    <Stack>
      <Field label={t('Ara')} value={q} onChangeText={setQ} placeholder={t('Kiracı, mülk sahibi, mülk ya da ay')} />
      <Seg scroll value={st} onChange={setSt} options={[['all', t('Hepsi')], ['review', t('Onay bekliyor')], ['approved', t('Onaylandı')], ['rejected', t('Reddedildi')], ['partial', t('Kısmi')]]} />
      <Muted>{list.length} {t('kayıt')} · {t('Onaylı toplam')}: {tl(total)}</Muted>
      {list.length ? <Shown list={list} render={(p: any) => {
        const [pt, tone] = PAY[p.status] || ['—', 'neutral'];
        return (
          <Card key={p.property_id + p.month + (p.kind || '')} gap={6}>
            <Row between wrap>
              <H2>{p.tenants.join(', ') || t('Kiracı yok')} → {p.landlord}</H2>
              <Text v="h3" style={{ fontFamily: fonts.siteBold }}>{tl(p.amount)}</Text>
            </Row>
            <Muted>{p.propName} · {monthLabel(p.month)}{p.paid_on ? ' · ' + t('Ödeme tarihi') + ' ' + day(p.paid_on) : ''}</Muted>
            <Row wrap>
              <Chip tone={tone} label={t(pt)} />
              <Chip tone={p.kind === 'aidat' ? 'accent' : 'neutral'} label={p.kind === 'aidat' ? t('Aidat') : t('Kira')} />
              {p.review ? <Chip tone={REV[p.review.status]?.[1] || 'warn'} label={t('Denetim') + ': ' + t(REV[p.review.status]?.[0] || '—')} /> : null}
            </Row>
            {p.reject_reason ? <Text v="small" color={c.badInk}>{p.reject_reason}</Text> : null}
          </Card>
        );
      }} /> : <Empty>{t('Ödeme kaydı yok.')}</Empty>}
      <Muted>{t('{from} ve sonrası gösteriliyor.', { from: monthLabel(d.paymentsFrom) })}</Muted>
      <Button kind="ghost" title={t('Daha eski ödemeleri yükle')} loading={busy} disabled={busy} onPress={onOlder} style={{ alignSelf: 'flex-start' }} />
    </Stack>
  );
}

function BanBox({ u, reload }: { u: any; reload: () => void }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (ban: boolean) => {
    if (ban && !why.trim()) { setErr(t('Yasaklama için gerekçe yaz.')); return; }
    setBusy(true); setErr(null);
    try { await setBan(u.id, ban, why.trim()); setOpen(false); setWhy(''); await reload(); } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  if (u.is_admin) return null;
  return (
    <View style={{ gap: 10 }}>
      {u.banned ? (
        <Row wrap>
          <Text v="small" color={c.badInk} style={{ flex: 1, minWidth: 200 }}>{t('Askıda')}: {u.ban_reason || '—'}{u.banned_at ? ' · ' + day(u.banned_at) : ''}</Text>
          <Button kind="ghost" title={t('Yasağı kaldır')} onPress={() => run(false)} loading={busy} />
        </Row>
      ) : open ? (
        <View style={{ gap: 10 }}>
          <Field label={t('Yasaklama gerekçesi')} value={why} onChangeText={setWhy} placeholder={t('Kullanıcıya gösterilir')} maxLength={240} />
          <Row wrap>
            <Button kind="ghost" title={t('Vazgeç')} onPress={() => { setOpen(false); setErr(null); }} />
            <Button title={t('Hesabı yasakla')} onPress={() => run(true)} loading={busy} />
          </Row>
        </View>
      ) : <Button kind="ghost" title={t('Yasakla')} onPress={() => setOpen(true)} />}
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
    </View>
  );
}

/** Yasaklanmış hesabı kalıcı siler: e-postayı yazarak onay ister (yanlışlıkla silmeyi önler). */
function DeleteBox({ u, reload }: { u: any; reload: () => void }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!u.banned || u.is_admin) return null;
  const ok = typed.trim().toLocaleLowerCase('tr') === String(u.email || '').trim().toLocaleLowerCase('tr');
  const run = async () => {
    setBusy(true); setErr(null);
    try { await deleteUser(u.id, u.ban_reason || ''); await reload(); } catch (e) { setErr(humanError(e)); setBusy(false); }
  };
  if (!open) return <Button kind="ghost" title={t('Hesabı sil')} onPress={() => setOpen(true)} style={{ borderColor: c.badInk }} />;
  return (
    <View style={{ gap: 8, padding: 12, borderRadius: 14, backgroundColor: c.badBg }}>
      <RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 13.5, color: c.badInk }}>{t('Kalıcı silme')}</RNText>
      <RNText style={{ fontFamily: fonts.body, fontSize: 12.5, lineHeight: 18, color: c.badInk }}>{t('Bu işlem geri alınamaz. Hesap, sahibi olduğu mülkler ve verileri silinir; işlem kayda yazılır.')}</RNText>
      <Field label={t('Onay için hesabın e-postasını yaz')} value={typed} onChangeText={setTyped} placeholder={u.email} autoCapitalize="none" keyboardType="email-address" />
      <Row wrap>
        <Button kind="ghost" title={t('Vazgeç')} onPress={() => { setOpen(false); setTyped(''); setErr(null); }} />
        <Button title={t('Kalıcı olarak sil')} disabled={!ok} loading={busy} onPress={run} />
      </Row>
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
    </View>
  );
}

/** Küçük etiket (kullanıcı satırında). */
function Tag({ label, tone = 'neutral', warn }: { label: string; tone?: 'neutral' | 'bad' | 'accent' | 'ok'; warn?: boolean }) {
  const c = useColors();
  const [bg, fg] = warn ? [c.warnBg, c.warnInk] : tone === 'bad' ? [c.badBg, c.badInk] : tone === 'accent' ? [c.accentSoft, c.accentText] : tone === 'ok' ? [c.okBg, c.okInk] : [c.surface2, c.muted];
  return <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' }}><RNText style={{ color: fg, fontFamily: fonts.bodyMedium, fontSize: 11.5 }}>{label}</RNText></View>;
}

/* ---------------- hesaplar: abonelik, mülkler ve kiracılar, hesap işlemleri tek listede ---------------- */

const DAY = 86400000;
type Sub = any;

/** Satırdaki durum etiketi: mülk sahibinde paket / deneme, kiracıda bağlı olduğu mülk. */
function statusOf(u: any, s: Sub | undefined, homes: any[]): [string, 'ok' | 'warn' | 'bad' | 'neutral' | 'accent'][] {
  const out: [string, 'ok' | 'warn' | 'bad' | 'neutral' | 'accent'][] = [];
  if (u.is_admin) out.push([t('Yönetici'), 'accent']);
  else if (u.role === 'landlord') {
    if (s?.subscribed) out.push([planLabel(s.plan) + (s.plan_units ? ' · ' + t('{n} mülk', { n: s.plan_units }) : ''), 'ok']);
    else if (s?.in_trial) {
      const left = Math.max(0, Math.ceil((Date.parse(s.trial_ends) - Date.now()) / DAY));
      out.push([t('Deneme · {n} gün kaldı', { n: left }), 'warn']);
    } else out.push([t('Erişim yok'), 'neutral']);
    if (s?.billing_issue) out.push([t('Ödeme sorunu'), 'bad']);
  } else out.push(homes.length ? [t('{p} mülküne bağlı', { p: homes[0].prop }), 'ok'] : [t('Mülke bağlanmadı'), 'warn']);
  if (u.banned) out.push([t('Askıda'), 'bad']);
  return out;
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ flexGrow: 1, flexBasis: 240, minWidth: 0, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, padding: 14, gap: 8 }}>
      <RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 11.5, letterSpacing: 0.6, color: c.muted }}>{title.toLocaleUpperCase(locale())}</RNText>
      {children}
    </View>
  );
}

function AccountRow({ u, s, land, homes, open, onToggle, reload }: { u: any; s?: Sub; land?: any; homes: any[]; open: boolean; onToggle: () => void; reload: () => void }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const name = u.name || u.email || '—';
  const [mail, setMail] = useState(false);
  const role = u.is_admin ? t('Yönetici') : u.role === 'landlord' ? t('Mülk sahibi') : t('Kiracı');
  const tags = statusOf(u, s, homes);
  const counts = u.role === 'landlord'
    ? t('{a} mülk · {b} kiracı', { a: land?.props.length ?? s?.units ?? 0, b: land?.tenantCount ?? s?.tenants ?? 0 })
    : homes.length ? t('{n} kiracısı', { n: homes[0].landlord }) : u.is_admin ? '' : t('Davet kodunu girmedi');
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: c.line, backgroundColor: open ? c.tile : 'transparent' }}>
      <PressScale onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={name + ', ' + role + ', ' + tags.map((x) => x[0]).join(', ')} scaleTo={0.997}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11, minHeight: 58 }}>
        <View style={{ flex: phone ? 1 : 2.2, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: u.banned ? c.badBg : c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 12, color: u.banned ? c.badInk : c.accentText }}>{initials(name)}</RNText>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <RNText numberOfLines={1} style={{ fontFamily: fonts.bodyXBold, fontSize: 14, color: c.ink }}>{name}</RNText>
            <RNText numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 12, color: c.muted }}>{phone ? counts || u.email : u.email + (u.phone ? ' · ' + u.phone : '')}</RNText>
          </View>
        </View>
        {phone ? null : <View style={{ flex: 0.9 }}><Tag label={role} tone={u.is_admin ? 'accent' : 'neutral'} /></View>}
        <View style={{ flex: phone ? undefined : 1.6, flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: phone ? 'flex-end' : 'flex-start', maxWidth: phone ? 150 : undefined }}>
          {tags.map(([l, tone]) => <Tag key={l} label={l} tone={tone === 'warn' ? 'neutral' : tone} warn={tone === 'warn'} />)}
        </View>
        {phone ? null : <RNText numberOfLines={1} style={{ flex: 1.1, fontFamily: fonts.body, fontSize: 12.5, color: c.ink }}>{counts}</RNText>}
        {phone ? null : <RNText style={{ flex: 0.9, fontFamily: fonts.body, fontSize: 12, color: c.muted }}>{day(u.created_at)}</RNText>}
        <RNText style={{ color: c.muted, fontSize: 11 }}>{open ? '▴' : '▾'}</RNText>
      </PressScale>
      {open ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 2 }}>
          {u.role === 'landlord' && s ? (
            <Box title={t('Paket')}>
              <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{s.subscribed ? planLabel(s.plan) : s.in_trial ? t('1 ay ücretsiz deneme') : t('Erişim yok')}</Text>
              <Muted>{s.subscribed
                ? [t('Kaynak: {s}', { s: s.store === 'admin' ? t('yönetici') : s.store || '—' }), s.expires_at ? t('Bitiş: {d}', { d: day(s.expires_at) }) : t('Süresiz'), s.will_renew ? t('Yenilenecek') : t('Yenilenmeyecek')].join(' · ')
                : t('Deneme bitişi: {d}', { d: day(s.trial_ends) }) + (s.extra_days ? ' · ' + t('+{n} gün uzatıldı', { n: s.extra_days }) : '')}</Muted>
              {s.subscribed && s.plan_units ? <Muted>{t('Paketteki adet')}: {t('{n} mülk', { n: s.plan_units })}{s.plan_sector ? ' · ' + t('Sektör') + ': ' + sectorOf(s.plan_sector).label : ''}</Muted> : null}
              {s.choice && !s.subscribed ? <Muted>{t('Satın alma sayfasındaki seçimi')}: {planLabel(s.choice.plan)} · {t('{n} mülk', { n: s.choice.units })} · {s.choice.yearly ? t('yıllık') : t('aylık')}</Muted> : null}
              <SubActions s={s} reload={reload} />
            </Box>
          ) : null}
          {u.role === 'landlord' ? (
            <Box title={t('Mülkler ve kiracılar')}>
              {land?.props.length ? land.props.map((p: any) => (
                <View key={p.id} style={{ gap: 2, paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: c.accentSoft }}>
                  <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{p.name} <Text v="small" muted>· {p.type} · {tl(p.rent)}/{t('ay')}</Text></Text>
                  {p.addr ? <Muted>{p.addr}</Muted> : null}
                  {p.tenants.length ? p.tenants.map((tn: any) => <Muted key={tn.id}>• {tn.name}{tn.phone ? ' · ' + tn.phone : ''}{tn.email ? ' · ' + tn.email : ''}</Muted>)
                    : <Muted>{t('Bu mülkte kiracı yok.')}</Muted>}
                  {p.invited.map((i: any) => <Muted key={i.code}>◦ {t('Davet bekliyor')}: {i.name || i.code}</Muted>)}
                </View>
              )) : <Muted>{t('Henüz mülk eklemedi.')}</Muted>}
              <AddForUser u={u} />
            </Box>
          ) : u.is_admin ? null : (
            <Box title={t('Bağlı olduğu mülkler')}>
              {homes.length ? homes.map((h) => <Muted key={h.pid}>• {h.prop} · {t('Mülk sahibi')}: {h.landlord}</Muted>)
                : <Muted>{t('Kayıt oldu ama davet kodunu girmedi.')}</Muted>}
            </Box>
          )}
          <Box title={t('Hesap')}>
            <Muted>{[t('Kayıt') + ' ' + day(u.created_at), u.phone ? t('Telefon') + ' ' + u.phone : ''].filter(Boolean).join(' · ')}</Muted>
            {u.email && !u.is_admin ? (mail
              ? <MailComposer target={{ to: u.email, name: u.name, user_id: u.id }} onClose={() => setMail(false)} />
              : <Button kind="ghost" title={t('E-posta gönder')} onPress={() => setMail(true)} style={{ alignSelf: 'flex-start' }} />) : null}
            <BanBox u={u} reload={reload} />
            <DeleteBox u={u} reload={reload} />
            {!u.banned && !u.is_admin ? <Muted>{t('Kalıcı silme yalnız askıdaki hesapta açılır.')}</Muted> : null}
          </Box>
        </View>
      ) : null}
    </View>
  );
}

/** Abonelikler, Kullanıcılar ve Bağlantılar tek bölümde: üstte sayılar (dokununca süzer), arama, rol; satır açılınca paket, mülkler ve hesap. */
function Accounts({ d, reload }: { d: Data; reload: () => void }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [subErr, setSubErr] = useState<string | null>(null);
  const loadSubs = useCallback(() => { loadSubscriptions().then(setSubs).catch((e) => setSubErr(humanError(e))); }, []);
  useEffect(() => { loadSubs(); }, [loadSubs]);
  const all = useCallback(async () => { loadSubs(); await reload(); }, [loadSubs, reload]);
  const [q, setQ] = useState('');
  const [role, setRole] = useState('all');
  const [k, setK] = useState('all');
  const [open, setOpen] = useState<string | null>(null);

  const subBy = useMemo(() => Object.fromEntries((subs || []).map((s) => [s.id, s])), [subs]);
  const landBy = useMemo(() => Object.fromEntries(d.landlords.map((l: any) => [l.id, l])), [d]);
  const homesBy = useMemo(() => {
    const m: Record<string, any[]> = {};
    d.landlords.forEach((l: any) => l.props.forEach((p: any) => p.tenants.forEach((tn: any) => {
      (m[tn.id] = m[tn.id] || []).push({ pid: p.id, prop: p.name, landlord: l.name || l.email });
    })));
    return m;
  }, [d]);
  const unlinked = useMemo(() => new Set(d.unlinked.map((u: any) => u.id)), [d]);
  const soon = Date.now() + 7 * DAY;
  const KPI: [string, string, (u: any) => boolean, 'warn' | 'bad' | undefined][] = [
    ['all', t('Tüm hesaplar'), () => true, undefined],
    ['trial', t('Denemede'), (u) => !!subBy[u.id]?.in_trial, undefined],
    ['paying', t('Abone'), (u) => !!subBy[u.id]?.subscribed, undefined],
    ['expiring', t('Denemesi 7 günde bitiyor'), (u) => !!subBy[u.id]?.in_trial && Date.parse(subBy[u.id].trial_ends) < soon, 'warn'],
    ['issue', t('Ödeme sorunu'), (u) => !!subBy[u.id]?.billing_issue, 'bad'],
    ['unlinked', t('Mülke bağlanmamış kiracı'), (u) => unlinked.has(u.id), undefined]
  ];
  const kf = (KPI.find((x) => x[0] === k) || KPI[0])[2];
  const rf = (u: any) => role === 'all' || (role === 'banned' ? u.banned : role === 'landlord' ? u.role === 'landlord' : u.role === 'tenant' && !u.is_admin);
  const n = (r: string) => d.users.filter((u: any) => r === 'all' || (r === 'banned' ? u.banned : r === 'landlord' ? u.role === 'landlord' : u.role === 'tenant' && !u.is_admin)).length;
  const list = d.users.filter((u: any) => kf(u) && rf(u) &&
    (!q.trim() || [u.name, u.email, u.phone].join(' ').toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr'))))
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));
  return (
    <Stack>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {KPI.map(([key, label, f, tone]) => {
          const on = k === key;
          const count = d.users.filter(f).length;
          return (
            <PressScale key={key} onPress={() => setK(on && key !== 'all' ? 'all' : key)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label + ': ' + count} scaleTo={0.97}
              style={{ flexGrow: 1, flexBasis: phone ? 100 : 150, padding: 12, borderRadius: radius.md, borderWidth: on ? 2 : 1, borderColor: on ? c.ink : c.line,
                backgroundColor: tone === 'warn' && count ? c.warnBg : tone === 'bad' && count ? c.badBg : c.surface }}>
              <RNText style={{ fontFamily: fonts.display, fontSize: 24, color: tone === 'bad' && count ? c.badInk : c.ink, fontVariant: ['tabular-nums'] }}>{count}</RNText>
              <RNText style={{ fontFamily: fonts.bodyMedium, fontSize: 12, color: tone === 'warn' && count ? c.warnInk : c.muted }}>{label}</RNText>
            </PressScale>
          );
        })}
      </View>
      {subErr ? <Text v="small" color={c.badInk}>{subErr}</Text> : null}
      <View style={{ flexDirection: phone ? 'column' : 'row', gap: 10, alignItems: phone ? 'stretch' : 'flex-end' }}>
        <View style={{ flex: phone ? undefined : 1 }}><Field label={t('Ara')} value={q} onChangeText={setQ} placeholder={t('Ad, e-posta ya da telefon')} autoCapitalize="none" /></View>
        <Seg scroll value={role} onChange={setRole} options={[['all', t('Hepsi') + ' ' + n('all')], ['landlord', t('Mülk sahibi') + ' ' + n('landlord')], ['tenant', t('Kiracı') + ' ' + n('tenant')], ['banned', t('Askıda') + ' ' + n('banned')]]} />
      </View>
      {list.length ? (
        <Card gap={0} style={{ padding: 0, overflow: 'hidden' }}>
          {!phone ? (
            <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.tile }}>
              {[[t('Kişi'), 2.2], [t('Rol'), 0.9], [t('Paket / durum'), 1.6], [t('Mülk · kiracı'), 1.1], [t('Kayıt'), 0.9]].map(([l, f]) => (
                <RNText key={l as string} style={{ flex: f as number, fontFamily: fonts.bodyXBold, fontSize: 11, letterSpacing: 0.6, color: c.muted }}>{String(l).toLocaleUpperCase(locale())}</RNText>
              ))}
              <View style={{ width: 11 }} />
            </View>
          ) : null}
          <Shown list={list} step={50} render={(u: any) => (
            <AccountRow key={u.id} u={u} s={subBy[u.id]} land={landBy[u.id]} homes={homesBy[u.id] || []} open={open === u.id}
              onToggle={() => setOpen(open === u.id ? null : u.id)} reload={all} />
          )} />
        </Card>
      ) : <Empty>{t('Eşleşen hesap yok.')}</Empty>}
    </Stack>
  );
}

/** Mülk sahibi hesabı adına mülk ekler (anahtar ekibi). */
function AddForUser({ u }: { u: any }) {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (open) return <AddProperty owner={{ id: u.id, name: u.name || u.email }} done={(m) => { setOpen(false); if (m) setMsg(m); }} />;
  return (
    <View style={{ gap: 6 }}>
      {msg ? <Text v="small" color={c.okInk}>{msg}</Text> : null}
      <Row><Button kind="ghost" title={t('Mülk ekle')} onPress={() => { setMsg(null); setOpen(true); }} /></Row>
    </View>
  );
}

/* ---------------- mesajlar ---------------- */

function Messages({ d, reload }: { d: Data; reload: () => void }) {
  const c = useColors();
  const [threads, setThreads] = useState<any[] | null>(null);
  const [open, setOpen] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => { loadThreads().then(setThreads).catch((e) => setErr(humanError(e))); }, []);
  if (open) return <Thread th={open} d={d} reload={reload} onBack={() => setOpen(null)} />;
  const list = (threads || []).filter((x) => !q.trim() || [x.name, x.owner_name, x.tenants, x.last_body].join(' ').toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr')));
  return (
    <Stack>
      <Card gap={4}>
        <Text v="small" color={c.warnInk}>{t('Yazışmalar özeldir. Bir yazışmayı açtığında okuman, adın ve zamanla birlikte Kayıt sekmesine yazılır.')}</Text>
      </Card>
      <Field label={t('Ara')} value={q} onChangeText={setQ} placeholder={t('Mülk, kişi ya da mesaj metni')} />
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      {!threads && !err ? <View style={{ alignItems: 'center', paddingVertical: 20 }}><Loader size={64} /></View> : null}
      {threads && !list.length ? <Empty>{t('Yazışma yok.')}</Empty> : null}
      {list.map((x) => (
        <Card key={x.property_id} gap={6} onPress={() => setOpen(x)}>
          <Row between wrap>
            <H2>{x.name}</H2>
            <Row gap={8} wrap><Chip label={x.msg_count + ' ' + t('mesaj')} /><Muted>{day(x.last_at)}</Muted></Row>
          </Row>
          <Muted>{t('Mülk sahibi')}: {x.owner_name || '—'} · {t('Kiracı')}: {x.tenants || '—'}</Muted>
          <Text v="small" numberOfLines={2}>{x.last_body || t('Fotoğraf')}</Text>
        </Card>
      ))}
    </Stack>
  );
}

function Thread({ th, d, reload, onBack }: { th: any; d: Data; reload: () => void; onBack: () => void }) {
  const c = useColors();
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadMessages(th.property_id).then(setRows).catch((e) => setErr(humanError(e))); }, [th.property_id]);
  return (
    <Stack>
      <Row between wrap>
        <Button kind="ghost" title={t('Geri')} onPress={onBack} />
        <Muted>{th.name} · {th.owner_name} → {th.tenants}</Muted>
      </Row>
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      {!rows && !err ? <View style={{ alignItems: 'center', paddingVertical: 20 }}><Loader size={64} /></View> : null}
      {rows ? rows.map((m) => <Msg key={m.id} m={m} d={d} reload={reload} removed={() => setRows((r) => (r || []).filter((x) => x.id !== m.id))} />) : null}
    </Stack>
  );
}

function Msg({ m, d, reload, removed }: { m: any; d: Data; reload: () => void; removed: () => void }) {
  const c = useColors();
  const [url, setUrl] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (m.image_path) previewUrl(m.image_path).then(setUrl).catch(() => {}); }, [m.image_path]);
  const sender = d.users.find((u: any) => u.id === m.by_user);
  const del = async () => { setBusy(true); setErr(null); try { await deleteMessage(m.id); removed(); } catch (e) { setErr(humanError(e)); } setBusy(false); };
  const sys = m.from_role === 'system';
  return (
    <View style={{ gap: 6, backgroundColor: sys ? 'transparent' : m.from_role === 'landlord' ? c.rose : c.peach, borderRadius: radius.md, padding: sys ? 4 : 14 }}>
      <Row between wrap>
        <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{sys ? t('Sistem') : (m.by_name || '—') + ' · ' + (m.from_role === 'landlord' ? t('Mülk sahibi') : t('Kiracı'))}</Text>
        <Muted>{new Date(m.at).toLocaleString(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Muted>
      </Row>
      {m.body ? <Text v="small" selectable>{m.body}</Text> : null}
      {m.image_path ? (
        url ? <Image source={{ uri: url }} style={{ width: 220, height: 160, borderRadius: radius.sm }} resizeMode="cover" accessibilityLabel={t('Mesaj fotoğrafı')} />
          : <Muted>{t('Fotoğraf yükleniyor…')}</Muted>
      ) : null}
      {!sys ? (
        asking ? (
          <Row wrap>
            <Text v="small" color={c.badInk}>{t('Bu mesaj herkesten silinir. Emin misin?')}</Text>
            <Button kind="ghost" title={t('Vazgeç')} onPress={() => setAsking(false)} />
            <Button title={t('Evet, sil')} onPress={del} loading={busy} />
          </Row>
        ) : <Row wrap><Button kind="ghost" title={t('Mesajı sil')} onPress={() => setAsking(true)} style={{ minHeight: 40 }} /></Row>
      ) : null}
      {sender && !sender.is_admin ? <BanBox u={sender} reload={reload} /> : null}
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
    </View>
  );
}

/* ---------------- yönetici işlem kaydı ---------------- */

const ACT: Record<string, string> = {
  'trial.extend': 'Deneme uzatıldı', 'plan.set': 'Paket değiştirildi', 'support.done': 'Talep kapatıldı', 'support.open': 'Talep yeniden açıldı',
  'user.ban': 'Hesap yasaklandı', 'user.unban': 'Yasak kaldırıldı', 'user.delete': 'Hesap silindi', 'messages.view': 'Yazışma okundu', 'message.delete': 'Mesaj silindi',
  'review.approved': 'Yükleme onaylandı', 'review.rejected': 'Yükleme reddedildi'
};

function Audit() {
  const c = useColors();
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { loadAudit().then(setRows).catch((e) => setErr(humanError(e))); }, []);
  return (
    <Stack>
      <Muted>{t('Yöneticinin yaptığı hassas işlemler. Kayıtlar değiştirilemez ve silinemez.')}</Muted>
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      {!rows && !err ? <View style={{ alignItems: 'center', paddingVertical: 20 }}><Loader size={64} /></View> : null}
      {rows && !rows.length ? <Empty>{t('Henüz kayıt yok.')}</Empty> : null}
      {rows ? rows.map((a) => (
        <Card key={a.id} gap={4}>
          <Row between wrap>
            <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{t(ACT[a.action] || a.action)}</Text>
            <Muted>{new Date(a.at).toLocaleString(locale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Muted>
          </Row>
          <Muted>{a.admin_name || '—'} · {a.target}{a.detail?.reason ? ' · ' + a.detail.reason : ''}{a.detail?.note ? ' · ' + a.detail.note : ''}{a.action === 'plan.set' ? ' · ' + (a.detail?.plan ? planLabel(a.detail.plan) : t('paket kaldırıldı')) : ''}{a.action === 'trial.extend' ? ' · +' + t('{n} gün', { n: a.detail?.days }) : ''}</Muted>
        </Card>
      )) : null}
    </Stack>
  );
}
