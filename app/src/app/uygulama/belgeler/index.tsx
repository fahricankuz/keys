import { Redirect } from 'expo-router';
import { ui } from '../../../domain/state';
import { TenantScreen } from '../../../app-ui/screens';
export default function Belgeler() { return ui.role === 'tenant' ? <TenantScreen tab="docs" /> : <Redirect href="/uygulama" />; }
