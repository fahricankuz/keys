import { useRouter } from 'expo-router';
import { t } from '../../domain/i18n';
import { Page } from '../../app-ui/screens';
import { SettingsBody } from '../../app-ui/sheets';
/** Kiracı, mülk sahibi ve ekip üyesi için ortak ayarlar sayfası (yan menü → Ayarlar). */
export default function Ayarlar() {
  const router = useRouter();
  return (
    <Page title={t('Ayarlar')} sub={t('Profil, e-posta, şifre ve bildirimler')}>
      <SettingsBody page close={() => router.replace('/uygulama')} />
    </Page>
  );
}
