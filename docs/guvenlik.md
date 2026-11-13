# Güvenlik: korumalar, gizli değerler ve alan adı

anahtar statik bir site olarak **Hostinger**'da yayınlanır; veri Supabase'tedir; iPhone ve Android uygulamaları aynı koddan
üretilir. Koruma birkaç katmandır ve her katmanın ne yaptığı aşağıda ayrı ayrı yazılıdır. **Bu belgedeki Cloudflare, alan adı
sağlayıcısı, Hostinger ve Supabase panelindeki adımlar sizin hesaplarınızda yapılır; koddan yapılamaz.** Koddaki kısım
depoda hazırdır ve testlerle sınanır.

## 1. Kodda hazır olanlar (yapılmış, sınanmış)

### Site ve uygulama

| Koruma | Nerede | Ne yapar |
| --- | --- | --- |
| İçerik güvenlik politikası (CSP) | `app/scripts/harden-html.mjs` (her derlemede çalışır) | Yalnızca kendi dosyalarımızdan, Supabase'ten ve (tanımlıysa) Turnstile ile Sentry alım adresinden betik/bağlantıya izin verir. Satır içi betikler özetle (hash) izinlidir; `unsafe-inline`/`unsafe-eval` betik için yoktur. Dışarıdan gelen enjekte betik çalışmaz. |
| Çerçeve koruması | aynı betik | Sayfa başka sitenin içine gömülürse kendini gizler (clickjacking). |
| Referrer politikası | aynı betik | Adres bilgisi başka sitelere tam sızmaz. |
| Sunucu başlıkları | `app/public/.htaccess` (Hostinger/Apache) | HTTPS zorlaması, HSTS, çerçeve koruması, gizli dosyalara erişimi kapatma, önbellek; `.map` dosyaları engelli. |
| Bot koruması (Turnstile) | web: `app/src/auth/captcha.tsx`; telefon: `captcha.native.tsx` | Giriş, kayıt ve şifre sıfırlamada doğrulama kutusu çıkar. Telefonda sitenin `/turnstile/` sayfası bir WebView'de açılır. Doğrulama yüklenemezse hata ve "Yeniden dene" gösterilir; jetonsuz istek hiçbir zaman gönderilmez (bölüm 4). |
| Oturum (PKCE) | `app/src/domain/backend.js` | E-posta bağlantıları (şifre sıfırlama, e-posta değişikliği, onay) tek kullanımlık kod taşır ve yalnız isteğin yapıldığı cihazda oturuma çevrilir; adresteki jetonla oturum kurulmaz (`setSession` yok). Başka cihazda açılırsa açıklama gösterilir. |
| Telefonda oturum deposu | `app/src/domain/secure-storage.native.js` | Oturum iOS Keychain / Android Keystore'da (SecureStore) saklanır; eski sürümdeki açık metin oturum bir kez taşınıp silinir. Android yedeklemesi kapalı (`allowBackup: false`), reklam kimliği (`AD_ID`) engelli. |
| Hesap silme | uygulama ve `delete_my_account` | Silme başarısız olursa hata gösterilir, oturum açık kalır; etkin mağaza aboneliği varsa önce iptal edilmesi gerektiği söylenir. |
| Kod açığı düzeltmeleri | `app/src/domain/*`, `billing` fonksiyonu | CodeQL'in yüksek önemli bulguları kapatıldı: HTML'e karışan değerler süzülür (XSS), kimlik ve jeton üretiminde `Math.random` yerine kriptografik rastgelelik, hata yanıtlarında iç ayrıntı yok. |
| Hata izleme verisi | `app/src/domain/sentry-scrub.js`, `_shared/sentry.ts` | Sentry'ye giden her olay `log_redact` kurallarından geçer; oturum tekrarı yok ([loglar.md](loglar.md)). |
| Gizli değer karşılaştırması | `supabase/functions/*/index.ts` | Webhook gizli değerleri sabit sürede karşılaştırılır. |
| İletişim | `app/public/.well-known/security.txt` | Güvenlik açığı bildirimi için adres. |
| Başlık dosyası (yedek) | `app/public/_headers` | Site Cloudflare Pages/Netlify'a taşınırsa aynı başlıklar kendiliğinden gelir; Hostinger yok sayar (orada `.htaccess` geçerli). |

### Veritabanı (Supabase, `supabase/migrations/`)

Veri erişimini satır düzeyinde güvenlik (RLS) korur: herkes yalnızca kendi kaydını okur/yazar; yönetici işlemleri sunucuda
yetkilidir. Gerçek Postgres'te sınanır (`tests/*.sql.spec.mjs`). Bu sürümde eklenenler:

