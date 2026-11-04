/* Kira geçmişi belgesinin herkese açık doğrulama sayfası: anahtar.io/belge?kod=… — belgeyi gösterir, web'de yazdırılır
   (tarayıcının "PDF olarak kaydet" seçeneğiyle PDF'e dönüşür). Kod yanlışsa "doğrulanamadı" yazar. */
import { useEffect, useState } from 'react';
import { Platform, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { t } from '../domain/i18n';
import { CONFIG } from '../domain/config';
import { verifyCertificate } from '../domain/certificate';
import { Button, Text } from '../ui/kit';
import { Wordmark } from '../ui/Wordmark';
import { Loader } from '../ui/Loader';
import { radius, useColors } from '../ui/theme';
import { CertificateBody } from '../app-ui/certificate';

export default function Belge() {
  const c = useColors();
  const { kod } = useLocalSearchParams<{ kod?: string }>();
  // Statik çıktıda adres parametresi yoktur; hidrasyon uyuşsun diye kod bağlandıktan sonra okunur.
  const [mounted, setMounted] = useState(false);
  const [state, setState] = useState<'wait' | 'ok' | 'bad'>('wait');
  const [d, setD] = useState<any>(null);
  useEffect(() => setMounted(true), []);
  const code = mounted ? String(Array.isArray(kod) ? kod[0] : kod || '').toUpperCase() : '';
  useEffect(() => {
    if (!mounted) return;
    if (!code) { setState('bad'); return; }
    verifyCertificate(code).then((x) => { setD(x); setState(x ? 'ok' : 'bad'); }).catch(() => setState('bad'));
  }, [mounted, code]);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
      <View style={{ width: '100%', maxWidth: 760, gap: 16 }}>
        <Wordmark size={26} />
        <View style={{ backgroundColor: c.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: c.line, padding: 20, gap: 14 }}>
          {state === 'wait' ? <View style={{ alignItems: 'center', paddingVertical: 30 }}><Loader size={64} /></View> : null}
          {state === 'bad' ? (
            <View style={{ gap: 6 }}>
              <Text v="h2">{t('Belge doğrulanamadı')}</Text>
              <Text v="small" muted>{t('Kod yanlış ya da belge bulunamadı. Kodu belgedeki gibi (10 karakter) yazdığından emin ol.')}</Text>
            </View>
          ) : null}
          {state === 'ok' && d ? (
            <>
              <View style={{ alignSelf: 'flex-start', backgroundColor: c.okBg, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 }}>
                <Text v="small" color={c.okInk} style={{ fontWeight: '700' }}>{t('Doğrulandı · anahtar kayıtlarıyla aynı')}</Text>
              </View>
              <CertificateBody d={d} />
              <Text v="small" muted>{t('Doğrulama kodu {code} · {url}', { code: d.code, url: CONFIG.publicUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') + '/belge?kod=' + d.code })}</Text>
            </>
          ) : null}
        </View>
        {state === 'ok' && Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.print === 'function'
          ? <Button kind="ghost" title={t('Yazdır / PDF olarak kaydet')} onPress={() => window.print()} style={{ alignSelf: 'flex-start' }} /> : null}
      </View>
    </ScrollView>
  );
}
