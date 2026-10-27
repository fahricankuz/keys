import { ui } from '../../domain/state';
import { Portfolio, TenantPanel } from '../../app-ui/screens';
import { useStore } from '../../app-ui/hooks';

export default function Home() {
  useStore();
  return ui.role === 'tenant' ? <TenantPanel /> : <Portfolio />;
}
