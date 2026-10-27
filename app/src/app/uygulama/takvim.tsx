import { ui } from '../../domain/state';
import { LandlordAgenda, TenantScreen } from '../../app-ui/screens';
export default function Takvim() { return ui.role === 'tenant' ? <TenantScreen tab="agenda" /> : <LandlordAgenda />; }