| Koruma | Ne yapar |
| --- | --- |
| Rol yükseltme kapalı | Kullanıcı kendi üyeliğinde `role`, `property_id` ya da `user_id` değiştiremez (yalnız ad ve telefon); kiracı mülk sahibi yetkisi alamaz. |
| Oturumsuz (`anon`) işlevler | Açıkça izin verilen kısa liste dışında (`tests/qa-db.spec.mjs`) hiçbir `SECURITY DEFINER` işlev oturumsuz çağrılamaz; yeni işlevlerde de varsayılan olarak kapalıdır. `site_report` oturum ister. |
| Mülk kimliği öneki | Mülk kimliği `site-` ya da `hukuk-` ile başlayamaz; depolama klasör kuralları bu öneklerle eşleşmez (başka birinin klasörüne üye olunamaz). |
| Davet kodları | Yeni kodlar en az 80 bit: mülk 16 karakter, kurum `K` + 16, site sakini `S` + 16. Eski kodlar süresi dolana kadar geçerli kalır. Yanlış deneme: kullanıcı başına ve IP başına saatte en çok 10; sınır dolunca doğru kod bile reddedilir. Her başarısızlık aynı iletiyle döner (kod yok, kullanılmış, süresi dolmuş ya da başkasına ait ayırt edilmez). Davet bir e-postaya yazılmışsa yalnız o e-postalı hesap kabul edebilir. Oturumsuz önizleme telefon ve e-posta vermez; site sakininin kodunu yalnız "Malik ve kiracılar" yetkisi olan görebilir. |
| Yükleme sınırları | `evim` kovasında dosya başına 10 MB; yalnız uygulamanın yüklediği türler (görsel, PDF, talep ekleri için video); kullanıcı başına kota. Site klasöründe sakin yalnız kendi yüklemelerini ve hedef kitlesine dahil site belgelerini okur; salt okur kurum rolleri yazamaz. |
| İstek sınırları | Destek talebinde e-posta hesabın e-postasına sabitlenir ve günlük sınır vardır; `lead-mail` teşekkür e-postasını yalnız hesabın adresine gönderir. `submit_lead`, `report_error`, plan seçimi, davet e-postası (kullanıcı başına günlük) ve site daveti (aynı kişiye 2 dakikada bir) sınırlıdır. Abonelik eşitlemesi kullanıcı başına 30 saniyede bir. |
| Push sağlamlığı | Web push uç noktası yalnız bilinen push servislerinde olabilir (sunucunun rastgele adrese istek atması engellenir); push istekleri zaman aşımıyla çalışır. |
| Sistem mesajı | Sohbetteki olay satırları ("kira onaylandı" gibi) istemciden doğrudan yazılmaz; `post_system_message` işlevi yetkiyi ve metni denetleyerek yazar. Doğrudan yazma yolunun tamamen kapatılması, yeni site yayına çıktıktan sonra uygulanan ayrı migration'dadır (bkz. [migrations.md](migrations.md)). Engellenen kişi engelleyene bu yoldan ulaşamaz. |
| Belgeler | `documents.property_id` eklendikten sonra değiştirilemez. |
| Abonelik koruması | Yönetici ya da promosyon paketi mağaza eşitlemesiyle ezilmez; test (sandbox) satın alımı gelir hesabına girmez ([abonelik.md](abonelik.md)). |
| Performans | `auth.uid()` çağrıları ve yabancı anahtar dizinleri düzenlendi (`rls_performans`); davranış değişmez. |

### Gizli değerler: Vault ve fonksiyon sırları

- **Tetikleyici ve zamanlanmış iş tanımlarında hiçbir gizli değer yoktur.** Webhook ve cron çağrıları gizli değeri çağrı anında
  **Supabase Vault**'tan okur (`kasa_sirlari` migration'ı); `service_role` anahtarı gizli başlığa konmaz. Vault'ta bir kayıt
  eksikse migration hiçbir şeyi değiştirmeden hata verir.
- Her fonksiyonun **kendi rastgele gizli değeri** vardır (en az 32 bayt); biri sızarsa diğerleri etkilenmez. Adlar (değerler
  asla belgeye, depoya ya da sohbete yazılmaz):

  | Fonksiyon | Fonksiyondaki değişken | Vault kaydı | Başlık |
  | --- | --- | --- | --- |
  | `lead-mail` | `LEAD_SECRET` | `anahtar_lead_secret` | `x-anahtar-secret` |
  | `mail-send` | `MAIL_SECRET` | `anahtar_mail_secret` | `x-anahtar-secret` |
  | `push` | `WEBHOOK_SECRET` | `anahtar_push_secret` | `x-evim-secret` |
  | `report` | `REPORT_SECRET` | `anahtar_report_secret` | `x-anahtar-secret` |
  | `tufe-sync` | `TUFE_SECRET` | `anahtar_tufe_secret` | `x-anahtar-secret` |
  | `billing` (günlük uzlaştırma) | `BILLING_CRON_SECRET` | `anahtar_billing_secret` | `x-anahtar-secret` |

  Ayrıca `anahtar_functions_url` kaydı fonksiyonların taban adresini tutar (gizli değil, ayar).
