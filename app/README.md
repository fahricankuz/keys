# Kiracım — web sitesi ve mobil uygulama (React Native)

Tek kod tabanı: **tanıtım sitesi + uygulama** web'de, aynı uygulama iOS ve Android'de.
Expo + React Native (web için `react-native-web`), yönlendirme `expo-router`.

```
/            Tanıtım: özellikler, fiyatlar (aylık / yıllık), iletişim
/giris       Giriş
/kayit       Kayıt (kiracı ya da mülk sahibi)
/sifre       Şifre sıfırlama
/uygulama    Uygulamanın kendisi — yalnızca oturumla açılır
```

Uygulamadaki her özellik girişin arkasındadır. Oturum yoksa `/uygulama` altındaki
her adres `/giris`'e yönlenir.

## Çalıştırma

```bash
cd app
npm install
npx expo start --web        # geliştirme: http://localhost:8081
npx expo start              # telefon: Expo Go ya da geliştirme derlemesi
npm run typecheck
npx expo export -p web      # statik site → dist/ (her sunucuya yüklenebilir)
```

Statik çıktıda her rota için ayrı HTML üretilir (`/`, `/giris`, `/uygulama/talepler`…).
Sunucuda `.html` uzantısız adreslerin çözülmesi gerekir (Netlify, Vercel, Hostinger
Node/Apache `cleanUrls`; `npx serve dist` bunu kendisi yapar).

## Hesaplar ve veri

| | Yerel hesap (varsayılan) | Gerçek hesap |
| --- | --- | --- |
| Ne zaman | `EXPO_PUBLIC_SUPABASE_URL` ve `EXPO_PUBLIC_SUPABASE_ANON_KEY` boşken | İkisi de doluyken |
| Giriş / kayıt | Bu cihazda, şifre özetlenerek saklanır | Supabase Auth |
| Veri | Bu cihazda, hesap başına ayrı; ilk açılışta örnek veriyle başlar | Supabase'de; cihazlar arası, anlık eşitlenir (`domain/backend.js`) |
| Yönetici paneli | Yok | `/admin` (yalnızca `admins` tablosundaki hesaplar) |

Gerçek hesap kurulumu ve yönetici ekleme: [`docs/kurulum.md`](../docs/kurulum.md) → *Uygulama (React Native) ve yönetici paneli*.
Uçtan uca test: `npx playwright test tests/app-admin.spec.mjs` (sahte Supabase ile; gerçek sunucu kuralları `tests/admin.sql.spec.mjs` ve `tests/sql.spec.mjs` içinde gerçek Postgres'e karşı sınanır).

## Dizin

```
app/
  src/app/            Rotalar (expo-router): site, giriş, /katil, /uygulama/*, /admin
  src/site/           Tanıtım sayfası ve içeriği (özellikler, fiyatlar)
  src/auth/           Oturum (yerel ya da Supabase), giriş ekranı iskeleti
  src/ui/             Tasarım sistemi: renk/yazı tokenları, düğme, alan, chip
  src/app-ui/         Uygulama arayüzü: ekranlar, bölümler, alt sayfalar, formlar
  src/domain/         İş mantığı (eski web uygulamasından): state, logic, tax, services, i18n
```

Veri akışı tek yönlü: eylem (`services.js`) durumu değiştirir → `save()` → arayüz
(`useStore`) yeniden çizilir. Vergi, kira dönemi, depozito ve rapor hesapları eski
uygulamayla aynı modüllerdir (`tax.js`, `logic.js`).

## Yapılmayanlar (bu aşamada)

- Gerçek Supabase projesine karşı deneme (bu ortamdan erişilemedi; istemci sahte sunucuyla, kurallar PGlite ile sınandı)
- Telefona anlık bildirim (push) ve şifre sıfırlama bağlantısının yeni şifre ekranı
- App Store / Google Play satın alma (RevenueCat); abonelik ekranı durumu gösterir
- Biyometrik kilit, rehberli tur, PWA kurulum ipucu
- iOS/Android derlemeleri yalnızca JS paketi olarak doğrulandı (`expo export`);
  mağaza derlemesi için EAS ya da `expo prebuild` gerekir

Eski vanilla JS uygulaması (`/assets`, `/index.html`, Capacitor `/ios`, `/android`)
değiştirilmedi.
