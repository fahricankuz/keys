import { Redirect } from 'expo-router';
import { ui } from '../../../domain/state';
import { TenantScreen } from '../../../app-ui/screens';
export default function Tutanak() { return ui.role === 'tenant' ? <TenantScreen tab="docs" sub="tutanak" /> : <Redirect href="/uygulama" />; }