- **Edge fonksiyonlar yeni gizli anahtarı kullanır** (`SUPABASE_SECRET_KEYS`; yoksa eski `SUPABASE_SERVICE_ROLE_KEY`'e düşer).
  Bu sayede tüm fonksiyonlar yeni anahtara geçtikten sonra eski JWT tabanlı anahtarlar Supabase'te kapatılabilir.
- **Gizli değeri döndürme** (sızdı ya da düzenli): yeni rastgele değer üret → Vault'a ekle (SQL Editor, değeri git'e yazma) →
  aynı değeri `supabase secrets set` ile fonksiyona yaz → gerekiyorsa `kasa_sirlari` migration'ını yeniden uygula → birkaç
  dakika sonra `net._http_response` ve fonksiyon kayıtlarında 200 yanıtlarını doğrula. `info@anahtar.io` posta kutusunun
  parolası Hostinger'da posta kutusu sahibi tarafından döndürülür ve `SMTP_PASS` güncellenir.

### Depo ve yayın hattı

| Koruma | Nerede | Ne yapar |
| --- | --- | --- |
| Gizli dosya engeli | `.gitignore` | `.env*`, `*.p8`, `*.jks`, `*.keystore`, `*.p12`, `*.mobileprovision`, `GoogleService-Info.plist`, `google-services.json`, `credentials.json`, `.mcp.json` depoya girmez. |
| Yayın hattı | `.github/workflows/hostinger.yml` | Varsayılan yetki salt okunur; yalnız `site` dalına yazan iş yazma yetkisi alır, yalnız varsayılan daldan çalışır (elle çalıştırmada başka dal seçilse bile paketlenmez); kimlik bilgisi saklanmaz. |
| Mobil derleme hattı | `.github/workflows/expo-mobile.yml` | Kimlik bilgisi saklanmaz; EAS sürümü sabit; `EXPO_TOKEN` robot kullanıcıya aittir. |
| Bağımlılık güncelleme | `.github/dependabot.yml` (kök ve `app/`) | Haftalık güncelleme PR'ı. |
| Otomatik tarama | `.github/workflows/guvenlik.yml`, `codeql.yml` | Semgrep (kod açıkları), gitleaks (sızan anahtar), `npm audit` (bağımlılık), CodeQL. Her gönderimde ve haftada bir. |

**Sunucu başlıkları hakkında:** Hostinger'da `.htaccess` başlıkları gerçekten gönderilir (HSTS, çerçeve koruması, `nosniff`, referrer
politikası). Kural tabanlı gerçek bir WAF (kötü amaçlı istekleri sunucuya varmadan eleyen duvar) için sitenin önüne Cloudflare
konabilir (bölüm 3, isteğe bağlı); Hostinger'ın kendi güvenlik araçları planınıza göre değişir (hPanel → **Security**).
Giriş/kayıt istekleri sitenize değil doğrudan Supabase'e gittiği için onları Supabase'in kendi koruması ve Turnstile (bölüm 4) korur.

## 2. Alan adı koruması (alan adı ve DNS sağlayıcınızda: Hostinger)

Şunların hepsini açın; hesabınızın kendisi en zayıf halkadır.

1. **Alan adı kilidi** ("transfer lock" / "domain lock") açık olsun. Başka firmaya izinsiz taşınmayı engeller.
2. **Hesaba iki adımlı doğrulama** (uygulamalı, SMS değil) ve güçlü, benzersiz parola. Aynısı Apple, Google, Expo, GitHub, Supabase,
   RevenueCat, Sentry ve Cloudflare hesapları için de geçerlidir.
