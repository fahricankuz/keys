import { Redirect } from 'expo-router';
import { ui } from '../../domain/state';
import { siteResidentOnly } from '../../domain/site';
import { LandlordAgenda, TenantScreen } from '../../app-ui/screens';
import { useStore } from '../../app-ui/hooks';
export default function Takvim() {
  useStore();
  if (siteResidentOnly()) return <Redirect href="/uygulama" />;
  return ui.role === 'tenant' ? <TenantScreen tab="agenda" /> : <LandlordAgenda />;
}
