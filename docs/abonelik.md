# Mülk sahibi aboneliği — kurulum ve işleyiş

anahtar'da **kiracılar ücretsizdir**; mülk sahipleri abone olur. Abonelik **yalnızca telefondan** satılır:
iPhone'da App Store, Android'de Google Play. Bu belge modeli, mağaza ürünlerini ve ilgili hesap
ayarlarını anlatır. Kod tarafı hazırdır; aşağıdakiler senin hesaplarında yapılacak ayarlardır.

## Nasıl çalışıyor

```
 Mülk sahibi hesabı açılır ──► 30 gün deneme (sunucuda, kart ya da mağaza gerekmez)
                                  │
            deneme biter, abone değil ──► kayıtlar salt okunur
            (okuma, mesajlaşma, dışa aktarma, hesap silme açık kalır)
                                  │
 iPhone:  App Store ödemesi ─┐
 Android: Google Play ödemesi ├─► RevenueCat ──webhook──► billing fonksiyonu ──► subscriptions tablosu
 Web:     ödeme yok ("uygulamadan abone ol")                                      │
                                                                  uygulama my_access() ile okur
```

- **Kural sunucudadır.** Aboneliği olmayan mülk sahibi veritabanına yazamaz (`require_access`). Uygulama aynı kuralı
  önceden gösterir ama güvenlik ona bağlı değildir.
- **Kiracının işleri hiç etkilenmez.** Mülk sahibinin aboneliği bitse bile kiracı dekont yükler, talep açar, mesaj yazar.
- **RevenueCat** iki mağazayı tek yerde toplar; makbuzları doğrular, yenileme ve iptalleri izler. Projemiz
  DevirVentures'ın RevenueCat hesabındaki **"anahtar"** projesidir. Küçük ölçekte ücretsizdir (aylık gelir belli bir eşiğe kadar).
- **Deneme yalnızca sunucudadır.** Hesap açılınca 30 gün başlar; mağazanın "ücretsiz deneme" (introductory offer) teklifi
  **kullanılmaz**. Böylece deneme herkes için aynıdır ve mağaza ürünlerinde deneme ayarı yapılmaz. Süre `trial_days()`
  fonksiyonundadır (varsayılan 30); değiştirmek yeni bir migration gerektirir (bkz. [migrations.md](migrations.md)).
- **Web'de ödeme alınmaz** (v1). Web'deki satın alma sayfası (`/satin-al`) seçimi alır, "aboneliği anahtar'ın iPhone ve
  Android uygulamasından başlat" der. Telefondan abone olan kullanıcı aynı hesapla web'de de abone sayılır.

## 1. Planlar ve fiyatlar

| | Başlangıç | Profesyonel | Kurumsal |
| --- | --- | --- | --- |
| Mülk | 1-9 | 1-9 | 10 ve üstü (teklif, iletişim) |
| Aylık fiyat (KDV dahil) | **₺99,99 / mülk** | **₺199,99 / mülk** | sözleşmeye göre |
| Yıllık fiyat | **₺999,99 / mülk** (2 ay bedava) | **₺1.999,99 / mülk** | |
| SMS hatırlatması | yok | var (kota sonra belirlenecek) | var |

- Fiyatlar mağazaların fiyat basamaklarına (",99" ile biten tutarlar) hizalıdır; telefonda fiyat her zaman **mağazadan**
  okunur, web bu değerleri gösterir. Fiyatlar `app/src/domain/config.js` → `billing.tiers` içindedir.
