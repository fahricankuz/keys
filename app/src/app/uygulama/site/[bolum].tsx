import { useLocalSearchParams } from 'expo-router';
import { SiteAdminScreen, SECTION_KEYS } from '../../../app-ui/site';

export function generateStaticParams() { return SECTION_KEYS.filter((k) => k !== 'ozet').map((bolum) => ({ bolum })); }

/** Kurum paneli bölümü: birimler, tahakkuk, ciro, kira artışları, giderler, işletme projesi, duyurular, talepler, rapor. */
export default function SiteSection() {
  const { bolum } = useLocalSearchParams<{ bolum: string }>();
  return <SiteAdminScreen section={String(bolum || 'ozet')} />;
}
