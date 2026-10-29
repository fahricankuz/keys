/* Tanıtım sitesinin üst şeridi ve menüsü. "Özellikler" açılır panelinde kategori seçilince
   sayfadaki Özellikler bölümü o kategorinin sekmesiyle açılır (Landing → openFeature). */
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { t, getLang, setLang } from '../domain/i18n';
import { useAuth } from '../auth/auth';
import { Button, Container, PressScale, Text } from '../ui/kit';
import { Wordmark } from '../ui/Wordmark';
import { fonts, radius, shadows, useBreakpoint, useColors } from '../ui/theme';
import { Icon } from '../app-ui/blocks';
import { categories } from './content';
import { CONFIG } from '../domain/config';
import { segments } from './segments';

/** Üst duyuru şeridi: kira kartının kahverengisinden kırmızıya akan hareketli geçiş, altta kırmızı ışıma,
    soldan sağa geçen parıltı ve "Fırsat" etiketi. Hareketi azaltmayı seçen kullanıcıda geçiş durağandır. */
// Hareketli geçiş ve parıltı (animationKeyframes yalnızca StyleSheet.create içinde çalışır; yalnızca web).
const ANIM: any = Platform.OS === 'web' ? StyleSheet.create({
  flow: {
    backgroundImage: 'linear-gradient(100deg, #1D1A19 0%, #5C4F4A 22%, #8E3A2E 40%, #C8302E 55%, #8E3A2E 70%, #5C4F4A 86%, #1D1A19 100%)',
    backgroundSize: '300% 100%',
    animationKeyframes: [{ '0%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' }, '100%': { backgroundPosition: '0% 50%' } }],
    animationDuration: '8s', animationIterationCount: 'infinite', animationTimingFunction: 'ease-in-out',
    boxShadow: '0 10px 26px -8px rgba(200,48,46,0.65)'
  } as any,
  still: {
    backgroundImage: 'linear-gradient(100deg, #1D1A19 0%, #5C4F4A 35%, #C8302E 100%)',
    boxShadow: '0 10px 26px -8px rgba(200,48,46,0.65)'
  } as any,
  shine: {
    position: 'absolute', top: 0, bottom: 0, width: '30%', left: '-30%',
    backgroundImage: 'linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
    animationKeyframes: [{ '0%': { transform: 'translateX(0)' }, '60%': { transform: 'translateX(450%)' }, '100%': { transform: 'translateX(450%)' } }],
    animationDuration: '4.5s', animationIterationCount: 'infinite', animationTimingFunction: 'ease-in-out', pointerEvents: 'none'
  } as any
}) : null;

/** Üst duyuru şeridi: kira kartının kahverengisinden kırmızıya akan hareketli geçiş, altta kırmızı ışıma,
    soldan sağa geçen parıltı ve "Fırsat" etiketi. Hareketi azaltmayı seçen kullanıcıda geçiş durağandır. */
/** Sitedeki statik sayfaya (hesaplayıcı, blog) aynı sekmede gider. */
export function openPage(path: string) {
  if (typeof window !== 'undefined' && window.location) window.location.assign('/' + path);
  else Linking.openURL(CONFIG.publicUrl.replace(/\/?$/, '/') + path).catch(() => {});
}

