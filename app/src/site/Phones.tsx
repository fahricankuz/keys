/* Ana sayfa telefonları (Midas örneği): ortada koyu temalı ödeme ekranı, yanlarda hafif eğik açık temalı
   portföy ve talep ekranları. Telefonların alt kısmı zemine doğru soluklaşarak kesilir.
   Ekranlar uygulamanın gerçek parçalarından çizilir; renkler temadan bağımsız olarak verilen paletten gelir. */
import { ReactNode } from 'react';
import { Platform, Text as RNText, View } from 'react-native';
import { t } from '../domain/i18n';
import { demo } from './money';
import { Icon } from '../app-ui/blocks';
import { dark as DARK, fonts, light as LIGHT, radius, shadows, useColors } from '../ui/theme';

type Pal = typeof LIGHT;
type Screen = 'pay' | 'owner' | 'req';

function Pill({ pal, tone, label, u }: { pal: Pal; tone: 'ok' | 'warn' | 'bad' | 'neutral'; label: string; u: number }) {
  const [bg, fg] = tone === 'ok' ? [pal.okBg, pal.okInk] : tone === 'warn' ? [pal.warnBg, pal.warnInk] : tone === 'bad' ? [pal.badBg, pal.badInk] : [pal.surface2, pal.ink];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 8 * u, paddingVertical: 3 * u }}>
      <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 10 * u, color: fg }}>{label}</RNText>
    </View>
  );
}

/** Ay karoları (uygulamadaki kira kartıyla aynı mantık): ödendi ✓, kısmi ½, onay bekliyor …, yaklaşan –. */
function Tiles({ pal, u, marks, onDark }: { pal: Pal; u: number; marks: string[]; onDark?: boolean }) {
  const names = [t('Oca'), t('Şub'), t('Mar'), t('Nis'), t('May'), t('Haz'), t('Tem'), t('Ağu'), t('Eyl'), t('Eki'), t('Kas'), t('Ara')];
  const cell = (m: string, i: number) => {
    const paid = m === '✓', part = m === '½', wait = m === '…';
    const bg = paid ? pal.okBg : part ? pal.warnBg : wait ? pal.okBg : 'transparent';
    const fg = paid || wait ? pal.okInk : part ? pal.warnInk : onDark ? 'rgba(250,245,240,0.6)' : pal.muted;
    return (
      <View key={i} style={{ flex: 1, height: 24 * u, borderRadius: 5 * u, backgroundColor: bg, borderWidth: 1, borderStyle: m === '–' ? 'dashed' : 'solid',
        borderColor: m === '–' ? (onDark ? 'rgba(250,245,240,0.3)' : pal.line) : wait ? pal.okInk : bg, alignItems: 'center', justifyContent: 'center' }}>
        <RNText style={{ fontFamily: fonts.body, fontSize: 6.5 * u, color: fg }}>{names[i]}</RNText>
        <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 7 * u, lineHeight: 8 * u, color: fg }}>{m}</RNText>
      </View>
    );
  };
  return (
    <View style={{ gap: 3 * u }}>
      <View style={{ flexDirection: 'row', gap: 3 * u }}>{marks.slice(0, 6).map(cell)}</View>
      <View style={{ flexDirection: 'row', gap: 3 * u }}>{marks.slice(6).map((m, i) => cell(m, i + 6))}</View>
    </View>
  );
}

