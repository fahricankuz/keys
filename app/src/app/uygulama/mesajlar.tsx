import { ui } from '../../domain/state';
import { Threads, TenantScreen } from '../../app-ui/screens';
export default function Mesajlar() { return ui.role === 'tenant' ? <TenantScreen tab="msg" /> : <Threads />; }
