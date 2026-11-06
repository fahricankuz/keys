/* Kurumsal raporlarda para birimi: ₺ / $ / € anahtarı (seçim kişinin hesabında, ayarlarda saklanır), kur tablosu ve
   12 aylık gelir grafiği (TL ve seçilen döviz yan yana; dövizde kendi kuruyla, fx-report.js kurallarıyla). */
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { S } from '../domain/state';
import { t } from '../domain/i18n';
import { act } from '../domain/services';
import { loadFx, fxTable } from '../domain/fx';
import { monthlyRevenue } from '../domain/fx-report';
import { fmtMoney, fmtShort } from '../domain/money';
import { monthYear } from '../domain/util';
import { Text } from '../ui/kit';
import { fonts, useColors } from '../ui/theme';
import { Card, H2, Muted, Row, Seg } from './blocks';
import { useStore } from './hooks';

export type Cur = 'TRY' | 'USD' | 'EUR';
const OK = ['TRY', 'USD', 'EUR'];

/** Seçili rapor para birimi (varsayılan ₺) ve değiştirici. */
export function useReportCurrency(): [Cur, (c: Cur) => void] {
  useStore();
  const v = (S as any).settings?.reportCurrency;
  const cur = (OK.includes(v) ? v : 'TRY') as Cur;
  return [cur, (c: Cur) => act('setSetting', { k: 'reportCurrency', v: c, str: true })];
}

/** Kur tablosu (from gününden bugüne); yüklenene kadar boş tablo, ready false. */
export function useFx(from: string, need = true) {
  const [table, setTable] = useState<any>(() => fxTable([]));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!need) return;
    let live = true;
    loadFx(from).then((x) => { if (live) { setTable(x); setReady(true); } });
    return () => { live = false; };
  }, [from, need]);
  return { table, ready };
}

export function CurrencySwitch({ value, onChange }: { value: Cur; onChange: (c: Cur) => void }) {
  return (
    <View accessibilityLabel={t('Rapor para birimi')} style={{ alignSelf: 'flex-start' }}>
      <Seg value={value} onChange={(v: any) => onChange(v)} options={[['TRY', '₺ TL'], ['USD', '$ USD'], ['EUR', '€ EUR']]} />
    </View>
  );
}

/** Kur dip notu: kaynak ve kural; kur eksikse uyarı. */
export function FxNote({ cur, missing }: { cur: Cur; missing?: boolean }) {
  return (
    <Muted>
      {cur === 'TRY'
        ? t('Kur farkı: dövizli sözleşmelerde tahsil edilen TL ile sözleşme tutarının ödeme günündeki TL karşılığı arasındaki fark (TCMB döviz satış kuru).')
        : t('TCMB döviz satış kuru; her işlem kendi gününün kuruyla (tahsilat: ödeme günü, istenen: son ödeme günü, gider: harcama günü). Hafta sonu ve tatilde son iş gününün kuru. Dövizli sözleşmede sözleşmedeki tutar esas alınır, TL’nin değer farkı “Kur farkı” satırındadır.')}
      {missing ? ' ' + t('Bazı işlemlerin günü için kur henüz yok; bu işlemler toplama katılmadı.') : ''}
    </Muted>
  );
}

function Bars({ data, cur, color }: { data: { month: string; value: number; missing: boolean }[]; cur: Cur; color: string }) {
  const c = useColors();
  const max = Math.max(1, ...data.map((x) => x.value));
  const total = data.reduce((a, x) => a + x.value, 0);
  return (
    <View style={{ flexGrow: 1, flexBasis: 260, minWidth: 0, gap: 6 }}>
      <Row between>
        <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{cur === 'TRY' ? t('TL') : cur === 'USD' ? t('Dolar') : t('Avro')}</Text>
        <Text v="small" style={{ fontFamily: fonts.bodyXBold, fontVariant: ['tabular-nums'] }}>{fmtMoney(total, cur)}</Text>
      </Row>
      <View accessibilityRole="image" accessibilityLabel={data.map((x) => monthYear(x.month) + ' ' + fmtMoney(x.value, cur)).join(', ')}
        style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 110, borderBottomWidth: 1, borderColor: c.line }}>
        {data.map((x) => (
          <View key={x.month} style={{ flex: 1, height: `${Math.max(x.value ? 3 : 0, Math.round((x.value / max) * 100))}%`, backgroundColor: x.missing ? c.line : color, borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />
        ))}
      </View>
      <Row between>
        <Muted>{monthYear(data[0].month)}</Muted>
        <Muted>{t('en yüksek {v}', { v: fmtShort(max, cur) })}</Muted>
        <Muted>{monthYear(data[data.length - 1].month)}</Muted>
      </Row>
    </View>
  );
}

/** Son 12 ayın istenen geliri: TL ve seçilen döviz (₺ seçiliyse dolar) yan yana. */
export function RevenueChart({ charges, endMonth, cur, table }: { charges: any[]; endMonth: string; cur: Cur; table: any }) {
  const c = useColors();
  const other: Cur = cur === 'EUR' ? 'EUR' : 'USD';
  const tl = monthlyRevenue(charges, endMonth, 'TRY', table);
  const fx = monthlyRevenue(charges, endMonth, other, table);
  const missing = fx.some((x) => x.missing);
  return (
    <Card gap={8}>
      <H2>{t('12 aylık gelir')}</H2>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
        <Bars data={tl} cur="TRY" color={c.accent} />
        <Bars data={fx} cur={other} color={c.ink} />
      </View>
      <Muted>{t('İstenen tutar (kira, ortak gider, ciro farkı ve diğer tahakkuklar). Döviz karşılığı her tahakkukun son ödeme günündeki TCMB satış kuruyla.')}{missing ? ' ' + t('Gri ay: kur henüz yok.') : ''}</Muted>
    </Card>
  );
}
