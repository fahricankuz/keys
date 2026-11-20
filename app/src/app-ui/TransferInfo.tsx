import { useState } from 'react';
import { Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { formatIban, normalizeIban } from '../domain/iban';
import { host } from '../domain/host';
import { t } from '../domain/i18n';
import { tl } from '../domain/util';
import { Text } from '../ui/kit';
import { fonts, useColors } from '../ui/theme';
import { Icon } from './blocks';

/** Havale / EFT bilgileri: alıcı, IBAN, tutar ve açıklama kodu; her satır tek dokunuşla kopyalanır.
    IBAN boşluksuz kopyalanır (banka uygulamaları öyle ister), ekranda dörtlü gruplarla gösterilir. */
export default function TransferInfo({ iban, holder, amount, code }: { iban: string; holder: string; amount?: number | null; code?: string | null }) {
  const c = useColors();
  const [copied, setCopied] = useState('');
  const copy = async (label: string, value: string) => {
    try {
      await Clipboard.setStringAsync(value);
      setCopied(label); setTimeout(() => setCopied((x) => (x === label ? '' : x)), 2000);
      host.notify({ title: t('Kopyalandı'), body: t('{x} panoya alındı.', { x: label }), icon: 'copy' });
    } catch {}
  };
  const rows: [string, string, string][] = [
    [t('Alıcı'), holder, holder],
    ['IBAN', formatIban(iban), normalizeIban(iban)],
    ...(amount ? [[t('Tutar'), tl(amount), String(Math.round(amount * 100) / 100).replace('.', ',')] as [string, string, string]] : []),
    ...(code ? [[t('Açıklama kodu'), code, code] as [string, string, string]] : [])
  ];
  return (
    <View style={{ gap: 10 }}>
      <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 14, overflow: 'hidden' }}>
        {rows.map(([label, shown, value], i) => (
          <Pressable key={label} onPress={() => copy(label, value)} accessibilityRole="button" accessibilityLabel={t('{x} kopyala', { x: label })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: c.line, backgroundColor: c.surface }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text v="small" muted>{label}</Text>
              <Text style={{ fontFamily: label === t('Açıklama kodu') ? fonts.bodyXBold : fonts.bodyBold, letterSpacing: label === t('Açıklama kodu') ? 1.5 : 0 }} selectable>{shown}</Text>
            </View>
            {/* Kopyala düğmesi: ikon + yazı, kopyalanınca kısa süre "Kopyalandı ✓". */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, minHeight: 32, borderRadius: 999,
              borderWidth: 1, borderColor: copied === label ? c.okInk : c.accentText, backgroundColor: copied === label ? c.okBg : 'transparent' }}>
              {copied === label ? null : <Icon name="copy" size={16} color={c.accentText} />}
              <Text v="small" color={copied === label ? c.okInk : c.accentText} style={{ fontFamily: fonts.bodyBold }}>{copied === label ? t('Kopyalandı ✓') : t('Kopyala')}</Text>
            </View>
          </Pressable>
        ))}
      </View>
      {code ? <Text v="small" muted>{t('Açıklamaya yalnız bu kodu yaz; ödemen kolayca tanınır.')}</Text> : null}
    </View>
  );
}
