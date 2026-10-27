/* Kurumsal: aylık ve yıllık rapor e-postası — ayarlar, rapor ekranındaki kart ve e-postanın önizlemesi.
   Önizleme, gönderilen e-postanın (supabase/functions/report/template.ts) uygulama içindeki karşılığıdır. */
import { useState } from 'react';
import { Text as RNText, View } from 'react-native';
import { S, ui } from '../domain/state';
import { t, getLang } from '../domain/i18n';
import { act } from '../domain/services';
import { hasFeature, planLabel } from '../domain/billing';
import { localReport, lastPeriod } from '../domain/report-mail';
import { tl } from '../domain/util';
import { Button, Chip, PressScale, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Card, H2, Icon, Muted, Row, Seg, Stack } from './blocks';
import { Title, Toggle } from './forms';
import { useSheet } from './overlays';

const on = (k: string) => (S as any).settings[k] !== false;

/** Aç/kapa (paket uygunsa) ya da Kurumsal'a yönlendirme. */
export function MailReportSettings() {
  const { open } = useSheet();
  const c = useColors();
  if (!hasFeature('mailReport')) {
    return (
      <Stack gap={10}>
        <Muted>{t('Aylık ve yıllık rapor e-postası {plan} paketinde var.', { plan: planLabel('kurumsal') })}</Muted>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <Button kind="ghost" title={t('Örneği gör')} onPress={() => open('rapor-eposta')} />
          <Button title={t('Paketleri gör')} onPress={() => open('abonelik')} />
        </Row>
      </Stack>
    );
  }
  return (
    <Stack gap={4}>
      <Toggle label={t('Aylık rapor (her ayın 1’inde)')} on={on('reportMonthly')} onChange={(b) => act('setSetting', { k: 'reportMonthly', v: b, bool: true })} />
      <Toggle label={t('Yıllık rapor (her yılın başında)')} on={on('reportYearly')} onChange={(b) => act('setSetting', { k: 'reportYearly', v: b, bool: true })} />
      <PressScale onPress={() => open('rapor-eposta')} accessibilityRole="button" style={{ paddingVertical: 6 }}>
        <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyBold }}>{t('Örnek e-postayı gör')} ›</Text>
      </PressScale>
    </Stack>
  );
}

/** Rapor ekranındaki kart. */
export function MailReportCard() {
  const c = useColors();
  if (ui.role !== 'landlord') return null;
  return (
    <Card gap={12}>
      <Row gap={12} align="flex-start">
        <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: c.peach, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="mail" size={20} color="#A8231F" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={8} style={{ flexWrap: 'wrap' }}><H2>{t('Rapor e-postası')}</H2><Chip tone="warn" label={planLabel('kurumsal')} /></Row>
          <Muted>{t('Tahsilat, gider, net gelir, talepler ve mülk durumları her ay ve yıl sonunda e-postana gelir.')}</Muted>
        </View>
      </Row>
      <MailReportSettings />
    </Card>
  );
}

const TONE = { kirec: ['#FAF5F0', '#1D1A19'], fes: ['#D5EBD7', '#2A6B3A'], gul: ['#F0CFC8', '#A8231F'], bal: ['#F7DDB0', '#6B4A00'] } as const;

