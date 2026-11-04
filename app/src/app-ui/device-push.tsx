import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { t } from '../domain/i18n';
import { pushState, enablePush, disablePush } from '../domain/webpush';
import { Button, Text } from '../ui/kit';
import { fonts } from '../ui/theme';
import { Muted } from './blocks';

/** Ayarlar → Bildirimler: bu tarayıcıda anlık bildirimi aç/kapat. Anahtar yoksa ya da web değilse hiç görünmez. */
export function DevicePush(){
  const [st, setSt] = useState<string>('off');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { pushState().then(setSt).catch(() => setSt('off')); }, []);
  if (st === 'off') return null;
  const run = async (f: () => Promise<string>) => {
    setBusy(true); setErr('');
    try { setSt(await f()); } catch { setErr(t('Bildirim açılamadı. Sayfayı yenileyip yeniden dene.')); }
    setBusy(false);
  };
  const hint = st === 'ios-home' ? t('iPhone’da anlık bildirim için önce Paylaş → Ana Ekrana Ekle ile anahtar’ı ana ekrana ekle, oradan aç.')
    : st === 'unsupported' ? t('Bu tarayıcı anlık bildirimi desteklemiyor.')
    : st === 'denied' ? t('Bildirim izni bu tarayıcıda engellenmiş. Tarayıcı ayarlarından anahtar.io için izin ver.')
    : st === 'on' ? t('Bu cihaza anlık bildirim geliyor.') : t('Kira, talep ve duyurular bu cihaza anında gelsin.');
  return (
    <View testID="device-push" style={{ gap: 6, paddingVertical: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Text v="small" style={{ flex: 1, fontFamily: fonts.bodyBold }}>{t('Bu cihazda anlık bildirim')}</Text>
        {st === 'ready' ? <Button title={t('Aç')} loading={busy} onPress={() => run(enablePush)} /> : null}
        {st === 'on' ? <Button kind="ghost" title={t('Kapat')} loading={busy} onPress={() => run(disablePush)} /> : null}
      </View>
      <Muted>{err || hint}</Muted>
    </View>
  );
}
