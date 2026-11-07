# App Store ve Google Play'e çıkış

Mağaza sürümü bugünkü uygulamadan (`app/`, Expo) üretilir. Kökteki eski Capacitor kabuğu (`ios/`, `android/`, `assets/js`)
kullanım dışıdır; mağazaya gönderilmez.

## 1. Derleme (EAS)

1. [expo.dev](https://expo.dev) hesabı aç; bilgisayarında `npm i -g eas-cli`, `cd app`, `eas login`, `eas init`
   (proje kimliği `app.json`'a yazılır, commit et).
2. Apple Developer ve Google Play Console hesapları; ilk derlemede EAS imza sertifikalarını kendisi oluşturur ve saklar.
3. Derle: `eas build --profile production --platform all` ya da GitHub → Actions → **Mobil uygulama (Expo)** → Run workflow
   (depo sırrı `EXPO_TOKEN`: expo.dev → Account settings → Access tokens).
4. Gönder: `eas submit --platform ios` / `--platform android` (ilk Android gönderimi Play Console'dan elle yüklenir).

Her push'ta `.github/workflows/expo-mobile.yml` iOS ve Android paketlerinin derlendiğini doğrular. Sürüm numaraları EAS'te
tutulur ve her mağaza derlemesinde kendiliğinden artar (`eas.json` → `appVersionSource: remote`, `autoIncrement`).

## 2. İnceleme hesapları (zorunlu)

Uygulama giriş istediği için incelemeciye çalışan, verisi dolu hesap verilir:

```
SUPABASE_URL=https://<proje>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role> node app/scripts/inceleme-hesaplari.mjs
```

Çıktıdaki iki hesabı (mülk sahibi ve kiracı) App Store Connect → App Review Information ve Play Console → App access'e yaz.
Mülk sahibinin paketi süresiz açıktır, mülkte ödeme, talep ve mesaj örnekleri vardır.

**İnceleme notu (örnek):**
> anahtar, kiracı ile mülk sahibinin aynı kira kaydını iki taraftan gördüğü bir kira yönetimi uygulamasıdır. Mülk sahibi
> hesabıyla mülk, ödeme, talep ve mesajları; kiracı hesabıyla dekont yükleme ve talep açmayı görebilirsiniz. Kullanıcılar
> mesajları uzun basarak ya da yazışmanın üstündeki bayrakla bildirebilir ve engelleyebilir; bildirimler 24 saat içinde
> incelenir. Hesap silme: Ayarlar → Hesap → Hesabı sil. Hukuki süreç desteği uygulama dışında verilen gerçek bir hizmettir
> (idari takip ve hukuk bürosuyla koordinasyon); ücreti uygulamada alınmaz.

## 3. Mağaza kuralları ve karşılığı

| Kural | Karşılığı |
| --- | --- |
| Hesap silme (Apple 5.1.1(v), Google hesap silme politikası) | Uygulamada Ayarlar → Hesap → Hesabı sil; web: https://anahtar.io/hesap-silme/ |
| Gizlilik politikası | https://anahtar.io/gizlilik/ (uygulamada Ayarlar → Yardım) |
| Kullanıcı içeriği (Apple 1.2, Google UGC) | Mesajı/kişiyi bildir, engelle; koşullarda sıfır tolerans maddesi; yönetici paneli → Şikâyetler (24 saat) |
| Giriş gerektiren uygulama (Apple 2.1) | Bölüm 2'deki inceleme hesapları |
| Dijital abonelik (Apple 3.1.1, Google Play Billing) | Telefonda mağaza içi satın alma (RevenueCat, bölüm 7); uygulamadan web ödeme sayfasına yönlendirme yok. Web'de satın alma sanal POS ile sürer. Satın alımları geri yükle ve Aboneliği yönet düğmeleri var |
| Tanıtım sitesi kopyası (Apple 4.2) | Telefonda açılış ekranı tanıtım sayfası değil: oturum açıksa panel, değilse giriş |
| Gerçek dünya hizmeti (hukuki destek) | Apple 3.1.3(e) / Google: uygulama dışında tüketilen hizmet; mağaza ödemesi gerekmez |
| Gizlilik manifesti (iOS) | `app.json` → `ios.privacyManifests` (takip yok; toplanan veri türleri aşağıda) |
| Şifreleme beyanı | `ITSAppUsesNonExemptEncryption: false` (yalnız HTTPS) |
| İzinler | Kamera ve galeri (açıklamalı); mikrofon ve eski depolama izinleri kapalı |
| Takip ve reklam | Yok: App Tracking Transparency izni ve çerez bandı gerekmez |

## 4. App Store "App Privacy" ve Google Play "Data Safety" yanıtları

Takip (tracking): **Hayır**. Veriler satılmaz, reklam için kullanılmaz. Aktarımda şifrelenir (HTTPS). Kullanıcı verisini silebilir.

| Veri | Neden | Kimliğe bağlı | Paylaşılan hizmet sağlayıcı |
| --- | --- | --- | --- |
| Ad, e-posta, telefon | Hesap ve iletişim | Evet | Supabase (barındırma), Resend (e-posta), SMS sağlayıcısı |
| Adres (mülk adresi) | Uygulama işlevi | Evet | Supabase |
| Kira ve ödeme bilgisi, dekontlar | Uygulama işlevi | Evet | Supabase |
| Fotoğraflar | Dekont, talep, tutanak | Evet | Supabase |
| Mesajlar | Kiracı–mülk sahibi yazışması | Evet | Supabase |
| Satın alma geçmişi | Abonelik (mağaza içi satın alma eklenirse) | Evet | RevenueCat |
| Hata kayıtları | Uygulamanın kararlılığı | Evet (oturum açıksa) | Supabase |

Kart bilgisi uygulamada işlenmez (ödeme mağaza ya da ödeme kuruluşunda).

## 5. Mağaza sayfası

- Ad: **anahtar**, alt başlık: *Kira, ödeme ve talep takibi*; kategori: İş (Business) ya da Verimlilik (Productivity).
- Yaş derecelendirmesi: kullanıcılar arası mesajlaşma var (Apple anketinde "User Generated Content" evet), 4+ / Herkes.
- Destek adresi: https://anahtar.io/destek/ · Pazarlama: https://anahtar.io · Gizlilik: https://anahtar.io/gizlilik/
- Ekran görüntüleri: iPhone 6,9" ve 6,5"; **iPad** (`supportsTablet: true` olduğu için zorunlu; istenmezse `app.json`'da
  `false` yapılır); Android telefon. Öneri: panel, mülk ödemeleri, dekont yükleme, talep, mesajlar.
- Görüntüleri otomatik çıkar (örnek verili portföy, gerçek kişi verisi yok): depo kökünde `node scripts/magaza-ekranlari.mjs`
  → `magaza-ekranlari/iphone-6.9`, `iphone-6.5`, `ipad-13`, `android` (depoya eklenmez).

## 6. Yayından önce sunucu ayarları (bkz. canliya-alma.md)

- Supabase → Authentication → **SMTP**: Resend'i özel SMTP olarak tanımla (yerleşik e-posta servisi üretim için çok düşük
  sınırla çalışır; şifre sıfırlama e-postaları yoğunlukta ulaşmaz).
- **Bot koruması (Turnstile):** web için açılmalı (`TURNSTILE_SITE_KEY` + Supabase → Attack Protection → CAPTCHA).
  Dikkat: Supabase'teki CAPTCHA zorunluluğu tüm girişlere uygulanır. Telefon uygulamasında Turnstile henüz yok; uygulama
  mağazaya çıkmadan önce ya uygulamaya Turnstile eklenmeli ya da CAPTCHA kapalı tutulup Auth hız sınırları sıkılaştırılmalı.

## 7. Mağaza içi satın alma (RevenueCat)

Telefonda paket mağazadan alınır; satın almadan sonra `billing` fonksiyonu aboneliği RevenueCat'ten okuyup `subscriptions`
tablosuna yazar (web'de alınan paket de telefonda geçerlidir, tersi de). Kod: `app/src/domain/iap.native.js`,
`app/src/app-ui/store-purchase.tsx`, ürün kimlikleri `app/src/domain/store-ids.js`.

**Ürün kimlikleri** (fiyat mülk başına × adet; sunucu kimlikten paketi ve mülk sınırını okur):

| Mağaza | Kimlikler |
| --- | --- |
| App Store | `tek_1_aylik` … `tek_9_aylik`, `tek_1_yillik` … `tek_9_yillik`, aynısı `bes_…` için: **36 otomatik yenilenen abonelik**, hepsi tek abonelik grubunda ("anahtar"). Grupta sıralama: Profesyonel üstte, çok mülk üstte (yükseltme/düşürme mağazada çalışsın) |
| Google Play | 18 abonelik: `tek_1` … `tek_9`, `bes_1` … `bes_9`; her birinde iki temel plan: `aylik` (1 ay) ve `yillik` (1 yıl) |

Fiyatlar (KDV dahil, `app/src/domain/config.js` → `billing.tiers`): Başlangıç 99,99 ₺ / mülk / ay, 999,90 ₺ / mülk / yıl;
Profesyonel 199,99 ₺ ve 1.999,90 ₺. Mağazanın fiyat basamaklarından en yakını seçilir. İlk ay ücretsizse "tanıtım teklifi:
1 ay ücretsiz" olarak eklenir.

**Kurulum sırası:**
1. App Store Connect → Business: **Paid Apps** sözleşmesi, vergi ve banka bilgileri (yapılmadan ürünler görünmez).
   Play Console → Ödeme profili.
2. Ürünleri yukarıdaki kimliklerle oluştur.
3. [RevenueCat](https://app.revenuecat.com): proje → App Store uygulaması (App Store Connect API anahtarı ya da uygulama içi
   satın alma paylaşılan sırrı) ve Play Store uygulaması (Google hizmet hesabı JSON'u) ekle; ürünleri içe aktar;
   **pro** adlı yetki (entitlement) oluşturup 54 ürünün hepsini bağla.
4. RevenueCat → Integrations → Webhooks: adres `https://<proje>.supabase.co/functions/v1/billing`, Authorization değeri uzun
   rastgele bir metin.
5. Supabase gizli değişkenleri: `REVENUECAT_SECRET_KEY` (RevenueCat → API keys → Secret, `sk_…`), `REVENUECAT_WEBHOOK_AUTH`
   (4. adımdaki değer); sonra `supabase functions deploy billing`.
6. Herkese açık SDK anahtarları (gizli değildir) `app/eas.json` → `build.base.env` altına:
   `EXPO_PUBLIC_RC_IOS_KEY` (`appl_…`) ve `EXPO_PUBLIC_RC_ANDROID_KEY` (`goog_…`). Tanımlı değilse telefonda satın alma
   kapalı kalır ("bu cihazda henüz açık değil").
7. Dene: TestFlight'ta sandbox hesabıyla, Android'de Play Console → Lisans testi hesabıyla satın al; Supabase'de
   `subscriptions` satırı `store = app_store / play_store` olarak gelmeli.

## 8. Telefona anlık bildirim

Uygulama girişten sonra bildirim izni ister ve cihaz anahtarını `device_tokens` tablosuna yazar; `push` fonksiyonu yeni
bildirimi APNs (iOS) ve FCM (Android) ile gönderir (`supabase/functions/push/native.ts`). Dokununca ilgili ekran açılır.

1. **iOS:** Apple Developer → Keys → yeni anahtar, "Apple Push Notifications service (APNs)" işaretli → `.p8` dosyası.
   Supabase gizli değişkenleri: `APNS_KEY` (dosyanın içeriği), `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID=io.anahtar.app`.
2. **Android:** [Firebase](https://console.firebase.google.com) → proje → Android uygulaması `io.anahtar.app` →
   `google-services.json` indir. EAS'e "file" türünde ortam değişkeni olarak yükle:
   `eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment production`
   (depoya eklenmez). Firebase → Project settings → Service accounts → yeni özel anahtar (JSON) → Supabase gizli değişkeni
   `FCM_SERVICE_ACCOUNT`.
3. `supabase functions deploy push --no-verify-jwt` ve Database Webhook (`notifications` Insert → `push`, `docs/kurulum.md` 5.3).
4. Anahtarlar eklendikten sonra yeni bir mağaza derlemesi gerekir (bildirim izni ve Firebase dosyası derlemeye girer).

