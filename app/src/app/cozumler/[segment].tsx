import { View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { t } from '../../domain/i18n';
import { Button, Chip, Container, Text } from '../../ui/kit';
import { fonts, useBreakpoint, useColors } from '../../ui/theme';
import { Icon } from '../../app-ui/blocks';
import { Reveal } from '../../ui/Reveal';
import SitePage from '../../site/SitePage';
import { Display, SectionHead } from '../../site/Landing';
import { BrandBand, Headline, RentCard, SegmentFlow } from '../../site/SegmentParts';
import { SEGMENT_SLUGS, segments } from '../../site/segments';
import { demo } from '../../site/money';

/** Her seçenek için statik sayfa üretilir (arama motorları için). */
// "portfoy": kaldırılan eski sayfa; statik sayfası yalnızca mülk sahibi sayfasına yönlendirir (sunucuda .htaccess de 301 verir).
export function generateStaticParams() { return [...SEGMENT_SLUGS, 'portfoy'].map((segment) => ({ segment })); }

export default function SegmentPage() {
  const { segment } = useLocalSearchParams<{ segment: string }>();
  const router = useRouter();
  const c = useColors();
  const { phone, desktop } = useBreakpoint();
  const s = segments().find((x) => x.slug === segment);
  // Eski "Mülk sahibi · 5 mülk" sayfası tek mülk sahibi sayfasında birleşti.
  if (!s) return <Redirect href={segment === 'portfoy' ? '/cozumler/mulk-sahibi' : '/cozumler'} />;
  const go = (p: string) => router.push(p as any);
  const corp = s.plan === 'kurumsal';
  const cta = corp ? [t('Teklif al'), '/kurumsal?sektor=' + encodeURIComponent(s.role || '') + '#form']
    : s.plan === 'kiraci' ? [t('Kiracı olarak kayıt ol'), '/kayit/kiraci'] : [t('1 ay ücretsiz dene'), '/kayit/mulk-sahibi'];
  const bg = c.accentSoft, fg = c.accentText;
  const amount = s.plan === 'tek' || s.plan === 'kiraci' ? demo('₺28.500', '$950') : s.plan === 'bes' ? demo('₺142.000', '$4,700') : demo('₺2.480.000', '$82,000');
  const label = s.plan === 'tek' || s.plan === 'kiraci' ? t('Bu ayın kirası · son gün 5 Kasım') : t('Bu ay tahsil edilen · tüm portföy');
  const card = (children: any, key?: string) => (
    <View key={key} style={{ flexGrow: 1, flexBasis: phone ? '100%' : 280, backgroundColor: c.surface, borderRadius: 26, borderWidth: 1, borderColor: c.line, padding: phone ? 18 : 24, gap: 10 }}>{children}</View>
  );
  return (
    <SitePage>
      <Container style={{ paddingTop: phone ? 32 : 80, flexDirection: desktop ? 'row' : 'column', gap: phone ? 28 : 56, alignItems: desktop ? 'center' : 'stretch' }}>
        <Reveal style={{ flex: desktop ? 1.15 : undefined, gap: phone ? 12 : 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}><Icon name={s.icon} size={18} color={fg} /></View>
            <Text v="label" color={c.accentText} style={{ fontSize: 13, letterSpacing: 0.4 }}>{s.name} · {s.sub}</Text>
          </View>
          <Headline parts={s.title} size={phone ? 34 : 60} />
          <Text v="body" muted style={{ fontSize: phone ? 16 : 20, lineHeight: phone ? 24 : 30, maxWidth: 600 }}>{s.lead}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
            <Button title={cta[0]} onPress={() => go(cta[1])} />
            {s.plan !== 'kiraci' ? <Button kind="ghost" title={t('Fiyatları gör')} onPress={() => { if (typeof window !== 'undefined') window.location.assign('/#fiyat'); }} /> : null}
          </View>
        </Reveal>
        <Reveal delay={120} style={{ flex: desktop ? 0.85 : undefined }}><RentCard amount={amount} label={label} /></Reveal>
      </Container>

      <Container style={{ paddingTop: phone ? 48 : 112, gap: phone ? 14 : 22 }}>
        <Display size={phone ? 24 : 40}>{t('Bugün yaşanan')}</Display>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {s.pains.map(([a, b], i) => card(<>
            <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: '#F0CFC8', alignItems: 'center', justifyContent: 'center' }}><Text v="small" color="#A8231F" style={{ fontFamily: fonts.bodyXBold }}>{i + 1}</Text></View>
            <Text v="body" style={{ fontFamily: fonts.bodyXBold, fontSize: 17 }}>{a}</Text>
            <Text v="small" muted style={{ fontSize: 15, lineHeight: 22 }}>{b}</Text>
          </>, a))}
        </View>
      </Container>

      <Container style={{ paddingTop: phone ? 40 : 88, gap: phone ? 14 : 22 }}>
        <Display size={phone ? 24 : 40}>{t('anahtar ile')}</Display>
        <View style={{ flexDirection: phone ? 'column' : 'row', gap: 12, alignItems: 'stretch' }}>
          {card(<>
            <View style={{ alignSelf: 'flex-start' }}><Chip tone="ok" label={t('Hazır')} /></View>
            {s.has.map((x) => (
              <View key={x} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 4 }}>
                <View style={{ marginTop: 2 }}><Icon name="check" size={17} color={c.okInk} /></View>
                <Text v="body" style={{ flex: 1, fontSize: 16, lineHeight: 23 }}>{x}</Text>
              </View>
            ))}
          </>)}
          {s.custom ? card(<>
            <View style={{ alignSelf: 'flex-start' }}><Chip tone="warn" label={t('Size özel yapılandırma')} /></View>
            {s.custom.map((x) => (
              <View key={x} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 4 }}>
                <View style={{ marginTop: 2 }}><Icon name="check" size={17} color="#6B4A00" /></View>
                <Text v="body" style={{ flex: 1, fontSize: 16, lineHeight: 23 }}>{x}</Text>
              </View>
            ))}
            <Text v="small" muted style={{ marginTop: 4 }}>{t('Bu başlıklar kurumsal kurulumda ihtiyacınıza göre birlikte yapılandırılır; kapsam ve takvim teklifte netleşir.')}</Text>
          </>) : null}
        </View>
      </Container>

      <Container style={{ paddingTop: phone ? 48 : 112 }}>
        <BrandBand
          title={corp ? t('Portföyünüzü konuşalım.') : s.plan === 'kiraci' ? t('Kiracı hesabı her zaman ücretsiz.') : t('1 ay ücretsiz dene.')}
          body={corp ? t('Kısa formu doldurun; uygun fiyatı ve kurulum planını iki iş günü içinde iletelim.') : t('Kurulum dakikalar sürer; kayıtların hep senin.')}
          action={<Button kind="onDark" title={cta[0]} onPress={() => go(cta[1])} />} />
      </Container>

      <View style={{ paddingTop: phone ? 48 : 104, paddingBottom: phone ? 56 : 120, gap: phone ? 18 : 30 }}>
        <Container><SectionHead compact label={t('Diğer çözümler')} title={t('Seni en iyi ne tanımlar?')} /></Container>
        <View style={{ width: '100%', maxWidth: 1360, alignSelf: 'center' }}><SegmentFlow go={go} except={s.slug} /></View>
      </View>
    </SitePage>
  );
}
