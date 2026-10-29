/* Tanıtım sitesi (ana sayfa). Bölümler: başlık + telefon, dönen sözcük, manifesto, özellikler (sekmeli),
   nasıl çalışır, fiyatlar, sıkça sorulanlar, iletişim, alt bilgi. */
import { ReactNode, useEffect, useRef, useState } from 'react';
import { Linking, Platform, ScrollView, Text as RNText, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { t, getLang, setLang } from '../domain/i18n';
import { demo } from './money';
import { CONFIG } from '../domain/config';
import { Button, Chip, Container, PressScale, Text } from '../ui/kit';
import { Wordmark } from '../ui/Wordmark';
import { fonts, radius, shadows, useBreakpoint, useColors } from '../ui/theme';
import { Slam } from '../ui/motion';
import { Reveal } from '../ui/Reveal';
import { useHeroCards } from './HeroCards';
import { PhoneStage } from './Phones';
import { Icon, Steps } from '../app-ui/blocks';
import { useLangTick } from '../app-ui/hooks';
import { categories, faq, plans } from './content';
import { PlanCard } from './PlanCard';
import { Nav, TopBar, openPage } from './Navbar';

const EASE = 'cubic-bezier(0.32,0.72,0,1)';
const site = (path: string) => CONFIG.publicUrl.replace(/\/?$/, '/') + path;

/** Web'de başlıklar dengeli kırılır: ikinci satırda tek sözcük kalmaz (text-wrap: balance). */
const BALANCE: any = Platform.OS === 'web' ? { textWrap: 'balance' } : null;

/** Büyük başlık yazısı. */
export function Display({ children, size, color, style, center }: { children: ReactNode; size: number; color?: string; style?: any; center?: boolean }) {
  const c = useColors();
  return (
    <RNText style={[{ fontFamily: fonts.siteBold, fontSize: size, lineHeight: Math.round(size * 1.08), letterSpacing: -size * (size > 40 ? 0.035 : 0.02), color: color ?? c.ink, textAlign: center ? 'center' : undefined, ...BALANCE }, style]}>
      {children}
    </RNText>
  );
}

export function SectionHead({ label, title, body, onDark, compact }: { label?: string; title: string; body?: string; onDark?: boolean; compact?: boolean }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  return (
    <Reveal style={{ alignItems: 'center', gap: phone || compact ? 10 : 14, maxWidth: compact ? 1140 : 820, alignSelf: 'center' }}>
      {label ? <Text v="label" color={onDark ? c.lemon : c.accentText} style={{ fontSize: 13, letterSpacing: 0.4 }}>{label}</Text> : null}
      <Display size={phone ? 26 : compact ? 44 : 64} center color={onDark ? c.heroInk : undefined}>{title}</Display>
      {body ? <Text v="body" color={onDark ? c.heroMuted : c.muted} style={{ fontSize: phone ? 15 : compact ? 18 : 21, lineHeight: phone ? 21 : compact ? 26 : 30, textAlign: 'center', maxWidth: compact ? 760 : 640, ...BALANCE }}>{body}</Text> : null}
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

/* ---------------- başlık ---------------- */

function Hero({ scrollTo }: { go: (p: string) => void; scrollTo: (k: string) => void }) {
  const c = useColors();
  const { phone, width } = useBreakpoint();
  const wide = width >= 1100;
  const size = phone ? 34 : wide ? 76 : 66;
  const pill = Math.round(size * 0.7);
  // Telefonda kartlar %62 boyutunda: telefonların altında küçük bir şerit olur.
  const cards = useHeroCards(phone ? 220 : wide ? 210 : 232, phone ? 0.62 : 1);
  // Telefon sahnesi: masaüstünde üç, telefonda iki telefon; ortadaki koyu tema. Sahne ekran genişliğini aşmaz.
  const phoneW = phone ? Math.min(200, Math.floor((width - 32) / 1.9)) : wide ? 270 : Math.min(260, Math.floor((width - 32) / 2.6));
  const stage = <PhoneStage w={phoneW} count={phone ? 2 : 3} show={phone ? 0.6 : 0.6} />;
  return (
    <Container style={{ paddingTop: phone ? 28 : 44, alignItems: 'center' }}>
      <View style={{ alignItems: 'center', gap: phone ? 14 : 18 }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: size * 0.12 }}>
            <Slam delay={80} height={Math.round(size * 1.1)}><Display size={size}>{t('Kira işinin')}</Display></Slam>
            <Reveal delay={420} y={12}>
              <Pill bg={c.tile} size={pill}>
                <View style={{ width: pill * 0.4, height: pill * 0.4, borderRadius: pill * 0.1, backgroundColor: c.lemon }} />
                <RNText style={{ fontFamily: fonts.bodyBold, fontSize: Math.max(12, pill * 0.4), color: c.ink }}>{t('Ödendi')}</RNText>
              </Pill>
            </Reveal>
          </View>
          <Slam delay={220} height={Math.round(size * 1.1)}><Display size={size} color={c.accent}>{t('anahtarı.')}</Display></Slam>
        </View>
        <Reveal delay={260} style={{ alignItems: 'center', gap: phone ? 14 : 20, maxWidth: 620 }}>
          <Text v="body" style={{ fontSize: phone ? 15.5 : 20, lineHeight: phone ? 22 : 28, textAlign: 'center' }} color={c.muted}>
            {t('Sözleşme, ödeme, depozito ve arıza yazışması tek uygulamada. Kiracı ve mülk sahibi aynı kayda iki taraftan bakar.')}
          </Text>
          <Button kind="ghost" title={t('Fiyatları gör')} onPress={() => scrollTo('fiyat')} style={{ alignSelf: 'center' }} />
          <Text v="small" muted style={{ textAlign: 'center', fontSize: phone ? 13 : 14 }}>{[t('1 ay ücretsiz deneme'), t('Konut, ofis, mağaza, depo')].join(' · ')}</Text>
        </Reveal>
      </View>
      <Reveal delay={380} y={40} style={{ marginTop: phone ? 20 : 32, width: '100%', alignItems: 'center' }}>
        {wide ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 20 }}>
            <View style={{ gap: 22, marginTop: 60 }}>{cards('l1').odeme}{cards('l2').yazisma}</View>
            {stage}
            <View style={{ gap: 22, marginTop: 110 }}>{cards('r1').talep}{cards('r2').depozito}</View>
          </View>
        ) : (
          <View style={{ width: '100%', alignItems: 'center', gap: phone ? 14 : 24 }}>
            {stage}
            {/* Kartlar telefonların hemen altında; telefonda yana kaydırılır. */}
            {phone ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -16, alignSelf: 'stretch' }} contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingVertical: 6 }}>
                {[cards('a').odeme, cards('b').talep, cards('c').yazisma, cards('d').depozito]}
              </ScrollView>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>{[cards('a').odeme, cards('b').talep, cards('c').yazisma, cards('d').depozito]}</View>
            )}
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
  const size = phone ? 40 : 128;
  return (
    <View style={{ backgroundColor: c.deepA }}>
      <Container style={{ paddingVertical: phone ? 36 : 120, alignItems: 'center' }}>
        <Reveal style={{ alignItems: 'center', gap: phone ? 8 : 14 }}>
          <Text v="label" color={c.lemon} style={{ fontSize: 13, letterSpacing: 0.4 }}>{t('Tek yerde')}</Text>
          <View style={{ height: size * 1.14, justifyContent: 'center', alignItems: 'center', minWidth: 280 }}>
            <Animated.View key={words[i]} entering={FadeInDown.springify().damping(20).stiffness(160)} exiting={FadeOutUp.duration(160)} style={{ position: 'absolute' }}>
              <Display size={size} color={c.heroInk} center>{words[i]}</Display>
            </Animated.View>
          </View>
          <Text v="body" color={c.heroMuted} style={{ maxWidth: 560, fontSize: phone ? 15.5 : 23, lineHeight: phone ? 22 : 32, textAlign: 'center' }}>{t('Kiranın tüm işi, ödemeden çıkışa.')}</Text>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: phone ? 8 : 14 }}>
            <Button kind="onDark" title={t('Keşfet')} onPress={() => scrollTo('ozellikler')} />
            <Button kind="primary" title={t('Ücretsiz başla')} onPress={() => go('/kayit')} />
          </View>
        </Reveal>
      </Container>
    </View>
  );
}

