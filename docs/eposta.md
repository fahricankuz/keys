# E-posta sistemi: kim, ne zaman, hangi yoldan

Tüm e-postalar ortak göndericiden (`supabase/functions/_shared/mail.ts`) geçer. İki gönderim yolu vardır:
- **Hostinger posta kutusu (SMTP)**: `SMTP_HOST` tanımlıysa kullanılır. Gizli değişkenler: `SMTP_HOST` (`smtp.hostinger.com`), `SMTP_PORT` (465),
  `SMTP_USER` (`info@anahtar.io`), `SMTP_PASS` (posta kutusunun parolası), `EMAIL_FROM` (`anahtar <info@anahtar.io>`; adres `SMTP_USER` ile aynı olmalı).
  Supabase Edge Function'ları 25 ve 587 portlarını engeller; 465 kullanılır. Hostinger'ın günlük gönderim sınırı geçerlidir.
- **Resend**: `SMTP_HOST` yoksa eskisi gibi (`RESEND_API_KEY`, `EMAIL_FROM`).
Üç tetikleme yolu vardır (hepsi Supabase'de, değişmedi):

## 1. Bildirim hattı (hesabı olan kişiye)
`notifications` satırı yazılır → Database Webhook → `push` fonksiyonu → cihaza bildirim **ve** e-posta.
Etiketi `bill-` ya da `acct-` ile başlayan bildirimler işlem e-postasıdır: kullanıcı e-posta bildirimlerini kapatmış olsa da gider.

| Olay | Kim tetikler | Etiket |
|---|---|---|
| Ödemede sorun | `subscriptions.billing_issue` açılınca (tetikleyici `notify_sub_events`) | `bill-issue-…` |
| Abonelik iptal edildi (bitişe kadar erişim sürer) | `will_renew` kapanınca | `bill-cancel-…` |
| Abonelik sona erdi | `active` kapanınca | `bill-end-…` |
| Paket tanımlandı / kaldırıldı (yönetici) | `admin_set_plan` | `bill-plan-…`, `bill-planoff-…` |
| Hesap askıya alındı / yeniden açıldı | `admin_set_ban` | `acct-ban-…`, `acct-unban-…` |
| Kurum yöneticisi atandı (hesabı olana) | `admin_org_set_master` | `acct-org-…` |
| Yenileme / ilk çekim hatırlatması | `billing_reminders()` | `bill-YYYYMMDD` |
| Şikâyetin incelendi, talep güncellendi, dekont onay/ret, kira günü/gecikme, mesaj … | uygulama olayları | etiketsiz / `rent-…` vb. |

Not: "deneme bitti" ve "e-postanı onayla" hatırlatmaları şimdilik kurulmadı.

## 2. Gönderim kuyruğu `mail_outbox` → `mail-send` (alıcı hesapsız, hesabı silinmiş ya da ekibimiz)
| Tür | Alıcı | Ne zaman |
|---|---|---|
| `account_deleted` | silinen kişi | kendisi sildi (`delete_my_account`) ya da yönetici sildi (`admin_delete_user`) |
| `plan_choice` | ekip (`LEAD_TO`, varsayılan info@anahtar.io) | oturum açmış mülk sahibi satın alma sayfasında paket/adet/dönem seçince |
| `org_master_invite` | davet edilen kişi | hesabı olmayan birine kurum yöneticisi daveti (`admin_org_set_master`) |

Kurulum: `supabase functions deploy mail-send`, gizli değişken `MAIL_SECRET`, sonra Supabase → Database → Webhooks → yeni webhook:
tablo `public.mail_outbox`, olay `INSERT`, tür "Supabase Edge Functions" → `mail-send`, başlık `x-anahtar-secret: <MAIL_SECRET>`.
Gönderilemeyen satırlar için (isteğe bağlı) Supabase → Integrations → Cron → Edge Function `mail-send`, POST, aynı başlık,
gövde `{"sweep":true}`, her 15 dakikada bir (5 denemeye kadar). Gönderilmeyen satırlar: `select * from mail_outbox where sent_at is null;`

## 3. Talep formları: `lead-mail`
`support_requests` (kurumsal teklif, Bize ulaş, paket yükseltme, içe aktarma) ve `legal_requests` (hukuki destek) INSERT webhook'u:
önce **ekibe** (info@anahtar.io) bildirim, sonra **müşteriye** "talebini aldık, en kısa sürede ekibimiz seninle iletişime geçecek"
e-postası (`ack.ts`; referans numarası, talep özeti, yanıt adresi info@). Müşteri e-postası başarısız olsa da ekip bildirimi bir kez gider.

## Diğer
Hoş geldin (`welcome`), kiracı daveti (`invite-mail`), site daveti (`site-invite`), aylık/yıllık rapor (`report`) ve Supabase Auth
e-postaları (kayıt onayı, şifre sıfırlama: `supabase/email-templates/`) önceki gibi çalışır.

## Teslim edilebilirlik (kod değil, ayar)
Resend'de `anahtar.io` doğrulanmış olmalı (SPF, DKIM, DMARC kayıtları Hostinger DNS'inde); Supabase → Authentication → SMTP'ye Resend
bağlanmalı; `info@anahtar.io` posta kutusu açık olmalı.

## Fonksiyonları Supabase'e yükleme (elle)
Fonksiyonlar Supabase → Edge Functions'a elle yüklenir (kodu yapıştırıp **Deploy**); jeton ya da GitHub düğmesi gerekmez.
Her fonksiyonun JWT ayarı `supabase/config.toml`'da belgelidir: webhook/zamanlayıcı fonksiyonları (`push`, `lead-mail`, `mail-send`, `report`,
`tufe-sync`, `billing`) JWT doğrulamasız ve gizli başlıkla korunur (panelde **Verify JWT** kapalı olmalı); `welcome`, `invite-mail`, `site-invite`
kullanıcının jetonuyla çağrılır. Uygulama bu üçünü **adlarıyla** çağırır; panelde oluştururken adın tam olarak `welcome`, `invite-mail`, `site-invite` olması gerekir.
Sıra: veritabanı migration → fonksiyonlar → Hostinger'da site.
