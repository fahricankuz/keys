import { ui } from '../../domain/state';
import { siteResidentOnly } from '../../domain/site';
import { AllRequests, TenantScreen } from '../../app-ui/screens';
import { ResidentSiteScreen } from '../../app-ui/site';
import { useStore } from '../../app-ui/hooks';
export default function Talepler() {
  useStore();
  if (siteResidentOnly()) return <ResidentSiteScreen part="req" />;
  return ui.role === 'tenant' ? <TenantScreen tab="req" /> : <AllRequests />;
}
