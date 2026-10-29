/* Satın alma sayfası (/satin-al): önce mülk sayısı, sonra paket ve ödeme dönemi seçilir; fiyat mülk başınadır ve KDV dahildir.
   Sağdaki özet "bugün ödenecek ₺0", ilk ödeme tarihi ve hatırlatma çizelgesini gösterir. Başlangıç seçiliyken Portföy önerisi çıkar.
   Ödeme: kart bilgisi ya da App Store / Google Play aboneliği; 1 ay ücretsizden sonra iptal edilmezse otomatik başlar,
   çekimden 1 gün önce e-posta ve bildirimle hatırlatılır. */
import { useEffect, useState } from 'react';
import { Linking, ScrollView, Text as RNText, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { t, locale, getLang } from '../domain/i18n';
import { CONFIG } from '../domain/config';
import { storage } from '../domain/storage';
import { maxUnits, paused, planLabel, tierOf, tierPoints, totalPrice, totalText } from '../domain/billing';
import { useAuth } from '../auth/auth';
import { Button, Container, PressScale, Text } from '../ui/kit';
import { Wordmark } from '../ui/Wordmark';
import { fonts, radius, useBreakpoint, useColors } from '../ui/theme';
import { Icon } from '../app-ui/blocks';

type Plan = 'tek' | 'bes';
const SEL = 'anahtar-paket-secimi';
const DAY = 864e5;

/** Küçük yuvarlak +/− düğmesi. */
function RoundBtn({ txt, disabled, onPress, name }: { txt: string; disabled: boolean; onPress: () => void; name: string }) {
  const c = useColors();
  return (
    <PressScale onPress={disabled ? undefined : onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ disabled }} scaleTo={0.92}
      style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: disabled ? c.offBg : c.ink }}>
      <RNText style={{ fontFamily: fonts.siteBold, fontSize: 22, lineHeight: 24, color: disabled ? c.offInk : c.bg }}>{txt}</RNText>
    </PressScale>
  );
}

function Stepper({ value, min, max, onChange, label }: { value: number; min: number; max: number; onChange: (n: number) => void; label: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }} role="group" aria-label={label}>
      <RoundBtn txt="−" disabled={value <= min} onPress={() => onChange(value - 1)} name={t('Mülk sayısını azalt')} />
      <View style={{ minWidth: 46, alignItems: 'center' }}>
        <RNText accessibilityLiveRegion="polite" style={{ fontFamily: fonts.siteBold, fontSize: 44, lineHeight: 46, letterSpacing: -1.2, color: c.ink }}>{value}</RNText>
      </View>
      <RoundBtn txt="+" disabled={value >= max} onPress={() => onChange(value + 1)} name={t('Mülk sayısını artır')} />
      <Text v="body" muted style={{ fontFamily: fonts.bodyBold }}>{t('mülk')}</Text>
    </View>
  );
}

/** Seçenek kartı: solda yuvarlak seçim işareti, başlık (ve etiket), alt satırlar. */
function Option({ on, onPress, title, badge, lines }: { on: boolean; onPress: () => void; title: string; badge?: { label: string; tone: 'warn' | 'ok' }; lines: string[] }) {
  const c = useColors();
  const bg = badge?.tone === 'ok' ? c.okBg : c.warnBg, fg = badge?.tone === 'ok' ? c.okInk : c.warnInk;
  return (
    <PressScale onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on, checked: on }} aria-checked={on} scaleTo={0.985}
      // flex dış sarmalayıcıya gider; iç kart onu doldurur, böylece aynı satırdaki kartlar eşit yükseklikte olur.
      style={{ flex: 1, minWidth: 220, padding: 16, borderRadius: 20, borderWidth: 1.5, borderColor: on ? c.accent : c.line, backgroundColor: on ? c.rose : c.surface, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: on ? c.accent : c.muted, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
        {on ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} /> : null}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Text v="body" style={{ fontFamily: fonts.bodyXBold, fontSize: 16.5 }}>{title}</Text>
          {badge ? <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 2 }}><RNText style={{ fontFamily: fonts.bodyBold, fontSize: 12, color: fg }}>{badge.label}</RNText></View> : null}
        </View>
        {lines.map((l, i) => <Text key={i} v="small" muted style={{ fontSize: 14, lineHeight: 19, ...(i === 0 ? { fontFamily: fonts.bodyBold } : {}) }}>{l}</Text>)}
      </View>
    </PressScale>
  );
}

