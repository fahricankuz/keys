/* Tanıtım sitesi (ana sayfa). Bölümler: başlık + telefon, dönen sözcük, manifesto, özellikler (sekmeli),
   nasıl çalışır, fiyatlar, sıkça sorulanlar, iletişim, alt bilgi. */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { Easing, FadeIn, FadeInDown, FadeOutUp, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { t, getLang, setLang } from '../domain/i18n';
import { CONFIG } from '../domain/config';
import { Button, Chip, Container, PressScale, Text } from '../ui/kit';
import { Wordmark } from '../ui/Wordmark';
import { fonts, radius, shadows, useBreakpoint, useColors } from '../ui/theme';
import { Slam } from '../ui/motion';
import { Reveal } from '../ui/Reveal';
import { useHeroCards } from './HeroCards';
import { Icon, Steps } from '../app-ui/blocks';
import { useLangTick } from '../app-ui/hooks';
import { categories, faq, plans } from './content';
import { Nav, TopBar } from './Navbar';

const EASE = 'cubic-bezier(0.32,0.72,0,1)';
const site = (path: string) => CONFIG.publicUrl.replace(/\/?$/, '/') + path;

/** Büyük başlık yazısı. */
function Display({ children, size, color, style, center }: { children: ReactNode; size: number; color?: string; style?: any; center?: boolean }) {
  const c = useColors();
  return (
    <RNText style={[{ fontFamily: fonts.siteBold, fontSize: size, lineHeight: Math.round(size * 1.04), letterSpacing: -size * (size > 40 ? 0.035 : 0.02), color: color ?? c.ink, textAlign: center ? 'center' : undefined }, style]}>
      {children}
    </RNText>
  );
}

function SectionHead({ label, title, body, onDark, compact }: { label?: string; title: string; body?: string; onDark?: boolean; compact?: boolean }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  return (
    <Reveal style={{ alignItems: 'center', gap: phone || compact ? 10 : 14, maxWidth: compact ? 1140 : 820, alignSelf: 'center' }}>
      {label ? <Text v="label" color={onDark ? c.butter : c.accentText} style={{ fontSize: 13, letterSpacing: 0.4 }}>{label}</Text> : null}
      <Display size={phone ? 30 : compact ? 44 : 64} center color={onDark ? c.heroInk : undefined}>{title}</Display>
      {body ? <Text v="body" color={onDark ? c.heroMuted : c.muted} style={{ fontSize: phone ? 16 : compact ? 18 : 21, lineHeight: phone ? 23 : compact ? 26 : 30, textAlign: 'center', maxWidth: compact ? 760 : 640 }}>{body}</Text> : null}
    </Reveal>
  );
}

function Pill({ children, bg, size }: { children: ReactNode; bg: string; size: number }) {
  return (
    <View style={{ height: size, borderRadius: size / 2, paddingHorizontal: size * 0.34, backgroundColor: bg, flexDirection: 'row', alignItems: 'center', gap: size * 0.18, alignSelf: 'center', marginVertical: 2 }}>
      {children}
    </View>
  );
}

/* ---------------- telefon ---------------- */

/** iPhone oranında (yaklaşık 9:19,5) telefon: durum çubuğu, ada, ödeme kartı, son işlemler ve sekme çubuğu. */
function PhoneMock({ w }: { w: number }) {
  const c = useColors();
  const h = Math.round(w * 2.06);
  const r = w * 0.15, bezel = w * 0.032;
  const u = w / 300;
  const rows: [string, string, string, 'ok' | 'warn' | 'neutral'][] = [
    ['card', t('Ekim kirası'), t('Ödendi'), 'ok'],
    ['wrench', t('Kombi bakımı'), t('İşlemde'), 'warn'],
    ['doc', t('DASK poliçesi'), t('52 gün'), 'neutral'],
    ['calendar', t('Sözleşme yenileme'), t('69 gün'), 'neutral']
  ];
  return (
    <View accessibilityRole="image" accessibilityLabel={t('anahtar uygulamasında ödemeler ekranı')}
      style={{ width: w, height: h, padding: bezel, borderRadius: r, backgroundColor: c.deepA, boxShadow: shadows.lift }}>
      <View style={{ flex: 1, borderRadius: r - bezel, backgroundColor: c.bg, overflow: 'hidden' }}>
        {/* durum çubuğu ve ada */}
        <View style={{ height: 44 * u, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 * u }}>
          <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 12 * u, color: c.ink }}>9:41</RNText>
          <View style={{ width: 84 * u, height: 24 * u, borderRadius: 12 * u, backgroundColor: c.deepA }} />
          <View style={{ flexDirection: 'row', gap: 3 * u, alignItems: 'center' }}>
            {[5, 7, 9, 11].map((x) => <View key={x} style={{ width: 3 * u, height: x * u, borderRadius: 1, backgroundColor: c.ink }} />)}
            <View style={{ width: 20 * u, height: 10 * u, borderRadius: 3 * u, borderWidth: 1.2, borderColor: c.ink, marginLeft: 3 * u, padding: 1 }}><View style={{ flex: 1, width: '75%', backgroundColor: c.ink, borderRadius: 1.5 }} /></View>
          </View>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 16 * u, paddingTop: 6 * u, gap: 12 * u }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View>
              <RNText style={{ fontFamily: fonts.body, fontSize: 11 * u, color: c.muted }}>{t('Merhaba Ayşe')}</RNText>
              <RNText style={{ fontFamily: fonts.siteBold, fontSize: 21 * u, color: c.ink, letterSpacing: -0.4 }}>{t('Ödemeler')}</RNText>
            </View>
            <View style={{ width: 34 * u, height: 34 * u, borderRadius: 17 * u, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name="bell" size={Math.round(16 * u)} /></View>
          </View>
          <View style={{ backgroundColor: c.deepA, borderRadius: 22 * u, padding: 16 * u, gap: 9 * u }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <RNText style={{ fontFamily: fonts.body, fontSize: Math.max(11, 12 * u), color: c.heroMuted }}>{t('Bu ayın kirası')}</RNText>
              <View style={{ backgroundColor: c.butter, borderRadius: radius.pill, paddingHorizontal: 9 * u, paddingVertical: 3 * u }}>
                <RNText style={{ fontFamily: fonts.bodyBold, fontSize: Math.max(10, 10 * u), color: '#1D1A19' }}>{t('3 gün kaldı')}</RNText>
              </View>
            </View>
            <RNText style={{ fontFamily: fonts.display, fontSize: 40 * u, lineHeight: 44 * u, color: c.heroInk, letterSpacing: -1.2 * u, fontVariant: ['tabular-nums'] }}>₺28.500</RNText>
            <View style={{ flexDirection: 'row', gap: 3.5 * u }}>
              {Array.from({ length: 12 }).map((_, i) => (
                <View key={i} style={{ flex: 1, height: 10 * u, borderRadius: 3.5 * u, backgroundColor: i < 7 ? c.butter : 'rgba(250,245,240,0.16)', borderWidth: i === 7 ? 1.5 : 0, borderColor: c.accent }} />
              ))}
            </View>
            <View style={{ backgroundColor: c.accent, borderRadius: radius.pill, minHeight: 40 * u, alignItems: 'center', justifyContent: 'center', marginTop: 4 * u }}>
              <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 13 * u, color: c.accentInk }}>{t('Dekont yükle')}</RNText>
            </View>
          </View>
          <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 13 * u, color: c.ink }}>{t('Yaklaşan işler')}</RNText>
          <View style={{ backgroundColor: c.surface, borderRadius: 18 * u, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12 * u }}>
            {rows.map(([icon, title, chip, tone], i) => (
              <View key={title} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 * u, paddingVertical: 10 * u, borderTopWidth: i ? 1 : 0, borderTopColor: c.line6 }}>
                <View style={{ width: 30 * u, height: 30 * u, borderRadius: 10 * u, backgroundColor: c.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={Math.round(15 * u)} /></View>
                <RNText numberOfLines={1} style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 12 * u, color: c.ink }}>{title}</RNText>
                <Chip tone={tone} label={chip} />
              </View>
            ))}
          </View>
        </View>
        {/* sekme çubuğu ve ana ekran çizgisi */}
        <View style={{ borderTopWidth: 1, borderTopColor: c.line6, backgroundColor: c.surface, paddingTop: 10 * u, paddingBottom: 8 * u, gap: 10 * u }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
            {[['home', t('Panel')], ['card', t('Ödemeler')], ['wrench', t('Talepler')], ['chat', t('Mesajlar')]].map(([icon, label], i) => (
              <View key={icon} style={{ alignItems: 'center', gap: 3 * u }}>
                <Icon name={icon} size={Math.round(18 * u)} color={i === 1 ? c.accent : c.muted} />
                <RNText style={{ fontFamily: i === 1 ? fonts.bodyBold : fonts.body, fontSize: 9.5 * u, color: i === 1 ? c.accent : c.muted }}>{label}</RNText>
              </View>
            ))}
          </View>
          <View style={{ alignSelf: 'center', width: 110 * u, height: 4.5 * u, borderRadius: 3, backgroundColor: c.ink }} />
        </View>
      </View>
    </View>
  );
}

