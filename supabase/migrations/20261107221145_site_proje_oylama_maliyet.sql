-- Site projeleri: sakin oylaması, teklifler ve faturalar.
--   * Oylama: yönetim projeyi oylamaya sunar (site_polls: Kabul / Ret, arsa payı ağırlıklı, oy hakkı malikler ya da herkes).
--     Kabul, tüm arsa payının belirlenen eşiğini geçerse proje "Onaylandı" (onay), geçmezse "Reddedildi" (red) olur;
--     %50 için "fazlası", %66 ve %80 için "en az" aranır. Süre bitince sonuç kendiliğinden uygulanır (site_project_vote_sync:
--     yönetim ve sakinlerin ekranı açılınca çağrılır; tekrar çağrılması zararsızdır), yönetim isterse erken bitirir.
--   * Aşama yine yalnız güncelleme kaydıyla değişir (bildirimli, tarihli); oylama ve sonuç da bir güncelleme kaydı bırakır.
--   * Teklifler ve faturalar (site_project_costs): firma, tutar, dosya (en çok 12 değil, tek dosya), teklifte "seçildi".
--     Fatura eklenince projenin "harcanan" tutarı faturaların toplamına eşitlenir, gider defterine (site_expenses: Onarım ve tadilat,
--     faturaya bağlı) yazılır ve sakinlere güncelleme bildirimi gider; silinince ikisi de geri alınır.
-- Eski kodla uyumludur: yeni sütun ve tablo, durum listesine yeni değerler. Yeniden çalıştırılabilir.

alter table public.site_projects drop constraint if exists site_projects_status_check;
alter table public.site_projects add constraint site_projects_status_check
  check (status in ('acildi','oylama','onay','red','teklif','yapim','askida','tamam'));
alter table public.site_project_updates drop constraint if exists site_project_updates_status_check;
alter table public.site_project_updates add constraint site_project_updates_status_check
  check (status is null or status in ('acildi','oylama','onay','red','teklif','yapim','askida','tamam'));

alter table public.site_projects add column if not exists poll_id uuid references public.site_polls(id) on delete set null;
alter table public.site_projects add column if not exists approve_pct int not null default 50;
alter table public.site_projects drop constraint if exists site_projects_approve_pct_check;
alter table public.site_projects add constraint site_projects_approve_pct_check check (approve_pct between 50 and 100);

create or replace function public.project_stage_tr(s text)
returns text language sql immutable as $$
  select case s when 'acildi' then 'Proje açıldı' when 'oylama' then 'Oylamaya sunuldu' when 'onay' then 'Sakinler onayladı'
                when 'red' then 'Sakinler reddetti' when 'teklif' then 'Teklif alındı' when 'yapim' then 'Yapıma başlandı'
                when 'askida' then 'Askıya alındı' when 'tamam' then 'Tamamlandı' else coalesce(s, '') end
$$;

/** Proje koruması (önceki sürüm + oylama bağı): kurum, oluşturan ve oluşturma zamanı değişmez; aşama yalnız güncelleme kaydıyla,
    oylama bağı (poll_id) yalnız oylama işlevleriyle değişir. */
create or replace function public.guard_site_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.org_id <> old.org_id then raise exception 'Proje başka siteye taşınamaz' using errcode = '42501'; end if;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  if pg_trigger_depth() <= 1 then
    new.status := old.status;                                   -- doğrudan düzenleme aşamayı değiştirmez
    if coalesce(current_setting('anahtar.proje_oylama', true), '') <> '1' then
      new.poll_id := old.poll_id; new.approve_pct := old.approve_pct;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

