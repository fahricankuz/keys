import { Redirect } from 'expo-router';
import { ui } from '../../domain/state';
import { Report } from '../../app-ui/screens';
export default function Rapor() { return ui.role === 'landlord' ? <Report /> : <Redirect href="/uygulama" />; }
