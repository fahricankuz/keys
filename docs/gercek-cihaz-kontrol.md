# Gerçek cihaz kontrol listesi (yayın öncesi, ~10 dakika)

Otomatik testler gerçek telefonu, gerçek Safari'yi ve gerçek Supabase'i taklit eder; bu liste o boşluğu kapatır.
Her yayından önce (özellikle mesajlaşma, fotoğraf, bildirim ya da ödeme değiştiyse) iki cihazla yap:
**iPhone (Safari)** ve **Android (Chrome)**. İki hesap gerekir: bir mülk sahibi, bir kiracı (iki ayrı cihaz ya da biri bilgisayar).

Önce: Hostinger'da Deploy/Pull yapıldı, telefonda site verisi silinip sayfa yenilendi (Safari: Ayarlar → Safari → Gelişmiş → Web Sitesi Verileri → anahtar.io sil).

## 1. Giriş ve açılış
- [ ] Giriş yapılıyor, panel açılıyor
- [ ] Sayfa yenilenince oturum kalıyor
- [ ] Şifre sıfırlama e-postası geliyor, bağlantı "yeni şifre" sayfasını açıyor

## 2. Mesajlaşma (iki cihaz yan yana)
- [ ] Sohbet **son mesajdan** açılıyor
- [ ] Bir taraf yazınca diğerinde **yenilemeden** düşüyor (en geç 5 sn)
- [ ] Mesaj kutusu altta sabit, liste kayıyor; yukarı kaydırınca eski mesajlar kendiliğinden yükleniyor
- [ ] Yukarıdayken gelen mesajda "↓ yeni mesaj" düğmesi çıkıyor
- [ ] Sohbetin üstünde "Canlı" rozeti görünüyor (görünmüyorsa Realtime ayarını kontrol et)

## 3. Fotoğraf
- [ ] Kamerayla çekilen büyük fotoğraf seçilince küçük resim ve yeşil **tik** çıkıyor
- [ ] Gönder'e basınca karşı tarafta fotoğraf görünüyor
- [ ] Ekran görüntüsü de gönderiliyor
- [ ] Bozuk/desteklenmeyen dosyada "Fotoğraf işlenemedi" uyarısı çıkıyor

## 4. Bildirim
- [ ] Uygulama açıkken karşı taraftan mesaj gelince zil/toast anında güncelleniyor
- [ ] (Web Push kuruluysa) uygulama kapalıyken telefona bildirim geliyor, dokununca ilgili ekran açılıyor

## 5. Talep ve ödeme
- [ ] Kiracı talep açıyor, mülk sahibinde bildirim düşüyor
- [ ] Kiracı teklif/fatura ekleyebiliyor, "Mülk sahibiyle iletişime geç" mesajlara götürüyor
- [ ] Dekont yükleniyor, mülk sahibi onaylıyor

## 6. Görünüm
- [ ] Ekran yatay/dikey döndürülünce düzen bozulmuyor
- [ ] Koyu temada metinler okunuyor
- [ ] Klavye açılınca mesaj kutusu klavyenin üstünde kalıyor

Bir madde kırmızıysa yayını durdur; cihazı, tarayıcı sürümünü ve ekran görüntüsünü not al.