/** Oylamaya sun: "Kabul / Ret" yoklaması açar (oy hakkı voters: malik | herkes), projeyi "Oylamaya sunuldu"ya geçirir. */
create or replace function public.site_project_vote_open(pid uuid, days int, pct int default 50, voters text default 'malik')
returns uuid language plpgsql security definer set search_path = public as $$
declare p public.site_projects; poll uuid;
begin
  select * into p from public.site_projects where id = pid;
  if p.id is null then raise exception 'Proje bulunamadı' using errcode = 'P0002'; end if;
  if not public.org_can(p.org_id, 'projects.manage') then raise exception 'Yetkin yok' using errcode = '42501'; end if;
  if p.status not in ('acildi', 'teklif', 'red') then raise exception 'Proje bu aşamada oylamaya sunulamaz' using errcode = '22023'; end if;
  if days is null or days < 1 or days > 30 then raise exception 'Süre 1 ile 30 gün arasında olmalı' using errcode = '22023'; end if;
  if pct is null or pct < 50 or pct > 100 then raise exception 'Kabul eşiği %%50 ile %%100 arasında olmalı' using errcode = '22023'; end if;
  if voters is null or voters not in ('malik', 'herkes') then raise exception 'Oy hakkı geçersiz' using errcode = '22023'; end if;
  insert into public.site_polls (org_id, question, options, weighted, voters, ends_at, created_by)
  values (p.org_id, left('Proje yapılsın mı: ' || p.title, 300), array['Kabul', 'Ret'], true, voters, now() + make_interval(days => days), auth.uid())
  returning id into poll;
  perform set_config('anahtar.proje_oylama', '1', true);
  update public.site_projects set poll_id = poll, approve_pct = pct where id = pid;
  perform set_config('anahtar.proje_oylama', '', true);
  insert into public.site_project_updates (project_id, org_id, body, status, created_by)
  values (pid, p.org_id, 'Oylamaya sunuldu: kabul için tüm arsa payının ' || case when pct = 50 then '%50''sinden fazlası' else '%' || pct || ' ve üzeri' end
                        || ' gerekir; süre ' || days || ' gün.', 'oylama', auth.uid());
  return poll;
end $$;
grant execute on function public.site_project_vote_open(uuid, int, int, text) to authenticated;

