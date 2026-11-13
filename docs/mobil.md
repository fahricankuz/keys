# iOS ve Android uygulaması

anahtar'ın telefon uygulaması, web sitesiyle **aynı koddan** üretilir: `app/` klasöründeki Expo + React Native uygulaması
web'de statik site, iPhone ve Android'de yerel uygulama olur. Mağaza sürümü **EAS** (Expo'nun derleme hizmeti) ile derlenir.
Eski Capacitor kabuğu (kökteki `ios/`, `android/`) kaldırılmıştır; Xcode ya da Android Studio projesi elle yönetilmez.

## Akış (kısaca)

```
app/ (Expo)  ──►  eas build  ──►  .ipa / .aab  ──►  eas submit  ──►  TestFlight / Play iç test  ──►  mağaza incelemesi
```

| Adım | Nasıl |
| --- | --- |
| Geliştirme | `cd app`, `npm install`, `npx expo start` (telefonda Expo Go ya da geliştirme derlemesi); `npm run typecheck` |
| Derleme | `eas build --profile production --platform all` ya da GitHub → Actions → **Mobil uygulama (Expo)** → Run workflow |
| Gönderme | `eas submit --platform ios` / `--platform android` (saklı App Store Connect API anahtarı ve Play hizmet hesabıyla) |
| Sürüm numarası | EAS tutar, her mağaza derlemesinde kendiliğinden artar |
| Güncelleme | Web sitesi her yayında kendiliğinden güncellenir. Telefon uygulamasındaki değişiklik **yeni mağaza sürümüyle** ulaşır |

Profiller, EAS ortam değişkenlerinin adları, gönderme ayarları, evrensel bağlantılar, anlık bildirim anahtarları, gizlilik
formları ve mağazaya çıkmadan önce kalan işlerin listesi **[magaza.md](magaza.md)** belgesindedir. Abonelik (mağaza içi
satın alma) için [abonelik.md](abonelik.md).

## Telefonda neler farklı

- **Anlık bildirim** — iPhone'da APNs, Android'de Firebase (FCM). İzin, girişten hemen sonra değil kısa bir açıklamadan sonra sorulur.
- **Güvenli oturum** — oturum anahtarı iOS Keychain / Android Keystore içinde saklanır (`expo-secure-store`); eski sürümdeki
  oturum bir kez taşınıp silinir.
- **Bot koruması** — telefonda CAPTCHA yoktur (WebView'deki Turnstile sistem tarayıcısını açtığı için kaldırıldı); giriş, kayıt ve şifre sıfırlamada kötüye kullanımı Supabase hız sınırları sınırlar. Turnstile yalnız webde çalışır.
- **Kamera** — dekont ve talep formunda "Kamerayla çek".
- **Bağlantılar** — davet, e-posta doğrulama ve şifre sıfırlama bağlantıları (`https://anahtar.io/…`) uygulamayı doğrudan açar.
- **Abonelik** — App Store / Google Play'in kendi ödeme ekranı.
- **Hata izleme** — Sentry (AB bölgesi); kişisel veri gönderilmez ([loglar.md](loglar.md)).
- **Excel dışa aktarma** — dosya olarak kaydedilir ve paylaşım penceresiyle açılır.
- Yalnız **iPhone** desteklenir (iPad yok); Android'de telefon.

## Uygulama kimliği

Uygulama kimliği `io.anahtar.app` (alan adının tersi) ve mağazaya **ilk yüklemeden sonra değiştirilemez**. Tanımlandığı yerler:
`app/app.json` (iOS `bundleIdentifier`, Android `package`), Apple'da tanımlayıcı (Push, Associated Domains, In-App Purchase),
Firebase uygulaması, RevenueCat uygulamaları ve APNs anahtarının kısıtı. Başka bir kimlik gerekirse ilk yüklemeden önce hepsi birlikte değişir.

## Gerçek cihaz denemesi

`preview` profiliyle derlenen test paketi (iPhone için ad hoc, Android için APK) ya da `production` profiliyle TestFlight / Play
iç test paketi gerçek cihazda denenir; deneme listesi [magaza.md](magaza.md) bölüm 10'dadır. Web sitesi için cihaz listesi:
[gercek-cihaz-kontrol.md](gercek-cihaz-kontrol.md).
