/* Yönetici paneli: aylık grafik (tek eksen). Üst seri sıfırın üstünde (ör. gelir, yeni kayıt), alt seri altında (gider, ayrılan),
   net çizgi (üst − alt). Aya dokununca / üzerine gelince ayrıntı kutusu; "Tablo" ile aynı veri tablo olarak.
   Renkler: kategorik iki ton (mavi / turuncu), açık ve koyu temada renk körlüğü denetiminden geçti; metin her zaman mürekkep renginde. */
import { ReactNode, useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Line as SvgLine, Path, Polygon, Polyline, Text as SvgText } from 'react-native-svg';
import { t } from '../domain/i18n';
import { monthYear } from '../domain/util';
import { Text } from '../ui/kit';
import { fonts, useBreakpoint, useColors } from '../ui/theme';
import { Card, H2, Muted, Row, Seg } from './blocks';
import { TrendChip } from './admin-ui';

const FONT = 'Inter, system-ui, sans-serif';
// Marka renkleri: üst seri kırmızı (gelir, yeni kayıt), alt seri sarı (gider, ayrılan), net yeşil; koyu temada açık tonlar.
export const SERIES = { light: { up: '#C8302E', down: '#E0A21B', net: '#2A6B3A', base: '#E7DCD3' }, dark: { up: '#E5625F', down: '#F2B544', net: '#7FC495', base: '#3D3532' } };

export type MonthRow = { m: string; up: number; down?: number; future?: boolean; note?: string };

/** Yuvarlak "güzel" eksen üst sınırı: 1, 2, 2.5, 5 × 10^n. */
function niceMax(v: number, int = false) {
  if (v <= 0) return int ? 2 : 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  const m = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 && !int ? 2.5 : n <= 5 ? 5 : 10) * p;
  return int ? Math.max(2, Math.ceil(m / 2) * 2) : m;
}
/** Üstü (ya da altı) yuvarlatılmış sütun yolu: veri ucu 4 px yuvarlak, sıfır çizgisine oturan uç düz. */
function bar(x: number, w: number, y0: number, y1: number, r = 4) {
  const h = Math.abs(y1 - y0);
  if (h < 0.5) return '';
  const rr = Math.min(r, h, w / 2);
  if (y1 < y0) return `M${x},${y0}V${y1 + rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 + rr}V${y0}Z`;
  return `M${x},${y0}V${y1 - rr}Q${x},${y1} ${x + rr},${y1}H${x + w - rr}Q${x + w},${y1} ${x + w},${y1 - rr}V${y0}Z`;
}
const short = (m: string) => monthYear(m).split(' ')[0].slice(0, 3);

/** Başlık altı büyük değer (ör. "Net ₺15.154 ▼ %37"). */
export type Headline = { label?: string; value: string; delta?: string; sub?: string };

