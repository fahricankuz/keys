import { useEffect, useMemo, useState } from 'react';
import { Text as RNText, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { t } from '../domain/i18n';
import { loadRates } from '../domain/cpi';
import { Button, Container, PressScale, Text } from '../ui/kit';
import { fonts, radius, shadows, useBreakpoint, useColors } from '../ui/theme';
import { Icon } from '../app-ui/blocks';
import { Reveal } from '../ui/Reveal';
import SitePage from '../site/SitePage';
import { openPage } from '../site/Navbar';
import { Display } from '../site/Landing';
import { BrandBand, Headline } from '../site/SegmentParts';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const key = (y: number, m: number) => { const d = new Date(y, m, 1); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
const label = (k: string) => { const [y, m] = k.split('-').map(Number); return t(MONTHS[m - 1]) + ' ' + y; };
const num = (s: string) => { const v = s.replace(/\./g, '').replace(',', '.').trim(); return v === '' ? NaN : Number(v); };
const tl = (n: number) => '₺' + Math.round(n).toLocaleString('tr-TR');
const pct = (n: number) => '%' + n.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FAQ: [string, string][] = [
  ['Kira artış oranı nasıl hesaplanır?', 'Konut ve çatılı işyeri kiralarında yenilenen dönemdeki artış, bir önceki kira yılında TÜFE’nin 12 aylık ortalamalara göre değişim oranını geçemez (TBK 344). Yeni kira = mevcut kira × (1 + oran ÷ 100).'],
  ['Hangi ayın TÜFE oranını kullanmalıyım?', 'Kira yılının dolduğu ayda açıklanmış en son TÜİK bültenini kullan. Kasım’da yenilenen bir sözleşme için Kasım başında açıklanan Ekim verisi uygulanır.'],
  ['Yüzde 25 kira artış sınırı hâlâ geçerli mi?', 'Hayır. Konut kiralarındaki geçici yüzde 25 sınırı Temmuz 2024’te sona erdi. Bugün sınır, TÜFE 12 aylık ortalamalara göre değişim oranıdır.'],
  ['İşyeri kiralarında da aynı sınır var mı?', 'Evet. TBK 344 konut ve çatılı işyeri kiralarında aynı sınırı öngörür. İşyerlerinde stopaj ayrıca hesaplanır.'],
  ['Sözleşmede daha düşük oran yazıyorsa ne olur?', 'Sözleşmedeki oran yasal sınırdan düşükse o oran uygulanır; daha yüksekse yasal sınır geçerlidir.'],
  ['Beş yıldan uzun kiralarda ne değişir?', 'Beş yılı aşan kira ilişkilerinde yeni bedel, TÜFE ile birlikte emsal kiralar dikkate alınarak hâkim tarafından belirlenebilir. Dava öncesi arabuluculuk zorunludur.']
];

function Input({ label: l, value, onChange, placeholder, hint }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string }) {
  const c = useColors();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 8, flexGrow: 1, flexBasis: 180 }}>
      <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{l}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={c.muted} inputMode="decimal" keyboardType="decimal-pad"
        accessibilityLabel={l} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={[{ minHeight: 56, borderRadius: radius.md, paddingHorizontal: 18, backgroundColor: c.bg, color: c.ink, borderWidth: 1.5, borderColor: focus ? c.accent : c.line,
          fontFamily: fonts.bodyBold, fontSize: 19 }, { outlineStyle: 'none' } as any]} />
      {hint ? <Text v="small" muted style={{ fontSize: 13 }}>{hint}</Text> : null}
    </View>
  );
}

