-- İç işlevlerin yetkisi: yalnız zamanlanmış iş (pg_cron) ve sunucu içi çağrılar için.
-- Sorun: daily_reminders, billing_reminders, access_state (ve audit için anon) için yalnız "public"ten yetki kaldırılmıştı; Supabase anon ve authenticated
-- rollerine ayrıca doğrudan EXECUTE verdiği için bu işlevler herkese açık anahtarla /rpc üzerinden çağrılabiliyordu
-- (istenen tarihle hatırlatma tetikleyip kullanıcılara toplu bildirim/e-posta göndermek; başka bir kullanıcının paket ve deneme durumunu okumak).
-- Uygulama bu işlevleri doğrudan çağırmaz ve güvenlik kurallarında (RLS) kullanılmazlar; my_access ve has_access access_state'i
-- sahibinin yetkisiyle çağırır. Yeniden çalıştırılabilir.
revoke execute on function public.daily_reminders(date) from public, anon, authenticated;
revoke execute on function public.billing_reminders(date) from public, anon, authenticated;
revoke execute on function public.access_state(uuid) from public, anon, authenticated;
-- Yönetici işlem kaydı yazıcısı: authenticated'dan kaldırılmıştı, anon'dan kaldırılmamıştı (oturumsuz biri kayda sahte satır ekleyebilirdi).
revoke execute on function public.audit(text, text, jsonb) from public, anon, authenticated;