/* ---------------- başlık ---------------- */

function Hero({ go, scrollTo }: { go: (p: string) => void; scrollTo: (k: string) => void }) {
  const c = useColors();
  const { phone, width } = useBreakpoint();
  const wide = width >= 1100;
  const size = phone ? 46 : wide ? 88 : 76;
  const pill = Math.round(size * 0.7);
  const cards = useHeroCards(wide ? 248 : 232);
  const device = <PhoneMock w={phone ? 270 : 300} />;
  return (
    <Container style={{ paddingTop: phone ? 40 : 72, alignItems: 'center' }}>
      <View style={{ alignItems: 'center', gap: phone ? 18 : 24 }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: size * 0.12 }}>
            <Slam delay={80} height={Math.round(size * 1.1)}><Display size={size}>{t('Kira işinin')}</Display></Slam>
            <Reveal delay={420} y={12}>
              <Pill bg={c.tile} size={pill}>
                <View style={{ width: pill * 0.4, height: pill * 0.4, borderRadius: pill * 0.1, backgroundColor: c.lemon }} />
                <RNText style={{ fontFamily: fonts.bodyBold, fontSize: pill * 0.4, color: c.ink }}>{t('Ödendi')}</RNText>
              </Pill>
            </Reveal>
          </View>
          <Slam delay={220} height={Math.round(size * 1.1)}><Display size={size} color={c.accent}>{t('anahtarı.')}</Display></Slam>
        </View>
        <Reveal delay={260} style={{ alignItems: 'center', gap: 22, maxWidth: 640 }}>
          <Text v="body" style={{ fontSize: phone ? 18 : 23, lineHeight: phone ? 27 : 32, textAlign: 'center' }} color={c.muted}>
            {t('Sözleşme, ödeme, depozito ve arıza yazışması tek uygulamada. Kiracı ve mülk sahibi aynı kayda iki taraftan bakar.')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button kind="primary" title={t('1 ay ücretsiz dene')} onPress={() => go('/kayit')} />
            <Button kind="ghost" title={t('Fiyatları gör')} onPress={() => scrollTo('fiyat')} />
          </View>
          <Text v="small" muted style={{ textAlign: 'center', fontSize: 14 }}>{[t('1 ay ücretsiz deneme'), t('Konut, ofis, mağaza, depo')].join(' · ')}</Text>
        </Reveal>
      </View>
      <Reveal delay={380} y={56} style={{ marginTop: phone ? 28 : 56, width: '100%', alignItems: 'center' }}>
        {wide ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 44, paddingTop: 12, paddingBottom: 24 }}>
            <View style={{ gap: 26, marginTop: 70 }}>{cards('l1').odeme}{cards('l2').yazisma}</View>
            {device}
            <View style={{ gap: 26, marginTop: 130 }}>{cards('r1').talep}{cards('r2').depozito}</View>
          </View>
        ) : (
          <View style={{ width: '100%', alignItems: 'center', gap: 28 }}>
            <View style={{ paddingTop: 12 }}>{device}</View>
            {/* Telefonda iki kart yeter: sayfa gereksiz uzamasın. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>{phone ? [cards('a').odeme, cards('b').talep] : [cards('a').odeme, cards('b').talep, cards('c').yazisma, cards('d').depozito]}</View>
          </View>
        )}
      </Reveal>
    </Container>
  );
}

/** Koyu bant: kiranın işlerini sırayla değiştiren büyük sözcük. */
function Rotator({ go, scrollTo }: { go: (p: string) => void; scrollTo: (k: string) => void }) {
  const { phone } = useBreakpoint();
  const c = useColors();
  const words = [t('Ödemeler'), t('Talepler'), t('Belgeler'), t('Tutanak'), t('Depozito'), t('Giderler'), t('Yenileme')];
  const [i, setI] = useState(0);
  useEffect(() => { const id = setInterval(() => setI((x) => (x + 1) % words.length), 1900); return () => clearInterval(id); }, [words.length]);
  const size = phone ? 56 : 128;
  return (
    <View style={{ backgroundColor: c.deepA }}>
      <Container style={{ paddingVertical: phone ? 48 : 120, alignItems: 'center' }}>
        <Reveal style={{ alignItems: 'center', gap: phone ? 8 : 14 }}>
          <Text v="label" color={c.butter} style={{ fontSize: 13, letterSpacing: 0.4 }}>{t('Tek yerde')}</Text>
          <View style={{ height: size * 1.14, justifyContent: 'center', alignItems: 'center', minWidth: 280 }}>
            <Animated.View key={words[i]} entering={FadeInDown.springify().damping(20).stiffness(160)} exiting={FadeOutUp.duration(160)} style={{ position: 'absolute' }}>
              <Display size={size} color={c.heroInk} center>{words[i]}</Display>
            </Animated.View>
          </View>
          <Text v="body" color={c.heroMuted} style={{ maxWidth: 560, fontSize: phone ? 18 : 23, lineHeight: phone ? 27 : 32, textAlign: 'center' }}>{t('Kiranın tüm işi, ödemeden çıkışa.')}</Text>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 14 }}>
            <Button kind="primary" title={t('Ücretsiz başla')} onPress={() => go('/kayit')} />
            <Button kind="onDark" title={t('Keşfet')} onPress={() => scrollTo('ozellikler')} />
          </View>
        </Reveal>
      </Container>
    </View>
  );
}