export function MonthChart({ title, rows, labels, fmt, axisFmt, summary, net = true, height = 260, int = false, headline, empty, right }: {
  title: string; rows: MonthRow[]; labels: { up: string; down?: string; net?: string; netLong?: string };
  fmt: (v: number) => string; axisFmt?: (v: number) => string; summary?: string; net?: boolean; height?: number; int?: boolean;
  headline?: Headline; empty?: string; right?: ReactNode;
}) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const dark = c.bg === '#1D1A19';
  const col = dark ? SERIES.dark : SERIES.light;
  const [W, setW] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const hasDown = rows.some((r) => r.down != null);
  const showNet = net && hasDown;
  const past = rows.filter((r) => !r.future);
  const lastPast = past.length ? rows.indexOf(past[past.length - 1]) : -1;
  const allZero = past.every((r) => !r.up && !(r.down || 0));
  // Çizgi (gelir / gider / net): alt sınır 0, net eksiye düşerse eksi bölge açılır. Sütun (tek seri): 0'dan.
  const nets = past.map((r) => r.up - (r.down || 0));
  const top = niceMax(Math.max(0, ...past.map((r) => Math.max(r.up, r.down || 0))), int);
  const lowRaw = showNet ? Math.min(0, ...nets) : 0;
  const low = lowRaw < 0 ? -niceMax(-lowRaw, int) : 0;
  const H = phone ? 200 : height, L = 56, R = 12, T = 16, B = 24;
  const y = (v: number) => T + (H - T - B) * ((top - v) / ((top - low) || 1));
  const bw = W ? (W - L - R) / rows.length : 0;
  const cx = (i: number) => L + i * bw + bw / 2;
  const af = axisFmt || fmt;
  const ticks = low < 0 ? [top, top / 2, 0, low] : [top, top / 2, 0];
  const sel = hover ?? null;
  const cur = sel != null ? rows[sel] : null;
  const pts = (f: (r: MonthRow) => number) => past.map((r) => `${cx(rows.indexOf(r)).toFixed(1)},${y(f(r)).toFixed(1)}`).join(' ');
  const series: [string, string, (r: MonthRow) => number][] = hasDown
    ? [[col.up, labels.up, (r) => r.up], [col.down, labels.down || '', (r) => r.down || 0], ...(showNet ? [[col.net, labels.netLong || labels.net || t('Net'), (r: MonthRow) => r.up - (r.down || 0)] as [string, string, (r: MonthRow) => number]] : [])]
    : [];
  const num = (style?: any) => ({ fontVariant: ['tabular-nums'] as any, ...style });
  return (
    <Card gap={10} style={{ flexGrow: 1 }}>
      <Row between wrap align="flex-start">
        <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
          {headline ? <Muted style={{ fontFamily: fonts.bodyBold }}>{title}</Muted> : <H2>{title}</H2>}
          {headline ? (
            <>
              <Row gap={10} wrap>
                <Text style={{ fontFamily: fonts.siteBold, fontSize: phone ? 24 : 30, letterSpacing: -0.8, color: c.ink, ...num() }}>{headline.value}</Text>
                {headline.delta ? <TrendChip trend={headline.delta} /> : null}
              </Row>
              {headline.sub ? <Muted>{headline.sub}</Muted> : null}
            </>
          ) : null}
        </View>
        <Row gap={8}>{right}<Seg value={view} onChange={(v: any) => setView(v)} options={[['chart', t('Grafik')], ['table', t('Tablo')]]} /></Row>
      </Row>
      {series.length && !allZero && view === 'chart' ? (
        <Row gap={14} wrap>
          {series.map(([cl, l]) => <Row key={l} gap={6}><View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: cl }} /><Muted>{l}</Muted></Row>)}
        </Row>
      ) : null}
      {allZero && empty ? (
        <View style={{ minHeight: 140, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, borderRadius: 16, padding: 16, gap: 4 }}>
          <Text v="small" style={{ fontFamily: fonts.bodyBold, textAlign: 'center' }}>{empty}</Text>
        </View>
      ) : view === 'table' ? (
        <View style={{ gap: 0 }}>
          <Row style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: c.surface2 }}>
            <Muted style={{ flex: 1.2, fontFamily: fonts.bodyBold }}>{t('Ay')}</Muted>
            <Muted style={{ flex: 1, textAlign: 'right', fontFamily: fonts.bodyBold }}>{labels.up}</Muted>
            {hasDown ? <Muted style={{ flex: 1, textAlign: 'right', fontFamily: fonts.bodyBold }}>{labels.down}</Muted> : null}
            {showNet ? <Muted style={{ flex: 1, textAlign: 'right', fontFamily: fonts.bodyBold }}>{labels.net || t('Net')}</Muted> : null}
          </Row>
          {past.map((r) => (
            <Row key={r.m} style={{ paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: c.line }}>
              <Text v="small" style={{ flex: 1.2 }}>{monthYear(r.m)}{r.note ? ' *' : ''}</Text>
              <Text v="small" style={num({ flex: 1, textAlign: 'right' })}>{fmt(r.up)}</Text>
              {hasDown ? <Text v="small" style={num({ flex: 1, textAlign: 'right' })}>{fmt(r.down || 0)}</Text> : null}
              {showNet ? <Text v="small" style={num({ flex: 1, textAlign: 'right', fontFamily: fonts.bodyBold, color: r.up - (r.down || 0) < 0 ? c.badInk : c.ink })}>{fmt(r.up - (r.down || 0))}</Text> : null}
            </Row>
          ))}
        </View>
      ) : (
        <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} style={{ height: H }}>
          {W ? (
            <>
              <Svg width={W} height={H} accessibilityLabel={title}>
                {ticks.map((v) => <SvgLine key={'g' + v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={c.line} strokeWidth={1} strokeDasharray={v === 0 ? undefined : '3 4'} />)}
                {ticks.map((v) => <SvgText key={'t' + v} fontFamily={FONT} x={L - 8} y={y(v) + 4} fontSize={10.5} fill={c.muted} textAnchor="end">{v < 0 ? '−' + af(-v) : af(v)}</SvgText>)}
                {hasDown ? (
                  <>
                    {lastPast >= 0 ? <SvgLine x1={cx(sel ?? lastPast)} x2={cx(sel ?? lastPast)} y1={T} y2={H - B} stroke={c.ink} strokeOpacity={0.15} /> : null}
                    {past.length > 1 ? <Polygon points={`${cx(rows.indexOf(past[0]))},${y(Math.max(0, low))} ${pts(series[0][2])} ${cx(lastPast)},${y(Math.max(0, low))}`} fill={col.up} opacity={dark ? 0.16 : 0.12} /> : null}
                    {series.map(([cl, l, f]) => <Polyline key={'s' + l} points={pts(f)} fill="none" stroke={cl} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />)}
                    {series.map(([cl, l, f]) => past.map((r) => {
                      const i = rows.indexOf(r), end = i === lastPast, on = sel === i;
                      return end || on ? <Circle key={l + i} cx={cx(i)} cy={y(f(r))} r={5} fill={c.surface} stroke={cl} strokeWidth={2.5} /> : null;
                    }))}
                  </>
                ) : rows.map((r, i) => {
                  if (r.future || !r.up) return null;
                  const w = Math.max(6, Math.min(44, bw * 0.6)), x = cx(i) - w / 2, on = sel === i || (sel == null && i === lastPast);
                  return [
                    <Path key={'u' + i} d={bar(x, w, y(0), y(r.up), 6)} fill={on ? col.up : col.base} />,
                    on ? <SvgText key={'v' + i} fontFamily={FONT} x={cx(i)} y={y(r.up) - 6} fontSize={12} fontWeight="700" fill={c.ink} textAnchor="middle">{fmt(r.up)}</SvgText> : null,
                  ];
                })}
                {rows.map((r, i) => (
                  <SvgText key={'m' + i} fontFamily={FONT} x={cx(i)} y={H - 6} fontSize={10.5} fill={r.future ? c.offInk : (sel ?? lastPast) === i ? c.ink : c.muted} fontWeight={(sel ?? lastPast) === i ? '700' : '400'} textAnchor="middle">{short(r.m)}</SvgText>
                ))}
              </Svg>
              <View style={{ position: 'absolute', left: L, right: R, top: 0, bottom: 0, flexDirection: 'row' }}>
                {rows.map((r, i) => (
                  <Pressable key={r.m} disabled={r.future} onHoverIn={() => setHover(i)} onHoverOut={() => setHover((h) => (h === i ? null : h))} onPress={() => setHover((h) => (h === i ? null : i))}
                    accessibilityRole="button" accessibilityLabel={monthYear(r.m)} style={{ flex: 1 }} />
                ))}
              </View>
              {cur && !cur.future && hasDown ? (
                <View pointerEvents="none" style={{ position: 'absolute', top: 4, left: Math.max(0, Math.min(W - 204, cx(sel!) + (cx(sel!) > W / 2 ? -214 : 14))), width: 200, padding: 10, gap: 3, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10 }}>
                  <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{monthYear(cur.m)}</Text>
                  {[[col.up, labels.up, cur.up], [col.down, labels.down, cur.down || 0]].map(([cl, l, v]: any) => (
                    <Row key={l} between gap={8}><Row gap={6}><View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: cl }} /><Muted>{l}</Muted></Row><Text v="small" style={num()}>{fmt(v)}</Text></Row>
                  ))}
                  {showNet ? <Row between gap={8} style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 4 }}><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{labels.net || t('Net')}</Text><Text v="small" style={num({ fontFamily: fonts.bodyXBold, color: cur.up - (cur.down || 0) < 0 ? c.badInk : c.ink })}>{fmt(cur.up - (cur.down || 0))}</Text></Row> : null}
                  {cur.note ? <Muted>{cur.note}</Muted> : null}
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      )}
      {summary ? <Text v="small" muted style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 10 }}>{summary}</Text> : null}
    </Card>
  );
}
