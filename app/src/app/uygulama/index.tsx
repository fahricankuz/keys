import { Redirect, useLocalSearchParams } from 'expo-router';
import { ui } from '../../domain/state';
import { Portfolio, TenantPanel } from '../../app-ui/screens';
import { useStore } from '../../app-ui/hooks';
import { currentPortfolioOrg } from '../../app-ui/site';

/** Panel. Site, AVM, depo ya da GYO yöneticisi doğrudan kurumunun paneline gider; kendi mülkleri ya da evi
    "Mülklerim" / "Evim" menüsünden (?mulk=1) açılır. */
export default function Home() {
  useStore();
  const { mulk } = useLocalSearchParams<{ mulk?: string }>();
  if (currentPortfolioOrg() && !mulk) return <Redirect href="/uygulama/site" />;
  return ui.role === 'tenant' ? <TenantPanel /> : <Portfolio />;
}