function Manifesto() {
  const c = useColors();
  const { phone } = useBreakpoint();
  const lines = [
    t('Kira ödendi mi? İki taraf da aynı anda görür.'),
    t('Arıza bildirilir, çözülene kadar takip edilir.'),
    t('Sözleşme, dekont ve tutanak tek yerde durur.'),
    t('Konuşulanlar kaybolmaz, kayıtta kalır.')
  ];
  return (
    <Container style={{ paddingTop: phone ? 56 : 128, alignItems: 'center' }}>
      <View style={{ gap: phone ? 10 : 14, alignItems: 'center', maxWidth: 980 }}>
        <Reveal><Text v="label" color={c.accentText} style={{ fontSize: 13, letterSpacing: 0.4, marginBottom: 6 }}>{t('Neden anahtar?')}</Text></Reveal>
        {lines.map((l, i) => <Reveal key={l} delay={i * 70}><Display size={phone ? 24 : 46} center color={i === 0 ? c.accent : c.ink}>{l}</Display></Reveal>)}
      </View>
    </Container>
  );
}

/* ---------------- özellikler (sekmeli) ---------------- */

/** Kategori görselleri için çerçeve. */
function Frame({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.line6, borderRadius: 28, padding: 6 }}>
      <View style={{ backgroundColor: c.surface, borderRadius: 22, padding: 16, gap: 10 }}>{children}</View>
    </View>
  );
}
function Line({ a, b, tone, strong }: { a: string; b: string; tone?: 'ok' | 'warn' | 'bad' | 'neutral'; strong?: boolean }) {
  const c = useColors();
  return (
    <View style={{ backgroundColor: c.bg, borderRadius: radius.pill, paddingHorizontal: 18, minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <Text v="small" style={{ fontFamily: fonts.bodyXBold, flexShrink: 1 }}>{a}</Text>
      {tone ? <View><Chip tone={tone} label={b} /></View> : <Text v="small" color={strong ? c.okInk : undefined} style={{ fontFamily: fonts.bodyXBold, fontVariant: ['tabular-nums'] }}>{b}</Text>}
    </View>
  );
}

function FeatureVisual({ id }: { id: string }) {
  const c = useColors();
  switch (id) {
    case 'odeme': return <Frame><Line a={t('Kasım 2026')} b={t('Ödendi')} tone="ok" /><Line a={t('Ekim 2026')} b={t('Ödendi')} tone="ok" /><Line a={t('Eylül 2026')} b={t('Kısmi ödeme')} tone="warn" /></Frame>;
    case 'talep': return (
      <Frame>
        <Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{t('Kombi basıncı düşüyor')}</Text>
        <Steps status={2} labels={[t('Açıldı'), t('Görüldü'), t('İşlemde'), t('Çözüldü')]} />
        <Line a={t('Usta teklifi')} b="₺1.850" />
        <Line a={t('Fatura')} b={t('Gidere işlendi')} tone="ok" />
      </Frame>
    );
    case 'yazisma': return (
      <Frame>
        <View style={{ alignSelf: 'flex-start', backgroundColor: c.bg, borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 14, paddingVertical: 10 }}><Text v="small">{t('Dekontu yükledim')}</Text></View>
        <View style={{ alignSelf: 'flex-end', backgroundColor: c.ink, borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 14, paddingVertical: 10 }}><Text v="small" color={c.bg}>{t('Onayladım, teşekkürler')}</Text></View>
        <Line a="sozlesme.pdf" b={t('Onaylandı')} tone="ok" />
        <Line a="dask-police.pdf" b={t('İncelemede')} tone="warn" />
      </Frame>
    );
    case 'cikis': return <Frame><Line a={t('Depozito')} b="₺65.000" /><Line a={t('Kesintiler')} b="− ₺4.200" /><Line a={t('İade edilecek')} b="₺60.800" strong /></Frame>;
    case 'yenileme': return (
      <Frame>
        <View style={{ backgroundColor: c.bg, borderRadius: radius.pill, paddingHorizontal: 18, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: c.accent }} />
          <RNText style={{ fontFamily: fonts.siteBold, fontSize: 17, color: c.accentText, letterSpacing: -0.3, flexShrink: 1 }}>{t('Yasal üst sınır: TÜFE')}</RNText>
        </View>
        <Line a={t('Mevcut kira')} b="₺30.000" />
        <Line a={t('Yeni kira')} b="₺39.900" strong />
      </Frame>
    );
    case 'rapor': return (
      <Frame>
        {[[t('Moda 3+1'), 0.86, '₺312.400'], [t('Levent ofis'), 0.64, '₺238.000'], [t('Bağdat Cd. mağaza'), 0.42, '₺151.900']].map(([n, p, v]) => (
          <View key={n as string} style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text v="small" style={{ fontFamily: fonts.bodyBold }}>{n}</Text><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{v}</Text></View>
            <View style={{ height: 10, borderRadius: 5, backgroundColor: c.surface2 }}><View style={{ width: ((p as number) * 100 + '%') as any, height: 10, borderRadius: 5, backgroundColor: c.accent }} /></View>
          </View>
        ))}
        <Muted>{t('Yıllık net getiri')}</Muted>
      </Frame>
    );
    default: return (
      <Frame>
        {[['AK', t('Ayşe Kaya'), t('Emlakçı')], ['MY', t('Mert Yıldız'), t('Muhasebeci')], ['SD', t('Selin Demir'), t('Personel')]].map(([ab, n, r]) => (
          <View key={ab} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.bg, borderRadius: radius.pill, padding: 8, paddingRight: 14 }}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Text v="small" style={{ fontFamily: fonts.bodyXBold }}>{ab}</Text></View>
            <Text v="small" style={{ flex: 1, fontFamily: fonts.bodyBold }}>{n}</Text>
            <Chip tone="accent" label={r} />
          </View>
        ))}
      </Frame>
    );
  }
}
const Muted = ({ children }: { children: ReactNode }) => <Text v="small" muted>{children}</Text>;

