import { Grain } from '../ui/Grain';
import { ReactNode, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleProp, View, ViewStyle, Image } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { SvgXml } from 'react-native-svg';
import { I, ic } from '../domain/icons';
import { ST, statusOf } from '../domain/logic';
import { Chip, PressScale, Text } from '../ui/kit';
import { t, locale } from '../domain/i18n';
import { LIVE } from '../domain/config';
import { fileUrl, mediaSrc, reviewOf } from '../domain/backend';
import { useStore } from './hooks';
import { useRoll } from '../ui/motion';
import { tl, monthYear, parse, t0, mkey, addM } from '../domain/util';
import { fonts, radius, useColors } from '../ui/theme';

export function Icon({ name, size = 18, color }: { name: string; size?: number; color?: string }) {
  const c = useColors();
  const xml = ic(name, size).replace(/currentColor/g, color || c.ink).replace(/\{RING\}/g, color || c.accent);
  return <SvgXml xml={xml} width={size} height={size} />;
}

export function Stack({ children, gap = 14, style }: { children?: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function Row({ children, between, gap = 10, wrap, style, align = 'center' }: {
  children?: ReactNode; between?: boolean; gap?: number; wrap?: boolean; style?: StyleProp<ViewStyle>; align?: 'center' | 'flex-start' | 'flex-end' | 'baseline';
}) {
  return <View style={[{ flexDirection: 'row', alignItems: align, gap, justifyContent: between ? 'space-between' : 'flex-start', flexWrap: wrap ? 'wrap' : 'nowrap' }, style]}>{children}</View>;
}

export function Card({ children, onPress, style, gap = 10 }: { children?: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; gap?: number }) {
  const c = useColors();
  const base: ViewStyle = { backgroundColor: c.surface, borderRadius: radius.lg, padding: 20, borderWidth: 1, borderColor: c.line, gap };
  if (onPress) return <PressScale onPress={onPress} accessibilityRole="button" scaleTo={0.985} style={[base, style]}>{children}</PressScale>;
  return <View style={[base, style]}>{children}</View>;
}

/** Koyu vurgu kartı (kira kartı, tahsilat özeti). */
export function Hero({ children, style, gap = 12 }: { children?: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  const c = useColors();
  return (
    <View style={[{ backgroundColor: c.deepA, borderRadius: radius.xl, padding: 24, gap, overflow: 'hidden' }, style]}>
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 400 300" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
        <Defs><LinearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor={c.deepA} /><Stop offset="1" stopColor={c.deepB} /></LinearGradient></Defs>
        <Rect width="400" height="300" fill="url(#hg)" />
        <Path d="M-10 230 C 90 190, 180 270, 300 215 S 390 190, 420 205" stroke="#fff" strokeOpacity={0.13} strokeWidth={1.5} fill="none" />
        <Path d="M250 -10 C 300 60, 230 120, 330 190" stroke="#fff" strokeOpacity={0.1} strokeWidth={1.5} fill="none" />
      </Svg>
      <Grain />
      {children}
    </View>
  );
}

export function H2({ children, onDark }: { children: ReactNode; onDark?: boolean }) {
  const c = useColors();
  return <Text v="h3" color={onDark ? c.heroInk : c.ink}>{children}</Text>;
}

export function Label({ children, onDark, accent }: { children: ReactNode; onDark?: boolean; accent?: boolean }) {
  const c = useColors();
  return <Text v="label" color={accent ? c.accentText : onDark ? c.heroMuted : c.muted}>{children}</Text>;
}

export function Muted({ children, onDark, style, selectable }: { children?: ReactNode; onDark?: boolean; style?: any; selectable?: boolean }) {
  const c = useColors();
  return <Text v="small" color={onDark ? c.heroMuted : c.muted} style={style} selectable={selectable}>{children}</Text>;
}

export function KV({ k, v, onDark }: { k: ReactNode; v: ReactNode; onDark?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 16, paddingVertical: 4 }}>
      <Text v="small" color={onDark ? c.heroMuted : c.muted} style={{ flexShrink: 1 }}>{k}</Text>
      <Text v="small" color={onDark ? c.heroInk : c.ink} style={{ fontFamily: fonts.bodyXBold, textAlign: 'right', flexShrink: 1 }}>{v}</Text>
    </View>
  );
}

/** Tek satırda kalan büyük yazı: kutunun genişliğine sığmazsa yazı boyutu küçülür (₺30.000 alt satıra kaymaz).
    `fitFor`: boyut hesabında kullanılacak metin (sayı yuvarlanırken boyut sabit kalsın diye son değer). */
function Fit({ v, base, color, fitFor, children }: { v: 'num' | 'h2'; base: number; color: string; fitFor?: string; children: ReactNode }) {
  const [w, setW] = useState(0);
  const len = Math.max(String(fitFor ?? (typeof children === 'string' || typeof children === 'number' ? children : '')).length, 1);
  const size = w ? Math.max(18, Math.min(base, Math.floor(w / (len * 0.62)))) : base;
  return (
    <View style={{ alignSelf: 'stretch', minWidth: 0 }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Text v={v} color={color} numberOfLines={1} style={{ fontSize: size, lineHeight: Math.round(size * 1.08) }}>{children}</Text>
    </View>
  );
}

export function Big({ children, onDark, fitFor }: { children: ReactNode; onDark?: boolean; fitFor?: string }) {
  const c = useColors();
  return <Fit v="num" base={56} color={onDark ? c.heroInk : c.ink} fitFor={fitFor}>{children}</Fit>;
}

/** Para tutarı: ilk gösterimde ve değer değişince yuvarlanarak gelir. */
export function BigRoll({ value, onDark, format = tl }: { value: number; onDark?: boolean; format?: (n: number) => string }) {
  const v = useRoll(Number(value) || 0);
  return <Big onDark={onDark} fitFor={format(Number(value) || 0)}>{format(v)}</Big>;
}

export function Mid({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Fit v="h2" base={32} color={c.ink}>{children}</Fit>;
}

export function Note({ children, warn }: { children: ReactNode; warn?: boolean }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: warn ? c.warnBg : c.accentSoft, borderRadius: radius.md, padding: 14 }}>
      <Text v="small" color={warn ? c.warnInk : c.ink}>{children}</Text>
    </View>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, borderRadius: radius.lg, padding: 22, alignItems: 'center' }}>
      <Text v="small" muted style={{ textAlign: 'center' }}>{children}</Text>
    </View>
  );
}

