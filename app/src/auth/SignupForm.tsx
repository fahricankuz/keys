import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { useRouter } from 'expo-router';
import AuthShell from './AuthShell';
import SignedIn from './SignedIn';
import { keepInvite, pendingInvite, pendingPrefill, Role, useAuth } from './auth';
import { Captcha } from './captcha';
import { CONFIG } from '../domain/config';
import { t } from '../domain/i18n';
import { Button, Field, PressScale, Text } from '../ui/kit';
import { fonts, useColors } from '../ui/theme';

export default function SignupForm({ role }: { role: Role }) {
  const { user, ready, signUp, live } = useAuth();
  const router = useRouter();
  const c = useColors();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  // Kiracı ve ekip: davet kodu isteğe bağlıdır; /katil bağlantısıyla gelindiyse kendiliğinden dolar.
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [phone, setPhone] = useState('');
  useEffect(() => {
    // Davet e-postasındaki bağlantı (/kayit/kiraci?kod=…&ad=…&e=…): kod, ad ve e-posta kendiliğinden dolar.
    let q: URLSearchParams | null = null;
    try { q = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null; } catch {}
    const fromLink = (q?.get('kod') || '').trim().toUpperCase();
    if (fromLink) keepInvite(fromLink);
    const k = fromLink || pendingInvite(); if (k) setCode(k);
    const ad = (q?.get('ad') || '').trim(), e = (q?.get('e') || '').trim();
    if (ad) setName(ad.slice(0, 60));
    if (e) setEmail(e);
    // Site davetinden gelindiyse yönetimin girdiği bilgiler hazır gelir (kişi değiştirebilir).
    const pre = role === 'tenant' ? pendingPrefill() : null;
    if (pre) { if (pre.name) setName(pre.name); if (pre.email) setEmail(pre.email); if (pre.phone) setPhone(pre.phone); }
  }, [role]);
  if (ready && user && !sent) return <SignedIn user={user} />;

  const landlord = role === 'landlord';
  const team = role === 'team';
  const withCode = !landlord;

  const submit = async () => {
    if (pw && pw2 !== pw) { setErr(t('Şifreler aynı değil.')); return; }
    if (!consent) { setErr(t('Devam etmek için koşulları kabul etmelisin.')); return; }
    if (withCode && code.trim()) keepInvite(code);
    setBusy(true); setErr(null); setSent(true);
    const e = await signUp({ name, email, password: pw, role, phone });
    setBusy(false);
    if (e === 'CONFIRM') { setSent(false); setInfo(t('E-postana bir onay bağlantısı gönderdik. Bağlantıya tıklayınca hesabın açılır ve doğrudan paneline geçersin.') + (withCode && code.trim() ? ' ' + t('Davet kodun kaydedildi; ilk girişte otomatik kullanılacak.') : '')); }
    else if (e) { setSent(false); setErr(e); }
    else router.replace('/uygulama');
  };

  const title = team ? t('Ekip hesabı oluştur') : landlord ? t('Mülk sahibi olarak kayıt ol') : t('Kiracı olarak kayıt ol');
  const lead = team
    ? t('Emlakçı, muhasebeci ve personel hesapları ücretsizdir. Hesabı açınca davet edildiğin ekibe katılırsın.')
    : landlord ? (CONFIG.billing.cardTrial ? t('1 ay ücretsiz başla: kart bilgin ya da App Store / Google Play hesabın gerekir. İptal etmezsen ay sonunda seçtiğin paket başlar; çekimden 1 gün önce hatırlatırız.') : t('1 ay ücretsiz dene. Deneme süresince bütün özellikleri kullanabilirsin.')) : t('Kiracı hesabı her zaman ücretsizdir.');

  return (
    <AuthShell title={title} lead={lead}>
      <Field label={t('Ad soyad')} value={name} onChangeText={setName} autoComplete="name" maxLength={60} />
      <Field label={t('E-posta')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      {role === 'tenant' ? <Field label={t('Telefon (isteğe bağlı)')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" maxLength={30} /> : null}
      <Field label={t('Şifre')} value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" hint={t('En az 8 karakter.')} />
      <Field label={t('Şifre (tekrar)')} value={pw2} onChangeText={setPw2} secureTextEntry autoComplete="new-password" />
      {withCode ? (
        <Field
          label={team ? t('Ekip davet kodu (isteğe bağlı)') : t('Davet kodu (isteğe bağlı)')}
          value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" maxLength={12}
          hint={team
            ? t('Kodu mülk sahibi “Ekip” ekranından oluşturur. Şimdi girmezsen hesabını açtıktan sonra da girebilirsin.')
            : t('Kodu ev sahibin anahtar’da oluşturur. Şimdi girmezsen hesabını açtıktan sonra da girebilirsin.')}
        />
      ) : null}
      <PressScale onPress={() => setConsent(!consent)} accessibilityRole="checkbox" aria-checked={consent} accessibilityState={{ checked: consent }} scaleTo={0.99} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View style={{ width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: consent ? c.accent : c.line, backgroundColor: consent ? c.accent : c.surface, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
          {consent && <Text v="small" color={c.accentInk} style={{ fontFamily: fonts.bodyXBold, lineHeight: 18 }}>✓</Text>}
        </View>
        <Text v="small" muted style={{ flex: 1 }}>
          <Text v="small" color={c.accentText} onPress={() => Linking.openURL(CONFIG.legal.terms)}>{t('Kullanım Koşulları’nı')}</Text>
          {t(' kabul ediyorum; ')}
          <Text v="small" color={c.accentText} onPress={() => Linking.openURL(CONFIG.legal.privacy)}>{t('Gizlilik ve KVKK Aydınlatma Metni’ni')}</Text>
          {t(' okudum.')}
        </Text>
      </PressScale>
      {err ? <Text v="small" color={c.badInk}>{err}</Text> : null}
      {info ? <Text v="small" color={c.okInk}>{info}</Text> : null}
      {team && !live ? <Text v="small" muted>{t('Ekip hesapları yalnızca sunucuya bağlı kurulumda açılır.')}</Text> : null}
      <Captcha />
      <Button kind="primary" block title={landlord ? t('1 ay ücretsiz başla') : t('Hesap oluştur')} onPress={submit} loading={busy} />
      <PressScale onPress={() => router.push(landlord || team ? '/giris/mulk-sahibi' : '/giris/kiraci')} accessibilityRole="link"><Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyBold }}>{t('Hesabın var mı? Giriş yap')}</Text></PressScale>
      {team ? null : (
        <PressScale onPress={() => router.replace(landlord ? '/kayit/kiraci' : '/kayit/mulk-sahibi')} accessibilityRole="link"><Text v="small" muted>{landlord ? t('Kiracı mısın? Kiracı olarak kayıt ol') : t('Mülk sahibi misin? Mülk sahibi olarak kayıt ol')}</Text></PressScale>
      )}
    </AuthShell>
  );
}
