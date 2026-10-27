# Gerçek hesaplarla yayına alma

Uygulama, `assets/js/config.js` boşken **demo modunda** çalışır: hesap yok,
veriler yalnızca o tarayıcıda. Bu kılavuz, e-posta ve şifreyle giriş yapılan,
kiracı ile mülk sahibinin kendi cihazlarından aynı veriyi gördüğü gerçek sürümü
kurmak içindir.

Gerekenler: bir [Supabase](https://supabase.com) hesabı (ücretsiz katman
başlangıç için yeterli), bu GitHub deposu, bilgisayarında Node.js (yalnızca
bildirim anahtarı üretmek ve fonksiyonu yüklemek için).

Toplam süre: yaklaşık 30–45 dakika.

---

## 1. Supabase projesi

1. supabase.com → **New project**.
2. Bölge olarak **Central EU (Frankfurt)** seç (Türkiye'ye en yakın).
3. Veritabanı şifresini güvenli bir yere kaydet.

## 2. Veritabanı

1. Sol menü → **Database → Extensions** → `pg_cron`'u etkinleştir
   (günlük kira hatırlatmaları için).
2. **SQL Editor → New query** → `supabase/schema.sql` dosyasının tamamını
   yapıştır → **Run**.

Dosya tekrar çalıştırılabilir; şemayı güncellediğinde aynı adımı yinele.

Bu adım şunları kurar:

- tablolar ve her evin verisini yalnızca o evin üyelerine açan güvenlik kuralları,
- kiracının ödeme onaylaması, masraf değiştirmesi ya da karşı tarafın onayını
  vermesi gibi yetkisiz işlemleri sunucuda reddeden tetikleyiciler,
- dekont, talep, mesaj, yenileme ve çıkış olaylarında otomatik bildirimler,
- her sabah 09:00'da (İstanbul) çalışan hatırlatmalar,
- özel (herkese kapalı) dosya deposu.

Kuralların tamamı `tests/sql.spec.mjs` içinde gerçek bir Postgres'e karşı test edilir.

## 3. Giriş ayarları

**Authentication → URL Configuration**

- **Site URL**: uygulamanın yayın adresi, `https://kiracim.online/`
- **Redirect URLs**: aynı adresi ekle. Yerelde deneyeceksen `http://localhost:8000/` da ekle.

**Authentication → Providers → Email**

- *Confirm email* açık kalsın: kayıttan sonra kullanıcıya doğrulama bağlantısı gider.

İsteğe bağlı olarak **Authentication → Email Templates** altındaki e-postaları
Türkçeleştirebilirsin.

## 4. Uygulamayı bağla

**Project Settings → API** sayfasından iki değeri al ve
`assets/js/config.js` içine yaz:

```js
supabaseUrl: 'https://xxxxxxxx.supabase.co',
supabaseAnonKey: 'eyJhbGciOi...',
```

> `anon` anahtarı herkese açık olacak şekilde tasarlanmıştır; güvenliği
> veritabanı kuralları sağlar. **`service_role` anahtarını asla bu dosyaya ya
> da depoya yazma.**

Commit edip push'la. Artık uygulama açılışta giriş ekranını gösterir. Adrese
`?demo` eklersen (ör. `.../project_evim/?demo#/kiraci`) demo yine açılır.

## 5. Anlık bildirimler (telefona)

Uygulama kapalıyken de bildirim gitmesi için.

### 5.1 Anahtar üret

```bash
npx web-push generate-vapid-keys
```

- **Public Key** → `assets/js/config.js` içindeki `vapidPublicKey`.
- **Private Key** → bir sonraki adımda gizli değişken olarak.

### 5.2 Fonksiyonu yükle

[Supabase CLI](https://supabase.com/docs/guides/cli) ile:

```bash
npx supabase login
npx supabase link --project-ref PROJE_KIMLIGI

npx supabase secrets set \
  VAPID_PUBLIC_KEY="..." \
  VAPID_PRIVATE_KEY="..." \
  VAPID_SUBJECT="mailto:senin@adresin.com" \
  WEBHOOK_SECRET="uzun-rastgele-bir-deger" \
  APP_URL="https://kiracim.online/"

npx supabase functions deploy push --no-verify-jwt
```

`--no-verify-jwt` gerekli, çünkü fonksiyonu veritabanı çağırır. Yetkisiz
çağrılar `WEBHOOK_SECRET` başlığıyla engellenir.

### 5.3 Veritabanını fonksiyona bağla

**Database → Webhooks → Create a new hook**

| Alan | Değer |
| --- | --- |
| Table | `notifications` |
| Events | `Insert` |
| Type | Supabase Edge Functions → `push` |
| HTTP Headers | `x-evim-secret`: 5.2'deki `WEBHOOK_SECRET` |

### 5.4 Dene

Uygulamada **Hesap → Anlık bildirimleri aç**. Başka bir hesaptan mesaj
gönderince bildirim gelmeli.

- **Android / masaüstü Chrome, Edge, Firefox**: doğrudan çalışır.
- **iPhone (iOS 16.4+), web sürümü**: önce Safari'de **Paylaş → Ana Ekrana
  Ekle**, sonra uygulamayı ana ekrandan açıp bildirimleri aç. Apple, ana ekrana
  eklenmemiş sitelere bildirim izni vermiyor.
- **Mağaza uygulaması (iOS/Android)**: APNs ve Firebase anahtarları gerekir;
  bkz. [mobil.md → Anlık bildirimler](mobil.md#4-anlık-bildirimler).

### 5.5 E-posta bildirimleri (isteğe bağlı)

[Resend](https://resend.com) hesabı açıp alan adını doğrula, sonra:

```bash
npx supabase secrets set RESEND_API_KEY="re_..." EMAIL_FROM="Kiracım <bildirim@alanadin.com>"
```

Kullanıcılar **Hesap → E-posta ile de bildir** seçeneğiyle açar.

## 6. Abonelik

Mülk sahipleri abonelikle kullanır; kiracılar ücretsizdir. Mağaza ve
RevenueCat kurulumu ile `billing` fonksiyonu için: [abonelik.md](abonelik.md).
Abonelik kurulmadan da uygulama çalışır: her mülk sahibi 1 aylık (30 gün) denemeyle
başlar.

## 7. GitHub Pages ve kiracim.online

1. Depo → **Settings → Pages → Source: GitHub Actions**.
2. Alan adını aldığın firmanın DNS panelinde şu kayıtları ekle:

| Tür | Ad | Değer |
| --- | --- | --- |
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| AAAA | `@` | `2606:50c0:8000::153` |
| AAAA | `@` | `2606:50c0:8001::153` |
| AAAA | `@` | `2606:50c0:8002::153` |
| AAAA | `@` | `2606:50c0:8003::153` |
| CNAME | `www` | `fahricankuz.github.io` |

3. Settings → Pages → **Custom domain**: `kiracim.online` → Save. DNS yayılınca
   (birkaç dakika–birkaç saat) **Enforce HTTPS** kutusunu işaretle.
4. Güvenlik için alan adını GitHub hesabına da doğrula: profil → Settings →
   Pages → *Add a domain* (verilen TXT kaydını DNS'e ekle). Bu, başkasının
   alan adını kendi sitesine bağlamasını engeller.

Bundan sonra varsayılan dala her gönderimde site `https://kiracim.online/`
adresinde güncellenir. Telefon uygulamasının bağlantıları da bu alan adıyla
çalışır: [mobil.md](mobil.md#3-bağlantıların-uygulamayı-açması).

## Uygulama (React Native) ve yönetici paneli

`app/` klasöründeki uygulama aynı Supabase projesini kullanır. Derleme sırasında
iki değişken verilir (`anon` anahtarı herkese açıktır; `service_role` anahtarını
hiçbir yere yazma):

```bash
cd app
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co \
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi... \
npx expo export -p web
```

Değişkenler boşsa uygulama yerel hesap moduyla açılır (veri yalnızca o cihazda).

### Yönetici (denetçi) hesabı

1. `supabase/schema.sql` dosyasını yukarıdaki gibi yeniden çalıştır (tekrar
   çalıştırılabilir; `admins`, `reviews`, `bans` ve `admin_audit` tablolarını, denetim ve
   yasaklama kurallarını, mevcut yüklemeler için "onaylı" kayıtları ekler).
2. Uygulamadan normal bir hesap aç (kiracı olarak kayıt olman yeterli).
3. **SQL Editor**'de kendi e-postanı yönetici yap:

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'senin@epostan.com';
```

4. Bu hesapla giriş yapınca `/admin` açılır; yönetici hesapları ev verisi yüklemez.
   Yöneticiyi kaldırmak için `delete from public.admins where user_id = '…'`.

### Yönetici panelinde ne var

Yalnızca `admins` tablosundaki hesap açabilir; başka hesap `/admin` adresinde hiçbir veri görmez
(sunucu kuralları veri vermez, ekran yalnızca gösterir).

- **Denetim**: kiracı dekontları, her iki tarafın belgeleri ve mülk sahibinin
  faturaları. Önizleme, **Onayla** ya da gerekçeyle **Reddet**.
- **Ödemeler**: kim kime, hangi mülk ve ay için, ne kadar ödemiş; durum ve denetim durumu.
- **Bağlantılar**: mülk sahibi → mülkler → kiracılar (bekleyen davetler dahil), abonelik durumu.
  Kayıt olup davet kodunu girmemiş ("mülke bağlı olmayan") kiracılar ayrıca listelenir.
- **Mesajlar**: mesajlaşması olan her mülk; bir yazışmayı aç, mesajları ve fotoğrafları oku,
  uygunsuz mesajı sil, göndereni oradan yasakla.
- **Kullanıcılar**: tüm hesaplar; ara, role ya da "askıda" durumuna göre süz, **Yasakla / Yasağı kaldır**.
- **Kayıt**: yöneticinin yaptığı hassas işlemler (yasaklama, yazışma okuma, mesaj silme, yükleme kararı).
  Kayıt değiştirilemez ve silinemez; yönetici bile dokunamaz.

#### Yasaklama nasıl çalışır

Gerekçe zorunludur ve kullanıcıya gösterilir. Yasaklanan hesap:

1. Hiçbir tabloyu okuyamaz ya da yazamaz (veritabanı kuralı), dosyalarına erişemez, davete katılamaz.
2. Supabase Auth'ta girişi kapanır (`banned_until`) ve açık oturumları silinir.
3. Giriş denerse "Hesabın askıya alındı: <gerekçe>" görür.

Yönetici kendini ya da başka bir yöneticiyi yasaklayamaz. Yasak kaldırılınca her şey geri gelir.
Yasaklı hesabın eski mesajları ve verisi silinmez; karşı taraf görmeye devam eder.

#### Gizlilik ve KVKK (önemli)

Yöneticinin yazışmaları okuyabilmesi kullanıcıların kişisel verisine erişimdir. Bunun yasal
dayanağı **Gizlilik ve KVKK Aydınlatma Metni**'nde açıkça yazılı olmalıdır (ör. "hizmet güvenliği,
kötüye kullanımın önlenmesi ve şikâyet incelemesi için yazışmalar yetkili yönetici tarafından
incelenebilir; her inceleme kayıt altına alınır"). Sitedeki gizlilik sayfasına bu cümleyi ekleyin;
gerekirse bir hukukçuya danışın. Panelde her yazışma açılışı Kayıt sekmesine düşer; amaç dışı
bakmamak ve yalnızca şikâyet/güvenlik gerektiğinde okumak sizin sorumluluğunuzdadır.

### Yüklemeler onaylanana kadar karşı tarafa görünmez

| Yükleyen | Onaydan önce kim görür | Reddedilince |
| --- | --- | --- |
| Kiracı dekontu | Yalnızca kiracı ve yönetici. Mülk sahibi göremez, bildirim de gitmez. | Ödeme "reddedildi"ye döner, gerekçe kiracıya gösterilir; kiracı yeniden yükler. |
| Belge (iki taraf) | Yükleyen ve yönetici | Yükleyene bildirim ve gerekçe |
| Mülk sahibi faturası | Mülk sahibi ve yönetici (dosya kiracıdan kilitli) | Mülk sahibine bildirim ve gerekçe |

Onaylanınca karşı tarafa bildirim gider. Dosyanın kendisi depoda da kilitlidir
(imzalı adres alınamaz). Sınırlar: faturanın tutar ve tarih bilgisi talep
satırında durduğu için kiracı bunu görebilir, yalnızca dosya kilitlidir;
mülk sahibi, yönetici onaylayana kadar kiracının ödemesini "henüz yapılmadı"
gibi görür. Yönetici bu kuralları aşan bir işlem yapamaz; kararı yalnızca
yönetici verebilir (`tests/admin.sql.spec.mjs`).

---

## Yayına alma (GitHub Pages, otomatik güncellenen)

`.github/workflows/pages.yml` uygulamayı (`app/`) her push'ta derler ve yayınlar. Bir kez yapılacaklar:

1. **Supabase**: yukarıdaki 1-3. bölümleri yap. *Project Settings → API* sayfasından **Project URL** ve **anon public** anahtarını kopyala (`service_role` anahtarını hiçbir yere yazma).
2. **GitHub → Settings → Secrets and variables → Actions → Variables** altına iki değişken ekle:
   - `SUPABASE_URL` = Project URL
   - `SUPABASE_ANON_KEY` = anon public anahtar
   - (isteğe bağlı) `CUSTOM_DOMAIN` = `kiracim.online`
3. **GitHub → Settings → Pages → Source: "GitHub Actions"** seç.
4. Değişiklikler **varsayılan dala** birleşince site yayınlanır (Actions sekmesinde "GitHub Pages" çalışması yeşil olur). Adres: `https://<kullanıcı>.github.io/project_evim/` ya da `CUSTOM_DOMAIN` verdiysen o alan adı.
5. Supabase **Authentication → URL Configuration** altına bu adresi **Site URL** ve **Redirect URL** olarak ekle.
6. Uygulamadan bir hesap aç, sonra yukarıdaki SQL ile kendini yönetici yap.

Bundan sonra varsayılan dala her birleşmede site kendiliğinden güncellenir. Değişkenler boşsa site yerel hesap moduyla yayınlanır (veri yalnızca o tarayıcıda).

---

## 8. Kontrol listesi

- [ ] İki farklı tarayıcıda (ya da biri gizli pencerede) bir mülk sahibi, bir kiracı hesabı aç.
- [ ] Mülk sahibi mülk ekler; açılan davet bağlantısını kiracıya gönderir.
- [ ] Kiracı bağlantıyla kaydolur ve mülke bağlanır.
- [ ] Kiracı dekont yükler; **yönetici onaylayana kadar** mülk sahibi görmez, kiracı "İncelemede" etiketini görür.
- [ ] Yönetici panelinde (`/admin`) dekontu onaylar; mülk sahibinin ekranında görünür ve bildirim düşer.
- [ ] Yönetici bir dekontu gerekçeyle reddeder; kiracı gerekçeyi görür ve yeniden yükleyebilir.
- [ ] Mülk sahibi ödemeyi onaylar; kiracıya bildirim düşer.
- [ ] Telefondan ana ekrana ekle, uygulamayı kapatıp mesaj gönder: bildirim gelmeli.

---

## Bilmen gerekenler

**Ücretsiz katman.** 500 MB veritabanı, 1 GB dosya, aylık 50.000 aktif
kullanıcı. Ücretsiz projeler bir hafta hiç kullanılmazsa duraklatılır;
gerçek kullanımda Pro plana geçmek gerekir.

**KVKK.** Kayıt ekranı kişisel verilerin işlenmesi, karşı tarafla paylaşılması
ve yurt dışında saklanması için açık rıza alır. Kullanıcı hesabını ve sahibi
olduğu evlerin verisini uygulamadan silebilir. Yayına almadan önce aydınlatma
metnini ve rıza ifadesini bir hukukçuya kontrol ettir.

**Yıllık güncellemeler.**
- `assets/js/tax.js`: yeni yılın istisna tutarı ve gelir vergisi tarifesi.
- `sw.js`: dosya değişikliklerinden sonra `CACHE` sürümünü artır; kullanıcılara
  "Yeni sürüm hazır" bildirimi gider.

**Testler.** `npm install && npx playwright install chromium && npm test`.
Veritabanı kuralları PGlite (WASM Postgres) ile, istemci akışları sahte bir
Supabase ile test edilir; gerçek Supabase gerekmez.

## Hostinger'a kurulum

Hostinger paketi, Git ile otomatik dağıtım ve kontrol listesi için `docs/hostinger.md` dosyasına bakın.

## Güvenlik (WAF ve alan adı koruması)

Cloudflare WAF, alan adı kilidi/DNSSEC/DMARC ve Supabase bot koruması adımları için `docs/guvenlik.md` dosyasına bakın.