/** Liste satırı: sol başlık + alt satır, sağda chip ya da eylem. */
export function LI({ title, sub, right, onPress, last }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; onPress?: () => void; last?: boolean }) {
  const c = useColors();
  const inner = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text v="small" style={{ fontFamily: fonts.bodyXBold, fontSize: 15 }}>{title}</Text>
        {sub ? <Text v="small" muted>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
  return onPress ? <PressScale onPress={onPress} accessibilityRole="button" scaleTo={0.99}>{inner}</PressScale> : inner;
}

export function List({ children }: { children?: ReactNode }) {
  const c = useColors();
  return <View style={{ backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>{children}</View>;
}

/** Çoklu kayıt listesi: son satırın alt çizgisi otomatik kalkar. */
export function Items<T>({ data, render }: { data: T[]; render: (x: T, last: boolean, i: number) => ReactNode }) {
  return <List>{data.map((x, i) => render(x, i === data.length - 1, i))}</List>;
}

export function Seg({ options, value, onChange, scroll }: { options: [string, string][]; value: string; onChange: (v: string) => void; scroll?: boolean }) {
  const c = useColors();
  const items = options.map(([v, l]) => {
    const on = v === value;
    return (
      <PressScale key={v} onPress={() => onChange(v)} accessibilityRole="button" accessibilityState={{ selected: on }} scaleTo={0.96}
        style={{ paddingHorizontal: 16, minHeight: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.ink : 'transparent', borderWidth: 1, borderColor: on ? c.ink : c.line, flexGrow: scroll ? 0 : 1 }}>
        <Text v="small" color={on ? c.bg : c.ink} style={{ fontFamily: fonts.bodyXBold }}>{l}</Text>
      </PressScale>
    );
  });
  if (scroll) return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{items}</ScrollView>;
  return <View style={{ flexDirection: 'row', gap: 8 }}>{items}</View>;
}

export function Bar({ pct, exp }: { pct: number; exp?: number }) {
  const c = useColors();
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: c.surface2, overflow: 'hidden', flexDirection: 'row' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: c.accent }} />
      {exp ? <View style={{ width: `${Math.max(0, Math.min(100, exp))}%`, backgroundColor: c.muted, opacity: 0.5 }} /> : null}
    </View>
  );
}

