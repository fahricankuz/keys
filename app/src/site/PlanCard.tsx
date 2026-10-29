/* Paket kartı: ana sayfadaki fiyatlar ve paneldeki "Paketler" penceresi aynı kartı kullanır.
   Kartlar yan yana durduğunda satırlar hizalı kalsın diye başlık, fiyat ve madde satırları sabit yükseklikte çizilir. */
import { ReactNode } from 'react';
import { Platform, Text as RNText, View } from 'react-native';
import { t } from '../domain/i18n';
import { Button, Chip, Text } from '../ui/kit';
import { fonts, useBreakpoint, useColors } from '../ui/theme';
import { Icon } from '../app-ui/blocks';

const BALANCE: any = Platform.OS === 'web' ? { textWrap: 'balance' } : null;

export type Plan = { id: string; name: string; price: string; per: string; monthlyEq: string; units: string; points: string[]; best: boolean; corp?: boolean; sub?: string; vat?: boolean };

export function PlanCard({ p, cta, badge, eqLine, side, compact }: {
  p: Plan; cta: { title: string; onPress: () => void; disabled?: boolean };
  /** Sağ üstteki etiket (varsayılan: en çok tercih edilen paket). */
  badge?: ReactNode;
  /** Yıllık görünümde bir kartta "aylık …'ye denk gelir" satırı varsa hepsinde aynı yükseklik ayrılır. */
  eqLine?: boolean;
  /** Yan yana dizilim: kart esner, maddeler satır satır hizalanır. */
  side?: boolean;
  compact?: boolean;
}) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const small = phone || compact;
  const dark = p.best;
  const ink = dark ? c.heroInk : c.ink, soft = dark ? c.heroMuted : c.muted;
  const rule = dark ? 'rgba(250,245,240,0.14)' : c.line;
  const priceSize = small ? 30 : 40;
  return (
    <View style={[{ borderRadius: 26, backgroundColor: dark ? c.deepA : c.surface, borderWidth: dark ? 0 : 1, borderColor: c.line, padding: small ? 20 : 26, gap: small ? 12 : 14 },
      side ? { flex: 1 } : { alignSelf: 'stretch' }]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, minHeight: small ? 0 : 50 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text v="label" color={soft} style={{ fontSize: 13 }}>{p.units}</Text>
          <RNText style={{ fontFamily: fonts.siteBold, fontSize: small ? 22 : 26, lineHeight: small ? 25 : 29, letterSpacing: -0.5, color: ink }}>{p.name}</RNText>
        </View>
        {badge !== undefined ? badge : dark ? <Chip tone="warn" label={t('En çok tercih edilen')} /> : null}
      </View>
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', minHeight: Math.round(priceSize * 1.08) }}>
          <RNText style={{ fontFamily: fonts.siteBold, fontSize: priceSize, lineHeight: Math.round(priceSize * 1.08), letterSpacing: -priceSize * 0.02, color: ink, ...BALANCE }}>{p.price}</RNText>
          {p.per ? <Text v="small" color={soft}>{p.per}</Text> : null}
        </View>
        {p.monthlyEq || eqLine ? <Text v="small" color={soft}>{p.monthlyEq ? t('mülk başına aylık {price}’ye denk gelir', { price: p.monthlyEq }) : ' '}</Text> : null}
        {p.vat ? <Text v="small" color={soft} style={{ fontSize: 12.5 }}>{t('KDV dahil')}</Text> : p.sub ? <Text v="small" color={soft}>{p.sub}</Text> : null}
      </View>
      <Text v="small" color={dark ? c.lemon : c.accentText} style={{ fontFamily: fonts.bodyBold }}>{t('1 ay ücretsiz deneme')}</Text>
      <View>
        {p.points.map((x, k) => (
          <View key={x} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: small ? 0 : 46, paddingVertical: small ? 8 : 6,
            borderTopWidth: 1, borderTopColor: rule, borderBottomWidth: k === p.points.length - 1 ? 1 : 0, borderBottomColor: rule }}>
            <Icon name="check" size={16} color={dark ? c.lemon : c.okInk} />
            <Text v="small" color={ink} style={{ flex: 1, fontSize: 14, lineHeight: 20, opacity: dark ? 0.9 : 1, ...(p.corp && k === 0 ? { fontFamily: fonts.bodyXBold, opacity: 1 } : {}) }}>{x}</Text>
          </View>
        ))}
      </View>
      {side ? <View style={{ flex: 1, minHeight: 4 }} /> : null}
      <Button kind="primary" block title={cta.title} onPress={cta.onPress} disabled={cta.disabled} />
    </View>
  );
}
