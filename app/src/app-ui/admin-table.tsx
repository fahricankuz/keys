/* Yönetici paneli tablosu: başlık satırı açık zeminde, satırlar ince çizgiyle ayrılır. Geniş ekranda sütunlar yan yana;
   telefonda her satır kart olur (ilk sütun başlık, diğerleri "etiket: değer" satırları). Hücre içeriği ReactNode. */
import { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '../ui/kit';
import { fonts, useBreakpoint, useColors } from '../ui/theme';
import { Card, Muted } from './blocks';

export type Col = { label: string; flex?: number; align?: 'left' | 'right'; width?: number; hidePhone?: boolean };

export function ATable({ cols, rows, keys, title, footer, label }: { cols: Col[]; rows: ReactNode[][]; keys?: string[]; title?: ReactNode; footer?: ReactNode; label?: string }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const cell = (col: Col) => ({ flex: col.width ? undefined : col.flex ?? 1, width: col.width, minWidth: 0, alignItems: (col.align === 'right' ? 'flex-end' : 'flex-start') as any });
  return (
    <Card gap={0} style={{ padding: phone ? 12 : 8 }}>
      {title ? <View style={{ paddingHorizontal: phone ? 4 : 14, paddingTop: phone ? 4 : 12, paddingBottom: 8 }}>{title}</View> : null}
      {phone ? (
        rows.map((r, i) => (
          <View key={keys?.[i] ?? i} style={{ paddingVertical: 12, paddingHorizontal: 4, gap: 6, borderTopWidth: i ? 1 : 0, borderTopColor: c.line }}>
            <View>{r[0]}</View>
            {cols.slice(1).map((col, j) => (col.hidePhone || r[j + 1] == null ? null : (
              <View key={j} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                {col.label ? <Muted>{col.label}</Muted> : <View />}
                <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>{r[j + 1]}</View>
              </View>
            )))}
          </View>
        ))
      ) : (
        <View role="table" aria-label={label}>
          <View role="row" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 14, backgroundColor: c.surface2 }}>
            {cols.map((col, j) => (
              <View key={j} role="columnheader" style={cell(col)}>
                <Text v="small" style={{ fontFamily: fonts.bodyBold, fontSize: 11.5, letterSpacing: 0.6, textTransform: 'uppercase', color: c.muted }}>{col.label}</Text>
              </View>
            ))}
          </View>
          {rows.map((r, i) => (
            <View key={keys?.[i] ?? i} role="row" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
              {cols.map((col, j) => <View key={j} role="cell" style={cell(col)}>{r[j]}</View>)}
            </View>
          ))}
        </View>
      )}
      {footer ? <View style={{ paddingHorizontal: phone ? 4 : 14, paddingVertical: 10 }}>{footer}</View> : null}
    </Card>
  );
}

/** Durum rozeti: ok (yeşil), wait (sarı), bad (kırmızı), neu (gri). */
export function StatusPill({ tone, label }: { tone: 'ok' | 'wait' | 'bad' | 'neu'; label: string }) {
  const c = useColors();
  const dark = c.bg !== '#FAF5F0';
  const [bg, fg] = tone === 'ok' ? (dark ? ['rgba(127,196,149,0.15)', '#7FC495'] : [c.okBg, c.okInk])
    : tone === 'wait' ? (dark ? ['rgba(242,181,68,0.15)', '#F2B544'] : ['#FBEBC8', '#6B4A00'])
    : tone === 'bad' ? (dark ? ['rgba(242,140,134,0.15)', '#F28C86'] : [c.badBg, c.badInk])
    : [c.surface2, c.muted];
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text v="small" style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: fg }}>{label}</Text>
    </View>
  );
}

/** Tablo hücresinde kalın sayı. */
export const NumCell = ({ v, bold = true, color }: { v: string; bold?: boolean; color?: string }) => (
  <Text v="small" style={{ fontFamily: bold ? fonts.bodyXBold : fonts.body, fontVariant: ['tabular-nums'], color }}>{v}</Text>
);