/** Özellikler: kategori sekmeleri ve seçili kategorinin dört maddesi + görseli. Menüden gelince ilgili sekme açılır. */
function Features({ active, setActive, anchor, go }: { active: string; setActive: (id: string) => void; anchor: (el: any) => void; go: (p: string) => void }) {
  const c = useColors();
  const { desktop, phone, width } = useBreakpoint();
  const cats = categories();
  const cur = cats.find((x) => x.id === active) || cats[0];
  // Masaüstünde sekmeler tek satıra sığıyorsa tek satır, sığmıyorsa dengeli iki satır (ör. 4 + 3) olur.
  const tabW = (title: string) => 28 + 17 + 8 + title.length * 8.6 + 2;
  const avail = Math.min(width, 1200) - 32;
  const oneRow = cats.reduce((a, x) => a + tabW(x.title) + 8, 0) <= avail;
  const half = Math.ceil(cats.length / 2);
  const tabRows = oneRow ? [cats] : [cats.slice(0, half), cats.slice(half)];
  const tab = (cat: (typeof cats)[number]) => {
    const on = cat.id === cur.id;
    return (
      <PressScale key={cat.id} onPress={() => setActive(cat.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} scaleTo={0.97}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, minHeight: 44, borderRadius: radius.pill, backgroundColor: on ? c.ink : c.surface, borderWidth: 1, borderColor: on ? c.ink : c.line }}>
        <Icon name={cat.icon} size={17} color={on ? c.bg : c.ink} />
        <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: on ? c.bg : c.ink }}>{cat.title}</RNText>
      </PressScale>
    );
  };
  return (
    <View ref={anchor}>
      <Container style={{ paddingTop: phone ? 56 : 128, gap: phone ? 20 : 40 }}>
        <SectionHead label={t('Özellikler')} title={t('Kiranın tüm işi, ödemeden çıkışa.')} body={t('Bir konu seç; o konudaki her şeyi tek bakışta gör.')} />
        <Reveal>
          {desktop ? (
            <View accessibilityRole="tablist" style={{ gap: 8, alignItems: 'center' }}>
              {tabRows.map((row, r) => <View key={r} style={{ flexDirection: 'row', gap: 8, justifyContent: 'center' }}>{row.map(tab)}</View>)}
            </View>
          ) : (
            /* Telefonda ve tablette sekmeler yatay kaydırılır. */
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }} accessibilityRole="tablist">
              {cats.map(tab)}
            </ScrollView>
          )}
        </Reveal>
        <Animated.View key={cur.id} entering={FadeIn.duration(260)}
          style={{ flexDirection: desktop ? 'row' : 'column', gap: desktop ? 48 : 22, backgroundColor: c.tile, borderRadius: phone ? 24 : 32, padding: phone ? 18 : 44, alignItems: desktop ? 'center' : 'stretch' }}>
          <View style={{ flex: 1, gap: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={cur.icon} size={22} color={c.accentText} /></View>
              <Display size={phone ? 28 : 38}>{cur.title}</Display>
            </View>
            <Text v="body" muted style={{ fontSize: phone ? 16 : 18, lineHeight: phone ? 24 : 27 }}>{cur.lead}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: phone ? 12 : 16, columnGap: 20 }}>
              {cur.items.map((it) => (
                <View key={it.title} style={{ width: phone ? '100%' : '46%', flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <View style={{ marginTop: 2 }}><Icon name="check" size={18} color={c.okInk} /></View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text v="small" style={{ fontFamily: fonts.bodyXBold, fontSize: 15 }}>{it.title}</Text>
                    <Text v="small" muted>{it.body}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
              <Button kind="primary" title={t('1 ay ücretsiz dene')} onPress={() => go('/kayit')} />
            </View>
          </View>
          <View style={{ flex: desktop ? 0.9 : undefined, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            <FeatureVisual id={cur.id} />
          </View>
        </Animated.View>
      </Container>
    </View>
  );
}

/* ---------------- nasıl çalışır ---------------- */

function HowItWorks({ go, anchor }: { go: (p: string) => void; anchor: (el: any) => void }) {
  const c = useColors();
  const { desktop, phone } = useBreakpoint();
  const [who, setWho] = useState<'landlord' | 'tenant'>('landlord');
  const steps: Record<string, [string, string, string][]> = {
    landlord: [
      ['key', t('Hesabını aç'), t('1 ay ücretsiz deneme hemen başlar. Deneme süresince 5 mülke kadar ekleyebilirsin.')],
      ['home', t('Mülklerini ekle'), t('Tek tek ekle ya da Excel listeni yükle. Kira, ödeme günü ve sözleşme tarihleri bir kez girilir.')],
      ['send', t('Kiracını davet et'), t('Her mülk için bir davet kodu oluşur. Kodu WhatsApp ile gönder; kiracın katılınca mülke bağlanır.')],
      ['check', t('Birlikte takip edin'), t('Dekont onayı, talepler, belgeler ve hatırlatmalar tek ekranda. Ekibini de davet edebilirsin.')]
    ],
    tenant: [
      ['chat', t('Davet kodunu al'), t('Ev sahibin mülkü anahtar’a ekleyince sana bir davet kodu ya da bağlantı gönderir.')],
      ['key', t('Ücretsiz hesap aç'), t('Kayıt olurken kodu gir. Kodun henüz yoksa sonra da girebilirsin.')],
      ['card', t('Kiranı ve talebini takip et'), t('Dekontunu yükle, arıza bildir, belgelerine bak. Her adım iki tarafta aynı görünür.')],
      ['bell', t('Hatırlatma al'), t('Kira günü, sözleşme yenileme ve tutanak onayı için zamanında haber alırsın.')]
    ]
  };
  const list = steps[who];
  const cta = who === 'landlord' ? [t('1 ay ücretsiz dene'), '/kayit/mulk-sahibi'] : [t('Kiracı olarak kayıt ol'), '/kayit/kiraci'];
  return (
    <View ref={anchor} style={{ backgroundColor: c.tile, marginTop: phone ? 56 : 128 }}>
      <Container style={{ paddingVertical: phone ? 48 : 112, gap: phone ? 20 : 40 }}>
        <SectionHead label={t('Nasıl çalışır')} title={t('Dört adımda başla.')} />
        <Reveal style={{ alignSelf: 'center', flexDirection: 'row', backgroundColor: c.surface, borderRadius: radius.pill, padding: 5, borderWidth: 1, borderColor: c.line }}>
          {([['landlord', t('Mülk sahibiyim')], ['tenant', t('Kiracıyım')]] as const).map(([k, label]) => {
            const on = who === k;
            return (
              <PressScale key={k} onPress={() => setWho(k)} accessibilityRole="tab" accessibilityState={{ selected: on }} scaleTo={0.97}
                style={{ paddingHorizontal: phone ? 18 : 26, minHeight: 44, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: on ? c.ink : 'transparent' }}>
                <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: on ? c.bg : c.ink }}>{label}</RNText>
              </PressScale>
            );
          })}
        </Reveal>
        <Animated.View key={who} entering={FadeIn.duration(260)} style={{ flexDirection: desktop ? 'row' : 'column', gap: desktop ? 0 : 0 }}>
          {list.map(([icon, title, body], i) => {
            const last = i === list.length - 1;
            return (
              <View key={title} style={{ flex: 1, flexDirection: desktop ? 'column' : 'row', gap: desktop ? 18 : 16 }}>
                {/* numara ve bağlantı çizgisi */}
                <View style={{ flexDirection: desktop ? 'row' : 'column', alignItems: 'center' }}>
                  <View style={{ width: phone ? 42 : 52, height: phone ? 42 : 52, borderRadius: 26, backgroundColor: i === 0 ? c.accent : c.surface, borderWidth: 2, borderColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <RNText style={{ fontFamily: fonts.siteBold, fontSize: 20, color: i === 0 ? c.accentInk : c.accent }}>{i + 1}</RNText>
                  </View>
                  {!last ? <View style={desktop ? { flex: 1, height: 2, backgroundColor: c.line, marginHorizontal: 10 } : { width: 2, flex: 1, minHeight: 16, backgroundColor: c.line, marginVertical: 6 }} /> : null}
                </View>
                <View style={{ flex: 1, gap: 6, paddingRight: desktop ? 28 : 0, paddingBottom: desktop || last ? 0 : 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name={icon} size={18} color={c.accentText} />
                    <Display size={phone ? 21 : 23}>{title}</Display>
                  </View>
                  <Text v="body" muted style={{ fontSize: phone ? 15 : 16, lineHeight: phone ? 22 : 24 }}>{body}</Text>
                </View>
              </View>
            );
          })}
        </Animated.View>
        <Reveal style={{ alignItems: 'center', gap: 14 }}>
          <View style={{ alignSelf: 'center' }}><Button kind="primary" title={cta[0]} onPress={() => go(cta[1])} /></View>
          <Text v="small" muted style={{ textAlign: 'center', maxWidth: 560 }}>{t('Yüklenen dekont, belge ve faturalar anahtar ekibince kontrol edilir; onaylanınca karşı tarafa görünür.')}</Text>
        </Reveal>
      </Container>
    </View>
  );
}

/* ---------------- fiyatlar ---------------- */

/** Fiyat kartı: önde paket, fiyat ve düğme; arkada paketin özellikleri. Masaüstünde üzerine gelince,
    telefonda dokununca döner. Düğme iki yüzde de vardır, kart dönükken de tıklanır. */
function PlanCard({ p, w, go }: { p: any; w?: number; go: (path: string) => void }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const dark = p.best;
  const [back, setBack] = useState(false);
  const turn = useSharedValue(0);
  useEffect(() => { turn.value = withTiming(back ? 180 : 0, { duration: 520, easing: Easing.bezier(0.32, 0.72, 0, 1) }); }, [back]);
  const front = useAnimatedStyle(() => ({ transform: [{ perspective: 1200 }, { rotateY: turn.value + 'deg' }] }));
  const rear = useAnimatedStyle(() => ({ transform: [{ perspective: 1200 }, { rotateY: turn.value + 180 + 'deg' }] }));
  const ink = dark ? c.heroInk : c.ink, soft = dark ? c.heroMuted : c.muted;
  const face: any = {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 24, padding: phone ? 20 : 26, gap: 10,
    backgroundColor: dark ? c.deepA : c.surface, borderWidth: dark ? 0 : 1, borderColor: c.line, backfaceVisibility: 'hidden', overflow: 'hidden'
  };
  const cta = p.id === 'kurumsal'
    ? <Button kind="primary" block title={t('Bize ulaşın')} onPress={() => Linking.openURL('mailto:' + CONFIG.supportEmail + '?subject=' + encodeURIComponent(t('Kurumsal paket'))).catch(() => {})} />
    : <Button kind="primary" block title={t('1 ay ücretsiz dene')} onPress={() => go('/kayit/mulk-sahibi')} />;
  const head = (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text v="label" color={soft} style={{ fontSize: 13 }}>{p.units}</Text>
        <Display size={26} color={ink}>{p.name}</Display>
      </View>
      {dark ? <Chip tone="warn" label={t('En çok tercih edilen')} /> : null}
    </View>
  );
  return (
    // Dış yüzey düğme rolü almaz (içindeki düğmeler erişilebilir kalsın); iki yüz de ekran okuyucuya açıktır.
    <Pressable onPress={() => setBack((x) => !x)} onHoverIn={() => setBack(true)} onHoverOut={() => setBack(false)} focusable={false}
      style={[{ height: phone ? 372 : 360 }, w ? { width: w } : { flex: 1 }]}>
      <Animated.View style={[face, front]} pointerEvents={back ? 'none' : 'auto'}>
        {head}
        <View style={{ gap: 2, marginTop: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <Display size={p.per ? 40 : 30} color={ink}>{p.price}</Display>
            {p.per ? <Text v="small" color={soft}>{p.per}</Text> : null}
          </View>
          {p.monthlyEq ? <Text v="small" color={soft}>{t('aylık {price}’ye denk gelir', { price: p.monthlyEq })}</Text> : null}
        </View>
        <Text v="small" color={dark ? c.butter : c.accentText} style={{ fontFamily: fonts.bodyBold }}>{t('1 ay ücretsiz deneme')}</Text>
        <View style={{ flex: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text v="small" color={soft} style={{ fontFamily: fonts.bodyBold }}>↻</Text>
          <Text v="small" color={soft}>{phone ? t('Özellikler için karta dokun') : t('Özellikler için üzerine gel')}</Text>
        </View>
        {cta}
      </Animated.View>
      <Animated.View style={[face, rear]} pointerEvents={back ? 'auto' : 'none'}>
        {head}
        <View style={{ gap: 7, marginTop: 2 }}>
          {p.points.map((x: string) => (
            <View key={x} style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ marginTop: 1 }}><Icon name="check" size={16} color={dark ? c.butter : c.okInk} /></View>
              <Text v="small" color={soft} style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>{x}</Text>
            </View>
          ))}
        </View>
        <View style={{ flex: 1 }} />
        {cta}
      </Animated.View>
    </Pressable>
  );
}

function Pricing({ go, anchor }: { go: (p: string) => void; anchor: (el: any) => void }) {
  const c = useColors();
  const { desktop, phone, width } = useBreakpoint();
  const [yearly, setYearly] = useState(false);
  const list = plans(yearly);
  // Telefonda kartlar yan yana kaydırılır; masaüstünde bölüm tek ekrana sığar.
  const cardW = Math.min(width - 56, 360);
  return (
    <View ref={anchor}>
      <Container style={{ paddingTop: phone ? 56 : 96, gap: phone ? 16 : 22 }}>
        <SectionHead compact label={t('Fiyatlar')} title={t('Kiracılar için ücretsiz. Mülk sahibi portföyüne göre.')}
          body={t('Her paket 1 ay ücretsiz denemeyle başlar. Deneme bitince kayıtların silinmez; kiracının işleri hiç etkilenmez.')} />
        <Reveal style={{ alignSelf: 'center', flexDirection: 'row', backgroundColor: c.surface, borderRadius: radius.pill, padding: 4, borderWidth: 1, borderColor: c.line }}>
          {([[false, t('Aylık')], [true, t('Yıllık · 2 ay bedava')]] as const).map(([k, label]) => {
            const on = yearly === k;
            return (
              <PressScale key={String(k)} onPress={() => setYearly(k)} accessibilityRole="tab" accessibilityState={{ selected: on }} scaleTo={0.97}
                style={{ paddingHorizontal: phone ? 16 : 22, minHeight: 40, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: on ? c.ink : 'transparent' }}>
                <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: on ? c.bg : c.ink }}>{label}</RNText>
              </PressScale>
            );
          })}
        </Reveal>
        {phone ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardW + 12} decelerationRate="fast"
            style={{ marginHorizontal: -16 }} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
            {list.map((p) => <PlanCard key={p.id} p={p} w={cardW} go={go} />)}
          </ScrollView>
        ) : (
          <Reveal style={{ flexDirection: desktop ? 'row' : 'column', gap: 16, alignItems: 'stretch' }}>{list.map((p) => <PlanCard key={p.id} p={p} go={go} />)}</Reveal>
        )}
        {phone ? <Text v="small" muted style={{ textAlign: 'center' }}>{t('Diğer paketler için kaydır')} ›</Text> : null}
        <Reveal style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={16} color={c.okInk} />
          <Text v="small" muted>{t('Kiracılar ve ekip üyeleri (emlakçı, muhasebeci, personel) her zaman ücretsiz.')}</Text>
          <PressScale onPress={() => go('/kayit/kiraci')} accessibilityRole="link"><Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyBold }}>{t('Kiracı olarak kayıt ol')} ›</Text></PressScale>
        </Reveal>
      </Container>
    </View>
  );
}

/* ---------------- sıkça sorulanlar ---------------- */

function Faq({ anchor }: { anchor: (el: any) => void }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const [open, setOpen] = useState<number | null>(0);
  const list = faq();
  return (
    <View ref={anchor}>
      <Container style={{ paddingTop: phone ? 56 : 128, gap: phone ? 16 : 40 }}>
        <SectionHead title={t('Sıkça sorulan sorular')} />
        <Reveal style={{ width: '100%', maxWidth: 820, alignSelf: 'center' }}>
          {list.map((f, i) => {
            const on = open === i;
            return (
              <View key={f.q} style={{ borderTopWidth: 1, borderTopColor: c.line, borderBottomWidth: i === list.length - 1 ? 1 : 0, borderBottomColor: c.line }}>
                <PressScale onPress={() => setOpen(on ? null : i)} accessibilityRole="button" accessibilityState={{ expanded: on }} scaleTo={0.995}
                  style={{ minHeight: phone ? 56 : 68, paddingVertical: phone ? 12 : 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <RNText style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: phone ? 17 : 19, lineHeight: phone ? 24 : 27, color: c.ink }}>{f.q}</RNText>
                  <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: on ? c.accent : c.muted, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ position: 'absolute', width: 12, height: 2, borderRadius: 1, backgroundColor: on ? c.accent : c.muted }} />
                    {!on && <View style={{ position: 'absolute', width: 2, height: 12, borderRadius: 1, backgroundColor: c.muted }} />}
                  </View>
                </PressScale>
                {on && (
                  <Animated.View entering={FadeInDown.springify().damping(24).stiffness(180)}>
                    <Text v="body" muted style={{ fontSize: phone ? 16 : 17, lineHeight: phone ? 25 : 27, paddingBottom: 22, paddingRight: 48 }}>{f.a}</Text>
                  </Animated.View>
                )}
              </View>
            );
          })}
        </Reveal>
      </Container>
    </View>
  );
}

/* ---------------- iletişim ve alt bilgi ---------------- */

function Contact({ anchor }: { anchor: (el: any) => void }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const mail = () => Linking.openURL('mailto:' + CONFIG.supportEmail).catch(() => {});
  return (
    <View ref={anchor}>
      <Container style={{ paddingTop: phone ? 56 : 128, paddingBottom: phone ? 56 : 128, alignItems: 'center' }}>
        <Reveal style={{ alignItems: 'center', gap: phone ? 18 : 24, maxWidth: 760 }}>
          <Text v="label" color={c.accentText} style={{ fontSize: 13, letterSpacing: 0.4 }}>{t('İletişim')}</Text>
          <Display size={phone ? 34 : 72} center>{t('Soruların için yaz.')}</Display>
          <PressScale onPress={mail} accessibilityRole="link"><Display size={phone ? 22 : 36} color={c.accent} center>{CONFIG.supportEmail}</Display></PressScale>
          <Text v="body" muted style={{ fontSize: phone ? 16 : 18, lineHeight: phone ? 24 : 27, textAlign: 'center', maxWidth: 520 }}>
            {t('Hesap, paket ve veri silme işlemleri için destek merkezine ya da e-postaya ulaşabilirsin.')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button kind="dark" title={t('E-posta gönder')} onPress={mail} />
            <Button kind="ghost" title={t('Destek merkezi')} onPress={() => Linking.openURL(CONFIG.legal.support)} />
          </View>
        </Reveal>
      </Container>
    </View>
  );
}

function Footer({ scrollTo }: { scrollTo: (k: string) => void }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const lang = getLang();
  const open = (u: string) => () => Linking.openURL(u).catch(() => {});
  const cols: [string, [string, () => void][]][] = [
    [t('Ürün'), [[t('Özellikler'), () => scrollTo('ozellikler')], [t('Nasıl çalışır'), () => scrollTo('nasil')], [t('Fiyatlar'), () => scrollTo('fiyat')], [t('Blog'), open(site('blog/'))]]],
    [t('Destek'), [[t('Destek merkezi'), open(CONFIG.legal.support)], [t('Sıkça sorulanlar'), () => scrollTo('sss')], [CONFIG.supportEmail, open('mailto:' + CONFIG.supportEmail)]]],
    [t('Yasal'), [[t('Kullanım Koşulları'), open(CONFIG.legal.terms)], [t('Gizlilik ve KVKK'), open(CONFIG.legal.privacy)], [t('Hesap silme'), open(CONFIG.legal.deletion)]]]
  ];
  return (
    <View style={{ backgroundColor: c.deepA }}>
      <Container style={{ paddingTop: phone ? 56 : 88, paddingBottom: 28, gap: phone ? 40 : 64 }}>
        <View style={{ flexDirection: phone ? 'column' : 'row', justifyContent: 'space-between', gap: phone ? 36 : 48 }}>
          <View style={{ gap: 14, maxWidth: 300 }}>
            <Wordmark size={28} color={c.heroInk} />
            <Text v="small" color={c.heroMuted} style={{ lineHeight: 21 }}>{t('Kira işinin anahtarı.')}</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: phone ? 32 : 72 }}>
            {cols.map(([head, links]) => (
              <View key={head} style={{ gap: 6, minWidth: 140 }}>
                <Text v="small" color={c.heroInk} style={{ fontFamily: fonts.bodyBold, marginBottom: 6 }}>{head}</Text>
                {links.map(([label, run]) => (
                  <PressScale key={label} accessibilityRole="link" onPress={run} style={{ minHeight: 36, justifyContent: 'center' }}><Text v="small" color={c.heroMuted}>{label}</Text></PressScale>
                ))}
              </View>
            ))}
          </View>
        </View>
        <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(250,245,240,0.14)', paddingTop: 20, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Text v="small" color={c.heroMuted}>© {new Date().getFullYear()} anahtar · {t('Tüm hakları saklıdır.')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[['tr', 'Türkçe'], ['en', 'English']].map(([k, label]) => (
              <PressScale key={k} accessibilityRole="button" accessibilityState={{ selected: lang === k }} onPress={() => { setLang(k); if (typeof location !== 'undefined') location.reload(); }}
                style={{ minHeight: 44, minWidth: 48, paddingHorizontal: 8, justifyContent: 'center' }}>
                <Text v="small" color={lang === k ? c.heroInk : c.heroMuted} style={{ fontFamily: lang === k ? fonts.bodyXBold : fonts.body }}>{label}</Text>
              </PressScale>
            ))}
          </View>
        </View>
      </Container>
    </View>
  );
}