export function IconBtn({ name, onPress, label, badge, size = 20 }: { name: string; onPress: () => void; label: string; badge?: number; size?: number }) {
  const c = useColors();
  return (
    <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label} scaleTo={0.9}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
      <Icon name={name} size={size} />
      {badge ? (
        <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text v="small" color={c.accentInk} style={{ fontSize: 11, lineHeight: 14, fontFamily: fonts.bodyXBold }}>{badge}</Text>
        </View>
      ) : null}
    </PressScale>
  );
}

export function Avatar({ text }: { text: string }) {
  const c = useColors();
  return (
    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyXBold }}>{text}</Text>
    </View>
  );
}

export function initials(name: string) {
  const parts = String(name).replace(/[\[\]]/g, '').trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toLocaleUpperCase('tr-TR');
}

/** Ödeme durumu chip'i (logic.ST). */
export function StatusChip({ st }: { st: string }) {
  const s = (ST as any)[st] || (ST as any).pending;
  const tone = s[1] === 'ok' ? 'ok' : s[1] === 'wait' ? 'warn' : s[1] === 'bad' ? 'bad' : 'neutral';
  return <Chip label={s[0]} tone={tone as any} />;
}

/** Legacy chip sınıfı (ok|wait|bad|acc|'') → ton. */
export function toneOf(cls?: string): 'neutral' | 'ok' | 'bad' | 'warn' | 'accent' {
  return cls === 'ok' ? 'ok' : cls === 'wait' ? 'warn' : cls === 'bad' ? 'bad' : cls === 'acc' ? 'accent' : 'neutral';
}

/** Dört adımlı talep ilerlemesi. */
export function Steps({ status, labels }: { status: number; labels: string[] }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', flex: i < 3 ? 1 : 0 }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: i <= status ? c.accent : c.line }} />
            {i < 3 && <View style={{ flex: 1, height: 3, backgroundColor: i < status ? c.accent : c.line }} />}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {labels.map((l, i) => <Text key={l} v="small" color={i === status ? c.ink : c.muted} style={{ fontSize: 12, fontFamily: i === status ? fonts.bodyXBold : fonts.body }}>{l}</Text>)}
      </View>
    </View>
  );
}

/** Yönetici denetimi durumu: yalnızca yükleyen kendi yüklemesi için görür (bkz. backend.reviewOf). */
export function ReviewChip({ kind, pid, id }: { kind: 'payment' | 'document' | 'invoice'; pid: string; id: string }) {
  useStore();
  if (!LIVE) return null;
  const r = reviewOf(kind, pid, id);
  if (!r) return null;
  if (r.status === 'approved') return <Chip tone="ok" label={t('Onaylandı')} />;
  if (r.status === 'rejected') return <Chip tone="bad" label={t('Reddedildi') + (r.note ? ': ' + r.note : '')} />;
  return <Chip tone="warn" label={t('İncelemede')} />;
}

