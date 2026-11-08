-- paket bildirim tekrar
-- admin_set_plan: aynı "Paketin tanımlandı" bildirimi 10 dakika içinde ikinci kez eklenmez (etiket saniyeye göre değiştiği için ikinci çağrı yeni satır açıyordu).
-- İşlevin geri kalanı 20261101195349_eposta_bildirimleri ile aynı.
create or replace function public.admin_set_plan(uid uuid, plan text, until timestamptz, why text, unit_count int default null, sec text default null)
returns void language plpgsql security definer set search_path = public as $$
declare pid text; nm text; gone int; msg text;
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
    msg := 'Hesabına ' || nm || ' paketi tanımlandı · ' || unit_count || ' mülk'
              || case when until is null then ' · süresiz' else ' · bitiş ' || to_char(until at time zone 'Europe/Istanbul', 'DD.MM.YYYY') end || '.';
    -- Aynı paket kısa sürede yeniden tanımlanırsa (çift tıklama, tekrar deneme) aynı bildirim ikinci kez eklenmez.
    if not exists (select 1 from public.notifications where user_id = uid and title = 'Paketin tanımlandı' and body = msg
                   and created_at > now() - interval '10 minutes') then
    insert into public.notifications (user_id, title, body, url, tag)
    values (uid, 'Paketin tanımlandı',
            msg,
            '/uygulama/ayarlar', 'bill-plan-' || floor(extract(epoch from clock_timestamp()))::text || '-' || substr(md5(msg), 1, 6))
    on conflict do nothing;
    end if;
  end if;
  perform public.audit('plan.set', uid::text, jsonb_build_object('plan', nullif(plan, ''), 'until', until, 'reason', why,
    'units', unit_count, 'sector', sec));
end $$;
grant execute on function public.admin_set_plan(uuid, text, timestamptz, text, int, text) to authenticated;
