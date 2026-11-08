-- İşletme projesi (yıllık gider planı) ve site projeleri tek çatı altında: İşletme projesi artık "Projeler" bölümünde bir proje türüdür.
--   * site_projects.kind: proje (çatı, asansör gibi işler) | isletme (yıllık işletme projesi; gider kalemleri site_budgets'ta) | ek (ek ödenek).
--   * Her site_budgets satırı için kind=isletme bir proje satırı açılır ve bütçe değişince tutarı eşitlenir (mevcut işletme projeleri
--     bu migration'da projeye bağlanır: kurulca onaylı olanlar "Yürürlükte", diğerleri "Taslak"; sakinlere bildirim gitmez).
--   * İşletme projesi de oylamaya sunulur (site_project_vote_open); oylamada onaylanırsa kurul onay tarihi kendiliğinden yazılır
--     (site_budgets.approved_on). Taslak işletme projesini yalnız yönetim görür; oylamaya sunulunca sakinler görür.
--   * Onaylı işletme projesinin kalemleri ve paylaştırma anahtarı doğrudan değişmez: yıl ortasındaki ek maliyet "ek ödenek" olarak
--     (kind=ek, parent_id: işletme projesi, cat: gider kalemi, budget: tutar) açılır, oylamaya sunulur; onaylanırsa kalem tutarına eklenir.
--   * Teklif ve fatura yalnız kind=proje için; tür, yıl ve bağ sonradan değişmez.
-- Eski kodla uyumludur: yeni sütunlar (varsayılan proje); site_budgets olduğu gibi kalır. Yeniden çalıştırılabilir.

alter table public.site_projects add column if not exists kind text not null default 'proje';
alter table public.site_projects add column if not exists year int;
alter table public.site_projects add column if not exists parent_id uuid references public.site_projects(id) on delete cascade;
alter table public.site_projects add column if not exists cat text;
alter table public.site_projects drop constraint if exists site_projects_kind_check;
alter table public.site_projects add constraint site_projects_kind_check check (kind in ('proje', 'isletme', 'ek'));
alter table public.site_projects drop constraint if exists site_projects_kind_fields_check;
alter table public.site_projects add constraint site_projects_kind_fields_check check (
  (kind = 'proje') or (kind = 'isletme' and year between 2000 and 2100)
  or (kind = 'ek' and parent_id is not null and cat is not null and length(btrim(cat)) between 1 and 60 and budget > 0));
create unique index if not exists site_projects_isletme_year on public.site_projects (org_id, year) where kind = 'isletme';

/** Aşamanın bildirimdeki adı (türe göre): işletme projesinde "Yürürlükte", ek ödenekte "Ek ödenek onaylandı". */
create or replace function public.project_stage_label(k text, s text)
returns text language sql immutable as $$
  select case
    when k = 'isletme' and s = 'acildi' then 'Taslak'
    when k = 'isletme' and s = 'onay' then 'Onaylandı'
    when k = 'isletme' and s = 'yapim' then 'Yürürlükte'
    when k = 'isletme' and s = 'tamam' then 'Yıl kapandı'
    when k = 'ek' and s = 'onay' then 'Ek ödenek onaylandı'
    when k = 'ek' and s = 'red' then 'Ek ödenek reddedildi'
    else public.project_stage_tr(s) end
$$;
revoke execute on function public.project_stage_label(text, text) from public, anon, authenticated;

-- Taslak işletme projesini ve ek ödeneği yalnız yönetim görür; diğer projeler ve oylamaya sunulanlar sakinlere açıktır.
drop policy if exists spj_read on public.site_projects;
create policy spj_read on public.site_projects for select to authenticated
  using (public.is_org_member(org_id) or public.is_admin() or (public.site_linked(org_id) and not (kind <> 'proje' and status = 'acildi')));

/** Yeni proje: aşama "açıldı"; ek ödenek yalnız onaylı (ya da yürürlükteki) işletme projesine bağlanır, aynı kurumda. */
create or replace function public.guard_site_project_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare par public.site_projects;
begin
  new.status := 'acildi';
  if new.kind = 'ek' then
    select * into par from public.site_projects where id = new.parent_id;
    if par.id is null or par.org_id <> new.org_id or par.kind <> 'isletme' or par.status not in ('onay', 'yapim') then
      raise exception 'Ek ödenek yalnız onaylı işletme projesine açılır' using errcode = '22023';
    end if;
    new.year := par.year;
  end if;
  return new;
end $$;

/** Proje koruması (önceki sürüm + tür): tür, yıl ve bağ değişmez. */
create or replace function public.guard_site_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.org_id <> old.org_id then raise exception 'Proje başka siteye taşınamaz' using errcode = '42501'; end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.kind := old.kind; new.year := old.year; new.parent_id := old.parent_id; new.cat := old.cat;
  if pg_trigger_depth() <= 1 then
    new.status := old.status;                                   -- doğrudan düzenleme aşamayı değiştirmez
    if coalesce(current_setting('anahtar.proje_oylama', true), '') <> '1' then
      new.poll_id := old.poll_id; new.approve_pct := old.approve_pct;
    end if;
    if old.kind = 'isletme' then new.budget := old.budget; end if;   -- işletme projesinin tutarı bütçe kalemlerinden gelir
  end if;
  new.updated_at := now();
  return new;
end $$;

/** Yeni proje bildirimi: işletme projesi ve ek ödenek oylamaya sunulunca duyurulur (taslakta sakinlere bildirim gitmez). */
create or replace function public.on_site_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind <> 'proje' then return null; end if;
  insert into public.notifications (user_id, title, body, url)
  select u, 'Yeni site projesi: ' || left(new.title, 120), coalesce(nullif(left(btrim(new.body), 240), ''), 'Proje açıldı'), '/uygulama/sitem'
  from public.site_org_people(new.org_id) u where u is distinct from auth.uid();
  return null;
end $$;

/** Güncelleme kaydı (önceki sürümle aynı) + aşama adı türe göre. */
create or replace function public.on_site_project_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare prev text; p public.site_projects; stage boolean; msg text;
begin
  select status into prev from public.site_projects where id = new.project_id;
  update public.site_projects
     set status = coalesce(new.status, status),
         progress = case when new.status = 'tamam' then 100 else coalesce(new.progress, progress) end
   where id = new.project_id
  returning * into p;
  stage := new.status is not null and new.status is distinct from prev;
  msg := coalesce(nullif(left(btrim(new.body), 200), ''),
                  case when cardinality(new.photos) > 0 then cardinality(new.photos) || ' yeni fotoğraf eklendi' else 'İlerleme %' || p.progress end);
  insert into public.notifications (user_id, title, body, url)
  select u, case when stage then left(p.title, 120) || ': ' || public.project_stage_label(p.kind, new.status) else 'Proje güncellendi: ' || left(p.title, 120) end,
         msg, '/uygulama/sitem'
  from public.site_org_people(new.org_id) u where u is distinct from auth.uid();
  return null;
end $$;

/** Bütçe satırı → işletme projesi satırı: yoksa açılır (Taslak; kurulca onaylı kayıt "Yürürlükte"), varsa tutarı eşitlenir. */
create or replace function public.site_budget_project_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare tot numeric; pid uuid;
begin
  select coalesce(sum((e ->> 'amount')::numeric), 0) into tot from jsonb_array_elements(new.items) e;
  select id into pid from public.site_projects where org_id = new.org_id and kind = 'isletme' and year = new.year;
  if pid is null then
    insert into public.site_projects (org_id, title, kind, year, budget, start_on, end_on, created_by)
    values (new.org_id, new.year || ' işletme projesi', 'isletme', new.year, tot, make_date(new.year, 1, 1), make_date(new.year, 12, 31), auth.uid())
    returning id into pid;
    if new.approved_on is not null then update public.site_projects set status = 'yapim' where id = pid; end if;   -- iç içe tetikleyici: aşama değişebilir
  else
    update public.site_projects set budget = tot where id = pid;
  end if;
  return null;
end $$;
revoke execute on function public.site_budget_project_sync() from public, anon, authenticated;
drop trigger if exists site_budget_project_sync on public.site_budgets;
create trigger site_budget_project_sync after insert or update on public.site_budgets for each row execute function public.site_budget_project_sync();

/** Onaylı işletme projesinin kalemleri ve paylaştırma anahtarı doğrudan değişmez (ek ödenek yolu vardır). */
create or replace function public.guard_site_budget()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.approved_on is not null and coalesce(current_setting('anahtar.isletme', true), '') <> '1'
     and (new.items is distinct from old.items or new.method is distinct from old.method) then
    raise exception 'Onaylı işletme projesi değiştirilemez; yıl ortasındaki ek maliyet için ek ödenek aç ve oylamaya sun' using errcode = '22023';
  end if;
  return new;
end $$;
revoke execute on function public.guard_site_budget() from public, anon, authenticated;
drop trigger if exists guard_site_budget on public.site_budgets;
create trigger guard_site_budget before update on public.site_budgets for each row execute function public.guard_site_budget();

/** Oylamada onay (kind isletme: kurul onay tarihi yazılır; kind ek: tutar işletme projesinin kalemine eklenir). */
create or replace function public.on_site_project_approved()
returns trigger language plpgsql security definer set search_path = public as $$
declare par public.site_projects; its jsonb;
begin
  if new.status <> 'onay' or old.status = 'onay' or new.kind = 'proje' then return null; end if;
  perform set_config('anahtar.isletme', '1', true);
  if new.kind = 'isletme' then
    update public.site_budgets set approved_on = coalesce(approved_on, current_date) where org_id = new.org_id and year = new.year;
  else
    select * into par from public.site_projects where id = new.parent_id;
    select b.items into its from public.site_budgets b where b.org_id = par.org_id and b.year = par.year;
    its := coalesce(its, '[]'::jsonb);
    if exists (select 1 from jsonb_array_elements(its) e where lower(e ->> 'cat') = lower(new.cat)) then
      select jsonb_agg(case when lower(e ->> 'cat') = lower(new.cat)
                            then jsonb_set(e, '{amount}', to_jsonb((e ->> 'amount')::numeric + new.budget)) else e end)
        into its from jsonb_array_elements(its) e;
    else
      its := its || jsonb_build_array(jsonb_build_object('cat', new.cat, 'amount', new.budget));
    end if;
    update public.site_budgets set items = its where org_id = par.org_id and year = par.year;
    insert into public.site_project_updates (project_id, org_id, body, created_by)
    values (par.id, par.org_id, 'Ek ödenek onaylandı: ' || new.cat || ' · ₺' || public.project_tl(new.budget) || '. Yıllık tutar güncellendi; daire aidatlarını yeniden hesaplayabilirsin.',
            coalesce(new.created_by, par.created_by));
  end if;
  perform set_config('anahtar.isletme', '', true);
  return null;
end $$;
revoke execute on function public.on_site_project_approved() from public, anon, authenticated;
drop trigger if exists on_site_project_approved on public.site_projects;
create trigger on_site_project_approved after update of status on public.site_projects for each row execute function public.on_site_project_approved();

/** Oylamaya sun (önceki sürüm + tür): işletme projesi ve ek ödenek de sunulur; tutarı olmayan işletme projesi sunulamaz. */
create or replace function public.site_project_vote_open(pid uuid, days int, pct int default 50, voters text default 'malik')
returns uuid language plpgsql security definer set search_path = public as $$
declare p public.site_projects; poll uuid;
begin
  select * into p from public.site_projects where id = pid;
  if p.id is null then raise exception 'Proje bulunamadı' using errcode = 'P0002'; end if;
  if not public.org_can(p.org_id, 'projects.manage') then raise exception 'Yetkin yok' using errcode = '42501'; end if;
  if p.status not in ('acildi', 'teklif', 'red') then raise exception 'Proje bu aşamada oylamaya sunulamaz' using errcode = '22023'; end if;
  if p.kind <> 'proje' and coalesce(p.budget, 0) <= 0 then raise exception 'Önce gider kalemlerini ve tutarlarını gir' using errcode = '22023'; end if;
  if days is null or days < 1 or days > 30 then raise exception 'Süre 1 ile 30 gün arasında olmalı' using errcode = '22023'; end if;
  if pct is null or pct < 50 or pct > 100 then raise exception 'Kabul eşiği %%50 ile %%100 arasında olmalı' using errcode = '22023'; end if;
  if voters is null or voters not in ('malik', 'herkes') then raise exception 'Oy hakkı geçersiz' using errcode = '22023'; end if;
  insert into public.site_polls (org_id, question, options, weighted, voters, ends_at, created_by)
  values (p.org_id, left(case p.kind when 'isletme' then 'İşletme projesi onaylansın mı: ' when 'ek' then 'Ek ödenek onaylansın mı: ' else 'Proje yapılsın mı: ' end || p.title, 300),
          array['Kabul', 'Ret'], true, voters, now() + make_interval(days => days), auth.uid())
  returning id into poll;
  perform set_config('anahtar.proje_oylama', '1', true);
  update public.site_projects set poll_id = poll, approve_pct = pct where id = pid;
  perform set_config('anahtar.proje_oylama', '', true);
  insert into public.site_project_updates (project_id, org_id, body, status, created_by)
  values (pid, p.org_id, 'Oylamaya sunuldu: kabul için tüm arsa payının ' || case when pct = 50 then '%50''sinden fazlası' else '%' || pct || ' ve üzeri' end
                        || ' gerekir; süre ' || days || ' gün.', 'oylama', auth.uid());
  return poll;
end $$;

/** Teklif ve fatura yalnız kind=proje için. */
create or replace function public.guard_site_project_cost()
returns trigger language plpgsql security definer set search_path = public as $$
declare st text; k text;
begin
  if tg_op = 'UPDATE' then
    new.project_id := old.project_id; new.org_id := old.org_id; new.kind := old.kind; new.amount := old.amount;
    new.created_by := old.created_by; new.created_at := old.created_at;
    return new;
  end if;
  select status, kind into st, k from public.site_projects where id = new.project_id;
  if k <> 'proje' then raise exception 'İşletme projesi ve ek ödenekte teklif ya da fatura girilmez; giderler gider defterinden gelir' using errcode = '22023'; end if;
  if new.kind = 'teklif' and st in ('oylama', 'red', 'tamam') then raise exception 'Bu aşamada teklif eklenemez' using errcode = '22023'; end if;
  if new.kind = 'fatura' and st in ('acildi', 'oylama', 'red') then raise exception 'Fatura, proje onaylandıktan sonra girilir' using errcode = '22023'; end if;
  new.created_at := now();
  return new;
end $$;

/** Oylama sonucu metni (önceki sürümle aynı; işletme projesi ve ek ödenekte "onaylandı"). */
create or replace function public.site_project_close_vote(pid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.site_projects; total numeric; yes numeric; no numeric; units int; voted int; ok boolean; ypct numeric; npct numeric; what text;
begin
  select * into p from public.site_projects where id = pid for update;
  if p.id is null or p.status <> 'oylama' or p.poll_id is null then return; end if;
  select count(*), coalesce(sum(u.share), 0) into units, total from public.site_units u where u.org_id = p.org_id;
  select count(*), coalesce(sum(u.share) filter (where sv.choice = 0), 0), coalesce(sum(u.share) filter (where sv.choice = 1), 0)
    into voted, yes, no
    from public.site_votes sv join public.site_units u on u.id = sv.unit_id where sv.poll_id = p.poll_id;
  if total <= 0 then
    select count(*) filter (where sv.choice = 0), count(*) filter (where sv.choice = 1) into yes, no from public.site_votes sv where sv.poll_id = p.poll_id;
    total := units;
  end if;
  ypct := case when total > 0 then round(yes * 100 / total, 1) else 0 end;
  npct := case when total > 0 then round(no * 100 / total, 1) else 0 end;
  ok := total > 0 and case when p.approve_pct = 50 then yes * 100 > 50 * total else yes * 100 >= p.approve_pct * total end;
  what := case p.kind when 'isletme' then 'işletme projesi' when 'ek' then 'ek ödenek' else 'proje' end;
  insert into public.site_project_updates (project_id, org_id, body, status, created_by)
  values (pid, p.org_id, 'Oylama sonuçlandı: ' || what || case when ok then ' onaylandı' else ' onaylanmadı' end
                        || '. Kabul %' || ypct || ', ret %' || npct || ' (arsa payına göre); ' || voted || ' / ' || units || ' daire katıldı.',
          case when ok then 'onay' else 'red' end, coalesce(p.created_by, auth.uid()));
end $$;

-- ---- Mevcut işletme projelerini projeye bağla (bildirimsiz) ------------------------------------------------------------
alter table public.site_projects disable trigger user;
insert into public.site_projects (org_id, title, kind, year, budget, status, progress, start_on, end_on, created_by)
select b.org_id, b.year || ' işletme projesi', 'isletme', b.year,
       coalesce((select sum((e ->> 'amount')::numeric) from jsonb_array_elements(b.items) e), 0),
       case when b.approved_on is not null then 'yapim' else 'acildi' end, 0, make_date(b.year, 1, 1), make_date(b.year, 12, 31), null
  from public.site_budgets b
 where not exists (select 1 from public.site_projects p where p.org_id = b.org_id and p.kind = 'isletme' and p.year = b.year);
alter table public.site_projects enable trigger user;