export function TopBar() {
  const c = useColors();
  const router = useRouter();
  const { phone } = useBreakpoint();
  const reduce = !!ANIM && typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const flow = ANIM ? (reduce ? ANIM.still : ANIM.flow) : { backgroundColor: c.deepA };
  const shine = ANIM && !reduce ? ANIM.shine : null;
  const size = phone ? 12.5 : 14;
  return (
    <View style={[{ position: 'relative', zIndex: 2, overflow: 'hidden' }, flow]}>
      {shine ? <View style={shine} /> : null}
      <PressScale onPress={() => router.push('/kayit/mulk-sahibi')} accessibilityRole="link" scaleTo={0.99}
        style={{ minHeight: phone ? 42 : 46, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: phone ? 8 : 12, flexWrap: 'nowrap', paddingVertical: 8 }}>
        <View style={{ backgroundColor: c.lemon, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
          <RNText style={{ fontFamily: fonts.bodyXBold, fontSize: phone ? 11 : 11.5, letterSpacing: 0.6, color: '#1D1A19' }}>{t('FIRSAT')}</RNText>
        </View>
        {/* Telefonda tek satıra sığsın diye kısa metin. */}
        <RNText style={{ fontFamily: fonts.bodyBold, fontSize: size, color: c.heroInk, textAlign: 'center' }}>{phone ? t('1 ay ücretsiz deneme') : t('Mülk sahiplerine 1 ay ücretsiz deneme')}</RNText>
        <RNText style={{ fontFamily: fonts.bodyXBold, fontSize: size, color: c.lemon, textDecorationLine: 'underline' }}>{phone ? t('Başla') : t('Hemen başla')} ›</RNText>
      </PressScale>
    </View>
  );
}

export function Nav({ go, scrollTo, openFeature }: { go: (p: string) => void; scrollTo: (k: string) => void; openFeature: (id: string) => void }) {
  const c = useColors();
  const { phone } = useBreakpoint();
  const { user, ready } = useAuth();
  const [menu, setMenu] = useState<'ozellik' | 'cozum' | null>(null);
  const open = menu !== null;
  const setOpen = (_: false) => setMenu(null);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []);
  const links: [string, string][] = [['nasil', t('Nasıl çalışır')], ['fiyat', t('Fiyatlar')], ['sss', t('SSS')]];
  const glass: any = { backgroundColor: c.bg + 'B8', backdropFilter: 'saturate(180%) blur(22px)', WebkitBackdropFilter: 'saturate(180%) blur(22px)' };
  // Telefonda logo, dil, giriş ve kayıt tek satıra sığsın diye düğmeler sıkı.
  const btn = { minHeight: phone ? 40 : 44, paddingHorizontal: phone ? 8 : 20 };
  const narrow = useBreakpoint().width < 380;
  // Oturum açıksa giriş / kayıt yerine panele dönüş gösterilir.
  const signedIn = ready && !!user;
  return (
    <View style={[{ zIndex: 20, borderBottomWidth: 1, borderBottomColor: c.line6 }, glass]}>
      {open && !phone ? (
        <Animated.View entering={FadeIn.duration(260)} exiting={FadeOut.duration(180)} style={{ position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}>
          <Pressable accessibilityLabel={t('Kapat')} onPress={() => setOpen(false)} style={[{ flex: 1, backgroundColor: 'rgba(29,26,25,0.22)' }, { backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' } as any]} />
        </Animated.View>
      ) : null}
      <Container style={{ zIndex: 20 }}>
        <View style={{ position: 'relative' }}>
          <View style={{ minHeight: 60, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <PressScale onPress={() => { setOpen(false); scrollTo('top'); }} accessibilityRole="link" accessibilityLabel={t('Ana sayfa')}>
              <Wordmark size={phone ? (narrow ? 17 : 21) : 28} animate />
            </PressScale>
            {!phone && (
              <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                <MenuButton label={t('Özellikler')} on={menu === 'ozellik'} onPress={() => setMenu((m) => (m === 'ozellik' ? null : 'ozellik'))} />
                <MenuButton label={t('Çözümler')} on={menu === 'cozum'} onPress={() => setMenu((m) => (m === 'cozum' ? null : 'cozum'))} />
                {links.map(([k, label]) => (
                  <PressScale key={k} onPress={() => { setOpen(false); scrollTo(k); }} accessibilityRole="link" style={{ paddingVertical: 8, paddingHorizontal: 14 }}>
                    <Text v="small" style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }}>{label}</Text>
                  </PressScale>
                ))}
                <PressScale onPress={() => { setOpen(false); go('/kira-artis-hesaplama'); }} accessibilityRole="link" style={{ paddingVertical: 8, paddingHorizontal: 14 }}>
                  <Text v="small" style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }}>{t('Kira artışı hesapla')}</Text>
                </PressScale>
              </View>
            )}
            <View style={{ flexDirection: 'row', gap: phone ? (narrow ? 3 : 4) : 6, alignItems: 'center' }}>
              {!phone && <LangPicker />}
              {signedIn ? (
                <Button kind="primary" title={t('Panele git')} onPress={() => go(user!.admin ? '/admin' : '/uygulama')} style={btn} />
              ) : (
                <>
                  <Button kind="ghost" title={t('Giriş yap')} onPress={() => go('/giris')} style={btn} />
                  <Button kind="primary" title={phone ? t('Kayıt ol') : t('Ücretsiz dene')} onPress={() => go('/kayit')} style={btn} />
                </>
              )}
            </View>
          </View>
          {menu === 'ozellik' && !phone && <FeatureMenu go={go} signedIn={signedIn} onPick={(id) => { setOpen(false); openFeature(id); }} />}
          {menu === 'cozum' && !phone && <SolutionMenu onPick={(p) => { setOpen(false); go(p); }} />}
        </View>
      </Container>
    </View>
  );
}

/** Üst menüde açılır panel düğmesi (Özellikler, Çözümler). */
function MenuButton({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ expanded: on }} aria-expanded={on} accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? c.surface2 : 'transparent' }}>
      <Text v="small" style={{ fontFamily: fonts.bodyMedium, fontSize: 14 }}>{label}</Text>
      <View style={{ transform: [{ rotate: on ? '90deg' : '-90deg' }] }}><Icon name="back" size={13} /></View>
    </Pressable>
  );
}

