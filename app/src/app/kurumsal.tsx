import AuthShell from '../auth/AuthShell';
import { t } from '../domain/i18n';
import { EnterpriseForm } from '../site/EnterpriseForm';

/** Kurumsal paket başvurusu (ana sayfa → Fiyatlar → Kurumsal → Bize ulaşın). */
export default function Kurumsal() {
  return (
    <AuthShell wide title={t('Kurumsal paket')} lead={t('Portföyünü kısaca anlat; sana uygun fiyatı ve kurulum planını iki iş günü içinde iletelim.')}
      side={{
        title: t('Büyük portföyler için anahtar.'),
        lead: t('Sınırsız mülk ve ekip üyesi, kurulumda veri taşıma desteği.'),
        points: [t('Aylık ve yıllık rapor e-postası'), t('Öncelikli destek'), t('Kuruma özel sözleşme ve fatura')],
        foot: t('Konut, ofis, mağaza ve depo')
      }}>
      <EnterpriseForm />
    </AuthShell>
  );
}
