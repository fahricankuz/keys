import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { useRouter } from 'expo-router';
import SignedIn from './SignedIn';
import AuthShell from './AuthShell';
import { Entry, useAuth } from './auth';
import { Captcha } from './captcha';
import { t } from '../domain/i18n';
import { ui } from '../domain/state';
import { Button, Field, PressScale, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Icon } from '../app-ui/blocks';
import { activeCtx, Ctx, myContexts, selectCtx } from '../app-ui/ctx';

/** Tek giriş: e-posta ve şifre. Hesap türü sorulmaz; roller hesaptan okunur. Birden çok rolü olan kişi girişten sonra
    hangi rolle devam edeceğini seçer (sonradan üstteki rol seçiciden değiştirir). Yönetici girişi ayrıdır (as="admin"). */
export default function LoginForm({ as = 'user' }: { as?: Entry }) {
  const { user, ready, signIn, live } = useAuth();
  const router = useRouter();
  const c = useColors();
  const admin = as === 'admin';
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Bu formdan giriş yapılınca panele geçilir; sayfa açılırken oturum zaten açıksa seçenek gösterilir.
  const [sent, setSent] = useState(false);
  const [roles, setRoles] = useState<Ctx[] | null>(null);
  // E-posta onay bağlantısından gelindi (/giris?dogrulandi=1). Statik çıktıda adres parametresi yoktur; hidrasyondan sonra okunur.
  const [verified, setVerified] = useState(false);
  useEffect(() => { if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location && /[?&]dogrulandi=1/.test(window.location.search)) setVerified(true); }, []);
  if (ready && user && !sent) return <SignedIn user={user} />;
  const submit = async () => {
    setBusy(true); setErr(null); setSent(true);
    const e = await signIn(email, pw, as);
    setBusy(false);
    if (e) { setErr(e); setSent(false); return; }
    if (admin) { router.replace('/admin'); return; }
    const list = myContexts();
    if (list.length > 1) setRoles(list); else router.replace('/uygulama');
  };
  if (roles) {
    const last = activeCtx(roles);
    return (
      <AuthShell title={t('Hangi rolle devam edeceksin?')} lead={t('Bu hesapta birden çok rolün var. Sonradan menünün üstündeki seçiciden değiştirebilirsin.')}>
        <View accessibilityRole="menu" style={{ gap: 10 }}>
          {roles.map((x) => (
            <PressScale key={x.key} onPress={() => router.replace(selectCtx(x.key) as any)} accessibilityRole="menuitem" accessibilityLabel={x.label + (x.sub ? ', ' + x.sub : '')} scaleTo={0.98}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.lg, backgroundColor: c.surface, borderWidth: 1.5, borderColor: x.key === last ? c.accent : c.line }}>
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={x.icon} size={20} color={c.accent} /></View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text v="body" numberOfLines={1} style={{ fontFamily: fonts.bodyXBold }}>{x.label}</Text>
                {x.sub ? <Text v="small" muted numberOfLines={1}>{x.sub}</Text> : null}
              </View>
              <View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="back" size={16} color={c.accentText} /></View>
            </PressScale>
          ))}
        </View>
      </AuthShell>
    );
  }
  return (
    <AuthShell top={admin ? undefined : { label: t('Hesabın yok mu?'), action: t('Kayıt ol'), href: '/kayit' }} title={admin ? t('Yönetici girişi') : t('Giriş yap')} lead={live ? (admin ? undefined : t('Kiracı, mülk sahibi, site sakini ya da site yöneticisi: hepsi aynı girişten.')) : t('Bu sürümde hesap bu cihazda tutulur. Sunucu kurulunca hesaplar cihazlar arası çalışır.')}>
      {ui.authMsg && !admin ? (
        <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.tile, borderRadius: radius.md, padding: 14 }}>
          <Icon name="key" size={18} />
          <Text v="small" style={{ flex: 1, fontFamily: fonts.bodyBold }}>{ui.authMsg}</Text>
        </View>
      ) : null}
      {verified && !admin ? (
        <View accessibilityRole="alert" style={{ flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: c.okBg, borderRadius: radius.md, padding: 14 }}>
          <Icon name="check" size={18} color={c.okInk} />
          <Text v="small" color={c.okInk} style={{ flex: 1, fontFamily: fonts.bodyBold }}>{t('E-posta adresin doğrulandı. Şimdi giriş yapabilirsin.')}</Text>
        </View>
      ) : null}
      <Field label={t('E-posta')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
      <Field label={t('Şifre')} value={pw} onChangeText={setPw} secureTextEntry autoComplete="current-password" textContentType="password" onSubmitEditing={submit} error={err} />
      <Captcha />
      <Button kind="primary" block title={t('Giriş yap')} onPress={submit} loading={busy} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <PressScale onPress={() => router.push('/sifre')} accessibilityRole="link"><Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyBold }}>{t('Şifremi unuttum')}</Text></PressScale>
        {!admin && live && Platform.OS === 'web' ? (
          <PressScale onPress={() => router.push('/giris/yonetici')} accessibilityRole="link"><Text v="small" muted>{t('Yönetici girişi')}</Text></PressScale>
        ) : null}
      </View>
    </AuthShell>
  );
}
