import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import SignedIn from './SignedIn';
import AuthShell from './AuthShell';
import { Entry, useAuth } from './auth';
import { Captcha } from './captcha';
import { t } from '../domain/i18n';
import { Button, Field, PressScale, Text } from '../ui/kit';
import { useColors } from '../ui/theme';

const TITLE: Record<Entry, string> = { tenant: 'Kiracı girişi', landlord: 'Mülk sahibi girişi', admin: 'Yönetici girişi' };

export default function LoginForm({ as }: { as: Entry }) {
  const { user, ready, signIn, live } = useAuth();
  const router = useRouter();
  const c = useColors();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Bu formdan giriş yapılınca panele geçilir; sayfa açılırken oturum zaten açıksa seçenek gösterilir.
  const [sent, setSent] = useState(false);
  if (ready && user && !sent) return <SignedIn user={user} />;
  const submit = async () => {
    setBusy(true); setErr(null); setSent(true);
    const e = await signIn(email, pw, as);
    setBusy(false);
    if (e) { setErr(e); setSent(false); } else router.replace(as === 'admin' ? '/admin' : '/uygulama');
  };
  return (
    <AuthShell title={t(TITLE[as])} lead={live ? undefined : t('Bu sürümde hesap bu cihazda tutulur. Sunucu kurulunca hesaplar cihazlar arası çalışır.')}>
      <Field label={t('E-posta')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Field label={t('Şifre')} value={pw} onChangeText={setPw} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} error={err} />
      <Captcha />
      <Button kind="primary" block title={t('Giriş yap')} onPress={submit} loading={busy} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <PressScale onPress={() => router.push('/sifre')} accessibilityRole="link"><Text v="small" color={c.accentText} style={{ fontWeight: '700' }}>{t('Şifremi unuttum')}</Text></PressScale>
        {as !== 'admin' ? <PressScale onPress={() => router.push(as === 'tenant' ? '/kayit/kiraci' : '/kayit/mulk-sahibi')} accessibilityRole="link"><Text v="small" color={c.accentText} style={{ fontWeight: '700' }}>{t('Hesabın yok mu? Kayıt ol')}</Text></PressScale> : null}
      </View>
      {as !== 'admin' ? (
        <PressScale onPress={() => router.replace(as === 'tenant' ? '/giris/mulk-sahibi' : '/giris/kiraci')} accessibilityRole="link">
          <Text v="small" muted>{as === 'tenant' ? t('Mülk sahibi misin? Mülk sahibi girişi') : t('Kiracı mısın? Kiracı girişi')}</Text>
        </PressScale>
      ) : null}
    </AuthShell>
  );
}
