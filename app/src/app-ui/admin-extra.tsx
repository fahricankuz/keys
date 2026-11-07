/* Yönetici paneli: genel bakış göstergeleri, mülk sahibi abonelikleri ve "Bize ulaş" talepleri. */
import { ReactNode, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { extendTrial, humanError, loadAdminEmails, loadCpi, loadKpis, loadSubscriptions, loadSupport, setCpi, setPlan, setSupportStatus } from '../domain/admin';
import { MailComposer } from './admin-mail';
import { CONFIG } from '../domain/config';
import { planLabel } from '../domain/plans';
import { SECTORS, adminOrgs, sectorOf } from '../domain/org';
import { revenueEstimate } from '../domain/admin-finance';
import { useCosts } from './admin-costs';
import { t, locale } from '../domain/i18n';
import { tl } from '../domain/util';
import { Button, Chip, Field, Text } from '../ui/kit';
import { Loader } from '../ui/Loader';
import { fonts, radius, useBreakpoint, useColors } from '../ui/theme';
import { Card, Empty, H2, Hero, Label, Muted, Row, Seg, Stack } from './blocks';
import { GroupTitle, Kpi, KpiGrid, PageHead } from './admin-ui';

const day = (v: any) => (v ? new Date(v).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) + '%' : '—');
const delta = (a: number, b: number) => (b ? (a >= b ? '+' : '−') + Math.abs(Math.round(((a - b) / b) * 100)) + '%' : '');

/** Sunucudan veri yükler; reload() ile yeniden çeker. */
function useLoad<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let gone = false;
    setErr(null);
    fn().then((d) => { if (!gone) setData(d); }).catch((e) => { if (!gone) setErr(humanError(e)); });
    return () => { gone = true; };
  }, [...deps, tick]);
  return { data, err, reload: () => setTick((x) => x + 1) };
}

const Spin = () => <View style={{ alignItems: 'center', paddingVertical: 20 }}><Loader size={64} /></View>;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const c = useColors();
  return (
    <View style={{ flexGrow: 1, flexBasis: 160, backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, padding: 18, gap: 4 }}>
      <Text v="small" muted>{label}</Text>
      <Text v="h2" style={{ fontFamily: fonts.siteBold, fontSize: 28 }}>{value}</Text>
      {sub ? <Text v="small" muted>{sub}</Text> : null}
    </View>
  );
}
const Grid = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{children}</View>;

/** Günlük yeni kayıt çubuk grafiği; üzerine gelince günün sayısı görünür. */
function Signups({ series }: { series: any[] }) {
  const c = useColors();
  const [hover, setHover] = useState<number | null>(null);
  const totals = series.map((d) => Number(d.landlords) + Number(d.tenants));
  const max = Math.max(1, ...totals);
  const cur = hover != null ? series[hover] : null;
  return (
    <Card gap={10}>
      <Row between wrap>
        <H2>{t('Günlük yeni kayıt')}</H2>
        <Muted>{cur
          ? day(cur.d) + ' · ' + t('{n} kayıt', { n: totals[hover!] }) + ' (' + t('{a} mülk sahibi, {b} kiracı/ekip', { a: cur.landlords, b: cur.tenants }) + ')'
          : t('En yüksek: {n}', { n: max })}</Muted>
      </Row>
      <View style={{ height: 140, flexDirection: 'row', alignItems: 'flex-end', gap: 3 }}>
        {totals.map((n, i) => (
          <View key={series[i].d} {...({ onMouseEnter: () => setHover(i), onMouseLeave: () => setHover(null) } as any)} onTouchStart={() => setHover(i)}
            accessible accessibilityRole="image" accessibilityLabel={day(series[i].d) + ': ' + n} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
            <View style={{ height: Math.max(n ? 4 : 2, (n / max) * 132), backgroundColor: hover === i ? c.ink : n ? c.accent : c.surface2, borderRadius: 4 }} />
          </View>
        ))}
      </View>
      <Row between><Muted>{day(series[0]?.d)}</Muted><Muted>{day(series[series.length - 1]?.d)}</Muted></Row>
    </Card>
  );
}

