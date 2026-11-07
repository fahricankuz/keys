import { Redirect } from 'expo-router';
import { ui } from '../../domain/state';
import { siteResidentOnly } from '../../domain/site';
import { Threads, TenantScreen } from '../../app-ui/screens';
import { useStore } from '../../app-ui/hooks';
/** Site sakininin yönetime yazacağı her şey talep olarak açılır (ayrı mesajlaşma yok). */
export default function Mesajlar() {
  useStore();
  if (siteResidentOnly()) return <Redirect href="/uygulama/talepler" />;
  return ui.role === 'tenant' ? <TenantScreen tab="msg" /> : <Threads />;
}
