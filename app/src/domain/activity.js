/* İşlem kaydı satırlarını okunur cümleye çevirir (mülk sayfasındaki "Kayıt" sekmesi). */

import { t } from './i18n.js';
import { STEPS } from './state.js';
import { roleLabel } from './team.js';
import { monthYear, tl } from './util.js';

const has = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k);

export function describe(row){
  const d = row.detail || {};
  switch (row.entity) {
    case 'payments':
      if (row.action === 'insert' && d.status === 'review') return t('Dekont yüklendi · {month}', { month: monthYear(row.ref) });
      if (d.status === 'approved') return t('Ödeme onaylandı · {month}', { month: monthYear(row.ref) });
      if (d.status === 'rejected') return t('Dekont reddedildi · {month}', { month: monthYear(row.ref) });
      if (d.status === 'review' || d.status === 'partial') return t('Dekont yüklendi · {month}', { month: monthYear(row.ref) });
      return t('Ödeme kaydı güncellendi · {month}', { month: monthYear(row.ref) });
    case 'requests':
      if (row.action === 'insert') return t('Talep açıldı: {title}', { title: d.title || '' });
      if (has(d, 'status')) return t('Talep ilerledi: {step}', { step: t(STEPS[d.status] || '') });
      if (has(d, 'invoice')) return t('Talebe fatura eklendi');
      if (has(d, 'quotes')) return t('Talebe teklif eklendi');
      if (has(d, 'decision')) return t('Ek talep kararı: {v}', { v: t(d.decision || '') });
      if (has(d, 'cost') || has(d, 'cost_ok')) return t('Masraf paylaşımı değişti');
      return t('Talep güncellendi');
    case 'documents':
      return row.action === 'insert' ? t('Belge yüklendi: {name}', { name: d.name || '' })
        : row.action === 'delete' ? t('Belge silindi') : t('Belge güncellendi');
    case 'expenses':
      return row.action === 'insert' ? t('Gider eklendi: {cat} {amount}', { cat: t(d.cat || ''), amount: tl(Number(d.amount) || 0) })
        : row.action === 'delete' ? t('Gider silindi') : t('Gider güncellendi');
    case 'property_shared':
      return has(d, 'renewal') ? t('Sözleşme yenileme güncellendi')
        : has(d, 'move_out') ? t('Çıkış ve depozito güncellendi') : t('Giriş tutanağı güncellendi');
    case 'properties':
      if (row.action === 'insert') return t('Mülk eklendi: {name}', { name: d.name || '' });
      if (row.action === 'delete') return t('Mülk silindi');
      return has(d, 'rent') ? t('Kira {amount} olarak değişti', { amount: tl(Number(d.rent) || 0) }) : t('Mülk bilgileri güncellendi');
    case 'rent_history':
      return row.action === 'delete' ? t('Kira dönemi silindi') : t('Kira dönemi eklendi');
    case 'memberships':
      return row.action === 'insert' ? t('{role} olarak katıldı', { role: roleLabel(d.role) })
        : row.action === 'delete' ? t('Mülkten çıkarıldı') : t('Üyelik bilgisi güncellendi');
    case 'invites':
      return row.action === 'insert' ? t('Davet oluşturuldu: {role}', { role: roleLabel(d.role || 'tenant') })
        : row.action === 'delete' ? t('Davet silindi') : t('Davet kullanıldı');
    case 'team':
      return row.action === 'join' ? t('Ekibe katıldı: {role}', { role: roleLabel(d.role) })
        : row.action === 'set' ? t('Ekip rolü değişti: {role}', { role: roleLabel(d.role) })
        : row.action === 'remove' ? t('Ekipten çıkarıldı') : t('Ekip güncellendi');
    default:
      return row.entity + ' · ' + row.action;
  }
}
