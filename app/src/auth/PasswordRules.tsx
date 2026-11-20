import { View } from 'react-native';
import { pwChecks } from '../domain/sifre';
import { t } from '../domain/i18n';
import { Text } from '../ui/kit';
import { fonts, useColors } from '../ui/theme';

/** Şifre alanlarının altında yazdıkça işaretlenen kurallar (kayıt, şifre yenileme, şifre değiştirme).
    `pw2` verilmezse "İki şifre aynı" maddesi gösterilmez. */
export default function PasswordRules({ pw, pw2 }: { pw: string; pw2?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }} accessibilityLiveRegion="polite">
      {pwChecks(pw, pw2).map((r) => (
        <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center',
            backgroundColor: r.ok ? c.okBg : 'transparent', borderWidth: r.ok ? 0 : 1.5, borderColor: c.line }}>
            {r.ok ? <Text v="small" color={c.okInk} style={{ fontFamily: fonts.bodyXBold, fontSize: 11, lineHeight: 14 }}>✓</Text> : null}
          </View>
          <Text v="small" color={r.ok ? c.okInk : c.muted}>{r.label}</Text>
        </View>
      ))}
      <Text v="small" muted>{t('Yaygın ya da daha önce sızmış şifreler kabul edilmez (ör. 12345678, sifre123).')}</Text>
    </View>
  );
}
