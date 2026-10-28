import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import AuthShell from '../auth/AuthShell';
import { t } from '../domain/i18n';
import { EnterpriseForm } from '../site/EnterpriseForm';

/** Kurumsal paket başvurusu (Fiyatlar → Kurumsal → Bize ulaşın; sektör sayfalarındaki "Teklif al"). */
export default function Kurumsal() {
  const params = useLocalSearchParams<{ sektor?: string }>();
  // Statik derlemede parametre ilk çizimde gelmeyebilir; web'de adres çubuğundan da okunur.
  const [sektor, setSektor] = useState(params.sektor ? String(params.sektor) : '');
  useEffect(() => {
    const q = Platform.OS === 'web' && typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('sektor') : null;
    if (q || params.sektor) setSektor(String(q || params.sektor));
  }, [params.sektor]);
  return (
    <AuthShell wide title={t('Kurumsal paket')} lead={t('Portföyünü kısaca anlat; sana uygun fiyatı ve kurulum planını iki iş günü içinde iletelim.')}
      side={{
        title: t('Büyük portföyler için anahtar.'),
        lead: t('Sınırsız mülk ve ekip üyesi, kurulumda veri taşıma desteği.'),
        points: [t('Aylık ve yıllık rapor e-postası'), t('Öncelikli destek'), t('Kuruma özel sözleşme ve fatura'), t('Sektörünüze göre özel yapılandırma')],
        groups: [{ title: t('Sektörünüze göre'), items: [t('Emlak ofisi'), t('Site ve bina yönetimi'), t('AVM'), t('GYO'), t('Depo ve lojistik'), t('Family office')] }],
        foot: t('Konut, ofis, mağaza ve depo')
      }}>
      <EnterpriseForm role={sektor} />
    </AuthShell>
  );
}
