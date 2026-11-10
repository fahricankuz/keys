# Tek giriş, tek kayıt ve tek hesapta birden çok rol

## Kısaca
- **Bir kişi, bir hesap.** Giriş tek ekrandır (`/giris`): e-posta ve şifre. Hesap türü sorulmaz.
- Birden çok rolü olan kişi girişten sonra "Hangi rolle devam edeceksin?" ekranında rolünü seçer; sonradan menünün üstündeki
  rol seçiciden değiştirir. Tek rolü olan doğrudan paneline gider.
- Kayıt tek ekrandır (`/kayit`); kişi kendine uyanı seçer:

| Seçenek | Ne olur |
|---|---|
| Kiracıyım | Mülk sahibinin **davet kodu zorunlu** (`/kayit/kiraci`). |
| Sitede oturuyorum | Site yönetiminin **davet kodu zorunlu** (`/kayit/site-sakini`). |
| Mülk sahibiyim | Kodsuz kayıt, 1 ay deneme (`/kayit/mulk-sahibi`). |
| Site ya da portföy yönetiyorum | Kurumsal başvuru (`/kurumsal`); onaylanınca kurum açılır. |
| Emlakçı, muhasebeci ya da personelim | Ekip kaydı (`/kayit/ekip`). |

- Eski adresler (`/giris/kiraci`, `/giris/mulk-sahibi`) aynı giriş formunu açar; e-postalardaki bağlantılar çalışmaya devam eder.
- Yönetici (anahtar ekibi) girişi ayrıdır: `/giris/yonetici`.

## Hesap içinden rol ekleme
Ayarlar → Hesap → **Rol ekle** (çok rollü hesapta rol seçicinin altında da durur):
- **Mülk sahibi özelliğini ekle:** kiracı ya da site sakini hesabı mülk sahibi olur; kiracılığı ve site bağlantısı aynen kalır.
  Deneme süresi eklediği andan başlar ve hesap başına bir kez verilir.
- **Davet kodum var:** kiraladığı evin ya da oturduğu sitenin kodunu girer. Aynı hesap birden çok siteye ve daireye bağlanabilir.
- **Site ya da portföy yöneticisi:** buradan eklenmez; kurumsal başvuru ve onay gerekir.

## Sunucu kuralları (migration `tek_giris_rol_ekleme`)
- `handle_new_user`: kiracı (ve site sakini) hesabı için kayıt üst verisindeki `invite` geçerli olmalıdır
  (`signup_code_ok`: kullanılmamış, süresi dolmamış kiracı daveti ya da kullanılmamış site dairesi kodu). Kural yalnız Auth
  servisinin açtığı kayıtlara uygulanır; mevcut hesaplar etkilenmez.
- Acil durumda kuralı kapatmak: Supabase SQL Editor'da `alter database postgres set anahtar.signup_code = 'off';`
  (yeniden açmak için `reset`: `alter database postgres reset anahtar.signup_code;`).
- Supabase panelinden elle kiracı hesabı açılacaksa kullanıcı üst verisine geçerli bir `invite` yazılmalıdır.
- `add_landlord_role()`: yalnız çağıranın kendi hesabı; `profiles.landlord_since` denemenin başlangıcıdır ve kullanıcı değiştiremez.
- Ekip hesabı mülk sahibine dönüşmez (ayrı kayıt gerekir).

## Bilinen sınırlar
- Ekip kaydında davet kodu hâlâ isteğe bağlıdır.
- Bir hesap birden çok evde kiracı olarak bağlanabilir, ancak kiracı paneli şimdilik tek evi gösterir.