/** E-postanın önizlemesi (yerel veriyle). Renkler e-postadaki gibi sabittir; koyu temada da aynı görünür. */
export function MailPreviewSheet() {
  const c = useColors();
  const [period, setPeriod] = useState<'month' | 'year'>('month');
  const ref = lastPeriod(period);
  const r = localReport(period, ref);
  const en = getLang() === 'en';
  const head = period === 'year'
    ? t('{y} yıllık raporu', { y: ref.getFullYear() })
    : t('{m} raporu', { m: ref.toLocaleDateString(en ? 'en-US' : 'tr-TR', { month: 'long', year: 'numeric' }) });
  const pct = r.expected > 0 ? Math.min(100, Math.round((r.collected / r.expected) * 100)) : 0;
  const pctText = en ? pct + '%' : '%' + pct;
  const tile = (label: string, value: number, tone: keyof typeof TONE) => (
    <View style={{ flexGrow: 1, flexBasis: '45%', backgroundColor: TONE[tone][0], borderRadius: 18, padding: 14, gap: 2 }}>
      <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: TONE[tone][1], opacity: 0.8 }}>{label}</RNText>
      <RNText numberOfLines={1} style={{ fontFamily: fonts.siteBold, fontSize: 21, letterSpacing: -0.5, color: TONE[tone][1] }}>{tl(value)}</RNText>
    </View>
  );
  const chip = (p: any) => {
    const [label, tone] = !p.hasTenant ? [t('Boş'), 'kirec'] : p.paidMonths >= p.activeMonths && p.activeMonths > 0 ? [t('Ödendi'), 'fes'] : p.collected > 0 ? [t('Kısmi'), 'bal'] : [t('Bekliyor'), 'gul'];
    const [bg, ink] = TONE[tone as keyof typeof TONE];
    return <View style={{ backgroundColor: tone === 'kirec' ? '#E8DDD5' : bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}><RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 12, color: ink }}>{label}</RNText></View>;
  };
  return (
    <Stack>
      <Title>{t('Rapor e-postası')}</Title>
      <Seg value={period} onChange={(v: any) => setPeriod(v)} options={[['month', t('Aylık')], ['year', t('Yıllık')]]} />
      <Muted>{t('Örnek, mülklerinin bu cihazdaki verisiyle hazırlandı. Gerçek e-posta sunucudaki kayıtlardan oluşur.')}</Muted>
      <View accessibilityLabel={t('E-posta önizlemesi')} style={{ borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: '#E8DDD5', backgroundColor: '#FFFDFB' }}>
        <View style={{ backgroundColor: '#C8302E', padding: 22, paddingBottom: 24 }}>
          <RNText style={{ fontFamily: fonts.siteBold, fontSize: 24, letterSpacing: -1, color: '#FAF5F0' }}>anahtar</RNText>
          <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase', color: '#FAF5F0', opacity: 0.85, marginTop: 18 }}>
            {t('{n} mülk · {o} kiracılı', { n: r.units, o: r.occupied })}
          </RNText>
          <RNText style={{ fontFamily: fonts.siteBold, fontSize: 28, lineHeight: 31, letterSpacing: -1, color: '#FAF5F0', marginTop: 4 }}>{head.charAt(0).toLocaleUpperCase(en ? 'en' : 'tr') + head.slice(1)}</RNText>
        </View>
        <View style={{ padding: 16, gap: 12 }}>
          <View style={{ backgroundColor: '#1D1A19', borderRadius: 20, padding: 18, gap: 4 }}>
            <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 12.5, color: '#A39A95' }}>{t('Tahsilat oranı')}</RNText>
            <RNText style={{ fontFamily: fonts.siteBold, fontSize: 38, lineHeight: 42, letterSpacing: -1.4, color: '#FAF5F0' }}>{pctText}</RNText>
            <View style={{ height: 9, borderRadius: 5, backgroundColor: '#3A3330', overflow: 'hidden', marginTop: 8 }}><View style={{ width: pct + '%' as any, height: 9, borderRadius: 5, backgroundColor: '#F2B544' }} /></View>
            <RNText style={{ fontFamily: fonts.body, fontSize: 12.5, color: '#A39A95', marginTop: 6 }}>{t('{a} / {b} beklenen kira tahsil edildi', { a: tl(r.collected), b: tl(r.expected) })}</RNText>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {tile(t('Beklenen kira'), r.expected, 'kirec')}
            {tile(t('Tahsil edilen'), r.collected, 'fes')}
            {tile(t('Giderler'), r.spent, 'gul')}
            {tile(t('Net gelir'), r.collected - r.spent, 'bal')}
          </View>
          <View style={{ borderWidth: 1, borderColor: '#E8DDD5', borderRadius: 18, padding: 14, gap: 4 }}>
            <RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 15, color: '#1D1A19' }}>{t('Talepler')}</RNText>
            <RNText style={{ fontFamily: fonts.body, fontSize: 13.5, lineHeight: 20, color: '#5C4F4A' }}>
              {t('{a} açıldı · {b} tamamlandı · {c} açık bekliyor', { a: r.requests.opened, b: r.requests.done, c: r.requests.open })}
            </RNText>
          </View>
          {r.properties.map((p: any, i: number) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: i ? 10 : 2, borderTopWidth: i ? 1 : 0, borderColor: '#E8DDD5' }}>
              <View style={{ flex: 1 }}>
                <RNText numberOfLines={1} style={{ fontFamily: fonts.bodyXBold, fontSize: 14.5, color: '#1D1A19' }}>{p.name}</RNText>
                <RNText style={{ fontFamily: fonts.body, fontSize: 12.5, color: '#5C4F4A' }}>{tl(p.collected)} / {tl(p.expected)}</RNText>
              </View>
              {chip(p)}
            </View>
          ))}
          <View style={{ alignSelf: 'center', backgroundColor: '#1D1A19', borderRadius: radius.pill, paddingHorizontal: 22, paddingVertical: 12, marginTop: 6 }}>
            <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: '#FAF5F0' }}>{t('Raporu panelde aç')} →</RNText>
          </View>
        </View>
      </View>
    </Stack>
  );
}