function PayScreen({ pal, u }: { pal: Pal; u: number }) {
  const rows: [string, string, string, 'ok' | 'warn' | 'neutral'][] = [
    ['card', t('Ekim kirası'), t('Ödendi'), 'ok'],
    ['wrench', t('Kombi bakımı'), t('İşlemde'), 'warn'],
    ['calendar', t('Sözleşme yenileme'), t('69 gün'), 'neutral']
  ];
  return (
    <View style={{ gap: 12 * u }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View>
          <RNText style={{ fontFamily: fonts.body, fontSize: 11 * u, color: pal.muted }}>{t('Merhaba Ayşe')}</RNText>
          <RNText style={{ fontFamily: fonts.siteBold, fontSize: 21 * u, color: pal.ink, letterSpacing: -0.4 }}>{t('Ödemeler')}</RNText>
        </View>
        <View style={{ width: 32 * u, height: 32 * u, borderRadius: 16 * u, backgroundColor: pal.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name="bell" size={Math.round(15 * u)} color={pal.ink} /></View>
      </View>
      <View style={{ backgroundColor: pal.surface, borderRadius: 20 * u, padding: 14 * u, gap: 8 * u, borderWidth: 1, borderColor: pal.line }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <RNText style={{ fontFamily: fonts.body, fontSize: 11 * u, color: pal.muted }}>{t('Kasım 2026 kirası')}</RNText>
          <Pill pal={pal} u={u} tone="warn" label={t('3 gün kaldı')} />
        </View>
        <RNText style={{ fontFamily: fonts.display, fontSize: 34 * u, lineHeight: 38 * u, color: pal.ink, letterSpacing: -1 * u, fontVariant: ['tabular-nums'] }}>{demo('₺32.500', '$1,250')}</RNText>
        <Tiles pal={pal} u={u} onDark marks={['✓', '✓', '✓', '✓', '✓', '✓', '✓', '✓', '½', '✓', '–', '–']} />
        <View style={{ backgroundColor: pal.accent, borderRadius: radius.pill, minHeight: 34 * u, alignItems: 'center', justifyContent: 'center', marginTop: 2 * u }}>
          <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 12 * u, color: pal.accentInk }}>{t('Dekont yükle')}</RNText>
        </View>
      </View>
      <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 12 * u, color: pal.ink }}>{t('Yaklaşan işler')}</RNText>
      <View style={{ backgroundColor: pal.surface, borderRadius: 16 * u, borderWidth: 1, borderColor: pal.line, paddingHorizontal: 10 * u }}>
        {rows.map(([icon, title, chip, tone], i) => (
          <View key={title} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 * u, paddingVertical: 9 * u, borderTopWidth: i ? 1 : 0, borderTopColor: pal.line6 }}>
            <View style={{ width: 26 * u, height: 26 * u, borderRadius: 9 * u, backgroundColor: pal.surface2, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={Math.round(13 * u)} color={pal.ink} /></View>
            <RNText numberOfLines={1} style={{ flex: 1, fontFamily: fonts.bodyBold, fontSize: 11 * u, color: pal.ink }}>{title}</RNText>
            <Pill pal={pal} u={u} tone={tone} label={chip} />
          </View>
        ))}
      </View>
    </View>
  );
}

