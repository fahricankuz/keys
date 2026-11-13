# Yapay zekâ ile güvenli çalışma rehberi

Bu belge **teknik olmayan** depo sahipleri içindir. anahtar'ın kodunun büyük kısmını yapay zekâ ajanları yazar (Claude Code, Codex, Claude Code web).
Siz ne istediğinizi söylersiniz, ajan yapar, **siz onaylarsınız**. Aşağıda: nasıl istenir, neyi onaylamanız gerekir, neyi asla yapıştırmamalısınız, bir şey bozulursa ne yapılır.

> Ajanların uyduğu kurallar (İngilizce) [AGENTS.md](../AGENTS.md) dosyasındadır. Bu belge onun sizin için sade özetidir; çelişirse AGENTS.md geçerlidir.

## 1. Kısaca

1. **İsteğinizi** düz Türkçeyle yazın. Ajan size birkaç soru sorabilir; cevaplayın.
2. Ajan işi bir **PR**'da (değişiklik önerisi) hazırlar. PR'ın açıklamasında *ne*, *neden*, *nasıl denendi*, *neyi denemedi* ve *nasıl geri alınır* yazar.
3. **Siz "birleştir" demeden** hiçbir şey canlıya çıkmaz. Veritabanı, mağaza, bildirim, e-posta gibi geri alınması zor işlerde ajan **ayrıca** onayınızı ister.
4. Her iş **özetle** biter: ne değişti, kanıt, denenmeyenler, kalanlar.

## 2. İyi bir istek nasıl yazılır

İyi istek dört şeyi söyler: **ne** istiyorsunuz, **neden**, **nerede** (hangi ekran/sayfa), **bitti sayılması için ne olmalı**. Teknik terim bilmeniz gerekmez.

| Zayıf istek | Güçlü istek |
|---|---|
| "Ödeme ekranı bozuk." | "Kiracı olarak dekont yükleyince 'Gönder' düğmesi dönüp duruyor (iPhone, uygulama sürümü 1.0.0 (4)). Sebebini bul, düzelt, aynı türden başka yerler varsa onları da kontrol et. Düzeltmeyi PR olarak aç, birleştirme." |
| "Fiyatları güncelle." | "Başlangıç paketi aylık 99,99 ₺ kalacak, Profesyonel 199,99 ₺ kalacak; yalnız İngilizce metindeki fiyat açıklamasını düzelt. Fiyat sabitlerine dokunma." |
| "Bir şey çalışmıyor." | "anahtar.io'da şifre sıfırlama e-postasındaki bağlantı 'geçersiz' diyor. Önce Sentry'ye ve loglara bak, nedenini söyle, sonra düzeltme öner. Henüz hiçbir şeyi değiştirme." |

**Örnek istekler (kopyalayıp uyarlayabilirsiniz)**

- *Salt okur inceleme (hiçbir şey değişmez):* "Sadece oku, hiçbir şey yazma: son 24 saatte Sentry'de yeni hata var mı? Varsa hangi ekranda, kaç kişide, kritik mi?"
- *Küçük düzeltme:* "Destek sayfasındaki telefon numarası yanlış: `+90 …` olacak. Düzelt, PR aç, bana PR bağlantısını ve neyi denediğini yaz."
- *Yeni özellik:* "Mülk sahibi, kiracıya tek tuşla hatırlatma gönderebilsin. Önce bana 2-4 net soru sor, sonra yap. Gerçek kullanıcıya hiçbir mesaj gönderme."
- *Yayın durumu:* "Son PR canlıya çıktı mı? Web, fonksiyon, migration, uygulama ayrı ayrı söyle: ne yayında, ne bekliyor?"
- *Geri alma:* "Dünkü PR #NNN yüzünden giriş ekranı bozuk. Geri alma PR'ı hazırla; birleştirmeden önce bana göster."
- *Bilgi:* "Bu depoda 'billing_paused' ne işe yarar, şu an açık mı kapalı mı? Sadece açıkla ve doğrula; değiştirme."

**İpuçları**
- "Sadece oku", "hiçbir şeyi değiştirme", "birleştirme" gibi sınırları **yazın**; ajan bunlara uyar.
- Aynı anda tek bir konu isteyin; büyük işleri "önce plan çıkar, onayımı al" diye başlatın.
- Ajan bir şeyi **doğrulayamadığını** söylerse bu bir bilgidir, sorun değil: "çalıştırılmayanlar" listesini okuyun.
- Bir şeyi "bitti" demeden önce ajandan **kanıt** isteyin: komut çıktısı, test sonucu, PR bağlantısı, ekran görüntüsü.

