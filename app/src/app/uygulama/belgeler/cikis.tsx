import { Redirect } from 'expo-router';
import { ui } from '../../../domain/state';
import { TenantScreen } from '../../../app-ui/screens';
export default function Cikis() { return ui.role === 'tenant' ? <TenantScreen tab="docs" sub="cikis" /> : <Redirect href="/uygulama" />; }
