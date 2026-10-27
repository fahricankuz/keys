import { Redirect } from 'expo-router';
import { ui } from '../../domain/state';
import { TenantScreen } from '../../app-ui/screens';
export default function Odemeler() { return ui.role === 'tenant' ? <TenantScreen tab="pay" /> : <Redirect href="/uygulama" />; }
