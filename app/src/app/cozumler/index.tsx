import { useRouter } from 'expo-router';
import { t } from '../../domain/i18n';
import { Container } from '../../ui/kit';
import { useBreakpoint } from '../../ui/theme';
import SitePage from '../../site/SitePage';
import { SectionHead } from '../../site/Landing';
import { SegmentGrid } from '../../site/SegmentParts';

/** Çözümler: "Seni en iyi ne tanımlar?" — her seçenek kendi sayfasına gider. */
export default function Cozumler() {
  const router = useRouter();
  const { phone } = useBreakpoint();
  return (
    <SitePage>
      <Container style={{ paddingTop: phone ? 40 : 96, paddingBottom: phone ? 48 : 112, gap: phone ? 24 : 40, maxWidth: 1080 }}>
        <SectionHead compact label={t('Çözümler')} title={t('Seni en iyi ne tanımlar?')} body={t('Tek bir daireden yüzlerce mülklük portföylere kadar anahtar’ın sana uygun kullanımını gör.')} />
        <SegmentGrid go={(p) => router.push(p as any)} />
      </Container>
    </SitePage>
  );
}
