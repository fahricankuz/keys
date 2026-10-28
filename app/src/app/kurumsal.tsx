import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, Text as RNText, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { t } from '../domain/i18n';
import { Button, Container, PressScale, Text } from '../ui/kit';
import { Wordmark } from '../ui/Wordmark';
import { fonts, useBreakpoint, useColors } from '../ui/theme';
import { Icon } from '../app-ui/blocks';
import { EnterpriseForm } from '../site/EnterpriseForm';
import { openPage } from '../site/Navbar';

const INCLUDES: [string, string, string][] = [
  ['grid', 'Sınırsız mülk ve ekip', 'Emlakçı, muhasebeci ve personel rol bazlı yetkiyle; kimin neyi değiştirdiği kayıtlı.'],
  ['chart', 'Aylık ve yıllık rapor e-postası', 'Tahsilat, gider, net gelir ve talepler her ay ve yıl sonunda e-postanıza gelir.'],
  ['box', 'Kurulum ve veri taşıma', 'Mevcut Excel listelerinizi ve sözleşmelerinizi biz aktarırız.'],
  ['chat', 'Öncelikli destek', 'Kurulumdan sonra da tanımlı bir iletişim kişisi ve hızlı yanıt.'],
  ['doc', 'Kuruma özel sözleşme ve fatura', 'Yıllık sözleşme, kurumsal fatura ve ödeme koşulları.'],
  ['key', 'Size özel yapılandırma', 'Sektörünüzün ihtiyacına göre rapor, alan ve iş akışı uyarlaması.']
];
const SECTORS: [string, string][] = [
  ['emlak-ofisi', 'Emlak ofisi'], ['site-yonetimi', 'Site ve bina yönetimi'], ['avm', 'AVM'], ['gyo', 'GYO'],
  ['depo-lojistik', 'Depo ve lojistik'], ['family-office', 'Family office']
];

/** Kurumsal paket: anlatım, sektör sayfalarına sakin bağlantılar ve başvuru formu (ana sayfa → Fiyatlar → Bize ulaşın). */
export default function Kurumsal() {
  const c = useColors();
  const router = useRouter();
  const { phone } = useBreakpoint();
  const params = useLocalSearchParams<{ sektor?: string }>();
  // Statik derlemede parametre ilk çizimde gelmeyebilir; web'de adres çubuğundan da okunur.
  const [sektor, setSektor] = useState(params.sektor ? String(params.sektor) : '');
  useEffect(() => {
    const q = Platform.OS === 'web' && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('sektor') : null;
    if (q || params.sektor) setSektor(String(q || params.sektor));
  }, [params.sektor]);
  const scroll = useRef<any>(null);
  const formY = useRef(0);
  // Sektör sayfasından "Teklif al" ile gelindiyse (#form) doğrudan forma kaydırılır.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location.hash === '#form')
      setTimeout(() => scroll.current?.scrollTo({ y: formY.current - 20, animated: true }), 350);
  }, []);
  const big = (size: number, color = c.ink) => ({ fontFamily: fonts.siteBold, fontSize: size, lineHeight: Math.round(size * 1.06), letterSpacing: -size * 0.03, color });
  return (
    <ScrollView ref={scroll} style={{ flex: 1, backgroundColor: c.cream }} contentContainerStyle={{ paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
      <Container style={{ paddingTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <PressScale onPress={() => router.replace('/')} accessibilityRole="link" accessibilityLabel={t('Ana sayfa')}><Wordmark size={phone ? 22 : 28} /></PressScale>
        <Button kind="ghost" title={t('Giriş yap')} onPress={() => router.push('/giris')} style={{ minHeight: 42, paddingHorizontal: 18 }} />
      </Container>

      <Container style={{ paddingTop: phone ? 36 : 72, gap: 14, maxWidth: 900 }}>
        <Text v="label" color={c.accentText} style={{ fontSize: 13, letterSpacing: 0.4 }}>{t('Kurumsal paket')}</Text>
        <RNText style={big(phone ? 34 : 64)}>{t('Büyük portföyler için kira yönetimi.')}</RNText>
        <Text v="body" muted style={{ fontSize: phone ? 16 : 20, lineHeight: phone ? 24 : 30, maxWidth: 680 }}>
          {t('Sınırsız mülk ve ekip, düzenli raporlar ve kuruluşunuza göre uyarlanan bir kurulum. Fiyat, portföyünüzün büyüklüğüne ve ihtiyaçlarınıza göre belirlenir.')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
          <Button title={t('Teklif al')} onPress={() => scroll.current?.scrollTo({ y: formY.current - 20, animated: true })} />
        </View>
      </Container>

      <Container style={{ paddingTop: phone ? 36 : 64 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
          {INCLUDES.map(([icon, title, body]) => (
            <View key={title} style={{ flexGrow: 1, flexBasis: phone ? '100%' : 300, backgroundColor: c.surface, borderRadius: 24, borderWidth: 1, borderColor: c.line, padding: 22, gap: 10 }}>
              <View style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} color={c.accent} /></View>
              <Text v="body" style={{ fontFamily: fonts.bodyXBold, fontSize: 17 }}>{t(title)}</Text>
              <Text v="small" muted style={{ fontSize: 15, lineHeight: 22 }}>{t(body)}</Text>
            </View>
          ))}
        </View>
      </Container>

      <Container style={{ paddingTop: phone ? 36 : 64, gap: 10, maxWidth: 900 }}>
        <RNText style={big(phone ? 24 : 34)}>{t('Sektörünüze göre özelleştirme')}</RNText>
        <Text v="body" muted style={{ fontSize: phone ? 15.5 : 17, lineHeight: phone ? 23 : 26 }}>
          {t('Emlak ofisinden AVM’ye, GYO’dan depo ve lojistiğe kadar her portföyün ihtiyacı farklı. Kurumsal kurulumda rapor, alan ve iş akışlarını sektörünüze göre birlikte yapılandırıyoruz.')}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 }}>
          {SECTORS.map(([slug, name], i) => (
            <View key={slug} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {i ? <Text v="small" muted>·</Text> : null}
              <PressScale onPress={() => openPage('kurumsal/' + slug)} accessibilityRole="link" style={{ paddingVertical: 4 }}>
                <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyBold, fontSize: 15 }}>{t(name)}</Text>
              </PressScale>
            </View>
          ))}
        </View>
      </Container>

      <View nativeID="form" onLayout={(e) => { formY.current = e.nativeEvent.layout.y; }}>
      <Container style={{ paddingTop: phone ? 40 : 72 }}>
        <View
          style={{ backgroundColor: c.surface, borderRadius: phone ? 26 : 34, borderWidth: 1, borderColor: c.line, padding: phone ? 20 : 40, gap: 18, maxWidth: 820, width: '100%', alignSelf: 'center' }}>
          <View style={{ gap: 6 }}>
            <RNText style={big(phone ? 26 : 36)}>{t('Teklif al')}</RNText>
            <Text v="body" muted>{t('Portföyünü kısaca anlat; sana uygun fiyatı ve kurulum planını iki iş günü içinde iletelim.')}</Text>
          </View>
          <EnterpriseForm role={sektor} />
        </View>
      </Container>
      </View>
    </ScrollView>
  );
}