function Manifesto() {
  const c = useColors();
  const { phone } = useBreakpoint();
  // Telefonda gösterilmez: büyük cümleler küçük ekranda sayfayı uzatıp dağınık gösteriyordu.
  if (phone) return null;
  const lines = [
    t('Kira ödendi mi? İki taraf da aynı anda görür.'),
    t('Arıza bildirilir, çözülene kadar takip edilir.'),
    t('Sözleşme, dekont ve tutanak tek yerde durur.'),
    t('Konuşulanlar kaybolmaz, kayıtta kalır.')
  ];
  return (
    <Container style={{ paddingTop: phone ? 44 : 128, alignItems: 'center' }}>
      <View style={{ gap: phone ? 8 : 14, alignItems: 'center', maxWidth: 980 }}>
        <Reveal><Text v="label" color={c.accentText} style={{ fontSize: 13, letterSpacing: 0.4, marginBottom: 6 }}>{t('Neden anahtar?')}</Text></Reveal>
        {lines.map((l, i) => <Reveal key={l} delay={i * 70}><Display size={phone ? 20 : 46} center color={i === 0 ? c.accent : c.ink}>{l}</Display></Reveal>)}
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
        <Line a={t('Usta teklifi')} b={demo(demo('₺1.850', '$70'), '$70')} />
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
    case 'cikis': return <Frame><Line a={t('Depozito')} b={demo(demo('₺65.000', '$2,500'), '$2,500')} /><Line a={t('Kesintiler')} b={'− ' + demo(demo('₺4.200', '$160'), '$160')} /><Line a={t('İade edilecek')} b={demo(demo('₺60.800', '$2,340'), '$2,340')} strong /></Frame>;
    case 'yenileme': return (
      <Frame>
        <View style={{ backgroundColor: c.bg, borderRadius: radius.pill, paddingHorizontal: 18, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: c.accent }} />
          <RNText style={{ fontFamily: fonts.siteBold, fontSize: 17, color: c.accentText, letterSpacing: -0.3, flexShrink: 1 }}>{t('Yasal üst sınır: TÜFE')}</RNText>
        </View>
        <Line a={t('Mevcut kira')} b={demo(demo('₺30.000', '$1,150'), '$1,150')} />
        <Line a={t('Yeni kira')} b={demo(demo('₺39.900', '$1,530'), '$1,530')} strong />
      </Frame>
    );
    case 'rapor': return (
      <Frame>
        {[[t('Moda 3+1'), 0.86, demo('₺312.400', '$12,000')], [t('Levent ofis'), 0.64, demo('₺238.000', '$9,150')], [t('Bağdat Cd. mağaza'), 0.42, demo('₺151.900', '$5,840')]].map(([n, p, v]) => (
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
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: phone ? 12 : 14, minHeight: phone ? 38 : 44, borderRadius: radius.pill, backgroundColor: on ? c.ink : c.surface, borderWidth: 1, borderColor: on ? c.ink : c.line }}>
        <Icon name={cat.icon} size={17} color={on ? c.bg : c.ink} />
        <RNText style={{ fontFamily: fonts.bodyBold, fontSize: phone ? 13.5 : 15, color: on ? c.bg : c.ink }}>{cat.title}</RNText>
      </PressScale>
    );
  };
  return (
    <View ref={anchor}>
      <Container style={{ paddingTop: phone ? 44 : 128, gap: phone ? 16 : 40 }}>
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
              <Display size={phone ? 22 : 38}>{cur.title}</Display>
            </View>
            <Text v="body" muted style={{ fontSize: phone ? 14.5 : 18, lineHeight: phone ? 21 : 27 }}>{cur.lead}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: phone ? 12 : 16, columnGap: 20 }}>
              {cur.items.map((it) => (
                <View key={it.title} style={{ width: phone ? '100%' : '46%', flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <View style={{ marginTop: 2 }}><Icon name="check" size={18} color={c.okInk} /></View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text v="small" style={{ fontFamily: fonts.bodyXBold, fontSize: phone ? 14 : 15 }}>{it.title}</Text>
                    <Text v="small" muted>{it.body}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
              <Button kind="primary" title={t('1 ay ücretsiz dene')} onPress={() => go('/kayit')} />
            </View>
          </View>
          {/* Telefonda görsel gösterilmez: bölüm tek ekrana sığsın. */}
          {phone ? null : (
            <View style={{ flex: desktop ? 0.9 : undefined, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
              <FeatureVisual id={cur.id} />
            </View>
          )}
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
      ['key', t('Hesabını aç'), t('1 ay ücretsiz deneme hemen başlar. Deneme süresince bütün özellikleri kullanabilirsin.')],
      ['home', t('Mülklerini ekle'), t('Tek tek ekle ya da Excel listeni yükle. Kira, ödeme günü ve sözleşme tarihleri bir kez girilir.')],
      ['send', t('Kiracını davet et'), t('Her mülk için bir davet kodu oluşur. Kodu WhatsApp ile gönder; kiracın katılınca mülke bağlanır.')],
      ['check', t('Birlikte takip edin'), t('Dekont onayı, talepler, belgeler ve hatırlatmalar tek ekranda. Ekibini de davet edebilirsin.')]
    ],
    tenant: [
      ['chat', t('Davet kodunu al'), t('Ev sahibin mülkü anahtar’a ekleyince sana bir davet kodu ya da bağlantı gönderir.')],
      ['key', t('Ücretsiz hesap aç'), t('Kayıt olurken kodu gir. Kodun henüz yoksa sonra da girebilirsin.')],
      ['card', t('Kiranı takip et'), t('Dekontunu yükle, arıza bildir, belgelerine bak. Her adım iki tarafta aynı görünür.')],
      ['bell', t('Hatırlatma al'), t('Kira günü, sözleşme yenileme ve tutanak onayı için zamanında haber alırsın.')]
    ]
  };
  const list = steps[who];
  const cta = who === 'landlord' ? [t('1 ay ücretsiz dene'), '/kayit/mulk-sahibi'] : [t('Kiracı olarak kayıt ol'), '/kayit/kiraci'];
  return (
    <View ref={anchor} style={{ backgroundColor: c.tile, marginTop: phone ? 44 : 128 }}>
      <Container style={{ paddingVertical: phone ? 36 : 112, gap: phone ? 16 : 40 }}>
        <SectionHead label={t('Nasıl çalışır')} title={t('Dört adımda başla.')} />
        <Reveal accessibilityRole="tablist" style={{ alignSelf: 'center', flexDirection: 'row', backgroundColor: c.surface, borderRadius: radius.pill, padding: 5, borderWidth: 1, borderColor: c.line }}>
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
        {/* İki sekmede de aynı yükseklik: geçişte bölüm zıplamaz, başlık ve metinler aynı satırlardan başlar. */}
        <Animated.View key={who} entering={FadeIn.duration(260)} style={{ flexDirection: desktop ? 'row' : 'column', minHeight: desktop ? 196 : undefined }}>
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: desktop ? 28 : undefined }}>
                    <Icon name={icon} size={18} color={c.accentText} />
                    <Display size={phone ? 17 : 23} style={{ flexShrink: 1 }}>{title}</Display>
                  </View>
                  <Text v="body" muted style={{ fontSize: phone ? 15 : 16, lineHeight: phone ? 22 : 24 }}>{body}</Text>
                </View>
              </View>
            );
          })}
        </Animated.View>
        <Reveal style={{ alignItems: 'center', gap: 14 }}>
          <View style={{ alignSelf: 'center' }}><Button kind="primary" title={cta[0]} onPress={() => go(cta[1])} /></View>
          <Text v="small" muted style={{ textAlign: 'center', maxWidth: 560 }}>{t('Yüklenen dekont, belge ve faturalar mülk sahibince kontrol edilir ve onaylanır.')}</Text>
        </Reveal>
      </Container>
    </View>
  );
}

