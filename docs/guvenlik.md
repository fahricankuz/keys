# Güvenlik: WAF ve alan adı koruması

Kiracım statik bir site olarak GitHub Pages'te yayınlanır; veri Supabase'tedir. Koruma üç katmandır
ve her katmanın ne yaptığı aşağıda ayrı ayrı yazılıdır. **Bu belgedeki Cloudflare, alan adı sağlayıcısı
ve Supabase adımları sizin hesaplarınızda yapılır; koddan yapılamaz.** Koddaki kısım depoda hazırdır.

## 1. Kodda hazır olanlar (yapılmış, sınanmış)

| Koruma | Nerede | Ne yapar |
| --- | --- | --- |
| İçerik güvenlik politikası (CSP) | `app/scripts/harden-html.mjs` (her derlemede çalışır) | Yalnızca kendi dosyalarımızdan ve Supabase'den betik/bağlantıya izin verir. Satır içi betikler özetle (hash) izinlidir; `unsafe-inline`/`unsafe-eval` betik için yoktur. Dışarıdan gelen enjekte betik çalışmaz. |
| Çerçeve koruması | aynı betik | Sayfa başka sitenin içine gömülürse kendini gizler (clickjacking). |
| Referrer politikası | aynı betik | Adres bilgisi başka sitelere tam sızmaz. |
| Bot koruması (Turnstile) | `app/src/auth/captcha.tsx` | `TURNSTILE_SITE_KEY` verilirse giriş, kayıt ve şifre sıfırlamada doğrulama kutusu çıkar (adım 4). |
| Veri erişimi | `supabase/schema.sql` (RLS) | Herkes yalnızca kendi kaydını okur/yazar; yönetici işlemleri sunucuda yetkilidir. Gerçek Postgres'te sınanır (`tests/*.sql.spec.mjs`). |
| Bağımlılık güncelleme | `.github/dependabot.yml`, iş akışında `npm audit` | Haftalık güncelleme PR'ı ve yüksek açık uyarısı. |
| İletişim | `app/public/.well-known/security.txt` | Güvenlik açığı bildirimi için adres. |
| Başlık dosyası | `app/public/_headers` | Cloudflare Pages/Netlify'a taşınırsa HSTS vb. başlıklar kendiliğinden gelir; GitHub Pages yok sayar. |

**WAF hakkında dürüst not:** GitHub Pages yanıt başlığı ve kural motoru sunmaz. Gerçek bir WAF (kötü
amaçlı istekleri sunucuya varmadan eleyen duvar) için sitenin önüne Cloudflare konur. Bu ücretsizdir
ve aşağıda adım adım yazılıdır. Giriş/kayıt istekleri sitenize değil doğrudan Supabase'e gittiği için
onları Cloudflare değil Supabase'in kendi koruması ve Turnstile (adım 4) korur.

## 2. Alan adı koruması (alan adı sağlayıcınızda)

Şunların hepsini açın; hesabınızın kendisi en zayıf halkadır.

1. **Alan adı kilidi** ("transfer lock" / "domain lock") açık olsun. Başka firmaya izinsiz taşınmayı engeller.
2. **Hesaba iki adımlı doğrulama** (uygulamalı, SMS değil) ve güçlü, benzersiz parola.
3. **Otomatik yenileme** açık; kayıt e-postası erişebildiğiniz bir adres olsun. Alan adının süresinin dolması en sık kayıp nedenidir.
4. **WHOIS gizliliği** açık (kişisel bilgiler görünmesin).
5. **DNSSEC**: Cloudflare kullanırsanız panelden tek tuşla açılır (adım 3), sağlayıcıya DS kaydını girin.
6. **GitHub alan adı doğrulaması** (alt alan adı ele geçirmeyi önler): GitHub → profil Settings → Pages → *Add a domain* → verilen TXT kaydını DNS'e ekleyin. Sonra depo Settings → Pages → *Enforce HTTPS* işaretli olsun.
7. **Kullanılmayan DNS kayıtlarını silin** (eski alt alan adları, artık var olmayan hizmetlere CNAME).
8. **CAA kaydı**: yalnızca sertifika vermesine izin verdiğiniz kuruluşu yazın, örn. `0 issue "letsencrypt.org"`.
9. **E-posta sahtecilik koruması** (`info@kiracim.online` adına başkası posta atamasın). E-posta sağlayıcınızın verdiği SPF ve DKIM kayıtlarını ekleyin; DMARC için başlangıç:
   `_dmarc  TXT  "v=DMARC1; p=quarantine; rua=mailto:info@kiracim.online"`
   Birkaç hafta raporlara bakıp sorun yoksa `p=reject` yapın.

## 3. Cloudflare WAF (ücretsiz plan yeter)

