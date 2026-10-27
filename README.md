# Kiracım

Kiracı ve mülk sahibinin **aynı veriye iki taraftan baktığı** kira yönetimi
uygulaması: konut, ofis, mağaza ve depo. Kira ödemeleri, talepler, belgeler,
giriş/çıkış tutanağı, depozito iadesi, giderler, stopaj ve sözleşme yenilemesi
tek akışta.

**App Store ve Google Play uygulaması** (Capacitor) ve **web** aynı koddan
çıkar. Türkçe ve İngilizce. Kiracılar ücretsiz, mülk sahipleri aboneliklidir.

---

## İki çalışma modu

| | Demo | Gerçek hesaplar |
| --- | --- | --- |
| Ne zaman | `assets/js/config.js` boşken ya da adrese `?demo` eklenince | `config.js` Supabase bilgileriyle doldurulunca |
| Hesap | Yok; kiracı/mülk sahibi görünümü arasında geçilebilir | E-posta + şifre; oturum açık kalır |
| Veri | Yalnızca bu tarayıcıda (`localStorage`) | Supabase (Postgres), cihazlar arası anlık eşitleme |
| Arayüz | Her iki rol tek cihazda | Herkes yalnızca kendi rolünün arayüzünü görür |
| Bildirim | Uygulama içi | Uygulama içi + anlık bildirim (APNs, FCM, Web Push) + isteğe bağlı e-posta |
| Abonelik | Durumlar denenebilir | 1 ay (30 gün) deneme, sonra paket (Başlangıç / Portföy / Kurumsal) |

Kılavuzlar:

- **[docs/kurulum.md](docs/kurulum.md)** — sunucu (Supabase), giriş, bildirimler, web yayını
- **[docs/mobil.md](docs/mobil.md)** — iOS ve Android uygulaması, mağaza sürümü
- **[docs/abonelik.md](docs/abonelik.md)** — App Store, Google Play, RevenueCat ve web satışı

---

## Çalıştırma

Derleme adımı yok — statik dosyalar.

```bash
npm start            # → http://localhost:8000
# ya da
python3 -m http.server 8000
```

> `file://` ile açmayın: ES modülleri ve service worker bir sunucu ister.

**Yayın:** varsayılan dala her gönderimde `.github/workflows/pages.yml` siteyi
GitHub Pages'e yükler (Settings → Pages → Source: *GitHub Actions*).
`npm run build` yayın paketini (`www/`) üretir: supabase-js ve yazı tipleri
pakete alınır.

**Telefon:** `npm run android` / `npm run ios` (Android Studio / Xcode açılır).
Her gönderimde GitHub Actions iki platformu da derler ve Android için
kurulabilir bir APK üretir.

---

## Ne yapabiliyor

**Ödemeler.** Dekont (görsel ya da PDF) tutar, tarih ve notla yüklenir. Eksik
tutar **kısmi** ödeme olur, kalan bakiye takip edilir. Mülk sahibi onaylar ya da
gerekçeyle reddeder; gecikme her iki tarafta aynı görünür.

**Kira geçmişi.** Her tutar değişikliği geçerlilik tarihiyle saklanır; geçmiş
dönemler o dönemin kirasıyla hesaplanır. Kabul edilen yenileme, sözleşme
bitiminden itibaren geçerli yeni dönem olarak eklenir.

**Talepler, teklif ve fatura.** Arıza / tadilat / ek talep: Açıldı → Görüldü →
İşlemde → Çözüldü. Mülk sahibi usta tekliflerini karşılaştırıp seçer, faturayı
ekler; fatura otomatik olarak gider defterine işlenir.

**Gider defteri ve net getiri.** Emlak vergisi, aidat, sigorta, tamir… Ev
başına yıllık net getiri ve değere göre getiri oranı.

**Vergi tahmini.** Konut kira geliri istisnası, götürü ve gerçek gider
yöntemlerinin karşılaştırması, artan oranlı tarife. Oranlar
`assets/js/tax.js` içindeki `RATES` tablosuna gömülüdür; yeni yıl eklenene
kadar en yakın önceki yıl kullanılır ve ekranda uyarı çıkar.

**Çıkış ve depozito iadesi.** Çıkış tutanağı giriş tutanağıyla oda oda
karşılaştırılır; mülk sahibi kesinti girer, iki taraf onaylar, iade hesaplanır.

