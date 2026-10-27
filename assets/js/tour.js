/* Rehberli tur: uygulamayı ekran ekran gezdirir.
   Her adım bir adrese gider; tur sırasında gerçek ekranlar kullanılır. */

import { t } from './i18n.js';
import { S, ui, save } from './state.js';
import { esc } from './util.js';

export const TOUR = [
  { path:'/kiraci', title:t('Kiracı paneli'),
    body:t('Kiracı açılışta tek şeyi görür: bu ay ne ödeyeceğini ve neyin beklediğini. Üstteki hap ile rolü değiştirebilirsin.') },
  { path:'/kiraci/odemeler', title:t('Ödemeler'),
    body:t('Kira geçmişi, aidat, depozito ve fatura sorumlulukları tek sayfada. Dekont yüklerken tutar ve tarih de girilir; eksik ödeme kısmi olarak takip edilir.') },
  { path:'/kiraci/talepler', title:t('Talepler'),
    body:t('Arıza, tadilat ve ek talepler aynı akışta ilerler: Açıldı → Görüldü → İşlemde → Çözüldü. Masrafın kimde olduğu ayrıca onaylanır.') },
  { path:'/kiraci/belgeler/tutanak', title:t('Giriş tutanağı'),
    body:t('Taşınırken oda oda fotoğraf ve not. İki taraf da onaylayınca tutanak kilitlenir; çıkışta karşılaştırma buradan yapılır.') },
  { path:'/mulk-sahibi', title:t('Mülk sahibi portföyü'),
    body:t('Aynı veri, diğer taraftan. Ay içindeki tahsilat oranı, onay bekleyenler ve öncelikli işler en üstte.') },
  { path:'/mulk-sahibi/mulk/moda/odeme', title:t('Mülk detayı'),
    body:t('Her mülkün kendi ödeme, talep, mesaj, belge ve tutanak bölümü var. Üstteki şeritten bölümler arasında geçebilirsin.') },
  { path:'/mulk-sahibi/mulk/moda/gider', title:t('Gider defteri'),
    body:t('Emlak vergisi, sigorta, tamir gibi giderler burada. Talep faturaları otomatik işlenir; net getiri anında hesaplanır.') },
  { path:'/mulk-sahibi/mulk/moda/cikis', title:t('Çıkış ve depozito'),
    body:t('Taşınırken giriş ve çıkış odaları yan yana karşılaştırılır, kesintiler iki tarafın onayıyla depozitodan düşülür.') },
  { path:'/mulk-sahibi/takvim', title:t('Takvim'),
    body:t('Tüm mülklerin yaklaşan işleri tek listede: gecikmiş, bu hafta, bu ay ve sonrası.') },
  { path:'/mulk-sahibi/rapor', title:t('Rapor'),
    body:t('Yıllık net getiri, mülk bazında dağılım ve götürü/gerçek gider karşılaştırmalı vergi tahmini.') }
];

export function isActive(){ return ui.tour != null; }
export function step(){ return ui.tour != null ? TOUR[ui.tour] : null; }

export function startTour(){ ui.tour = 0; }
export function nextStep(){ if (ui.tour != null && ui.tour < TOUR.length - 1) ui.tour++; else endTour(); }
export function prevStep(){ if (ui.tour != null && ui.tour > 0) ui.tour--; }
export function endTour(){ ui.tour = null; S.tourDone = true; save(); }

/** Tur çubuğunun HTML'i; tur kapalıysa boş string. */
export function tourBar(){
  const s = step();
  if (!s) return '';
  const i = ui.tour;
  return ('<div class="tourbar" role="dialog" aria-label="'+t('Rehberli tur')+'">') +
    '<div class="tt">'+esc(s.title)+'</div>' +
    '<div class="bd">'+esc(s.body)+'</div>' +
    '<div class="ba"><span class="ix">'+(i+1)+' / '+TOUR.length+'</span>' +
      (i > 0 ? ('<button class="btn small ghost" data-act="tourPrev">'+t('Geri')+'</button>') : '') +
      ('<button class="btn small ghost" data-act="tourEnd">'+t('Çık')+'</button>') +
      '<button class="btn small light" data-act="tourNext">'+(i === TOUR.length-1 ? t('Bitir') : t('İleri'))+'</button>' +
    '</div></div>';
}
