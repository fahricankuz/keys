/* Ek ödemeler (site): yakıt, demirbaş ve özel toplamalar (ör. "Çatı onarımı"). Her toplama tek kartta: kaç daire ödedi, toplanan /
   istenen tutar, ilerleme ve ödemeyen daireler. Tahakkuklar aidattan ayrı satırdır; otomatik hatırlatmalar ve banka ekstresinden
   eşleştirme (dairenin açık borçlarına) onları da kapsar. */
import { useState } from 'react';
import { View } from 'react-native';
import { t } from '../domain/i18n';
import { kindLabel, unitLabel, unpaidOf } from '../domain/site';
import { tl, monthYear } from '../domain/util';
import { PressScale, Text } from '../ui/kit';
import { fonts, useColors } from '../ui/theme';
import { Card, H2, Muted, Row } from './blocks';

const EXTRA = ['ozel', 'demirbas', 'yakit'];

export function ExtraPayments({ d }: { d: any }) {
  const c = useColors();
  const [open, setOpen] = useState<string | null>(null);
  const unitBy: Record<string, any> = Object.fromEntries((d.units || []).map((u: any) => [u.id, u]));
  const groups: Record<string, any[]> = {};
  (d.charges || []).filter((x: any) => EXTRA.includes(x.kind)).forEach((x: any) => { (groups[x.kind + '|' + (x.title || '') + '|' + x.month] = groups[x.kind + '|' + (x.title || '') + '|' + x.month] || []).push(x); });
  const list = Object.entries(groups).map(([k, xs]) => {
    const total = xs.reduce((a, x) => a + Number(x.amount), 0), left = xs.reduce((a, x) => a + unpaidOf(x), 0);
    return { k, xs, title: kindLabel(xs[0].kind, xs[0].title), month: xs[0].month, total, got: total - left, paid: xs.filter((x) => unpaidOf(x) === 0).length,
      review: xs.filter((x) => x.status === 'review').length, unpaid: xs.filter((x) => unpaidOf(x) > 0) };
  }).sort((a, b) => b.month.localeCompare(a.month) || a.title.localeCompare(b.title, 'tr'));
  if (!list.length) return null;
  return (
    <Card gap={12}>
      <H2>{t('Ek ödemeler')}</H2>
      {list.slice(0, 6).map((g) => {
        const pct = g.total ? Math.round((g.got / g.total) * 100) : 0;
        const shown = open === g.k;
        return (
          <View key={g.k} style={{ gap: 6, borderTopWidth: 1, borderColor: c.line, paddingTop: 10 }}>
            <Row between wrap>
              <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{g.title} · {monthYear(g.month)}</Text>
              <Text v="small" style={{ fontFamily: fonts.bodyXBold, fontVariant: ['tabular-nums'] }}>{tl(g.got)} / {tl(g.total)}</Text>
            </Row>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: c.line, overflow: 'hidden' }}><View style={{ width: pct + '%' as any, height: 6, backgroundColor: pct >= 100 ? c.okInk : c.accent }} /></View>
            <Row between wrap>
              <Muted>{[t('{n} / {m} daire ödedi', { n: g.paid, m: g.xs.length }), g.review ? t('{n} dekont onay bekliyor', { n: g.review }) : ''].filter(Boolean).join(' · ')}</Muted>
              {g.unpaid.length ? (
                <PressScale onPress={() => setOpen(shown ? null : g.k)} accessibilityRole="button" accessibilityState={{ expanded: shown }} scaleTo={0.97}>
                  <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyBold }}>{shown ? t('Gizle') : t('Ödemeyenler ({n})', { n: g.unpaid.length })}</Text>
                </PressScale>
              ) : null}
            </Row>
            {shown ? <Muted>{g.unpaid.map((x: any) => (unitBy[x.unit_id] ? unitLabel(unitBy[x.unit_id]) : '—') + ' ' + tl(unpaidOf(x))).join(' · ')}</Muted> : null}
          </View>
        );
      })}
      <Muted>{t('Ödemeyenlere son ödeme gününden 3 gün önce, son gün, 5 ve 15 gün sonra hatırlatma kendiliğinden gider; banka ekstresinden eşleştirme bu ödemeleri de kapsar.')}</Muted>
    </Card>
  );
}
