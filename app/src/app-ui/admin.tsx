/* Yönetici paneli: özet, denetim kuyruğu, ödemeler, mülk sahipleri ve kullanıcılar.
   Yalnızca admins tablosundaki hesaplar açabilir; sunucu kuralları (RLS) zaten başkasına veri vermez. */
import { ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { AdminLegal } from './legal';
import { AdminErrors, AdminReports } from './moderation';
import { adminReports } from '../domain/moderation';
import { adminLegal } from '../domain/legal';
import { Image, Linking, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/auth';
import { loadAdmin, decide, previewUrl, humanError, setBan, loadThreads, loadMessages, deleteMessage, loadAudit } from '../domain/admin';
import { t, locale } from '../domain/i18n';
import { tl } from '../domain/util';
import { Button, Chip, Field, PressScale, Text } from '../ui/kit';
import { Wordmark } from '../ui/Wordmark';
import { Loader } from '../ui/Loader';
import { fonts, radius, useBreakpoint, useColors } from '../ui/theme';
import { Card, Empty, H2, Muted, Row, Seg, Stack } from './blocks';
import { CpiRates, Overview, Subscriptions, Support } from './admin-extra';
import { AdminShell, PageHead } from './admin-ui';
import { OrgDraft, Orgs, sectorFromRole } from './admin-orgs';
import { AddProperty } from './admin-property';
import OpenSplash from './OpenSplash';
import { planLabel } from '../domain/plans';

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
    ['subs', t('Abonelikler'), 'card', t('Mülk sahiplerinin deneme ve paket durumu; deneme uzatma ve elle paket verme.')],
    ['orgs', t('Kurumlar'), 'office', t('Kurumsal müşteriler: sektör ve modüller, sözleşme, master yönetici, yöneticiler ve roller.')],
    ['cpi', t('Kira artış oranları'), 'chart', t('TÜFE 12 aylık ortalama: sitedeki hesaplayıcı ve uygulamadaki yenileme bu tablodan okur.')],
    ['support', t('Talepler'), 'chat', t('“Bize ulaş” formundan gelen kurumsal, içe aktarma ve genel talepler.')],
    ['reports', t('Şikâyetler'), 'flag', t('Kullanıcıların bildirdiği mesaj ve kişiler: 24 saat içinde incele, gerekirse mesajı sil ya da hesabı askıya al.')],
    ['errors', t('Hatalar'), 'chart', t('Uygulamada kullanıcıların karşılaştığı beklenmeyen hatalar (ekran yolu, platform, sürüm).')],
    ['legal', t('Hukuki talepler'), 'scale', t('Hukuki süreç desteği talepleri: ödemeyi işaretle, büroya ilet, kişiye not yaz. Talebin dosyalarını büroya elle iletirsin.')],
    ['queue', t('Denetim'), 'doc', t('Yüklenen dekont, belge ve faturalar: onaylanınca karşı tarafa görünür.')],
    ['pay', t('Ödemeler'), 'chart', t('Tüm kira ödemeleri ve durumları.')],
    ['conn', t('Bağlantılar'), 'landlord', t('Mülk sahibi → mülk → kiracı ağacı.')],
    ['msgs', t('Mesajlar'), 'send', t('Yazışmaları okuma ve gerektiğinde silme (her işlem kayda düşer).')],
    ['users', t('Kullanıcılar'), 'key', t('Tüm hesaplar; yasaklama ve yasak kaldırma.')],
    ['audit', t('İşlem kaydı'), 'flag', t('Yönetici işlemlerinin değiştirilemez kaydı.')]
  ];
  const cur = SECTIONS.find((x) => x[0] === tab) || SECTIONS[0];
  const items = SECTIONS.map(([key, label, icon]) => ({ key, label, icon, badge: key === 'queue' ? data?.stats.pending || 0 : key === 'legal' ? legalOpen : key === 'reports' ? reportsOpen : undefined }));
  return (
    <>
    <AdminShell items={items} active={tab} onPick={setTab} email={user?.email} onReload={load} busy={busy}
      onSignOut={async () => { await signOut(); router.replace('/giris/yonetici'); }}>
      {err ? <Card><Text v="small" color={c.badInk}>{err}</Text></Card> : null}
      {!data && !err ? <View style={{ alignItems: 'center', paddingVertical: 40 }}><Loader size={96} /></View> : null}
      {data ? (
        tab === 'kpi' ? <Overview ops={{ pending: data.stats.pending, banned: data.stats.banned }} /> : (
          <Stack>
            <PageHead label={t('Yönetici')} title={cur[1]} sub={cur[3]} />
            {tab === 'subs' && <Subscriptions />}
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
            {tab === 'queue' && <Queue d={data} reload={load} />}
            {tab === 'pay' && <Payments d={data} onOlder={() => setMonths((m) => m + 12)} busy={busy} />}
            {tab === 'conn' && <Landlords d={data} />}
            {tab === 'msgs' && <Messages d={data} reload={load} />}
            {tab === 'users' && <Users d={data} reload={load} />}
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

/* ---------------- denetim kuyruğu ---------------- */

function Queue({ d, reload }: { d: Data; reload: () => void }) {
  const [f, setF] = useState('pending');
  const [kind, setKind] = useState('all');
  const list = d.queue.filter((r: any) => (f === 'all' || r.status === f) && (kind === 'all' || r.kind === kind));
  return (
    <Stack>
      <Row wrap>
        <Seg scroll value={f} onChange={setF} options={[['pending', t('Bekleyen')], ['rejected', t('Reddedilen')], ['approved', t('Onaylanan')], ['all', t('Tümü')]]} />
        <Seg scroll value={kind} onChange={setKind} options={[['all', t('Hepsi')], ['payment', t('Dekont')], ['document', t('Belge')], ['invoice', t('Fatura')]]} />
      </Row>
      {f !== 'pending' ? <Muted>{t('Onaylanan ve reddedilenlerden son 500 karar gösterilir.')}</Muted> : null}
      {list.length ? <Shown list={list} render={(r: any) => <ReviewCard key={r.kind + r.property_id + r.ref_id} r={r} reload={reload} />} />
        : <Empty>{f === 'pending' ? t('Bekleyen yükleme yok. Yeni dekont, belge ve faturalar burada görünür.') : t('Kayıt yok.')}</Empty>}
    </Stack>
  );
}

function ReviewCard({ r, reload }: { r: any; reload: () => void }) {
  const c = useColors();
  const [url, setUrl] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isPdf = /\.pdf$/i.test(r.path || '');
  useEffect(() => { previewUrl(r.path).then(setUrl).catch(() => {}); }, [r.path]);

  const run = async (status: 'approved' | 'rejected') => {
    if (status === 'rejected' && !note.trim()) { setErr(t('Red için gerekçe yaz.')); return; }
    setBusy(true); setErr(null);
    try { await decide(r, status, note.trim()); await reload(); } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  const [rt, tone] = REV[r.status] || REV.pending;
  return (
    <Card gap={12}>
      <Row between wrap>
        <Row gap={8}><Chip tone="accent" label={t(KIND[r.kind] || r.kind)} /><Chip tone={tone} label={t(rt)} /></Row>
        <Muted>{day(r.created_at)}</Muted>
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        <View style={{ width: 150, height: 150, borderRadius: radius.md, overflow: 'hidden', backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}>
          {url && !isPdf ? <Image source={{ uri: url }} style={{ width: 150, height: 150 }} resizeMode="cover" accessibilityLabel={r.label} />
            : <Text v="small" muted>{isPdf ? 'PDF' : r.path ? t('Yükleniyor…') : t('Dosya yok')}</Text>}
        </View>
        <View style={{ flex: 1, minWidth: 220, gap: 4 }}>
          <H2>{r.label || '—'}</H2>
          {r.amount != null ? <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{tl(r.amount)}</Text> : null}
          <Muted>{r.propName} · {t('Mülk sahibi')}: {r.landlord}</Muted>
          <Muted>{t('Yükleyen')}: {r.uploaderName}{r.uploaderRole ? ' (' + (r.uploaderRole === 'landlord' ? t('Mülk sahibi') : t('Kiracı')) + ')' : ''}</Muted>
          {r.kind === 'payment' ? <Muted>{t('Dönem')}: {refLabel(r.ref_id)}</Muted> : null}
          {r.note ? <Text v="small" color={c.badInk}>{t('Red gerekçesi')}: {r.note}</Text> : null}
          {url ? <PressScale onPress={() => Linking.openURL(url)} accessibilityRole="link"><Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyXBold, textDecorationLine: 'underline' }}>{t('Dosyayı aç')}</Text></PressScale> : null}
        </View>
      </View>
      {asking ? (
        <View style={{ gap: 10 }}>
          <Field label={t('Red gerekçesi')} value={note} onChangeText={setNote} placeholder={t('Yükleyene gösterilir')} maxLength={240} />
          <Row>
            <Button kind="ghost" title={t('Vazgeç')} onPress={() => { setAsking(false); setErr(null); }} />
            <Button title={t('Reddet')} onPress={() => run('rejected')} loading={busy} />
          </Row>
        </View>
      ) : (
        <Row wrap>
          {r.status !== 'approved' ? <Button title={t('Onayla')} onPress={() => run('approved')} loading={busy} /> : null}
          {r.status !== 'rejected' ? <Button kind="ghost" title={t('Reddet')} onPress={() => setAsking(true)} /> : null}
        </Row>
      )}
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
    </Card>
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

/* ---------------- mülk sahipleri ve kiracıları ---------------- */

function Landlords({ d }: { d: Data }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!d.landlords.length && !d.unlinked.length) return <Empty>{t('Henüz mülk sahibi yok.')}</Empty>;
  return (
    <Stack>
      {d.unlinked.length ? (
        <Card gap={6}>
          <H2>{t('Mülke bağlı olmayan kiracılar')} ({d.unlinked.length})</H2>
          <Muted>{t('Kayıt oldu ama davet kodunu girmedi.')}</Muted>
          {d.unlinked.map((u: any) => <Muted key={u.id}>• {u.name || u.email} · {u.email}{u.banned ? ' · ' + t('Askıda') : ''}</Muted>)}
        </Card>
      ) : null}
      {d.landlords.map((l: any) => {
        const on = open === l.id;
        return (
          <Card key={l.id} gap={10} onPress={() => setOpen(on ? null : l.id)}>
            <Row between wrap>
              <View style={{ flex: 1, minWidth: 200 }}>
                <H2>{l.name || l.email}</H2>
                <Muted>{l.email}{l.phone ? ' · ' + l.phone : ''}</Muted>
              </View>
              <Row gap={8} wrap>
                <Chip label={l.props.length + ' ' + t('mülk')} />
                <Chip label={l.tenantCount + ' ' + t('kiracı')} />
                <Chip tone={l.subscribed ? 'ok' : 'neutral'} label={l.subscribed ? t('Abone') : t('Deneme / abonelik yok')} />
              </Row>
            </Row>
            {on ? (
              <View style={{ gap: 12 }}>
                {l.props.length ? l.props.map((p: any) => (
                  <View key={p.id} style={{ gap: 4, paddingLeft: 12, borderLeftWidth: 3, borderLeftColor: '#E8DAD0' }}>
                    <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{p.name} <Text v="small" muted>· {p.type} · {tl(p.rent)}/{t('ay')}</Text></Text>
                    {p.addr ? <Muted>{p.addr}</Muted> : null}
                    {p.tenants.length ? p.tenants.map((tn: any) => <Muted key={tn.id}>• {tn.name}{tn.phone ? ' · ' + tn.phone : ''}{tn.email ? ' · ' + tn.email : ''}</Muted>)
                      : <Muted>{t('Bu mülkte kiracı yok.')}</Muted>}
                    {p.invited.map((i: any) => <Muted key={i.code}>◦ {t('Davet bekliyor')}: {i.name || i.code}</Muted>)}
                  </View>
                )) : <Muted>{t('Henüz mülk eklemedi.')}</Muted>}
              </View>
            ) : null}
          </Card>
        );
      })}
    </Stack>
  );
}

/* ---------------- kullanıcılar ve yasaklama ---------------- */

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

function Users({ d, reload }: { d: Data; reload: () => void }) {
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const list = d.users.filter((u: any) => (f === 'all' || (f === 'banned' ? u.banned : u.role === f)) &&
    (!q.trim() || [u.name, u.email, u.phone].join(' ').toLocaleLowerCase('tr').includes(q.trim().toLocaleLowerCase('tr'))));
  return (
    <Stack>
      <Field label={t('Ara')} value={q} onChangeText={setQ} placeholder={t('Ad, e-posta ya da telefon')} />
      <Seg scroll value={f} onChange={setF} options={[['all', t('Hepsi')], ['landlord', t('Mülk sahibi')], ['tenant', t('Kiracı')], ['banned', t('Askıda')]]} />
      {list.length ? <Shown list={list} render={(u: any) => (
        <Card key={u.id} gap={8}>
          <Row between wrap>
            <View style={{ flex: 1, minWidth: 200 }}><H2>{u.name || u.email}</H2><Muted>{u.email}{u.phone ? ' · ' + u.phone : ''}</Muted></View>
            <Row gap={8} wrap>
              {u.is_admin ? <Chip tone="accent" label={t('Yönetici')} /> : <Chip label={u.role === 'landlord' ? t('Mülk sahibi') : t('Kiracı')} />}
              {u.role === 'landlord' ? <Chip tone={u.subscribed ? 'ok' : 'neutral'} label={u.subscribed ? t('Abone') : t('Abonelik yok')} /> : null}
              {u.banned ? <Chip tone="bad" label={t('Askıda')} /> : null}
            </Row>
          </Row>
          <Muted>{t('Kayıt')}: {day(u.created_at)}</Muted>
          {u.role === 'landlord' ? <AddForUser u={u} /> : null}
          <BanBox u={u} reload={reload} />
        </Card>
      )} /> : <Empty>{t('Kullanıcı yok.')}</Empty>}
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
  'user.ban': 'Hesap yasaklandı', 'user.unban': 'Yasak kaldırıldı', 'messages.view': 'Yazışma okundu', 'message.delete': 'Mesaj silindi',
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
