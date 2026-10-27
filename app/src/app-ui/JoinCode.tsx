import { useState } from 'react';
import { Linking, View } from 'react-native';
import AuthShell from '../auth/AuthShell';
import { useAuth } from '../auth/auth';
import { CONFIG } from '../domain/config';
import { t } from '../domain/i18n';
import { Button, Field, PressScale, Text } from '../ui/kit';
import { fonts, useColors } from '../ui/theme';

/** Mülke bağlı olmayan kiracı ya da hiçbir mülke atanmamış ekip üyesi: mülk sahibinin verdiği kodu girer.
    Kayıtta kod girilmediyse hesap açıldıktan sonra buradan girilir. */
export default function JoinCode({ team = false }: { team?: boolean }) {
  const { user, join, signOut } = useAuth();
  const c = useColors();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); setErr(null); const e = await join(code); setBusy(false); if (e) setErr(e); };
  // Kodu olmayan kiracı ev sahibine anahtar'ı önerebilir.
  const ask = () => Linking.openURL('https://wa.me/?text=' + encodeURIComponent(
    t('Merhaba, kira takibini anahtar üzerinden yapabilir miyiz? Mülkü ekleyip bana davet kodu gönderirsen bağlanırım: {url}', { url: CONFIG.publicUrl })));
  return (
    <AuthShell
      title={team ? t('Ekibe katıl') : t('Mülkine bağlan')}
      lead={team
        ? t('Mülk sahibinden aldığın ekip davet kodunu gir. Kodu mülk sahibi anahtar’da “Ekip” ekranından oluşturur.')
        : t('Mülk sahibinden aldığın davet kodunu gir. Kodu mülk sahibin anahtar’da “Kiracı ekle” ile oluşturur.')}>
      <Text v="small" muted>{user?.name ? t('Merhaba') + ' ' + user.name : t('Hoş geldin')}</Text>
      <Field label={t('Davet kodu')} value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" maxLength={12} onSubmitEditing={submit} error={err} />
      <Button block title={team ? t('Ekibe katıl') : t('Mülke bağlan')} onPress={submit} loading={busy} />
      <View style={{ gap: 8, backgroundColor: c.tile, borderRadius: 16, padding: 14 }}>
        <Text v="small" style={{ fontWeight: '700' }}>{t('Kodun yok mu?')}</Text>
        <Text v="small" muted>{team
          ? t('Mülk sahibinden seni anahtar’da ekibine davet etmesini iste. Davet bağlantısına tıklarsan kod kendiliğinden girilir.')
          : t('Ev sahibinden mülkü anahtar’a ekleyip sana davet kodu göndermesini iste. Davet bağlantısına tıklarsan kod kendiliğinden girilir.')}</Text>
        {team ? null : <Button kind="ghost" title={t('Ev sahibime WhatsApp ile yaz')} onPress={ask} />}
      </View>
      <View style={{ alignItems: 'center' }}><Button kind="ghost" title={t('Çıkış yap')} onPress={() => signOut()} /></View>
    </AuthShell>
  );
}

/** Panelin üstünde: davet koduyla kaydolmamış kiracı paneli gezebilir; mülküne bağlanmak için kodu buradan girer. */
export function JoinBanner() {
  const { join } = useAuth();
  const c = useColors();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => { setBusy(true); setErr(null); const e = await join(code); setBusy(false); if (e) setErr(e); };
  const ask = () => Linking.openURL('https://wa.me/?text=' + encodeURIComponent(
    t('Merhaba, kira takibini anahtar üzerinden yapabilir miyiz? Mülkü ekleyip bana davet kodu gönderirsen bağlanırım: {url}', { url: CONFIG.publicUrl })));
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: c.warnBg, borderRadius: 24, padding: 18, gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text v="body" color={c.warnInk} style={{ fontFamily: fonts.bodyXBold }}>{t('Mülkine bağlan')}</Text>
        <Text v="small" color={c.warnInk}>{t('Mülk eklemek için mülk sahibinden aldığın davet kodu gerekli. Kodu girene kadar ödeme, talep ve belgeler boş görünür.')}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <View style={{ flexGrow: 1, flexBasis: 200 }}>
          <Field label={t('Davet kodu')} value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" maxLength={12} onSubmitEditing={submit} error={err} placeholder="ABCD1234" />
        </View>
        <Button kind="dark" title={t('Mülke bağlan')} onPress={submit} loading={busy} style={{ minHeight: 52 }} />
      </View>
      <PressScale onPress={ask} accessibilityRole="link" style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
        <Text v="small" color={c.warnInk} style={{ fontFamily: fonts.bodyBold, textDecorationLine: 'underline' }}>{t('Kodun yok mu? Ev sahibime WhatsApp ile yaz')}</Text>
      </PressScale>
    </View>
  );
}
