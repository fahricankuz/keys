# Canlıya alma kontrol listesi

Bu liste iki iş içindir: yeni bir ortamı ilk kez ayağa kaldırmak ve büyük bir sürümü (güvenlik düzeltmeleri, mağaza
sürümü) canlıya almak. Sürümün **sırası** bölüm 6'dadır; ayarların ayrıntısı aşağıdaki bölümlerdedir. Gerçek kullanıcı
verisi olan üretim veritabanına yazan her adım için açık onay gerekir (plan çıktısı gösterilir, sonra uygulanır).

## 1. Sunucu (Supabase) — zorunlu

1. supabase.com'da proje aç (bölge: Frankfurt `eu-central-1`, KVKK için AB içinde kalır).
2. Veritabanı şeması **migration'larla** kurulur ve güncellenir; SQL Editor'e `schema.sql` yapıştırılmaz. Sıra ve onaylar:
   [migrations.md](migrations.md) (Actions → **Veritabanı migration**: staging plan → apply → production plan → apply).
3. **Authentication → URL Configuration**: Site URL `https://anahtar.io`, Redirect URLs `https://anahtar.io/**`.
4. **Authentication → Providers → Email**: "Confirm email" kapalıysa kişi kayıt olur olmaz paneline girer (Ekim 2026 kararı);
   bu durumda bot koruması (bölüm 2a) mutlaka açık olmalı. Açıksa onay bağlantısı `/dogrula` sayfasından doğrudan panele götürür.
   Parola en az 8 karakter; sızmış parola koruması açık ([guvenlik.md](guvenlik.md) bölüm 4).
5. **Project Settings → API**: `Project URL` ve herkese açık ("publishable" / `anon`) anahtarı al.
6. Site derlemesine GitHub değişkeni olarak ver (bkz. `docs/hostinger.md`): `SUPABASE_URL`, `SUPABASE_ANON_KEY` (boşsa projenin
   herkese açık adresi ve anahtarı kullanılır). Telefon için aynı adres ve anahtar `app/eas.json` profillerindedir.
   **`service_role` ya da "secret" anahtarını asla bu alanlara girme.**
7. Kendi hesabını yönetici yap: SQL Editor → `insert into public.admins (user_id) select id from auth.users where email = 'SENIN@EPOSTAN';`
8. **Gizli değerler (Vault):** webhook ve zamanlanmış işler gizli değerleri veritabanı kasasından (Vault) okur. Kayıt adları ve
   fonksiyon eşleşmesi [guvenlik.md](guvenlik.md) bölüm 1'dedir. Değerleri sen üretirsin (rastgele, en az 32 bayt), SQL Editor'de
   `vault.create_secret(değer, ad)` ile eklersin ve **aynı değeri** `supabase secrets set` ile ilgili fonksiyona yazarsın.
   Değerler git'e, belgeye ya da sohbete yazılmaz; `kasa_sirlari` migration'ı kayıt eksikse hata verip durur.

## 2. E-posta gönderimi — zorunlu

Supabase'in yerleşik e-postası saatte birkaç iletiyle sınırlıdır. Doğrulama ve şifre sıfırlama
e-postaları için **Project Settings → Authentication → SMTP** bölümüne kendi gönderici bilgilerini gir
(Resend, Brevo ya da Hostinger e-postası). Gönderen: `info@anahtar.io`. Alan adına SPF ve DKIM
kayıtlarını eklemeyi unutma; yoksa e-postalar gereksiz klasörüne düşer. Hostinger posta kutusu kullanılıyorsa günlük gönderim
kotasını Supabase'in e-posta sınırıyla birlikte kontrol et.

## 2a. Bot koruması (Cloudflare Turnstile) — zorunlu

