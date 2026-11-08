/* Yönetici paneli: aylık grafik (tek eksen). Üst seri sıfırın üstünde (ör. gelir, yeni kayıt), alt seri altında (gider, ayrılan),
   net çizgi (üst − alt). Aya dokununca / üzerine gelince ayrıntı kutusu; "Tablo" ile aynı veri tablo olarak.
   Renkler: kategorik iki ton (mavi / turuncu), açık ve koyu temada renk körlüğü denetiminden geçti; metin her zaman mürekkep renginde. */
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Circle, Line as SvgLine, Path, Polyline, Rect, Text as SvgText } from 'react-native-svg';
import { t } from '../domain/i18n';
import { monthYear } from '../domain/util';
import { Text } from '../ui/kit';
import { fonts, useBreakpoint, useColors } from '../ui/theme';
import { Card, H2, Muted, Row, Seg } from './blocks';

const FONT = 'Inter, system-ui, sans-serif';
export const SERIES = { light: { up: '#2a78d6', down: '#eb6834' }, dark: { up: '#3987e5', down: '#d95926' } };

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

export function MonthChart({ title, rows, labels, fmt, axisFmt, summary, net = true, height = 260, int = false }: {
  title: string; rows: MonthRow[]; labels: { up: string; down?: string; net?: string; netLong?: string };
  fmt: (v: number) => string; axisFmt?: (v: number) => string; summary?: string; net?: boolean; height?: number; int?: boolean;
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
  const upMax = niceMax(Math.max(0, ...past.map((r) => r.up)), int);
  const downRaw = hasDown ? Math.max(0, ...past.map((r) => r.down || 0)) : 0;
  // Alt bölge en az üst bölgenin dörtte biri (gider çok küçükse de sütunu ve negatif net okunur); hiç alt değer yoksa eksen etiketi yok.
  const downMax = hasDown ? Math.max(downRaw ? niceMax(downRaw, int) : 0, upMax / 4) : 0;
  const H = phone ? 200 : height, L = 54, R = 10, T = 14, B = 24;
  const span = upMax + downMax || 1;
  const y = (v: number) => T + (H - T - B) * ((upMax - v) / span);
  const y0 = y(0);
  const bw = W ? (W - L - R) / rows.length : 0;
  const cx = (i: number) => L + i * bw + bw / 2;
  const af = axisFmt || fmt;
  const ticks = [upMax, upMax / 2, 0, ...(downRaw ? [-downMax] : [])];
  const netPts = showNet ? past.map((r, i) => `${cx(rows.indexOf(r))},${y(r.up - (r.down || 0))}`).join(' ') : '';
  const lastPast = past.length ? rows.indexOf(past[past.length - 1]) : -1;
  const sel = hover ?? null;
  const cur = sel != null ? rows[sel] : null;
  const legend: [string, string, 'bar' | 'line'][] = [[col.up, labels.up, 'bar'], ...(hasDown && labels.down ? [[col.down, labels.down, 'bar'] as [string, string, 'bar']] : []), ...(showNet ? [[c.ink, labels.netLong || labels.net || t('Net'), 'line'] as [string, string, 'line']] : [])];
  return (
    <Card gap={10}>
      <Row between wrap>
        <H2>{title}</H2>
        <Seg value={view} onChange={(v: any) => setView(v)} options={[['chart', t('Grafik')], ['table', t('Tablo')]]} />
      </Row>
      {legend.length > 1 ? (
        <Row gap={14} wrap>
          {legend.map(([cl, l, k]) => (
            <Row key={l} gap={6}>{k === 'bar' ? <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: cl }} /> : <View style={{ width: 14, height: 2, backgroundColor: cl }} />}<Muted>{l}</Muted></Row>
          ))}
        </Row>
      ) : null}
      {view === 'table' ? (
        <View style={{ gap: 0 }}>
          <Row style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.line }}>
            <Muted style={{ flex: 1.2 }}>{t('Ay')}</Muted>
            <Muted style={{ flex: 1, textAlign: 'right' }}>{labels.up}</Muted>
            {hasDown ? <Muted style={{ flex: 1, textAlign: 'right' }}>{labels.down}</Muted> : null}
            {showNet ? <Muted style={{ flex: 1, textAlign: 'right' }}>{labels.net || t('Net')}</Muted> : null}
          </Row>
          {past.map((r) => (
            <Row key={r.m} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.line }}>
              <Text v="small" style={{ flex: 1.2 }}>{monthYear(r.m)}{r.note ? ' *' : ''}</Text>
              <Text v="small" style={{ flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{fmt(r.up)}</Text>
              {hasDown ? <Text v="small" style={{ flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{fmt(r.down || 0)}</Text> : null}
              {showNet ? <Text v="small" style={{ flex: 1, textAlign: 'right', fontFamily: fonts.bodyBold, fontVariant: ['tabular-nums'], color: r.up - (r.down || 0) < 0 ? c.badInk : c.ink }}>{fmt(r.up - (r.down || 0))}</Text> : null}
            </Row>
          ))}
        </View>
      ) : (
        <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} style={{ height: H }}>
          {W ? (
            <>
              <Svg width={W} height={H} accessibilityLabel={title}>
                {ticks.map((v) => (
                  <SvgLine key={'g' + v} x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={v === 0 ? c.muted : c.line} strokeWidth={v === 0 ? 1 : 1} strokeDasharray={v === 0 ? undefined : '2 4'} />
                ))}
                {ticks.map((v) => (
                  <SvgText key={'t' + v} fontFamily={FONT} x={L - 8} y={y(v) + 4} fontSize={10} fill={c.muted} textAnchor="end">{v < 0 ? '−' + af(-v) : af(v)}</SvgText>
                ))}
                {sel != null ? <Rect x={L + sel * bw + 1} y={T - 6} width={bw - 2} height={H - T - B + 8} rx={6} fill={c.ink} opacity={0.06} /> : null}
                {rows.map((r, i) => {
                  const w = Math.max(4, Math.min(28, bw * 0.56));
                  const x = cx(i) - w / 2;
                  if (r.future) return null;
                  return [
                    <Path key={'u' + i} d={bar(x, w, y0 - 1, y(r.up))} fill={col.up} opacity={sel == null || sel === i ? 1 : 0.45} />,
                    hasDown ? <Path key={'d' + i} d={bar(x, w, y0 + 1, y(-(r.down || 0)))} fill={col.down} opacity={sel == null || sel === i ? 1 : 0.45} /> : null
                  ];
                })}
                {rows.map((r, i) => (
                  <SvgText key={'m' + i} fontFamily={FONT} x={cx(i)} y={H - 6} fontSize={10} fill={r.future ? c.offInk : sel === i ? c.ink : c.muted} fontWeight={sel === i ? '700' : '400'} textAnchor="middle">{short(r.m)}</SvgText>
                ))}
                {showNet && netPts ? <Polyline points={netPts} fill="none" stroke={c.ink} strokeWidth={2} strokeLinejoin="round" /> : null}
                {showNet ? past.map((r) => {
                  const i = rows.indexOf(r), v = r.up - (r.down || 0);
                  return <Circle key={'n' + i} cx={cx(i)} cy={y(v)} r={sel === i ? 5 : 4} fill={v < 0 ? c.surface : c.ink} stroke={c.ink} strokeWidth={2} />;
                }) : null}
                {showNet && lastPast >= 0 && sel == null ? (
                  <SvgText fontFamily={FONT} x={Math.min(cx(lastPast) + 8, W - R)} y={y(rows[lastPast].up - (rows[lastPast].down || 0)) - 8} fontSize={11} fontWeight="700" fill={c.ink} textAnchor={cx(lastPast) + 60 > W ? 'end' : 'start'}>
                    {t('Net {v}', { v: fmt(rows[lastPast].up - (rows[lastPast].down || 0)) })}
                  </SvgText>
                ) : null}
              </Svg>
              <View style={{ position: 'absolute', left: L, right: R, top: 0, bottom: 0, flexDirection: 'row' }}>
                {rows.map((r, i) => (
                  <Pressable key={r.m} disabled={r.future} onHoverIn={() => setHover(i)} onHoverOut={() => setHover((h) => (h === i ? null : h))} onPress={() => setHover((h) => (h === i ? null : i))}
                    accessibilityRole="button" accessibilityLabel={monthYear(r.m)} style={{ flex: 1 }} />
                ))}
              </View>
              {cur && !cur.future ? (
                <View pointerEvents="none" style={{ position: 'absolute', top: 4, left: Math.max(0, Math.min(W - 204, cx(sel!) + (cx(sel!) > W / 2 ? -214 : 14))), width: 200, padding: 10, gap: 3, borderRadius: 12, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10 }}>
                  <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{monthYear(cur.m)}</Text>
                  {[[col.up, labels.up, cur.up], ...(hasDown ? [[col.down, labels.down, cur.down || 0]] : [])].map(([cl, l, v]: any) => (
                    <Row key={l} between gap={8}><Row gap={6}><View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: cl }} /><Muted>{l}</Muted></Row><Text v="small" style={{ fontVariant: ['tabular-nums'] }}>{fmt(v)}</Text></Row>
                  ))}
                  {showNet ? <Row between gap={8} style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 4 }}><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{labels.net || t('Net')}</Text><Text v="small" style={{ fontFamily: fonts.bodyXBold, fontVariant: ['tabular-nums'], color: cur.up - (cur.down || 0) < 0 ? c.badInk : c.ink }}>{fmt(cur.up - (cur.down || 0))}</Text></Row> : null}
                  {cur.note ? <Muted>{cur.note}</Muted> : null}
                </View>
              ) : null}
            </>
          ) : null}
        </View>
      )}
      {summary ? <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{summary}</Text> : null}
    </Card>
  );
}