## 3. Ajanın sizden onay isteyeceği işler

Ajan bunları **kendi başına yapmaz**; sizin o işi adıyla söyleyen mesajınızı bekler ("Genel 'devam et' bu listeyi kapsamaz").

| İş | Ne demelisiniz | Neden |
|---|---|---|
| PR'ı canlı koda katmak (**birleştirme / merge**) | "PR #NNN'i birleştir." | Birleştirilen kod site olarak yayınlanır |
| Veritabanı değişikliğini **canlıya uygulamak** | "Production migration'ı uygula" (önce plan çıktısına bakın) | Gerçek kullanıcı verisi etkilenir |
| Sunucu fonksiyonunu yayınlamak | "`billing` fonksiyonunu yayınla" | Ödeme, e-posta, bildirim bu fonksiyonlardan geçer |
| Gizli anahtar/parola değiştirmek | "Şu sırrı döndür" | Yanlış yapılırsa e-posta/bildirim durabilir |
| Mağaza derlemesi, TestFlight/Play'e yükleme | "iOS derlemesini al" | Derleme kuyruğu ve sürüm numarası harcanır |
| Mağazaya inceleme gönderimi ve yayın | "Apple'a gönder" / "Yayınla" | Kullanıcılara ulaşır, geri alması yavaştır |
| Anlık güncelleme (OTA) | "OTA yayınla" | Telefonlara hemen gider |
| Gerçek kullanıcıya e-posta/bildirim/SMS | Açıkça belirtin | Geri alınamaz; testler yalnız size gider |
| Hesap/konsol ayarı (Apple, Google, Supabase, Sentry, RevenueCat, Hostinger) | Konsola **siz** girersiniz | Parolalarınızı ajan görmez |
| Ödemeyi durdurma/açma (`billing_paused`) | Açıkça söyleyin | Satışı etkiler |
| Yeni ücretli araç | Maliyet tahminini görüp onaylayın | Beklenmedik fatura olmasın |

Ajan canlı veriye **hiçbir zaman** onaysız yazmaz; yazması gerekirse önce **yedek**, sonra **deneme (dry-run)**, sonra en küçük değişiklik, sonra tekrar kontrol yapar.

## 4. Asla yapıştırmayın

Ajana, sohbete, PR açıklamasına, e-postaya, ekran görüntüsüne **şunları yazmayın / göndermeyin**:

- Parolalar (Apple, Google, GitHub, Supabase, Hostinger, posta kutusu, inceleme hesabı).
- Anahtarlar ve jetonlar: `.env` dosyası içeriği, `service_role`/"secret" anahtarı, `EXPO_TOKEN`, `SENTRY_AUTH_TOKEN`, RevenueCat gizli anahtarı, APNs/ASC `.p8` dosyaları,
  `google-services.json`, Play hizmet hesabı dosyaları, `.jks`/`.p12`, Supabase yönetim jetonu, veritabanı bağlantı adresi (içinde parola vardır).
- İki adımlı doğrulama kodları ve kurtarma kodları.
- Müşteri e-posta adresleri, telefonları, kimlik/IBAN bilgileri.

**Depo herkese açıktır:** buraya yazılan her şeyi internetteki herkes okuyabilir. Gizli değerlerin yalnız **adları** yazılır (örnek: `SMTP_PASS` adı), **değeri** değil.
Gizli dosyalarınız Mac'inizde `~/.config/anahtar/secrets` klasöründe kalır; depoya girmez.

Ajan sizden bir değer isterse, önce "bunu yapıştırmadan başka yolu var mı?" diye sorun. Çoğu zaman ajan değeri kendisi okumadan, sizin konsolda yapıştırmanızla halledebilir.

