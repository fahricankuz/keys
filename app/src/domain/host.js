/* Arayüz köprüsü: alan mantığı (services.js) ekranı doğrudan bilmez;
   React kökü bu kancaları bağlar. */
/** @type {any} */
export const host = {
  /** Bildirim şeridi: ({ title, body, icon, actions }, log=true) */
  notify: () => {},
  /** Onay penceresi: ({ title, body, ok, danger }) → Promise<boolean> */
  ask: () => Promise.resolve(true),
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
