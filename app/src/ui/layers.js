// Katmanlı bileşenlerin yerleşim kuralları (ekransız; tests/telefon-duzen.spec.mjs bunları telefonun düzen motoru Yoga ile dener).
// Telefonda React Native, Yoga'yı web'den farklı "uyumluluk" ayarlarıyla çalıştırır; web'de doğru görünen iki kalıp telefonda bozuluyordu:
// 1) Dokunulabilir kartın iç katmanı dikeyde büyürse (flexGrow, sütun yönü), yan yana sığmayıp alta geçen kartlarda satır yüksekliği yanlış
//    hesaplanır: ilk kart boşuna uzar, ikincisi sonraki içeriğin üstüne biner.
// 2) Mutlak konumlu ve yüzdeli boyutlu katman (%100 genişlik/yükseklik) ebeveynin kenar boşluğu düşülmüş iç alanına göre ölçülür: koyu
//    kartın deseni kartı doldurmaz.

/** Dış sarmalayıcıya (Pressable) giden yerleşim özellikleri; kalanı (renk, kenarlık, iç boşluk, hizalama) iç katmana gider. */
export const LAYOUT_KEYS = ['flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width', 'maxWidth', 'minWidth', 'height', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical'];

/** PressScale katmanları. Dış sarmalayıcı genişlik/flex alıyorsa iç katman onu doldurur: dış katman satır yönünde, iç katman yatayda büyür,
    dikeyde ise varsayılan "stretch" ile uzar. (Önceki çözüm, iç katmanı sütun yönünde büyütmek, telefonda kaymaya yol açıyordu.) */
export function pressLayers(flat) {
  const outer = {}, inner = {};
  Object.keys(flat || {}).forEach((key) => { (LAYOUT_KEYS.includes(key) ? outer : inner)[key] = flat[key]; });
  const fill = outer.flex !== undefined || outer.flexGrow !== undefined || outer.width !== undefined || outer.alignSelf === 'stretch';
  if (fill) outer.flexDirection = 'row';
  return { outer, inner: fill ? { flexGrow: 1, flexShrink: 1, ...inner } : inner };
}

/** Koyu kartın (Hero) desen katmanı: kenar boşluksuz, kartın tamamını kaplayan mutlak katman; SVG bunun içinde %100 boyutla çizilir. */
export const HERO_PAD = 24;
export const HERO_BG = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 };
