import { Redirect } from 'expo-router';
import { ui } from '../../../domain/state';
import { siteResidentOnly } from '../../../domain/site';
import { TenantScreen } from '../../../app-ui/screens';
import { ResidentSiteScreen } from '../../../app-ui/site';
import { useStore } from '../../../app-ui/hooks';
export default function Belgeler() {
  useStore();
  if (siteResidentOnly()) return <ResidentSiteScreen part="docs" />;
  return ui.role === 'tenant' ? <TenantScreen tab="docs" /> : <Redirect href="/uygulama" />;
}
