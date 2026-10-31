# Supabase giriş e-postaları (kayıt onayı, şifre sıfırlama…)

Bu e-postaların metni kodda değil, **Supabase panelinde** durur. Buradaki şablonlar anahtar logosunu ve marka renklerini içerir
(logo `https://anahtar.io/mail/anahtar-logo-mail.png` adresinden yüklenir; siteyi yayına aldıktan sonra görünür).

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

## Kontrol
1. Giriş sayfasında "Şifremi unuttum" ile kendine bir e-posta iste.
2. Logo üstte görünmeli, düğme `https://anahtar.io/yeni-sifre` sayfasına götürmeli.
3. Logo görünmüyorsa: siteyi yayına aldığından, `https://anahtar.io/mail/anahtar-logo-mail.png` adresinin tarayıcıda açıldığından emin ol.
   Bazı e-posta uygulamaları görselleri ilk seferde kapalı getirir ("Görselleri göster" demek gerekebilir).
