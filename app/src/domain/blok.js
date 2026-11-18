// Blok adı yardımcıları. Sunucudaki karşılığı: public.unit_label (migration blok_adi_tekrari).
import { t } from './i18n.js';

/** Blok adı zaten "Blok" / "Bloğu" / "Block" ile bitiyor mu ("A Blok", "Gül Bloğu"): öyleyse sona bir daha "Blok" eklenmez. */
export const blockHasWord = (b) => /(^|\s)(blok|bloğu|block)$/i.test(String(b || '').trim());

/** Sitede blok başlığı: "A" → "A Blok", "A Blok" → "A Blok" (tekrar yok), boş → ''. */
export const blockTitle = (b) => (!b ? '' : blockHasWord(b) ? String(b).trim() : String(b).trim() + ' ' + t('Blok'));
