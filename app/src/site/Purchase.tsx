/* Satın alma sayfası (/satin-al): paket, dönem ve mülk adedi seçilir; fiyat mülk başınadır ve KDV dahildir.
   Başlangıç seçiliyken Portföy'e geçmek için yükseltme önerisi gösterilir. Ödeme: kart bilgisi ya da App Store / Google Play
   aboneliği; 1 ay ücretsizden sonra iptal edilmezse otomatik başlar, çekimden 1 gün önce e-posta ve bildirimle hatırlatılır. */
import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text as RNText, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { t } from '../domain/i18n';
import { CONFIG } from '../domain/config';
import { storage } from '../domain/storage';
import { maxUnits, monthlyEquivalent, paused, planLabel, rangeText, tierOf, tierPoints, totalPrice, totalText } from '../domain/billing';
import { useAuth } from '../auth/auth';
import { Button, Container, PressScale, Text } from '../ui/kit';
import { Wordmark } from '../ui/Wordmark';
import { fonts, radius, useBreakpoint, useColors } from '../ui/theme';
import { Icon } from '../app-ui/blocks';

type Plan = 'tek' | 'bes';
const SEL = 'anahtar-paket-secimi';

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const c = useColors();
  const btn = (txt: string, disabled: boolean, onPress: () => void, name: string) => (
    <PressScale onPress={disabled ? undefined : onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ disabled }} scaleTo={0.92}
      style={{ width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: disabled ? c.offBg : c.ink }}>
      <RNText style={{ fontFamily: fonts.siteBold, fontSize: 26, lineHeight: 28, color: disabled ? c.offInk : c.bg }}>{txt}</RNText>
    </PressScale>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }} role="group" aria-label={label}>
      {btn('−', value <= min, () => onChange(value - 1), t('Mülk sayısını azalt'))}
      <View style={{ minWidth: 70, alignItems: 'center' }}>
        <RNText accessibilityLiveRegion="polite" style={{ fontFamily: fonts.siteBold, fontSize: 52, lineHeight: 54, letterSpacing: -1.5, color: c.ink }}>{value}</RNText>
      </View>
      {btn('+', value >= max, () => onChange(value + 1), t('Mülk sayısını artır'))}
    </View>
  );
}

function Pick({ on, label, sub, onPress }: { on: boolean; label: string; sub?: string; onPress: () => void }) {
  const c = useColors();
  return (
    <PressScale onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on, checked: on }} aria-checked={on} scaleTo={0.98}
      style={{ flex: 1, minWidth: 130, padding: 14, borderRadius: radius.lg, borderWidth: 1.5, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : c.surface, gap: 2 }}>
      <Text v="small" color={on ? c.accentText : c.ink} style={{ fontFamily: fonts.bodyXBold, fontSize: 15 }}>{label}</Text>
      {sub ? <Text v="small" muted>{sub}</Text> : null}
    </PressScale>
  );
}

