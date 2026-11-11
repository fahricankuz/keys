/* Rol ekle: tek hesapta birden çok rol. Kiracı ya da site sakini hesabı mülk sahibi özelliğini ekler (kendi mülkünü yönetir);
   her hesap, kiracı olduğu evin ya da oturduğu sitenin davet koduyla o yere bağlanır. Roller arasında üstteki seçiciden geçilir.
   Site/portföy yöneticiliği buradan eklenmez: kurumsal başvuru ve onay gerekir. */
import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../auth/auth';
import { t } from '../domain/i18n';
import { CONFIG } from '../domain/config';
import { Button, Field, PressScale, Text } from '../ui/kit';
import { fonts, radius, useColors } from '../ui/theme';
import { Label, Muted, Row, Stack } from './blocks';
import { Title } from './forms';
import { useSheet } from './overlays';
import { selectCtx } from './ctx';

export function RoleAddSheet({ close }: { close: () => void }) {
  const { user, addLandlord, join } = useAuth();
  const router = useRouter();
  const c = useColors();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [lErr, setLErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState<'' | 'landlord' | 'code'>('');
  const tenant = user?.role === 'tenant';
  const becomeLandlord = async () => {
    setBusy('landlord'); setLErr(null);
    const e = await addLandlord();
    setBusy('');
    if (e) { setLErr(e); return; }
    close(); router.replace(selectCtx('ev') as any);
  };
  const useCode = async () => {
    setBusy('code'); setErr(null); setOk(null);
    const e = await join(code);
    setBusy('');
    if (e) setErr(e); else { setCode(''); setOk(t('Bağlandın. Yeni rolün menünün üstündeki seçicide ve panelinde görünür.')); }
  };
  return (
    <Stack>
      <Title>{t('Rol ekle')}</Title>
      <Muted>{t('Tek hesapla hem kiracı, hem mülk sahibi, hem site sakini olabilirsin. Eklediğin roller arasında menünün üstündeki seçiciden geçersin.')}</Muted>

      {tenant ? (
        <View style={{ gap: 10, padding: 16, borderRadius: radius.lg, backgroundColor: c.tile }}>
          <Label>{t('Mülk sahibi')}</Label>
          <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{t('Kendi mülkünü ekle ve yönet')}</Text>
          <Muted>{CONFIG.billing.cardTrial
            ? t('Hesabına mülk sahibi özelliği eklenir; kiracılığın ve site bağlantın aynen kalır. Mülk eklemek için bir paket seçersin.')
            : t('Hesabına mülk sahibi özelliği eklenir; kiracılığın ve site bağlantın aynen kalır. 1 ay ücretsiz denersin, sonra bir paket seçersin.')}</Muted>
          {lErr ? <Text v="small" color={c.badInk}>{lErr}</Text> : null}
          <Button kind="primary" title={t('Mülk sahibi özelliğini ekle')} onPress={becomeLandlord} loading={busy === 'landlord'} />
        </View>
      ) : null}

      <View style={{ gap: 10, padding: 16, borderRadius: radius.lg, backgroundColor: c.tile }}>
        <Label>{t('Kiracı ya da site sakini')}</Label>
        <Text v="body" style={{ fontFamily: fonts.bodyXBold }}>{t('Davet kodum var')}</Text>
        <Muted>{t('Kiraladığın evin mülk sahibinden ya da oturduğun sitenin yönetiminden aldığın kodu gir. Başka bir siteye ya da daireye bağlanmak için de yeni kodu buradan girersin.')}</Muted>
        <Field label={t('Davet kodu')} value={code} onChangeText={(v) => { setCode(v.toUpperCase()); setErr(null); }} autoCapitalize="characters" maxLength={12} onSubmitEditing={useCode} error={err} />
        {ok ? <Text v="small" color={c.okInk} accessibilityLiveRegion="polite">{ok}</Text> : null}
        <Button title={t('Kodla bağlan')} onPress={useCode} loading={busy === 'code'} disabled={!code.trim()} />
      </View>

      <PressScale onPress={() => { close(); router.push('/kurumsal' as any); }} accessibilityRole="link" scaleTo={0.99} style={{ padding: 16, borderRadius: radius.lg, backgroundColor: c.tile, gap: 2 }}>
        <Label>{t('Site ya da portföy yöneticisi')}</Label>
        <Row between><Text v="body" style={{ fontFamily: fonts.bodyBold, flex: 1 }}>{t('Kurumsal başvuru yap; onaylanınca kurumun açılır')}</Text><Muted>›</Muted></Row>
      </PressScale>
    </Stack>
  );
}

/** Ayarlar → Hesap: "Rol ekle" satırı. */
export function RoleAddTile() {
  const { open } = useSheet();
  const c = useColors();
  return (
    <PressScale onPress={() => open('rol-ekle')} accessibilityRole="button" accessibilityLabel={t('Rol ekle')} scaleTo={0.99} style={{ padding: 16, borderRadius: radius.lg, backgroundColor: c.tile, gap: 2 }}>
      <Label>{t('Rol ekle')}</Label>
      <Row between><Text v="body" style={{ fontFamily: fonts.bodyBold, flex: 1 }}>{t('Mülk sahibi, kiracı ya da site sakini rolü ekle')}</Text><Muted>›</Muted></Row>
    </PressScale>
  );
}