function Section({ n, title, aside, children, first }: { n: number; title: string; aside?: string; children: React.ReactNode; first?: boolean }) {
  const c = useColors();
  return (
    <View style={{ gap: 14, paddingTop: first ? 0 : 24, borderTopWidth: first ? 0 : 1, borderTopColor: c.line }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}><RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 13, color: c.bg }}>{n}</RNText></View>
          <RNText style={{ fontFamily: fonts.siteBold, fontSize: 22, letterSpacing: -0.5, color: c.ink }}>{title}</RNText>
        </View>
        {aside ? <Text v="small" muted>{aside}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** Adım göstergesi (süs): 1 Paketini kur → 2 Ödeme yöntemi → 3 Başla. */
function Steps({ step }: { step: number }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const items = [t('Paketini kur'), t('Ödeme yöntemi'), t('Başla')];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }} accessibilityLabel={t('Adım {n} / 3', { n: step })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: phone ? 8 : 14, flexShrink: 1 }}>
        {items.map((x, i) => {
          const on = i + 1 === step, done = i + 1 < step;
          return (
            <View key={x} style={{ flexDirection: 'row', alignItems: 'center', gap: phone ? 6 : 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: on || done ? c.accent : 'transparent', borderWidth: on || done ? 0 : 1.5, borderColor: c.line }}>
                  <RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 12.5, color: on || done ? c.accentInk : c.muted }}>{i + 1}</RNText>
                </View>
                {!phone || on ? <Text v="small" color={on ? c.ink : c.muted} style={{ fontFamily: on ? fonts.bodyXBold : fonts.bodyBold }}>{x}</Text> : null}
              </View>
              {i < 2 ? <View style={{ width: phone ? 18 : 48, height: 1.5, backgroundColor: c.line }} /> : null}
            </View>
          );
        })}
      </View>
      {phone ? null : <Text v="small" muted>{t('Yaklaşık 1 dakika')}</Text>}
    </View>
  );
}

function Dot({ filled }: { filled: boolean }) {
  const c = useColors();
  return <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: filled ? c.lemon : 'transparent', borderWidth: filled ? 0 : 2, borderColor: c.heroMuted, marginTop: 4 }} />;
}

