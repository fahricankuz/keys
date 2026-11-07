import { Redirect } from 'expo-router';
import { ResidentSiteScreen } from '../../app-ui/site';
import { siteResidentOnly } from '../../domain/site';
import { useStore } from '../../app-ui/hooks';
/** Malik ya da kiracının site ekranı (aidat, duyurular, genel kurul, talep, belgeler). Yalnız site sakini olan için
    uygulamanın ana sayfası zaten bu ekrandır. */
export default function Sitem() {
  useStore();
  if (siteResidentOnly()) return <Redirect href="/uygulama" />;
  return <ResidentSiteScreen />;
}
