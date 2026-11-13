# Supabase giriş e-postaları (kayıt onayı, şifre sıfırlama…)

Bu e-postaların metni kodda değil, **Supabase panelinde** durur. Buradaki şablonlar anahtar logosunu ve marka renklerini içerir
(logo `https://anahtar.io/mail/anahtar-logo-mail-koyu.png` adresinden yüklenir; siteyi yayına aldıktan sonra görünür).

## Nasıl uygulanır

Supabase → **Authentication → Emails → Templates** (eski panelde: Authentication → Email Templates).
Her şablon için sırasıyla: dosyanın içeriğini kopyala → "Message body" alanına yapıştır → konuyu (Subject) yaz → **Save**.

| Supabase şablonu | Dosya | Konu (Subject) |
| --- | --- | --- |
| Confirm sign up | `confirmation.html` | Kaydını onayla |
| Reset password | `recovery.html` | Şifreni yenile |
| Change email address | `email_change.html` | E-posta değişikliğini onayla |
| Invite user | `invite.html` | anahtar’a davet edildin |
| Magic link | `magic_link.html` | Giriş bağlantın |
| Reauthentication | `reauthentication.html` | Doğrulama kodun |

Dosyalardaki `{{ .ConfirmationURL }}`, `{{ .NewEmail }}` ve `{{ .Token }}` Supabase'in kendi değişkenleridir; olduğu gibi bırak.

## Logolar ve koyu mod
Depoda `app/public/marka/` altında tam boyutlu beş logo sürümü var, `app/public/mail/` altında e-posta boyutlu (480 px) karşılıkları:

| Sürüm | Dosya (e-posta boyutu) | Ne zaman |
| --- | --- | --- |
| Kırmızı zeminli (krem yazı) | `anahtar-logo-mail-kirmizi.png` | Şu an e-postalarda kullanılmıyor (kırmızı başlıklı eski tasarım) |
| Koyu zeminli (krem yazı) | `anahtar-logo-mail-koyu.png` | Bütün e-postalar: koyu başlık bandı (giriş, hoş geldin, davet, bildirim, rapor, talep) |
| Krem zeminli (koyu yazı) | `anahtar-logo-mail-krem.png` | Krem/açık zeminde (kullanılabilir) |
| Şeffaf, koyu yazı / şeffaf, beyaz yazı | `…-seffaf-koyu.png`, `…-seffaf-beyaz.png` | Web ve basılı işler. **E-postalarda kullanılmaz** |

Neden: Gmail ve bazı uygulamalar koyu modda arka plan ve yazı renklerini kendileri çevirir; şeffaf logonun yazısı koyu zeminde kaybolur.
Bu yüzden e-postalarda logo her zaman **kendi zemin rengiyle aynı bir hücrenin içinde** durur (koyu logo koyu bantta);
ayrıca şablonlar `color-scheme: light` ile Apple Mail ve Outlook'a "koyu moda çevirme" der.

## Logoyu değiştirmek istersen
Tarayıcılar ve e-posta uygulamaları (Gmail, Outlook) logo adresini önbelleğe alır. Logoyu değiştirirken **yeni bir dosya adı ver** (ör. `anahtar-logo-mail-koyu-2.png`)
ve `supabase/functions/*/template.ts` ile bu klasördeki adresleri güncelle; aynı adla yenisini koyarsan eski logo görünmeye devam edebilir.

## Kontrol
1. Giriş sayfasında "Şifremi unuttum" ile kendine bir e-posta iste.
2. Logo üstte görünmeli, düğme `https://anahtar.io/yeni-sifre` sayfasına götürmeli.
3. Logo görünmüyorsa: siteyi yayına aldığından, `https://anahtar.io/mail/anahtar-logo-mail-koyu.png` adresinin tarayıcıda açıldığından emin ol.
   Bazı e-posta uygulamaları görselleri ilk seferde kapalı getirir ("Görselleri göster" demek gerekebilir).