**Mülk tipleri.** Konut, ofis, mağaza, depo. Tutanak alanları, talep önerileri
ve belge kategorileri tipe göre gelir; DASK işyerinde isteğe bağlıdır.

**Şirket kiracı ve stopaj.** Kiracı şirket ya da esnafsa unvan ve vergi
bilgileri tutulur; kira stopajı (%20) düşülerek kiracıdan net tutar beklenir,
brüt ve stopaj ayrı gösterilir. Vergi tahmini konut istisnasını yalnızca
konuta uygular, stopajlı işyeri kirasını beyan sınırına göre değerlendirir ve
kesilen stopajı mahsup eder.

**Abonelik.** Mülk sahibi 1 aylık (30 gün) denemeyle başlar; süre bitince kayıtlar
salt okunur olur (okuma ve mesajlaşma açık). Kural sunucudadır; ödeme App
Store, Google Play ya da web üzerinden RevenueCat ile alınır.

**Birden fazla kiracı.** Aynı eve birden çok kiracı hesabı eklenir (davet
bağlantısı ya da kodla). Mesajlarda gönderen adıyla görünür.

**Sözleşme yenileme.** TÜFE ortalamasıyla yasal üst sınır hesaplanır; teklif
sınırı aşamaz, kiracı kabul eder ya da görüşmeye çağırır.

**Takip.** Ayarlanabilir hatırlatma eşikleri (kira günü, yenileme, DASK,
tahliye), takvim, Türkçe karakter duyarsız arama, yıllık rapor ve CSV.

**Veri.** JSON dışa/içe aktarma; eski sürümlerin verisi kayıpsız taşınır
(taşımadan önce yedek alınır). Silme gibi geri dönüşsüz işler uygulama içi
onay penceresi ister.

---

## Gezinme

| Yol | Ekran |
| --- | --- |
| `#/giris`, `#/kayit`, `#/sifre` | Giriş, kayıt, şifre sıfırlama (gerçek mod) |
| `#/katil/<kod>`, `#/davet` | Davetle eve katılma |
| `#/kiraci` | Kiracı paneli |
| `#/kiraci/odemeler` | Ödemeler, kira geçmişi, yenileme |
| `#/kiraci/talepler` | Talepler (`/talepler/<id>` doğrudan talep) |
| `#/kiraci/mesajlar` | Yazışma |
| `#/kiraci/belgeler` | Belgeler (`/tutanak`, `/cikis`) |
| `#/kiraci/takvim` | Yaklaşan işler |
| `#/mulk-sahibi` | Portföy |
| `#/mulk-sahibi/mulk/<ev>/<bölüm>` | `ozet`, `odeme`, `talep`, `mesaj`, `belge`, `tutanak`, `gider`, `cikis` |
| `#/mulk-sahibi/talepler`, `/mesajlar`, `/takvim` | Tüm evler |
| `#/mulk-sahibi/rapor` | Net getiri, vergi tahmini, CSV |

Eski `#/ev-sahibi/ev/…` adresleri yenisine yönlenir. Alt sayfalar da adreste taşınır (`?s=talep&pid=moda&id=r1`), böylece geri tuşu
onları kapatır ve bağlantısı paylaşılabilir.

**Kısayollar:** `Alt+←` geri · `Alt+1…5` sekmeler · `Alt+K` arama · `Esc`
kapat · soldan kaydırma geri (dokunmatik).

---

## Dil

Arayüz Türkçe ve İngilizce. Dil tarayıcıdan seçilir, *Ayarlar → Dil* ile
değiştirilir. Çeviri anahtarı Türkçe metnin kendisidir:

```js
t('Kaydet')                                  // → "Save"
t('{n} gün kaldı', { n })                    // tekil||çoğul: "1 day left" / "3 days left"
t('Ara|telefon')                             // bağlam: arama değil, telefonla ara
```

İngilizce karşılıklar `assets/js/en.js` içinde. Yeni bir `t('…')` eklenip
çevirisi girilmezse `tests/i18n.spec.mjs` hata verir.

---

## Dosya düzeni

