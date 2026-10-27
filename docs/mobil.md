# iOS ve Android uygulaması

Kiracım'ın telefon uygulaması, web sürümüyle **aynı koddan** üretilir:
[Capacitor](https://capacitorjs.com) web uygulamasını yerel bir iOS/Android
kabuğunun içinde çalıştırır ve telefonun yeteneklerine (bildirim, Face ID,
kamera, mağaza ödemesi) erişim verir. Web sürümü GitHub Pages'te aynen
yayınlanmaya devam eder.

```
assets/, index.html ──► scripts/build.mjs ──► www/ ──► cap sync ──► ios/  (Xcode)
                           (+ native/entry.js)                  └─► android/ (Android Studio)
```

| Klasör | İçerik |
| --- | --- |
| `native/entry.js` | Yerel eklentilerin listesi (tek pakette derlenir) |
| `assets/js/native.js` | Eklentileri uygulamaya bağlar; web'de hiçbir şey yapmaz |
| `ios/`, `android/` | Yerel projeler (Xcode / Android Studio ile açılır) |
| `resources/` | Uygulama ikonu ve açılış ekranı kaynakları |
| `capacitor.config.json` | Uygulama kimliği, ad, eklenti ayarları |

## Telefonda neler farklı

- **Anlık bildirim** — iPhone'da APNs, Android'de Firebase (FCM). Ana ekrana
  ekleme gerekmez.
- **Uygulama kilidi** — Ayarlar → Güvenlik: Face ID / Touch ID / parmak izi.
- **Güvenli oturum** — oturum anahtarı Keychain (iOS) / Keystore (Android)
  içinde saklanır.
- **Kamera** — dekont ve talep formunda "Kamerayla çek".
- **Bağlantılar** — davet, e-posta doğrulama ve şifre sıfırlama bağlantıları
  doğrudan uygulamayı açar.
- **Android geri tuşu** — önce açık pencereyi, sonra önceki ekranı kapatır;
  ana ekranda uygulamayı arka plana alır.
- **Abonelik** — App Store / Google Play'in kendi ödeme ekranı
  (bkz. [abonelik.md](abonelik.md)).
- Service worker ve "uygulamayı yükle" önerisi telefonda kapalıdır; dosyalar
  zaten cihazdadır.

---

## 1. Geliştirme ortamı

| | Gerekli |
| --- | --- |
| Her ikisi | Node.js 22, `npm ci` |
| iOS | Mac + Xcode 16 veya üstü |
| Android | Android Studio (JDK 21 ve Android SDK birlikte gelir) |

```bash
npm ci
npm run android   # www/ üretir, eşitler, Android Studio'yu açar
npm run ios       # www/ üretir, eşitler, Xcode'u açar
```

Android Studio'da ▶ ile emülatörde ya da USB ile bağlı telefonda çalıştır.
Xcode'da önce **Signing & Capabilities → Team** seç (Apple hesabın), sonra ▶.

Kodu değiştirdikten sonra `npm run build:native` yeterli; yerel projeyi
yeniden açmak gerekmez.

> Mac'in yoksa: her gönderimde GitHub Actions iki platformu da derler
> (`.github/workflows/mobile.yml`) ve Android için kurulabilir bir APK
> üretir: **Actions → Mobil derleme → son çalıştırma → Artifacts**.

## 2. Uygulama kimliği

Uygulama kimliği `online.kiracim.app` (alan adının tersi). Mağazaya **ilk
yüklemeden sonra değiştirilemez**; başka bir kimlik gerekirse ilk yüklemeden
önce şu yerlerde değiştirilir:

- `capacitor.config.json` → `appId`
- `android/app/build.gradle` → `namespace` ve `applicationId`
  (ve `android/app/src/main/java/online/evim/app/` klasör yolu)
- Xcode → App hedefi → *Bundle Identifier*
- `assets/js/config.js` → `billing.androidPackage`

## 3. Bağlantıların uygulamayı açması

Davet ve e-posta bağlantıları `https://kiracim.online/…` biçiminde üretilir ve
telefonda doğrudan uygulamayı açar. Alan adı koda işlendi
(`config.js` → `publicUrl`, `android/gradle.properties` → `evimHost`,
`ios/App/App/App.entitlements`). Senin yapacakların:

1. Sitenin `kiracim.online` adresinde yayında olması
   ([kurulum.md → 7](kurulum.md#7-github-pages-ve-kiracimonline)).
2. GitHub → Settings → Secrets and variables → Actions → **Variables**:
   - `APPLE_TEAM_ID` — developer.apple.com → Membership → Team ID
   - `ANDROID_SHA256` — Play Console → Test and release → App integrity →
     *App signing key certificate* → SHA-256
   Bunlar girilince site doğrulama dosyalarını (`.well-known/…`) kendisi yayınlar.
3. Supabase → Authentication → URL Configuration:
   - **Site URL**: `https://kiracim.online/`
   - **Redirect URLs**: `https://kiracim.online/auth`, `https://kiracim.online/` ve `evim://auth`
4. Doğrulama: yayından sonra
   `https://app-site-association.cdn-apple.com/a/v1/kiracim.online` adresi
   Apple'ın dosyayı gördüğünü, Play Console → *Deep links* sayfası Android'in
   doğruladığını gösterir.

## 4. Anlık bildirimler

### iPhone (APNs)

1. developer.apple.com → Certificates, IDs & Profiles → **Keys** → "+" →
   *Apple Push Notifications service (APNs)* → .p8 dosyasını indir.
2. Supabase gizli değişkenleri:

```bash
supabase secrets set APNS_KEY="$(cat AuthKey_XXXXXXXXXX.p8)"
supabase secrets set APNS_KEY_ID=XXXXXXXXXX APNS_TEAM_ID=YYYYYYYYYY APNS_BUNDLE_ID=online.kiracim.app
# Xcode'dan doğrudan kurulan geliştirme sürümüyle denerken:
supabase secrets set APNS_SANDBOX=1
```

Xcode'da *Push Notifications* yeteneği `App.entitlements` ile zaten açık.

### Android (Firebase Cloud Messaging)

1. console.firebase.google.com → proje oluştur → **Android uygulaması ekle**
   (paket adı `online.kiracim.app`) → `google-services.json` dosyasını
   `android/app/` klasörüne koy.
2. Firebase → Project settings → **Service accounts** → *Generate new
   private key* (JSON).

```bash
supabase secrets set FCM_SERVICE_ACCOUNT="$(cat evim-firebase-adminsdk.json)"
```

Sonra push fonksiyonunu yeniden yükle:

```bash
supabase functions deploy push --no-verify-jwt
```

Uygulamada: Hesap → *Anlık bildirimleri aç*.

## 5. Mağaza sürümü

### Google Play

1. Bir kez yükleme anahtarı oluştur ve **güvenli yerde sakla** (kaybolursa
   güncelleme yüklenemez):

```bash
keytool -genkey -v -keystore evim-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias evim
```

2. Paket (.aab):

```bash
npm run build:native
cd android
EVIM_KEYSTORE=/yol/evim-upload.jks EVIM_KEYSTORE_PASSWORD=… EVIM_KEY_ALIAS=evim EVIM_KEY_PASSWORD=… \
  ./gradlew bundleRelease -PevimVersionCode=2 -PevimVersionName=1.0.1
# → android/app/build/outputs/bundle/release/app-release.aab
```

3. Play Console → uygulama oluştur → **Test and release → Closed testing** →
   .aab dosyasını yükle. Hesap **şirket (organization) hesabı** olarak açıldığı
   için kişisel hesaplardaki "12 test kullanıcısı, 14 gün" şartı uygulanmaz;
   yine de birkaç gerçek kullanıcıyla kısa bir kapalı test önerilir.
4. Her yeni sürümde `evimVersionCode` bir artmalı.

### App Store

1. App Store Connect → **Apps → "+"** → Bundle ID `online.kiracim.app`.
2. Xcode → üst menü **Product → Archive** → *Distribute App* → *App Store
   Connect*. Sürüm: App hedefi → General → *Version* ve *Build*.
3. Önce **TestFlight** ile kendin ve birkaç kişiyle dene, sonra incelemeye
   gönder.

### İnceleme için hazırlık

- **Test hesabı**: bir mülk sahibi ve bir kiracı hesabı; mülk sahibinde örnek
  mülkler olsun. İnceleme notuna e-posta/şifreleri yaz.
- **Gizlilik**: App Store *App Privacy* ve Play *Data safety* formları.
  Toplanan veriler: ad, e-posta, telefon (hesap); fotoğraf ve belgeler
  (kullanıcı içeriği); satın alma geçmişi (abonelik). Veriler reklam ya da
  izleme için kullanılmaz.
- **Yasal sayfalar** sitede hazır (`site/` klasörü); mağaza formlarına bu adresleri gir:

  | Mağaza alanı | Adres |
  | --- | --- |
  | Gizlilik politikası (Apple, Google) | `https://kiracim.online/gizlilik/` |
  | Kullanım koşulları / EULA (Apple, abonelik için) | `https://kiracim.online/kosullar/` |
  | Destek adresi (Apple) | `https://kiracim.online/destek/` |
  | Hesap silme adresi (Google *Data safety*) | `https://kiracim.online/hesap-silme/` |
  | İletişim e-postası | `info@kiracim.online` |

  Sayfalar şu an **taslak**: şirket unvanı, adres, MERSİS ve vergi bilgisi
  `site/*/index.html` içinde işaretli alanlarda doldurulmalı, metinler bir
  hukukçuya gösterilmeli; sonra her sayfadaki "Taslak" kutusu ve
  `<meta name="robots" content="noindex">` satırı kaldırılır.
- **Hesap silme** uygulama içinde: Ayarlar → Hesap ve bildirim ayarları →
  *Hesabı sil*.
- **Ekran görüntüleri**: iPhone 6.9", Android telefon; Türkçe ve İngilizce.

## 6. Güncellemeler

Web sitesi her gönderimde kendiliğinden güncellenir. Telefon uygulamasında
değişiklikler **yeni mağaza sürümüyle** kullanıcıya ulaşır (sürüm numarasını
artırıp yeniden yükle). İleride sık güncelleme gerekirse mağaza kurallarına
uygun "canlı güncelleme" hizmetleri (ör. Capgo) eklenebilir.

## İkon ve açılış ekranı

Kaynaklar `resources/` klasöründe. Değiştirirsen:

```bash
npx @capacitor/assets generate --assetPath resources --ios --android \
  --iconBackgroundColor '#A8492A' --splashBackgroundColor '#F7F1E8' --splashBackgroundColorDark '#171512'
```
