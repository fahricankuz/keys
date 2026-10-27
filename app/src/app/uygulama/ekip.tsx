import { Redirect } from 'expo-router';
import { ui } from '../../domain/state';
import { TeamScreen } from '../../app-ui/team';
/** Ekibi yalnız mülk sahibi yönetir; ekip üyeleri bu ekrana giremez. */
export default function Ekip() { return ui.role !== 'landlord' || ui.team ? <Redirect href="/uygulama" /> : <TeamScreen />; }
