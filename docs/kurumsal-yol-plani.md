# Kurumsal yol planı (site, AVM, GYO, depo)

Bugün mülk sahibi (1 ve 5 mülk), kiracı, emlak ofisi ve aile ofisi anahtar'ı olduğu gibi kullanabilir.
Site ve bina yönetimi, AVM, GYO ve depo/lojistik için paneller sektöre göre ayrışacak. Ayrı uygulama yazılmaz:
tek uygulama üç esnek nokta üzerine kurulur.

1. **Kurum ve sektör profili** — kurumsal müşteri bir *kurum*dur: sektörü, açık modülleri, sözleşmesi, master yöneticisi
   ve yetkileri düzenlenebilir rolleri vardır. Bireysel kullanıcılar kurum kullanmaz.
2. **Tahakkuk kalemleri** — "kira" tek kavram olmaktan çıkar; her birimin ayda birden çok kalemi olur (kira, aidat,
   ortak alan gideri, ciroya bağlı kira, yakıt…). Bir dekont bir veya birkaç kalemi kapatır. Yapı ileride sanal POS'a hazır kurulur.
3. **Birim hiyerarşisi** — bugünkü "mülk" kaydı *birim* olarak kalır (ödeme, talep, belge, davet bozulmaz); isteğe bağlı üst
   kayıt eklenir: Site › Blok › Daire, AVM › Kat › Mağaza, Lokasyon › Depo, Portföy › Bina › Birim.