/** Depodaki dosyayı (PDF dahil) imzalı adresle açar. */
export function FileLink({ path, label }: { path?: string; label: string }) {
  const c = useColors();
  if (!path) return <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{label}</Text>;
  return (
    <PressScale onPress={async () => { const u = await fileUrl(path); if (u) Linking.openURL(u); }} accessibilityRole="link">
      <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyXBold, textDecorationLine: 'underline' }}>{label}</Text>
    </PressScale>
  );
}

export function Thumbs({ srcs, onRemove, size = 72 }: { srcs: string[]; onRemove?: (j: number) => void; size?: number }) {
  const c = useColors();
  useStore();
  if (!srcs.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {srcs.map((s, j) => (
        <View key={j} style={{ width: size, height: size, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: c.surface2 }}>
          <Image source={{ uri: mediaSrc(s) }} style={{ width: size, height: size }} resizeMode="cover" />
          {onRemove && (
            <Pressable onPress={() => onRemove(j)} accessibilityLabel="Fotoğrafı sil" style={{ position: 'absolute', top: 2, right: 2, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' }}>
              <Text v="small" color="#fff" style={{ lineHeight: 18 }}>×</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

export const typeIcon = (t: string) => ({ Konut: 'home', Ofis: 'office', Mağaza: 'shop', Depo: 'box' } as Record<string, string>)[t] || 'home';

/* Aylık ödeme karoları (rapor ve mülk ödemeleri): durum renkle ve işaretle gösterilir. */
const TILE_OF: Record<string, string> = { approved: 'paid', review: 'review', partial: 'partial', rejected: 'late', late: 'late', pending: 'upcoming' };
const TILE_MARK: Record<string, string> = { paid: '✓', review: '…', partial: '½', late: '!', upcoming: '–' };
const TILE_NAME: Record<string, string> = { paid: 'Ödendi', review: 'Onay bekliyor', partial: 'Kısmi', late: 'Gecikti', upcoming: 'Yaklaşan' };
function useTileStyle(onDark?: boolean) {
  const c = useColors();
  return (kind: string) => ({
    paid: { bg: c.okBg, ink: c.okInk, border: c.okBg },
    review: { bg: onDark ? c.okBg : c.surface, ink: c.okInk, border: c.okInk },
    partial: { bg: c.warnBg, ink: c.warnInk, border: c.warnBg },
    late: { bg: c.badBg, ink: c.badInk, border: c.badInk },
    upcoming: { bg: 'transparent', ink: onDark ? c.heroMuted : c.muted, border: onDark ? 'rgba(251,244,234,0.35)' : c.line, dashed: true }
  } as Record<string, { bg: string; ink: string; border: string; dashed?: boolean }>)[kind];
}

/** Son n ayın ödeme durumu (sözleşme başlangıcından öncesi gösterilmez). */
export function lastMonths(p: any, n = 6) {
  const from = String(p.startDate || '').slice(0, 7);
  return Array.from({ length: n }, (_, i) => mkey(addM(t0(), i - (n - 1))))
    .filter((k) => !from || k >= from)
    .map((k) => ({ key: k, label: parse(k + '-01').toLocaleDateString(locale(), { month: 'short' }), full: monthYear(k), status: statusOf(p, k) }));
}

/** months: [{ key, label, full, status }] */
export function MonthTiles({ months }: { months: { key: string; label: string; full: string; status: string | null }[] }) {
  const style = useTileStyle();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {months.map((m) => {
        const kind = TILE_OF[m.status || ''] || 'upcoming', st = style(kind);
        return (
          <View key={m.key} accessible accessibilityLabel={m.full + ': ' + t(TILE_NAME[kind])}
            style={{ flex: 1, minWidth: 0, height: 40, borderRadius: 8, backgroundColor: st.bg, borderWidth: 1.5, borderColor: st.border, borderStyle: st.dashed ? 'dashed' : 'solid', alignItems: 'center', justifyContent: 'center' }}>
            <Text v="small" color={st.ink} style={{ fontSize: 11, lineHeight: 13 }}>{m.label}</Text>
            <Text v="small" color={st.ink} style={{ fontFamily: fonts.bodyXBold, fontSize: 12, lineHeight: 14 }}>{TILE_MARK[kind]}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Kira kartındaki yıl görünümü: 12 ay iki sırada (Oca–Haz, Tem–Ara). Her karoda ayın adı ve durum işareti
    (✓ ödendi, … onay bekliyor, ½ kısmi, ! gecikti, – yaklaşan) yazar; sözleşmeden önceki aylar soluk kalır, bu ay çerçevelidir. */
export function YearTiles({ p, onDark }: { p: any; onDark?: boolean }) {
  const style = useTileStyle(onDark);
  const c = useColors();
  const now = new Date(), year = now.getFullYear();
  const from = String(p.startDate || '').slice(0, 7);
  const months = Array.from({ length: 12 }, (_, m) => {
    const key = year + '-' + String(m + 1).padStart(2, '0');
    const before = !!from && key < from;
    const kind = before ? 'upcoming' : TILE_OF[statusOf(p, key) || ''] || 'upcoming';
    return { key, kind, before, current: m === now.getMonth(), label: parse(key + '-01').toLocaleDateString(locale(), { month: 'short' }).replace('.', ''), full: monthYear(key) };
  });
  const tile = (m: (typeof months)[number]) => {
    const st = style(m.kind);
    return (
      <View key={m.key} accessible accessibilityLabel={m.full + ': ' + (m.before ? t('Sözleşme öncesi') : t(TILE_NAME[m.kind]))}
        style={{ flex: 1, minWidth: 0, height: 46, borderRadius: 10, backgroundColor: st.bg, borderWidth: m.current ? 2.5 : 1.5,
          borderColor: m.current ? (onDark ? '#fff' : c.ink) : st.border, borderStyle: st.dashed && !m.current ? 'dashed' : 'solid',
          alignItems: 'center', justifyContent: 'center', opacity: m.before ? 0.35 : 1 }}>
        <Text v="small" numberOfLines={1} color={st.ink} style={{ fontSize: 11, lineHeight: 13, fontFamily: m.current ? fonts.bodyXBold : undefined }}>{m.label}</Text>
        <Text v="small" color={st.ink} style={{ fontFamily: fonts.bodyXBold, fontSize: 12, lineHeight: 14 }}>{m.before ? ' ' : TILE_MARK[m.kind]}</Text>
      </View>
    );
  };
  return (
    <View style={{ gap: 6, maxWidth: 520 }}>
      <View style={{ flexDirection: 'row', gap: 5 }}>{months.slice(0, 6).map(tile)}</View>
      <View style={{ flexDirection: 'row', gap: 5 }}>{months.slice(6).map(tile)}</View>
    </View>
  );
}

export function MonthLegend({ onDark }: { onDark?: boolean }) {
  const style = useTileStyle(onDark);
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }} role="list" aria-label={t('Karo açıklaması')}>
      {Object.keys(TILE_MARK).map((kind) => {
        const st = style(kind);
        return (
          <View key={kind} role="listitem" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: st.bg, borderWidth: 1.5, borderColor: st.border, borderStyle: st.dashed ? 'dashed' : 'solid', alignItems: 'center', justifyContent: 'center' }}>
              <Text v="small" color={st.ink} style={{ fontFamily: fonts.bodyXBold, fontSize: 10, lineHeight: 12 }}>{TILE_MARK[kind]}</Text>
            </View>
            <Text v="small" color={onDark ? c.heroMuted : c.muted}>{t(TILE_NAME[kind])}</Text>
          </View>
        );
      })}
    </View>
  );
}
export { I };