E-posta onayı kapalıyken botlar sınırsız hesap açabilir ve hoş geldin e-postası başkasının adresine gidebilir.
1. dash.cloudflare.com → Turnstile → Add site: alan adı `anahtar.io`, mod *Managed*. Site key ve Secret key'i al.
2. Supabase → Authentication → **Attack Protection** → CAPTCHA: Turnstile, Secret key.
3. Site key'i **web** için GitHub'da `TURNSTILE_SITE_KEY` değişkeni olarak (derlemede `EXPO_PUBLIC_TURNSTILE_SITE_KEY`) ve **telefon** için
   EAS ortamında `EXPO_PUBLIC_TURNSTILE_SITE_KEY` olarak gir. Kod hazırdır: giriş, kayıt ve şifre sıfırlama formlarında kutu görünür
   (telefonda `/turnstile/` sayfası bir WebView'de açılır), CSP kendiliğinden izin verir.
4. **Sıra:** önce siteyi anahtarla yeniden yayınla ve ilk mağaza derlemesini anahtarla al; **en son** Supabase CAPTCHA zorunluluğunu aç.
   Anahtarı taşımayan bir sürüm yayındayken zorunluluk açılırsa o sürümden kimse giriş yapamaz.
5. Supabase → Authentication → **Rate Limits**: kayıt ve giriş sınırlarını gözden geçir.

## 3. Yasal metinler — zorunlu (mağaza gönderiminin engeli)

`app/public/gizlilik`, `kosullar`, `hesap-silme` sayfaları taslak değildir; şirket Devredin Bilgi Teknolojileri Yazılım ve Ticaret A.Ş. olarak
yayınlanmıştır. Şirket bilgileri veya uygulama davranışı değişirse sayfalar güncel tutulmalı ve mağaza gönderiminden önce son kez gözden geçirilmelidir
([magaza.md](magaza.md) bölüm 10).
VERBİS kaydı gerekip gerekmediğini mali müşavirinle kontrol et. Çerez kullanmıyoruz; analitik
eklenirse çerez bildirimi de eklenmeli.

## 4. Ödeme — paketler satılmadan önce

Abonelik **yalnız telefondan** satılır (App Store ve Google Play, RevenueCat); web'de ödeme alınmaz. Ödeme kapalı bayrağı veritabanındadır:
`public.app_config` → `billing_paused` (başlangıçta `true`). Bu bayrak `true` olduğu sürece satın alma kapalıdır; herkes 30 günlük
denemeyle başlar, yönetici panelinden **Abonelikler → Paket ver / Denemeyi uzat** ile elle paket verilebilir. Satışa geçmek için:
1. Mağaza ürünleri, RevenueCat, webhook ve gizli değerler: [abonelik.md](abonelik.md) (36 App Store ürünü, 2 Play aboneliği × 18 temel plan).
2. Her iki mağaza uygulamayı onaylayınca `billing_paused` değerini `false` yap (yeni uygulama sürümü gerekmez; uygulama en geç 5 dakikada alır).

## 5. Yayından önce son kontrol

- [ ] Kiracı, mülk sahibi ve ekip hesabıyla uçtan uca deneme (kayıt → davet kodu → dekont → onay; e-posta onayı açıksa doğrulama da)
- [ ] Şifre sıfırlama e-postası geliyor ve bağlantı siteye (telefonda uygulamaya) dönüyor
- [ ] `https://anahtar.io/destek/`, `/gizlilik/`, `/kosullar/`, `/hesap-silme/` açılıyor
- [ ] Supabase **Database → Backups** açık (ücretli planda günlük yedek)
- [x] Hata takibi (Sentry, AB bölgesi: web, telefon, edge) eklendi; ayrıntı [loglar.md](loglar.md)
- [ ] Ziyaretçi ölçümü (Plausible ya da GA4) eklendi
- [ ] Google Search Console'a alan adı ve `sitemap.xml` eklendi
- [ ] Tetikleyici ve zamanlanmış iş tanımlarında düz metin gizli değer yok (kontrol sorguları: [migrations.md](migrations.md) → "Uygulamadan sonra kontroller")
- [ ] Bot koruması (Turnstile) web ve telefonda taşınıyor; Supabase CAPTCHA zorunluluğu en son açıldı (bölüm 2a)

## 6. Sürüm sırası (güvenlik ve mağaza sürümü)

Her adım bir öncekinin bittiğini doğruladıktan sonra yapılır. Üretime yazan adımlarda plan çıktısı gösterilir ve onay alınır.

| # | Adım | Nasıl |
| --- | --- | --- |
| 1 | **Birleştir** | PR'da CI yeşil ve bağımsız inceleme tamam → proje sahibinin açık onayıyla birleştir. Site Hostinger'a yayınlanır. Kod, henüz uygulanmamış migration'larla da çalışır (site migration'dan önce yayınlanır). |
| 2 | **Değişen edge fonksiyonlarını yayınla** | Önce yeni gizli değerler: Vault kayıtları ve `supabase secrets set` ([guvenlik.md](guvenlik.md) bölüm 1). Sonra değişen her fonksiyon için `supabase functions deploy <ad>` (`config.toml` `verify_jwt` ayarını okur). 9 fonksiyonun hepsi bu sürümde değişti: `billing`, `push`, `lead-mail`, `mail-send`, `report`, `tufe-sync`, `welcome`, `invite-mail`, `site-invite`. |
| 3 | **Migration: staging** | Actions → Veritabanı migration → `staging` + `plan`, çıktıyı kontrol et → `staging` + `apply`. Staging'de pg_cron, pg_net ve Vault yoktur; `kasa_sirlari` orada yalnız yardımcı işlevleri kurar ([migrations.md](migrations.md)). |
| 4 | **Migration: production** | `production` + `plan` → plan çıktısı gösterilir ve **onay alınır** → `production` + `apply` (ortam onayı açıksa Review deployments → Approve). Kırmızı biterse durulur. |
| 5 | **Uygulamadan sonra kontroller** | Vault kayıtları var, webhook'lar 200 dönüyor, tetikleyici ve zamanlanmış işlerde düz metin gizli değer yok: [migrations.md](migrations.md) → "Uygulamadan sonra kontroller". Sonra `info@anahtar.io` posta kutusu parolası döndürülür (`SMTP_PASS` güncellenir); bütün fonksiyonlar yeni gizli anahtarla çalıştığı doğrulanınca Supabase'te eski JWT anahtarları kapatılır ([guvenlik.md](guvenlik.md)). |
| 6 | **Supabase panel ayarları** | Hız sınırları, parola ve oturum ayarları, yönlendirme adresi ([guvenlik.md](guvenlik.md) bölüm 4). CAPTCHA zorunluluğu **en son** (bölüm 2a). |
| 7 | **Siteyi yeniden yayınla** | `APPLE_TEAM_ID`, `ANDROID_SHA256`, `TURNSTILE_SITE_KEY`, `SENTRY_DSN_WEB` değişkenleri ve `SENTRY_AUTH_TOKEN` sırrı girildikten sonra yeniden yayınla; `/.well-known/` dosyalarını kontrol et ([magaza.md](magaza.md) bölüm 9). |
| 8 | **Takip migration PR'ı** | Yeni site yayında ve doğrulandıktan **en az 24 saat sonra** (eski önbellekteki istemciler yenilenmiş olsun). Eski istemcinin kullandığı yolları kapatan migration'lar (örn. `sistem_mesaji_kapat`: sohbete doğrudan "sistem" satırı yazma yolu) ayrı PR olarak açılır (`specs/followup-migrations`) ve aynı dört adımla uygulanır. |
| 9 | **Mağaza** | EAS derlemeleri → TestFlight ve Play iç test → cihazda deneme → yasal sayfalar tamam → gönderim ([magaza.md](magaza.md) bölüm 10). İki mağaza onaylayınca `billing_paused` bayrağı `false` yapılır. |