**Yanlışlıkla yapıştırdıysanız (sohbete, PR'a, ekran görüntüsüne):**
1. Ajana hemen söyleyin: "Şu anahtarı yanlışlıkla yapıştırdım."
2. O anahtar **değiştirilmiş (döndürülmüş)** sayılır: sızmış kabul edin, silmek yetmez. Ajan rehberdeki sır döndürme adımlarını ([release-and-ota.md](release-and-ota.md) bölüm 4) size onaylatarak uygular.
3. Eski anahtarı ilgili konsoldan iptal edin.

## 5. Bir PR nasıl incelenir (teknik olmadan)

PR'ı GitHub'da açın (ajan bağlantıyı verir). Şunlara bakın:

1. **Başlık ve açıklama anlaşılıyor mu?** "Ne ve neden" sorusunun cevabı sizin istediğinizle uyuşuyor mu?
2. **Doğrulama bölümü:** ajan hangi komutları çalıştırdı, sonuçları ne? **"Çalıştırılmayanlar"** listesi boş bırakılmamalı ("yok" yazmalı).
3. **Yeşil tikler:** PR sayfasının altında kontroller (Checks) var. **"Testler (tam set)"** yeşil olmalı. Kırmızıysa birleştirmeyin; ajana "kırmızı kontrolü düzelt" deyin.
4. **Geri alma:** açıklamada "geri alma" satırı var mı? Veritabanı değişikliği varsa dört adımlı uygulama planı yazıyor mu?
5. **Değişen dosyalar** (Files changed): her satırı okumanız gerekmez ama şunlara dikkat edin: isteğiniz **dışında** bir şey değişmiş mi (tasarım, renk, metin, silinen bölümler)? Parola/anahtar benzeri uzun rastgele metin görüyor musunuz? Görüyorsanız birleştirmeyin, ajana sorun.
6. Emin değilseniz ajana şunu sorun: "Bu PR'ı bağımsız bir gözle incele: istenmeyen değişiklik, silinen şey, güvenlik riski var mı? Sadece raporla."

**Onay cümlesi (birleştirme):** "PR #NNN'i birleştir." Yalnız bu. Ajan birleştirir, web sitesi birkaç dakikada kendiliğinden yayınlanır ve ajan canlıda doğrular.
Bir PR'ı birleştirmek **veritabanını değiştirmez**; veritabanı ayrı bir onaydır.

## 6. Veritabanı değişikliğini (migration) onaylamak

Veritabanı değişikliği önce **staging** (deneme) veritabanında, sonra **production**'da (canlı) uygulanır. Dört adım vardır; ajan sizden *yalnız production uygulamadan önce* açık onay ister.

1. Ajan staging için **plan** çalıştırır ve staging'e uygular (canlıya dokunmaz).
2. Ajan production için **plan** çalıştırır. Plan, **"neleri uygulayacağım"** listesidir; hiçbir şeyi değiştirmez.
3. **Siz planı okursunuz.** Listede *yalnız beklediğiniz yeni dosya(lar)* var mı? Beklemediğiniz bir dosya varsa **onaylamayın**, ajana sorun.
4. Onay: **"Production migration'ı uygula."** Ajan uygular ve kontrol sorgularını çalıştırır (gizli değerlerin yerinde olması, zamanlanmış işlerin kurulu olması).

Bir adım kırmızı biterse ajan durur ve size söyler; kırmızı biten adım veritabanını yarım bırakmaz. Geri alma, "tersini yapan yeni bir migration" yazmaktır; dosyalar silinmez ya da düzenlenmez.

## 7. Bir şey bozulursa

**Önce sakin kalın ve şunları ayırın:** web mi, uygulama mı, bildirim/e-posta mı, ödeme mi?

1. **Hangi ekran, ne zaman başladı?** Not alın (kim, ne yaptı, saat). Ekran görüntüsü alın (parola/anahtar görünmesin).
2. **Ajana şunu yazın:** "Şu bozuk: … Sentry'ye, Supabase loglarına ve son birleşen PR'lara bak. Önce nedeni bul, hiçbir şeyi değiştirme."
3. **Sentry'ye bakın** (https://anahtar.sentry.io, EU): projeler `anahtar-web`, `anahtar-mobile`, `anahtar-edge`. "Issues" sayfasında en yeni ve en çok tekrar eden hatalar üstte görünür.
   Giriş, kayıt, davet ve ödeme ekranlarındaki hatalar **tek kişide bile acildir**.
4. **Karar:**
   - Bozulma son yayından sonra başladıysa → "Son PR'ı geri alan PR'ı hazırla" (web için). Birleştirdiğinizde site yeniden yayınlanır (yaklaşık 10-15 dk).
   - Yalnız uygulamanın JavaScript kısmındaysa → ajan **OTA geri alma** ya da düzeltme OTA'sı önerir ([release-and-ota.md](release-and-ota.md) bölüm 7).
   - Veritabanı kaynaklıysa → ajan **yeni, tersini yapan migration** hazırlar; onayınızla dört adımla uygulanır. Yedekten dönüş son çaredir ve sizinle birlikte karar verilir.
   - Ödeme sorunluysa → **ödemeyi geçici durdurma** (`billing_paused`) için ajan onayınızı ister; 5 dakika içinde etkili olur.
   - Bir gizli değer sızdıysa → bölüm 4.
5. **Kullanıcıya duyuru** gerekiyorsa metni ajan hazırlar; göndermeyi siz onaylarsınız (gerçek kullanıcıya hiçbir şey sizin açık onayınız olmadan gitmez).
6. Olay bitince ajandan **özet** isteyin: ne oldu, neden, nasıl düzeltildi, tekrar olmaması için ne eklendi ([günlük](diary/2026-11-13.md) örneği).

**Önemli bağlantılar:** hata izleme [Sentry](https://anahtar.sentry.io), kod ve PR'lar [GitHub](https://github.com/fahricankuz/keys), site https://anahtar.io, altyapı haritası [infrastructure.md](infrastructure.md) (hangi servis kimde, hangi hesap).

## 8. Sözlük

| Terim | Anlamı |
|---|---|
| **Ajan** | Kodu sizin adınıza yazan/çalıştıran yapay zekâ oturumu (Claude Code, Codex) |
| **Depo (repo)** | Kodun durduğu GitHub klasörü; burada herkese açıktır |
| **Dal (branch)** | Değişikliğin hazırlandığı ayrı kopya; ana dal `main`'dir |
| **PR (pull request)** | "Şu değişiklikleri `main`'e katmak istiyorum" önerisi; inceleme ve testler burada yapılır |
| **Birleştirme (merge)** | PR'ı `main`'e katmak; web sitesi bundan sonra yayınlanır |
| **CI / Actions** | GitHub'daki otomatik test ve yayın hattı; PR'ın altındaki yeşil/kırmızı tikler |
| **Commit** | Bir değişiklik paketi (kayıt noktası) |
| **Geri alma (revert/rollback)** | Bir değişikliği tersine çevirmek; genelde yeni bir PR/migration olarak |
| **Migration** | Veritabanında yapılan değişikliğin dosya olarak yazılmış hâli; sırayla ve bir kez uygulanır |
| **Staging / Production** | Deneme veritabanı / canlı (gerçek kullanıcıların) veritabanı |
| **Supabase** | Veritabanı, giriş, dosya depolama ve sunucu fonksiyonlarının durduğu servis |
| **Edge Function** | Supabase'te çalışan küçük sunucu programları (ödeme, e-posta, bildirim gibi) |
| **RLS (satır düzeyi güvenlik)** | Veritabanında "kim hangi satırı görebilir/yazabilir" kuralı; verinin asıl koruması |
| **Vault** | Supabase'in gizli değer kasası; zamanlanmış işler ve webhook'lar şifreleri buradan okur |
| **Gizli değer (secret)** | Parola, anahtar, jeton; yalnız adı yazılır, değeri hiçbir yere yazılmaz |
| **Döndürme (rotation)** | Gizli değeri yenisiyle değiştirmek, eskiyi iptal etmek |
| **Webhook / cron** | Bir olay olunca otomatik çağrı / zamanlanmış otomatik iş |
| **EAS** | Expo'nun uygulama derleme ve gönderme hizmeti |
| **Derleme (build)** | Kodun iPhone/Android uygulama dosyasına dönüştürülmesi |
| **TestFlight** | Apple'ın test dağıtımı; **Ekip** (iç) ve **Dış test** (dış) grupları vardır |
| **OTA (anlık güncelleme)** | Mağaza sürümü beklemeden telefondaki uygulamanın JavaScript kısmını güncellemek; yalnız arayüz/mantık değişir |
| **Mağaza incelemesi** | Apple/Google'ın uygulamayı onaylaması; onaydan sonra yayın **elle** yapılır |
| **Sandbox** | Gerçek para çekilmeyen mağaza test satın alması |
| **RevenueCat** | Apple ve Google aboneliklerini tek yerde toplayan servis |
| **Sentry** | Hata ve çökme izleme servisi (AB bölgesinde) |
| **Universal link** | `anahtar.io/katil…` gibi bağlantıların doğrudan uygulamayı açması |
| **KVKK** | Kişisel verilerin korunması kanunu; loglara kişisel veri yazılmaz |

## 9. Hızlı kontrol listesi

- [ ] İsteğimde ne, neden, nerede ve "bitti" tanımı var.
- [ ] Sınır koydum ("sadece oku", "birleştirme", "gerçek kullanıcıya gönderme").
- [ ] Hiçbir parola/anahtar/jeton yapıştırmadım.
- [ ] PR'ın "Doğrulama" ve "Çalıştırılmayanlar" bölümlerini okudum; "Testler (tam set)" yeşil.
- [ ] Veritabanı için production planını gördüm ve açıkça onayladım.
- [ ] Birleştirme, derleme, mağaza, OTA onaylarını **adıyla** verdim.
- [ ] Canlıya çıkınca ajandan Sentry kontrolünü ve özet raporu istedim.