function PlanBars({ plans, total }: { plans: Record<string, number>; total: number }) {
  const c = useColors();
  const rows = ['tek', 'bes', 'kurumsal', 'pro'].map((id) => [id, Number(plans[id] || 0)] as [string, number]).filter(([id, n]) => n || id !== 'pro');
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <Card gap={10}>
      <H2>{t('Paketler')}</H2>
      {rows.map(([id, n]) => (
        <View key={id} style={{ gap: 4 }}>
          <Row between><Text v="small">{planLabel(id)}</Text><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{n} · {pct(n, total)}</Text></Row>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surface2 }}><View style={{ width: (n / max) * 100 + '%' as any, height: 8, borderRadius: 4, backgroundColor: c.accent }} /></View>
        </View>
      ))}
    </Card>
  );
}

/** Aktivasyon hunisi: her adımda kaç mülk sahibi var ve tüm mülk sahiplerine oranı. */
function Funnel({ f }: { f: any }) {
  const c = useColors();
  const steps: [string, number][] = [
    [t('Kayıt olan mülk sahibi'), f.owners], [t('En az bir mülk ekledi'), f.withProperty],
    [t('Kiracısı bağlandı'), f.withTenant], [t('Onaylı kira ödemesi aldı'), f.withPayment]
  ];
  const max = Math.max(1, f.owners);
  return (
    <Card gap={10}>
      <H2>{t('Aktivasyon hunisi')}</H2>
      <Muted>{t('Mülk sahiplerinin ürünü gerçekten kullanmaya başlama adımları.')}</Muted>
      {steps.map(([label, n], i) => (
        <View key={label} style={{ gap: 4 }}>
          <Row between><Text v="small">{i + 1}. {label}</Text><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{n} · {pct(n, f.owners)}{i ? ' · ' + t('önceki adımdan {p}', { p: pct(n, steps[i - 1][1]) }) : ''}</Text></Row>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: c.surface2 }}><View style={{ width: (n / max) * 100 + '%' as any, height: 10, borderRadius: 5, backgroundColor: i === steps.length - 1 ? c.okInk : c.accent }} /></View>
        </View>
      ))}
    </Card>
  );
}

/** Genel bakış: koyu özet kartı ve Büyüme / Gelir / Kullanım / Operasyon gösterge grupları.
    `ops`: panelin yüklediği özet (denetim bekleyen, askıdaki hesap). */
/** Kira ve aidat hacmi: bireysel mülkler + kurumlar (admin_kpis; eski sunucuda yalnız bireysel kira). */
function volumes(k: any) {
  const n = (x: any) => Number(x) || 0;
  return {
    rent: n(k.rent?.month) + n(k.orgRent?.month), rentPrev: n(k.rent?.prevMonth) + n(k.orgRent?.prevMonth),
    rentOrg: n(k.orgRent?.month),
    aidat: n(k.aidat?.month) + n(k.aidat?.siteMonth), aidatPrev: n(k.aidat?.prevMonth) + n(k.aidat?.sitePrev),
    aidatSite: n(k.aidat?.siteMonth), hasAidat: !!k.aidat
  };
}

/** Gelir tahmini: paket × dönem × mülk adedi (yeni sunucu); eskisinde paket sayısı × fiyat. */
function revenueOf(k: any) {
  if (Array.isArray(k.revenueBase)) return revenueEstimate(k.revenueBase);
  const plans = k.plans || {};
  const priced = CONFIG.billing.tiers.filter((x: any) => x.price != null);
  const mrr = priced.reduce((a: number, x: any) => a + Number(plans[x.id] || 0) * Number(x.price), 0);
  return { mrr, arr: mrr * 12, rows: [], unpriced: 0 };
}

