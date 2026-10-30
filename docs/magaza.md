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
| Dijital abonelik (Apple 3.1.1, Google Play Billing) | **Açık karar:** uygulamada abonelik satılacaksa mağaza içi satın alma (RevenueCat, sunucu tarafı hazır: `supabase/functions/billing`) eklenmeli; satılmayacaksa uygulamada satın alma ekranı ve web'e yönlendirme gösterilmemeli |
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

## 6. Yayından önce sunucu ayarları (bkz. canliya-alma.md)

- Supabase → Authentication → **SMTP**: Resend'i özel SMTP olarak tanımla (yerleşik e-posta servisi üretim için çok düşük
  sınırla çalışır; şifre sıfırlama e-postaları yoğunlukta ulaşmaz).
- **Bot koruması (Turnstile):** web için açılmalı (`TURNSTILE_SITE_KEY` + Supabase → Attack Protection → CAPTCHA).
  Dikkat: Supabase'teki CAPTCHA zorunluluğu tüm girişlere uygulanır. Telefon uygulamasında Turnstile henüz yok; uygulama
  mağazaya çıkmadan önce ya uygulamaya Turnstile eklenmeli ya da CAPTCHA kapalı tutulup Auth hız sınırları sıkılaştırılmalı.
