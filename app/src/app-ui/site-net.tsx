/* Gelir · gider · net (site ve portföy yönetimi): bu ay ya da yılbaşından bugüne (YTD). Tahsilat (aidat, kira ve toplamalar) gelir,
   kasadan ödenen giderler gider; rakamlar kasa ve yönetim kurulu raporuyla aynı hesaptan (cashbook). */
import { useState } from 'react';
import { View } from 'react-native';
import { t } from '../domain/i18n';
import { cashbook } from '../domain/site';
import { tl, monthYear } from '../domain/util';
import { Text } from '../ui/kit';
import { fonts, useColors } from '../ui/theme';
import { Card, H2, Muted, Row, Seg } from './blocks';

const pad = (n: number) => String(n).padStart(2, '0');

export function NetCard({ d }: { d: any }) {
  const c = useColors();
  const [p, setP] = useState<'month' | 'ytd'>('month');
  const now = new Date(), y = now.getFullYear(), m = pad(now.getMonth() + 1), today = `${y}-${m}-${pad(now.getDate())}`;
  const from = p === 'month' ? `${y}-${m}-01` : `${y}-01-01`;
  const k = cashbook(d, from, today);
  const net = k.income - k.spent;
  const cats = Object.entries(k.byCat || {}).sort((a: any, b: any) => b[1] - a[1]).slice(0, 3);
  const cell = (label: string, v: number, tone?: string) => (
    <View style={{ flex: 1, minWidth: 110, gap: 2 }}>
      <Muted>{label}</Muted>
      <Text v="h3" color={tone} style={{ fontFamily: fonts.displayBold, fontVariant: ['tabular-nums'] }}>{tl(v)}</Text>
    </View>
  );
  return (
    <Card gap={10}>
      <Row between wrap>
        <H2>{t('Gelir · gider · net')}</H2>
        <Seg value={p} onChange={(v: any) => setP(v)} options={[['month', t('Bu ay')], ['ytd', t('Yılbaşından bugüne')]]} />
      </Row>
      <Row wrap>
        {cell(t('Gelir (tahsilat)'), k.income, c.okInk)}
        {cell(t('Gider'), k.spent)}
        {cell(t('Net'), net, net < 0 ? c.badInk : c.ink)}
      </Row>
      <Muted>{[p === 'month' ? monthYear(`${y}-${m}`) : t('{y} yılbaşından bugüne', { y }),
        cats.length ? t('En çok: {list}', { list: cats.map(([k2, v]: any) => k2 + ' ' + tl(v)).join(', ') }) : ''].filter(Boolean).join(' · ')}</Muted>
    </Card>
  );
}