/** Oylamayı sonuçlandırır (iç işlev): kabul payı eşiği geçtiyse "onay", geçmediyse "red"; bir güncelleme kaydı bırakır. */
create or replace function public.site_project_close_vote(pid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.site_projects; total numeric; yes numeric; no numeric; units int; voted int; ok boolean; ypct numeric; npct numeric;
begin
  select * into p from public.site_projects where id = pid for update;
  if p.id is null or p.status <> 'oylama' or p.poll_id is null then return; end if;
  select count(*), coalesce(sum(u.share), 0) into units, total from public.site_units u where u.org_id = p.org_id;
  select count(*), coalesce(sum(u.share) filter (where sv.choice = 0), 0), coalesce(sum(u.share) filter (where sv.choice = 1), 0)
    into voted, yes, no
    from public.site_votes sv join public.site_units u on u.id = sv.unit_id where sv.poll_id = p.poll_id;
  if total <= 0 then   -- arsa payı girilmemişse daire sayısına göre
    select count(*) filter (where sv.choice = 0), count(*) filter (where sv.choice = 1) into yes, no from public.site_votes sv where sv.poll_id = p.poll_id;
    total := units;
  end if;
  ypct := case when total > 0 then round(yes * 100 / total, 1) else 0 end;
  npct := case when total > 0 then round(no * 100 / total, 1) else 0 end;
  ok := total > 0 and case when p.approve_pct = 50 then yes * 100 > 50 * total else yes * 100 >= p.approve_pct * total end;
  insert into public.site_project_updates (project_id, org_id, body, status, created_by)
  values (pid, p.org_id, 'Oylama sonuçlandı: ' || case when ok then 'proje onaylandı' else 'proje onaylanmadı' end
                        || '. Kabul %' || ypct || ', ret %' || npct || ' (arsa payına göre); ' || voted || ' / ' || units || ' daire katıldı.',
          case when ok then 'onay' else 'red' end, coalesce(p.created_by, auth.uid()));
end $$;
revoke execute on function public.site_project_close_vote(uuid) from public, anon, authenticated;

/** Yönetim oylamayı süresi dolmadan bitirir. */
create or replace function public.site_project_vote_close(pid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.site_projects;
begin
  select * into p from public.site_projects where id = pid;
  if p.id is null then raise exception 'Proje bulunamadı' using errcode = 'P0002'; end if;
  if not public.org_can(p.org_id, 'projects.manage') then raise exception 'Yetkin yok' using errcode = '42501'; end if;
  perform public.site_project_close_vote(pid);
end $$;
grant execute on function public.site_project_vote_close(uuid) to authenticated;

/** Süresi dolan oylamaların sonucunu uygular; yönetim ve sitenin sakinleri ekranı açınca çağırır. Tekrar çağrılması zararsızdır. */
create or replace function public.site_project_vote_sync(oid uuid)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not (public.is_org_member(oid) or public.is_site_resident(oid) or public.site_linked(oid) or public.is_admin()) then
    raise exception 'Yetkin yok' using errcode = '42501';
  end if;
  for r in select p.id from public.site_projects p join public.site_polls sp on sp.id = p.poll_id
            where p.org_id = oid and p.status = 'oylama' and sp.ends_at <= now() loop
    perform public.site_project_close_vote(r.id); n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.site_project_vote_sync(uuid) to authenticated;

-- ---- Teklifler ve faturalar -----------------------------------------------------------------------------------------------
create table if not exists public.site_project_costs (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.site_projects(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  kind       text not null check (kind in ('teklif', 'fatura')),
  vendor     text not null check (length(btrim(vendor)) between 1 and 120),
  amount     numeric not null check (amount > 0),
  spent_on   date not null default current_date,
  note       text not null default '' check (length(note) <= 500),
  file       text check (file is null or file ~ '^site-[0-9a-f-]{36}/[A-Za-z0-9_.-]+$'),
  file_name  text not null default '' check (length(file_name) <= 200),
  chosen     boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (file is null or position('site-' || org_id::text || '/' in file) = 1),
  check (chosen = false or kind = 'teklif')
);
create index if not exists site_project_costs_project on public.site_project_costs (project_id, created_at);
alter table public.site_expenses add column if not exists project_cost_id uuid references public.site_project_costs(id) on delete cascade;

alter table public.site_project_costs enable row level security;
drop policy if exists not_banned on public.site_project_costs;
create policy not_banned on public.site_project_costs as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned());
drop policy if exists spc_read on public.site_project_costs;
create policy spc_read on public.site_project_costs for select to authenticated
  using (public.is_org_member(org_id) or public.site_linked(org_id) or public.is_admin());
drop policy if exists spc_insert on public.site_project_costs;
create policy spc_insert on public.site_project_costs for insert to authenticated
  with check (public.org_can(org_id, 'projects.manage') and created_by = auth.uid()
    and exists (select 1 from public.site_projects p where p.id = project_id and p.org_id = site_project_costs.org_id));
drop policy if exists spc_update on public.site_project_costs;
create policy spc_update on public.site_project_costs for update to authenticated
  using (public.org_can(org_id, 'projects.manage')) with check (public.org_can(org_id, 'projects.manage'));
drop policy if exists spc_delete on public.site_project_costs;
create policy spc_delete on public.site_project_costs for delete to authenticated
  using (public.org_can(org_id, 'projects.manage'));

/** Tür ve aşama kuralı: teklif oylama sürerken ve tamamlandıktan sonra eklenmez; fatura onay beklerken ya da reddedilmiş projede girilmez. */
create or replace function public.guard_site_project_cost()
returns trigger language plpgsql security definer set search_path = public as $$
declare st text;
begin
  if tg_op = 'UPDATE' then
    new.project_id := old.project_id; new.org_id := old.org_id; new.kind := old.kind; new.amount := old.amount;
    new.created_by := old.created_by; new.created_at := old.created_at;
    return new;
  end if;
  select status into st from public.site_projects where id = new.project_id;
  if new.kind = 'teklif' and st in ('oylama', 'red', 'tamam') then raise exception 'Bu aşamada teklif eklenemez' using errcode = '22023'; end if;
  if new.kind = 'fatura' and st in ('acildi', 'oylama', 'red') then raise exception 'Fatura, proje onaylandıktan sonra girilir' using errcode = '22023'; end if;
  new.created_at := now();
  return new;
end $$;
revoke execute on function public.guard_site_project_cost() from public, anon, authenticated;
drop trigger if exists guard_site_project_cost on public.site_project_costs;
create trigger guard_site_project_cost before insert or update on public.site_project_costs for each row execute function public.guard_site_project_cost();

/** Tutar metni: 228500 → "228.500" (binlik nokta, kuruşsuz; ortam diline bağlı değil). */
create or replace function public.project_tl(x numeric)
returns text language sql immutable set search_path = public as $$
  select regexp_replace(to_char(round(x)::bigint, 'FM999999999999990'), '(\d)(?=(\d{3})+$)', '\1.', 'g')
$$;
revoke execute on function public.project_tl(numeric) from public, anon, authenticated;

/** Faturalar projenin harcananını belirler (en az bir fatura varsa toplamı; hiç kalmazsa elle girilen değer korunur). */
create or replace function public.site_project_spent_sync(pid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s numeric;
begin
  select sum(amount) into s from public.site_project_costs where project_id = pid and kind = 'fatura';
  if s is not null then update public.site_projects set spent = s where id = pid; end if;
end $$;
revoke execute on function public.site_project_spent_sync(uuid) from public, anon, authenticated;

/** Eklenince: teklif seçildiyse diğerlerinin seçimi kalkar; fatura gider defterine yazılır, harcanan güncellenir; sakinlere güncelleme gider. */
create or replace function public.on_site_project_cost()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.site_projects;
begin
  select * into p from public.site_projects where id = new.project_id;
  if tg_op = 'INSERT' then
    if new.kind = 'teklif' and new.chosen then
      update public.site_project_costs set chosen = false where project_id = new.project_id and kind = 'teklif' and id <> new.id and chosen;
    end if;
    if new.kind = 'fatura' then
      insert into public.site_expenses (org_id, cat, amount, spent_on, note, receipt_path, receipt_name, created_by, project_cost_id)
      values (new.org_id, 'Onarım ve tadilat', new.amount, new.spent_on, left('Proje: ' || p.title || ' · ' || new.vendor, 500), new.file, new.file_name, new.created_by, new.id);
      perform public.site_project_spent_sync(new.project_id);
    end if;
    insert into public.site_project_updates (project_id, org_id, body, created_by)
    values (new.project_id, new.org_id,
            case when new.kind = 'teklif' then 'Teklif eklendi: ' || new.vendor || ' · ₺' || public.project_tl(new.amount)
                 else 'Fatura eklendi: ' || new.vendor || ' · ₺' || public.project_tl(new.amount) end,
            coalesce(new.created_by, p.created_by));
  elsif tg_op = 'UPDATE' then
    if new.kind = 'teklif' and new.chosen and not old.chosen then
      update public.site_project_costs set chosen = false where project_id = new.project_id and kind = 'teklif' and id <> new.id and chosen;
      insert into public.site_project_updates (project_id, org_id, body, created_by)
      values (new.project_id, new.org_id, 'Teklif seçildi: ' || new.vendor || ' · ₺' || public.project_tl(new.amount), coalesce(auth.uid(), p.created_by));
    end if;
  end if;
  return null;
end $$;
revoke execute on function public.on_site_project_cost() from public, anon, authenticated;
drop trigger if exists on_site_project_cost on public.site_project_costs;
create trigger on_site_project_cost after insert or update on public.site_project_costs for each row execute function public.on_site_project_cost();

/** Silinince (fatura): harcanan yeniden hesaplanır; gider kaydı dış anahtarla birlikte gider. */
create or replace function public.on_site_project_cost_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.kind = 'fatura' and exists (select 1 from public.site_projects where id = old.project_id) then
    perform public.site_project_spent_sync(old.project_id);
  end if;
  return null;
end $$;
revoke execute on function public.on_site_project_cost_delete() from public, anon, authenticated;
drop trigger if exists on_site_project_cost_delete on public.site_project_costs;
create trigger on_site_project_cost_delete after delete on public.site_project_costs for each row execute function public.on_site_project_cost_delete();
