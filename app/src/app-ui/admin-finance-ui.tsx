/* Yönetici paneli: Ay / Yıl (1 Ocak'tan bugüne) seçici, gelir–gider–net kutusu (kırılımlarıyla) ve yılın aylık grafiği
   (gelir ve gider sütunları, yeni kayıt çizgisi). Hesap: domain/admin-finance.js. */
import { useEffect, useState } from 'react';
import { Text as RNText, View } from 'react-native';
import Svg, { Circle, Line as SvgLine, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { t } from '../domain/i18n';
import { loadKpis } from '../domain/admin';
import { adminOrgs } from '../domain/org';
import { finance, loadCosts, loadMonthly, periodMonths, revenueEstimate, saveRevenueMonth, volumes } from '../domain/admin-finance';
import { monthYear, tl } from '../domain/util';
import { fmtShort } from '../domain/money';
import { Text } from '../ui/kit';
import { fonts, useBreakpoint, useColors } from '../ui/theme';
import { Card, H2, Muted, Row, Seg } from './blocks';
import { useFx } from './fx-ui';
import { categoryLabel } from './admin-costs';

export type Period = 'month' | 'year';
const KEY = 'adminPeriod';
const readPeriod = (): Period => { try { return globalThis.localStorage?.getItem(KEY) === 'year' ? 'year' : 'month'; } catch { return 'month'; } };

/** Dönem seçimi (sayfalar arasında ortak, tarayıcıda hatırlanır). */
export function usePeriod(): [Period, (p: Period) => void] {
  const [p, setP] = useState<Period>(readPeriod);
  return [p, (v) => { setP(v); try { globalThis.localStorage?.setItem(KEY, v); } catch { /* yok say */ } }];
}
export const PeriodSeg = ({ value, onChange }: { value: Period; onChange: (p: Period) => void }) => (
  <Seg value={value} onChange={(v: any) => onChange(v)} options={[['month', t('Bu ay')], ['year', t('Bu yıl (1 Ocak’tan bugüne)')]]} />
);

/** Dönemin karşılaştırma metni: ayda "geçen ay", yılda "geçen yıl aynı dönem". */
export const prevLabel = (p: Period) => (p === 'year' ? t('geçen yıl aynı dönem') : t('geçen ay'));
export function delta(a: number, b: number) { return b ? (a >= b ? '+' : '−') + Math.abs(Math.round(((a - b) / b) * 100)) + '%' : ''; }

/** Panel verisi: göstergeler, bu yılın ve geçen yılın aylık verisi, kurumlar, giderler ve kur tablosu. Bu ayın üyelik tahminini kaydeder. */
export function useAdminFinance() {
  const [state, setState] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const y = new Date().getFullYear();
  const { table } = useFx((y - 1) + '-01-01');
  useEffect(() => {
    let live = true;
    Promise.all([loadKpis(30), loadMonthly(y), loadMonthly(y - 1), adminOrgs().catch(() => []), loadCosts().catch(() => [])])
      .then(([k, cur, prev, orgs, costs]) => {
        if (!live) return;
        const r = revenueEstimate(k.revenueBase || []);
        saveRevenueMonth(r.mrr, k.owners?.paying || 0);
        setState({ k, monthly: [...prev, ...cur], orgs, costs, mrr: r });
      })
      .catch((e) => { if (live) setErr(String(e?.message || e)); });
    return () => { live = false; };
  }, []);
  return { data: state, err, table };
}

/** Dönemin finansı ve karşılaştırması. */
export function periodFinance(data: any, table: any, period: Period) {
  const pm = periodMonths(period);
  const args = { monthly: data.monthly, liveMrr: data.mrr.mrr, orgs: data.orgs, costs: data.costs, table };
  return { cur: finance({ ...args, months: pm.cur }), prev: finance({ ...args, months: pm.prev, liveMrr: 0 }), vol: volumes(data.monthly, pm.cur), volPrev: volumes(data.monthly, pm.prev), pm };
}

const INCOME_LABEL = (k: string) => ({ uyelik: t('Üyelik ücreti'), komisyon: t('İşlem ücreti (kartla aidat / kira)'), diger: t('Diğer (hukuki destek)') } as any)[k] || k;

/** Gelir, gider ve net: üç büyük değer ve altında kırılımlar. */
export function FinanceCard({ f, prev, period }: { f: any; prev: any; period: Period }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const big = (label: string, v: number, p: number, tone?: 'net') => (
    <View style={{ flexGrow: 1, flexBasis: phone ? '100%' : 200, gap: 2 }}>
      <Muted>{label}</Muted>
      <RNText style={{ fontFamily: fonts.siteBold, fontSize: phone ? 26 : 32, letterSpacing: -0.8, color: tone === 'net' && v < 0 ? c.badInk : c.ink, fontVariant: ['tabular-nums'] }}>{tl(v)}</RNText>
      <Muted>{[delta(v, p), prevLabel(period) + ': ' + tl(p)].filter(Boolean).join(' · ')}</Muted>
    </View>
  );
  const part = (label: string, v: number, total: number, i: number) => (
    <View key={label} style={{ gap: 3, paddingTop: i ? 8 : 0 }}>
      <Row between><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{label}</Text><Text v="small" style={{ fontFamily: fonts.bodyXBold, fontVariant: ['tabular-nums'] }}>{tl(v)}</Text></Row>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: c.line }}><View style={{ width: `${total ? Math.round((v / total) * 100) : 0}%`, height: 6, borderRadius: 3, backgroundColor: c.accent }} /></View>
    </View>
  );
  const up = f.incomeParts.find((x: any) => x.key === 'uyelik');
  return (
    <Card gap={14} style={{ borderWidth: 2, borderColor: c.ink }}>
      <H2>{t('Gelir, gider ve net')}</H2>
      <Row wrap>
        {big(t('Gelir'), f.income, prev.income)}
        {big(t('Gider'), f.expense, prev.expense)}
        {big(t('Net (gelir − gider)'), f.net, prev.net, 'net')}
      </Row>
      <View style={{ flexDirection: phone ? 'column' : 'row', gap: 18 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Muted>{t('Gelir kırılımı')}</Muted>
          {f.incomeParts.map((x: any, i: number) => part(INCOME_LABEL(x.key), x.value, f.income, i))}
          {up?.detail?.contracts ? <Muted>{t('Üyelik: paketler {a} · kurumsal sözleşmeler {b}', { a: tl(up.detail.packages), b: tl(up.detail.contracts) })}</Muted> : null}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Muted>{t('Gider kırılımı')}</Muted>
          {f.expenseParts.length ? f.expenseParts.map((x: any, i: number) => part(categoryLabel(x.key), x.value, f.expense, i)) : <Muted>{t('Bu dönemde gider yok.')}</Muted>}
        </View>
      </View>
      <Muted>{[t('Üyelik ücreti paket fiyatlarından tahmindir; işlem ücreti kartla ödemelerden, sanal POS payı gidere kendiliğinden yazılır.'),
        f.missingMonths ? t('{n} geçmiş ay için üyelik kaydı yok (kayıt bu aydan başlıyor).', { n: f.missingMonths }) : ''].filter(Boolean).join(' ')}</Muted>
    </Card>
  );
}

/** Yılın aylık grafiği: gelir ve gider sütunları, yeni kayıt çizgisi (sağ eksen). */
export function YearChart({ data, table }: { data: any; table: any }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const y = new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_, i) => y + '-' + String(i + 1).padStart(2, '0'));
  const now = new Date().toISOString().slice(0, 7);
  const rows = months.map((m) => {
    const f = m <= now ? finance({ monthly: data.monthly, months: [m], liveMrr: data.mrr.mrr, orgs: data.orgs, costs: data.costs, table }) : null;
    const s = (data.monthly.find((x: any) => x.month === m) || {}).signups;
    return { m, inc: f ? f.income : 0, exp: f ? f.expense : 0, sign: m <= now ? Number(s) || 0 : null };
  });
  const W = 720, H = 220, L = 52, R = 34, B = 26, T = 12;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.inc, r.exp)));
  const smax = Math.max(1, ...rows.map((r) => r.sign || 0));
  const bw = (W - L - R) / 12;
  const yv = (v: number) => T + (H - T - B) * (1 - v / max);
  const ys = (v: number) => T + (H - T - B) * (1 - v / smax);
  const pts = rows.filter((r) => r.sign != null).map((r, i) => `${L + i * bw + bw / 2},${ys(r.sign as number)}`).join(' ');
  return (
    <Card gap={8}>
      <Row between wrap>
        <H2>{t('{y} aylık gelir, gider ve büyüme', { y })}</H2>
        <Row gap={12}>
          {[[c.accent, t('Gelir')], [c.ink, t('Gider')], [c.okInk, t('Yeni kayıt')]].map(([col, l]) => (
            <Row key={l} gap={6}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: col }} /><Muted>{l}</Muted></Row>
          ))}
        </Row>
      </Row>
      <Svg viewBox={`0 0 ${W} ${H}`} width="100%" height={phone ? 180 : 240} accessibilityLabel={t('Aylık gelir, gider ve yeni kayıt grafiği')}>
        {[0, 0.5, 1].map((p) => (
          <SvgLine key={p} x1={L} x2={W - R} y1={T + (H - T - B) * (1 - p)} y2={T + (H - T - B) * (1 - p)} stroke={c.line} strokeWidth={1} />
        ))}
        {[0, 0.5, 1].map((p) => (
          <SvgText fontFamily="Inter, system-ui, sans-serif" key={'l' + p} x={L - 6} y={T + (H - T - B) * (1 - p) + 4} fontSize={10} fill={c.muted} textAnchor="end">{fmtShort(max * p, 'TRY')}</SvgText>
        ))}
        <SvgText fontFamily="Inter, system-ui, sans-serif" x={W - R + 6} y={T + 4} fontSize={10} fill={c.okInk}>{smax}</SvgText>
        {rows.map((r, i) => {
          const x = L + i * bw;
          return [
            <Rect key={'i' + i} x={x + bw * 0.14} y={yv(r.inc)} width={bw * 0.34} height={Math.max(0, H - B - yv(r.inc))} rx={3} fill={c.accent} />,
            <Rect key={'e' + i} x={x + bw * 0.52} y={yv(r.exp)} width={bw * 0.34} height={Math.max(0, H - B - yv(r.exp))} rx={3} fill={c.ink} />,
            <SvgText fontFamily="Inter, system-ui, sans-serif" key={'m' + i} x={x + bw / 2} y={H - 8} fontSize={10} fill={c.muted} textAnchor="middle">{monthYear(r.m).split(' ')[0].slice(0, 3)}</SvgText>
          ];
        })}
        {pts ? <Polyline points={pts} fill="none" stroke={c.okInk} strokeWidth={2} /> : null}
        {rows.filter((r) => r.sign != null).map((r, i) => <Circle key={'c' + i} cx={L + i * bw + bw / 2} cy={ys(r.sign as number)} r={3} fill={c.okInk} />)}
      </Svg>
      <Muted>{t('Gelir: üyelik (kaydedilen aylık tahmin), işlem ücreti ve hukuki destek; gider: girilen giderler ve sanal POS payı. Yeni kayıt sağ eksende.')}</Muted>
    </Card>
  );
}