export default function Purchase() {
  const c = useColors();
  const router = useRouter();
  const { phone, desktop } = useBreakpoint();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ plan?: string; donem?: string; adet?: string }>();
  // Statik çıktıda adres parametresi ve tarih ilk çizimde yoktur; bağlandıktan sonra okunur (hidrasyon uyuşsun diye).
  const [plan, setPlan] = useState<Plan>('tek');
  const [yearly, setYearly] = useState(false);
  const [units, setUnits] = useState(1);
  const [started, setStarted] = useState(false);
  const [today, setToday] = useState<number | null>(null);
  useEffect(() => {
    setToday(Date.now());
    const q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
    const p = String(params.plan || q?.get('plan') || ''), d = String(params.donem || q?.get('donem') || ''), a = Number(params.adet || q?.get('adet') || 0);
    if (p === 'tek' || p === 'bes') setPlan(p);
    if (d === 'yillik') setYearly(true);
    if (a >= 1 && a <= maxUnits()) setUnits(Math.floor(a));
  }, [params.plan, params.donem, params.adet]);

  const tier = tierOf(plan), bes = tierOf('bes'), tek = tierOf('tek');
  const max = maxUnits();
  const per = yearly ? t('/ yıl') : t('/ ay');
  const perUnit = yearly ? t('/ mülk / yıl') : t('/ mülk / ay');
  const priceOf = (tr: any, y: boolean, n = units) => totalPrice(tr, n, y) || 0;
  const total = priceOf(tier, yearly);
  const money = (n: number) => (n === 0 ? (getLang() === 'en' ? '$0' : '₺0') : totalText({ ...bes, usd: n, price: n, usdYearly: n, yearly: n }, 1, false));
  const monthlyTotal = priceOf(tier, false), yearlyTotal = priceOf(tier, true);
  const saving = Math.round((monthlyTotal * 12 - yearlyTotal) * 100) / 100;
  const yearlyMonthly = Math.round((yearlyTotal / 12) * 100) / 100;
  const diff = Math.round((priceOf(bes, yearly) - priceOf(tek, yearly)) * 100) / 100;
  const dateText = (off: number) => (today == null ? '' : new Date(today + off * DAY).toLocaleDateString(locale(), { day: 'numeric', month: 'long' }));
  // Türkçede ay adına ayrılma eki: "28 Kasım’dan itibaren", "2 Aralık’tan itibaren" (ünsüz uyumu).
  const ABL = ['tan', 'tan', 'tan', 'dan', 'tan', 'dan', 'dan', 'tan', 'den', 'den', 'dan', 'tan'];
  const firstCharge = today == null ? t('1 ay sonra')
    : getLang() === 'en' ? t('{date}’dan itibaren', { date: dateText(30) })
    : (() => { const d = new Date(today + 30 * DAY); return d.getDate() + ' ' + d.toLocaleDateString('tr-TR', { month: 'long' }) + '’' + ABL[d.getMonth()] + ' itibaren'; })();

  const start = () => {
    try { storage.setItem(SEL, JSON.stringify({ plan, units, yearly })); } catch {}
    if (!user) { router.push('/kayit/mulk-sahibi' as any); return; }
    setStarted(true);
  };

  const card = { backgroundColor: c.surface, borderRadius: 28, borderWidth: 1, borderColor: c.line } as const;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.cream }} contentContainerStyle={{ paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
      <Container style={{ paddingTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <PressScale onPress={() => router.replace('/')} accessibilityRole="link" accessibilityLabel={t('Ana sayfa')}><Wordmark size={phone ? 22 : 30} /></PressScale>
        <Button kind="ghost" title={user ? t('Panele git') : t('Giriş yap')} onPress={() => router.push((user ? '/uygulama' : '/giris') as any)} style={{ minHeight: 44, paddingHorizontal: 20 }} />
      </Container>
      <Container style={{ paddingTop: phone ? 22 : 36, maxWidth: 1040, gap: 6 }}>
        <Steps step={started ? 2 : 1} />
      </Container>
      <Container style={{ paddingTop: phone ? 22 : 30, gap: 8, maxWidth: 1040 }}>
        <Text v="label" color={c.accentText} style={{ fontSize: 13, letterSpacing: 0.4 }}>{t('Paketini kur')}</Text>
        <RNText style={{ fontFamily: fonts.siteBold, fontSize: phone ? 34 : 54, lineHeight: phone ? 36 : 56, letterSpacing: phone ? -1 : -2, color: c.ink }}>{t('Kaç mülkün var?')}</RNText>
        <Text v="body" muted style={{ fontSize: phone ? 16 : 18, lineHeight: phone ? 24 : 27, maxWidth: 640 }}>{t('Fiyat mülk başınadır ve KDV dahildir. Mülk sayını artırıp azaltabilirsin; toplam anında güncellenir.')}</Text>
      </Container>
      {paused() ? (
        <Container style={{ paddingTop: 18, maxWidth: 1040 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: 'rgba(242,181,68,0.32)', borderRadius: radius.pill, paddingVertical: 12, paddingHorizontal: 18 }}>
            <Icon name="bell" size={16} color={c.ink} />
            <Text v="small" color={c.ink} style={{ flex: 1 }}>{t('Ödeme sistemimizi güncelliyoruz. Paket satın alma kısa süre içinde açılacak; paketini şimdiden seçebilir ve hesabını açabilirsin.')}</Text>
          </View>
        </Container>
      ) : null}

      <Container style={{ paddingTop: 22, maxWidth: 1040, flexDirection: desktop ? 'row' : 'column', gap: 20, alignItems: 'flex-start' }}>
        {/* Sol: üç numaralı seçim */}
        <View style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', gap: 18 }}>
          <View style={{ ...card, padding: phone ? 20 : 30, gap: 26 }}>
            <Section first n={1} title={t('Mülk sayısı')} aside={t('Sonradan değiştirebilirsin')}>
              <Stepper value={units} min={1} max={max} onChange={setUnits} label={t('Mülk sayısı')} />
              <Text v="small" muted>
                {units >= max ? t('{n} mülk bu paketlerde en fazla. 10 ve üstü mülk için Kurumsal paket:', { n: max }) : t('1-{n} mülk için. 10 ve üstü mülk için Kurumsal paket:', { n: max })}{' '}
                <Text v="small" color={c.accentText} onPress={() => router.push('/kurumsal' as any)} accessibilityRole="link" style={{ fontFamily: fonts.bodyBold, textDecorationLine: 'underline' }}>{t('bize ulaşın')}</Text>
              </Text>
            </Section>
            <Section n={2} title={t('Paket')}>
              <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }} accessibilityRole="radiogroup">
                <Option on={plan === 'tek'} onPress={() => setPlan('tek')} title={planLabel('tek')}
                  lines={[totalText(tek, 1, false) + ' ' + t('/ mülk / ay'), t('Ödeme, arıza ve belge takibi')]} />
                <Option on={plan === 'bes'} onPress={() => setPlan('bes')} title={planLabel('bes')} badge={{ label: t('En çok tercih edilen'), tone: 'warn' }}
                  lines={[totalText(bes, 1, false) + ' ' + t('/ mülk / ay'), t('+ ekip, toplu aktarma, net getiri')]} />
              </View>
            </Section>
            <Section n={3} title={t('Ödeme dönemi')}>
              <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }} accessibilityRole="radiogroup">
                <Option on={!yearly} onPress={() => setYearly(false)} title={t('Aylık')}
                  lines={[totalText(tier, units, false) + ' ' + t('/ ay'), t('İstediğin zaman iptal')]} />
                <Option on={yearly} onPress={() => setYearly(true)} title={t('Yıllık')} badge={{ label: t('2 ay ücretsiz'), tone: 'ok' }}
                  lines={[totalText(tier, units, true) + ' ' + t('/ yıl'), t('Aylık {price}’ye denk · {save} tasarruf', { price: money(yearlyMonthly), save: money(saving) })]} />
              </View>
            </Section>
          </View>
          <View style={{ ...card, padding: phone ? 20 : 30, gap: 12 }}>
            <RNText style={{ fontFamily: fonts.siteBold, fontSize: 20, letterSpacing: -0.4, color: c.ink }}>{t('{plan} paketinde neler var?', { plan: planLabel(plan) })}</RNText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 12 }}>
              {tierPoints(plan).map((x) => (
                <View key={x} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', flexBasis: phone ? '100%' : '46%', flexGrow: 1 }}>
                  <Icon name="check" size={17} color={c.okInk} />
                  <Text v="small" style={{ flex: 1, fontSize: 15, lineHeight: 21 }}>{x}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Sağ: özet, çizelge ve yükseltme önerisi */}
        <View style={{ ...(desktop ? { width: 380 } : { alignSelf: 'stretch' }), gap: 14 }}>
          <View style={{ backgroundColor: c.deepA, borderRadius: 28, padding: phone ? 22 : 28, gap: 14 }}>
            <Text v="label" color={c.heroMuted} style={{ fontSize: 12.5, letterSpacing: 1.2 }}>{t('Özet').toLocaleUpperCase(locale())}</Text>
            <View style={{ gap: 3 }}>
              <RNText style={{ fontFamily: fonts.siteBold, fontSize: 22, letterSpacing: -0.5, color: c.heroInk }}>{planLabel(plan)} · {units === 1 ? t('1 mülk') : t('{n} mülk', { n: units })} · {yearly ? t('yıllık') : t('aylık')}</RNText>
              <Text v="small" color={c.heroMuted}>{units} × {totalText(tier, 1, yearly)} {perUnit}</Text>
            </View>
            <View style={{ height: 1, backgroundColor: 'rgba(250,245,240,0.14)' }} />
            <Text v="label" color={c.heroMuted} style={{ fontSize: 12.5, letterSpacing: 1.2 }}>{t('Bugün ödenecek').toLocaleUpperCase(locale())}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <RNText style={{ fontFamily: fonts.siteBold, fontSize: 56, lineHeight: 58, letterSpacing: -2, color: c.heroInk }}>{money(0)}</RNText>
              <View style={{ backgroundColor: c.okBg, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 }}><RNText style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: c.okInk }}>{t('1 ay ücretsiz')}</RNText></View>
            </View>
            <Text v="small" color={c.heroMuted} style={{ fontSize: 15 }}>
              {firstCharge}{' '}
              <Text v="small" color={c.heroInk} style={{ fontFamily: fonts.siteBold, fontSize: 17 }}>{totalText(tier, units, yearly)}</Text> {per} · {t('KDV dahil')}
            </Text>
            <View style={{ backgroundColor: 'rgba(250,245,240,0.07)', borderRadius: 18, padding: 16, gap: 14 }}>
              {[[true, t('Bugün'), t('Hesabın açılır, tüm özellikler açık')], [true, today == null ? t('Çekimden 1 gün önce') : dateText(29), t('E-posta ve bildirimle hatırlatırız')], [false, today == null ? t('1 ay sonra') : dateText(30), t('İptal etmezsen ilk ödeme alınır')]].map(([f, h, b], i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                  <Dot filled={f as boolean} />
                  <View style={{ flex: 1 }}>
                    <Text v="small" color={c.heroInk} style={{ fontFamily: fonts.bodyXBold, fontSize: 15 }}>{h as string}</Text>
                    <Text v="small" color={c.heroMuted} style={{ fontSize: 14 }}>{b as string}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <Text v="small" color={c.heroMuted}>{t('Abonelik')}:</Text>
              {[t('Kart'), 'App Store', 'Google Play'].map((x) => <View key={x} style={{ borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(250,245,240,0.25)', paddingHorizontal: 10, paddingVertical: 3 }}><RNText style={{ fontFamily: fonts.bodyBold, fontSize: 13, color: c.heroInk }}>{x}</RNText></View>)}
            </View>
            <Button kind="primary" block title={t('1 ay ücretsiz başla') + '  →'} onPress={start} />
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="safe" size={15} color={c.heroMuted} />
              <Text v="small" color={c.heroMuted}>{t('Bugün ödeme yok · İstediğin zaman iptal')}</Text>
            </View>
            {saving > 0 ? <Text v="small" color={c.lemon} style={{ textAlign: 'center', fontFamily: fonts.bodyBold }}>{yearly ? t('Yıllık ödemeyle {save} tasarruf ediyorsun', { save: money(saving) }) : t('Yıllığa geçersen {save} tasarruf edersin', { save: money(saving) })}</Text> : null}
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
          <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[t('Kayıtların silinmez'), t('Kolay iptal'), t('KDV dahil')].map((x) => (
              <View key={x} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Icon name="check" size={15} color={c.okInk} /><Text v="small" muted style={{ fontFamily: fonts.bodyBold }}>{x}</Text></View>
            ))}
          </View>

          {plan === 'tek' ? (
            <View accessibilityRole="summary" style={{ backgroundColor: c.butter, borderRadius: 28, padding: phone ? 20 : 24, gap: 10 }}>
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
      <Container style={{ paddingTop: 26, maxWidth: 1040, alignItems: 'center' }}>
        <Text v="small" muted>{t('Takıldığın yer mi var?')}{' '}<Text v="small" color={c.ink} onPress={() => Linking.openURL('mailto:' + CONFIG.supportEmail)} accessibilityRole="link" style={{ fontFamily: fonts.bodyBold, textDecorationLine: 'underline' }}>{CONFIG.supportEmail}</Text></Text>
      </Container>
    </ScrollView>
  );
}
