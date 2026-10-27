# Kiracım marka kimliği

Fol Studio estetiğinde hazırlanan marka kimliği sisteminin uygulamadaki karşılığı.
Uygulama kodu: `app/` (Expo / React Native). Tokenlar: `app/src/ui/theme.ts`.

## Öz

**Kira işi, ev kadar rahat.** Sözleşme, ödeme, depozito ve arıza yazışması tek uygulamada.
Dil: samimi, net, şeffaf. Hedef: 22–40 yaş büyükşehir kiracıları; ikinci kitle ev sahipleri.

Manifesto: Ev, bir adres değil bir duygudur. Kira, bir yük değil bir düzendir. Her ay bir pencere yanar.
Net yaz, yumuşak davran. Sayı büyük, söz kısa.

## Logo

**Güncel logo (kullanılan):** ev + anahtar deliği simgesi ve "kiracım" wordmark'ı, "i"nin halkası Kiremit. Dosyalar: `app/assets/brand/` (ev, kelime ve halka ayrı katmanlar, krem ve Gece Mürekkebi renkleri; birleşik `logo-ink.png` / `logo-cream.png`). Bileşen: `app/src/ui/Wordmark.tsx`. Kaynak görsel PNG/WebP olduğu için baskı için vektör (SVG/AI) dosyası ayrıca istenmeli.

Aşağıdaki metin ilk marka belgesindeki tarifi korur.

Wordmark **kiracım**, küçük harf, kalın, geometrik. İmza: "i"nin noktası içi boş bir Kiremit halka
("Anahtar Noktası"); noktasız "ı" kapı gibi sade. Koruma alanı: halka çapının iki katı. Minimum: dijitalde
72 px, baskıda 18 mm. Uygulama simgesi: Kiremit zemin, krem "k" ve halka nokta.
Kodda: `app/src/ui/Wordmark.tsx` (açılışta halka "i"den "ı"ya sıçrar, 600 ms).

> Not: "Kiracım" adı için tescil ve alan adı taraması yaptırılmalıdır.

## Renk

| Ad | HEX | Oran | Token |
| --- | --- | --- | --- |
| Krem Duvar | #FBF4EA | %45 | `bg`, `cream` |
| Gece Mürekkebi | #121A3B | %25 | `ink`, `hero`, `deepA` |
| Kiremit (ana) | #FF5A2E | %15 | `accent` |
| Nane Pervaz | #BFE8D2 | %8 | `mint`, `okBg` |
| Limon Perde | #FFD84A | %4 | `lemon` |
| Lavanta Gölge | #D8D0FF | %3 | `lavender` |

Gradyan: Krem Duvar → Lavanta Gölge, 160°. Kiremit üstünde metin Krem Duvar.
**Erişilebilirlik:** Kiremit (#FF5A2E) ile krem metin ve krem zeminde Kiremit metin 3:1'in altındadır;
bu yüzden Kiremit yalnızca dolgu, simge ve büyük metinde kullanılır. Küçük metin ve bağlantılar
`accentText` (#C2360F) ile yazılır.

## Tipografi

| Seviye | Font | Ağırlık / boyut |
| --- | --- | --- |
| Başlık | Bricolage Grotesque | ExtraBold, 48–72 px, satır aralığı %95 |
| Alt başlık | Hanken Grotesk | SemiBold, 20–28 px |
| Gövde | Hanken Grotesk | Regular, 16 px, %150 |
| Rakam | Hanken Grotesk, tabular | Bold, 32–56 px |
| Etiket | Hanken Grotesk | Medium, 12 px, +%2 harf aralığı |

## Simgeler ve desen

Line-art: 24 px ızgara, 2 px çizgi, yuvarlak uçlar. Her özellik simgesinde tek bir Kiremit halka nokta
(`app/src/domain/icons.js`). Düz arayüz işaretleri (artı, çarpı, geri, ara, ayar…) halkasızdır.

Cephe deseni: 6×4 yuvarlatılmış kare pencere, 8 px boşluk, %24 köşe. Ödenen ay Limon Perde ile yanar;
pencereler soldan sağa 80 ms arayla yanar (`app/src/ui/Facade.tsx`). Ana ekranda kira tutarının altında
12 aylık mini şerit olarak görünür.

## Dijital UI

- Mobil 4 sütun, 16 px kenar, 8 px birim. Web 12 sütun, 1200 px.
- Buton: hap, 56 px. Birincil Kiremit/krem, ikincil Gece Mürekkebi çerçeve, pasif Gece Mürekkebi %12.
- Kart: 24 px köşe, gölgesiz, %6 Gece Mürekkebi çizgi.

## Mikro-etkileşimler

| An | Hareket | Durum |
| --- | --- | --- |
| Açılış | Halka "i"den "ı"ya sıçrar, 600 ms | var (`OpenSplash`) |
| Ödeme onayı | Ay penceresi yanar, hafif haptik | var |
| Sayfa geçişi | Kesme yok, 280 ms yumuşak geçiş | var |
| Sözleşme imzası | Halka anahtara dönüşür | yok (sözleşme imzası özelliği uygulamada yok) |
| Arıza gönderimi | Buton "damla" olarak akar | yok |

## Baskı ve görsel üretim

Kartvizit, kurumsal dosya, anahtar kutusu ve Midjourney/DALL-E promptları (hoş geldin kutusu, kırtasiye,
ekran sunumu) marka belgesinde tanımlıdır; bu depoda kod karşılığı yoktur.