/** Açılır çözümler menüsü (Özellikler menüsüyle aynı düzen): solda seçenekler, ortada üzerine gelinen
    seçeneğin özeti ve hazır özellikleri, sağda ilgili çağrı. Seçeneğe basınca kendi sayfasına gidilir. */
function SolutionMenu({ onPick }: { onPick: (path: string) => void }) {
  const c = useColors();
  const { desktop } = useBreakpoint();
  const list = segments();
  const [active, setActive] = useState(list[0].slug);
  const cur = list.find((x) => x.slug === active) || list[0];
  const corp = cur.plan === 'kurumsal';
  const page = '/cozumler/' + cur.slug;
  return (
    <View style={{ position: 'absolute', top: 66, left: 0, right: 0, zIndex: 60 }}>
      <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(120)}
        style={{ backgroundColor: c.surface, borderRadius: 32, borderWidth: 1, borderColor: c.line, padding: 14, flexDirection: 'row', gap: 6, boxShadow: shadows.lift }}>
        <View style={{ width: 270, gap: 2 }} accessibilityRole="tablist">
          {list.map((s) => {
            const on = s.slug === active;
            return (
              <Pressable key={s.slug} onHoverIn={() => setActive(s.slug)} onPress={() => onPick('/cozumler/' + s.slug)} accessibilityRole="link" accessibilityLabel={s.name + ' · ' + s.sub}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 44, borderRadius: 16, backgroundColor: on ? c.surface2 : 'transparent' }}>
                <Icon name={s.icon} size={19} color={on ? c.accentText : c.ink} />
                <RNText numberOfLines={1} style={{ flex: 1, fontFamily: on ? fonts.bodyXBold : fonts.bodyBold, fontSize: 15, color: c.ink }}>
                  {s.name}{s.plan === 'tek' || s.plan === 'bes' ? <RNText style={{ fontFamily: fonts.body, color: c.muted }}>{' · ' + (s.plan === 'bes' ? t('5 mülk') : s.sub)}</RNText> : null}
                </RNText>
                <View style={{ transform: [{ rotate: '180deg' }], opacity: on ? 1 : 0.35 }}><Icon name="back" size={15} /></View>
              </Pressable>
            );
          })}
        </View>
        <View style={{ width: 1, backgroundColor: c.line, marginVertical: 8 }} />
        <Animated.View key={cur.slug} entering={FadeIn.duration(220)} style={{ flex: 1, paddingHorizontal: 22, paddingVertical: 10, gap: 16 }}>
          <RNText style={{ fontFamily: fonts.siteBold, fontSize: 22, lineHeight: 26, letterSpacing: -0.5, color: c.ink }}>
            {cur.title[0]} <RNText style={{ color: c.accent }}>{cur.title[1]}</RNText> {cur.title[2]}
          </RNText>
          <RNText style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.muted }}>{cur.lead}</RNText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 24, rowGap: 12 }}>
            {cur.has.slice(0, 4).map((h) => (
              <View key={h} style={{ width: desktop ? '46%' : '100%', flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                <View style={{ marginTop: 1 }}><Icon name="check" size={16} color={c.okInk} /></View>
                <RNText style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 14.5, lineHeight: 20, color: c.ink }}>{h}</RNText>
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 18, marginTop: 'auto' as any }}>
            <PressScale onPress={() => onPick(page)} accessibilityRole="link">
              <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.accentText }}>{t('{name} sayfasına git', { name: cur.name })} ›</RNText>
            </PressScale>
            <PressScale onPress={() => onPick('/cozumler')} accessibilityRole="link">
              <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.muted }}>{t('Tüm çözümler')} ›</RNText>
            </PressScale>
          </View>
        </Animated.View>
        {desktop && (
          <>
            <View style={{ width: 1, backgroundColor: c.line, marginVertical: 8 }} />
            <View style={{ width: 260, padding: 10, gap: 12, justifyContent: 'center' }}>
              <RNText style={{ fontFamily: fonts.siteBold, fontSize: 20, lineHeight: 22, letterSpacing: -0.4, color: c.ink }}>{corp ? t('Kurumsal paket') : cur.plan === 'kiraci' ? t('Kiracı hesabı her zaman ücretsiz.') : t('1 ay ücretsiz dene')}</RNText>
              <Text v="small" muted>{corp ? t('Kısa formu doldurun; uygun fiyatı ve kurulum planını iki iş günü içinde iletelim.') : t('Kiracılar her zaman ücretsiz. Mülk sahipleri her paketi 1 ay ücretsiz dener.')}</Text>
              <Button kind="primary" title={corp ? t('Teklif al') : t('Hesap oluştur')}
                onPress={() => onPick(corp ? '/kurumsal?sektor=' + encodeURIComponent(cur.role || '') + '#form' : cur.plan === 'kiraci' ? '/kayit/kiraci' : '/kayit/mulk-sahibi')} />
            </View>
          </>
        )}
      </Animated.View>
    </View>
  );
}