export default function Purchase() {
  const c = useColors();
  const router = useRouter();
  const { phone, desktop } = useBreakpoint();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ plan?: string; donem?: string; adet?: string }>();
  // Statik çıktıda adres parametresi ilk çizimde gelmeyebilir; seçim bağlandıktan sonra okunur (hidrasyon uyuşsun diye).
  const [plan, setPlan] = useState<Plan>('tek');
  const [yearly, setYearly] = useState(false);
  const [units, setUnits] = useState(1);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const p = String(params.plan || q?.get('plan') || ''), d = String(params.donem || q?.get('donem') || ''), a = Number(params.adet || q?.get('adet') || 0);
    if (p === 'tek' || p === 'bes') setPlan(p);
    if (d === 'yillik') setYearly(true);
    if (a >= 1 && a <= maxUnits()) setUnits(Math.floor(a));
  }, [params.plan, params.donem, params.adet]);

  const tier = tierOf(plan);
  const bes = tierOf('bes'), tek = tierOf('tek');
  const total = totalPrice(tier, units, yearly) || 0;
  const diff = Math.round(((totalPrice(bes, units, yearly) || 0) - (totalPrice(tek, units, yearly) || 0)) * 100) / 100;
  const per = yearly ? t('/ yıl') : t('/ ay');
  const perUnit = yearly ? t('/ mülk / yıl') : t('/ mülk / ay');
  const money = (n: number) => totalText({ ...bes, usd: n, price: n, usdYearly: n, yearly: n }, 1, false);
  const max = maxUnits();

  const start = () => {
    try { storage.setItem(SEL, JSON.stringify({ plan, units, yearly })); } catch {}
    if (!user) { router.push('/kayit/mulk-sahibi' as any); return; }
    setStarted(true);
  };

  const col = { flex: 1, minWidth: 0, gap: 16 } as const;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.cream }} contentContainerStyle={{ paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
      <Container style={{ paddingTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <PressScale onPress={() => router.replace('/')} accessibilityRole="link" accessibilityLabel={t('Ana sayfa')}><Wordmark size={phone ? 22 : 28} /></PressScale>
        <Button kind="ghost" title={user ? t('Panele git') : t('Giriş yap')} onPress={() => router.push((user ? '/uygulama' : '/giris') as any)} style={{ minHeight: 42, paddingHorizontal: 18 }} />
      </Container>
      <Container style={{ paddingTop: phone ? 28 : 56, gap: 8, maxWidth: 1040 }}>
        <Text v="label" color={c.accentText} style={{ fontSize: 13, letterSpacing: 0.4 }}>{t('Paketini kur')}</Text>
        <RNText style={{ fontFamily: fonts.siteBold, fontSize: phone ? 32 : 52, lineHeight: phone ? 34 : 54, letterSpacing: phone ? -1 : -1.8, color: c.ink }}>{t('Kaç mülkün var?')}</RNText>
        <Text v="body" muted style={{ fontSize: phone ? 16 : 18, lineHeight: phone ? 24 : 27, maxWidth: 640 }}>{t('Fiyat mülk başınadır ve KDV dahildir. Mülk sayını artırıp azaltabilirsin; toplam anında güncellenir.')}</Text>
      </Container>
      {paused() ? (
        <Container style={{ paddingTop: 18, maxWidth: 1040 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, borderRadius: radius.md, padding: 14 }}>
            <Icon name="bell" size={16} color={c.muted} />
            <Text v="small" muted style={{ flex: 1 }}>{t('Ödeme sistemimizi güncelliyoruz. Paket satın alma kısa süre içinde açılacak; paketini şimdiden seçebilir ve hesabını açabilirsin.')}</Text>
          </View>
        </Container>
      ) : null}

      <Container style={{ paddingTop: 22, maxWidth: 1040, flexDirection: desktop ? 'row' : 'column', gap: 20, alignItems: 'flex-start' }}>
        {/* Sol: seçimler */}
        <View style={col}>
          <View style={{ backgroundColor: c.surface, borderRadius: 26, borderWidth: 1, borderColor: c.line, padding: phone ? 18 : 26, gap: 22 }}>
            <View style={{ gap: 10 }}>
              <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Paket')}</Text>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }} accessibilityRole="radiogroup">
                {(['tek', 'bes'] as Plan[]).map((id) => <Pick key={id} on={plan === id} label={planLabel(id)} sub={rangeText(tierOf(id)) + ' · ' + totalText(tierOf(id), 1, yearly) + ' ' + t('/ mülk')} onPress={() => setPlan(id)} />)}
              </View>
            </View>
            <View style={{ gap: 10 }}>
              <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Ödeme dönemi')}</Text>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }} accessibilityRole="radiogroup">
                <Pick on={!yearly} label={t('Aylık')} onPress={() => setYearly(false)} />
                <Pick on={yearly} label={t('Yıllık')} sub={t('2 ay ücretsiz')} onPress={() => setYearly(true)} />
              </View>
            </View>
            <View style={{ gap: 12 }}>
              <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Mülk sayısı')}</Text>
              <Stepper value={units} min={1} max={max} onChange={setUnits} label={t('Mülk sayısı')} />
              <Text v="small" muted>
                {units >= max ? t('{n} mülk bu paketlerde en fazla. 10 ve üstü mülk için Kurumsal paket:', { n: max }) : t('1-{n} mülk için. 10 ve üstü mülk için Kurumsal paket:', { n: max })}{' '}
                <Text v="small" color={c.accentText} onPress={() => router.push('/kurumsal' as any)} accessibilityRole="link" style={{ fontFamily: fonts.bodyBold, textDecorationLine: 'underline' }}>{t('bize ulaşın')}</Text>
              </Text>
            </View>
          </View>
          <View style={{ backgroundColor: c.surface, borderRadius: 26, borderWidth: 1, borderColor: c.line, padding: phone ? 18 : 26, gap: 8 }}>
            <Text v="small" style={{ fontFamily: fonts.bodyBold, marginBottom: 4 }}>{t('{plan} paketinde neler var?', { plan: planLabel(plan) })}</Text>
            {tierPoints(plan).map((x) => (
              <View key={x} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <Icon name="check" size={16} color={c.okInk} />
                <Text v="small" style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>{x}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Sağ: özet ve yükseltme önerisi */}
        <View style={{ ...col, ...(desktop ? { maxWidth: 400 } : { alignSelf: 'stretch' }) }}>
          <View style={{ backgroundColor: c.deepA, borderRadius: 26, padding: phone ? 20 : 26, gap: 14 }}>
            <Text v="label" color={c.heroMuted} style={{ fontSize: 13 }}>{t('Özet')}</Text>
            <View style={{ gap: 4 }}>
              <Text v="body" color={c.heroInk} style={{ fontFamily: fonts.bodyBold }}>{planLabel(plan)} · {units === 1 ? t('1 mülk') : t('{n} mülk', { n: units })} · {yearly ? t('yıllık') : t('aylık')}</Text>
              <Text v="small" color={c.heroMuted}>{units} × {totalText(tier, 1, yearly)} {perUnit}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <RNText accessibilityLiveRegion="polite" style={{ fontFamily: fonts.siteBold, fontSize: 44, lineHeight: 46, letterSpacing: -1.2, color: c.heroInk }}>{totalText(tier, units, yearly)}</RNText>
              <Text v="small" color={c.heroMuted}>{per} · {t('KDV dahil')}</Text>
            </View>
            {yearly ? <Text v="small" color={c.heroMuted}>{t('aylık {price}’ye denk gelir', { price: money(Math.round((total / 12) * 100) / 100) })}</Text> : null}
            <View style={{ backgroundColor: 'rgba(250,245,240,0.08)', borderRadius: 14, padding: 12, gap: 6 }}>
              <Text v="small" color={c.lemon} style={{ fontFamily: fonts.bodyBold }}>{t('1 ay ücretsiz · bugün ödeme yok')}</Text>
              <Text v="small" color={c.heroMuted} style={{ lineHeight: 19 }}>
                {t('Kart bilgin ya da App Store / Google Play hesabınla abone olursun. 1 ayın sonunda iptal etmezsen {period} ücret otomatik çekilir. Çekimden 1 gün önce e-posta ve bildirimle hatırlatırız; istediğin zaman iptal edebilirsin.', { period: yearly ? t('yıllık') : t('aylık') })}
              </Text>
            </View>
            <Button kind="primary" block title={t('1 ay ücretsiz başla')} onPress={start} />
            {started ? (
              <View style={{ backgroundColor: 'rgba(250,245,240,0.08)', borderRadius: 14, padding: 12, gap: 8 }}>
                {user && user.role !== 'landlord' && user.role !== 'team' ? (
                  <Text v="small" color={c.heroInk}>{t('Abonelik mülk sahibi hesabı içindir. Kiracı hesapları ücretsizdir; mülk sahibi hesabı için yeni bir hesap aç.')}</Text>
                ) : (
                  <>
                    <Text v="small" color={c.heroInk} style={{ fontFamily: fonts.bodyBold }}>{paused() ? t('Ödeme sistemimizi güncelliyoruz') : t('Aboneliği telefondan başlat')}</Text>
                    <Text v="small" color={c.heroMuted}>{paused()
                      ? t('Satın alma kısa süre içinde açılacak. Seçimin ({plan}, {n} mülk) kayıtlı; hesabın ve kayıtların korunur.', { plan: planLabel(plan), n: units })
                      : t('anahtar’ın iPhone ya da Android uygulamasından abone olabilirsin; aynı hesapla web’de de geçerli olur.')}</Text>
                    {(CONFIG as any).billing.appStoreUrl ? <Button kind="onDark" title="App Store" onPress={() => Linking.openURL((CONFIG as any).billing.appStoreUrl)} /> : null}
                    {(CONFIG as any).billing.playStoreUrl ? <Button kind="onDark" title="Google Play" onPress={() => Linking.openURL((CONFIG as any).billing.playStoreUrl)} /> : null}
                  </>
                )}
              </View>
            ) : null}
          </View>

          {plan === 'tek' ? (
            <View accessibilityRole="summary" style={{ backgroundColor: c.butter, borderRadius: 26, padding: phone ? 20 : 24, gap: 10 }}>
              <Text v="label" color="#1D1A19" style={{ fontSize: 12.5 }}>{t('Daha fazlası için')}</Text>
              <RNText style={{ fontFamily: fonts.siteBold, fontSize: 24, lineHeight: 26, letterSpacing: -0.5, color: '#1D1A19' }}>{t('Portföy ile ekibini, raporunu ve SMS’ini aç')}</RNText>
              <Text v="small" color="#1D1A19">{yearly ? t('Aynı {n} mülk için yılda yalnızca {price} daha.', { n: units, price: money(diff) }) : t('Aynı {n} mülk için ayda yalnızca {price} daha.', { n: units, price: money(diff) })}</Text>
              {[t('Ekip üyeleri: emlakçı, muhasebeci, personel'), t('Excel / CSV ile toplu mülk aktarma'), t('Net getiri, yıllık rapor ve vergi tahmini'), t('SMS hatırlatmaları')].map((x) => (
                <View key={x} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <Icon name="check" size={15} color="#1D1A19" />
                  <Text v="small" color="#1D1A19" style={{ flex: 1 }}>{x}</Text>
                </View>
              ))}
              <Button kind="primary" block title={t('Portföy’e geç')} onPress={() => setPlan('bes')} />
            </View>
          ) : null}
        </View>
      </Container>
    </ScrollView>
  );
}
