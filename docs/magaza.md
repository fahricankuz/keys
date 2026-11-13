# App Store ve Google Play'e çıkış

Mağaza sürümü bugünkü uygulamadan (`app/`, Expo) üretilir. Yayıncı **DevirVentures**: Apple Developer ve Google Play
hesapları şirket hesaplarıdır. Eski Capacitor kabuğu kaldırıldı; mağazaya yalnız Expo uygulaması gider.

## Bir bakışta

| | Değer |
| --- | --- |
| Uygulama kimliği (bundle id / paket adı) | `io.anahtar.app` |
| App Store Connect uygulaması | **"anahtar: Kira Yönetimi"** (`ascAppId` 6834434284, Apple takım kimliği F5DQK4ZWFP; ikisi de `app/eas.json`'dadır) |
| Google Play uygulaması | **"anahtar"**, geliştirici hesabı "Devredin Bilgi Teknolojileri" |
| Cihazlar | **Yalnız iPhone** (iPad desteği kapalı, `supportsTablet: false`) ve Android telefon |
| Diller | Türkçe ve İngilizce |
| Kategori | İş (Business) |
| Expo hesabı | `anahtar_io` (proje kimliği `app.json`'da) |
| Abonelik | RevenueCat ile mağaza içi satın alma: [abonelik.md](abonelik.md) |

## 1. Derleme (EAS)

Derleme ve gönderme Expo'nun EAS hizmetiyle yapılır. İmza sertifikalarını EAS oluşturur ve saklar; sürüm numaraları EAS'te
tutulur ve her mağaza derlemesinde kendiliğinden artar (`eas.json` → `appVersionSource: remote`, `autoIncrement`).

**Profiller** (`app/eas.json`):

| Profil | Ne için | Not |
| --- | --- | --- |
| `development` | Geliştirme istemcisi | Yalnız ekip içi |
| `preview` | Test derlemesi (iPhone için ad hoc, Android için APK) | EAS ortamı `preview` |
| `production` | Mağaza paketi (Android `app-bundle`) | EAS ortamı `production`; Node sürümü sabittir |

**EAS ortam değişkenleri.** Mağaza derlemesinde kullanılan anahtarlar depoda değil, Expo hesabındaki EAS ortamlarında
(`production` ve `preview`) durur. Aşağıdaki **adlar** gerekir; değerleri belgeye, depoya ya da sohbete yazma.

| Değişken | Ne için |
| --- | --- |
| `EXPO_PUBLIC_SENTRY_DSN_MOBILE` | Telefon hata izleme adresi (Sentry `anahtar-mobile` projesi). Boşsa hata izleme kapalıdır |
| `EXPO_PUBLIC_RC_IOS_KEY`, `EXPO_PUBLIC_RC_ANDROID_KEY` | RevenueCat herkese açık SDK anahtarları. Tanımlı değilse satın alma kapalı kalır |
| `EXPO_PUBLIC_TURNSTILE_SITE_KEY` | Yalnız web derlemesi içindir (Cloudflare Turnstile site anahtarı). Telefon derlemesinde kullanılmaz: telefonda CAPTCHA yoktur, EAS'e girmeyin |
| `SENTRY_AUTH_TOKEN` (gizli), `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_URL` | Derleme sırasında hata ayıklama dosyalarını Sentry'ye (AB bölgesi) yükler |
| `GOOGLE_SERVICES_JSON` (dosya türünde) | Android anlık bildirimi için Firebase dosyası; yoksa uygulama bildirimsiz derlenir |

`EXPO_PUBLIC_` ile başlayanlar uygulamanın içine girer (herkese açıktır); gizli olanlar yalnız derleme makinesinde kalır.
Supabase adresi ve herkese açık anahtarı `eas.json` içinde profillere yazılıdır (gizli değildir). Dosya türünde değişken
şöyle yüklenir (her iki ortam için ayrı):

```
eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --environment production
```

**Derleme.**

1. Bilgisayarında `npm i -g eas-cli`, `cd app`, `eas login`.
2. `eas build --profile production --platform all`; ya da GitHub → Actions → **Mobil uygulama (Expo)** → Run workflow
   (profil ve platform seçilir). Actions, Expo hesabındaki robot kullanıcı `github-actions` adına çalışır; depo sırrı
   `EXPO_TOKEN` o kullanıcının anahtarıdır (kişisel anahtar değil). EAS sürümü iş akışında sabitlenmiştir.
3. Her PR'da ve ana dala girişte aynı iş akışı tür denetimi yapar ve iOS ve Android paketlerinin derlendiğini doğrular.

**Gönderme (`eas submit`).** Apple'a gönderim, Expo'da saklı **App Store Connect API anahtarıyla**; Google'a gönderim
saklı **Play hizmet hesabıyla** yapılır. Parola ya da iki adımlı doğrulama kodu gerekmez.

```
eas submit --platform ios --profile production        # TestFlight'a yükler
eas submit --platform android --profile production    # Play "iç test" kanalına, taslak sürüm olarak
```

`eas.json` → `submit.production`: iOS için `ascAppId` ve takım kimliği, Android için kanal `internal` ve durum `draft`.
**İlk Android paketi Play Console'dan elle yüklenir** (Play, ilk yüklemeyi API'den kabul etmez); sonrası `eas submit` ile gider.
Derleme ve gönderme, proje sahibinin açık onayıyla başlatılır.

## 2. İnceleme hesapları (zorunlu)

Uygulama giriş istediği için incelemeciye çalışan, verisi dolu hesap verilir:

```
SUPABASE_URL=https://<proje>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role> node app/scripts/inceleme-hesaplari.mjs
```

Çıktıdaki iki hesabı (mülk sahibi ve kiracı) App Store Connect → App Review Information ve Play Console → App access'e yaz.
Mülk sahibinin paketi süresiz açıktır, mülkte ödeme, talep ve mesaj örnekleri vardır. (`service_role` anahtarı yalnız bu komutun
çalıştığı satırda kalır; hiçbir dosyaya ya da sohbete yazılmaz.)

**İnceleme notu (örnek):**
> anahtar, kiracı ile mülk sahibinin aynı kira kaydını iki taraftan gördüğü bir kira yönetimi uygulamasıdır. Mülk sahibi
> hesabıyla mülk, ödeme, talep ve mesajları; kiracı hesabıyla dekont yükleme ve talep açmayı görebilirsiniz. Kullanıcılar
> mesajları uzun basarak ya da yazışmanın üstündeki bayrakla bildirebilir ve engelleyebilir; bildirimler 24 saat içinde
> incelenir. Hesap silme: Ayarlar → Hesap → Hesabı sil. Hukuki süreç desteği uygulama dışında verilen gerçek bir hizmettir
> (idari takip ve hukuk bürosuyla koordinasyon); ücreti uygulamada alınmaz.

## 3. Mağaza kuralları ve karşılığı

| Kural | Karşılığı |
| --- | --- |
| Hesap silme (Apple 5.1.1(v), Google hesap silme politikası) | Uygulamada Ayarlar → Hesap → Hesabı sil; silme başarısız olursa hata gösterilir, oturum açık kalır; etkin mağaza aboneliği varsa önce mağazadan iptal edilmesi gerektiği söylenir. Web: https://anahtar.io/hesap-silme/ |
| Gizlilik politikası | https://anahtar.io/gizlilik/ (uygulamada Ayarlar → Yardım) |
| Kullanıcı içeriği (Apple 1.2, Google UGC) | Mesajı/kişiyi bildir, engelle; koşullarda sıfır tolerans maddesi; yönetici paneli → Şikâyetler (24 saat) |
| Giriş gerektiren uygulama (Apple 2.1) | Bölüm 2'deki inceleme hesapları |
| Dijital abonelik (Apple 3.1.1, Google Play Billing) | Telefonda mağaza içi satın alma (RevenueCat, [abonelik.md](abonelik.md)); uygulamadan web ödeme sayfasına yönlendirme yok, web'de ödeme alınmaz. Satın alımları geri yükle ve Aboneliği yönet düğmeleri var; paywall fiyatı, dönemi, otomatik yenilemeyi ve koşullar/gizlilik bağlantılarını gösterir |
| Tanıtım sitesi kopyası (Apple 4.2) | Telefonda açılış ekranı tanıtım sayfası değil: oturum açıksa panel, değilse giriş. Yönetici giriş bağlantısı telefonda gizlidir |
| Gerçek dünya hizmeti (hukuki destek) | Apple 3.1.3(e) / Google: uygulama dışında tüketilen hizmet; mağaza ödemesi gerekmez |
| Gizlilik manifesti (iOS) | `app.json` → `ios.privacyManifests` (takip yok; toplanan veri türleri aşağıda) |
| Şifreleme beyanı | `ITSAppUsesNonExemptEncryption: false` (yalnız HTTPS) |
| İzinler | Yalnız kamera ve galeri (açıklamalı); mikrofon, eski depolama, ekran üstü çizim ve reklam kimliği (`AD_ID`) engelli; Android yedeklemesi kapalı (`allowBackup: false`) |
| Takip ve reklam | Yok: App Tracking Transparency izni ve çerez bandı gerekmez |

**Gizlilik manifesti değişiklikleri** (bu sürümde): eklendi: *Satın alma geçmişi* (abonelik), *Cihaz kimliği* (bildirim
anahtarı), *Performans verisi* ve *Diğer tanılama verisi* (Sentry hata izleme); kaldırıldı: *Ödeme bilgisi* (kart bilgisi
uygulamada hiç işlenmez). Takip hâlâ yoktur. Yeni bir veri türü toplanırsa `app.json` ile aşağıdaki form birlikte güncellenir.

**Derleme düzeni.** Açılış ekranı açık ve koyu tema için ayarlıdır; simge opak 1024 piksel; Android uyarlanabilir simge güvenli
alan içindedir; Android bildirim simgesi ve varsayılan bildirim kanalı (`evim`) tanımlıdır; Excel dışa aktarma telefonda dosya
olarak kaydedilip paylaşım penceresiyle açılır.

## 4. App Store "App Privacy" ve Google Play "Data Safety" yanıtları

Takip (tracking): **Hayır**. Veriler satılmaz, reklam için kullanılmaz. Aktarımda şifrelenir (HTTPS). Kullanıcı verisini silebilir.

| Veri | Neden | Kimliğe bağlı | Paylaşılan hizmet sağlayıcı |
| --- | --- | --- | --- |
| Ad, e-posta, telefon | Hesap ve iletişim | Evet | Supabase (barındırma), e-posta ve SMS sağlayıcıları |
| Adres (mülk adresi) | Uygulama işlevi | Evet | Supabase |
| Kira ve ödeme bilgisi, dekontlar | Uygulama işlevi | Evet | Supabase |
| Fotoğraflar | Dekont, talep, tutanak | Evet | Supabase |
| Mesajlar | Kiracı–mülk sahibi yazışması | Evet | Supabase |
| Satın alma geçmişi | Abonelik | Evet | RevenueCat, Apple / Google |
| Cihaz kimliği (bildirim anahtarı) | Anlık bildirim | Evet | Supabase, Apple (APNs) / Google (FCM) |
| Hata kayıtları, çökme ve performans verisi | Uygulamanın kararlılığı | Evet (yalnız rastgele kullanıcı kimliği; e-posta, ad, telefon yok) | Supabase, Sentry (AB bölgesi) |

Kart bilgisi uygulamada işlenmez (ödeme mağazada yapılır). Oturum tekrarı (ekran kaydı) yoktur.

## 5. Mağaza sayfası

- Ad: App Store'da **anahtar: Kira Yönetimi**, Google Play'de **anahtar**; alt başlık: *Kira, ödeme ve talep takibi*;
  kategori: **İş (Business)**; diller Türkçe ve İngilizce.
- Yaş derecelendirmesi: kullanıcılar arası mesajlaşma var (Apple anketinde "User Generated Content" evet); koşullar 18 yaş
  ve üstünü ister. Anket yanıtları son kez gözden geçirilir.
- Destek adresi: https://anahtar.io/destek/ · Pazarlama: https://anahtar.io · Gizlilik: https://anahtar.io/gizlilik/ ·
  Kullanım koşulları (EULA): https://anahtar.io/kosullar/
- Ekran görüntüleri: **iPhone** 6,9" ve 6,5" ve Android telefon (iPad olmadığı için iPad görüntüsü gerekmez). Öneri: panel, mülk
  ödemeleri, dekont yükleme, talep, mesajlar; Türkçe ve İngilizce.
- `node scripts/magaza-ekranlari.mjs` (depo kökünden) örnek verili portföyle **web** derlemesinden taslak görüntü çıkarır
  (`magaza-ekranlari/`, depoya eklenmez; `ipad-13` çıktısı artık kullanılmaz). Mağaza incelemesi için gerçek cihazdan ya da
  simülatörden alınan **yerel uygulama** görüntüleri tercih edilir.

## 6. Yayından önce sunucu ayarları (bkz. canliya-alma.md)

- Supabase → Authentication → **SMTP**: özel SMTP tanımla (yerleşik e-posta servisi üretim için çok düşük sınırla çalışır;
  şifre sıfırlama e-postaları yoğunlukta ulaşmaz).
- **Bot koruması (Turnstile):** yalnız webde (GitHub'da `TURNSTILE_SITE_KEY`). **Telefon uygulamasında CAPTCHA yoktur**; Supabase →
  Attack Protection → CAPTCHA zorunluluğu **kapalı kalır** (açılırsa telefondan kimse giriş yapamaz). Telefonda kötüye kullanımı Supabase hız
  sınırları sınırlar ([guvenlik.md](guvenlik.md) bölüm 4).
- **Evrensel bağlantılar:** bölüm 9.

## 7. Mağaza içi satın alma (RevenueCat)

Telefonda paket mağazadan alınır; satın almadan sonra `billing` fonksiyonu aboneliği RevenueCat'ten okuyup `subscriptions`
tablosuna yazar. Katalog (App Store'da 36 ürün, Play'de 2 abonelik ve 18'er temel plan), fiyat tablosu
(`node app/scripts/magaza-fiyatlari.mjs`), webhook, günlük uzlaştırma, ödeme duraklatma bayrağı (`app_config` → `billing_paused`)
ve kurulum sırası **[abonelik.md](abonelik.md)** belgesindedir. Kod: `app/src/domain/iap.native.js`,
`app/src/app-ui/store-purchase.tsx`, ürün kimlikleri `app/src/domain/store-ids.js`.

## 8. Telefona anlık bildirim

Uygulama, bildirim iznini girişten hemen sonra değil, kısa bir açıklama sayfasından sonra ister; cihaz anahtarı sunucuya
kaydedilir (aynı cihazı başka hesap kullanırsa anahtar yeni hesaba taşınır) ve çıkışta silinir. `push` fonksiyonu yeni
bildirimi APNs (iOS) ve FCM (Android) ile gönderir; dokununca ilgili ekran açılır.

1. **iOS (APNs):** Apple Developer → Keys → yeni anahtar, "Apple Push Notifications service (APNs)" işaretli; **yalnız
   Production ortamı** ve **yalnız `io.anahtar.app` uygulaması için (topic specific)** kısıtla → `.p8` dosyası. Supabase gizli
   değişkenleri: `APNS_KEY` (dosyanın içeriği), `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID=io.anahtar.app`.
   `preview` ve `production` derlemeleri APNs "production" ortamını kullanır (`app.config.js`); `APNS_SANDBOX` yalnız Xcode'dan
   kurulan geliştirme derlemeleri içindir. `.p8` dosyası hiçbir yere kaydedilmez, depoya girmez (`.gitignore` engeller).
2. **Android (FCM):** Firebase projesi **`anahtario`** (diğer projelerden ayrı) → Android uygulaması `io.anahtar.app` →
   `google-services.json` indir; EAS'e `GOOGLE_SERVICES_JSON` dosya değişkeni olarak yükle (bölüm 1; depoya eklenmez).
   Firebase → Project settings → Service accounts → yeni özel anahtar (JSON, FCM v1) → Supabase gizli değişkeni `FCM_SERVICE_ACCOUNT`.
3. `supabase functions deploy push --no-verify-jwt`. Bildirimden fonksiyona giden webhook artık elle kurulmaz: `kasa_sirlari`
   migration'ı tetikleyiciyi kurar; gizli değer Vault'ta (`anahtar_push_secret`), fonksiyonda `WEBHOOK_SECRET` olarak aynıdır.
4. Anahtarlar eklendikten sonra yeni bir mağaza derlemesi gerekir (bildirim yetkisi ve Firebase dosyası derlemeye girer).

## 9. Evrensel bağlantılar (davet, doğrulama, şifre sıfırlama)

`https://anahtar.io/katil…`, `/dogrula…` ve `/yeni-sifre…` bağlantıları telefonda doğrudan uygulamayı açar. Uygulama tarafı
hazırdır (`app.json` → iOS `associatedDomains`, Android `intentFilters` ve `autoVerify`). Siteden iki doğrulama dosyası
yayınlanır:

- `https://anahtar.io/.well-known/apple-app-site-association` (iOS) ve `https://anahtar.io/.well-known/assetlinks.json` (Android).
- Site derlenirken `app/scripts/well-known.mjs` bu iki dosyayı yazar; değerleri GitHub → Settings → Secrets and variables →
  Actions → **Variables** altındaki iki değişkenden alır: `APPLE_TEAM_ID` (Apple Developer → Membership → Team ID) ve
  `ANDROID_SHA256` (Play Console → Test and release → App integrity → *App signing key certificate* → SHA-256; EAS yükleme
  anahtarı da eklenecekse virgülle ayrılır). Değişken yoksa ilgili dosya yazılmaz ve derlemede uyarı çıkar; biçimi bozuksa
  derleme durur, bozuk dosya yayına çıkmaz. `.htaccess` dosyaları yönlendirmesiz ve JSON olarak sunar.
- Doğrulama: `https://app-site-association.cdn-apple.com/a/v1/anahtar.io` Apple'ın dosyayı gördüğünü, Play Console → *Deep links*
  Android'in doğruladığını gösterir.
- Şifre sıfırlama ve e-posta değişikliği bağlantıları tek kullanımlıktır (PKCE) ve isteğin yapıldığı cihazda açılmalıdır;
  başka cihazda açılırsa uygulama "bu bağlantıyı isteği yaptığın cihazda aç ya da giriş yap" der.
- Supabase → Authentication → URL Configuration → Redirect URLs listesi `https://anahtar.io/**` adreslerini kapsamalıdır
  (özellikle `/dogrula` ve `/yeni-sifre`).

## 10. Mağazaya göndermeden önce kalan işler

- [ ] **Yasal sayfalar** (`gizlilik`, `kosullar`, `hesap-silme`) hâlâ **taslak**: şirket unvanı, adres, MERSİS, vergi dairesi ve
      numarası, yürürlük tarihi girilmeli, bir hukukçu gözden geçirmeli, "Taslak" kutusu ve `noindex` kaldırılmalı.
      **Bu madde mağaza gönderiminin engelidir.**
- [ ] App Store Connect: *Paid Apps* sözleşmesi, vergi ve banka; yaş derecelendirmesi anketi; gizlilik etiketleri (bölüm 4); inceleme bilgisi ve hesapları.
- [ ] Google Play: ödeme profili, içerik derecelendirmesi, veri güvenliği formu, finansal özellikler, uygulama erişimi, ilk .aab (iç test).
- [ ] 36 App Store ürünü ve 2 Play aboneliği (18'er temel plan), RevenueCat ve webhook ([abonelik.md](abonelik.md)).
- [ ] EAS ortam değişkenlerinin tamamı (bölüm 1), Firebase ve APNs anahtarları (bölüm 8).
- [ ] `APPLE_TEAM_ID` ve `ANDROID_SHA256` değişkenleri, siteyi yeniden yayınlama, iki doğrulama dosyasının kontrolü (bölüm 9).
- [ ] TestFlight ve Play iç test ile cihazda deneme: giriş, bağlantılar, anlık bildirim, sandbox satın alma + geri yükleme + paket
      değişikliği, hesap silme, Sentry test hatası.
- [ ] Yerel uygulamadan mağaza ekran görüntüleri (Türkçe/İngilizce).
- [ ] Proje sahibinin açık onayıyla incelemeye gönder; her iki mağaza onaylayınca `billing_paused` bayrağını **false** yap.

Ek bilgi: hata izleme ve günlükler [loglar.md](loglar.md), korumalar [guvenlik.md](guvenlik.md), yayın sırası [canliya-alma.md](canliya-alma.md).
