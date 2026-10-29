# Mülk sahibi aboneliği — kurulum

anahtar'da **kiracılar ücretsizdir**; mülk sahipleri abone olur. Bu belge,
aboneliğin App Store, Google Play ve web'de satılması için gereken hesap ve
ayarları adım adım anlatır. Kod tarafı hazırdır; aşağıdakiler yalnızca senin
hesaplarında yapılacak ayarlardır.

## Nasıl çalışıyor

```
 Mülk sahibi hesabı açılır ──► 1 ay (30 gün) deneme
                                  │
            deneme biter, abone değil ──► kayıtlar salt okunur
            (okuma, mesajlaşma, dışa aktarma, hesap silme açık kalır)
                                  │
 iPhone:  App Store ödemesi ─┐
 Android: Google Play ödemesi ├─► RevenueCat ──webhook──► billing fonksiyonu ──► subscriptions tablosu
 Web:     kartla ödeme ──────┘                                                     │
                                                                  uygulama my_access() ile okur
```

- **Kural sunucudadır.** Aboneliği olmayan mülk sahibi veritabanına yazamaz
  (`schema.sql` → `require_access`). Uygulama aynı kuralı önceden gösterir ama
  güvenlik ona bağlı değildir.
- **Kiracının işleri hiç etkilenmez.** Mülk sahibinin aboneliği bitse bile
  kiracı dekont yükler, talep açar, mesaj yazar.
- **RevenueCat** üç mağazayı tek yerde toplar; mağaza makbuzlarını doğrular,
  yenileme ve iptalleri izler. Küçük ölçekte ücretsizdir (aylık gelir belli bir
  eşiğe kadar).

Deneme süresi `supabase/schema.sql` içindeki `trial_days()` fonksiyonundadır
(varsayılan 30 gün). Değiştirip dosyayı yeniden çalıştırman yeterli.

> Güncel model için aşağıdaki "mülk başına abonelik" bölümüne bak: kartsız
> deneme kalkınca mağazanın 1 aylık ücretsiz deneme teklifi kullanılır.

---

## Güncel model: mülk başına abonelik (bu bölüm aşağıdaki eski anlatımın yerine geçer)

| | Başlangıç | Profesyonel | Kurumsal |
| --- | --- | --- | --- |
| Mülk | 1-9 | 1-9 | 10 ve üstü (teklif, iletişim) |
| Aylık fiyat (KDV dahil) | **₺99,99 / mülk** ($2.00) | **₺199,99 / mülk** ($4.00) | sözleşmeye göre |
| Yıllık fiyat | aylığın 10 katı (2 ay bedava): ₺999,90 / mülk | ₺1.999,90 / mülk | |
| SMS hatırlatması | yok | var (kota sonra belirlenecek) | var |

