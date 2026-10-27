# anahtar — canlıya alma yol haritası

Durum (27 Ekim 2026): site, uygulama ve yönetici paneli hazır; Türkçe/İngilizce çalışıyor; 249 otomatik test geçiyor.
Eksikler kod değil, çoğunlukla **hesap / ayar / hukuk / ödeme** işleri. Aşağıdaki sıra önerilen sıradır;
**Faz 0 bitmeden siteyi duyurmayın** (kayıtlar Supabase'e gitmez).

Sahip: 👤 = sizin yapmanız gereken (hesap, sözleşme, karar) · 🤖 = kodda yapılabilir.

---

## Faz 0 — Canlı altyapı (1–2 gün) · ENGELLEYİCİ

- [ ] 👤 **Supabase anon key'i GitHub'a ekleyin**: depo → Settings → Secrets and variables → Actions → **Variables** →
      `SUPABASE_ANON_KEY`. Sonra Actions → *Hostinger paketi* → *Run workflow*. (Şu an `site` dalı yerel modda derleniyor;
      iş akışı artık bu durumda uyarı veriyor.)
- [ ] 👤 Supabase SQL Editor'de **`supabase/schema.sql`'i yeniden çalıştırın** (hesap silme düzeltmesi ve yeni KPI'lar burada).
- [ ] 👤 Supabase → Database → Extensions → **pg_cron** açık (günlük kira hatırlatmaları).
- [ ] 👤 Supabase → Authentication → URL Configuration: Site URL `https://anahtar.io`, Redirect URLs `https://anahtar.io/**`.
- [ ] 👤 Supabase → Authentication → **SMTP**: kendi e-posta sunucunuzu bağlayın (ör. Hostinger e-postası, `no-reply@anahtar.io`).
      Varsayılan Supabase e-postası saatte birkaç iletiyle sınırlı; kayıt onayı ve şifre sıfırlama takılır.
- [ ] 👤 Yönetici hesabı: sitede hesap açın → SQL Editor:
      `insert into public.admins (user_id) select id from auth.users where email = '…';` → `anahtar.io/giris/yonetici`.
- [ ] 👤 Hostinger: alan adını **`site` dalına** bağlayın (Git dağıtımı + otomatik dağıtım webhook'u), SSL kurun, HTTPS'i zorlayın,
      `www` → ana alan adı yönlendirmesi. Eski denemelerden kalan Node.js uygulaması / paketleri kaldırın.
- [ ] 👤 **Supabase planı**: ücretsiz katmanda proje 1 hafta hareketsiz kalınca durdurulur ve günlük yedek yoktur.
      Lansmandan önce **Pro** plana geçin; mümkünse PITR (anlık geri yükleme) açın.
- [ ] 👤 Uçtan uca canlı deneme (iki kişi, iki cihaz): mülk sahibi kaydı → mülk → davet bağlantısı → kiracı kaydı →
      dekont → yönetici onayı → mülk sahibi görür → hesap silme. (Aynı akış testte sahte sunucuyla geçiyor; gerçek sunucuda bir kez elle doğrulanmalı.)

## Faz 1 — Güvenlik ve hukuk (1–2 hafta, Faz 0 ile paralel)

- [ ] 👤 **KVKK**: aydınlatma metni ve gizlilik politikasını avukata kontrol ettirin; VERBİS kayıt yükümlülüğünü değerlendirin;
      veriler yurt dışında (Supabase, AB/Frankfurt) tutulduğu için KVKK md. 9 kapsamında yurt dışı aktarım şartlarını (standart sözleşme + bildirim) yerine getirin.
- [ ] 👤 Kullanım koşulları, mesafeli satış sözleşmesi ve ön bilgilendirme formu (abonelik satışı için zorunlu).
- [ ] 🤖 Statik sayfaların İngilizcesi: gizlilik, koşullar, destek, hesap silme ve blog şu an yalnız Türkçe (uygulama ve ana sayfa İngilizce).
- [ ] 👤/🤖 **Bot koruması**: Cloudflare Turnstile anahtarını `TURNSTILE_SITE_KEY` olarak ekleyin, Supabase'te CAPTCHA'yı açın (`docs/guvenlik.md` §4).
- [ ] 👤 Supabase Auth: sızdırılmış parola koruması, oran sınırları; yönetici hesaplarında **2 adımlı doğrulama**.
- [ ] 👤 Alan adının önüne **Cloudflare** (WAF, DDoS, önbellek) — önerilir (`docs/guvenlik.md` §3).

## Faz 2 — Ödeme ve gelir (2–4 hafta)

Kodda satın alma şu an **kapalı** (`CONFIG.billing.paused = true`): fiyatlar görünür, herkes 1 ay denemeyle başlar,
paketleri yönetici panelinden elle verebilirsiniz.

- [ ] 👤 Şirket / şahıs işletmesi, vergi levhası, **e-arşiv fatura** altyapısı.
- [ ] 👤 Ödeme sağlayıcı kararı:
      - **Türkiye (TL)**: iyzico ya da PayTR (Türk kartları, taksit, e-fatura entegrasyonu). Stripe Türkiye'de üye işyeri açmıyor.
      - **Yurt dışı (USD, $4.99 / $19.99)**: Paddle ya da Lemon Squeezy gibi "merchant of record" (vergi/KDV'yi onlar yönetir).
      - **Mobil**: App Store / Google Play abonelikleri + RevenueCat (`docs/abonelik.md`).
- [ ] 🤖 Seçilen sağlayıcıyla web ödemesi + abonelik durumunun Supabase'e yazılması (webhook), `paused` kapatılır.
- [ ] 🤖 Ödeme sorunu / yenileme / deneme bitiyor e-postaları.

## Faz 3 — Mobil uygulamalar (2–3 hafta)

- [ ] 👤 Apple Developer (yıllık $99) ve Google Play Console (tek sefer $25) hesapları.
- [ ] 🤖 Expo EAS ile iOS/Android derlemeleri, anlık bildirimler (APNs/FCM, `supabase/functions/push`), derin bağlantılar (`/katil`).
- [ ] 👤 Mağaza sayfaları: ekran görüntüleri, açıklama (TR/EN), gizlilik etiketleri, hesap silme adresi (`/hesap-silme` hazır).

## Faz 4 — Lansman hazırlığı (1–2 hafta)

- [ ] 👤 **Dekont denetim operasyonu**: yüklenen her dekont/belge yönetici onayından geçiyor. Kim onaylayacak, hedef süre ne
      (ör. 4 saat)? Yoğunlukta darboğaz olur; gerekirse otomatik onay kuralı tartışılmalı.
- [ ] 🤖 Analitik (Plausible / PostHog) ve hata izleme (Sentry); yönetici panelindeki KPI'lara ek olarak dönüşüm hunisi.
- [ ] 🤖 E-posta şablonları (kayıt onayı, şifre sıfırlama) Türkçe + İngilizce, marka görünümüyle.
- [ ] 👤 Yedekten geri yükleme denemesi (bir kez).
- [ ] 👤 **Kapalı beta**: 10–20 mülk sahibi + kiracıları, 2–4 hafta; geri bildirim → düzeltme.
- [ ] 👤 Destek kanalı: `info@anahtar.io` gelen kutusu, SSS güncellemesi.

## Faz 5 — Açılış ve büyüme

- [ ] 👤 Google Search Console + site haritası gönderimi, blog içerik takvimi (kira artışı, depozito, stopaj…).
- [ ] 👤 Emlakçı / site yöneticisi ortaklıkları (Portföy paketi), sosyal medya.
- [ ] 🤖 Davet / tavsiye (referral) mekanizması; yıllık plan teşvikleri.

## Teknik borç (kısa vadede ele alınmalı)

- Depoda eski "Kiracım" PWA'sı (kök `index.html`, `assets/js`, Capacitor `android/ios`) ve testleri duruyor; yayına çıkan ürün
  `app/` klasöründeki anahtar uygulaması. Eski kod kaldırılmalı ya da arşivlenmeli (CI süresi ve karışıklık).
- GitHub Actions'taki `actions/*@v4` sürümleri Node 20 uyarısı veriyor; güncellenmeli (Dependabot PR'ları açık).
- `claude/github-keys-setup-uzvnzm` dalı şu an varsayılan dal; `main` adıyla düzenli bir dal yapısına geçilmesi önerilir.
