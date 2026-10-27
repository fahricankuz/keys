# Canlıya alma kontrol listesi

Site bugün **yerel hesap modunda** çalışıyor: Supabase adresi tanımlı olmadığı için hesaplar ve veriler
yalnızca ziyaretçinin kendi tarayıcısında tutuluyor. Başka cihazdan girilemez, ev sahibi ile kiracı
aynı veriyi göremez, davet kodları çalışmaz. Gerçek kullanıcı almadan önce aşağıdaki adımlar gerekir.

## 1. Sunucu (Supabase) — zorunlu

1. supabase.com'da proje aç (bölge: Frankfurt `eu-central-1`, KVKK için AB içinde kalır).
2. **SQL Editor** → `supabase/schema.sql` dosyasının tamamını yapıştırıp çalıştır. Dosya tekrar
   çalıştırılabilir; yeni sürümde ekip, paketler, destek talepleri, işlem kaydı, toplu içe aktarma ve
   okundu bilgisi için 12. bölüm eklendi.
3. **Authentication → URL Configuration**: Site URL `https://anahtar.io`, Redirect URLs `https://anahtar.io/**`.
4. **Authentication → Providers → Email**: "Confirm email" açık kalsın.
5. **Project Settings → API**: `Project URL` ve `anon public` anahtarını al.
6. Hostinger'daki derleme ayarlarına ortam değişkeni olarak gir (bkz. `docs/hostinger.md`):
   `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`. `service_role` anahtarını asla girme.
7. Kendi hesabını yönetici yap: SQL Editor → `insert into public.admins (user_id) select id from auth.users where email = 'SENIN@EPOSTAN';`

## 2. E-posta gönderimi — zorunlu

Supabase'in yerleşik e-postası saatte birkaç iletiyle sınırlıdır. Doğrulama ve şifre sıfırlama
e-postaları için **Project Settings → Authentication → SMTP** bölümüne kendi gönderici bilgilerini gir
(Resend, Brevo ya da Hostinger e-postası). Gönderen: `info@anahtar.io`. Alan adına SPF ve DKIM
kayıtlarını eklemeyi unutma; yoksa e-postalar gereksiz klasörüne düşer.

## 3. Yasal metinler — zorunlu

`app/public/gizlilik`, `kosullar`, `hesap-silme` sayfaları **taslaktır**. Şirket unvanı, adres, MERSİS
ve vergi bilgileri işaretli alanlara girilmeli ve bir hukukçu tarafından gözden geçirilmeli.
VERBİS kaydı gerekip gerekmediğini mali müşavirinle kontrol et. Çerez kullanmıyoruz; analitik
eklenirse çerez bildirimi de eklenmeli.

## 4. Ödeme — paketler satılmadan önce

`app/src/domain/config.js` → `billing.paused: true` olduğu sürece satın alma kapalıdır; herkes
1 aylık denemeyle başlar, yönetici panelinden **Abonelikler → Paket ver / Denemeyi uzat** ile elle paket
verilebilir. Satışa geçmek için:
1. Fiyatları `billing.tiers` içindeki `price` alanlarına yaz (aylık ₺).
2. Web için iyzico ya da PayTR, telefon uygulaması için App Store / Google Play + RevenueCat
   (`docs/abonelik.md`). Ödeme sağlayıcısı aboneliği `subscriptions` tablosuna yazar; ürün kimliği
   `tek`, `bes` ya da `kurumsal` sözcüğünü içermeli.
3. `paused: false` yapıp yeniden yayınla.

## 5. Yayından önce son kontrol

- [ ] Kiracı, mülk sahibi ve ekip hesabıyla uçtan uca deneme (kayıt → e-posta doğrulama → davet kodu → dekont → onay)
- [ ] Şifre sıfırlama e-postası geliyor ve bağlantı siteye dönüyor
- [ ] `https://anahtar.io/destek/`, `/gizlilik/`, `/kosullar/`, `/hesap-silme/` açılıyor
- [ ] Supabase **Database → Backups** açık (ücretli planda günlük yedek)
- [ ] Hata takibi (Sentry) ve ziyaretçi ölçümü (Plausible ya da GA4) eklendi
- [ ] Google Search Console'a alan adı ve `sitemap.xml` eklendi
- [ ] İsteğe bağlı: bot koruması için Cloudflare Turnstile (`docs/guvenlik.md`)