function ToTop({ show, onPress }: { show: boolean; onPress: () => void }) {
  const c = useColors();
  const anim: any = { transitionProperty: 'opacity, transform', transitionDuration: '500ms', transitionTimingFunction: EASE };
  return (
    <View pointerEvents={show ? 'box-none' : 'none'} style={[{ position: 'absolute', right: 20, bottom: 20, opacity: show ? 1 : 0, transform: [{ translateY: show ? 0 : 16 }, { scale: show ? 1 : 0.85 }] }, anim]}>
      <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={t('Yukarı çık')} scaleTo={0.92}
        style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', boxShadow: shadows.lift }}>
        <View style={{ transform: [{ rotate: '90deg' }] }}><Icon name="back" size={22} color={c.accentInk} /></View>
      </PressScale>
    </View>
  );
}

export default function Landing() {
  useLangTick();
  const c = useColors();
  const router = useRouter();
  const scroll = useRef<any>(null);
  const at = useRef<Record<string, any>>({});
  const [top, setTop] = useState(false);
  const [feature, setFeature] = useState(categories()[0].id);
  const go = (p: string) => router.push(p as any);
  /** Bölüme kaydırır. Konum tıklama anında ölçülür; üstteki içerik sonradan büyüse de doğru yere gider. */
  const scrollTo = (k: string) => {
    const sv = scroll.current, el = at.current[k];
    if (!sv || !el) return;
    const node = sv.getScrollableNode ? sv.getScrollableNode() : null;
    if (node && el.getBoundingClientRect) {
      const y = el.getBoundingClientRect().top - node.getBoundingClientRect().top + node.scrollTop;
      sv.scrollTo({ y: Math.max(0, y - 70), animated: true });
    } else if (el.measureLayout && sv.getInnerViewNode) {
      el.measureLayout(sv.getInnerViewNode(), (_x: number, y: number) => sv.scrollTo({ y: Math.max(0, y - 70), animated: true }), () => {});
    }
  };
  /** Menüden bir özellik seçildi: sekmeyi aç, bölüme kaydır. */
  const openFeature = (id: string) => { setFeature(id); scrollTo('ozellikler'); };
  const mark = (k: string) => (el: any) => { if (el) at.current[k] = el; };
  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={scroll} style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ flexGrow: 1 }} stickyHeaderIndices={[1]} scrollEventThrottle={64}
        onScroll={(e) => { const s = e.nativeEvent.contentOffset.y > 700; setTop((x) => (x === s ? x : s)); }}>
        <TopBar />
        <Nav go={go} scrollTo={scrollTo} openFeature={openFeature} />
        <Hero go={go} scrollTo={scrollTo} />
        <Rotator go={go} scrollTo={scrollTo} />
        <Manifesto />
        <Features active={feature} setActive={setFeature} anchor={mark('ozellikler')} go={go} />
        <HowItWorks go={go} anchor={mark('nasil')} />
        <Pricing go={go} anchor={mark('fiyat')} />
        <Faq anchor={mark('sss')} />
        <Contact anchor={mark('iletisim')} />
        <Footer scrollTo={scrollTo} />
      </ScrollView>
      <ToTop show={top} onPress={() => scroll.current?.scrollTo({ y: 0, animated: true })} />
    </View>
  );
}