```
index.html                 iskelet
manifest.webmanifest, sw.js  PWA: kurulum, çevrimdışı kabuk, anlık bildirim
assets/css/app.css         tasarım tokenları, bileşenler, açık/koyu tema
assets/js/
  config.js                demo / gerçek mod, yayın adresi, abonelik ayarları
  state.js                 durum, demo verisi, kalıcılık
  migrate.js               sürümler arası veri taşıma
  logic.js                 dönem, kira geçmişi, hatırlatma, rapor, arama
  tax.js                   vergi oranları ve hesabı
  router.js                hash yönlendirme, oturum koruması
  views.js, sheets.js      ekranlar ve alt sayfalar
  auth.js                  giriş, kayıt, davet ekranları
  backend.js               Supabase oturumu, eşitleme, dosya, bildirim
  mapping.js               tablo satırları ↔ uygulama durumu (saf)
  billing.js               deneme, abonelik, mağaza ve web satın alma
  native.js                iOS/Android: geri tuşu, bağlantılar, bildirim, kilit
  i18n.js, en.js           çeviri
  confirm.js, notify.js, tour.js, pwa.js, icons.js, util.js
  render.js, actions.js, main.js
supabase/schema.sql        tablolar, satır düzeyi güvenlik, tetikleyiciler
supabase/functions/push/   anlık bildirim (Web Push, APNs, FCM) ve e-posta
supabase/functions/billing/ abonelik eşitleme (RevenueCat webhook)
native/entry.js            yerel eklentiler (tek pakette derlenir)
ios/, android/             yerel projeler (Capacitor)
resources/                 uygulama ikonu ve açılış ekranı kaynakları
scripts/build.mjs          yayın paketi (www/)
docs/kurulum.md            gerçek sürüm kurulum kılavuzu
tests/                     Playwright testleri
```

Veri akışı tek yönlü: eylem durumu değiştirir → `save()` → `render()`.
Gerçek modda `save()` değişikliği tablolara çevirip (`mapping.js`) gecikmeli
olarak Supabase'e yazar; diğer cihazlardan gelen değişiklikler anlık abonelikle
gelir.

**Güvenlik** veritabanındadır: her tablo satır düzeyi kurallarla korunur,
tetikleyiciler rol kurallarını zorlar (ör. kiracı ödemesini onaylayamaz,
mülk sahibi kiracı adına mesaj yazamaz, kimse karşı tarafın onayını veremez).

---

## Testler

```bash
npm ci
npx playwright install chromium
npm test
```

- **Arayüz** — rotalar, akışlar, özellikler, veri taşıma, PWA, dil (masaüstü ve
  mobil görünüm).
- **Veritabanı** — `supabase/schema.sql` tarayıcıda çalışan Postgres (PGlite)
  üzerinde kurulur; rol kuralları, davet, bildirim ve hesap silme denenir.
- **Gerçek mod** — sahte bir Supabase istemcisiyle giriş, eşitleme, davet ve
  abonelik akışları.
- **Telefon** — sahte yerel eklentilerle geri tuşu, bağlantılar, bildirim,
  uygulama kilidi ve mağaza satın alması.
- **Paket** — yayın paketinin internetsiz (yerel yazı tipi, supabase-js) çalışması.

Her gönderimde GitHub Actions'ta çalışır (`.github/workflows/ci.yml`).

---

## Erişilebilirlik

Görünür odak, açık sayfalarda odak tuzağı, `aria-live` duyurular, en az 44 px
dokunma hedefleri, `prefers-reduced-motion` ve `prefers-color-scheme` desteği.

---

## Sınırlar

- Sunucunun ürettiği bildirim metinleri (kira hatırlatması, yeni talep…)
  şimdilik yalnızca Türkçe.
- Vergi oranları (istisna, dilimler, stopaj, beyan sınırı) elle güncellenir; 2026 oranları henüz eklenmedi. Hesap bilgi
  amaçlıdır, beyan öncesi mali müşavire danışılmalıdır.
- Kira artış sınırı için resmî TÜFE oranı TÜİK'ten doğrulanmalıdır.
- KVKK aydınlatma metni taslaktır; yayına almadan önce bir hukukçuya
  gösterilmelidir.
- Web sürümünde iPhone'a anlık bildirim için ana ekrana ekleme gerekir; mağaza uygulamasında gerekmez.
- Telefon uygulaması yerel olarak derlenmedi (bu ortamda Android SDK / Xcode yok); derleme GitHub Actions'ta doğrulanır.