3. **Otomatik yenileme** açık; kayıt e-postası erişebildiğiniz bir adres olsun. Alan adının süresinin dolması en sık kayıp nedenidir.
4. **WHOIS gizliliği** açık (kişisel bilgiler görünmesin).
5. **DNSSEC**: DNS Hostinger'da olduğu için hPanel'deki alan adı / DNS ayarlarından açın.
6. **Kullanılmayan DNS kayıtlarını silin** (eski alt alan adları, artık var olmayan hizmetlere CNAME; örneğin eski GitHub Pages kayıtları).
7. **CAA kaydı**: yalnızca sertifika vermesine izin verdiğiniz kuruluşu yazın, örn. `0 issue "letsencrypt.org"`.
8. **E-posta sahtecilik koruması** (`info@anahtar.io` adına başkası posta atamasın). E-posta sağlayıcınızın verdiği SPF ve DKIM kayıtlarını ekleyin; DMARC için başlangıç:
   `_dmarc  TXT  "v=DMARC1; p=quarantine; rua=mailto:info@anahtar.io"`
   Birkaç hafta raporlara bakıp sorun yoksa `p=reject` yapın. (Yalnızca izleyen `p=none` bir kayıt sahtecilikten korumaz.)

## 3. Cloudflare WAF (isteğe bağlı; bugün Cloudflare yalnız Turnstile için kullanılıyor)

Site ve DNS Hostinger'dadır; Cloudflare'de bugün yalnız Turnstile aracı (widget) vardır. Daha güçlü bir duvar istenirse
alan adının önüne Cloudflare konur (ücretsiz plan yeter). Öncesinde `www` için kullanılan Hostinger CDN kaydı ve
DNS taşıma adımları Hostinger desteğiyle netleştirilmelidir.

1. cloudflare.com → *Add a site* → `anahtar.io` → Free plan. Verdiği iki **nameserver** adresini alan adı sağlayıcınızda girin.
2. DNS: Cloudflare'in aktardığı kayıtları Hostinger'daki bugünkü kayıtlarla (hPanel → DNS) **birebir** karşılaştırın; e-posta
   (MX, SPF, DKIM, DMARC) kayıtlarının eksiksiz geldiğini doğrulayın. **Proxy (turuncu bulut)** web adresleri için açık, posta
   kayıtları için kapalı olsun; WAF yalnızca proxy açıkken çalışır.
3. **SSL/TLS** → mod **Full (strict)**; *Always Use HTTPS* açık; *Minimum TLS Version* 1.2; *Automatic HTTPS Rewrites* açık.
4. **SSL/TLS → Edge Certificates → HSTS**: Hostinger zaten HSTS gönderir; Cloudflare'de de açacaksanız aynı süreyi kullanın (site yalnızca HTTPS çalıştığını doğruladıktan sonra).
5. **DNSSEC**: DNS → Settings → DNSSEC → Enable; verilen DS kaydını alan adı sağlayıcınıza girin.
6. **Security → Bots**: *Bot Fight Mode* açık.
7. **Security → WAF → Managed rules**: *Cloudflare Managed Ruleset* açık (ücretsiz planda bulunur).
8. **Security → WAF → Custom rules** (ücretsiz planda sınırlı sayıda kural):
   - Yönetici sayfası: *URI Path starts with `/admin`* → **Managed Challenge**.
   - Tarayıcı/keşif botları: *URI Path contains* `wp-admin`, `wp-login`, `.env`, `.git`, `phpmyadmin` → **Block**.
   - İsteğe bağlı: Türkiye dışı trafiği giriş sayfalarında zorlaştırmak için *Country does not equal Turkey AND URI Path starts with `/giris`* → **Managed Challenge** (yurt dışı kullanıcı beklemiyorsanız).
   - **Dikkat:** `/turnstile/` sayfası telefon uygulamasındaki doğrulama kutusunu taşır; bu sayfayı engelleyen ya da sınayan bir kural yazmayın.
9. **Security → WAF → Rate limiting rules** (ücretsiz planda çok az kural hakkı): *URI Path starts with `/giris` or `/kayit`*, 10 saniyede 20 istek → 10 saniye bloke. (Sayfa isteklerini sınırlar; hesap denemelerini bölüm 4 sınırlar.)
10. **Caching**: Hostinger yeni sürüm yayınlayınca Cloudflare eski dosyayı tutabilir. Deploy sonrası *Caching → Purge Everything* yapın ya da *Cache Rule* ile HTML için kısa süre (2 dk) verin. `/.well-known/` dosyaları ([magaza.md](magaza.md) bölüm 9) önbelleğe alınmamalı ve yönlendirilmemelidir.

Doğrulama: <https://securityheaders.com> ve <https://www.ssllabs.com/ssltest/> sitenin puanını gösterir. Başlıklar Hostinger'da `.htaccess` ile geldiği için yüksek puan beklenir.

## 4. Giriş, kayıt ve veri koruması (Supabase)

Hesap işlemleri doğrudan Supabase'e gider; Cloudflare duvarının görmediği yer burasıdır.