- **Mülk adedi satın alınır:** müşteri paketi, dönemi ve 1-9 arası mülk sayısını seçer; toplam = adet × mülk başı fiyat.
  Satın alınan adet mülk sınırıdır (sunucuda `guard_unit_limit`). Sınır dolunca "Mülk adedini artır" (9'u aşarsa Kurumsal) önerilir.
- **SMS yalnızca Profesyonel ve Kurumsal.** İstemcide `FEATURES.sms` ve ayarlarda kilit; sunucuda `sms_allowed()`.
- **Komisyon:** Apple *App Store Small Business Program*'a ve Google Play'in abonelik oranına göre ilk yıl gelirin %15'i
  mağazada kalır. Apple programına App Store Connect üzerinden ayrıca başvurulur.

## 2. Mağaza ürünleri (katalog)

Ürün kimliği = paket + adet + dönem. Paket `tek` (Başlangıç) ya da `bes` (Profesyonel), adet 1-9, dönem `aylik` ya da `yillik`.
Sunucu paketi ve adedi bu kimlikten okur (`plan_of`, `product_units`); sunucudaki kimlik her zaman `tek_3_aylik` biçimindedir.

| Mağaza | Ne açılır |
| --- | --- |
| **App Store** | **36 otomatik yenilenen abonelik**: `tek_1_aylik` … `tek_9_aylik`, `tek_1_yillik` … `tek_9_yillik` ve aynısı `bes_…` için. Hepsi **tek abonelik grubunda** ("anahtar"). Grupta sıralama: Profesyonel üstte, çok mülk üstte (yükseltme ve düşürme mağazada doğru çalışsın) |
| **Google Play** | **2 abonelik**: `tek` ve `bes`. Her birinde **18 temel plan** (base plan): `1-aylik`, `1-yillik` … `9-aylik`, `9-yillik`. RevenueCat Play ürününü `abonelik:temel-plan` diye gösterir, örn. `tek:3-aylik` |

- **Fiyat kuralı:** ürün fiyatı = mülk başı fiyat × adet, en yakın ",99" basamağına yuvarlanır
  (2 × 99,99 = 199,98 → **199,99**; 9 × 999,99 = 8.999,91 → **8.999,99**). Yalnızca TL (Türkiye) girilir; diğer ülkeleri
  mağazalar kendisi karşılar.
- **Tam fiyat tablosu** (36 satır, mağaza konsoluna girilecek değerler) tek komutla çıkar; dosya hiçbir şeyi yazmaz, ağa bağlanmaz:

  ```bash
  node app/scripts/magaza-fiyatlari.mjs            # okunur tablo
  node app/scripts/magaza-fiyatlari.mjs --csv      # elektronik tablo ya da betik için
  node app/scripts/magaza-fiyatlari.mjs --play     # yalnız Google Play (abonelik → temel plan → fiyat)
  ```

  Örnek satırlar: Başlangıç 1 mülk 99,99 / 999,99 ₺; 3 mülk 299,99 / 2.999,99 ₺; 9 mülk 899,99 / 8.999,99 ₺.
  Profesyonel 1 mülk 199,99 / 1.999,99 ₺; 9 mülk 1.799,99 / 17.999,99 ₺ (aylık / yıllık).
- **Deneme teklifi yok:** iki mağazada da hiçbir ürüne ücretsiz deneme ya da tanıtım fiyatı tanımlanmaz.
- **Paket değişikliği** (örn. 3 mülkten 5 mülke, Başlangıç'tan Profesyonel'e):
  - *Yükseltme* (daha değerli paket ya da daha çok mülk) hemen başlar; kalan süre orantılı hesaba katılır.
  - *Düşürme* ve yıllıktan aylığa geçiş mevcut dönemin sonunda başlar; o zamana kadar şimdiki paket geçerli kalır.
  - iPhone'da geçişi Apple (abonelik grubu), Android'de uygulama yönetir: etkin bir Play aboneliği varsa yenisi onun yerine
    geçer, **paralel ikinci abonelik açılmaz**.

## 3. Sunucu tarafı güvenceler

- **Webhook.** RevenueCat her satın alma, yenileme, iptal ve süre bitiminde `billing` fonksiyonunu çağırır. Fonksiyon abone
  bilgisini RevenueCat'ten yeniden okur (tek doğru kaynak), böylece sırası bozuk ya da çift gelen bildirimler zarar vermez.
  Yanıtlarda RevenueCat metni ya da hata ayrıntısı yoktur; ayrıntı yalnız sunucu kayıtlarına (`function_logs`) yazılır.
- **Günlük uzlaştırma.** Kaçan bir webhook'a karşı ağ güvenliği: her gün 04:30 UTC'de (07:30 İstanbul) veritabanındaki
  zamanlanmış iş (pg_cron, `anahtar-billing-reconcile`) `billing` fonksiyonuna `{"action":"reconcile"}` gönderir; süresi
  2 gün içinde dolacak ya da son 30 günde dolmuş her mağaza aboneliği RevenueCat'ten tazelenir. Çağrı `BILLING_CRON_SECRET`
  gizli değeriyle doğrulanır (veritabanında Vault'ta `anahtar_billing_secret` adıyla durur; değerleri git'e ya da sohbete yazma).
  Uygulama da öne gelince, aboneliğin bitmesine 2 günden az kaldıysa kendiliğinden eşitler (6 saatte en çok bir kez).
- **Yönetici ve promosyon paketleri korunur.** Yöneticinin elle verdiği (`store = admin`) ve süresi dolmamış paket ile
  promosyon paketi, mağaza eşitlemesiyle ezilmez. "Mağazada yetki yok" yanıtı da bu satırları silmez. Süresi dolmuş hibe
  eşitlemeyle değiştirilebilir.
- **Test (sandbox) satın alımları** erişim verir ama gelir ve KPI hesaplarına, abonelik hatırlatmasına girmez
  (`environment = sandbox` satırları yönetici panelinde "abone" sayılmaz).
- **Çekimden 1 gün önce hatırlatma.** `billing_reminders()` (pg_cron'la her gün 09:30 İstanbul) ertesi gün yenilenecek,
  iptal edilmemiş mağaza aboneliklerine bildirim düşürür; `push` fonksiyonu bunu cihaza ve **e-postaya** gönderir (işlem
  e-postasıdır; kullanıcı e-posta bildirimini kapatmış olsa da gider). Elle verilen paketler, iptal edilenler ve test
  satın alımları hariçtir.
- **Ödeme duraklatma bayrağı veritabanındadır.** `public.app_config` tablosunda `billing_paused` satırı (herkes okur, yalnız
  yönetici yazar). Başlangıçta **true** (satın alma kapalı: herkes denemeyle ya da yöneticinin verdiği paketle kullanır).
  Her iki mağaza uygulamayı onaylayınca değer **false** yapılır; yeni uygulama sürümü gerekmez, uygulama değeri en geç
  5 dakikada alır. Okunamazsa `config.js` → `billing.paused` yedeği kullanılır.

  ```sql
  update public.app_config set value = 'false'::jsonb where key = 'billing_paused';
  ```

## 4. Hesap ve ayar adımları

### 4.1 App Store Connect (iPhone)

Gerekenler: DevirVentures'ın Apple Developer hesabı ve App Store Connect'te oluşturulmuş uygulama kaydı (bkz. [magaza.md](magaza.md)).

1. **Business** (Anlaşmalar, Vergi ve Bankacılık) → *Paid Apps* anlaşmasını imzala, banka ve vergi bilgilerini gir.
   Bu bitmeden satış yapılamaz.
2. Uygulama → **Monetization → Subscriptions** → bir abonelik grubu: **"anahtar"**.
3. Gruba 36 aboneliği ekle (kimlikler ve fiyatlar `node app/scripts/magaza-fiyatlari.mjs` çıktısındadır): süre 1 ay ya da 1 yıl,
   Türkçe/İngilizce görünen ad ve açıklama. **Deneme / tanıtım teklifi ekleme.** Grup sıralaması bölüm 2'deki gibidir.
4. **Users and Access → Integrations → In-App Purchase** → anahtar oluştur (.p8 dosyası); RevenueCat bunu isteyecek.
5. **App Store Server Notifications (sürüm 2)** adresine RevenueCat'in verdiği adresi gir (RevenueCat → uygulama ayarlarında yazar).
6. Test için **Sandbox** hesabı aç (Users and Access → Sandbox Testers).

### 4.2 Google Play Console (Android)

1. **Ödeme profili** oluştur (Setup → Payments profile).
2. Play'de abonelik satabilmek için uygulamanın en az bir kez (iç test kanalına da olur) yüklenmiş olması gerekir; ilk paket
   (.aab) Play Console'dan elle yüklenir (bkz. [magaza.md](magaza.md)).
3. Uygulama → **Monetize → Products → Subscriptions** → `tek` ve `bes` oluştur. Her birine 18 temel plan ekle:
   `1-aylik` (1 ay, otomatik yenilenen), `1-yillik` (1 yıl) … `9-aylik`, `9-yillik`; fiyatlar `--play` çıktısındaki gibidir.
   **Ücretsiz deneme ya da tanıtım teklifi ekleme.**
4. **Gerçek zamanlı geliştirici bildirimleri (RTDN):** Google Cloud'da bir Pub/Sub konusu aç, RevenueCat'in verdiği hesaba
   yayın izni ver ve Play Console → Monetization setup'ta konuyu bağla (RevenueCat rehberi adım adım gösterir).
5. RevenueCat'in Play'e erişmesi için bir **Google Cloud hizmet hesabı** gerekir (RevenueCat "Google Play service credentials"
   rehberi); hizmet hesabına Play Console'da *finansal verileri görüntüleme* ve *siparişleri yönetme* izinleri verilir.
6. Test için **License testing** listesine test Gmail adreslerini ekle.

### 4.3 RevenueCat

1. DevirVentures hesabında **"anahtar"** projesi.
2. **Apps** → *App Store* uygulaması (bundle id: `io.anahtar.app`, .p8 anahtarı, Issuer ID, Key ID) ve *Play Store* uygulaması
   (paket adı: `io.anahtar.app`, hizmet hesabı JSON'u).
3. **Products** → mağazalardaki ürünleri içe aktar (App Store'dan 36, Play'den 2 abonelik ve 18'er temel plan).
4. **Entitlements** → `pro` oluştur, bütün ürünleri bağla.
5. **Restore behavior** (geri yükleme davranışı): *Keep with original App User ID*. Böylece abonelik, satın alındığı
   hesapta kalır; başka hesaba kaydırılmaz.
6. **Offerings** (paket vitrini) oluşturmak gerekmez: uygulama ürünleri kimlikle doğrudan sorar.
7. **Integrations → Webhooks:** adres `https://<proje>.supabase.co/functions/v1/billing`, Authorization değeri uzun rastgele
   bir metin (4.4'teki `REVENUECAT_WEBHOOK_AUTH`). "Send test event" → yanıt `{"ok":true,"test":true}` olmalı.
8. **API keys:** herkese açık SDK anahtarlarını (`appl_…`, `goog_…`) EAS ortam değişkenlerine yaz (bölüm 5); **Secret key**
   (`sk_…`) yalnız Supabase gizli değişkenine gider. Secret key'i asla uygulamaya, depoya ya da sohbete yazma.

### 4.4 Supabase: veritabanı ve billing fonksiyonu

Veritabanı değişiklikleri (abonelik tabloları, `app_config`, uzlaştırma işlevi) **migration** ile gelir; `schema.sql` elle
çalıştırılmaz. Sıra ve onaylar için [migrations.md](migrations.md) ve [canliya-alma.md](canliya-alma.md).

```bash
supabase secrets set REVENUECAT_SECRET_KEY=...        # RevenueCat secret key (v1)
supabase secrets set REVENUECAT_WEBHOOK_AUTH=...      # webhook'ta girilen Authorization değeri (uzun, rastgele)
supabase secrets set BILLING_CRON_SECRET=...          # günlük uzlaştırma gizli değeri (en az 32 bayt, rastgele)
# yetki kimliği "pro" değilse: supabase secrets set REVENUECAT_ENTITLEMENT=...

supabase functions deploy billing --no-verify-jwt
```

Aynı `BILLING_CRON_SECRET` değeri veritabanında Vault'a `anahtar_billing_secret` adıyla da eklenir (SQL Editor:
`vault.create_secret(değer, ad)`); `kasa_sirlari` migration'ı bu kayıt yoksa hata verip durur. Gizli değerleri (`...` yerine
yazacağın değerler) git'e, sohbete ya da belgeye yazma.

`--no-verify-jwt`: webhook RevenueCat'ten gelir ve kendi anahtarıyla doğrulanır; uygulamadan gelen çağrıda oturum anahtarı
fonksiyonun içinde denetlenir; günlük uzlaştırma gizli başlıkla doğrulanır.

## 5. Uygulama ayarları

Telefon uygulaması ayarları **EAS ortam değişkenlerinden** (production ve preview) alır; kod ya da depo dosyasına anahtar
yazılmaz. Ayrıntı: [magaza.md](magaza.md).

| Değişken | Değer |
| --- | --- |
| `EXPO_PUBLIC_RC_IOS_KEY` | RevenueCat herkese açık iOS anahtarı (`appl_…`) |
| `EXPO_PUBLIC_RC_ANDROID_KEY` | RevenueCat herkese açık Android anahtarı (`goog_…`) |
| `EXPO_PUBLIC_APP_STORE_URL`, `EXPO_PUBLIC_PLAY_STORE_URL` | Mağaza sayfası adresleri (yayından sonra; web satın alma sayfasındaki düğmeler için) |

- Anahtar tanımlı değilse telefonda satın alma kapalı kalır ("bu cihazda henüz açık değil"); mağaza ürünleri bulunamıyorsa
  fiyat ve satın alma düğmesi gizlenir, "geri yükle" açık kalır.
- Kullanım koşulları ve gizlilik bağlantıları hazırdır: `https://anahtar.io/kosullar/` ve `/gizlilik/` (sayfalar şu an taslak,
  bkz. [canliya-alma.md](canliya-alma.md) bölüm 3).

## 6. Test

1. iPhone'da sandbox hesabıyla, Android'de lisans testi hesabıyla abone ol. Sandbox'ta bir ay birkaç dakikada geçer;
   yenileme ve süre bitimini hızlıca görürsün. Ayrıca bir **paket değişikliği** (yükseltme ve düşürme) ve **geri yükleme** dene.
2. Supabase → Table editor → `subscriptions`: satır oluşmalı, `environment = sandbox`, `store = app_store / play_store`.
3. Uygulamada Ayarlar → Abonelik: "Aktif". Aboneliği mağazadan iptal et; süre dolunca şerit "Deneme süren bitti" olmalı.
4. **Satın alımları geri yükle:** uygulamayı silip yeniden kur, aynı mağaza hesabıyla geri yükle.
5. Yönetici panelinde sandbox satın alımının gelir ve "ödeyen" sayılarına girmediğini doğrula.

## Mağaza incelemesi için notlar

- Abonelik sayfası fiyatı, dönemi, otomatik yenileme koşulunu, kullanım koşulları ve gizlilik bağlantılarını gösterir;
  "Satın alımları geri yükle" düğmesi vardır (Apple 3.1.2).
- Hesap silme uygulama içindedir; aktif mağaza aboneliği varsa kullanıcıya önce mağazadan iptal etmesi gerektiği söylenir
  ve silme başarısız olursa hata gösterilir (Apple 5.1.1).
- İnceleme ekibine bir **mülk sahibi** test hesabı ver (bkz. [magaza.md](magaza.md) bölüm 2); hesaba yöneticiden "paket ver"
  ile süresiz paket tanımlanır, böylece tüm özellikleri görürler.
- Uygulamadan web ödeme sayfasına yönlendirme yoktur; web'de de ödeme alınmaz.

## Web'den satış (sonraki karar)

v1'de yoktur. İstenirse ayrı bir iş olarak planlanır: RevenueCat Web Billing Stripe ister ve Stripe Türkiye'de kurulu
şirketleri kabul etmez; alternatif iyzico ya da PayTR ile ayrı bir entegrasyondur (kartı saklayıp dönemsel çekim, 3D Secure,
iptal ve fatura akışı). Mağaza kuralları gereği iPhone ve Android uygulamasının **içinde** web ödeme bağlantısı gösterilmez.