Ekranlar sektörün diliyle konuşur (sitede *aidat*, *sakin*, *daire*; AVM'de *mağaza*), menü ve ana ekran kurumun modüllerinden kurulur.

## Kararlar (Ekim 2026)

- Öncelik **site yönetimi**.
- Bir kişi tek hesapla birden çok rol taşır: aynı kişi sitede **sakin**, ev sahibinin mülkünde **kiracı** olabilir. "Evim"
  ekranında kira (ev sahibine) ve aidat (yönetime) ayrı kartlar olarak görünür. Site yönetimi kira bilgisini görmez.
- Site ve ev sahibi kayıtları aynı daire için ayrı tutulur; ev sahibi mülkünü sitedeki daireye bağlar (site onayıyla).
- Aidatı varsayılan olarak **kiracı öder**; kiracı ödemiyorsa site yönetimine talep açarak değiştirilmesini ister.
- Ev sahibi kendi dairesinin aidat durumunu (ödendi / gecikmede) **kendiliğinden görür**.
- Kurumda **bir master yönetici** vardır; diğer yöneticiler rol kategorilerine ayrılır, rollerin yetkileri master tarafından düzenlenir.
- Tahsilat **dekont onayıyla** sürer; sanal POS / banka entegrasyonu ileride (lisanslı ödeme kuruluşunun pazaryeri modeli,
  hizmet bedeli ve ücretsiz havale seçeneği — hukuki görüş alınarak).

## Fazlar

- [x] **Faz 0 — Kurum altyapısı.** Kurum kaydı (sektör, modüller, sözleşme, fatura bilgisi), master yönetici, düzenlenebilir
      roller ve yetkiler, kurum davet kodları (`K…`), yönetici paneli → **Kurumlar** (kurumsal başvurudan "Kuruma çevir",
      master atama, askıya alma), uygulamada **Kurum** ekranı. Etkin kurumun yöneticisi kurumun sözleşmesiyle erişir.
      Şema: `supabase/schema.sql` 16. bölüm · istemci: `app/src/domain/org.js`, `app/src/app-ui/org.tsx`, `app/src/app-ui/admin-orgs.tsx`.
- [x] **Faz 1 — Tahakkuk kalemleri.** `payments` tablosuna kalem türü (`kind`: kira | aidat), ay tahakkuku (`due`) ve ödeme yolu
      (`method`: dekont | havale | nakit | pos) eklendi; anahtar `(property_id, month, kind)`. Mevcut ödemeler kendiliğinden "kira" sayılır.
      Aidat mülkte tanımlıysa (tutar > 0) Ödemeler ekranında ayrı kartta izlenir: aidatı kiracı ödüyorsa kiracı dekont yükler, anahtar ekibi
      denetler, mülk sahibi onaylar; mülk sahibi ödüyorsa kendisi kaydeder (dekont isteğe bağlı). Kira hatırlatmaları, tahsilat özetleri ve
      raporlar yalnız kirayı sayar. Denetim anahtarı kira için ay, aidat için `aidat:ay` (`pay_ref`).
- [x] **Faz 2 — Site yönetimi.** Şema 17. bölüm: `site_units` (blok, no, m², arsa payı, aylık aidat, aidatı kimin ödediği),
      `site_residents` (malik / kiracı, davet kodu `S…`), `site_charges` (aidat, yakıt, demirbaş, özel toplama; dekont → yönetim onayı),
      `site_expenses`, `site_announcements`, `site_requests`. Uygulamada yönetim için **Site** ekranı (özet ve borçlular, daireler ve
      toplu ekleme, toplu tahakkuk: dairenin aidatı / sabit / eşit / m² / arsa payı, giderler ve "Dairelere dağıt", duyurular, talepler),
      malik ve kiracı için **Sitem** ekranı (tahakkuklar, dekont yükleme, duyurular, yönetime talep). Malik dairesinin tahakkuklarını
      kendiliğinden görür; aidatı varsayılan olarak kiracı öder, kiracı "Aidat" talebiyle yönetime bildirir. Gecikme tazminatı
      (KMK md. 20, aylık %5) borçlular listesinde bilgi amaçlı gösterilir, tahakkuk edilmez.
      **Tamamlayıcılar (18. bölüm):**
      - *Mülk–daire bağı:* dairenin maliki olarak kayıtlı ev sahibi, anahtar'daki mülkünü daireye bağlar (`link_site_unit`).
        Bağlı mülkün kiracısı dairenin kiracısı sayılır (`site_links`): kiracının Ödemeler ekranında kira kartının altında site aidatı
        görünür ve oradan ödenir; duyuruları alır, talep açar. Yönetim bu kiracıları "ev sahibi üzerinden bağlı" olarak görür.
      - *Aidat hatırlatmaları:* `site_reminders` her gün (pg_cron `anahtar-site-reminders`) ödeyene ay sonundan 3 gün önce, ay sonunda,
        5 ve 15 gün sonra bildirim yazar; push fonksiyonu e-posta ve SMS'e de taşır. Ayarlar → Bildirimler'den kapatılır.
      - *İşletme projesi:* `site_budgets` (yıllık kalemler, paylaştırma: arsa payı / m² / eşit, kurul onay tarihi). Dairelerin aylık
        payı hesaplanır, "Daire aidatlarını güncelle" ile dairelere yazılır; malik ve kiracılar Sitem'de görür.
      - *Yönetim kurulu raporu:* Site → Rapor (aylık/yıllık; tahakkuk ve tahsilat, giderler, bütçe karşılaştırması, borçlular, talepler;
        yazdır/PDF) ve `report` fonksiyonuyla aynı zamanlamada "Raporlar" yetkili yöneticilere e-posta (`site_report`).
- [x] **Faz 3 — AVM, depo ve GYO (ticari portföy).** Şema 19. bölüm. Site ekranı ticari kurumlarda "Portföy yönetimi" olarak açılır
      (sözcükler sektöre göre: mağaza, depo, birim). Birim sözleşmesi: aylık kira ve para birimi (TL/USD/EUR), ciro kirası oranı,
      başlangıç/bitiş, yıllık artış (TÜFE 12 aylık ortalama / sabit oran / yok), KDV ya da stopaj, ödeme günü, ortak gider avansı.
      Tahakkuk türleri kira, ortak alan gideri, ciro farkı, özel toplama; kira tahakkukunda döviz kuru girilir (asıl tutar ve kur
      saklanır), vade sözleşmedeki ödeme günü. Ciro: kiracı "Mağazam" ekranından aylık ciroyu bildirir, yönetim onaylayınca cironun
      %'si sabit kirayı aşarsa fark o ayın "ciro farkı" tahakkuku olur. Kira artışları: yıldönümü gelen sözleşmeler önerilen tutarla
      listelenir, uygulanınca `site_rent_changes`'e yazılır. Özet: doluluk (birim ve m²), 90 günde biten sözleşmeler, boş birimler,
      kira ağırlıklı kalan süre (WALT). Giderler m²'ye göre ortak alan gideri olarak dağıtılır. Hatırlatma, rapor e-postası ve bildirimler
      ticari kurumlarda da çalışır.
- [ ] **Faz 4 — GYO'ya özel.** (Temel portföy ekranı Faz 3'te GYO'ya da açıldı.) Çok portföy, onay akışı, değerleme ve doluluk panosu, yatırımcı raporu, API — ilk GYO müşterisiyle birlikte.

## Yetkiler ve modüller

Yetkiler: kurum bilgileri, yönetici ekleme, birim yönetimi, sakin ve kiracılar, tahakkuk, dekont onayı, giderler, talepler,
duyurular, belgeler, raporlar. Master her şeyi yapar; rolleri yalnızca master düzenler.

Hazır roller (kurum açılınca): sitede *Muhasebe, Teknik ekip, Güvenlik ve resepsiyon, Yönetim kurulu*; diğer sektörlerde
*Muhasebe ve finans, Operasyon ve teknik, Kiracı ilişkileri, Salt okunur*.

Sektörün varsayılan modülleri: site → aidat, gider dağıtımı, duyuru, rapor · AVM → kira, ortak gider, ciro kira, doluluk, rapor ·
depo → kira, ortak gider, endeksleme, rapor · GYO → kira, ortak gider, doluluk, onay akışı, rapor, API · diğerleri → kira, rapor.
"Yol planında" işaretli modüller kuruma şimdiden atanabilir; geliştirildikçe kendiliğinden açılır.

## Canlıya alırken

- Supabase SQL Editor'de `supabase/schema.sql`'i yeniden çalıştırın (16. bölüm ve ödeme kalemleri eklenir; tekrar çalıştırmak güvenlidir).
  **Sıra:** önce site yeni sürümle yayına girsin, sonra şema çalıştırılsın. Ödeme anahtarı değiştiği için açık kalmış eski sekmeler
  sayfa yenilenene kadar ödeme kaydedemez.
- Yeni kurum: yönetici paneli → Talepler → kurumsal başvuru → **Kuruma çevir** (ya da Kurumlar → Yeni kurum) → **Master belirle**.
  Master'ın hesabı yoksa davet bağlantısı (`anahtar.io/katil?kod=K…`) gönderilir; kişi ücretsiz hesap açınca master olur.
