import { useState } from 'react';
import { useRouter } from 'expo-router';
import AuthShell from '../auth/AuthShell';
import { useAuth } from '../auth/auth';
import { Captcha } from '../auth/captcha';
import { t } from '../domain/i18n';
import { Button, Field, PressScale, Text } from '../ui/kit';
import { fonts, useColors } from '../ui/theme';

export default function Sifre() {
  const { reset } = useAuth();
  const router = useRouter();
  const c = useColors();
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); setErr(null); const e = await reset(email); setBusy(false); if (e) setErr(e); else setSent(true); };
  return (
    <AuthShell title={t('Şifreni mi unuttun?')} lead={t('E-posta adresini yaz; şifreni yenilemen için bir bağlantı gönderelim.')}>
      <Field label={t('E-posta')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" onSubmitEditing={submit} error={err} />
      {sent ? <Text v="small" color={c.okInk}>{t('Bağlantı gönderildi. E-postanı kontrol et.')}</Text> : null}
      <Captcha />
      <Button block title={t('Bağlantı gönder')} onPress={submit} loading={busy} />
      <PressScale onPress={() => router.push('/giris')} accessibilityRole="link"><Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyBold }}>{t('Girişe dön')}</Text></PressScale>
    </AuthShell>
  );
}
