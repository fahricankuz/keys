-- Müşteriye e-posta: abonelik olayları (ödeme sorunu, iptal, sona erme), elle paket tanımlama/kaldırma, hesap askıya alma/açma.
-- Hepsi mevcut bildirim hattından gider: notifications satırı → push fonksiyonu → cihaza bildirim + e-posta (Resend).
-- Etiketi bill- ya da acct- ile başlayan bildirimler işlem e-postasıdır: kullanıcı bildirim e-postalarını kapatmış olsa da gider
-- (push fonksiyonunda). Aynı gün aynı etiket bir kez yazılır (notifications_tag_day).
-- Migration eski kodla uyumludur: yalnızca yeni işlev/tetikleyici ekler ve admin_set_plan / admin_set_ban'a bildirim satırı ekler.
-- Yeniden çalıştırılabilir.

-- ---- Ödeme sorunu, iptal, abonelik sona erdi -----------------------------------------------------------------------
-- RevenueCat → billing fonksiyonu subscriptions satırını günceller; değişiklik buradan kullanıcıya haber olur.
-- Yönetici elle verdiği (admin) ve promosyon paketleri hariç: onlar için ayrı bildirim (admin_set_plan) vardır.
create or replace function public.notify_sub_events()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  d   text := to_char(now() at time zone 'Europe/Istanbul', 'YYYYMMDD');
  src text;
begin
  if tg_op <> 'UPDATE' or coalesce(new.store, '') in ('admin', 'promotional') then return new; end if;
  src := case new.store when 'app_store' then 'App Store' when 'play_store' then 'Google Play' else 'ödeme' end;

  if coalesce(new.billing_issue, false) and not coalesce(old.billing_issue, false) then
    insert into public.notifications (user_id, title, body, url, tag)
    values (new.user_id, 'Ödemende sorun var',
            'Aboneliğin için ödeme alınamadı. Erişimin kesilmemesi için ' || src || ' hesabında ödeme yöntemini güncelle.',
            '/uygulama/ayarlar', 'bill-issue-' || d)
    on conflict do nothing;
  end if;

  if coalesce(old.active, false) and not coalesce(new.active, false) then
    insert into public.notifications (user_id, title, body, url, tag)
    values (new.user_id, 'Aboneliğin sona erdi',
            'Ücretli aboneliğin sona erdi. Erişimi sürdürmek için aboneliği yeniden başlatabilirsin; verilerin silinmedi.',
            '/uygulama/ayarlar', 'bill-end-' || d)
    on conflict do nothing;
  elsif coalesce(new.active, false) and coalesce(old.will_renew, false) and not coalesce(new.will_renew, false) then
    insert into public.notifications (user_id, title, body, url, tag)
    values (new.user_id, 'Aboneliğin iptal edildi',
            'Aboneliğin yenilenmeyecek.' || coalesce(' Erişimin ' || to_char(new.expires_at at time zone 'Europe/Istanbul', 'DD.MM.YYYY') || ' tarihine kadar devam eder.', '')
              || ' Fikrini değiştirirsen aboneliği yeniden başlatabilirsin.',
            '/uygulama/ayarlar', 'bill-cancel-' || d)
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists notify_sub_events on public.subscriptions;
create trigger notify_sub_events after update on public.subscriptions for each row execute function public.notify_sub_events();

