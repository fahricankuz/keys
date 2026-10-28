import { useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import AuthShell from '../auth/AuthShell';
import { useAuth } from '../auth/auth';
import { CONFIG } from '../domain/config';
import { t } from '../domain/i18n';
import { Button, Field, PressScale, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Icon } from './blocks';

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
      title={team ? t('Ekibe katıl') : t('Mülküne bağlan')}
      lead={team
        ? t('Mülk sahibinden ya da kurumundan aldığın davet kodunu gir. Kodu mülk sahibi “Ekip”, kurum yöneticisi “Kurum” ekranından oluşturur.')
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
    <View accessibilityRole="alert" style={{ backgroundColor: c.surface, borderRadius: 26, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', gap: 14, padding: 20, paddingBottom: 16, alignItems: 'flex-start', backgroundColor: c.warnBg }}>
        <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(29,26,25,0.08)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="key" size={22} color={c.warnInk} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text v="body" color={c.warnInk} style={{ fontFamily: fonts.bodyXBold, fontSize: 17 }}>{t('Mülküne bağlan')}</Text>
          <Text v="small" color={c.warnInk} style={{ opacity: 0.85 }}>{t('Mülk eklemek için mülk sahibinden aldığın davet kodu gerekli. Kodu girene kadar ödeme, talep ve belgeler boş görünür.')}</Text>
        </View>
      </View>
      <View style={{ padding: 20, paddingTop: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <TextInput value={code} onChangeText={(v) => { setCode(v.toUpperCase()); setErr(null); }} onSubmitEditing={submit}
            accessibilityLabel={t('Davet kodu')} placeholder={t('Davet kodu') + ' · ABCD1234'} placeholderTextColor={c.muted}
            autoCapitalize="characters" autoCorrect={false} maxLength={12}
            style={{ flexGrow: 1, flexBasis: 200, minHeight: 52, borderRadius: radius.pill, paddingHorizontal: 20, backgroundColor: c.bg, color: c.ink,
              borderWidth: 1.5, borderColor: err ? c.badInk : c.line, fontFamily: code ? fonts.bodyBold : fonts.body, fontSize: 16, letterSpacing: code ? 2 : 0 }} />
          <Button kind="dark" title={t('Mülke bağlan')} onPress={submit} loading={busy} style={{ minHeight: 52, paddingHorizontal: 26 }} />
        </View>
        {err ? <Text v="small" color={c.badInk} accessibilityLiveRegion="polite">{err}</Text> : null}
        <PressScale onPress={ask} accessibilityRole="link" style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
          <Icon name="chat" size={16} color={c.accentText} />
          <Text v="small" color={c.accentText} style={{ fontFamily: fonts.bodyBold }}>{t('Kodun yok mu? Ev sahibine WhatsApp ile yaz')}</Text>
        </PressScale>
      </View>
    </View>
  );
}
