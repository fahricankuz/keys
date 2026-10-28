# Kurumsal yol planı (site, AVM, GYO, depo)

Bugün mülk sahibi (1 ve 5 mülk), kiracı, emlak ofisi ve family office anahtar'ı olduğu gibi kullanabilir.
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
- [ ] **Faz 1 — Tahakkuk kalemleri.** Kira ve aidat ayrı izlenir; aidat birim bazında isteğe bağlı; mevcut ödemeler "kira" kalemi olarak taşınır.
- [ ] **Faz 2 — Site yönetimi.** Blok/daire hiyerarşisi, malik ve sakin rolleri, toplu aidat tahakkuku, gider dağıtımı
      (eşit, m², arsa payı), borçlu listesi ve gecikme tazminatı, duyurular, yönetim kurulu raporu; sakin–kiracı bağlantısı ve birleşik "Evim".
- [ ] **Faz 3 — AVM ve depo.** Ciroya bağlı kira ve ciro bildirimi, ortak alan gideri dağıtımı, m² ve döviz/endeks bazlı kira, doluluk.
- [ ] **Faz 4 — GYO.** Çok portföy, onay akışı, değerleme ve doluluk panosu, yatırımcı raporu, API — ilk GYO müşterisiyle birlikte.

## Yetkiler ve modüller

Yetkiler: kurum bilgileri, yönetici ekleme, birim yönetimi, sakin ve kiracılar, tahakkuk, dekont onayı, giderler, talepler,
duyurular, belgeler, raporlar. Master her şeyi yapar; rolleri yalnızca master düzenler.

Hazır roller (kurum açılınca): sitede *Muhasebe, Teknik ekip, Güvenlik ve resepsiyon, Yönetim kurulu*; diğer sektörlerde
*Muhasebe ve finans, Operasyon ve teknik, Kiracı ilişkileri, Salt okunur*.

Sektörün varsayılan modülleri: site → aidat, gider dağıtımı, duyuru, rapor · AVM → kira, ortak gider, ciro kira, doluluk, rapor ·
depo → kira, ortak gider, endeksleme, rapor · GYO → kira, ortak gider, doluluk, onay akışı, rapor, API · diğerleri → kira, rapor.
"Yol planında" işaretli modüller kuruma şimdiden atanabilir; geliştirildikçe kendiliğinden açılır.

## Canlıya alırken

- Supabase SQL Editor'de `supabase/schema.sql`'i yeniden çalıştırın (16. bölüm eklenir; tekrar çalıştırmak güvenlidir).
- Yeni kurum: yönetici paneli → Talepler → kurumsal başvuru → **Kuruma çevir** (ya da Kurumlar → Yeni kurum) → **Master belirle**.
  Master'ın hesabı yoksa davet bağlantısı (`anahtar.io/katil?kod=K…`) gönderilir; kişi ücretsiz hesap açınca master olur.
