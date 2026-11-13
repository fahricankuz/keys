import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import AuthShell from '../auth/AuthShell';
import { useAuth } from '../auth/auth';
import { clearLinkFromUrl, useAuthLink } from '../auth/auth-link';
import * as backend from '../domain/backend';
import { t } from '../domain/i18n';
import { Button, Field, PressScale, Text } from '../ui/kit';
import { fonts, useColors } from '../ui/theme';

type Phase = 'check' | 'form' | 'expired' | 'device' | 'done';

/** Şifre sıfırlama e-postasındaki bağlantının indiği sayfa: bağlantıdaki PKCE kodunu doğrular, yeni şifreyi alır.
    Kod yalnızca isteğin yapıldığı cihazda oturuma çevrilir; başka cihazda açılırsa açıklama gösterilir. */
export default function YeniSifre() {
  const { signOut } = useAuth();
  const router = useRouter();
  const c = useColors();
  const { ready, link } = useAuthLink();
  const [phase, setPhase] = useState<Phase>('check');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!ready || started.current) return;
    started.current = true;
    (async () => {
      if (link.error || !link.code) return setPhase('expired');
      const r = await backend.exchangeAuthCode(link.code, link.flowId);
      clearLinkFromUrl();
      setPhase(r === 'ok' ? 'form' : r === 'device' ? 'device' : 'expired');
    })().catch(() => setPhase('expired'));
  }, [ready, link]);

  const submit = async () => {
    setErr(null);
    if (pw.length < 8) return setErr(t('Şifre en az 8 karakter olmalı.'));
    if (pw !== pw2) return setErr(t('Şifreler aynı değil.'));
    setBusy(true);
    try {
      const cl = await backend.client();
      const { error } = await cl.auth.updateUser({ password: pw });
      if (error) setErr(backend.humanError(error));
      else { await signOut(); setPhase('done'); }
    } catch (e) { setErr(backend.humanError(e)); }
    setBusy(false);
  };

  const toLogin = <Button block title={t('Giriş yap')} onPress={() => router.replace('/giris')} />;
  if (phase === 'check') return <AuthShell title={t('Yeni şifre belirle')} lead={t('Bağlantın doğrulanıyor…')}><></></AuthShell>;
  if (phase === 'expired') return (
    <AuthShell title={t('Bağlantı geçersiz')} lead={t('Bu şifre yenileme bağlantısının süresi dolmuş ya da daha önce kullanılmış. Yeni bir bağlantı iste.')}>
      <Button block title={t('Yeni bağlantı iste')} onPress={() => router.replace('/sifre')} />
      <PressScale onPress={() => router.replace('/giris')} accessibilityRole="link"><Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyBold }}>{t('Girişe dön')}</Text></PressScale>
    </AuthShell>
  );
  if (phase === 'device') return (
    <AuthShell title={t('Bağlantıyı başka cihazda açtın')} lead={t('Güvenliğin için şifre yenileme bağlantısı yalnızca isteği yaptığın cihazda ve uygulamada ya da tarayıcıda çalışır. Bağlantıyı orada aç ya da buradan yeni bir bağlantı iste.')}>
      <Button block title={t('Yeni bağlantı iste')} onPress={() => router.replace('/sifre')} />
      <PressScale onPress={() => router.replace('/giris')} accessibilityRole="link"><Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyBold }}>{t('Girişe dön')}</Text></PressScale>
    </AuthShell>
  );
  if (phase === 'done') return (
    <AuthShell title={t('Şifren yenilendi')} lead={t('Yeni şifrenle giriş yapabilirsin.')}>{toLogin}</AuthShell>
  );
  return (
    <AuthShell title={t('Yeni şifre belirle')} lead={t('Hesabın için yeni bir şifre yaz.')}>
      <Field label={t('Yeni şifre')} value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" hint={t('En az 8 karakter.')} />
      <Field label={t('Şifre (tekrar)')} value={pw2} onChangeText={setPw2} secureTextEntry autoComplete="new-password" onSubmitEditing={submit} error={err} />
      <Button block title={t('Şifreyi kaydet')} onPress={submit} loading={busy} />
    </AuthShell>
  );
}
