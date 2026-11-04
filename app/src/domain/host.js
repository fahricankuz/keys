/* Arayüz köprüsü: alan mantığı (services.js) ekranı doğrudan bilmez;
   React kökü bu kancaları bağlar. */

/** Onay penceresi bağlı olmayan ekranlarda (yönetici paneli) tarayıcının onayı sorulur; soramıyorsak işlem yapılmaz. */
export function fallbackAsk(o){
  const text = [o && o.title, o && o.body].filter(Boolean).join('\n\n');
  return Promise.resolve(typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(text) : false);
}

/** @type {any} */
export const host = {
  /** Bildirim şeridi: ({ title, body, icon, actions }, log=true) */
  notify: () => {},
  /** Onay penceresi: ({ title, body, ok, danger }) → Promise<boolean> */
  ask: fallbackAsk,
  /** Gezinme: uygulama içi yol (/uygulama/...) */
  go: () => {},
  /** Alt sayfa: (ad, params) */
  openSheet: () => {},
  closeSheet: () => {},
  /** Dışa aktarma: metin ve dosya */
  saveFile: () => {},
  openUrl: () => {},
  /** Kutlama animasyonu (konfeti + tik): ({ title }) */
  celebrate: () => {},
  /** Hafif haptik titreşim (ödeme onayı). */
  haptic: () => {}
};