const DaysSeg = ({ days, setDays }: { days: string; setDays: (v: string) => void }) => (
  <View style={{ minWidth: 260 }}><Seg value={days} onChange={setDays} options={[['7', t('7 gün')], ['30', t('30 gün')], ['90', t('90 gün')]]} /></View>
);

/** Genel bakış: koyu kartta kira ve aidat hacmi; her gruptan en önemli göstergeler. Ayrıntı Büyüme, Gelir ve Gider sayfalarında. */
export function Overview({ ops, go }: { ops?: { pending?: number; banned?: number }; go?: (tab: string) => void }) {
  const c = useColors();
  const { data: k, err } = useLoad<any>(() => loadKpis(30), []);
  const month = new Date().toISOString().slice(0, 7);
  const { sum } = useCosts(month);
  const head = <PageHead label={t('Yönetici')} title={t('Genel bakış')} sub={t('Kısa özet; ayrıntılar Büyüme, Gelir ve Gider sayfalarında.')} />;
  if (err) return <Stack>{head}<Text v="small" color={c.badInk}>{err}</Text></Stack>;
  if (!k) return <Stack>{head}<Spin /></Stack>;
  const v = volumes(k);
  const r = revenueOf(k);
  const o = k.owners;
  const big = (label: string, value: number, prev: number, sub: string) => (
    <View style={{ flexGrow: 1, flexBasis: 260, gap: 4 }}>
      <Label onDark>{label}</Label>
      <Text v="num" color={c.heroInk} style={{ fontSize: 40, lineHeight: 46, fontVariant: ['tabular-nums'] }}>{tl(value)}</Text>
      <Muted onDark>{[delta(value, prev), t('geçen ay: {v}', { v: tl(prev) }), sub].filter(Boolean).join(' · ')}</Muted>
    </View>
  );
  return (
    <Stack gap={16}>
      {head}
      <Hero gap={14}>
        <Row gap={22} wrap align="flex-end">
          {big(t('Bu ay onaylı kira hacmi'), v.rent, v.rentPrev, v.rentOrg ? t('kurumlar {v}', { v: tl(v.rentOrg) }) : '')}
          {v.hasAidat ? big(t('Bu ay onaylı aidat hacmi'), v.aidat, v.aidatPrev, v.aidatSite ? t('siteler {v}', { v: tl(v.aidatSite) }) : '') : null}
        </Row>
        <Row gap={22} wrap>
          {[[t('Üye'), String(k.users.total)], [t('Ödeyen'), String(o.paying)], [t('Aylık gelir (tahmini)'), tl(r.mrr)], [t('Yönetilen mülk'), String(k.units.total + Number(k.orgs?.units || 0))]].map(([a, b]) => (
            <View key={a} style={{ gap: 2 }}><Muted onDark>{a}</Muted><Text v="h3" color={c.heroInk} style={{ fontFamily: fonts.siteBold }}>{b}</Text></View>
          ))}
        </Row>
      </Hero>
      <KpiGrid>
        <Kpi icon="plus" tone="butter" label={t('Yeni kayıt (30 gün)')} value={String(k.signups.period)} trend={delta(k.signups.period, k.signups.prev) || undefined} sub={t('Dönüşüm: {p}', { p: pct(o.paying, o.total) })} />
        <Kpi icon="chart" tone="sage" label={t('Aylık gelir (tahmini)')} value={tl(r.mrr)} sub={t('Yıllık {v}', { v: tl(r.arr) })} />
        <Kpi icon="card" tone="peach" label={t('Bu ay gider')} value={sum ? tl(sum.total) : '—'} sub={sum ? t('Net (gelir − gider): {v}', { v: tl(r.mrr - sum.total) }) : t('Gider sayfasından girilir')} />
        <Kpi icon="chat" tone="sky" label={t('Açık destek talebi')} value={String(k.supportOpen)} sub={t('Askıdaki hesap: {n}', { n: ops?.banned ?? 0 })} />
      </KpiGrid>
      {go ? (
        <Row wrap>
          <Button kind="ghost" title={t('Büyüme')} onPress={() => go('growth')} />
          <Button kind="ghost" title={t('Gelir')} onPress={() => go('revenue')} />
          <Button kind="ghost" title={t('Gider')} onPress={() => go('costs')} />
        </Row>
      ) : null}
    </Stack>
  );
}