-- ---- Elle paket tanımlama / kaldırma (admin_set_plan) ---------------------------------------------------------------
-- Önceki sürüm (abonelik_adet_sektor) + kullanıcıya bildirim. Kaldırmada yalnızca gerçekten silinen satır için haber verilir.
create or replace function public.admin_set_plan(uid uuid, plan text, until timestamptz, why text, unit_count int default null, sec text default null)
returns void language plpgsql security definer set search_path = public as $$
declare pid text; nm text; gone int;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  if coalesce(plan, '') = '' then
    delete from public.subscriptions where user_id = uid and store = 'admin';
    get diagnostics gone = row_count;
    if gone > 0 then
      insert into public.notifications (user_id, title, body, url, tag)
      values (uid, 'Paketin kaldırıldı', 'Hesabına tanımlanan paket kaldırıldı. Sorun olduğunu düşünüyorsan info@anahtar.io adresine yazabilirsin.',
              '/uygulama/ayarlar', 'bill-planoff-' || floor(extract(epoch from clock_timestamp()))::text)
      on conflict do nothing;
    end if;
  elsif plan not in ('tek','bes','kurumsal') then
    raise exception 'Geçersiz paket' using errcode = '22023';
  else
    if plan in ('tek','bes') then
      if unit_count is null or unit_count < 1 or unit_count > 9 then
        raise exception 'Mülk adedi 1-9 olmalı' using errcode = '22023';
      end if;
      sec := null;
      pid := plan || '_' || unit_count || '_aylik';
    else
      if unit_count is null or unit_count < 1 or unit_count > 1000000 then
        raise exception 'Mülk adedi gerekli' using errcode = '22023';
      end if;
      if sec is null or sec not in ('site','avm','gyo','depo','emlak','family','diger') then
        raise exception 'Sektör gerekli' using errcode = '22023';
      end if;
      pid := 'kurumsal';
    end if;
    insert into public.subscriptions (user_id, entitlement, product_id, store, expires_at, active, will_renew, units, sector, updated_at)
    values (uid, 'pro', pid, 'admin', until, true, false, unit_count, sec, now())
    on conflict (user_id) do update set product_id = excluded.product_id, store = 'admin', expires_at = excluded.expires_at,
      active = true, will_renew = false, billing_issue = false, units = excluded.units, sector = excluded.sector, updated_at = now();
    nm := case plan when 'tek' then 'Başlangıç' when 'bes' then 'Profesyonel' else 'Kurumsal' end;
    insert into public.notifications (user_id, title, body, url, tag)
    values (uid, 'Paketin tanımlandı',
            'Hesabına ' || nm || ' paketi tanımlandı · ' || unit_count || ' mülk'
              || case when until is null then ' · süresiz' else ' · bitiş ' || to_char(until at time zone 'Europe/Istanbul', 'DD.MM.YYYY') end || '.',
            '/uygulama/ayarlar', 'bill-plan-' || floor(extract(epoch from clock_timestamp()))::text)
    on conflict do nothing;
  end if;
  perform public.audit('plan.set', uid::text, jsonb_build_object('plan', nullif(plan, ''), 'until', until, 'reason', why,
    'units', unit_count, 'sector', sec));
end $$;
grant execute on function public.admin_set_plan(uuid, text, timestamptz, text, int, text) to authenticated;

-- ---- Hesap askıya alma / yeniden açma (admin_set_ban) ----------------------------------------------------------------
create or replace function public.admin_set_ban(uid uuid, ban boolean, why text default '')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  if uid = auth.uid() then raise exception 'Kendini yasaklayamazsın' using errcode = '22023'; end if;
  if exists (select 1 from public.admins where user_id = uid) then raise exception 'Yönetici yasaklanamaz' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = uid) then raise exception 'Kullanıcı bulunamadı' using errcode = 'P0002'; end if;
  if ban then
    if coalesce(trim(why), '') = '' then raise exception 'Yasaklama için gerekçe yaz' using errcode = '22023'; end if;
    insert into public.bans (user_id, reason, banned_by) values (uid, trim(why), auth.uid())
    on conflict (user_id) do update set reason = excluded.reason, banned_by = excluded.banned_by, banned_at = now();
  else
    delete from public.bans where user_id = uid;
  end if;
  begin
    update auth.users set banned_until = case when ban then 'infinity'::timestamptz else null end where id = uid;
    if ban then delete from auth.sessions where user_id = uid; end if;
  exception when undefined_column or undefined_table then null;
  end;
  perform public.audit(case when ban then 'user.ban' else 'user.unban' end, uid::text, jsonb_build_object('reason', coalesce(trim(why), '')));
  insert into public.notifications (user_id, title, body, url, tag)
  values (uid,
          case when ban then 'Hesabın askıya alındı' else 'Hesabın yeniden açıldı' end,
          case when ban then 'Hesabın şu gerekçeyle askıya alındı: ' || trim(why) || ' Bir yanlışlık olduğunu düşünüyorsan info@anahtar.io adresine yaz.'
               else 'Hesabın yeniden etkinleştirildi; giriş yapıp kullanmaya devam edebilirsin.' end,
          '/uygulama', (case when ban then 'acct-ban-' else 'acct-unban-' end) || floor(extract(epoch from clock_timestamp()))::text)
  on conflict do nothing;
end $$;
grant execute on function public.admin_set_ban(uuid, boolean, text) to authenticated;