/** Dil seçici (yalnızca masaüstü): küre simgesi ve geçerli dil kodu; basınca altında TR / EN kapsülü açılır.
    Telefonda gösterilmez; dil, sayfa sonundaki Türkçe / English düğmeleriyle değişir. */
function LangPicker() {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const cur = getLang();
  const pick = (l: string) => {
    setOpen(false);
    if (l === cur) return;
    setLang(l);
    if (typeof location !== 'undefined') location.reload();
  };
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open]);
  return (
    <View style={{ position: 'relative' }}>
      <PressScale onPress={() => setOpen((x) => !x)} accessibilityRole="button" accessibilityLabel={t('Dil')} aria-expanded={open} scaleTo={0.94}
        style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: open ? c.surface2 : c.surface }}>
        <Icon name="globe" size={18} />
        <Text v="small" style={{ fontFamily: fonts.bodyBold, fontSize: 14 }}>{cur.toUpperCase()}</Text>
      </PressScale>
      {open ? (
        <>
          <Pressable accessibilityLabel={t('Kapat')} onPress={() => setOpen(false)} style={{ position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0, zIndex: 29 }} />
          <Animated.View entering={FadeInDown.duration(160)} exiting={FadeOut.duration(120)}
            style={[{ position: 'absolute', top: 46, right: 0, zIndex: 30, flexDirection: 'row', padding: 4, gap: 2, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }, { boxShadow: shadows.soft } as any]}>
            {[['tr', 'TR', 'Türkçe'], ['en', 'EN', 'English']].map(([l, label, name]) => {
              const on = l === cur;
              return (
                <PressScale key={l} onPress={() => pick(l)} accessibilityRole="button" accessibilityLabel={name} accessibilityState={{ selected: on }} scaleTo={0.94}
                  style={{ minWidth: 44, minHeight: 36, paddingHorizontal: 12, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.surface2 : 'transparent' }}>
                  <Text v="small" style={{ fontFamily: on ? fonts.bodyBold : fonts.bodyMedium, fontSize: 14 }}>{label}</Text>
                </PressScale>
              );
            })}
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

/** Açılır özellik menüsü: solda kategoriler, ortada maddeler. Bir kategoriye ya da maddeye basınca
    sayfa o kategorinin sekmesine kayar; bütün özellikler aynı anda açılmaz. */
function FeatureMenu({ onPick, go, signedIn }: { onPick: (id: string) => void; go: (p: string) => void; signedIn: boolean }) {
  const c = useColors();
  const { desktop } = useBreakpoint();
  const cats = categories();
  const [active, setActive] = useState(cats[0].id);
  const cur = cats.find((x) => x.id === active) || cats[0];
  return (
    <View style={{ position: 'absolute', top: 66, left: 0, right: 0, zIndex: 60 }}>
      <Animated.View entering={FadeInDown.duration(200)} exiting={FadeOut.duration(120)}
        style={{ backgroundColor: c.surface, borderRadius: 32, borderWidth: 1, borderColor: c.line, padding: 14, flexDirection: 'row', gap: 6, boxShadow: shadows.lift }}>
        <View style={{ width: 270, gap: 4 }} accessibilityRole="tablist">
          {cats.map((cat) => {
            const on = cat.id === active;
            return (
              <Pressable key={cat.id} onHoverIn={() => setActive(cat.id)} onPress={() => onPick(cat.id)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, minHeight: 50, borderRadius: 18, backgroundColor: on ? c.surface2 : 'transparent' }}>
                <Icon name={cat.icon} size={20} color={on ? c.accentText : c.ink} />
                <RNText style={{ flex: 1, fontFamily: on ? fonts.bodyXBold : fonts.bodyBold, fontSize: 16, color: c.ink }}>{cat.title}</RNText>
                <View style={{ transform: [{ rotate: '180deg' }], opacity: on ? 1 : 0.35 }}><Icon name="back" size={16} /></View>
              </Pressable>
            );
          })}
        </View>
        <View style={{ width: 1, backgroundColor: c.line, marginVertical: 8 }} />
        <Animated.View key={cur.id} entering={FadeIn.duration(220)} style={{ flex: 1, paddingHorizontal: 22, paddingVertical: 10, gap: 18 }}>
          <RNText style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.muted }}>{cur.lead}</RNText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 28, rowGap: 18 }}>
            {cur.items.map((it) => (
              <PressScale key={it.title} onPress={() => onPick(cur.id)} accessibilityRole="link" scaleTo={0.98} style={{ width: desktop ? '46%' : '100%', gap: 4 }}>
                <RNText style={{ fontFamily: fonts.bodyXBold, fontSize: 16, color: c.ink }}>{it.title}</RNText>
                <RNText style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.muted }}>{it.body}</RNText>
              </PressScale>
            ))}
          </View>
          <PressScale onPress={() => onPick(cur.id)} accessibilityRole="link" style={{ alignSelf: 'flex-start' }}>
            <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 14, color: c.accentText }}>{t('{name} bölümüne git', { name: cur.title })} ›</RNText>
          </PressScale>
        </Animated.View>
        {desktop && !signedIn && (
          <>
            <View style={{ width: 1, backgroundColor: c.line, marginVertical: 8 }} />
            <View style={{ width: 260, padding: 10, gap: 12, justifyContent: 'center' }}>
              <RNText style={{ fontFamily: fonts.siteBold, fontSize: 20, lineHeight: 22, letterSpacing: -0.4, color: c.ink }}>{t('1 ay ücretsiz dene')}</RNText>
              <Text v="small" muted>{t('Kiracılar her zaman ücretsiz. Mülk sahipleri her paketi 1 ay ücretsiz dener.')}</Text>
              <Button kind="primary" title={t('Hesap oluştur')} onPress={() => go('/kayit')} />
            </View>
          </>
        )}
      </Animated.View>
    </View>
  );
}