1. cloudflare.com → *Add a site* → `kiracim.online` → Free plan. Verdiği iki **nameserver** adresini alan adı sağlayıcınızda "nameserver" olarak girin.
2. DNS: GitHub Pages için `kiracim.online` apex'ine GitHub'ın dört A kaydı (`185.199.108.153`, `.109.153`, `.110.153`, `.111.153`) ve `www` için `CNAME <kullanici>.github.io` ekleyin. **Proxy (turuncu bulut) açık** olsun; WAF yalnızca proxy açıkken çalışır.
3. **SSL/TLS** → mod **Full (strict)**; *Always Use HTTPS* açık; *Minimum TLS Version* 1.2; *Automatic HTTPS Rewrites* açık.
4. **SSL/TLS → Edge Certificates → HSTS**: açın (max-age 6 ay, includeSubDomains). Site yalnızca HTTPS çalıştığını doğruladıktan sonra.
5. **DNSSEC**: DNS → Settings → DNSSEC → Enable; verilen DS kaydını alan adı sağlayıcınıza girin.
6. **Security → Bots**: *Bot Fight Mode* açık.
7. **Security → WAF → Managed rules**: *Cloudflare Managed Ruleset* açık (ücretsiz planda bulunur).
8. **Security → WAF → Custom rules** (ücretsiz planda sınırlı sayıda kural):
   - Yönetici sayfası: *URI Path starts with `/admin`* → **Managed Challenge**.
   - Tarayıcı/keşif botları: *URI Path contains* `wp-admin`, `wp-login`, `.env`, `.git`, `phpmyadmin` → **Block**.
   - İsteğe bağlı: Türkiye dışı trafiği giriş sayfalarında zorlaştırmak için *Country does not equal Turkey AND URI Path starts with `/giris`* → **Managed Challenge** (yurt dışı kullanıcı beklemiyorsanız).
9. **Security → WAF → Rate limiting rules** (ücretsiz planda çok az kural hakkı): *URI Path starts with `/giris` or `/kayit`*, 10 saniyede 20 istek → 10 saniye bloke. (Sayfa isteklerini sınırlar; hesap denemelerini adım 4 sınırlar.)
10. **Caching**: GitHub Pages yeni sürüm yayınlayınca Cloudflare eski dosyayı tutabilir. Deploy sonrası *Caching → Purge Everything* yapın ya da *Cache Rule* ile HTML için kısa süre (2 dk) verin.

Doğrulama: <https://securityheaders.com> ve <https://www.ssllabs.com/ssltest/> sitenin puanını gösterir. GitHub Pages arkasında başlıkları Cloudflare ekleyemeyeceği için puan A olmayabilir; asıl koruma CSP ve Cloudflare kurallarıdır. Başlıkların da tam gelmesini isterseniz siteyi Cloudflare Pages'e taşımak `_headers` dosyasını devreye sokar.

## 4. Giriş, kayıt ve veri koruması (Supabase)

Hesap işlemleri doğrudan Supabase'e gider; Cloudflare duvarının görmediği yer burasıdır.

1. **Bot koruması (Turnstile)**:
   1. Cloudflare → Turnstile → *Add widget* → alan adınızı ekleyin; *Site Key* ve *Secret Key* verir.
   2. Supabase → Authentication → **Attack Protection** → *Enable CAPTCHA protection* → sağlayıcı *Cloudflare Turnstile*, Secret Key'i girin.
   3. GitHub depo → Settings → Secrets and variables → Actions → **Variables** → `TURNSTILE_SITE_KEY` = Site Key. Sonraki yayınlamada formlarda doğrulama kutusu çıkar.
   
   Supabase CAPTCHA'yı açıp Site Key'i eklemezseniz **kimse giriş yapamaz**; ikisini birlikte yapın. Not: doğrulama kutusu yalnızca web sürümünde çizilir; mağaza uygulamasına geçildiğinde yerel sürüm için ayrıca düşünülür.
2. **Authentication → Rate Limits**: e-posta gönderimi, giriş denemesi ve kayıt sınırlarını varsayılandan düşük tutun.
3. **Authentication → Providers → Email**: *Confirm email* açık, en az parola uzunluğu 8 (uygulama da bunu ister), mümkünse *Leaked password protection* (Pro plan).
4. **Authentication → URL Configuration**: *Site URL* ve *Redirect URLs* yalnızca gerçek adresiniz (`https://kiracim.online/**`). Başka yönlendirme adresi bırakmayın.
5. **Authentication → Sign In / Providers**: kullanmadığınız her şeyi (anonim giriş, telefon, üçüncü taraf) kapatın.
6. **Yönetici hesabı**: yönetici e-postasında iki adımlı doğrulamalı, benzersiz parola kullanın; `public.admins` tablosundaki satır sayısını az tutun.
7. **API anahtarları**: depoya yalnızca `anon` anahtarı girer (herkese açıktır, veriyi RLS korur). **`service_role` anahtarını asla depoya, değişkene ya da sayfaya koymayın.**
8. **Yedek**: Supabase → Database → Backups açık olsun (günlük).

## 5. Sınırlar ve açık işler

- Turnstile akışı gerçek Cloudflare/Supabase ile bu ortamda denenemedi (dışarı bağlantı yok); anahtar yokken formlar değişmeden çalışır ve testlerle doğrulanmıştır. Anahtarı ekledikten sonra bir kez kayıt ve giriş deneyin.
- CSP `style-src 'unsafe-inline'` içerir (React Native Web stilleri satır içidir); betikler için `unsafe-inline` yoktur.
- Sertleştirme yalnızca derlenmiş sitede çalışır; `expo start` ile geliştirmede CSP yoktur.