function OwnerScreen({ pal, u }: { pal: Pal; u: number }) {
  const props: [string, string, string[]][] = [
    [t('Moda 3+1'), demo('₺32.500', '$1,250'), ['✓', '✓', '✓', '✓', '✓', '…']],
    [t('Levent ofis'), demo('₺58.000', '$2,200'), ['✓', '✓', '✓', '½', '✓', '✓']],
    [t('Kadıköy 2+1'), demo('₺24.000', '$950'), ['✓', '✓', '✓', '✓', '–', '–']]
  ];
  return (
    <View style={{ gap: 12 * u }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Icon name="back" size={Math.round(16 * u)} color={pal.ink} />
        <Icon name="bell" size={Math.round(16 * u)} color={pal.ink} />
      </View>
      <View style={{ gap: 2 * u }}>
        <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 12 * u, color: pal.ink }}>{t('Portföyüm')}</RNText>
        <RNText style={{ fontFamily: fonts.display, fontSize: 30 * u, lineHeight: 34 * u, color: pal.ink, letterSpacing: -1 * u }}>{demo('₺114.500', '$4,400')}<RNText style={{ color: pal.muted }}>{demo(',00', '.00')}</RNText></RNText>
        <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 10.5 * u, color: pal.okInk }}>%96 {t('tahsil edildi')} <RNText style={{ color: pal.muted, fontFamily: fonts.body }}>· {t('Bu ay')}</RNText></RNText>
      </View>
      <View style={{ flexDirection: 'row', gap: 6 * u }}>
        {[t('Mülk ekle'), t('Davet et'), t('Rapor')].map((x, i) => (
          <View key={x} style={{ backgroundColor: i === 0 ? pal.accent : pal.accentSoft, borderRadius: radius.pill, paddingHorizontal: 11 * u, paddingVertical: 6 * u }}>
            <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 10.5 * u, color: i === 0 ? pal.accentInk : pal.accentText }}>{x}</RNText>
          </View>
        ))}
      </View>
      {props.map(([n, rent, marks]) => (
        <View key={n} style={{ gap: 6 * u, paddingVertical: 8 * u, borderTopWidth: 1, borderTopColor: pal.line }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 11.5 * u, color: pal.ink }}>{n}</RNText>
            <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 11.5 * u, color: pal.ink }}>{rent}</RNText>
          </View>
          <View style={{ flexDirection: 'row', gap: 3 * u }}>
            {marks.map((m, i) => (
              <View key={i} style={{ flex: 1, height: 12 * u, borderRadius: 3 * u, backgroundColor: m === '✓' ? pal.okBg : m === '½' ? pal.warnBg : m === '…' ? pal.surface : 'transparent',
                borderWidth: 1, borderColor: m === '–' ? pal.line : m === '…' ? pal.okInk : 'transparent', borderStyle: m === '–' ? 'dashed' : 'solid' }} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function ReqScreen({ pal, u }: { pal: Pal; u: number }) {
  const reqs: [string, string, number, 'ok' | 'warn' | 'bad'][] = [
    [t('Kombi basıncı düşüyor'), t('Moda 3+1'), 2, 'warn'],
    [t('Mutfak musluğu damlatıyor'), t('Kadıköy 2+1'), 1, 'bad'],
    [t('Klima bakımı'), t('Levent ofis'), 3, 'ok']
  ];
  const steps = [t('Açıldı'), t('Görüldü'), t('İşlemde'), t('Çözüldü')];
  return (
    <View style={{ gap: 12 * u }}>
      <RNText style={{ fontFamily: fonts.siteBold, fontSize: 22 * u, color: pal.ink, letterSpacing: -0.4, marginTop: 4 * u }}>{t('Talepler')}</RNText>
      <View style={{ backgroundColor: pal.surface2, borderRadius: 12 * u, minHeight: 32 * u, flexDirection: 'row', alignItems: 'center', gap: 8 * u, paddingHorizontal: 10 * u }}>
        <Icon name="search" size={Math.round(13 * u)} color={pal.muted} />
        <RNText style={{ fontFamily: fonts.body, fontSize: 11 * u, color: pal.muted }}>{t('Talep ara')}</RNText>
      </View>
      <View style={{ flexDirection: 'row', gap: 14 * u, borderBottomWidth: 1, borderBottomColor: pal.line }}>
        {[t('Açık'), t('İşlemde'), t('Çözüldü')].map((x, i) => (
          <View key={x} style={{ paddingBottom: 6 * u, borderBottomWidth: 2, borderBottomColor: i === 1 ? pal.accent : 'transparent' }}>
            <RNText style={{ fontFamily: i === 1 ? fonts.bodyBold : fonts.body, fontSize: 11.5 * u, color: i === 1 ? pal.accent : pal.muted }}>{x}</RNText>
          </View>
        ))}
      </View>
      {reqs.map(([title, where, st, tone]) => (
        <View key={title} style={{ backgroundColor: pal.surface, borderRadius: 14 * u, borderWidth: 1, borderColor: pal.line, padding: 10 * u, gap: 7 * u }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 * u }}>
            <View style={{ flex: 1 }}>
              <RNText numberOfLines={1} style={{ fontFamily: fonts.bodyBold, fontSize: 11.5 * u, color: pal.ink }}>{title}</RNText>
              <RNText style={{ fontFamily: fonts.body, fontSize: 10 * u, color: pal.muted }}>{where}</RNText>
            </View>
            <Pill pal={pal} u={u} tone={tone} label={steps[st]} />
          </View>
          <View style={{ flexDirection: 'row', gap: 3 * u }}>
            {steps.map((s, i) => <View key={s} style={{ flex: 1, height: 4 * u, borderRadius: 2 * u, backgroundColor: i <= st ? pal.accent : pal.surface2 }} />)}
          </View>
        </View>
      ))}
    </View>
  );
}

/** Tek telefon gövdesi: çerçeve, durum çubuğu, ada ve ekran. Yükseklik iPhone oranındadır. */
function Phone({ w, pal, screen }: { w: number; pal: Pal; screen: Screen }) {
  const u = w / 300;
  const h = Math.round(w * 2.06), r = w * 0.15, bezel = w * 0.03;
  const body: ReactNode = screen === 'pay' ? <PayScreen pal={pal} u={u} /> : screen === 'owner' ? <OwnerScreen pal={pal} u={u} /> : <ReqScreen pal={pal} u={u} />;
  return (
    <View style={{ width: w, height: h, padding: bezel, borderRadius: r, backgroundColor: '#141110', borderWidth: 1.5, borderColor: '#3A3330', boxShadow: shadows.lift }}>
      <View style={{ flex: 1, borderRadius: r - bezel, backgroundColor: pal.bg, overflow: 'hidden' }}>
        <View style={{ height: 42 * u, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 * u }}>
          <RNText style={{ fontFamily: fonts.bodyBold, fontSize: 12 * u, color: pal.ink }}>12:35</RNText>
          <View style={{ width: 80 * u, height: 22 * u, borderRadius: 11 * u, backgroundColor: '#141110' }} />
          <View style={{ flexDirection: 'row', gap: 3 * u, alignItems: 'center' }}>
            {[5, 7, 9, 11].map((x) => <View key={x} style={{ width: 3 * u, height: x * u, borderRadius: 1, backgroundColor: pal.ink }} />)}
            <View style={{ width: 19 * u, height: 9 * u, borderRadius: 3 * u, backgroundColor: pal.ink, marginLeft: 3 * u }} />
          </View>
        </View>
        <View style={{ flex: 1, paddingHorizontal: 16 * u, paddingTop: 6 * u }}>{body}</View>
      </View>
    </View>
  );
}

/** Telefon sahnesi. `count` 3 (masaüstü/tablet) ya da 2 (telefon). Görünen yükseklik `show` oranında kesilir
    ve alt kenar zemin rengine soluklaşır. */
export function PhoneStage({ w, count = 3, show = 0.66 }: { w: number; count?: 2 | 3; show?: number }) {
  const c = useColors();
  const side = Math.round(w * 0.9);
  const h = Math.round(w * 2.06);
  const visible = Math.round(h * show);
  const overlap = side * 0.3;
  // Eğik telefonların köşeleri kesilmesin diye iki yanda pay bırakılır.
  const pad = Math.round(side * 0.14);
  const width = (count === 3 ? w + 2 * (side - overlap) : w + side - overlap) + 2 * pad;
  const fade: any = Platform.OS === 'web'
    ? { backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0) 0%, ${c.bg} 92%)` }
    : { backgroundColor: 'transparent' };
  const tilt = (deg: number, dx: number) => ({ position: 'absolute' as const, top: Math.round(w * 0.16), left: dx, transform: [{ rotate: deg + 'deg' }] });
  return (
    <View accessibilityRole="image" accessibilityLabel={t('anahtar uygulamasında ödemeler, portföy ve talepler ekranları')}
      style={{ width, height: visible, overflow: 'hidden', alignSelf: 'center' }}>
      {/* Telefonların içi süs: ekran okuyucu yalnızca dıştaki açıklamayı okur. */}
      <View aria-hidden style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      {count === 3 ? <View style={tilt(-7, pad)}><Phone w={side} pal={LIGHT} screen="owner" /></View> : null}
      <View style={tilt(7, width - side - pad)}><Phone w={side} pal={LIGHT} screen="req" /></View>
      <View style={{ position: 'absolute', top: 8, left: pad + (count === 3 ? side - overlap : 0), zIndex: 2 }}><Phone w={w} pal={DARK} screen="pay" /></View>
      <View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, height: Math.round(visible * 0.32), zIndex: 3 }, fade]} />
      </View>
    </View>
  );
}
