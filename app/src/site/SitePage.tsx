/* Ana sitenin alt sayfaları (çözümler, sektörler, kira artış hesaplama) için ortak iskelet:
   ana sayfayla aynı üst şerit, menü ve alt bilgi. Menüdeki bölüm bağlantıları ana sayfaya döner. */
import { ReactNode, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useColors } from '../ui/theme';
import { useLangTick } from '../app-ui/hooks';
import { Nav, TopBar } from './Navbar';
import { Footer, ToTop } from './Landing';

export default function SitePage({ children }: { children: ReactNode }) {
  useLangTick();
  const c = useColors();
  const router = useRouter();
  const scroll = useRef<any>(null);
  const [top, setTop] = useState(false);
  const go = (p: string) => router.push(p as any);
  const home = (k: string) => {
    if (typeof window !== 'undefined' && window.location) window.location.assign('/#' + k);
    else router.push('/' as any);
  };
  return (
    <View style={{ flex: 1 }}>
      <ScrollView ref={scroll} style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ flexGrow: 1 }} stickyHeaderIndices={[1]} scrollEventThrottle={64}
        onScroll={(e) => { const s = e.nativeEvent.contentOffset.y > 700; setTop((x) => (x === s ? x : s)); }}>
        <TopBar />
        <Nav go={go} scrollTo={home} openFeature={() => home('ozellikler')} />
        <View style={{ flexGrow: 1 }}>{children}</View>
        <Footer scrollTo={home} />
      </ScrollView>
      <ToTop show={top} onPress={() => scroll.current?.scrollTo({ y: 0, animated: true })} />
    </View>
  );
}
