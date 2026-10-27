import { Redirect, useLocalSearchParams } from 'expo-router';
import { ui } from '../../domain/state';
import { PropDetail } from '../../app-ui/screens';
export default function Mulk() {
  const { pid, sub } = useLocalSearchParams<{ pid?: string; sub?: string }>();
  if (ui.role !== 'landlord' || !pid) return <Redirect href="/uygulama" />;
  return <PropDetail pid={pid} sub={sub || 'ozet'} />;
}
