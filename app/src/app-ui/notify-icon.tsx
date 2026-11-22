/* Bildirim türü simgesi (Ödeme, Mesaj, Talep, Duyuru, Hatırlatma, Belge): uygulama içi bildirim listesinde.
   Tür domain/notify-kind.js'ten gelir; aynı tür telefonda sesi ve Android kanalını da belirler. */
import { View } from 'react-native';
import { t } from '../domain/i18n';
import { useColors } from '../ui/theme';
import { Icon } from './blocks';

const ICON: Record<string, string> = { odeme: 'card', mesaj: 'chat', talep: 'wrench', duyuru: 'mega', hatirlatma: 'bell', belge: 'doc', genel: 'key' };
// [açık zemin, açık simge, koyu zemin, koyu simge]
const TONE: Record<string, [string, string, string, string]> = {
  odeme: ['#F8DCD9', '#A8231F', 'rgba(242,140,134,0.14)', '#F28C86'],
  mesaj: ['#DCE9F8', '#1F5FAD', 'rgba(125,179,240,0.14)', '#7DB3F0'],
  talep: ['#FBEBC8', '#6B4A00', 'rgba(242,181,68,0.14)', '#F2B544'],
  duyuru: ['#EADFF7', '#5E2EA0', 'rgba(185,148,236,0.14)', '#B994EC'],
  hatirlatma: ['#DCEFDF', '#246B36', 'rgba(127,196,149,0.14)', '#7FC495'],
  belge: ['#EFE6DE', '#5A4E48', 'rgba(250,245,240,0.08)', '#C9BDB6'],
  genel: ['#EFE6DE', '#5A4E48', 'rgba(250,245,240,0.08)', '#C9BDB6'],
};
/** Ekran okuyucu için tür adı (okuma anında çevrilir). */
export const notifyKindLabel = (k: string) => (({ odeme: t('Ödeme'), mesaj: t('Mesaj'), talep: t('Talep'), duyuru: t('Duyuru'), hatirlatma: t('Hatırlatma'), belge: t('Belge') } as Record<string, string>)[k] || t('Bildirim'));

export function NotifyIcon({ kind }: { kind: string }) {
  const c = useColors();
  const dark = c.bg !== '#FAF5F0';
  const tone = TONE[kind] || TONE.genel;
  return (
    <View accessibilityLabel={notifyKindLabel(kind)} style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: dark ? tone[2] : tone[0] }}>
      <Icon name={ICON[kind] || ICON.genel} size={18} color={dark ? tone[3] : tone[1]} />
    </View>
  );
}
