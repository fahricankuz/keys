import { ui } from '../../domain/state';
import { AllRequests, TenantScreen } from '../../app-ui/screens';
export default function Talepler() { return ui.role === 'tenant' ? <TenantScreen tab="req" /> : <AllRequests />; }
