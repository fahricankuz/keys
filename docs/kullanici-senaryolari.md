# Kullanıcı senaryoları

`tests/senaryolar.app.spec.mjs` bu senaryoları sahte sunucuyla gerçek tarayıcıda çalıştırır (`npx playwright test tests/senaryolar`).
Gerçek Supabase, e-posta, ödeme ve telefon uygulaması bu sette sınanmaz.

| Kod | Kim | Senaryo | Beklenen |
| --- | --- | --- | --- |
| Z1 | Ziyaretçi | 11 herkese açık sayfayı açar | Başlık var, hata ekranı ve konsol hatası yok |
| Z2 | Ziyaretçi | Olmayan adrese gider | Anlaşılır sayfa, dönüş bağlantısı |
| Z3 | Ziyaretçi | Yanlış belge kodu girer | "Bulunamadı" denir |
| Z4 | Ziyaretçi | Var olmayan mülk veya site davet koduyla gelir | "Davet bulunamadı", hesap açma yönlendirmesi yok, kod saklanmaz |
| Z4 | Ziyaretçi | Kullanılmış davetle gelir | Uyarı görür |
| Z4 | Ziyaretçi | Sunucuya ulaşılamazken davetle gelir | Davet sayfası kalır, kod silinmez |
| Z5 | Ziyaretçi | Hesaplayıcıya harf, negatif, dev sayı yazar | NaN, sonsuz görünmez |
| K1-K5 | Yeni kişi | Uyuşmayan veya kısa şifre, geçersiz e-posta, onaysız kayıt, kullanılan e-posta | Hesap açılmaz |
| K6 | Yeni kişi | Düğmeye çift tıklar | Tek hesap açılır |
| K7 | Üye | Oturum açıkken giriş sayfasına gider | Form yerine "Panele git" |
| K8 | Üye | Çıkış yapar, panel adresine döner | Girişe yönlenir, veri görünmez |
| T1-T3 | Kiracı | Emoji ve Türkçe karakterli, boş, çok uzun mesaj | Bozulmaz, boş gitmez, sayfa taşmaz |
| T4 | Kiracı | Başkasının mülkünü ve yönetici panelini dener | Göremez |
| T5 | Kiracı | Tüm panel sayfalarını gezer | Hata, NaN, undefined yok |
| T6 | Kiracı | Dekont yerine `.exe` seçer | Ödeme oluşmaz, uygulama kırılmaz |
| T7 | Kiracı | Telefonda gezer | Yatay taşma yok |
| M1 | Mülk sahibi | Tüm panel sayfalarını gezer | Hata, NaN, undefined yok |
| M2-M3 | Mülk sahibi | Boş form, negatif kira, geçersiz ödeme günü | Hatalı mülk oluşmaz |
| M4 | Mülk sahibi | Adında HTML olan mülk görür | Betik çalışmaz |
| Y1 | Yönetici | Hata kayıtlarını siler, vazgeçer, sonra onaylar | Önce onay sorulur |
| Y2 | Oturumsuz | `/admin` adresine gider | Girişe yönlenir |
| D1 | Kiracı | Bağlantı giderken mesaj yazar | Kaybolmaz, sonra gider, hata kaydı dolmaz |
| D2 | Kiracı | Sunucu mesajı reddeder | Gönderilemediğini görür |
| D3 | Mülk sahibi | Oturumu düşer | Girişe yönlenir |
| D4 | Kiracı | Geri, ileri tuşları | Hata yok |
| D5 | Yabancı | İngilizce tarayıcıyla girişi açar | Hata yok |