/** Büyüme: kayıt eğrisi, deneme → ödeyen, aktivasyon hunisi, kullanım, kurumlar ve sektörler, yönetilen mülk ve birim. */
export function Growth() {
  const c = useColors();
  const { desktop } = useBreakpoint();
  const [days, setDays] = useState('30');
  const { data: k, err } = useLoad<any>(() => loadKpis(Number(days)), [days]);
  if (err) return <Text v="small" color={c.badInk}>{err}</Text>;
  if (!k) return <Spin />;
  const o = k.owners;
  const orgs = k.orgs;
  const sectors = orgs ? Object.entries(orgs.bySector || {}).sort((a: any, b: any) => b[1] - a[1]) : [];
  return (
    <Stack gap={16}>
      <Row between wrap><Muted>{t('Dönem')}</Muted><DaysSeg days={days} setDays={setDays} /></Row>
      <KpiGrid>
        <Kpi icon="landlord" tone="peach" label={t('Üye')} value={String(k.users.total)} sub={t('{a} mülk sahibi · {b} kiracı · {c} ekip', { a: k.users.landlords, b: k.users.tenants, c: k.users.team })} />
        <Kpi icon="plus" tone="butter" label={t('Yeni kayıt ({n} gün)', { n: k.days })} value={String(k.signups.period)} trend={delta(k.signups.period, k.signups.prev) || undefined} sub={t('önceki dönem: {n}', { n: k.signups.prev })} />
        <Kpi icon="flag" tone="sky" label={t('Denemede')} value={String(o.trial)} sub={t('{n} tanesi 7 gün içinde bitiyor', { n: o.expiring })} />
        <Kpi icon="check" tone="sage" label={t('Deneme → ödeyen')} value={pct(o.paying, o.total)} sub={t('{a} ödeyen / {b} mülk sahibi', { a: o.paying, b: o.total })} />
      </KpiGrid>
      <View style={{ flexDirection: desktop ? 'row' : 'column', gap: 16, alignItems: 'stretch' }}>
        <View style={{ flex: 1.3 }}><Signups series={k.series} /></View>
        <View style={{ flex: 1 }}>{k.funnel ? <Funnel f={k.funnel} /> : null}</View>
      </View>
      {k.activeUsers ? (
        <>
          <GroupTitle>{t('Kullanım')}</GroupTitle>
          <KpiGrid>
            <Kpi icon="home" tone="peach" label={t('Haftalık etkin kullanıcı')} value={String(k.activeUsers.week)} sub={t('Bağlılık (haftalık / aylık): {p}', { p: pct(k.activeUsers.week, k.activeUsers.month) })} />
            <Kpi icon="calendar" tone="sky" label={t('Aylık etkin kullanıcı')} value={String(k.activeUsers.month)} sub={t('Son 30 günde en az bir işlem')} />
            <Kpi icon="send" tone="butter" label={t('Davet kabul oranı ({n} gün)', { n: k.days })} value={pct(k.invites.accepted, k.invites.created)} sub={t('{a} davet · {b} kabul', { a: k.invites.created, b: k.invites.accepted })} />
            <Kpi icon="key" tone="sage" label={t('Zamanında ödeme (geçen ay)')} value={pct(k.punctuality.onTime, k.punctuality.onTime + k.punctuality.late)} sub={t('{a} vadesinde · {b} geç', { a: k.punctuality.onTime, b: k.punctuality.late })} />
          </KpiGrid>
        </>
      ) : null}
      <GroupTitle>{t('Kurumlar ve yönetilen mülk')}</GroupTitle>
      <KpiGrid>
        <Kpi icon="office" tone="sky" label={t('Kurum')} value={orgs ? String(orgs.total) : '—'} sub={orgs ? t('{n} etkin · {m} sözleşme 60 günde bitiyor', { n: orgs.active, m: orgs.ending }) : ''} />
        <Kpi icon="home" tone="peach" label={t('Bireysel mülk')} value={String(k.units.total)} sub={t('{n} tanesinde kiracı bağlı', { n: k.units.connected })} />
        <Kpi icon="grid" tone="butter" label={t('Kurum birimi')} value={orgs ? String(orgs.units) : '—'} sub={orgs ? t('Sözleşmelerde {n} birim', { n: orgs.contracted }) : ''} />
      </KpiGrid>
      {sectors.length ? (
        <Card gap={6}>
          <H2>{t('Sektörlere göre kurumlar')}</H2>
          {sectors.map(([sec, n]: any) => (
            <View key={sec} style={{ gap: 3 }}>
              <Row between><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{sectorOf(sec).label}</Text><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{n}</Text></Row>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c.line }}><View style={{ width: `${Math.round((n / Math.max(1, orgs.total)) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: c.accent }} /></View>
            </View>
          ))}
        </Card>
      ) : null}
    </Stack>
  );
}

/** Gelir: tahmini aylık ve yıllık gelir (paket fiyatlarından), pakete göre dağılım, ödeyen başına gelir, kurum sözleşmeleri, net. */
export function Revenue() {
  const c = useColors();
  const { data: k, err } = useLoad<any>(() => loadKpis(30), []);
  const { data: orgs } = useLoad<any[]>(() => adminOrgs(), []);
  const month = new Date().toISOString().slice(0, 7);
  const { sum } = useCosts(month);
  if (err) return <Text v="small" color={c.badInk}>{err}</Text>;
  if (!k) return <Spin />;
  const r = revenueOf(k);
  const o = k.owners;
  const contracts = (orgs || []).filter((x: any) => x.status === 'active').sort((a: any, b: any) => String(a.contract_until || '9999').localeCompare(String(b.contract_until || '9999')));
  return (
    <Stack gap={16}>
      <KpiGrid>
        <Kpi icon="chart" tone="sage" label={t('Aylık gelir (tahmini)')} value={tl(r.mrr)} sub={t('Paket fiyatı × mülk adedi; yıllık paket ayda 1/12')} />
        <Kpi icon="chart" tone="butter" label={t('Yıllık gelir (ARR, tahmini)')} value={tl(r.arr)} sub={t('Aylık gelirin 12 katı')} />
        <Kpi icon="card" tone="sky" label={t('Ödeyen başına aylık gelir')} value={o.paying ? tl(r.mrr / o.paying) : '—'} sub={t('ARPU')} />
        <Kpi icon="bell" tone="peach" label={t('Ödeme sorunu')} value={String(k.billingIssues)} sub={t('{n} abonelik yenilenmeyecek', { n: k.cancelling })} />
      </KpiGrid>
      {r.rows.length ? (
        <Card gap={4}>
          <H2>{t('Pakete göre')}</H2>
          {r.rows.map((x: any, i: number) => (
            <Row key={x.plan + x.yearly} between wrap style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{planLabel(x.plan)} · {x.yearly ? t('yıllık') : t('aylık')}</Text>
                <Muted>{t('{a} ödeyen · {b} mülk', { a: x.owners, b: x.units })}</Muted>
              </View>
              <Text v="small" style={{ fontFamily: fonts.bodyXBold, fontVariant: ['tabular-nums'] }}>{x.monthly == null ? t('Sözleşmeye göre') : tl(x.monthly) + ' ' + t('/ ay')}</Text>
            </Row>
          ))}
          {r.unpriced ? <Muted>{t('Fiyatı sözleşmeye göre olan {n} abonelik (Kurumsal) tahmine girmez.', { n: r.unpriced })}</Muted> : null}
        </Card>
      ) : <PlanBars plans={k.plans || {}} total={o.paying} />}
      <Card gap={4}>
        <H2>{t('Kurum sözleşmeleri')}</H2>
        {contracts.length ? contracts.map((x: any, i: number) => (
          <Row key={x.id} between wrap style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
            <View style={{ flex: 1, minWidth: 160 }}>
              <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{x.name}</Text>
              <Muted>{[sectorOf(x.sector).label, x.units ? t('{n} birim', { n: x.units }) : ''].filter(Boolean).join(' · ')}</Muted>
            </View>
            <Muted>{x.contract_until ? t('Bitiş {d}', { d: day(x.contract_until) }) : t('Süresiz')}</Muted>
          </Row>
        )) : <Empty>{t('Etkin kurum yok.')}</Empty>}
      </Card>
      <Card gap={6} style={{ borderWidth: 2, borderColor: c.ink }}>
        <Row between wrap>
          <H2>{t('Net (gelir − gider), bu ay')}</H2>
          <Text v="h2" color={sum && r.mrr - sum.total < 0 ? c.badInk : c.ink} style={{ fontVariant: ['tabular-nums'] }}>{sum ? tl(r.mrr - sum.total) : '—'}</Text>
        </Row>
        <Muted>{sum ? t('Tahmini gelir {a} − gider {b} (KDV dahil, Gider sayfasından)', { a: tl(r.mrr), b: tl(sum.total) }) : t('Giderler yükleniyor…')}</Muted>
        <Muted>{t('Gelir paket fiyatlarından tahmindir; mağaza ve sanal POS komisyonları Gider sayfasına elle girilir.')}</Muted>
      </Card>
    </Stack>
  );
}

/** Deneme uzatma ve elle paket verme (gerekçe kayda yazılır). */
export function SubActions({ s, reload }: { s: any; reload: () => void }) {
  const c = useColors();
  const [mode, setMode] = useState('');
  const [days, setDays] = useState('14');
  const [plan, setPlanId] = useState('kurumsal');
  const [until, setUntil] = useState('');
  const [units, setUnits] = useState('1');
  const [sector, setSector] = useState('');
  const [why, setWhy] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const store = s.subscribed && s.store && s.store !== 'admin';
  const run = async (fn: () => Promise<any>) => {
    if (!why.trim()) { setErr(t('Gerekçe yaz.')); return; }
    if (mode === 'plan' && plan) {
      const n = Number(units);
      if (!n || n < 1) { setErr(t('Mülk adedini yaz.')); return; }
      if (plan !== 'kurumsal' && n > 9) { setErr(t('Başlangıç ve Profesyonel için mülk adedi 1-9 olmalı.')); return; }
      if (plan === 'kurumsal' && !sector) { setErr(t('Sektörü seç.')); return; }
    }
    setBusy(true); setErr(null);
    try { await fn(); setMode(''); setWhy(''); reload(); } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  if (!mode) return (
    <Row wrap>
      <Button kind="ghost" title={t('Denemeyi uzat')} onPress={() => setMode('trial')} />
      {store ? <Muted>{t('Mağaza aboneliği; paket mağazadan yönetilir.')}</Muted> : <Button kind="ghost" title={t('Paket ver')} onPress={() => setMode('plan')} />}
      {s.store === 'admin' && s.subscribed ? <Button kind="ghost" title={t('Paketi kaldır')} onPress={() => { setMode('plan'); setPlanId(''); }} /> : null}
    </Row>
  );
  return (
    <View style={{ gap: 10 }}>
      {mode === 'trial'
        ? <Field label={t('Eklenecek gün (1–90)')} value={days} onChangeText={(x) => setDays(x.replace(/\D/g, '').slice(0, 2))} keyboardType="numeric" />
        : <>
          <Seg value={plan} onChange={setPlanId} options={[['tek', planLabel('tek')], ['bes', planLabel('bes')], ['kurumsal', planLabel('kurumsal')], ['', t('Paketi kaldır')]]} />
          {plan ? <Field label={plan === 'kurumsal' ? t('Mülk / birim adedi') : t('Mülk adedi (1-9)')} value={units} onChangeText={(x) => setUnits(x.replace(/\D/g, '').slice(0, plan === 'kurumsal' ? 7 : 1))} keyboardType="numeric" /> : null}
          {plan === 'kurumsal' ? (
            <View style={{ gap: 6 }}>
              <Label>{t('Sektör')}</Label>
              <Seg scroll value={sector} onChange={setSector} options={SECTORS().map((x: any) => [x.key, x.label] as [string, string])} />
            </View>
          ) : null}
          {plan ? <Field label={t('Bitiş tarihi (YYYY-AA-GG, boş: süresiz)')} value={until} onChangeText={setUntil} placeholder="2027-12-31" maxLength={10} /> : null}
        </>}
      <Field label={t('Gerekçe')} value={why} onChangeText={setWhy} placeholder={t('Kayda yazılır')} maxLength={240} />
      <Row wrap>
        <Button kind="ghost" title={t('Vazgeç')} onPress={() => { setMode(''); setErr(null); }} />
        <Button loading={busy} title={mode === 'trial' ? t('Uzat') : plan ? t('Paketi ver') : t('Paketi kaldır')}
          onPress={() => run(() => mode === 'trial' ? extendTrial(s.id, Number(days), why.trim()) : setPlan(s.id, plan, until ? until + 'T23:59:59Z' : null, why.trim(), units, sector))} />
      </Row>
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
    </View>
  );
}

const KIND: Record<string, string> = { kurumsal: 'Kurumsal paket', import: 'Toplu içe aktarma', upgrade: 'Paket yükseltme', genel: 'Genel' };

export function Support({ onConvert }: { onConvert?: (r: any) => void }) {
  const c = useColors();
  const [f, setF] = useState('open');
  const { data, err, reload } = useLoad<any[]>(() => loadSupport());
  const list = (data || []).filter((r) => f === 'all' || r.status === f);
  const [mailFor, setMailFor] = useState<string | null>(null);
  const [mails, setMails] = useState<any[]>([]);
  const loadMails = () => loadAdminEmails().then(setMails);
  useEffect(() => { loadMails(); }, []);
  const toggle = async (r: any) => { try { await setSupportStatus(r.id, r.status === 'open' ? 'done' : 'open'); reload(); } catch {} };
  return (
    <Stack>
      <Seg value={f} onChange={setF} options={[['open', t('Açık')], ['done', t('Kapatılan')], ['all', t('Hepsi')]]} />
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      {data || err ? null : <Spin />}
      {data && !list.length ? <Empty>{t('Talep yok.')}</Empty> : null}
      {list.map((r) => (
        <Card key={r.id} gap={6}>
          <Row between wrap>
            <View style={{ flex: 1, minWidth: 200 }}><H2>{r.name || r.email || '—'}{r.company ? ' · ' + r.company : ''}</H2><Muted>{[r.email, r.phone].filter(Boolean).join(' · ')}</Muted></View>
            <Row gap={8} wrap>
              <Chip tone="accent" label={t(KIND[r.kind] || r.kind)} />
              {r.source === 'web' ? <Chip tone="warn" label={t('Web formu')} /> : null}
              {r.units ? <Chip label={t('{n} mülk', { n: r.units })} /> : null}
              <Muted>{day(r.created_at)}</Muted>
            </Row>
          </Row>
          {r.details && (r.details.types?.length || r.details.role || r.details.city || r.details.timeline) ? (
            <Muted>{[r.details.types?.length ? r.details.types.map((x: string) => t(x)).join(', ') : '', r.details.role ? t(r.details.role) : '', r.details.city, r.details.timeline ? t(r.details.timeline) : ''].filter(Boolean).join(' · ')}</Muted>
          ) : null}
          {r.message ? <Text v="small" selectable>{r.message}</Text> : null}
          <Row wrap>
            {r.email ? <Button kind="ghost" title={t('E-posta gönder')} onPress={() => setMailFor(mailFor === r.id ? null : r.id)} /> : null}
            {r.kind === 'kurumsal' && r.status === 'open' && onConvert ? <Button title={t('Kuruma çevir')} onPress={() => onConvert(r)} /> : null}
            <Button kind={r.status === 'open' ? 'primary' : 'ghost'} title={r.status === 'open' ? t('Kapat') : t('Yeniden aç')} onPress={() => toggle(r)} />
          </Row>
          {mailFor === r.id ? (
            <MailComposer target={{ to: r.email, name: r.name, subject: t('anahtar iletişim talebin'), request_id: r.id, user_id: r.user_id || undefined }}
              onSent={loadMails} onClose={() => setMailFor(null)} />
          ) : null}
          {mails.filter((m) => m.request_id === r.id).map((m) => (
            <Muted key={m.id}>✓ {t('Gönderildi {d}: {s}', { d: day(m.created_at), s: m.subject })}</Muted>
          ))}
        </Card>
      ))}
    </Stack>
  );
}

/** Yasal kira artış oranları: tufe-sync fonksiyonu her ay doldurur; yönetici elle girer ya da düzeltir. */
export function CpiRates() {
  const c = useColors();
  const { data, err, reload } = useLoad<any[]>(() => loadCpi());
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [month, setMonth] = useState(prev.getFullYear() + '-' + String(prev.getMonth() + 1).padStart(2, '0'));
  const [rate, setRate] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const save = async (m: string, r: string) => {
    setMsg(null);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) { setMsg(t('Ayı YYYY-AA biçiminde yaz (ör. 2026-09).')); return; }
    try { await setCpi(m, r.replace(',', '.')); setRate(''); reload(); } catch (e) { setMsg(humanError(e)); }
  };
  return (
    <Stack>
      <Card gap={12}>
        <H2>{t('Oran gir')}</H2>
        <Muted>{t('TÜİK bülteninde “12 aylık ortalamalara göre değişim” satırındaki TÜFE oranı. Ay, verinin ait olduğu aydır (ör. Ekim başında açıklanan Eylül verisi için 2026-09).')}</Muted>
        <Row gap={10} wrap align="flex-end">
          <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Ay (YYYY-AA)')} value={month} onChangeText={setMonth} maxLength={7} /></View>
          <View style={{ flexGrow: 1, flexBasis: 160 }}><Field label={t('Oran (%)')} value={rate} onChangeText={(x) => setRate(x.replace(/[^0-9.,-]/g, ''))} keyboardType="decimal-pad" placeholder="ör. 33,45" /></View>
          <Button title={t('Kaydet')} onPress={() => save(month, rate)} disabled={!rate} style={{ minHeight: 52 }} />
        </Row>
        {msg ? <Text v="small" color={c.badInk}>{msg}</Text> : null}
      </Card>
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      {data || err ? null : <Spin />}
      {data && !data.length ? <Empty>{t('Henüz oran yok. tufe-sync fonksiyonu kurulunca her ay kendiliğinden eklenir.')}</Empty> : null}
      {data && data.length ? (
        <Card gap={0}>
          {data.map((r, i) => (
            <Row key={r.month} between style={{ paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
              <Text v="small" style={{ fontFamily: fonts.bodyBold, flex: 1 }}>{r.month}</Text>
              <Text v="small" style={{ fontFamily: fonts.bodyXBold, width: 90 }}>%{String(r.avg12).replace('.', ',')}</Text>
              <Chip tone={r.source === 'evds' ? 'ok' : 'warn'} label={r.source === 'evds' ? t('Otomatik') : t('Elle')} />
              <Button kind="quiet" title={t('Sil')} onPress={() => save(r.month, '')} />
            </Row>
          ))}
        </Card>
      ) : null}
    </Stack>
  );
}
