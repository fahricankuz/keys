import { Redirect } from 'expo-router';
import { ui } from '../../domain/state';
import { ImportScreen } from '../../app-ui/import';
export default function IceAktar() { return ui.role !== 'landlord' || ui.team ? <Redirect href="/uygulama" /> : <ImportScreen />; }
