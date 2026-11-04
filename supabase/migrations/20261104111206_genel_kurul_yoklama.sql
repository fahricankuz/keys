-- Genel kurul ve görüş yoklaması (site yönetimi)
-- Yönetim genel kurul çağrısı yapar (tarih, yer, gündem); malikler katılım ya da vekâlet bildirir. Toplantı paketi
-- (çağrı, hazirun cetveli, vekâletname, gelir-gider özeti) uygulamada yazdırılır.
-- Görüş yoklaması: daire başına tek oy, istenirse arsa payıyla ağırlıklı; bitiş tarihine kadar değiştirilebilir.
-- Yoklama bağlayıcı değildir: Kat Mülkiyeti Kanunu'na göre kararlar genel kurulda alınır ve karar defterine yazılır.
-- Yeni tablolar ve işlevler; eski kodla uyumlu, yeniden çalıştırılabilir.

create table if not exists public.site_meetings (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  title      text not null default 'Olağan genel kurul' check (length(btrim(title)) between 2 and 120),
  kind       text not null default 'olagan' check (kind in ('olagan','olaganustu')),
  held_at    timestamptz not null,
  second_at  timestamptz,
  place      text not null default '' check (length(place) <= 200),
  agenda     text[] not null default '{}' check (cardinality(agenda) <= 30),
  minutes    text not null default '' check (length(minutes) <= 20000),
  status     text not null default 'cagrildi' check (status in ('cagrildi','yapildi','iptal')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists site_meetings_org on public.site_meetings (org_id, held_at desc);

create table if not exists public.site_meeting_replies (
  meeting_id uuid not null references public.site_meetings(id) on delete cascade,
  unit_id    uuid not null references public.site_units(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  answer     text not null check (answer in ('katilacak','katilmayacak','vekalet')),
  proxy_name text not null default '' check (length(proxy_name) <= 120),
  updated_at timestamptz not null default now(),
  primary key (meeting_id, unit_id)
);

create table if not exists public.site_polls (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  meeting_id uuid references public.site_meetings(id) on delete set null,
  question   text not null check (length(btrim(question)) between 3 and 300),
  options    text[] not null check (cardinality(options) between 2 and 10),
  weighted   boolean not null default false,
  voters     text not null default 'malik' check (voters in ('malik','herkes')),
  ends_at    timestamptz not null,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists site_polls_org on public.site_polls (org_id, created_at desc);

create table if not exists public.site_votes (
  poll_id    uuid not null references public.site_polls(id) on delete cascade,
  unit_id    uuid not null references public.site_units(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  choice     int not null check (choice >= 0),
  updated_at timestamptz not null default now(),
  primary key (poll_id, unit_id)
);

do $$
declare t text;
begin
  foreach t in array array['site_meetings','site_meeting_replies','site_polls','site_votes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists not_banned on public.%I', t);
    execute format('create policy not_banned on public.%I as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned())', t);
  end loop;
end $$;

-- Toplantı ve yoklama: yönetim ve sitenin sakinleri okur; duyuru yetkisi olan yazar.
drop policy if exists sm_read on public.site_meetings;
create policy sm_read on public.site_meetings for select to authenticated
  using (public.is_org_member(org_id) or public.is_site_resident(org_id) or public.is_admin());
drop policy if exists sm_write on public.site_meetings;
create policy sm_write on public.site_meetings for all to authenticated
  using (public.org_can(org_id, 'announce')) with check (public.org_can(org_id, 'announce'));

drop policy if exists sp_read on public.site_polls;
create policy sp_read on public.site_polls for select to authenticated
  using (public.is_org_member(org_id) or public.is_site_resident(org_id) or public.is_admin());
drop policy if exists sp_write on public.site_polls;
create policy sp_write on public.site_polls for all to authenticated
  using (public.org_can(org_id, 'announce')) with check (public.org_can(org_id, 'announce'));

-- Yanıt ve oy: yönetim hepsini, sakin kendi dairesininkini görür. Yazma yalnız aşağıdaki işlevlerle.
drop policy if exists smr_read on public.site_meeting_replies;
create policy smr_read on public.site_meeting_replies for select to authenticated
  using (public.is_org_member(org_id) or public.site_role(unit_id) is not null or public.is_admin());
drop policy if exists sv_read on public.site_votes;
create policy sv_read on public.site_votes for select to authenticated
  using (public.is_org_member(org_id) or public.site_role(unit_id) is not null or public.is_admin());

/** Malik toplantıya katılımını bildirir (katılacak / katılmayacak / vekâlet verdi). */
create or replace function public.site_meeting_reply(mid uuid, unit uuid, answer text, proxy text default '')
returns void language plpgsql security definer set search_path = public as $$
declare m public.site_meetings;
begin
  select * into m from public.site_meetings where id = mid;
  if m.id is null then raise exception 'Toplantı bulunamadı' using errcode = 'P0002'; end if;
  if public.is_banned() or public.site_role(unit) is distinct from 'malik'
     or not exists (select 1 from public.site_units where id = unit and org_id = m.org_id) then
    raise exception 'Yalnız dairenin maliki yanıt verebilir' using errcode = '42501';
  end if;
  if m.status <> 'cagrildi' then raise exception 'Toplantı kapandı' using errcode = '22023'; end if;
  if answer not in ('katilacak','katilmayacak','vekalet') then raise exception 'Yanıt geçersiz' using errcode = '22023'; end if;
  if answer = 'vekalet' and length(btrim(coalesce(proxy, ''))) < 2 then raise exception 'Vekilin adını yaz' using errcode = '22023'; end if;
  insert into public.site_meeting_replies (meeting_id, unit_id, org_id, user_id, answer, proxy_name, updated_at)
  values (mid, unit, m.org_id, auth.uid(), answer, case when answer = 'vekalet' then left(btrim(proxy), 120) else '' end, now())
  on conflict (meeting_id, unit_id) do update set user_id = excluded.user_id, answer = excluded.answer,
    proxy_name = excluded.proxy_name, updated_at = now();
end $$;
grant execute on function public.site_meeting_reply(uuid, uuid, text, text) to authenticated;

/** Daire adına oy (bitişe kadar değiştirilebilir). Yoklama "malik" ise yalnız malik, "herkes" ise malik ya da kiracı oy verir. */
create or replace function public.site_poll_vote(pid uuid, unit uuid, choice int)
returns void language plpgsql security definer set search_path = public as $$
declare p public.site_polls; r text := public.site_role(unit);
begin
  select * into p from public.site_polls where id = pid;
  if p.id is null then raise exception 'Yoklama bulunamadı' using errcode = 'P0002'; end if;
  if public.is_banned() or r is null or (p.voters = 'malik' and r <> 'malik')
     or not exists (select 1 from public.site_units where id = unit and org_id = p.org_id) then
    raise exception 'Bu daire adına oy veremezsin' using errcode = '42501';
  end if;
  if now() >= p.ends_at then raise exception 'Yoklama bitti' using errcode = '22023'; end if;
  if choice is null or choice < 0 or choice >= cardinality(p.options) then raise exception 'Seçenek geçersiz' using errcode = '22023'; end if;
  insert into public.site_votes (poll_id, unit_id, org_id, user_id, choice, updated_at)
  values (pid, unit, p.org_id, auth.uid(), choice, now())
  on conflict (poll_id, unit_id) do update set user_id = excluded.user_id, choice = excluded.choice, updated_at = now();
end $$;
grant execute on function public.site_poll_vote(uuid, uuid, int) to authenticated;

/** Sonuç: seçenek başına daire sayısı ve arsa payı toplamı; katılım. Yönetim ve sitenin sakinleri görür. */
create or replace function public.site_poll_results(pid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p public.site_polls; n_units int; total_share numeric; opts jsonb;
begin
  select * into p from public.site_polls where id = pid;
  if p.id is null then return null; end if;
  if not (public.is_org_member(p.org_id) or public.is_site_resident(p.org_id) or public.is_admin()) then
    raise exception 'Yetkin yok' using errcode = '42501';
  end if;
  select count(*), coalesce(sum(u.share), 0) into n_units, total_share from public.site_units u where u.org_id = p.org_id;
  select coalesce(jsonb_agg(jsonb_build_object('label', o.label, 'count', coalesce(v.n, 0), 'share', coalesce(v.s, 0)) order by o.i), '[]'::jsonb)
    into opts
    from unnest(p.options) with ordinality as o(label, i)
    left join (select sv.choice, count(*) n, coalesce(sum(u.share), 0) s
                 from public.site_votes sv join public.site_units u on u.id = sv.unit_id
                where sv.poll_id = pid group by sv.choice) v on v.choice = o.i - 1;
  return jsonb_build_object('units', n_units, 'share', total_share,
    'voted', (select count(*) from public.site_votes where poll_id = pid),
    'voted_share', (select coalesce(sum(u.share), 0) from public.site_votes sv join public.site_units u on u.id = sv.unit_id where sv.poll_id = pid),
    'options', opts, 'closed', now() >= p.ends_at);
end $$;
grant execute on function public.site_poll_results(uuid) to authenticated;

/** Bildirim: çağrı maliklere, yoklama oy verebileceklere gider. */
create or replace function public.on_site_meeting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, title, body, url)
  select distinct r.user_id, 'Genel kurul çağrısı: ' || new.title,
         to_char(new.held_at at time zone 'Europe/Istanbul', 'DD.MM.YYYY HH24:MI') || case when new.place <> '' then ' · ' || new.place else '' end,
         '/uygulama/sitem'
  from public.site_residents r where r.org_id = new.org_id and r.user_id is not null and r.role = 'malik';
  return new;
end $$;
drop trigger if exists on_site_meeting on public.site_meetings;
create trigger on_site_meeting after insert on public.site_meetings for each row execute function public.on_site_meeting();

create or replace function public.on_site_poll()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, title, body, url)
  select distinct r.user_id, 'Görüş yoklaması', left(new.question, 240), '/uygulama/sitem'
  from public.site_residents r where r.org_id = new.org_id and r.user_id is not null and (new.voters = 'herkes' or r.role = 'malik');
  return new;
end $$;
drop trigger if exists on_site_poll on public.site_polls;
create trigger on_site_poll after insert on public.site_polls for each row execute function public.on_site_poll();
revoke execute on function public.on_site_meeting(), public.on_site_poll() from public, anon, authenticated;