- **Mülk adedi satın alınır**: müşteri satın alma sayfasında (`/satin-al`) paketi, dönemi ve 1-9 arası mülk sayısını seçer;
  toplam = adet × mülk başı fiyat. Satın alınan adet mülk sınırıdır (sunucuda `guard_unit_limit`). Sınır dolunca "Mülk adedini artır"
  (9'u aşarsa Kurumsal) önerilir.
- **Mağaza ürün kimliği = paket + adet + dönem**: `tek_3_aylik`, `bes_5_yillik` … (paket `tek`/`bes`, adet 1-9, dönem `aylik`/`yillik`).
  Sunucu paketi ve adedi bu kimlikten okur (`plan_of`, `product_units`). Her mağazada 2 paket × 9 adet × 2 dönem = **36 abonelik
  ürünü** açılır (App Store Connect'te bir abonelik grubunda, Play'de "base plan"larla; toplu oluşturma için App Store Connect API'si
  ya da betik kullanılabilir). Eski kimlikler (`evim_aylik`, `tek`, `bes`) adet taşımaz; paketin üst sınırı (9) uygulanır.
  RevenueCat'te yetki (`pro`) ve paketler (offering) bu ürünlere bağlanır; uygulama seçilen adede göre ürünü seçer.
- **Ücretsiz ay + otomatik yenileme.** Kartsız üyelik kalkar: deneme, mağazanın "introductory offer / free trial" teklifidir
  (1 ay ücretsiz). 1 ayın sonunda iptal edilmezse aylık ya da yıllık abonelik kayıtlı karttan/hesaptan çekilmeye başlar.
  Mağazada her ürüne **1 aylık ücretsiz deneme** teklifi tanımlayın (eski "açmayın" tavsiyesi geçersiz).
- **Çekimden 1 gün önce hatırlatma.** `billing_reminders()` (schema.sql §21; pg_cron'la her gün 09:30 İstanbul) ertesi gün yenilenecek
  ya da ücretsiz ayı bitecek, iptal edilmemiş abonelere bildirim düşürür; `push` fonksiyonu bunu cihaza ve **e-postaya**
  (kullanıcı e-posta bildirimini kapatmış olsa da — işlem e-postasıdır) gönderir. Elle verilen paketler (`store = admin`) ve iptal
  edilenler (`will_renew = false`) hariçtir. pg_cron yoksa dışarıdan `select public.billing_reminders();` günde bir çalıştırılır.
- **Kartsız denemeyi kapatma (kesim).** Hazır olunca (ürünler, RevenueCat, mağaza teklifleri tamam), kesim tarihini yazın:

  ```sql
  alter database postgres set anahtar.card_trial_from = '2026-12-01T00:00:00Z';
  ```

  Bu tarihten **sonra** açılan mülk sahibi hesaplarına uygulama içi (kartsız) deneme verilmez; erişim abonelikle (mağazanın ücretsiz
  ayı dahil) açılır. Önce açılan hesaplar mevcut denemesini sürdürür. Aynı anda `app/src/domain/config.js` → `billing.cardTrial: true`
  ve `billing.paused: false` yapılır (metinler "kart ya da mağaza hesabı gerekir" der). Geri almak için
  `alter database postgres reset anahtar.card_trial_from;`.
- **Web'de kart.** Web'den kartla abonelik şu an yoktur (RevenueCat Web Billing Stripe ister, Stripe Türkiye'de kurulu şirketleri
  almaz). Kart bilgisini web'de almak için iyzico ya da PayTR ile ayrı bir entegrasyon gerekir (kartı saklayıp dönemsel çekim,
  3D Secure, iptal ve fatura akışı); o zamana kadar abonelik App Store / Google Play'den başlar. `/satin-al` sayfası seçimi alır ve
  ödeme açılana kadar bilgilendirir.
- **SMS yalnızca Profesyonel ve Kurumsal.** İstemcide `FEATURES.sms` ve ayarlarda kilit; sunucuda `sms_allowed()` (push fonksiyonu
  SMS'ten önce sorar; kiracıya giden SMS mülk sahibinin paketine bağlıdır, site aidatı Kurumsal sayılır).

## 1. Planlar ve fiyatlar

| | Karar |
| --- | --- |
| Satıcı | Şirket (App Store ve Google Play'de şirket hesabı) |
| Planlar | Aylık **₺249,99**, yıllık **₺2.499,99** (yıllıkta 2 ay bedava) |
| Satış kanalı | Başlangıçta yalnızca App Store ve Google Play; web'den abone olan yok (aşağıya bak) |
| Ürün kimlikleri | `evim_aylik`, `evim_yillik` |
| RevenueCat yetkisi (entitlement) | `pro` |
| RevenueCat paketleri | `$rc_monthly`, `$rc_annual` |

Fiyatı mağazalarda değiştirirsen `assets/js/config.js` → `billing.plans`
içindeki `price` değerini de güncelle (web'deki abonelik sayfası bunu gösterir).

**Komisyon:** Apple *App Store Small Business Program*'a ve Google Play'in
abonelik oranına göre ilk yıl gelirin %15'i mağazada kalır. Apple programına
App Store Connect üzerinden ayrıca başvurulur.

**Neden web'den satış yok:** RevenueCat'in web ödemesi Stripe ile çalışır ve
Stripe Türkiye'de kurulu şirketleri kabul etmez. Web'deki abonelik sayfası bu
yüzden telefondan abone olmayı anlatır; telefondan abone olan kullanıcı aynı
hesapla web'de de abone sayılır. Web'den satış gerekirse iyzico ya da PayTR
ile ayrı bir entegrasyon eklenir.

## 2. App Store Connect (iPhone)

Gerekenler: Apple Developer Program üyeliği (yıllık ücretli) ve App Store
Connect'te oluşturulmuş uygulama kaydı (bkz. `docs/mobil.md`).

1. **Business** (Anlaşmalar, Vergi ve Bankacılık) → *Paid Apps* anlaşmasını
   imzala, banka ve vergi bilgilerini gir. Bu bitmeden satış yapılamaz.
2. Uygulama → **Monetization → Subscriptions** → bir abonelik grubu oluştur
   (ör. "anahtar").
3. Gruba iki abonelik ekle: `evim_aylik` (1 ay) ve `evim_yillik` (1 yıl).
   Her biri için fiyat, Türkçe/İngilizce görünen ad ve açıklama gir.
4. **Users and Access → Integrations → In-App Purchase** → bir anahtar
   oluştur (.p8 dosyası). RevenueCat bunu isteyecek.
5. Test için **Sandbox** hesabı aç (Users and Access → Sandbox Testers).

## 3. Google Play Console (Android)

1. **Ödeme profili** oluştur (Setup → Payments profile).
2. Uygulama → **Monetize → Products → Subscriptions** → `evim_aylik` ve
   `evim_yillik` oluştur; her birine bir "base plan" (aylık / yıllık,
   otomatik yenilenen) ekle ve fiyat gir.
3. RevenueCat'in Play'e erişmesi için bir **Google Cloud hizmet hesabı**
   gerekir. RevenueCat'in "Google Play service credentials" rehberini izle ve
   hizmet hesabına Play Console'da *finansal verileri görüntüleme* ve
   *siparişleri yönetme* izinlerini ver.
4. Test için **License testing** listesine kendi Gmail adresini ekle.

> Play'de abonelik satabilmek için uygulamanın en az bir kez (kapalı test
> kanalına da olur) yüklenmiş olması gerekir.

## 4. RevenueCat

1. revenuecat.com → yeni proje ("anahtar").
2. **Apps** → *App Store* uygulaması ekle (bundle id: `io.anahtar.app`, .p8 anahtarı,
   Issuer ID, Key ID). *Play Store* uygulaması ekle (paket adı: `io.anahtar.app`,
   hizmet hesabı JSON'u).
3. **Products** → mağazalardaki dört ürünü içe aktar.
4. **Entitlements** → `pro` oluştur, dört ürünü bağla.
5. **Offerings** → `default` offering; içine `$rc_monthly` (aylık ürünler) ve
   `$rc_annual` (yıllık ürünler) paketlerini ekle.
6. **API keys** → herkese açık anahtarları kopyala:
   - `appl_…` → `config.js` → `billing.revenuecatIosKey`
   - `goog_…` → `config.js` → `billing.revenuecatAndroidKey`
   - **Secret key** (`sk_…`) → yalnızca Supabase gizli değişkenine (adım 6).
     Bunu asla `config.js`'e ya da depoya yazma.

### Web'den satış (şimdilik kullanılmıyor — yalnızca Türkiye dışında kurulu bir Stripe hesabıyla)

Web sitesinden abone olmak isteyenler için:

1. RevenueCat → **Web** → *Web Billing* (Stripe hesabı bağlanır) ya da
   doğrudan Stripe entegrasyonu.
2. Aynı `pro` yetkisine bağlı web ürünleri oluştur.
3. **Web Purchase Link** oluştur; bağlantıyı `config.js` →
   `billing.webPurchaseUrl` alanına yaz. Uygulama, kullanıcının kimliğini
   bağlantının sonuna ekler; böylece ödeme doğru hesaba yazılır.
4. Başarılı ödeme sonrası dönüş adresi olarak
   `https://<site>/#/mulk-sahibi?s=abonelik` gir.
5. Web abonelerinin aboneliği yönetebileceği sayfayı (müşteri portalı)
   `billing.webManageUrl` alanına yaz.

> Mağaza kuralları: iPhone ve Android uygulamasının **içinde** web ödeme
> bağlantısı gösterilmez; uygulama orada mağazanın kendi ödemesini kullanır.
> Bu ayrım kodda hazırdır (`billing.js` → `platform()`).

## 5. Sunucu: veritabanı

`supabase/schema.sql` dosyasını SQL Editor'de yeniden çalıştır. Abonelik
tablosu, deneme süresi ve yazma kuralı eklenir. Mevcut mülk sahiplerinin
denemesi **hesap açılış tarihinden** sayılır; eski hesapları olan bir
kurulumda herkesin denemesi bitmiş görünebilir. Böyle bir durumda ilk kez
açarken şu komutla herkese yeni bir deneme ver:

```sql
update public.profiles set created_at = now() where role = 'landlord';
```

## 6. Sunucu: billing fonksiyonu

```bash
supabase secrets set REVENUECAT_SECRET_KEY=sk_...
supabase secrets set REVENUECAT_WEBHOOK_AUTH=$(openssl rand -hex 24)
# yetki kimliği "pro" değilse:
# supabase secrets set REVENUECAT_ENTITLEMENT=...

supabase functions deploy billing --no-verify-jwt
```

`--no-verify-jwt`: webhook RevenueCat'ten gelir ve kendi anahtarıyla doğrulanır;
uygulamadan gelen çağrıda oturum anahtarı fonksiyonun içinde denetlenir.

Ardından RevenueCat → **Integrations → Webhooks**:

- URL: `https://<proje>.supabase.co/functions/v1/billing`
- Authorization header value: yukarıda ürettiğin `REVENUECAT_WEBHOOK_AUTH`
  değeri
- "Send test event" → yanıt `{"ok":true,"test":true}` olmalı.

## 7. Uygulama ayarları

`assets/js/config.js` → `billing`:

| Alan | Değer |
| --- | --- |
| `revenuecatIosKey` | `appl_…` |
| `revenuecatAndroidKey` | `goog_…` |
| `webPurchaseUrl` | RevenueCat Web Purchase Link (web satışı yoksa boş) |
| `webManageUrl` | web aboneleri için yönetim sayfası |
| `termsUrl`, `privacyUrl` | hazır: `https://anahtar.io/kosullar/` ve `/gizlilik/` (site/ klasörü) |
| `plans[].price` | yalnızca web'de gösterilen fiyat metni (ör. `₺249`); mobilde fiyat mağazadan okunur |

## 8. Test

1. iPhone'da sandbox hesabıyla, Android'de lisans testi hesabıyla abone ol.
   Sandbox'ta bir ay birkaç dakikada geçer; yenileme ve süre bitimini
   hızlıca görürsün.
2. Supabase → Table editor → `subscriptions`: satır oluşmalı,
   `environment = sandbox`.
3. Uygulamada Ayarlar → Abonelik: "Aktif". Aboneliği mağazadan iptal et;
   süre dolunca şerit "Deneme süren bitti" olmalı.
4. **Satın alımları geri yükle**: uygulamayı silip yeniden kur, aynı mağaza
   hesabıyla geri yükle.

## Mağaza incelemesi için notlar

- Abonelik sayfası fiyatı, dönemi, otomatik yenileme koşulunu, kullanım
  koşulları ve gizlilik bağlantılarını gösterir; "Satın alımları geri yükle"
  düğmesi vardır (Apple 3.1.2).
- Hesap silme uygulama içindedir; aktif abonelik varsa kullanıcıya mağazadan
  ayrıca iptal etmesi gerektiği söylenir (Apple 5.1.1).
- İnceleme ekibine bir **mülk sahibi** test hesabı ver; deneme süresi içinde
  olduğundan tüm özellikleri görebilirler. Gerekirse o hesaba RevenueCat
  panelinden "promotional" yetki tanımlayabilirsin.