1. **Bot koruması (Turnstile)** — web ve telefonda birlikte:
   1. Cloudflare → Turnstile → *Add widget* → alan adınızı (`anahtar.io`) ekleyin; *Site Key* ve *Secret Key* verir.
   2. Supabase → Authentication → **Attack Protection** → *Enable CAPTCHA protection* → sağlayıcı *Cloudflare Turnstile*, Secret Key'i girin.
   3. Site Key'i **iki yere** girin: GitHub depo → Settings → Secrets and variables → Actions → **Variables** → `TURNSTILE_SITE_KEY` (web) ve
      EAS ortamında `EXPO_PUBLIC_TURNSTILE_SITE_KEY` (telefon; [magaza.md](magaza.md) bölüm 1).

   **Sıra önemlidir:** Supabase CAPTCHA'yı açıp (zorunlu yapıp) Site Key'i taşıyan bir sürüm yayında değilse **kimse giriş yapamaz**.
   Önce web'i anahtarla yeniden yayınlayın ve ilk mağaza derlemesini anahtarla alın; CAPTCHA zorunluluğunu en son açın.
2. **Authentication → Rate Limits**: e-posta gönderimi, giriş denemesi ve kayıt sınırlarını varsayılandan düşük tutun; e-posta gönderme aralığı 60 saniye.
3. **Authentication → Providers → Email**: *Confirm email* **kapalı** (karar, Ekim 2026: kişi kayıt olur olmaz paneline girer);
   bu yüzden bot koruması zorunludur. En az parola uzunluğu 8 (uygulama da bunu ister), *Leaked password protection* ve güvenli parola
   değişikliği açık.
4. **Authentication → URL Configuration**: *Site URL* ve *Redirect URLs* yalnızca gerçek adresiniz (`https://anahtar.io/**`; `/dogrula` ve `/yeni-sifre` dahil). Başka yönlendirme adresi bırakmayın.
5. **Authentication → Sign In / Providers**: kullanmadığınız her şeyi (anonim giriş, telefon, üçüncü taraf) kapatın. Oturum hareketsizlik süresi 90 gün.
6. **Yönetici hesabı**: yönetici e-postasında iki adımlı doğrulamalı, benzersiz parola kullanın; `public.admins` tablosundaki satır sayısını az tutun.
7. **API anahtarları**: depoya ve uygulamaya yalnızca herkese açık ("publishable" / `anon`) anahtar girer (veriyi RLS korur).
   **`service_role` ya da yeni "secret" anahtarı asla depoya, değişkene, sayfaya ya da sohbete koymayın.** Edge fonksiyonlar yeni gizli anahtara
   geçtikten sonra eski JWT tabanlı anahtarlar kapatılır (bölüm 1).
8. **Yedek**: Supabase → Database → Backups açık olsun (günlük).
9. **Veritabanı bağlantılarında SSL zorunluluğu** (Supabase Database ayarları) açık olsun.

## 5. Sınırlar ve açık işler

- `zod` yüksek açığı (`npm audit`) yalnızca Expo derleme aracından gelir (`@expo/cli`), tarayıcıya giden pakete girmez; Expo güncellemesiyle kapanır. Tarama bu yüzden `app/` için yalnızca kritik açıkta durur.
- İlk çalıştırmada `guvenlik.yml` bulgu çıkarırsa Security → Code scanning sayfasında görünür.
- Turnstile akışı testlerle doğrulanmıştır; gerçek Cloudflare/Supabase ile web'de ve ilk mağaza derlemesinde kayıt, giriş ve şifre sıfırlamayı
  bir kez deneyin, ancak ondan sonra Supabase CAPTCHA'yı zorunlu yapın. Anahtar yokken formlar değişmeden çalışır.
- CSP `style-src 'unsafe-inline'` içerir (React Native Web stilleri satır içidir); betikler için `unsafe-inline` yoktur.
- Sertleştirme yalnızca derlenmiş sitede çalışır; `expo start` ile geliştirmede CSP yoktur.
- **Depo sahibinin yapacağı GitHub işleri** (yönetici hesabı gerekir): varsayılan dalda PR ve zorunlu kontrol kuralı (ruleset), `site` dalının
  korunması, `production` ortamında onaylayıcı ve dal kuralı, kullanılmayan eski sırların silinmesi. Varsayılan dalın adı `main` olarak değiştirilecek;
  iş akışları o zamana kadar iki adı da kabul eder.
- Gizli değerlerin döndürülmesi ve eski anahtarların kapatılması sırası için [canliya-alma.md](canliya-alma.md).