export default function KiraArtis() {
  const c = useColors();
  const router = useRouter();
  const { phone, desktop } = useBreakpoint();
  const now = new Date();
  const [ym, setYm] = useState<[number, number]>([now.getFullYear(), now.getMonth()]);
  const [rent, setRent] = useState('');
  const [manual, setManual] = useState('');
  const [contract, setContract] = useState('');
  const [rates, setRates] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<number | null>(0);
  useEffect(() => { loadRates().then((r: any) => setRates(r || {})); }, []);

  const renewal = key(ym[0], ym[1]);
  const dataKey = key(ym[0], ym[1] - 1);                     // yenilemeden önceki ayın verisi
  const auto = rates[dataKey] ?? null;
  const cap = !isNaN(num(manual)) ? num(manual) : auto;
  const r = num(rent), k = num(contract);
  const applied = cap == null ? null : !isNaN(k) && k < cap ? k : cap;
  const next = applied != null && r > 0 ? r * (1 + applied / 100) : null;
  const shift = (d: number) => { const x = new Date(ym[0], ym[1] + d, 1); setYm([x.getFullYear(), x.getMonth()]); };
  const table = useMemo(() => Object.keys(rates).sort().reverse().slice(0, 24), [rates]);
  const year = now.getFullYear();

  return (
    <SitePage>
      <Container style={{ paddingTop: phone ? 32 : 80, flexDirection: desktop ? 'row' : 'column', gap: phone ? 28 : 56, alignItems: desktop ? 'center' : 'stretch' }}>
        <Reveal style={{ flex: desktop ? 1 : undefined, gap: phone ? 12 : 18 }}>
          <Text v="label" color={c.accentText} style={{ fontSize: 13, letterSpacing: 0.4 }}>{t('Ücretsiz araç')}</Text>
          <Headline parts={[t('Kira artış oranı'), t('hesaplama'), String(year)]} size={phone ? 34 : 60} />
          <Text v="body" muted style={{ fontSize: phone ? 16 : 20, lineHeight: phone ? 24 : 30, maxWidth: 560 }}>
            {t('Yasal zam tavanını ve yeni kira bedelini TÜİK’in açıkladığı 12 aylık ortalama TÜFE oranıyla hesapla. Konut ve işyeri kiraları için geçerlidir.')}
          </Text>
          <View style={{ gap: 8, marginTop: 4 }}>
            {[t('TÜFE oranı her ay kendiliğinden güncellenir'), t('Sözleşmedeki oran düşükse onu uygular'), t('Aylık ve yıllık farkı gösterir')].map((x) => (
              <View key={x} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c.okBg, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={14} color={c.okInk} /></View>
                <Text v="body" style={{ fontSize: 16 }}>{x}</Text>
              </View>
            ))}
          </View>
        </Reveal>

        <Reveal delay={100} style={{ flex: desktop ? 1 : undefined }}>
          <View accessibilityRole="form" aria-label={t('Kira artışı hesaplayıcı')}
            style={{ backgroundColor: c.surface, borderRadius: phone ? 26 : 34, borderWidth: 1, borderColor: c.line, padding: phone ? 20 : 30, gap: 16, boxShadow: shadows.lift } as any}>
            <View style={{ flexDirection: 'row' }}>
              <Input label={t('Mevcut aylık kira (₺)')} value={rent} placeholder="25.000" onChange={(v) => setRent(v.replace(/[^0-9.,]/g, ''))} />
            </View>
            <View style={{ gap: 8 }}>
              <Text v="small" style={{ fontFamily: fonts.bodyBold }}>{t('Kira yenileme ayı')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.bg, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.line, minHeight: 56 }}>
                <PressScale onPress={() => shift(-1)} accessibilityRole="button" accessibilityLabel={t('Önceki ay')} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}><Icon name="back" size={18} /></PressScale>
                <Text v="body" style={{ flex: 1, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 18 }} accessibilityLiveRegion="polite">{label(renewal)}</Text>
                <PressScale onPress={() => shift(1)} accessibilityRole="button" accessibilityLabel={t('Sonraki ay')} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '180deg' }] }}><Icon name="back" size={18} /></PressScale>
              </View>
              <Text v="small" color={auto != null ? c.okInk : c.muted} style={{ fontSize: 13.5 }}>
                {auto != null ? t('TÜİK {m} verisi: {r}', { m: label(dataKey), r: pct(auto) }) : t('{m} verisi henüz sistemde yok; TÜİK bültenindeki oranı aşağıya gir.', { m: label(dataKey) })}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              <Input label={t('TÜFE oranı (%)')} value={manual} placeholder={auto != null ? String(auto).replace('.', ',') : '33,45'} onChange={(v) => setManual(v.replace(/[^0-9.,]/g, ''))} />
              <Input label={t('Sözleşmedeki oran (%)')} value={contract} placeholder={t('isteğe bağlı')} onChange={(v) => setContract(v.replace(/[^0-9.,]/g, ''))} />
            </View>
            <View accessibilityLiveRegion="polite" style={{ backgroundColor: next != null ? c.lemon : c.tile, borderRadius: 22, padding: phone ? 18 : 22, gap: 4 }}>
              <Text v="small" color="#1D1A19" style={{ fontFamily: fonts.bodyBold }}>{t('Yeni kira en fazla')}</Text>
              <RNText style={{ fontFamily: fonts.siteBold, fontSize: phone ? 38 : 50, lineHeight: phone ? 42 : 54, letterSpacing: -1.5, color: next != null ? '#1D1A19' : c.muted }}>{next != null ? tl(next) : '₺—'}</RNText>
              {next != null && applied != null ? (
                <>
                  <Text v="small" color="#1D1A19" style={{ fontFamily: fonts.bodyBold }}>+{tl(next - r)} / {t('ay')} · +{tl((next - r) * 12)} / {t('yıl')}</Text>
                  <Text v="small" color="#3B2A00">{t('Uygulanan oran')}: {pct(applied)} {applied === k ? t('(sözleşmedeki oran)') : t('(yasal üst sınır)')}</Text>
                </>
              ) : <Text v="small" muted>{t('Kirayı ve oranı gir; sonuç burada görünür.')}</Text>}
            </View>
          </View>
        </Reveal>
      </Container>

      <Container style={{ paddingTop: phone ? 56 : 120, maxWidth: 820, gap: 14 }}>
        <Display size={phone ? 24 : 40}>{t('Kira artışı nasıl hesaplanır?')}</Display>
        <Text v="body" style={{ fontSize: phone ? 16 : 18, lineHeight: phone ? 25 : 29 }}>{t('Türk Borçlar Kanunu’nun 344. maddesine göre konut ve çatılı işyeri kiralarında yenilenen dönemdeki artış, bir önceki kira yılında TÜFE’nin 12 aylık ortalamalara göre değişim oranını geçemez.')}</Text>
        <View style={{ backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: c.line, borderLeftWidth: 4, borderLeftColor: c.accent, padding: 18 }}>
          <Text v="body" style={{ fontFamily: fonts.bodyXBold, fontSize: phone ? 16 : 19 }}>{t('Yeni kira = Mevcut kira × (1 + TÜFE 12 aylık ortalama ÷ 100)')}</Text>
        </View>
        <Text v="body" style={{ fontSize: phone ? 16 : 18, lineHeight: phone ? 25 : 29 }}>{t('Örnek: 25.000 ₺ kira ve yüzde 40 oranla yeni kira en fazla 25.000 × 1,40 = 35.000 ₺ olur. Taraflar bu tutarın altında anlaşabilir.')}</Text>
      </Container>

      <Container style={{ paddingTop: phone ? 40 : 80, maxWidth: 820, gap: 14 }}>
        <Display size={phone ? 24 : 40}>{t('Son kira artış oranları')}</Display>
        {table.length ? (
          <View style={{ backgroundColor: c.surface, borderRadius: 24, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
            {table.map((m, i) => { const [y, mo] = m.split('-').map(Number); const n = key(y, mo); return (
              <View key={m} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 13, borderTopWidth: i ? 1 : 0, borderColor: c.line, gap: 10 }}>
                <Text v="small" style={{ flex: 1 }}>{label(m)} {t('verisi')}</Text>
                <Text v="small" muted style={{ flex: 1 }}>{t('{m} yenilemeleri', { m: label(n) })}</Text>
                <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{pct(rates[m])}</Text>
              </View>
            ); })}
          </View>
        ) : <Text v="body" muted>{t('Oran tablosu yakında burada. Şimdilik TÜİK bülteninden oranı girerek hesaplayabilirsin.')}</Text>}
      </Container>

      <Container style={{ paddingTop: phone ? 40 : 80, maxWidth: 820, gap: 10 }}>
        <Display size={phone ? 24 : 40}>{t('Sık sorulanlar')}</Display>
        {FAQ.map(([q, a], i) => (
          <PressScale key={q} onPress={() => setOpen(open === i ? null : i)} accessibilityRole="button" aria-expanded={open === i} scaleTo={0.99}
            style={{ backgroundColor: c.surface, borderRadius: 20, borderWidth: 1, borderColor: open === i ? c.accent : c.line, padding: 18, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Text v="body" style={{ flex: 1, fontFamily: fonts.bodyXBold }}>{t(q)}</Text>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: open === i ? '45deg' : '0deg' }] }}><Icon name="plus" size={15} color={c.accent} /></View>
            </View>
            {open === i ? <Text v="body" muted style={{ lineHeight: 24 }}>{t(a)}</Text> : null}
          </PressScale>
        ))}
        <Text v="small" muted style={{ marginTop: 10 }}>{t('Hesaplama genel bilgi amaçlıdır. İşlem yapmadan önce güncel TÜİK bültenini ve sözleşmeni kontrol et.')}</Text>
        <PressScale onPress={() => openPage('blog/kira-artisi-nasil-hesaplanir')} accessibilityRole="link" style={{ alignSelf: 'flex-start' }}>
          <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyBold }}>{t('Rehber: Kira artışı nasıl hesaplanır?')} ›</Text>
        </PressScale>
      </Container>

      <Container style={{ paddingTop: phone ? 48 : 112, paddingBottom: phone ? 56 : 112 }}>
        <BrandBand title={t('Kira artışını her yıl kendin hesaplama.')} body={t('anahtar yenileme tarihini hatırlatır, yasal sınırı hesaplar ve teklifi kiracına tek dokunuşla gönderir.')}
          action={<Button kind="onDark" title={t('1 ay ücretsiz dene')} onPress={() => router.push('/kayit/mulk-sahibi' as any)} />} />
      </Container>
    </SitePage>
  );
}