/* ---------------- fiyatlar ---------------- */

/** Fiyat kartı: üstte paket ve fiyat, altında ince çizgilerle ayrılmış özellikler, en altta düğme.
    Önerilen paket (Portföy) koyu zemin, krem yazı ve sarı vurgularla öne çıkar; diğerleri açık zeminlidir. */
function PlanCta(p: any, go: (path: string) => void, yearly: boolean) {
  return p.id === 'kurumsal'
    ? { title: t('Bize ulaşın'), onPress: () => go('/kurumsal') }
    : { title: t('Paketi seç'), onPress: () => go('/satin-al?plan=' + p.id + '&donem=' + (yearly ? 'yillik' : 'aylik')) };
}

function Pricing({ go, anchor }: { go: (p: string) => void; anchor: (el: any) => void }) {
  const c = useColors();
  const { desktop, phone } = useBreakpoint();
  const [yearly, setYearly] = useState(false);
  const list = plans(yearly);
  return (
    <View ref={anchor}>
      <Container style={{ paddingTop: phone ? 44 : 96, gap: phone ? 14 : 22 }}>
        <SectionHead compact label={t('Fiyatlar')} title={t('Kiracılar için ücretsiz. Mülk sahibi mülkü kadar öder.')}
          body={t('Fiyat mülk başınadır ve KDV dahildir: mülk ekledikçe artar, çıkardıkça düşer. Her paket 1 ay ücretsiz denemeyle başlar; deneme bitince kayıtların silinmez.')} />
        <Reveal accessibilityRole="tablist" style={{ alignSelf: 'center', flexDirection: 'row', backgroundColor: c.surface, borderRadius: radius.pill, padding: 4, borderWidth: 1, borderColor: c.line }}>
          {([[false, t('Aylık')], [true, t('Yıllık · 2 ay ücretsiz')]] as const).map(([k, label]) => {
            const on = yearly === k;
            return (
              <PressScale key={String(k)} onPress={() => setYearly(k)} accessibilityRole="tab" accessibilityState={{ selected: on }} scaleTo={0.97}
                style={{ paddingHorizontal: phone ? 16 : 22, minHeight: 40, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: on ? c.ink : 'transparent' }}>
                <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: on ? c.bg : c.ink }}>{label}</RNText>
              </PressScale>
            );
          })}
        </Reveal>
        {/* Masaüstünde yan yana, telefonda ve tablette alt alta; her kart tam genişlikte. */}
        <Reveal style={{ flexDirection: desktop ? 'row' : 'column', gap: phone ? 12 : 16, alignItems: 'stretch', width: '100%', maxWidth: desktop ? undefined : 560, alignSelf: 'center' }}>
          {list.map((p) => <PlanCard key={p.id} p={p} cta={PlanCta(p, go, yearly)} side={desktop} eqLine={list.some((x) => !!x.monthlyEq)} />)}
        </Reveal>
        <Reveal style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
          {phone ? null : <Icon name="check" size={16} color={c.okInk} />}
          <Text v="small" muted style={{ textAlign: 'center' }}>{t('Kiracılar ve ekip üyeleri (emlakçı, muhasebeci, personel) her zaman ücretsiz.')}</Text>
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
      <Container style={{ paddingTop: phone ? 44 : 128, gap: phone ? 12 : 40 }}>
        <SectionHead title={t('Sıkça sorulan sorular')} />
        <Reveal style={{ width: '100%', maxWidth: 820, alignSelf: 'center' }}>
          {list.map((f, i) => {
            const on = open === i;
            return (
              <View key={f.q} style={{ borderTopWidth: 1, borderTopColor: c.line, borderBottomWidth: i === list.length - 1 ? 1 : 0, borderBottomColor: c.line }}>
                <PressScale onPress={() => setOpen(on ? null : i)} accessibilityRole="button" accessibilityState={{ expanded: on }} aria-expanded={on} scaleTo={0.995}
                  style={{ minHeight: phone ? 56 : 68, paddingVertical: phone ? 12 : 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <RNText style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: phone ? 15.5 : 19, lineHeight: phone ? 22 : 27, color: c.ink }}>{f.q}</RNText>
                  <View style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, borderColor: on ? c.accent : c.muted, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ position: 'absolute', width: 12, height: 2, borderRadius: 1, backgroundColor: on ? c.accent : c.muted }} />
                    {!on && <View style={{ position: 'absolute', width: 2, height: 12, borderRadius: 1, backgroundColor: c.muted }} />}
                  </View>
                </PressScale>
                {on && (
                  <Animated.View entering={FadeInDown.springify().damping(24).stiffness(180)}>
                    <Text v="body" muted style={{ fontSize: phone ? 14.5 : 17, lineHeight: phone ? 21 : 27, paddingBottom: phone ? 16 : 22, paddingRight: phone ? 8 : 48 }}>{f.a}</Text>
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
      <Container style={{ paddingTop: phone ? 44 : 128, paddingBottom: phone ? 44 : 128, alignItems: 'center' }}>
        <Reveal style={{ alignItems: 'center', gap: phone ? 12 : 24, maxWidth: 760 }}>
          <Text v="label" color={c.accentText} style={{ fontSize: 13, letterSpacing: 0.4 }}>{t('İletişim')}</Text>
          <Display size={phone ? 26 : 72} center>{t('Soruların için yaz.')}</Display>
          <PressScale onPress={mail} accessibilityRole="link"><Display size={phone ? 19 : 36} color={c.accent} center>{CONFIG.supportEmail}</Display></PressScale>
          <Text v="body" muted style={{ fontSize: phone ? 14.5 : 18, lineHeight: phone ? 21 : 27, textAlign: 'center', maxWidth: 520 }}>
            {t('Hesap, paket ve veri silme işlemleri için destek merkezine ya da e-postaya ulaşabilirsin.')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
            <Button kind="ghost" title={t('Destek merkezi')} onPress={() => Linking.openURL(CONFIG.legal.support)} />
            <Button kind="primary" title={t('E-posta gönder')} onPress={mail} />
          </View>
        </Reveal>
      </Container>
    </View>
  );
}

/** Ücretsiz kira artış hesaplayıcısına yönlendiren bant (ayrı, SEO'ya açık sayfa). */
function CalcBand() {
  const c = useColors();
  const { phone } = useBreakpoint();
  return (
    <Container style={{ paddingTop: phone ? 44 : 96 }}>
      <Reveal style={{ backgroundColor: c.lemon, borderRadius: phone ? 26 : 36, padding: phone ? 22 : 44, flexDirection: phone ? 'column' : 'row', alignItems: phone ? 'flex-start' : 'center', gap: phone ? 16 : 32, overflow: 'hidden' }}>
        <View style={{ flex: phone ? undefined : 1, gap: 8 }}>
          <Text v="label" color="#6B4A00" style={{ fontSize: 13, letterSpacing: 0.4 }}>{t('Ücretsiz araç')}</Text>
          <Display size={phone ? 24 : 40} color="#1D1A19">{t('Bu yıl kiraya ne kadar zam yapılabilir?')}</Display>
          <Text v="body" color="#3B2A00" style={{ fontSize: phone ? 15 : 17, lineHeight: phone ? 22 : 26, maxWidth: 560 }}>{t('TÜİK’in her ay açıkladığı 12 aylık ortalama TÜFE ile yasal zam tavanını ve yeni kira bedelini saniyeler içinde hesapla.')}</Text>
        </View>
        <View style={{ backgroundColor: '#1D1A19', borderRadius: 24, padding: phone ? 18 : 24, gap: 6, minWidth: phone ? undefined : 300, alignSelf: phone ? 'stretch' : 'auto' }}>
          <Text v="small" color="#BDB1AB">{t('Örnek: ₺25.000 kira, %40 TÜFE')}</Text>
          <Display size={phone ? 30 : 38} color="#FAF5F0">₺35.000</Display>
          <Text v="small" color="#F2B544" style={{ fontFamily: fonts.bodyBold }}>{t('+₺10.000 / ay')}</Text>
          <View style={{ marginTop: 10 }}><Button kind="primary" title={t('Kira artışını hesapla')} onPress={() => openPage('kira-artis-hesaplama')} /></View>
        </View>
      </Reveal>
    </Container>
  );
}

export function Footer({ scrollTo }: { scrollTo: (k: string) => void }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const lang = getLang();
  const open = (u: string) => () => Linking.openURL(u).catch(() => {});
  const cols: [string, [string, () => void][]][] = [
    [t('Ürün'), [[t('Özellikler'), () => scrollTo('ozellikler')], [t('Nasıl çalışır'), () => scrollTo('nasil')], [t('Fiyatlar'), () => scrollTo('fiyat')], [t('Çözümler'), () => openPage('cozumler')], [t('Kurumsal'), () => openPage('kurumsal')], [t('Kira artış hesaplama'), () => openPage('kira-artis-hesaplama')], [t('Blog'), open(site('blog/'))]]],
    [t('Destek'), [[t('Destek merkezi'), open(CONFIG.legal.support)], [t('Sıkça sorulanlar'), () => scrollTo('sss')], [CONFIG.supportEmail, open('mailto:' + CONFIG.supportEmail)]]],
    [t('Yasal'), [[t('Kullanım Koşulları'), open(CONFIG.legal.terms)], [t('Gizlilik ve KVKK'), open(CONFIG.legal.privacy)], [t('Hesap silme'), open(CONFIG.legal.deletion)]]]
  ];
  return (
    <View style={{ backgroundColor: c.deepA }}>
      <Container style={{ paddingTop: phone ? 56 : 88, paddingBottom: 28, gap: phone ? 40 : 64 }}>
        <View style={{ flexDirection: phone ? 'column' : 'row', justifyContent: 'space-between', gap: phone ? 36 : 48 }}>
          <View style={{ gap: 14, maxWidth: 300 }}>
            <PressScale onPress={() => scrollTo('top')} accessibilityRole="link" accessibilityLabel={t('Ana sayfa')} style={{ alignSelf: 'flex-start' }}><Wordmark size={28} color={c.heroInk} /></PressScale>
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

export function ToTop({ show, onPress }: { show: boolean; onPress: () => void }) {
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
    if (sv && k === 'top') { sv.scrollTo({ y: 0, animated: true }); return; }
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
  // Başka sayfadan menüyle gelindiyse (/#fiyat) ilgili bölüme kaydırılır.
  useEffect(() => {
    const h = typeof window !== 'undefined' ? window.location.hash.replace('#', '') : '';
    if (h) setTimeout(() => scrollTo(h), 450);
  }, []);
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
        <CalcBand />
        <Faq anchor={mark('sss')} />
        <Contact anchor={mark('iletisim')} />
        <Footer scrollTo={scrollTo} />
      </ScrollView>
      <ToTop show={top} onPress={() => scroll.current?.scrollTo({ y: 0, animated: true })} />
    </View>
  );
}
