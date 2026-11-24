/* Yönetici paneli: genel bakış göstergeleri, mülk sahibi abonelikleri ve "Bize ulaş" talepleri. */
import { ReactNode, useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import Svg, { Circle, Line as SvgLine, Polygon, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { extendTrial, humanError, loadAdminEmails, loadCpi, loadKpis, loadSubscriptions, loadSupport, setCpi, setPlan, setSupportStatus } from '../domain/admin';
import { MailComposer } from './admin-mail';
import { PayResult } from './admin-pay';
import { payRequest, posLink, posStatus } from '../domain/admin-pay';
import { CONFIG } from '../domain/config';
import { planLabel } from '../domain/plans';
import { SECTORS, adminOrgs, sectorOf } from '../domain/org';
import { ChurnAndCohorts } from './admin-churn';
import { FinanceCard, PeriodSeg, SignupChart, YearChart, delta, periodFinance, prevLabel, useAdminFinance, usePeriod } from './admin-finance-ui';
import { t, locale } from '../domain/i18n';
import { monthYear, percent, tl } from '../domain/util';
import { Button, Chip, Field, Text } from '../ui/kit';
import { Loader } from '../ui/Loader';
import { fonts, radius, useBreakpoint, useColors } from '../ui/theme';
import { Card, Empty, H2, Hero, Label, Muted, Row, Seg, Stack } from './blocks';
import { GroupTitle, Kpi, KpiGrid, PageHead, TrendChip } from './admin-ui';
import { CurrencyNote, CurrencyPick, monthEnd, useMoney } from './admin-money';
import { ATable, NumCell, StatusPill } from './admin-table';

const day = (v: any) => (v ? new Date(v).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const pct = (a: number, b: number) => (b ? percent((a / b) * 100, 0) : '—');

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

const SVG_FONT = 'Inter, system-ui, sans-serif';

/** Günlük yeni kayıt sütun grafiği: eksen, kesikli ortalama çizgisi, son gün vurgulu; üzerine gelince günün ayrıntısı. */
function Signups({ series, right }: { series: any[]; right?: ReactNode }) {
  const c = useColors();
  const dark = c.bg === '#1D1A19';
  const [hover, setHover] = useState<number | null>(null);
  const [W, setW] = useState(0);
  const totals = series.map((d) => Number(d.landlords) + Number(d.tenants));
  const max = Math.max(1, ...totals), top = Math.max(2, Math.ceil(max * 1.2));
  const sum = totals.reduce((a, n) => a + n, 0), avg = totals.length ? sum / totals.length : 0;
  const peak = totals.indexOf(max);
  const cur = hover != null ? series[hover] : null;
  const H = 170, L = 26, R = 6, T = 10, B = 22;
  const y = (v: number) => T + (H - T - B) * (1 - v / top);
  const bw = W ? (W - L - R) / Math.max(1, totals.length) : 0;
  const base = dark ? '#3D3532' : '#E7DCD3', on = dark ? '#E5625F' : '#C8302E';
  const step = Math.ceil(totals.length / 6);
  return (
    <Card gap={8} style={{ flexGrow: 1 }}>
      <Row between wrap align="flex-start">
        <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
          <H2>{t('Günlük yeni kayıt')}</H2>
          <Muted>{cur
            ? day(cur.d) + ' · ' + t('{n} kayıt', { n: totals[hover!] }) + ' (' + t('{a} mülk sahibi, {b} kiracı/ekip', { a: cur.landlords, b: cur.tenants }) + ')'
            : t('Son {n} gün · toplam {s} · en yüksek {m} ({d})', { n: totals.length, s: sum, m: max, d: day(series[peak]?.d) })}</Muted>
        </View>
        {right}
      </Row>
      <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} style={{ height: H }}>
        {W ? (
          <>
            <Svg width={W} height={H} accessibilityLabel={t('Günlük yeni kayıt')}>
              {[0, top / 2, top].map((v) => [
                <SvgLine key={'g' + v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={c.line} strokeDasharray={v ? '3 4' : undefined} />,
                <SvgText fontFamily={SVG_FONT} key={'t' + v} x={L - 6} y={y(v) + 4} fontSize={10.5} fill={c.muted} textAnchor="end">{Math.round(v)}</SvgText>,
              ])}
              {totals.map((n, i) => {
                const w = Math.max(3, Math.min(18, bw * 0.62)), x = L + i * bw + (bw - w) / 2;
                const fill = hover === i ? c.ink : i === totals.length - 1 ? on : base;
                return n ? <Rect key={i} x={x} y={y(n)} width={w} height={y(0) - y(n)} rx={Math.min(4, w / 2)} fill={fill} /> : null;
              })}
              {sum ? [
                <SvgLine key="avg" x1={L} x2={W - R} y1={y(avg)} y2={y(avg)} stroke={c.ink} strokeOpacity={0.45} strokeDasharray="6 4" />,
                <SvgText fontFamily={SVG_FONT} key="avgt" x={W - R} y={y(avg) - 5} fontSize={10.5} fill={c.muted} textAnchor="end">{t('ortalama {n}', { n: avg.toLocaleString(locale(), { maximumFractionDigits: 1 }) })}</SvgText>,
              ] : null}
              {series.map((d, i) => (i % step === 0 || i === series.length - 1 ? (
                <SvgText fontFamily={SVG_FONT} key={'d' + i} x={L + i * bw + bw / 2} y={H - 6} fontSize={10.5} fill={i === series.length - 1 ? c.ink : c.muted} fontWeight={i === series.length - 1 ? '700' : '400'} textAnchor="middle">{day(d.d).split(' ').slice(0, 2).join(' ')}</SvgText>
              ) : null))}
            </Svg>
            <View style={{ position: 'absolute', left: L, right: R, top: 0, bottom: 0, flexDirection: 'row' }}>
              {totals.map((n, i) => (
                <View key={series[i].d} {...({ onMouseEnter: () => setHover(i), onMouseLeave: () => setHover(null) } as any)} onTouchStart={() => setHover(i)}
                  accessible accessibilityRole="image" accessibilityLabel={day(series[i].d) + ': ' + n} style={{ flex: 1 }} />
              ))}
            </View>
          </>
        ) : null}
      </View>
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
  // En büyük düşüşün olduğu adım (1 tabanlı: o adımdan bir sonrakine geçişte).
  let worst = 0, drop = 0;
  steps.forEach(([, n], i) => { if (i && steps[i - 1][1] - n > drop) { drop = steps[i - 1][1] - n; worst = i; } });
  const dark = c.bg !== '#FAF5F0';
  const COL = dark ? ['#E5625F', '#E5625F', '#F2B544', '#7FC495'] : ['#C8302E', '#C8302E', '#E0A21B', '#2A6B3A'];
  return (
    <Card gap={10} style={{ flexGrow: 1 }}>
      <H2>{t('Aktivasyon hunisi')}</H2>
      <Muted>{t('Mülk sahiplerinin ürünü gerçekten kullanmaya başlama adımları.')}{worst > 0 && steps[worst - 1][1] ? ' ' + t('En çok kayıp: {a} → {b} ({p}).', { a: worst, b: worst + 1, p: pct(steps[worst - 1][1] - steps[worst][1], steps[worst - 1][1]) }) : ''}</Muted>
      {steps.map(([label, n], i) => (
        <View key={label} style={{ gap: 4 }}>
          <Row between><Text v="small">{i + 1}. {label}</Text><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{n} · {pct(n, f.owners)}{i ? ' · ' + t('önceki adımdan {p}', { p: pct(n, steps[i - 1][1]) }) : ''}</Text></Row>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: c.surface2 }}><View style={{ width: (n / max) * 100 + '%' as any, height: 10, borderRadius: 5, backgroundColor: COL[i] }} /></View>
        </View>
      ))}
    </Card>
  );
}

/** Genel bakış: koyu özet kartı ve Büyüme / Gelir / Kullanım / Operasyon gösterge grupları.
    `ops`: panelin yüklediği özet (denetim bekleyen, askıdaki hesap). */
/** Genel bakış: dönem (bu ay / bu yıl) için kira ve aidat hacmi, gelir–gider–net kutusu, öne çıkan göstergeler ve yılın aylık grafiği. */
export function Overview({ ops, go }: { ops?: { pending?: number; banned?: number }; go?: (tab: string) => void }) {
  const c = useColors();
  const [period, setPeriod] = usePeriod();
  const { data, err, table } = useAdminFinance();
  const { width, phone } = useBreakpoint();
  const { money } = useMoney();
  const side = width >= 1280;   // geniş ekranda gelir–gider kutusu ile yıl grafiği yan yana
  const head = <PageHead label={t('Yönetici')} title={t('Genel bakış')} sub={t('Kısa özet; ayrıntılar Büyüme, Gelir ve Gider sayfalarında.')} right={<><CurrencyPick /><PeriodSeg value={period} onChange={setPeriod} /></>} />;
  if (err) return <Stack>{head}<Text v="small" color={c.badInk}>{err}</Text></Stack>;
  if (!data) return <Stack>{head}<Spin /></Stack>;
  const k = data.k, o = k.owners;
  const { cur, prev, vol, volPrev, pm } = periodFinance(data, table, period);
  const prevDay = monthEnd(pm.prev[pm.prev.length - 1]);
  const tl = (v: number) => money(v);
  const big = (label: string, value: number, before: number, sub: string) => {
    const d = delta(value, before);
    return (
      <View style={{ flexGrow: 1, flexBasis: 260, gap: 6 }}>
        <Label onDark>{label}</Label>
        <Text v="num" color={c.heroInk} style={{ fontSize: phone ? 34 : 44, lineHeight: phone ? 40 : 50, fontVariant: ['tabular-nums'] }}>{tl(value)}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          {d ? <TrendChip trend={d} onDark /> : null}
          <Muted onDark>{[prevLabel(period) + ': ' + money(before, prevDay), sub].filter(Boolean).join(' · ')}</Muted>
        </View>
      </View>
    );
  };
  return (
    <Stack gap={16}>
      {head}
      <CurrencyNote />
      <Hero gap={18}>
        <Row gap={22} wrap align="flex-end">
          {big(period === 'year' ? t('Bu yıl onaylı kira hacmi') : t('Bu ay onaylı kira hacmi'), vol.rent, volPrev.rent, vol.orgRent ? t('kurumlar {v}', { v: tl(vol.orgRent) }) : '')}
          {big(period === 'year' ? t('Bu yıl onaylı aidat hacmi') : t('Bu ay onaylı aidat hacmi'), vol.aidat, volPrev.aidat, vol.siteAidat ? t('siteler {v}', { v: tl(vol.siteAidat) }) : '')}
        </Row>
        <View style={{ height: 1, backgroundColor: 'rgba(250,245,240,0.12)' }} />
        <Row gap={22} wrap>
          {[[t('Üye'), String(k.users.total)], [t('Ödeyen'), String(o.paying)], [t('Aylık gelir (tahmini)'), tl(data.mrr.mrr)], [t('Yönetilen mülk'), String(k.units.total + Number(k.orgs?.units || 0))]].map(([a, b]) => (
            <View key={a} style={{ gap: 2, flexGrow: 1, flexBasis: phone ? '40%' : 140 }}><Muted onDark>{a}</Muted><Text v="h3" color={c.heroInk} style={{ fontFamily: fonts.siteBold }}>{b}</Text></View>
          ))}
        </Row>
      </Hero>
      <KpiGrid>
        <Kpi icon="plus" tone="butter" label={period === 'year' ? t('Yeni kayıt (bu yıl)') : t('Yeni kayıt (bu ay)')} value={String(vol.signups)} trend={delta(vol.signups, volPrev.signups) || undefined} sub={t('Dönüşüm: {p}', { p: pct(o.paying, o.total) })} />
        <Kpi icon="card" tone="sage" label={t('Kartla ödenen (dönem)')} value={tl(vol.card)} trend={delta(vol.card, volPrev.card) || undefined} sub={t('İşlem ücreti gelire, sanal POS payı gidere')} />
        <Kpi icon="chat" tone="sky" label={t('Açık destek talebi')} value={String(k.supportOpen)} sub={t('Askıdaki hesap: {n}', { n: ops?.banned ?? 0 })} />
      </KpiGrid>
      <View style={{ flexDirection: side ? 'row' : 'column', gap: 16, alignItems: side ? 'stretch' : undefined }}>
        <View style={side ? { flex: 1, minWidth: 0 } : undefined}><FinanceCard f={cur} prev={prev} period={period} prevDay={prevDay} /></View>
        <View style={side ? { flex: 1, minWidth: 0 } : undefined}><YearChart data={data} table={table} /></View>
      </View>
      <SignupChart data={data} />
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

/** Büyüme: dönemin yeni kayıtları (karşılaştırmalı), deneme → ödeyen, aktivasyon hunisi, kullanım, kurumlar ve sektörler. */
export function Growth({ onCrm }: { onCrm?: (s: any) => void } = {}) {
  const c = useColors();
  const { desktop } = useBreakpoint();
  const [period, setPeriod] = usePeriod();
  const { data, err, table } = useAdminFinance();
  const [days, setDays] = useState('30');
  const { data: kd } = useLoad<any>(() => loadKpis(Number(days)), [days]);
  if (err) return <Text v="small" color={c.badInk}>{err}</Text>;
  if (!data || !kd) return <Spin />;
  const k = kd, o = k.owners, orgs = k.orgs;
  const { vol, volPrev } = periodFinance(data, table, period);
  const sectors = orgs ? Object.entries(orgs.bySector || {}).sort((a: any, b: any) => b[1] - a[1]) : [];
  return (
    <Stack gap={16}>
      <Row between wrap><PeriodSeg value={period} onChange={setPeriod} /></Row>
      <KpiGrid>
        <Kpi icon="landlord" tone="peach" label={t('Üye')} value={String(k.users.total)} sub={t('{a} mülk sahibi · {b} kiracı · {c} ekip', { a: k.users.landlords, b: k.users.tenants, c: k.users.team })} />
        <Kpi icon="plus" tone="butter" label={period === 'year' ? t('Yeni kayıt (bu yıl)') : t('Yeni kayıt (bu ay)')} value={String(vol.signups)} trend={delta(vol.signups, volPrev.signups) || undefined} sub={prevLabel(period) + ': ' + volPrev.signups} />
        <Kpi icon="flag" tone="sky" label={t('Denemede')} value={String(o.trial)} sub={t('{n} tanesi 7 gün içinde bitiyor', { n: o.expiring })} />
        <Kpi icon="check" tone="sage" label={t('Deneme → ödeyen')} value={pct(o.paying, o.total)} sub={t('{a} ödeyen / {b} mülk sahibi', { a: o.paying, b: o.total })} />
      </KpiGrid>
      <SignupChart data={data} />
      <View style={{ flexDirection: desktop ? 'row' : 'column', gap: 16, alignItems: 'stretch' }}>
        <View style={{ flex: 1.3 }}><Signups series={k.series} right={<DaysSeg days={days} setDays={setDays} />} /></View>
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
      <ChurnAndCohorts period={period} onCrm={onCrm} />
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

const DaysSeg = ({ days, setDays }: { days: string; setDays: (v: string) => void }) => (
  <Seg value={days} onChange={setDays} options={[['7', t('7 gün')], ['30', t('30 gün')], ['90', t('90 gün')]]} />
);

/** Gelir: dönemin gelir–gider–net kutusu, aylık ve yıllık tahmin, pakete göre dağılım, kurum sözleşmeleri (aylık bedel). */
export function Revenue() {
  const c = useColors();
  const [period, setPeriod] = usePeriod();
  const { data, err, table } = useAdminFinance();
  const { money } = useMoney();
  const { width } = useBreakpoint();
  if (err) return <Text v="small" color={c.badInk}>{err}</Text>;
  if (!data) return <Spin />;
  const tl = (v: number) => money(v);
  const k = data.k, o = k.owners, r = data.mrr;
  const { cur, prev, pm } = periodFinance(data, table, period);
  const prevDay = monthEnd(pm.prev[pm.prev.length - 1]);
  const contracts = (data.orgs || []).filter((x: any) => x.status === 'active').sort((a: any, b: any) => String(a.contract_until || '9999').localeCompare(String(b.contract_until || '9999')));
  const orgMonthly = contracts.reduce((a: number, x: any) => a + (Number(x.billing?.monthly_fee) || 0), 0);
  const side = width >= 1280;
  const dark = c.bg !== '#FAF5F0';
  const PAL = dark ? ['#E5625F', '#F2B544', '#7FC495', '#7DB3F0', '#B994EC'] : ['#C8302E', '#E0A21B', '#2A6B3A', '#1F5FAD', '#5E2EA0'];
  const pkTotal = r.rows.reduce((a: number, x: any) => a + (Number(x.monthly) || 0), 0);
  return (
    <Stack gap={16}>
      <Row between wrap><PeriodSeg value={period} onChange={setPeriod} /></Row>
      <View style={{ flexDirection: side ? 'row' : 'column', gap: 16, alignItems: side ? 'stretch' : undefined }}>
        <View style={side ? { flex: 1, minWidth: 0 } : undefined}><FinanceCard f={cur} prev={prev} period={period} prevDay={prevDay} /></View>
        <View style={side ? { flex: 1, minWidth: 0 } : undefined}><YearChart data={data} table={table} /></View>
      </View>
      <KpiGrid>
        <Kpi icon="chart" tone="sage" label={t('Aylık üyelik geliri (tahmini)')} value={tl(r.mrr + orgMonthly)} sub={t('Paketler {a} · kurumsal {b}', { a: tl(r.mrr), b: tl(orgMonthly) })} />
        <Kpi icon="chart" tone="butter" label={t('Yıllık üyelik geliri (ARR, tahmini)')} value={tl((r.mrr + orgMonthly) * 12)} sub={t('Aylık tahminin 12 katı')} />
        <Kpi icon="card" tone="sky" label={t('Ödeyen başına aylık gelir')} value={o.paying ? tl(r.mrr / o.paying) : '—'} sub={t('ARPU (paketler)')} />
        <Kpi icon="bell" tone="peach" label={t('Ödeme sorunu')} value={String(k.billingIssues)} sub={t('{n} abonelik yenilenmeyecek', { n: k.cancelling })} />
      </KpiGrid>
      {r.rows.length ? (
        <ATable label={t('Pakete göre')} title={<H2>{t('Pakete göre')}</H2>}
          cols={[{ label: t('Paket'), flex: 1.6 }, { label: t('Ödeyen'), align: 'right', flex: 0.6 }, { label: t('Mülk'), align: 'right', flex: 0.6 }, { label: t('Pay'), flex: 1.4, hidePhone: true }, { label: t('Aylık gelir'), align: 'right', flex: 1.2 }]}
          keys={r.rows.map((x: any) => x.plan + x.yearly)}
          rows={r.rows.map((x: any, i: number) => {
            const share = pkTotal && x.monthly != null ? Math.round((x.monthly / pkTotal) * 100) : 0;
            const col = PAL[i % PAL.length];
            return [
              <Row key="a" gap={8}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: col }} /><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{planLabel(x.plan)} · {x.yearly ? t('yıllık') : t('aylık')}</Text></Row>,
              <NumCell key="b" v={String(x.owners)} bold={false} />,
              <NumCell key="c" v={String(x.units)} bold={false} />,
              <View key="d" style={{ height: 6, borderRadius: 3, backgroundColor: c.line, alignSelf: 'stretch' }}><View style={{ width: `${share}%`, height: 6, borderRadius: 3, backgroundColor: col }} /></View>,
              <Text key="e" v="small" style={{ fontVariant: ['tabular-nums'] }}><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{x.monthly == null ? t('Sözleşmeye göre') : tl(x.monthly)}</Text>{x.monthly == null ? '' : ' ' + t('/ ay') + (share ? ' · %' + share : '')}</Text>,
            ];
          })} />
      ) : <PlanBars plans={k.plans || {}} total={o.paying} />}
      <Card gap={4}>
        <H2>{t('Kurum sözleşmeleri')}</H2>
        {contracts.length ? contracts.map((x: any, i: number) => (
          <Row key={x.id} between wrap style={{ paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
            <View style={{ flex: 1, minWidth: 160 }}>
              <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{x.name}</Text>
              <Muted>{[sectorOf(x.sector).label, x.units ? t('{n} birim', { n: x.units }) : '', x.contract_until ? t('Bitiş {d}', { d: day(x.contract_until) }) : t('Süresiz')].filter(Boolean).join(' · ')}</Muted>
            </View>
            <Text v="small" style={{ fontFamily: fonts.bodyXBold, fontVariant: ['tabular-nums'] }}>{Number(x.billing?.monthly_fee) > 0 ? tl(x.billing.monthly_fee) + ' ' + t('/ ay') : t('Bedel girilmedi')}</Text>
          </Row>
        )) : <Empty>{t('Etkin kurum yok.')}</Empty>}
        <Muted>{t('Aylık sözleşme bedeli Kurumlar → kurumu düzenle ekranında girilir; yalnız yönetici panelinde görünür.')}</Muted>
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
  // Ödeme: ücretsiz (paket hemen tanımlanır), Havale/EFT (e-posta + WhatsApp, ödeme alınınca tanımlanır), Sanal POS (bağlantı).
  const [pay, setPay] = useState<'free' | 'havale' | 'pos'>('free');
  const [amount, setAmount] = useState('');
  const [posOn, setPosOn] = useState(false);
  const [result, setResult] = useState<any>(null);
  useEffect(() => { if (mode === 'plan') posStatus().then((x: any) => setPosOn(!!x?.configured)); }, [mode]);
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
    try { if ((await fn()) !== 'keep') { setMode(''); setWhy(''); reload(); } } catch (e) { setErr(humanError(e)); }
    setBusy(false);
  };
  const submitPlan = async () => {
    if (pay === 'free' || !plan) return setPlan(s.id, plan, until ? until + 'T23:59:59Z' : null, why.trim(), units, sector);
    const amt = Number(String(amount).replace(/\./g, '').replace(',', '.'));
    if (!(amt > 0)) throw new Error(t('Tutarı yaz.'));
    const r = await payRequest(s.id, { method: pay, plan, units: Number(units), sector: plan === 'kurumsal' ? sector : null, until: until ? until + 'T23:59:59Z' : null, amount: amt, why: why.trim() });
    const url = pay === 'pos' ? await posLink(r.id) : undefined;
    setResult({ ...r, url, amount: amt });
    return 'keep';   // sonuç kartı gösterilir; kapatınca liste yenilenir
  };
  if (result) return <PayResult r={result} amount={result.amount} done={() => { setResult(null); setMode(''); setWhy(''); setAmount(''); setPay('free'); reload(); }} />;
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
      {mode === 'plan' && plan ? (
        <View style={{ gap: 6 }}>
          <Label>{t('Ödeme')}</Label>
          <Seg value={pay} onChange={(v: any) => setPay(v)} options={[['free', t('Ücretsiz ver')], ['havale', t('Havale/EFT')], ...(posOn ? [['pos', t('Sanal POS')] as [string, string]] : [])]} />
          {!posOn ? <Muted>{t('Sanal POS henüz bağlı değil.')}</Muted> : null}
          {pay !== 'free' ? <Field label={t('Tutar (₺)')} value={amount} onChangeText={(x) => setAmount(x.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad" placeholder={t('ör. 12000')} /> : null}
          {pay === 'havale' ? <Muted>{t('Müşteriye tutar, banka bilgisi ve ödeme kodu e-postayla gider; paket ödeme alınınca (Kurumsal tahsilat) tanımlanır.')}</Muted> : null}
          {pay === 'pos' ? <Muted>{t('Kartla ödeme bağlantısı oluşur; ödeme onaylanınca paket kendiliğinden tanımlanır.')}</Muted> : null}
        </View>
      ) : null}
      <Field label={t('Gerekçe')} value={why} onChangeText={setWhy} placeholder={t('Kayda yazılır')} maxLength={240} />
      <Row wrap>
        <Button kind="ghost" title={t('Vazgeç')} onPress={() => { setMode(''); setErr(null); }} />
        <Button loading={busy} title={mode === 'trial' ? t('Uzat') : plan ? t('Paketi ver') : t('Paketi kaldır')}
          onPress={() => run(() => mode === 'trial' ? extendTrial(s.id, Number(days), why.trim()) : submitPlan())} />
      </Row>
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
    </View>
  );
}

const KIND: Record<string, string> = { kurumsal: 'Kurumsal paket', import: 'Toplu içe aktarma', upgrade: 'Paket yükseltme', genel: 'Genel' };

export function Support({ onConvert, onCrm }: { onConvert?: (r: any) => void; onCrm?: (r: any) => void }) {
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
            {onCrm ? <Button kind="ghost" title={t('CRM’e ekle')} onPress={() => onCrm(r)} /> : null}
            <Button kind="ghost" title={r.status === 'open' ? t('Kapat') : t('Yeniden aç')} onPress={() => toggle(r)} />
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
/** TÜFE 12 aylık ortalama çizgisi (son 24 ay) ve son değer. */
function CpiChart({ rows }: { rows: any[] }) {
  const c = useColors();
  const dark = c.bg === '#1D1A19';
  const [W, setW] = useState(0);
  const list = rows.slice(0, 24).slice().reverse();
  const vals = list.map((r) => Number(r.avg12));
  const last = list[list.length - 1], before = list[list.length - 2];
  const lo = Math.floor(Math.min(...vals) / 5) * 5 - 5, hi = Math.ceil(Math.max(...vals) / 5) * 5 + 5;
  const H = 210, L = 40, R = 14, T = 16, B = 24;
  const x = (i: number) => L + (list.length > 1 ? i * (W - L - R) / (list.length - 1) : (W - L - R) / 2);
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / ((hi - lo) || 1));
  const col = dark ? '#E5625F' : '#C8302E';
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const d = before ? Number(last.avg12) - Number(before.avg12) : 0;
  const step = Math.ceil(list.length / 8);
  return (
    <Card gap={8}>
      <Muted style={{ fontFamily: fonts.bodyBold }}>{t('TÜFE 12 aylık ortalama')}</Muted>
      <Row gap={10} wrap>
        <Text style={{ fontFamily: fonts.siteBold, fontSize: 30, letterSpacing: -0.8, color: c.ink }}>{'%' + String(last.avg12).replace('.', ',')}</Text>
        {d ? <TrendChip invert trend={(d < 0 ? '−' : '+') + t('{n} puan', { n: Math.abs(d).toLocaleString(locale(), { maximumFractionDigits: 2 }) })} /> : null}
      </Row>
      <Muted>{t('{m} · kira artışında yasal üst sınır', { m: monthYear(last.month) })}</Muted>
      <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} style={{ height: H }}>
        {W ? (
          <Svg width={W} height={H} accessibilityLabel={t('TÜFE 12 aylık ortalama')}>
            {[lo, (lo + hi) / 2, hi].map((v) => [
              <SvgLine key={'g' + v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={c.line} strokeDasharray="3 4" />,
              <SvgText fontFamily={SVG_FONT} key={'t' + v} x={L - 6} y={y(v) + 4} fontSize={10.5} fill={c.muted} textAnchor="end">{'%' + Math.round(v)}</SvgText>,
            ])}
            {list.length > 1 ? <Polygon points={`${x(0)},${y(lo)} ${pts} ${x(list.length - 1)},${y(lo)}`} fill={col} opacity={dark ? 0.16 : 0.1} /> : null}
            <Polyline points={pts} fill="none" stroke={col} strokeWidth={2.5} strokeLinejoin="round" />
            {vals.map((v, i) => <Circle key={i} cx={x(i)} cy={y(v)} r={i === vals.length - 1 ? 5 : 3} fill={i === vals.length - 1 ? c.surface : col} stroke={col} strokeWidth={2} />)}
            {list.map((r, i) => (i % step === 0 || i === list.length - 1 ? <SvgText fontFamily={SVG_FONT} key={'m' + i} x={x(i)} y={H - 6} fontSize={10.5} fill={i === list.length - 1 ? c.ink : c.muted} fontWeight={i === list.length - 1 ? '700' : '400'} textAnchor="middle">{monthYear(r.month).split(' ')[0].slice(0, 3) + ' ' + r.month.slice(2, 4)}</SvgText> : null))}
          </Svg>
        ) : null}
      </View>
    </Card>
  );
}

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
      {data && data.length ? <CpiChart rows={data} /> : null}
      {data && data.length ? (
        <ATable label={t('Kira artış oranları')}
          cols={[{ label: t('Ay'), flex: 1.6 }, { label: t('Oran'), align: 'right', flex: 0.8 }, { label: t('Değişim'), align: 'right', flex: 1 }, { label: t('Kaynak'), flex: 0.9 }, { label: '', align: 'right', width: 70 }]}
          keys={data.map((r: any) => r.month)}
          rows={data.map((r: any, i: number) => {
            const older = data[i + 1];
            const d = older ? Number(r.avg12) - Number(older.avg12) : null;
            return [
              <Text key="a" v="small"><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{monthYear(r.month)}</Text>{'  '}<Text v="small" muted>{r.month}</Text></Text>,
              <NumCell key="b" v={'%' + String(r.avg12).replace('.', ',')} />,
              d == null || !d ? <Muted key="c">—</Muted> : <View key="c"><TrendChip invert trend={(d < 0 ? '−' : '+') + t('{n} puan', { n: Math.abs(d).toLocaleString(locale(), { maximumFractionDigits: 2 }) })} /></View>,
              <StatusPill key="d" tone={r.source === 'evds' ? 'ok' : 'wait'} label={r.source === 'evds' ? t('Otomatik') : t('Elle')} />,
              <Button key="e" kind="quiet" title={t('Sil')} onPress={() => save(r.month, '')} />,
            ];
          })} />
      ) : null}
    </Stack>
  );
}
