-- =====================================================================
-- anahtar — Supabase şeması
-- Supabase panelinde SQL Editor'e yapıştırıp bir kez çalıştırın.
-- Tekrar çalıştırmak güvenlidir (create ... if not exists / or replace).
--
-- İçerik:
--   1. Tablolar
--   2. Yardımcı fonksiyonlar (üyelik, rol)
--   3. Satır düzeyi güvenlik (RLS) politikaları
--   4. Koruma tetikleyicileri (kiracının yetkisi dışındaki değişiklikler)
--   5. Otomatik kayıtlar (profil, ev sahibi üyeliği, ortak alan)
--   6. Davet kabul fonksiyonu
--   7. Bildirim tetikleyicileri
--   8. Günlük hatırlatmalar (pg_cron)
--   9. Dosya deposu (storage) ve anlık güncelleme (realtime)
-- =====================================================================

-- gen_random_uuid() ve md5() Postgres çekirdeğinde; ek uzantı gerekmez.

-- ---------------------------------------------------------------------
-- 1. Tablolar
-- ---------------------------------------------------------------------

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('tenant','landlord')),
  name        text not null default '',
  phone       text not null default '',
  lang        text not null default 'tr',
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.properties (
  id            text primary key default gen_random_uuid()::text,
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  name          text not null,
  addr          text not null default '',
  rent          numeric not null default 0,
  due_day       int  not null default 1 check (due_day between 1 and 28),
  aidat         numeric not null default 0,
  aidat_payer   text not null default 'Kiracı',
  deposit       numeric not null default 0,
  deposit_note  text not null default '',
  start_date    date not null default current_date,
  contract_end  date not null default (current_date + interval '1 year')::date,
  dask          date,
  value         numeric,
  bills         jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- v4: mülk tipi (Konut/Ofis/Mağaza/Depo), alan, kiracı şirket bilgisi,
-- kira stopajı ve depozito türü. Eski kurulumlarda sütunlar sonradan eklenir.
alter table public.properties add column if not exists prop_type    text not null default 'Konut';
alter table public.properties add column if not exists area         numeric;
alter table public.properties add column if not exists company      jsonb;
alter table public.properties add column if not exists stopaj       boolean not null default false;
alter table public.properties add column if not exists deposit_kind text not null default 'Nakit';
-- v8: yapılandırılmış adres {country, city, district, hood, street, no, unit, note}; "addr" tek satırlık hali olarak kalır.
alter table public.properties add column if not exists address      jsonb;
alter table public.properties drop constraint if exists properties_address_check;
alter table public.properties add constraint properties_address_check check (address is null or (jsonb_typeof(address) = 'object' and length(address::text) <= 2000));
alter table public.properties drop constraint if exists properties_prop_type_check;
alter table public.properties add constraint properties_prop_type_check check (prop_type in ('Konut','Ofis','Mağaza','Depo'));
alter table public.properties drop constraint if exists properties_deposit_kind_check;
alter table public.properties add constraint properties_deposit_kind_check check (deposit_kind in ('Nakit','Teminat mektubu'));

-- İki tarafın da düzenlediği alanlar ayrı tabloda: kiracı kiraya dokunamaz ama
-- tutanağı, çıkış sürecini ve yenileme yanıtını güncelleyebilir.
create table if not exists public.property_shared (
  property_id text primary key references public.properties(id) on delete cascade,
  inspect     jsonb not null default '{"tenantOk":false,"landlordOk":false,"rooms":[]}'::jsonb,
  move_out    jsonb,
  renewal     jsonb,
  updated_at  timestamptz not null default now()
);

create table if not exists public.memberships (
  property_id  text not null references public.properties(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null check (role in ('tenant','landlord')),
  display_name text not null default '',
  phone        text not null default '',
  email        text not null default '',
  created_at   timestamptz not null default now(),
  primary key (property_id, user_id)
);

create table if not exists public.invites (
  code         text primary key default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  property_id  text not null references public.properties(id) on delete cascade,
  name         text not null default '',
  email        text not null default '',
  phone        text not null default '',
  created_by   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 days',
  accepted_by  uuid references public.profiles(id) on delete set null,
  accepted_at  timestamptz
);

create table if not exists public.payments (
  property_id   text not null references public.properties(id) on delete cascade,
  month         text not null check (month ~ '^\d{4}-\d{2}$'),
  status        text not null check (status in ('review','partial','approved','rejected')),
  amount        numeric not null default 0,
  paid_on       date,
  receipt_name  text not null default '',
  receipt_path  text,
  note          text,
  reject_reason text,
  approved_at   timestamptz,
  updated_by    uuid default auth.uid(),
  updated_at    timestamptz not null default now(),
  primary key (property_id, month)
);

-- Tahakkuk kalemi (kurumsal yol planı Faz 1): bir mülkün aynı ayda birden çok kalemi olabilir (kira, aidat).
-- due: o ayın tahakkuk tutarı (boşsa mülkteki kira/aidat); method: ödeme yolu (bugün dekont; ileride sanal POS).
alter table public.payments add column if not exists kind   text not null default 'kira';
alter table public.payments add column if not exists due    numeric check (due is null or due >= 0);
alter table public.payments add column if not exists method text not null default 'dekont';
alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind in ('kira','aidat'));
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check check (method in ('dekont','havale','nakit','pos'));
do $$
begin
  if (select array_agg(a.attname::text order by a.attname) from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
       where i.indrelid = 'public.payments'::regclass and i.indisprimary) <> array['kind','month','property_id'] then
    alter table public.payments drop constraint payments_pkey;
    alter table public.payments add primary key (property_id, month, kind);
  end if;
end $$;

/** Denetim kaydındaki ödeme anahtarı: kira için ay ("2026-10"), diğer kalemler için "aidat:2026-10". */
create or replace function public.pay_ref(k text, m text)
returns text language sql immutable as $$ select case when coalesce(k, 'kira') = 'kira' then m else k || ':' || m end $$;

create table if not exists public.rent_history (
  id          text primary key,
  property_id text not null references public.properties(id) on delete cascade,
  from_date   date not null,
  amount      numeric not null,
  note        text not null default ''
);

create table if not exists public.requests (
  id          text primary key,
  property_id text not null references public.properties(id) on delete cascade,
  cat         text not null,
  title       text not null,
  descr       text not null default '',
  urgency     text not null default 'Normal',
  status      int  not null default 0 check (status between 0 and 3),
  cost        text not null default 'Belirlenmedi',
  cost_ok     boolean not null default false,
  decision    text,
  req_date    date not null default current_date,
  photos      int  not null default 0,
  shots       jsonb not null default '[]'::jsonb,
  log         jsonb not null default '[]'::jsonb,
  quotes      jsonb not null default '[]'::jsonb,
  invoice     jsonb,
  created_by  uuid default auth.uid(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.messages (
  id          text primary key,
  property_id text not null references public.properties(id) on delete cascade,
  from_role   text not null check (from_role in ('tenant','landlord','system')),
  by_user     uuid default auth.uid(),
  body        text not null,
  at          timestamptz not null default now()
);
-- Yazışmaya eklenen fotoğraf (depo yolu). Yalnızca evin üyeleri görür.
alter table public.messages add column if not exists image_path text;

create table if not exists public.documents (
  id          text primary key,
  property_id text not null references public.properties(id) on delete cascade,
  cat         text not null,
  name        text not null,
  path        text,
  uploaded_on date not null default current_date,
  until       date,
  uploaded_by uuid default auth.uid()
);

create table if not exists public.expenses (
  id          text primary key,
  property_id text not null references public.properties(id) on delete cascade,
  cat         text not null,
  amount      numeric not null,
  spent_on    date not null,
  note        text not null default '',
  req_id      text
);

create table if not exists public.notifications (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  property_id text references public.properties(id) on delete cascade,
  title       text not null,
  body        text not null default '',
  url         text not null default '#/',
  tag         text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
-- Aynı hatırlatma aynı gün iki kez gönderilmez.
create unique index if not exists notifications_tag_day
  on public.notifications (user_id, tag, ((created_at at time zone 'UTC')::date)) where tag is not null;

create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  keys        jsonb not null,
  created_at  timestamptz not null default now()
);

-- v5: yönetici ve denetim.
-- admins: yönetici hesapları. Satırı yalnızca SQL Editor'den (ya da service_role) eklenir.
create table if not exists public.admins (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- reviews: müşterilerin yüklediği dekont, belge ve faturaların denetim kaydı.
-- Yükleyen dışındaki taraf, yönetici onaylayana kadar yüklemeyi ve dosyasını göremez.
create table if not exists public.reviews (
  kind        text not null check (kind in ('payment','document','invoice')),
  property_id text not null references public.properties(id) on delete cascade,
  ref_id      text not null,                 -- ödeme: ay (2026-10); belge: belge kimliği; fatura: talep kimliği
  uploader    uuid references public.profiles(id) on delete set null,
  label       text not null default '',      -- dosya ya da belge adı
  path        text,                          -- depo yolu (evim/<ev>/<dosya>)
  amount      numeric,
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  note        text,                          -- red gerekçesi
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now(),
  primary key (kind, property_id, ref_id)
);
create index if not exists reviews_status on public.reviews (status, created_at desc);
create index if not exists reviews_path   on public.reviews (path);

-- v6: yasaklama ve yönetici denetim kaydı.
-- bans: askıya alınan hesaplar. Satırı yalnızca yönetici işlevi (admin_set_ban) yazar.
create table if not exists public.bans (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  reason    text not null default '',
  banned_by uuid references public.profiles(id) on delete set null,
  banned_at timestamptz not null default now()
);
-- admin_audit: yöneticinin yaptığı her hassas işlem (yasaklama, mesaj okuma/silme, yükleme kararı).
-- Yalnızca yönetici okur; hiç kimse (yönetici dahil) satırı değiştiremez ya da silemez.
create table if not exists public.admin_audit (
  id       bigserial primary key,
  admin_id uuid references public.profiles(id) on delete set null,
  action   text not null,
  target   text not null default '',
  detail   jsonb not null default '{}'::jsonb,
  at       timestamptz not null default now()
);
create index if not exists admin_audit_at on public.admin_audit (at desc);

create index if not exists memberships_user   on public.memberships (user_id);
create index if not exists payments_prop      on public.payments (property_id);
create index if not exists requests_prop      on public.requests (property_id);
create index if not exists messages_prop_at   on public.messages (property_id, at);
create index if not exists documents_prop     on public.documents (property_id);
create index if not exists expenses_prop      on public.expenses (property_id);
create index if not exists rent_history_prop  on public.rent_history (property_id);
create index if not exists notifications_user on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- 2. Yardımcı fonksiyonlar
-- security definer: RLS politikalarının kendi içinde döngüye girmemesi için.
-- ---------------------------------------------------------------------

create or replace function public.member_role(pid text)
returns text language sql stable security definer set search_path = public as $$
  select role from public.memberships where property_id = pid and user_id = auth.uid()
$$;

create or replace function public.is_member(pid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where property_id = pid and user_id = auth.uid())
$$;

create or replace function public.is_owner(pid text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.properties where id = pid and owner_id = auth.uid())
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;
grant execute on function public.is_admin() to authenticated;

create or replace function public.is_banned()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bans where user_id = auth.uid())
$$;
grant execute on function public.is_banned() to authenticated;

-- Bu yükleme denetimden geçmemiş mi? (kayıt yoksa eski/denetimsiz sayılır, görünür)
-- Uygulama belge ve fatura yollarını "sb:<yol>" biçiminde saklar; depodaki gerçek ad önek olmadan.
create or replace function public.storage_path(v text)
returns text language sql immutable as $$ select nullif(regexp_replace(coalesce(v, ''), '^sb:', ''), '') $$;

create or replace function public.file_review_ok(pth text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.reviews where path = pth and status <> 'approved')
$$;

create or replace function public.review_ok(k text, pid text, rid text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.reviews
                     where kind = k and property_id = pid and ref_id = rid and status <> 'approved')
$$;

-- İki kullanıcı en az bir evi paylaşıyor mu? (profil adlarını görebilmek için)
create or replace function public.shares_property(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.memberships a
    join public.memberships b on a.property_id = b.property_id
    where a.user_id = auth.uid() and b.user_id = other
  )
$$;

-- ---------------------------------------------------------------------
-- 3. Satır düzeyi güvenlik
-- ---------------------------------------------------------------------

alter table public.profiles           enable row level security;
alter table public.properties         enable row level security;
alter table public.property_shared    enable row level security;
alter table public.memberships        enable row level security;
alter table public.invites            enable row level security;
alter table public.payments           enable row level security;
alter table public.rent_history       enable row level security;
alter table public.requests           enable row level security;
alter table public.messages           enable row level security;
alter table public.documents          enable row level security;
alter table public.expenses           enable row level security;
alter table public.notifications      enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.admins             enable row level security;
alter table public.reviews            enable row level security;
alter table public.bans               enable row level security;
alter table public.admin_audit        enable row level security;

-- Politikaları yeniden oluşturabilmek için önce sil.
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- profiller
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_property(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- evler: üyeler okur, yalnızca sahibi yazar; ev sahibi rolündekiler ev ekleyebilir
create policy properties_select on public.properties for select to authenticated
  using (public.is_member(id));
create policy properties_insert on public.properties for insert to authenticated
  with check (owner_id = auth.uid()
              and exists (select 1 from public.profiles where id = auth.uid() and role = 'landlord'));
create policy properties_update on public.properties for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy properties_delete on public.properties for delete to authenticated
  using (owner_id = auth.uid());

-- ortak alanlar: üyeler okur ve günceller (ayrıntı tetikleyicide denetlenir)
create policy shared_select on public.property_shared for select to authenticated
  using (public.is_member(property_id));
create policy shared_update on public.property_shared for update to authenticated
  using (public.is_member(property_id)) with check (public.is_member(property_id));

-- üyelikler: üyeler görür; sahibi kiracı çıkarır, kiracı kendisi ayrılabilir.
-- Ekleme yalnızca tetikleyici ve accept_invite() üzerinden olur.
create policy memberships_select on public.memberships for select to authenticated
  using (public.is_member(property_id));
create policy memberships_delete on public.memberships for delete to authenticated
  using ((public.is_owner(property_id) and role = 'tenant') or (user_id = auth.uid() and role = 'tenant'));
create policy memberships_update on public.memberships for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- davetler: yalnızca evin sahibi
create policy invites_owner on public.invites for all to authenticated
  using (public.is_owner(property_id)) with check (public.is_owner(property_id) and created_by = auth.uid());

-- ödemeler: üyeler okur ve yazar; kiracının ne yapabileceği tetikleyicide sınırlı
-- Mülk sahibi, dekontu yönetici onaylayana kadar görmez (bkz. reviews).
create policy payments_select on public.payments for select to authenticated
  using (public.is_admin()
         or (public.is_member(property_id)
             and (public.member_role(property_id) = 'tenant' or public.review_ok('payment', property_id, public.pay_ref(kind, month)))));
create policy payments_insert on public.payments for insert to authenticated
  with check (public.is_member(property_id));
create policy payments_update on public.payments for update to authenticated
  using (public.is_member(property_id)
         and (public.member_role(property_id) = 'tenant' or public.review_ok('payment', property_id, public.pay_ref(kind, month))))
  with check (public.is_member(property_id));

-- kira tutarı geçmişi: üyeler okur, sahibi yazar
create policy rent_history_select on public.rent_history for select to authenticated
  using (public.is_member(property_id));
create policy rent_history_write on public.rent_history for all to authenticated
  using (public.is_owner(property_id)) with check (public.is_owner(property_id));

-- talepler
create policy requests_select on public.requests for select to authenticated
  using (public.is_member(property_id));
create policy requests_insert on public.requests for insert to authenticated
  with check (public.is_member(property_id));
create policy requests_update on public.requests for update to authenticated
  using (public.is_member(property_id)) with check (public.is_member(property_id));

-- mesajlar: gönderen rolü üyelikle uyuşmalı; düzenleme/silme yok
create policy messages_select on public.messages for select to authenticated
  using (public.is_member(property_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (public.is_member(property_id)
              and (by_user = auth.uid())
              and (from_role = 'system' or from_role = public.member_role(property_id)));

-- belgeler
-- Belgeyi yükleyen kendi belgesini her zaman görür; karşı taraf yönetici onayından sonra.
create policy documents_select on public.documents for select to authenticated
  using (public.is_admin() or uploaded_by = auth.uid()
         or (public.is_member(property_id) and public.review_ok('document', property_id, id)));
create policy documents_insert on public.documents for insert to authenticated
  with check (public.is_member(property_id) and uploaded_by = auth.uid());
create policy documents_update on public.documents for update to authenticated
  using (uploaded_by = auth.uid() or (public.is_owner(property_id) and public.review_ok('document', property_id, id)));
create policy documents_delete on public.documents for delete to authenticated
  using (uploaded_by = auth.uid() or (public.is_owner(property_id) and public.review_ok('document', property_id, id)));

-- giderler: kiracı hiç görmez
create policy expenses_owner on public.expenses for all to authenticated
  using (public.is_owner(property_id)) with check (public.is_owner(property_id));

-- yönetici: denetim için ilgili tabloları okur (yazma yetkisi yalnızca reviews kararında)
create policy admins_self on public.admins for select to authenticated using (user_id = auth.uid());
create policy profiles_admin on public.profiles for select to authenticated using (public.is_admin());
create policy properties_admin on public.properties for select to authenticated using (public.is_admin());
create policy memberships_admin on public.memberships for select to authenticated using (public.is_admin());
create policy requests_admin on public.requests for select to authenticated using (public.is_admin());
create policy invites_admin on public.invites for select to authenticated using (public.is_admin());
create policy shared_admin on public.property_shared for select to authenticated using (public.is_admin());

-- denetim kayıtları: yönetici hepsini okur ve karar verir; yükleyen kendi yüklemesinin durumunu görür.
create policy reviews_select on public.reviews for select to authenticated
  using (public.is_admin() or uploader = auth.uid());
create policy reviews_decide on public.reviews for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- bildirimler ve abonelikler: kişiye özel
create policy notifications_own on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_read on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- yasaklama kayıtları: yönetici hepsini, kullanıcı yalnızca kendininkini (askıya alındığını öğrenmek için) okur
create policy bans_admin on public.bans for select to authenticated using (public.is_admin());
create policy bans_self  on public.bans for select to authenticated using (user_id = auth.uid());
create policy audit_admin on public.admin_audit for select to authenticated using (public.is_admin());

-- Askıya alınmış hesap hiçbir içerik tablosunu okuyamaz ya da yazamaz (kısıtlayıcı politika:
-- diğer tüm politikalara ek olarak sağlanması gerekir). profiles'ta yalnızca güncelleme kapanır;
-- böylece uygulama oturumu açıp "askıya alındı" bilgisini gösterebilir.
do $$
declare t text;
begin
  foreach t in array array['properties','property_shared','memberships','invites','payments','rent_history',
                           'requests','messages','documents','expenses','notifications','push_subscriptions','reviews'] loop
    execute format('create policy not_banned on public.%I as restrictive for all to authenticated
                    using (not public.is_banned()) with check (not public.is_banned())', t);
  end loop;
end $$;
create policy not_banned on public.profiles as restrictive for update to authenticated
  using (not public.is_banned()) with check (not public.is_banned());

-- ---------------------------------------------------------------------
-- 4. Koruma tetikleyicileri
-- auth.uid() boşsa (sunucu, cron) denetim yapılmaz.
-- ---------------------------------------------------------------------

create or replace function public.guard_payments()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text := public.member_role(new.property_id);
begin
  if auth.uid() is null or r = 'landlord' or public.is_admin() then return new; end if;
  if new.status in ('approved','rejected') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    raise exception 'Ödemeyi yalnızca mülk sahibi onaylayabilir ya da reddedebilir' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then
    raise exception 'Onaylanmış ödeme değiştirilemez' using errcode = '42501';
  end if;
  new.approved_at := case when tg_op = 'UPDATE' then old.approved_at else null end;
  return new;
end $$;
drop trigger if exists guard_payments on public.payments;
create trigger guard_payments before insert or update on public.payments
  for each row execute function public.guard_payments();

create or replace function public.guard_requests()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text := public.member_role(new.property_id);
begin
  if auth.uid() is null or r = 'landlord' then new.updated_at := now(); return new; end if;
  if new.cost is distinct from old.cost
     or new.decision is distinct from old.decision
     or new.quotes is distinct from old.quotes
     or new.invoice is distinct from old.invoice then
    raise exception 'Masraf, karar, teklif ve faturayı yalnızca mülk sahibi değiştirebilir' using errcode = '42501';
  end if;
  if new.status <> old.status and new.status <> 3 then
    raise exception 'Kiracı talebi yalnızca kapatabilir' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists guard_requests on public.requests;
create trigger guard_requests before update on public.requests
  for each row execute function public.guard_requests();

-- Bir taraf karşı tarafın onayını yalnızca geri alabilir (true → false), veremez.
create or replace function public.guard_shared()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r text := public.member_role(new.property_id);
  other_flag text;
begin
  if auth.uid() is null then new.updated_at := now(); return new; end if;
  other_flag := case when r = 'tenant' then 'landlordOk' else 'tenantOk' end;

  if coalesce((new.inspect ->> other_flag)::boolean, false)
     and not coalesce((old.inspect ->> other_flag)::boolean, false) then
    raise exception 'Karşı tarafın tutanak onayı verilemez' using errcode = '42501';
  end if;

  if new.move_out is not null then
    if coalesce((new.move_out ->> other_flag)::boolean, false)
       and not coalesce((old.move_out ->> other_flag)::boolean, false) then
      raise exception 'Karşı tarafın çıkış onayı verilemez' using errcode = '42501';
    end if;
    if r = 'tenant' then
      if (new.move_out -> 'deductions') is distinct from (old.move_out -> 'deductions')
         or (new.move_out -> 'refunded') is distinct from (old.move_out -> 'refunded') then
        raise exception 'Kesinti ve iadeyi yalnızca mülk sahibi girebilir' using errcode = '42501';
      end if;
    end if;
  end if;
  if r = 'tenant' and old.move_out is null and new.move_out is not null then
    null; -- kiracı da çıkış sürecini başlatabilir
  end if;
  if r = 'tenant' and old.move_out is not null and new.move_out is null then
    raise exception 'Çıkış sürecini yalnızca mülk sahibi iptal edebilir' using errcode = '42501';
  end if;

  if r = 'tenant' and new.renewal is distinct from old.renewal then
    if old.renewal is null
       or (old.renewal ->> 'status') <> 'sent'
       or (new.renewal ->> 'status') <> 'accepted'
       or (new.renewal - 'status') is distinct from (old.renewal - 'status') then
      raise exception 'Kiracı yenileme teklifini yalnızca kabul edebilir' using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end $$;
drop trigger if exists guard_shared on public.property_shared;
create trigger guard_shared before update on public.property_shared
  for each row execute function public.guard_shared();

-- Rol, kayıttan sonra değiştirilemez.
create or replace function public.guard_profile()
returns trigger language plpgsql as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role then
    raise exception 'Hesap rolü değiştirilemez' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_profile on public.profiles;
create trigger guard_profile before update on public.profiles
  for each row execute function public.guard_profile();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists touch_properties on public.properties;
create trigger touch_properties before update on public.properties
  for each row execute function public.touch_updated_at();
drop trigger if exists touch_payments on public.payments;
create trigger touch_payments before update on public.payments
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 5. Otomatik kayıtlar
-- ---------------------------------------------------------------------

-- Yeni kullanıcı → profil (ad ve rol kayıt formundan gelir).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, name, lang)
  values (
    new.id,
    case when new.raw_user_meta_data ->> 'role' = 'landlord' then 'landlord' else 'tenant' end,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'lang', 'tr')
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Yeni ev → sahibi üye olur, ortak alan satırı ve ilk kira kaydı açılır.
create or replace function public.handle_new_property()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.memberships (property_id, user_id, role, display_name)
  select new.id, new.owner_id, 'landlord', p.name from public.profiles p where p.id = new.owner_id
  on conflict do nothing;
  insert into public.property_shared (property_id) values (new.id) on conflict do nothing;
  insert into public.rent_history (id, property_id, from_date, amount, note)
  values (new.id || ':' || new.start_date, new.id, new.start_date, new.rent, 'Sözleşme başlangıcı')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_property_created on public.properties;
create trigger on_property_created after insert on public.properties
  for each row execute function public.handle_new_property();

-- ---------------------------------------------------------------------
-- 6. Davet kabulü
-- Kiracı, ev sahibinin paylaştığı kodu girer; üyelik açılır.
-- ---------------------------------------------------------------------

create or replace function public.accept_invite(invite_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
  me  public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  if public.is_banned() then raise exception 'Hesap askıya alındı' using errcode = '42501'; end if;
  if me.role <> 'tenant' then raise exception 'Davetler kiracı hesapları içindir' using errcode = '22023'; end if;

  select * into inv from public.invites where code = upper(trim(invite_code)) for update;
  if inv.code is null then raise exception 'Davet kodu bulunamadı' using errcode = 'P0002'; end if;
  if inv.accepted_by is not null and inv.accepted_by <> me.id then
    raise exception 'Bu davet kullanılmış' using errcode = '22023';
  end if;
  if inv.expires_at < now() then raise exception 'Davetin süresi dolmuş' using errcode = '22023'; end if;

  insert into public.memberships (property_id, user_id, role, display_name, phone, email)
  values (inv.property_id, me.id, 'tenant', coalesce(nullif(me.name, ''), inv.name), coalesce(nullif(me.phone, ''), inv.phone),
          coalesce((select email from auth.users where id = me.id), inv.email))
  on conflict (property_id, user_id) do nothing;

  update public.invites set accepted_by = me.id, accepted_at = now() where code = inv.code;

  insert into public.messages (id, property_id, from_role, by_user, body)
  values (gen_random_uuid()::text, inv.property_id, 'system', null, me.name || ' eve katıldı');

  return inv.property_id;
end $$;
grant execute on function public.accept_invite(text) to authenticated;

-- Hesap silme (KVKK): kullanıcı kendi hesabını ve sahibi olduğu evleri siler.
-- Kiracı olduğu evlerdeki mesajları, ev sahibinin kayıtları için korunur (gönderen boşalır).
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  update public.messages set by_user = null where by_user = auth.uid();
  delete from auth.users where id = auth.uid();
end $$;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------
-- 7. Bildirimler
-- Olaylar sunucuda bildirime dönüşür; uygulama kapalı olsa da gider.
-- notifications tablosuna eklenen her satır, Database Webhook ile
-- "push" Edge Function'ını tetikler (kurulum kılavuzuna bakın).
-- ---------------------------------------------------------------------

create or replace function public.notify_members(
  pid text, target_role text, title text, body text,
  tenant_url text, landlord_url text, skip_user uuid default auth.uid(), tag text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, property_id, title, body, url, tag)
  select m.user_id, pid, title, left(body, 240),
         case when m.role = 'tenant' then tenant_url else landlord_url end, tag
  from public.memberships m
  where m.property_id = pid
    and (target_role is null or m.role = target_role)
    and (skip_user is null or m.user_id <> skip_user)
  on conflict do nothing;
end $$;

create or replace function public.prop_name(pid text)
returns text language sql stable security definer set search_path = public as $$
  select name from public.properties where id = pid
$$;

create or replace function public.fmt_tl(n numeric)
returns text language sql immutable as $$
  select '₺' || replace(to_char(round(n), 'FM999G999G999G999'), ',', '.')
$$;

create or replace function public.on_payment_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pname text := public.prop_name(new.property_id);
  lurl  text := '#/mulk-sahibi/mulk/' || new.property_id || '/odeme';
begin
  -- Dekont geldi bildirimi, yönetici onayladıktan sonra gider (bkz. on_review_change).
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    perform public.notify_members(new.property_id, 'tenant', 'Ödemen onaylandı',
      new.month || case when new.kind = 'aidat' then ' aidatı' else ' kirası' end || ' onaylandı.', '#/kiraci/odemeler', lurl);
  elsif new.status = 'rejected' and (tg_op = 'INSERT' or old.status is distinct from 'rejected') then
    perform public.notify_members(new.property_id, 'tenant', 'Dekont reddedildi',
      coalesce(new.reject_reason, 'Mülk sahibi dekontu onaylamadı.'), '#/kiraci/odemeler', lurl);
  end if;
  return new;
end $$;
drop trigger if exists on_payment_change on public.payments;
create trigger on_payment_change after insert or update on public.payments
  for each row execute function public.on_payment_change();

create or replace function public.on_request_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  steps text[] := array['Açıldı','Görüldü','İşlemde','Çözüldü'];
  turl  text := '#/kiraci/talepler/' || new.id;
  lurl  text := '#/mulk-sahibi/mulk/' || new.property_id || '/talep?s=talep&id=' || new.id;
begin
  if tg_op = 'INSERT' then
    perform public.notify_members(new.property_id, 'landlord', public.prop_name(new.property_id) || ': yeni talep',
      new.title || case when new.urgency = 'Acil' then ' · Acil' else '' end, turl, lurl);
  elsif new.status <> old.status then
    perform public.notify_members(new.property_id, null, 'Talep güncellendi',
      new.title || ' → ' || steps[new.status + 1], turl, lurl);
  elsif new.cost is distinct from old.cost then
    perform public.notify_members(new.property_id, 'tenant', 'Masraf önerisi',
      new.title || ': masraf ' || new.cost || ' olarak önerildi.', turl, lurl);
  end if;
  return new;
end $$;
drop trigger if exists on_request_change on public.requests;
create trigger on_request_change after insert or update on public.requests
  for each row execute function public.on_request_change();

create or replace function public.on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare sender text;
begin
  if new.from_role = 'system' then return new; end if;
  select display_name into sender from public.memberships where property_id = new.property_id and user_id = new.by_user;
  perform public.notify_members(new.property_id, null, coalesce(nullif(sender, ''), 'Yeni mesaj'), coalesce(nullif(new.body, ''), 'Fotoğraf gönderdi'),
    '#/kiraci/mesajlar', '#/mulk-sahibi/mulk/' || new.property_id || '/mesaj', new.by_user);
  return new;
end $$;
drop trigger if exists on_message on public.messages;
create trigger on_message after insert on public.messages
  for each row execute function public.on_message();

create or replace function public.on_shared_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pname text := public.prop_name(new.property_id);
  p     public.properties;
  cikis_t text := '#/kiraci/belgeler/cikis';
  cikis_l text := '#/mulk-sahibi/mulk/' || new.property_id || '/cikis';
begin
  -- Yenileme teklifi
  if (new.renewal ->> 'status') is distinct from (old.renewal ->> 'status') then
    if new.renewal ->> 'status' = 'sent' then
      perform public.notify_members(new.property_id, 'tenant', 'Yenileme teklifi geldi',
        'Yeni dönem için ' || public.fmt_tl((new.renewal ->> 'amount')::numeric) || ' önerildi.', '#/kiraci/odemeler',
        '#/mulk-sahibi/mulk/' || new.property_id || '/odeme');
    elsif new.renewal ->> 'status' = 'accepted' then
      -- Kabul edilen tutar sözleşme bitişinden itibaren geçerli olur.
      select * into p from public.properties where id = new.property_id;
      insert into public.rent_history (id, property_id, from_date, amount, note)
      values (p.id || ':' || p.contract_end, p.id, p.contract_end, (new.renewal ->> 'amount')::numeric,
              'Yenileme · TÜFE %' || coalesce(new.renewal ->> 'cpi', '?'))
      on conflict (id) do update set amount = excluded.amount, note = excluded.note;
      perform public.notify_members(new.property_id, 'landlord', pname || ': teklif kabul edildi',
        public.fmt_tl((new.renewal ->> 'amount')::numeric) || ' yeni dönem kirası olarak kabul edildi.',
        '#/kiraci/odemeler', '#/mulk-sahibi/mulk/' || new.property_id || '/odeme');
    end if;
  end if;

  -- Çıkış süreci
  if old.move_out is null and new.move_out is not null then
    perform public.notify_members(new.property_id, null, pname || ': çıkış süreci başladı',
      'Odaları birlikte değerlendirip kesintileri onaylayın.', cikis_t, cikis_l);
  elsif new.move_out is not null and (new.move_out -> 'refunded') is distinct from (old.move_out -> 'refunded')
        and new.move_out -> 'refunded' is not null and jsonb_typeof(new.move_out -> 'refunded') = 'object' then
    perform public.notify_members(new.property_id, 'tenant', 'Depozito iadesi yapıldı',
      public.fmt_tl((new.move_out -> 'refunded' ->> 'amount')::numeric) || ' iade edildi.', cikis_t, cikis_l);
  elsif new.move_out is not null
        and coalesce((new.move_out ->> 'tenantOk')::boolean, false) and coalesce((new.move_out ->> 'landlordOk')::boolean, false)
        and not (coalesce((old.move_out ->> 'tenantOk')::boolean, false) and coalesce((old.move_out ->> 'landlordOk')::boolean, false)) then
    perform public.notify_members(new.property_id, null, pname || ': çıkış hesabı onaylandı',
      'İki taraf da onayladı; iade tutarı kesinleşti.', cikis_t, cikis_l);
  end if;
  return new;
end $$;
drop trigger if exists on_shared_change on public.property_shared;
create trigger on_shared_change after update on public.property_shared
  for each row execute function public.on_shared_change();

-- ---------------------------------------------------------------------
-- 8. Günlük hatırlatmalar
-- Her sabah çalışır; eşik gününe denk gelen hatırlatmaları üretir.
-- Eşikler kullanıcının ayarlarından (profiles.settings) okunur.
-- ---------------------------------------------------------------------

create or replace function public.daily_reminders(today date default (now() at time zone 'Europe/Istanbul')::date)
returns int language plpgsql security definer set search_path = public as $$
declare
  p      public.properties;
  mb     public.memberships;
  s      jsonb;
  mkey   text := to_char(today, 'YYYY-MM');
  due    date;
  paid   text;
  n      int := 0;
  before int;
begin
  select count(*) into before from public.notifications;

  for p in select * from public.properties loop
    continue when p.start_date > today;                      -- sözleşme henüz başlamadı
    due := make_date(extract(year from today)::int, extract(month from today)::int, p.due_day);
    -- İlk ayda vade, sözleşme başlangıcından önceye düşmez (yeni eklenen mülk için "kira gecikti" gitmez).
    if to_char(p.start_date, 'YYYY-MM') = mkey and p.start_date > due then due := p.start_date; end if;
    select status into paid from public.payments where property_id = p.id and month = mkey and kind = 'kira';

    for mb in select * from public.memberships where property_id = p.id loop
      select settings into s from public.profiles where id = mb.user_id;

      -- Ayarlardan kapatılan hatırlatma türleri atlanır (varsayılan açık).
      -- Kira günü yaklaşıyor: kiracıya ve mülk sahibine (ödeme henüz yoksa).
      if paid is null and coalesce((s ->> 'remindRent')::boolean, true)
         and due - today = coalesce((s ->> 'rentDays')::int, 3) then
        insert into public.notifications (user_id, property_id, title, body, url, tag)
        values (mb.user_id, p.id,
                case when mb.role = 'tenant' then 'Kira günü yaklaşıyor' else p.name || ': kira günü yaklaşıyor' end,
                case when mb.role = 'tenant'
                     then p.name || ': ' || public.fmt_tl(p.rent) || ', son gün ' || to_char(due, 'DD.MM.YYYY') || '.'
                     else public.fmt_tl(p.rent) || ' kira ' || to_char(due, 'DD.MM.YYYY') || ' tarihinde ödenecek; henüz dekont yok.' end,
                case when mb.role = 'tenant' then '#/kiraci/odemeler' else '#/mulk-sahibi/mulk/' || p.id || '/odeme' end,
                'rent-soon-' || p.id)
        on conflict do nothing;
      end if;

      -- Kira günü (kiracı; ödeme henüz yoksa)
      if mb.role = 'tenant' and paid is null and due = today and coalesce((s ->> 'remindRent')::boolean, true) then
        insert into public.notifications (user_id, property_id, title, body, url, tag)
        values (mb.user_id, p.id, 'Bugün kira günü', p.name || ': ' || public.fmt_tl(p.rent) || '. Ödeyince dekontu yükle.',
                '#/kiraci/odemeler', 'rent-due-' || p.id)
        on conflict do nothing;
      end if;

      -- Kira gecikti: vadeden sonraki gün ve ardından haftada bir, iki tarafa
      if (paid is null or paid = 'rejected') and today > due and (today - due) % 7 = 1
         and coalesce((s ->> 'lateNotice')::boolean, true) then
        insert into public.notifications (user_id, property_id, title, body, url, tag)
        values (mb.user_id, p.id,
                case when mb.role = 'tenant' then 'Kira gecikti' else p.name || ': kira gecikti' end,
                to_char(due, 'DD.MM.YYYY') || ' vadeli kira ' || (today - due) || ' gündür ödenmedi.',
                case when mb.role = 'tenant' then '#/kiraci/odemeler' else '#/mulk-sahibi/mulk/' || p.id || '/odeme' end,
                'rent-late-' || p.id)
        on conflict do nothing;
      end if;

      -- Sözleşme yenileme
      if coalesce((s ->> 'remindRenew')::boolean, true)
         and p.contract_end - today in (coalesce((s ->> 'renewDays')::int, 60), 30, 7) then
        insert into public.notifications (user_id, property_id, title, body, url, tag)
        values (mb.user_id, p.id, p.name || ': sözleşme yenileme',
                'Sözleşme ' || to_char(p.contract_end, 'DD.MM.YYYY') || ' tarihinde yenileniyor (' || (p.contract_end - today) || ' gün).',
                case when mb.role = 'tenant' then '#/kiraci/odemeler' else '#/mulk-sahibi/mulk/' || p.id || '/odeme' end,
                'renew-' || p.id)
        on conflict do nothing;
      end if;

      -- DASK (ev sahibi)
      if mb.role = 'landlord' and p.dask is not null and coalesce((s ->> 'remindIns')::boolean, true)
         and p.dask - today in (coalesce((s ->> 'insDays')::int, 30), 7) then
        insert into public.notifications (user_id, property_id, title, body, url, tag)
        values (mb.user_id, p.id, p.name || ': DASK yenileme',
                'Poliçe ' || to_char(p.dask, 'DD.MM.YYYY') || ' tarihinde bitiyor.',
                '#/mulk-sahibi/mulk/' || p.id || '/belge', 'dask-' || p.id)
        on conflict do nothing;
      end if;
    end loop;
  end loop;

  -- Tahliye taahhütnamesi tarihleri
  insert into public.notifications (user_id, property_id, title, body, url, tag)
  select m.user_id, d.property_id, 'Tahliye tarihi yaklaşıyor',
         'Taahhütnamedeki tarih: ' || to_char(d.until, 'DD.MM.YYYY'),
         case when m.role = 'tenant' then '#/kiraci/belgeler' else '#/mulk-sahibi/mulk/' || d.property_id || '/belge' end,
         'evict-' || d.id
  from public.documents d
  join public.memberships m on m.property_id = d.property_id
  left join public.profiles pr on pr.id = m.user_id
  where d.cat = 'Tahliye taahhütnamesi' and d.until is not null
    and coalesce((pr.settings ->> 'remindEvict')::boolean, true)
    and d.until - today in (coalesce((pr.settings ->> 'evictDays')::int, 90), 30, 7)
  on conflict do nothing;

  select count(*) - before into n from public.notifications;
  return n;
end $$;

-- pg_cron varsa her gün 09:00 (İstanbul, UTC+3) çalıştır.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'evim-daily-reminders';
    perform cron.schedule('evim-daily-reminders', '0 6 * * *', 'select public.daily_reminders()');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 9. Dosya deposu ve anlık güncelleme
-- Dosya yolu: <ev kimliği>/<dosya>. Yalnızca o evin üyeleri erişir.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('evim', 'evim', false)
on conflict (id) do nothing;

drop policy if exists evim_read on storage.objects;
drop policy if exists evim_write on storage.objects;
drop policy if exists evim_delete on storage.objects;
drop policy if exists evim_not_banned on storage.objects;
-- Denetime bağlı dosyalar (dekont, belge, fatura): yükleyen ve yönetici her zaman, ev üyeleri onaydan sonra okur.
create policy evim_read on storage.objects for select to authenticated
  using (bucket_id = 'evim' and (
    public.is_admin() or owner = auth.uid()
    or (public.is_member((storage.foldername(name))[1])
        and public.file_review_ok(storage.objects.name))));
create policy evim_write on storage.objects for insert to authenticated
  with check (bucket_id = 'evim' and public.is_member((storage.foldername(name))[1]));
create policy evim_delete on storage.objects for delete to authenticated
  using (bucket_id = 'evim' and public.is_owner((storage.foldername(name))[1]));
create policy evim_not_banned on storage.objects as restrictive for all to authenticated
  using (not public.is_banned()) with check (not public.is_banned());

do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['properties','property_shared','memberships','payments','rent_history',
                             'requests','messages','documents','expenses','notifications','reviews'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 10. Yönetici denetimi
-- Dekont, belge ve fatura yüklenince reviews'a "pending" kayıt düşer; yönetici
-- onaylayana kadar yükleyen dışındaki taraf bunları (ve dosyalarını) göremez.
-- Aynı dosya yeniden yüklenirse denetim baştan başlar.
-- ---------------------------------------------------------------------

create or replace function public.upsert_review(
  k text, pid text, rid text, who uuid, lbl text, pth text, amt numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- guard_reviews bu çağrıyı (yükleme sonrası sıfırlama) engellemesin.
  perform set_config('kiracim.sistem', '1', true);
  insert into public.reviews (kind, property_id, ref_id, uploader, label, path, amount)
  values (k, pid, rid, who, coalesce(lbl, ''), pth, amt)
  on conflict (kind, property_id, ref_id) do update
    set uploader = excluded.uploader, label = excluded.label, path = excluded.path, amount = excluded.amount,
        status = 'pending', note = null, reviewed_by = null, reviewed_at = null, created_at = now();
  perform set_config('kiracim.sistem', '0', true);
end $$;

-- Dekont: kiracı yükleyince ya da dekont/tutar değişince.
create or replace function public.track_payment_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.member_role(new.property_id) is not distinct from 'landlord' or public.is_admin() then return new; end if;
  if new.status not in ('review','partial') then return new; end if;
  if tg_op = 'INSERT'
     or new.receipt_path is distinct from old.receipt_path
     or new.receipt_name is distinct from old.receipt_name
     or new.amount is distinct from old.amount then
    perform public.upsert_review('payment', new.property_id, public.pay_ref(new.kind, new.month), auth.uid(), new.receipt_name, new.receipt_path, new.amount);
  end if;
  return new;
end $$;
drop trigger if exists track_payment_review on public.payments;
create trigger track_payment_review after insert or update on public.payments
  for each row execute function public.track_payment_review();

-- Belge: yükleyen kim olursa olsun.
create or replace function public.track_document_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.path is distinct from old.path or new.name is distinct from old.name then
    perform public.upsert_review('document', new.property_id, new.id, coalesce(new.uploaded_by, auth.uid()), new.name, public.storage_path(new.path), null);
  end if;
  return new;
end $$;
drop trigger if exists track_document_review on public.documents;
create trigger track_document_review after insert or update on public.documents
  for each row execute function public.track_document_review();

-- Fatura: mülk sahibi talebe fatura eklediğinde.
create or replace function public.track_invoice_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.invoice is null or public.is_admin() then return new; end if;
  if tg_op = 'INSERT' or (new.invoice -> 'path') is distinct from (old.invoice -> 'path')
     or (new.invoice -> 'amount') is distinct from (old.invoice -> 'amount') then
    perform public.upsert_review('invoice', new.property_id, new.id, auth.uid(), coalesce(new.invoice ->> 'name', 'fatura'),
                                 public.storage_path(new.invoice ->> 'path'), nullif(new.invoice ->> 'amount', '')::numeric);
  end if;
  return new;
end $$;
drop trigger if exists track_invoice_review on public.requests;
create trigger track_invoice_review after insert or update on public.requests
  for each row execute function public.track_invoice_review();

-- Yalnızca yönetici karar verir; karar alanları dışında bir şey değişmez.
create or replace function public.guard_reviews()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(current_setting('kiracim.sistem', true), '0') = '1' then return new; end if;
  if not public.is_admin() then
    raise exception 'Denetim kararını yalnızca yönetici verebilir' using errcode = '42501';
  end if;
  if new.kind is distinct from old.kind or new.property_id is distinct from old.property_id or new.ref_id is distinct from old.ref_id
     or new.uploader is distinct from old.uploader or new.label is distinct from old.label
     or new.path is distinct from old.path or new.amount is distinct from old.amount then
    raise exception 'Yüklemenin kendisi değiştirilemez' using errcode = '42501';
  end if;
  if new.status = 'rejected' and coalesce(btrim(new.note), '') = '' then
    raise exception 'Red için gerekçe yazılmalı' using errcode = '22023';
  end if;
  if new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end $$;
drop trigger if exists guard_reviews on public.reviews;
create trigger guard_reviews before update on public.reviews
  for each row execute function public.guard_reviews();

-- Karar sonrası: ilgili kayda yansıt ve bildirim gönder.
create or replace function public.on_review_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare pname text := public.prop_name(new.property_id);
begin
  if new.status is not distinct from old.status or new.status = 'pending' then return new; end if;

  if new.kind = 'payment' then
    if new.status = 'approved' then
      perform public.notify_members(new.property_id, 'landlord', pname || ': dekont geldi',
        case when new.ref_id like 'aidat:%' then substr(new.ref_id, 7) || ' aidatı' else new.ref_id || ' kirası' end
          || ' için ' || public.fmt_tl(coalesce(new.amount, 0)) || ' ödendi.',
        '#/kiraci/odemeler', '#/mulk-sahibi/mulk/' || new.property_id || '/odeme', null);
    else
      -- Reddedilen dekont kiracıya gerekçesiyle döner; kiracı yeniden yükleyebilir.
      update public.payments set status = 'rejected', reject_reason = 'Denetim: ' || new.note
       where property_id = new.property_id and public.pay_ref(kind, month) = new.ref_id and status in ('review','partial');
    end if;

  elsif new.kind = 'document' then
    if new.status = 'approved' then
      perform public.notify_members(new.property_id, null, pname || ': yeni belge', new.label,
        '#/kiraci/belgeler', '#/mulk-sahibi/mulk/' || new.property_id || '/belge', new.uploader);
    elsif new.uploader is not null then
      insert into public.notifications (user_id, property_id, title, body, url)
      values (new.uploader, new.property_id, 'Belgen kabul edilmedi', new.label || ': ' || new.note,
              case when public.member_role(new.property_id) = 'landlord' then '#/mulk-sahibi/mulk/' || new.property_id || '/belge' else '#/kiraci/belgeler' end);
    end if;

  elsif new.kind = 'invoice' then
    if new.status = 'approved' then
      perform public.notify_members(new.property_id, 'tenant', pname || ': fatura eklendi', new.label,
        '#/kiraci/talepler/' || new.ref_id, '', null);
    elsif new.uploader is not null then
      insert into public.notifications (user_id, property_id, title, body, url)
      values (new.uploader, new.property_id, 'Faturan kabul edilmedi', new.label || ': ' || new.note,
              '#/mulk-sahibi/mulk/' || new.property_id || '/talep');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists on_review_change on public.reviews;
create trigger on_review_change after update on public.reviews
  for each row execute function public.on_review_change();

-- Yönetici paneli: tüm kullanıcılar (e-postayla). Yalnızca yöneticiye döner.
drop function if exists public.admin_users();
create or replace function public.admin_users()
returns table (id uuid, email text, name text, role text, phone text, created_at timestamptz,
               is_admin boolean, subscribed boolean, expires_at timestamptz,
               banned boolean, ban_reason text, banned_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  return query
    select p.id, u.email::text, p.name, p.role, p.phone, p.created_at,
           exists (select 1 from public.admins a where a.user_id = p.id),
           coalesce(s.active and (s.expires_at is null or s.expires_at > now()), false),
           s.expires_at,
           b.user_id is not null, b.reason, b.banned_at
    from public.profiles p
    left join auth.users u on u.id = p.id
    left join public.subscriptions s on s.user_id = p.id
    left join public.bans b on b.user_id = p.id
    order by p.created_at desc;
end $$;
grant execute on function public.admin_users() to authenticated;

-- Yönetici işlemi kaydı (yalnızca bu dosyadaki yönetici işlevleri çağırır).
create or replace function public.audit(act text, tgt text, det jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.admin_audit (admin_id, action, target, detail) values (auth.uid(), act, tgt, coalesce(det, '{}'::jsonb))
$$;
revoke execute on function public.audit(text, text, jsonb) from public, authenticated;

-- Yasakla / yasağı kaldır. Yönetici kendini ya da başka bir yöneticiyi yasaklayamaz.
-- Yasak, (1) bans satırıyla tüm verilere erişimi keser, (2) Supabase Auth'ta girişi ve token yenilemeyi
-- kapatır, (3) açık oturumları siler. Üçüncü adım Supabase dışı ortamda (testte) atlanır.
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
end $$;
grant execute on function public.admin_set_ban(uuid, boolean, text) to authenticated;

-- Yazışma listesi: mülk başına son mesaj ve sayı (içerik değil, özet). Yalnızca yöneticiye döner.
create or replace function public.admin_threads()
returns table (property_id text, name text, owner_id uuid, owner_name text, tenants text,
               msg_count bigint, last_at timestamptz, last_body text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  return query
    select p.id, p.name, p.owner_id, o.name,
           coalesce((select string_agg(coalesce(nullif(m.display_name, ''), pr.name), ', ')
                     from public.memberships m left join public.profiles pr on pr.id = m.user_id
                     where m.property_id = p.id and m.role = 'tenant'), ''),
           (select count(*) from public.messages x where x.property_id = p.id),
           lm.at, lm.body
    from public.properties p
    left join public.profiles o on o.id = p.owner_id
    left join lateral (select x.at, x.body from public.messages x where x.property_id = p.id order by x.at desc limit 1) lm on true
    where exists (select 1 from public.messages x where x.property_id = p.id)
    order by lm.at desc;
end $$;
grant execute on function public.admin_threads() to authenticated;

-- Bir mülkün yazışması. Her okuma denetim kaydına yazılır.
create or replace function public.admin_messages(pid text, lim int default 300)
returns table (id text, at timestamptz, from_role text, by_user uuid, by_name text, body text, image_path text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  perform public.audit('messages.view', pid);
  return query
    select m.id, m.at, m.from_role, m.by_user, pr.name, m.body, m.image_path
    from public.messages m left join public.profiles pr on pr.id = m.by_user
    where m.property_id = pid
    order by m.at desc limit greatest(1, least(coalesce(lim, 300), 1000));
end $$;
grant execute on function public.admin_messages(text, int) to authenticated;

-- Uygunsuz mesajı siler (içerik kaydı tutulmaz; kim, hangi mülk, ne zaman denetim kaydında kalır).
create or replace function public.admin_delete_message(mid text)
returns void language plpgsql security definer set search_path = public as $$
declare m public.messages;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  select * into m from public.messages where id = mid;
  if m.id is null then raise exception 'Mesaj bulunamadı' using errcode = 'P0002'; end if;
  delete from public.messages where id = mid;
  perform public.audit('message.delete', m.property_id, jsonb_build_object('message', mid, 'by', m.by_user));
end $$;
grant execute on function public.admin_delete_message(text) to authenticated;

create or replace function public.admin_audit_log(lim int default 200)
returns table (id bigint, at timestamptz, admin_name text, action text, target text, detail jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  return query
    select a.id, a.at, pr.name, a.action, a.target, a.detail
    from public.admin_audit a left join public.profiles pr on pr.id = a.admin_id
    order by a.at desc, a.id desc limit greatest(1, least(coalesce(lim, 200), 1000));
end $$;
grant execute on function public.admin_audit_log(int) to authenticated;

-- Yükleme kararları da denetim kaydına düşer.
create or replace function public.audit_review()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected') and auth.uid() is not null then
    perform public.audit('review.' || new.status, new.kind || ':' || new.property_id || ':' || new.ref_id,
                         jsonb_build_object('note', new.note));
  end if;
  return new;
end $$;
drop trigger if exists audit_review on public.reviews;
create trigger audit_review after update on public.reviews
  for each row execute function public.audit_review();

-- Denetim kaydı olmayan eski yüklemeler (bu bölüm eklenmeden önce yüklenenler) onaylı sayılır.
insert into public.reviews (kind, property_id, ref_id, uploader, label, path, amount, status, note)
select 'document', property_id, id, uploaded_by, name, public.storage_path(path), null, 'approved', null from public.documents
on conflict do nothing;
insert into public.reviews (kind, property_id, ref_id, uploader, label, path, amount, status, note)
select 'payment', property_id, public.pay_ref(kind, month), null, receipt_name, receipt_path, amount, 'approved', null
from public.payments where status in ('review','partial','approved','rejected') and (receipt_path is not null or receipt_name <> '')
on conflict do nothing;
insert into public.reviews (kind, property_id, ref_id, uploader, label, path, amount, status, note)
select 'invoice', property_id, id, null, coalesce(invoice ->> 'name', 'fatura'), public.storage_path(invoice ->> 'path'),
       nullif(invoice ->> 'amount', '')::numeric, 'approved', null
from public.requests where invoice is not null
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Yetkiler (Supabase varsayılanlarıyla aynı; açıkça yazıldı)
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke execute on function public.daily_reminders(date) from public;

-- ---------------------------------------------------------------------
-- v4 veri güncellemesi: "Ev sahibi" değeri "Mülk sahibi" oldu.
-- Tekrar çalıştırmak zararsızdır. Talep tetikleyicisi bu sırada kapatılır ki
-- eski kayıtlar için "masraf önerildi" bildirimi gitmesin.
-- ---------------------------------------------------------------------
alter table public.requests disable trigger on_request_change;
update public.requests set cost = 'Mülk sahibi' where cost = 'Ev sahibi';
alter table public.requests enable trigger on_request_change;
update public.properties set aidat_payer = 'Mülk sahibi' where aidat_payer = 'Ev sahibi';
update public.properties set bills = replace(bills::text, '"Ev sahibi"', '"Mülk sahibi"')::jsonb
  where bills::text like '%"Ev sahibi"%';

-- =====================================================================
-- Mülk sahibi aboneliği
--
-- Kiracılar ücretsizdir. Mülk sahibi hesabı açılınca deneme süresi başlar;
-- süre bitince abonelik yoksa kayıtları salt okunur olur (okuma, mesajlaşma,
-- dışa aktarma ve hesap silme açık kalır). Abonelik durumu mağazalardan
-- (App Store, Google Play, web) RevenueCat üzerinden gelir ve yalnızca
-- sunucu fonksiyonu yazar: supabase/functions/billing.
-- =====================================================================

create table if not exists public.subscriptions (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  entitlement    text not null default 'pro',
  product_id     text,
  store          text,             -- app_store | play_store | stripe | rc_billing | promotional
  period_type    text,             -- normal | trial | intro
  expires_at     timestamptz,      -- null: süresiz (ör. promosyon)
  active         boolean not null default false,
  will_renew     boolean not null default false,
  billing_issue  boolean not null default false,
  environment    text,             -- production | sandbox
  updated_at     timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
drop policy if exists subs_read_own on public.subscriptions;
create policy subs_read_own on public.subscriptions for select to authenticated using (user_id = auth.uid());
-- Yazma yetkisi yok: satırları yalnızca service_role (billing fonksiyonu) yazar.
grant select on public.subscriptions to authenticated;
revoke insert, update, delete on public.subscriptions from authenticated;

/** Deneme süresi (gün). Uygulama bu değeri my_access() ile okur. */
create or replace function public.trial_days() returns int language sql immutable as $$ select 30 $$;

/** Kullanıcının erişim durumu: rol, deneme, abonelik. */
create or replace function public.access_state(uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
  s public.subscriptions;
  subscribed boolean;
  trial_end timestamptz;
begin
  select * into p from public.profiles where id = uid;
  if p.id is null then return jsonb_build_object('access', false); end if;
  select * into s from public.subscriptions where user_id = uid;
  subscribed := s.user_id is not null and s.active and (s.expires_at is null or s.expires_at > now());
  trial_end := p.created_at + make_interval(days => public.trial_days());
  return jsonb_build_object(
    'role', p.role,
    'access', p.role = 'tenant' or subscribed or now() < trial_end,
    'subscribed', subscribed,
    'inTrial', not subscribed and now() < trial_end,
    'trialEnds', trial_end,
    'trialDays', public.trial_days(),
    'expiresAt', s.expires_at,
    'store', s.store,
    'productId', s.product_id,
    'willRenew', coalesce(s.will_renew, false),
    'billingIssue', coalesce(s.billing_issue, false)
  );
end $$;

create or replace function public.my_access() returns jsonb
language sql stable security definer set search_path = public as $$ select public.access_state(auth.uid()) $$;
grant execute on function public.my_access() to authenticated;
revoke execute on function public.access_state(uuid) from public;

create or replace function public.has_access(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((public.access_state(uid)->>'access')::boolean, false)
$$;

/** Aboneliği olmayan mülk sahibinin yazmasını engeller. Kiracının işlemleri
    (dekont, talep, yenileme kabulü…) mülk sahibinin aboneliğinden etkilenmez. */
create or replace function public.require_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if (select role from public.profiles where id = auth.uid()) = 'landlord'
     and not public.has_access(auth.uid()) then
    raise exception 'Abonelik gerekli: deneme süren bitti' using errcode = 'EV402';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['properties','payments','rent_history','requests','documents',
                           'expenses','property_shared','invites'] loop
    execute format('drop trigger if exists require_access on public.%I', t);
    execute format('create trigger require_access before insert or update on public.%I
                    for each row execute function public.require_access()', t);
  end loop;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'subscriptions') then
    alter publication supabase_realtime add table public.subscriptions;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Telefon uygulaması bildirimleri: cihaz anahtarları (iOS APNs, Android FCM).
-- Kullanıcı yalnızca kendi cihazlarını görür ve yazar; push fonksiyonu okur.
-- ---------------------------------------------------------------------
create table if not exists public.device_tokens (
  token       text primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  platform    text not null check (platform in ('ios','android')),
  created_at  timestamptz not null default now()
);
create index if not exists device_tokens_user on public.device_tokens (user_id);
alter table public.device_tokens enable row level security;
drop policy if exists device_own on public.device_tokens;
create policy device_own on public.device_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.device_tokens to authenticated;

-- ---------------------------------------------------------------------
-- İç işlevlerin dışarıdan çağrılmasını kapat.
-- Supabase, public şemasındaki işlevleri RPC olarak herkese (anon, authenticated) açar; security definer
-- olan bu üçü RLS'yi aşar. Yabancı biri bildirim gönderebilir, bir yüklemenin denetim durumunu sıfırlayabilirdi.
-- Tetikleyiciler (security definer) sahibin yetkisiyle çalışır; bu kapanıştan etkilenmez.
-- ---------------------------------------------------------------------
revoke execute on function public.notify_members(text, text, text, text, text, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.upsert_review(text, text, text, uuid, text, text, numeric) from public, anon, authenticated;
revoke execute on function public.prop_name(text) from public, anon, authenticated;

-- =====================================================================
-- 12. Ekip, paketler, destek talepleri, işlem kaydı, toplu içe aktarma
-- Bu bölüm önceki bölümlerin üzerine eklenir; tekrar çalıştırmak güvenlidir.
-- =====================================================================

-- ---- Roller: ekip hesabı ve ekip üyeliği ----------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('tenant','landlord','team'));
-- Yöneticinin verdiği ek deneme günü (kullanıcı değiştiremez; guard_profile denetler).
alter table public.profiles add column if not exists extra_trial_days int not null default 0;

alter table public.memberships drop constraint if exists memberships_role_check;
alter table public.memberships add constraint memberships_role_check check (role in ('tenant','landlord','agent','accountant','staff'));

alter table public.invites add column if not exists role  text not null default 'tenant';
alter table public.invites add column if not exists scope text not null default 'property';
alter table public.invites drop constraint if exists invites_role_check;
alter table public.invites add constraint invites_role_check check (role in ('tenant','agent','accountant','staff'));
alter table public.invites drop constraint if exists invites_scope_check;
alter table public.invites add constraint invites_scope_check check (scope in ('property','portfolio'));

alter table public.documents add column if not exists note text not null default '';

-- Mülk sahibinin ekibi. scope 'portfolio': bütün mülkler (sonradan eklenenler dahil); 'property': memberships'teki mülkler.
create table if not exists public.team_members (
  owner_id   uuid not null references public.profiles(id) on delete cascade,
  member_id  uuid not null references public.profiles(id) on delete cascade,
  role       text not null check (role in ('agent','accountant','staff')),
  scope      text not null default 'property' check (scope in ('property','portfolio')),
  created_at timestamptz not null default now(),
  primary key (owner_id, member_id)
);
alter table public.team_members enable row level security;
drop policy if exists team_read on public.team_members;
create policy team_read on public.team_members for select to authenticated
  using (owner_id = auth.uid() or member_id = auth.uid() or public.is_admin());

-- Yeni kullanıcı: kayıt formundaki rol (kiracı, mülk sahibi, ekip).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, name, lang)
  values (
    new.id,
    case new.raw_user_meta_data ->> 'role' when 'landlord' then 'landlord' when 'team' then 'team' else 'tenant' end,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'lang', 'tr')
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Rol ve ek deneme günü kullanıcı tarafından değiştirilemez.
create or replace function public.guard_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.role is distinct from old.role then
    raise exception 'Hesap rolü değiştirilemez' using errcode = '42501';
  end if;
  if auth.uid() is not null and not public.is_admin() and new.extra_trial_days is distinct from old.extra_trial_days then
    raise exception 'Deneme süresi değiştirilemez' using errcode = '42501';
  end if;
  return new;
end $$;

/** Rolün izinleri (uygulamadaki domain/team.js ile aynı). */
create or replace function public.member_can(pid text, perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select case public.member_role(pid)
    when 'landlord'   then true
    when 'agent'      then perm in ('pay','decide','request','message','document','shared','expense_read','expense')
    when 'staff'      then perm in ('request','message','document')
    when 'accountant' then perm in ('expense_read')
    when 'tenant'     then perm in ('pay','request','message','document','shared')
    else false end
$$;
grant execute on function public.member_can(text, text) to authenticated;

-- Yazışmada gönderen rolü: ekip üyesi mülk sahibi tarafında yazar.
create or replace function public.msg_side(pid text)
returns text language sql stable security definer set search_path = public as $$
  select case when public.member_role(pid) = 'tenant' then 'tenant' else 'landlord' end
$$;

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (public.is_member(property_id) and public.member_role(property_id) <> 'accountant');
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (public.member_can(property_id, 'message')
              and by_user = auth.uid()
              and (from_role = 'system' or from_role = public.msg_side(property_id)));

drop policy if exists payments_insert on public.payments;
create policy payments_insert on public.payments for insert to authenticated
  with check (public.member_can(property_id, 'pay'));
drop policy if exists payments_update on public.payments;
create policy payments_update on public.payments for update to authenticated
  using (public.member_can(property_id, 'pay')
         and (public.member_role(property_id) = 'tenant' or public.review_ok('payment', property_id, public.pay_ref(kind, month))))
  with check (public.member_can(property_id, 'pay'));

drop policy if exists requests_insert on public.requests;
create policy requests_insert on public.requests for insert to authenticated
  with check (public.member_can(property_id, 'request'));
drop policy if exists requests_update on public.requests;
create policy requests_update on public.requests for update to authenticated
  using (public.member_can(property_id, 'request')) with check (public.member_can(property_id, 'request'));

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (public.member_can(property_id, 'document') and uploaded_by = auth.uid());
drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated
  using (uploaded_by = auth.uid() or ((public.is_owner(property_id) or public.member_role(property_id) = 'agent') and public.review_ok('document', property_id, id)));
drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated
  using (uploaded_by = auth.uid() or ((public.is_owner(property_id) or public.member_role(property_id) = 'agent') and public.review_ok('document', property_id, id)));

drop policy if exists shared_update on public.property_shared;
create policy shared_update on public.property_shared for update to authenticated
  using (public.member_can(property_id, 'shared')) with check (public.member_can(property_id, 'shared'));

-- Giderler: sahibi ve emlakçı yazar, muhasebeci okur; kiracı ve personel hiç görmez.
drop policy if exists expenses_owner on public.expenses;
drop policy if exists expenses_read on public.expenses;
drop policy if exists expenses_write on public.expenses;
create policy expenses_read on public.expenses for select to authenticated
  using (public.member_can(property_id, 'expense_read'));
create policy expenses_write on public.expenses for all to authenticated
  using (public.member_can(property_id, 'expense')) with check (public.member_can(property_id, 'expense'));

-- Koruma tetikleyicileri: emlakçı mülk sahibi gibi davranır; muhasebeci ve personel yetkisi dışını yazamaz.
create or replace function public.guard_payments()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text := public.member_role(new.property_id);
begin
  if auth.uid() is null or r in ('landlord','agent') or public.is_admin() then return new; end if;
  if r <> 'tenant' then raise exception 'Bu rol ödeme kaydı değiştiremez' using errcode = '42501'; end if;
  if new.kind = 'aidat' and (select aidat_payer from public.properties where id = new.property_id) is distinct from 'Kiracı' then
    raise exception 'Bu mülkün aidatını mülk sahibi öder' using errcode = '42501';
  end if;
  if new.status in ('approved','rejected') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    raise exception 'Ödemeyi yalnızca mülk sahibi onaylayabilir ya da reddedebilir' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then
    raise exception 'Onaylanmış ödeme değiştirilemez' using errcode = '42501';
  end if;
  new.approved_at := case when tg_op = 'UPDATE' then old.approved_at else null end;
  return new;
end $$;

create or replace function public.guard_requests()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text := public.member_role(new.property_id);
begin
  if auth.uid() is null or r in ('landlord','agent','staff') then new.updated_at := now(); return new; end if;
  if r <> 'tenant' then raise exception 'Bu rol talepleri değiştiremez' using errcode = '42501'; end if;
  if new.cost is distinct from old.cost
     or new.decision is distinct from old.decision
     or new.quotes is distinct from old.quotes
     or new.invoice is distinct from old.invoice then
    raise exception 'Masraf, karar, teklif ve faturayı yalnızca mülk sahibi değiştirebilir' using errcode = '42501';
  end if;
  if new.status <> old.status and new.status <> 3 then
    raise exception 'Kiracı talebi yalnızca kapatabilir' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Ortak alan koruması: emlakçı mülk sahibi tarafındadır.
create or replace function public.guard_shared()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r text := case when public.member_role(new.property_id) = 'tenant' then 'tenant' else 'landlord' end;
  other_flag text;
begin
  if auth.uid() is null then new.updated_at := now(); return new; end if;
  if not public.member_can(new.property_id, 'shared') then
    raise exception 'Bu rol tutanak ve çıkış kaydını değiştiremez' using errcode = '42501';
  end if;
  other_flag := case when r = 'tenant' then 'landlordOk' else 'tenantOk' end;
  if coalesce((new.inspect ->> other_flag)::boolean, false)
     and not coalesce((old.inspect ->> other_flag)::boolean, false) then
    raise exception 'Karşı tarafın tutanak onayı verilemez' using errcode = '42501';
  end if;
  if new.move_out is not null then
    if coalesce((new.move_out ->> other_flag)::boolean, false)
       and not coalesce((old.move_out ->> other_flag)::boolean, false) then
      raise exception 'Karşı tarafın çıkış onayı verilemez' using errcode = '42501';
    end if;
    if r = 'tenant' and ((new.move_out -> 'deductions') is distinct from (old.move_out -> 'deductions')
                         or (new.move_out -> 'refunded') is distinct from (old.move_out -> 'refunded')) then
      raise exception 'Kesinti ve iadeyi yalnızca mülk sahibi girebilir' using errcode = '42501';
    end if;
  end if;
  if r = 'tenant' and old.move_out is not null and new.move_out is null then
    raise exception 'Çıkış sürecini yalnızca mülk sahibi iptal edebilir' using errcode = '42501';
  end if;
  if r = 'tenant' and new.renewal is distinct from old.renewal then
    if old.renewal is null or (old.renewal ->> 'status') <> 'sent' or (new.renewal ->> 'status') <> 'accepted'
       or (new.renewal - 'status') is distinct from (old.renewal - 'status') then
      raise exception 'Kiracı yenileme teklifini yalnızca kabul edebilir' using errcode = '42501';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Yeni mülk: sahibi üye olur; tüm portföye atanmış ekip üyeleri de eklenir.
create or replace function public.handle_new_property()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.memberships (property_id, user_id, role, display_name)
  select new.id, new.owner_id, 'landlord', p.name from public.profiles p where p.id = new.owner_id
  on conflict do nothing;
  insert into public.memberships (property_id, user_id, role, display_name)
  select new.id, t.member_id, t.role, p.name from public.team_members t join public.profiles p on p.id = t.member_id
  where t.owner_id = new.owner_id and t.scope = 'portfolio'
  on conflict do nothing;
  insert into public.property_shared (property_id) values (new.id) on conflict do nothing;
  insert into public.rent_history (id, property_id, from_date, amount, note)
  values (new.id || ':' || new.start_date, new.id, new.start_date, new.rent, 'Sözleşme başlangıcı')
  on conflict do nothing;
  return new;
end $$;

-- ---- İşlem kaydı ----------------------------------------------------
create table if not exists public.activity (
  id          bigserial primary key,
  owner_id    uuid references public.profiles(id) on delete cascade,
  property_id text references public.properties(id) on delete set null,
  actor       uuid references public.profiles(id) on delete set null,
  actor_role  text,
  entity      text not null,
  action      text not null,
  ref         text not null default '',
  detail      jsonb not null default '{}'::jsonb,
  at          timestamptz not null default now()
);
create index if not exists activity_owner_at on public.activity (owner_id, at desc);
alter table public.activity enable row level security;
drop policy if exists activity_none on public.activity;  -- okuma activity_feed() ile

create or replace function public.log_activity(pid text, ent text, act text, rf text, det jsonb, own uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare o uuid := coalesce(own, (select owner_id from public.properties where id = pid));
begin
  if auth.uid() is null then return; end if;
  -- Hesap silinirken (profil ve evler zincirleme silinir) kayıt yazılmaz; yoksa yabancı anahtar hatası silmeyi durdurur.
  if not exists (select 1 from public.profiles where id = auth.uid()) then return; end if;
  if o is not null and not exists (select 1 from public.profiles where id = o) then return; end if;
  insert into public.activity (owner_id, property_id, actor, actor_role, entity, action, ref, detail)
  values (o, pid, auth.uid(),
          coalesce(public.member_role(pid), (select role from public.profiles where id = auth.uid())), ent, act, coalesce(rf, ''), coalesce(det, '{}'::jsonb));
end $$;
revoke execute on function public.log_activity(text, text, text, text, jsonb, uuid) from public, anon, authenticated;

/** Satır değişikliğini kaydeder; güncellemede yalnızca değişen alanlar yazılır. */
create or replace function public.track_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  n jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  o jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  rec jsonb := case when tg_op = 'DELETE' then o else n end;
  pid text := coalesce(rec ->> 'property_id', case when tg_table_name = 'properties' then rec ->> 'id' end);
  det jsonb := '{}'::jsonb;
  k text;
begin
  if auth.uid() is null then return null; end if;
  -- Mülk silinirken bağlı satırların silinmesi ayrıca kaydedilmez (mülk artık yok).
  if tg_op = 'DELETE' and tg_table_name <> 'properties' and not exists (select 1 from public.properties where id = pid) then return null; end if;
  if tg_op = 'UPDATE' then
    for k in select key from jsonb_each(n) loop
      if k not in ('updated_at') and (n -> k) is distinct from (o -> k) then det := det || jsonb_build_object(k, n -> k); end if;
    end loop;
    if det = '{}'::jsonb then return null; end if;
  else
    det := rec - 'body' - 'inspect';
  end if;
  perform public.log_activity(case when tg_table_name = 'properties' and tg_op = 'DELETE' then null else pid end,
    tg_table_name, lower(tg_op), coalesce(rec ->> 'month', rec ->> 'id', rec ->> 'code', ''), det,
    case when tg_table_name = 'properties' then (rec ->> 'owner_id')::uuid end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['payments','requests','documents','expenses','property_shared','properties','rent_history','memberships','invites'] loop
    execute format('drop trigger if exists track_activity on public.%I', t);
    execute format('create trigger track_activity after insert or update or delete on public.%I
                    for each row execute function public.track_activity()', t);
  end loop;
end $$;

/** Mülk sahibinin (ya da ekip üyesinin eriştiği mülklerin) işlem kaydı. */
create or replace function public.activity_feed(lim int default 200, pid text default null)
returns table (id bigint, property_id text, actor_name text, actor_role text, entity text, action text, ref text, detail jsonb, at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.property_id, p.name, a.actor_role, a.entity, a.action, a.ref, a.detail, a.at
  from public.activity a left join public.profiles p on p.id = a.actor
  where (pid is null or a.property_id = pid)
    and (a.owner_id = auth.uid()
         or (a.property_id is not null and public.member_role(a.property_id) in ('landlord','agent','accountant','staff')))
  order by a.at desc
  limit least(greatest(lim, 1), 1000)
$$;
grant execute on function public.activity_feed(int, text) to authenticated;

-- ---- Davet kabulü (kiracı ya da ekip) --------------------------------
create or replace function public.accept_invite(invite_code text)
returns text language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
  me  public.profiles;
  pid text;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  if public.is_banned() then raise exception 'Hesap askıya alındı' using errcode = '42501'; end if;

  select * into inv from public.invites where code = upper(trim(invite_code)) for update;
  if inv.code is null then raise exception 'Davet kodu bulunamadı' using errcode = 'P0002'; end if;
  if inv.accepted_by is not null and inv.accepted_by <> me.id then raise exception 'Bu davet kullanılmış' using errcode = '22023'; end if;
  if inv.expires_at < now() then raise exception 'Davetin süresi dolmuş' using errcode = '22023'; end if;

  if inv.role = 'tenant' then
    if me.role <> 'tenant' then raise exception 'Bu davet kiracı hesapları içindir' using errcode = '22023'; end if;
    insert into public.memberships (property_id, user_id, role, display_name, phone, email)
    values (inv.property_id, me.id, 'tenant', coalesce(nullif(me.name, ''), inv.name), coalesce(nullif(me.phone, ''), inv.phone),
            coalesce((select email from auth.users where id = me.id), inv.email))
    on conflict (property_id, user_id) do nothing;
    insert into public.messages (id, property_id, from_role, by_user, body)
    values (gen_random_uuid()::text, inv.property_id, 'system', null, me.name || ' eve katıldı');
  else
    if me.role not in ('team','landlord') then raise exception 'Ekip davetleri ekip ya da mülk sahibi hesapları içindir' using errcode = '22023'; end if;
    if me.id = inv.created_by then raise exception 'Kendi davetini kullanamazsın' using errcode = '22023'; end if;
    insert into public.team_members (owner_id, member_id, role, scope) values (inv.created_by, me.id, inv.role, inv.scope)
    on conflict (owner_id, member_id) do update set role = excluded.role,
      scope = case when public.team_members.scope = 'portfolio' then 'portfolio' else excluded.scope end;
    for pid in select id from public.properties
               where owner_id = inv.created_by and (inv.scope = 'portfolio' or id = inv.property_id) loop
      insert into public.memberships (property_id, user_id, role, display_name, email)
      values (pid, me.id, inv.role, me.name, coalesce((select email from auth.users where id = me.id), ''))
      on conflict (property_id, user_id) do update set role = excluded.role where public.memberships.role <> 'landlord';
    end loop;
    perform public.log_activity(inv.property_id, 'team', 'join', me.id::text, jsonb_build_object('role', inv.role, 'scope', inv.scope), inv.created_by);
  end if;

  update public.invites set accepted_by = me.id, accepted_at = now() where code = inv.code;
  return inv.property_id;
end $$;
grant execute on function public.accept_invite(text) to authenticated;

/** Davet kodunun sahibini oturum açmadan gösterir (/katil sayfası). Kişisel veri dönmez. */
create or replace function public.invite_preview(invite_code text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('role', i.role, 'scope', i.scope, 'owner', o.name, 'property', p.name,
                            'valid', i.accepted_by is null and i.expires_at > now())
  from public.invites i join public.properties p on p.id = i.property_id join public.profiles o on o.id = i.created_by
  where i.code = upper(trim(invite_code))
$$;
grant execute on function public.invite_preview(text) to anon, authenticated;

/** Mülk sahibinin ekibi: kişi, rol, kapsam ve atandığı mülkler. */
create or replace function public.team_list()
returns table (user_id uuid, name text, email text, role text, scope text, property_ids text[], created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.member_id, p.name, u.email::text, t.role, t.scope,
         coalesce(array(select m.property_id from public.memberships m join public.properties pr on pr.id = m.property_id
                        where m.user_id = t.member_id and pr.owner_id = t.owner_id), '{}'), t.created_at
  from public.team_members t join public.profiles p on p.id = t.member_id left join auth.users u on u.id = t.member_id
  where t.owner_id = auth.uid()
  order by t.created_at
$$;
grant execute on function public.team_list() to authenticated;

/** Rol ve kapsamı değiştirir; 'property' kapsamında yalnız pids mülklerine erişir. */
create or replace function public.team_set(member uuid, new_role text, new_scope text, pids text[] default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.team_members where owner_id = auth.uid() and member_id = member) then
    raise exception 'Bu kişi ekibinde değil' using errcode = '42501';
  end if;
  if new_role not in ('agent','accountant','staff') or new_scope not in ('property','portfolio') then
    raise exception 'Geçersiz rol' using errcode = '22023';
  end if;
  update public.team_members set role = new_role, scope = new_scope where owner_id = auth.uid() and member_id = member;
  delete from public.memberships m using public.properties p
   where m.property_id = p.id and p.owner_id = auth.uid() and m.user_id = member and m.role <> 'landlord'
     and new_scope = 'property' and not (m.property_id = any(pids));
  insert into public.memberships (property_id, user_id, role, display_name)
  select p.id, member, new_role, pr.name from public.properties p join public.profiles pr on pr.id = member
  where p.owner_id = auth.uid() and (new_scope = 'portfolio' or p.id = any(pids))
  on conflict (property_id, user_id) do update set role = excluded.role where public.memberships.role <> 'landlord';
  perform public.log_activity(null, 'team', 'set', member::text, jsonb_build_object('role', new_role, 'scope', new_scope), auth.uid());
end $$;
grant execute on function public.team_set(uuid, text, text, text[]) to authenticated;

/** Ekipten çıkarır. owner verilirse ekip üyesi o mülk sahibinin ekibinden kendisi ayrılır. */
create or replace function public.team_remove(member uuid, owner uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare own uuid := coalesce(owner, auth.uid());
begin
  if own <> auth.uid() and member <> auth.uid() then raise exception 'Yetki yok' using errcode = '42501'; end if;
  delete from public.team_members where owner_id = own and member_id = member;
  delete from public.memberships m using public.properties p
   where m.property_id = p.id and p.owner_id = own and m.user_id = member and m.role in ('agent','accountant','staff');
  perform public.log_activity(null, 'team', 'remove', member::text, '{}'::jsonb, own);
end $$;
grant execute on function public.team_remove(uuid, uuid) to authenticated;

-- Ekip üyeleri mülk sahibinin davet listesini okumaz; mülk sahibi kendi ekip davetlerini görür ve siler (invites_owner).

-- ---- Okundu bilgisi -------------------------------------------------
create table if not exists public.message_reads (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  property_id text not null references public.properties(id) on delete cascade,
  read_at     timestamptz not null default now(),
  primary key (user_id, property_id)
);
alter table public.message_reads enable row level security;
drop policy if exists reads_own on public.message_reads;
create policy reads_own on public.message_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(property_id));

-- ---- Destek talepleri ("Bize ulaş") ---------------------------------
create table if not exists public.support_requests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete set null default auth.uid(),
  kind       text not null default 'genel' check (kind in ('kurumsal','import','upgrade','genel')),
  units      int,
  name       text not null default '',
  email      text not null default '',
  phone      text not null default '',
  message    text not null default '' check (length(message) <= 4000),
  status     text not null default 'open' check (status in ('open','done')),
  created_at timestamptz not null default now()
);
alter table public.support_requests enable row level security;
drop policy if exists support_insert on public.support_requests;
drop policy if exists support_read on public.support_requests;
drop policy if exists support_admin on public.support_requests;
create policy support_insert on public.support_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'open');
create policy support_read on public.support_requests for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy support_admin on public.support_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create or replace function public.audit_support()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() and new.status is distinct from old.status then
    perform public.audit(case when new.status = 'done' then 'support.done' else 'support.open' end, new.id::text, jsonb_build_object('kind', new.kind));
  end if;
  return new;
end $$;
drop trigger if exists audit_support on public.support_requests;
create trigger audit_support after update on public.support_requests for each row execute function public.audit_support();

-- ---- Paketler ve mülk sınırı ----------------------------------------
-- Paket: subscriptions.product_id 'tek' | 'bes' | 'kurumsal' (mağaza ürün kimliği bu sözcükleri içerebilir).
-- Yöneticinin elle verdiği paket store = 'admin' olarak yazılır.
create or replace function public.plan_of(product text)
returns text language sql immutable as $$
  select case when product ~* 'kurumsal' then 'kurumsal' when product ~* '(^|[._-])bes' then 'bes'
              when product ~* '(^|[._-])tek' then 'tek' else 'pro' end
$$;
create or replace function public.plan_units(plan text)
returns int language sql immutable as $$
  select case plan when 'tek' then 1 when 'bes' then 5 when 'trial' then 5 else null end
$$;

create or replace function public.access_state(uid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.profiles;
  s public.subscriptions;
  subscribed boolean;
  trial_end timestamptz;
  plan text;
begin
  select * into p from public.profiles where id = uid;
  if p.id is null then return jsonb_build_object('access', false); end if;
  select * into s from public.subscriptions where user_id = uid;
  subscribed := s.user_id is not null and s.active and (s.expires_at is null or s.expires_at > now());
  trial_end := p.created_at + make_interval(days => public.trial_days() + coalesce(p.extra_trial_days, 0));
  plan := case when subscribed then public.plan_of(s.product_id) when now() < trial_end then 'trial' else null end;
  return jsonb_build_object(
    'role', p.role,
    -- Etkin bir kurumun yöneticisi kurumun sözleşmesiyle erişir (16. bölüm).
    'access', p.role in ('tenant','team') or subscribed or now() < trial_end
              or exists (select 1 from public.org_members m join public.organizations o on o.id = m.org_id
                         where m.user_id = uid and o.status = 'active' and (o.contract_until is null or o.contract_until >= current_date)),
    'subscribed', subscribed,
    'inTrial', not subscribed and now() < trial_end,
    'trialEnds', trial_end,
    'trialDays', public.trial_days(),
    'plan', plan,
    'units', public.plan_units(plan),
    'expiresAt', s.expires_at,
    'store', s.store,
    'productId', s.product_id,
    'willRenew', coalesce(s.will_renew, false),
    'billingIssue', coalesce(s.billing_issue, false)
  );
end $$;

/** Paket sınırı: mülk sahibinin mülk sayısı paketindeki sınırı aşamaz. */
create or replace function public.guard_unit_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim int;
begin
  if auth.uid() is null or public.is_admin() then return new; end if;
  lim := (public.access_state(new.owner_id) ->> 'units')::int;
  if lim is not null and (select count(*) from public.properties where owner_id = new.owner_id) >= lim then
    raise exception 'Paket sınırı: en fazla % mülk', lim using errcode = 'EV403';
  end if;
  return new;
end $$;
drop trigger if exists guard_unit_limit on public.properties;
create trigger guard_unit_limit before insert on public.properties for each row execute function public.guard_unit_limit();

-- ---- Toplu içe aktarma ----------------------------------------------
/** items: [{line, update_id, name, addr, type, area, rent, due_day, aidat, aidat_payer, deposit, deposit_kind,
             start_date, contract_end, dask, stopaj, company, tenant_name, tenant_phone, tenant_email}]
    Tek işlemde eklenir; bir satır hata verirse hiçbiri kaydedilmez. Kiracı bilgisi olan yeni mülk için davet kodu döner. */
create or replace function public.import_properties(items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  it jsonb; pid text; new_code text; res jsonb := '[]'::jsonb; has_tenant boolean;
begin
  if (select role from public.profiles where id = auth.uid()) <> 'landlord' then
    raise exception 'Toplu içe aktarma mülk sahipleri içindir' using errcode = '42501';
  end if;
  if jsonb_array_length(items) > 50 then raise exception 'Tek seferde en fazla 50 mülk aktarılabilir' using errcode = '22023'; end if;
  for it in select * from jsonb_array_elements(items) loop
    new_code := null;
    has_tenant := coalesce(it ->> 'tenant_name', '') <> '' or coalesce(it ->> 'tenant_phone', '') <> '' or coalesce(it ->> 'tenant_email', '') <> '';
    if coalesce(it ->> 'update_id', '') <> '' then
      pid := it ->> 'update_id';
      if not public.is_owner(pid) then raise exception 'Güncellenecek mülk bulunamadı' using errcode = '42501'; end if;
      update public.properties set
        addr = coalesce(nullif(it ->> 'addr', ''), addr), prop_type = coalesce(it ->> 'type', prop_type),
        area = coalesce((it ->> 'area')::numeric, area), rent = coalesce((it ->> 'rent')::numeric, rent),
        due_day = coalesce((it ->> 'due_day')::int, due_day), aidat = coalesce((it ->> 'aidat')::numeric, aidat),
        aidat_payer = coalesce(it ->> 'aidat_payer', aidat_payer), deposit = coalesce((it ->> 'deposit')::numeric, deposit),
        deposit_kind = coalesce(it ->> 'deposit_kind', deposit_kind), start_date = coalesce((it ->> 'start_date')::date, start_date),
        contract_end = coalesce((it ->> 'contract_end')::date, contract_end), dask = coalesce((it ->> 'dask')::date, dask),
        stopaj = coalesce((it ->> 'stopaj')::boolean, stopaj), company = coalesce(it -> 'company', company)
      where id = pid;
    else
      insert into public.properties (owner_id, name, addr, prop_type, area, rent, due_day, aidat, aidat_payer, deposit, deposit_kind,
                                     start_date, contract_end, dask, stopaj, company)
      values (auth.uid(), it ->> 'name', coalesce(it ->> 'addr', ''), coalesce(it ->> 'type', 'Konut'), (it ->> 'area')::numeric,
              coalesce((it ->> 'rent')::numeric, 0), coalesce((it ->> 'due_day')::int, 1), coalesce((it ->> 'aidat')::numeric, 0),
              coalesce(it ->> 'aidat_payer', 'Kiracı'), coalesce((it ->> 'deposit')::numeric, 0), coalesce(it ->> 'deposit_kind', 'Nakit'),
              coalesce((it ->> 'start_date')::date, current_date), coalesce((it ->> 'contract_end')::date, (current_date + interval '1 year')::date),
              (it ->> 'dask')::date, coalesce((it ->> 'stopaj')::boolean, false),
              case when jsonb_typeof(it -> 'company') = 'object' then it -> 'company' end)
      returning id into pid;
      if has_tenant then
        insert into public.invites (property_id, name, email, phone, created_by)
        values (pid, coalesce(it ->> 'tenant_name', ''), coalesce(it ->> 'tenant_email', ''), coalesce(it ->> 'tenant_phone', ''), auth.uid())
        returning invites.code into new_code;
      end if;
    end if;
    res := res || jsonb_build_object('id', pid, 'line', it -> 'line', 'name', it ->> 'name', 'code', new_code,
                                     'phone', coalesce(it ->> 'tenant_phone', ''), 'tenant', coalesce(it ->> 'tenant_name', ''));
  end loop;
  return res;
end $$;
grant execute on function public.import_properties(jsonb) to authenticated;

-- ---- Yönetici: göstergeler, abonelikler, deneme ve paket ------------
create or replace function public.admin_kpis(days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d int := least(greatest(days, 1), 365);
  res jsonb;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  with owners as (
    select p.id, public.access_state(p.id) a,
           exists (select 1 from public.activity x where x.actor = p.id and x.at > now() - interval '30 days') active
    from public.profiles p where p.role = 'landlord'
  )
  select jsonb_build_object(
    'days', d,
    'users', (select jsonb_build_object('total', count(*), 'landlords', count(*) filter (where role = 'landlord'),
                                        'tenants', count(*) filter (where role = 'tenant'), 'team', count(*) filter (where role = 'team'))
              from public.profiles),
    'signups', jsonb_build_object(
       'period', (select count(*) from public.profiles where created_at > now() - make_interval(0, 0, 0, d)),
       'prev', (select count(*) from public.profiles where created_at <= now() - make_interval(0, 0, 0, d)
                                                       and created_at > now() - make_interval(0, 0, 0, 2 * d))),
    'owners', (select jsonb_build_object('total', count(*),
                 'paying', count(*) filter (where (a ->> 'subscribed')::boolean),
                 'trial', count(*) filter (where (a ->> 'inTrial')::boolean),
                 'expiring', count(*) filter (where (a ->> 'inTrial')::boolean and (a ->> 'trialEnds')::timestamptz < now() + interval '7 days'),
                 'active', count(*) filter (where active),
                 'lapsed', count(*) filter (where not (a ->> 'access')::boolean)) from owners),
    'plans', (select coalesce(jsonb_object_agg(plan, n), '{}'::jsonb) from
               (select a ->> 'plan' plan, count(*) n from owners where (a ->> 'subscribed')::boolean group by 1) x),
    'billingIssues', (select count(*) from public.subscriptions where billing_issue),
    'cancelling', (select count(*) from public.subscriptions where active and not will_renew and store <> 'admin'),
    'units', jsonb_build_object('total', (select count(*) from public.properties),
                                'connected', (select count(distinct property_id) from public.memberships where role = 'tenant')),
    'rent', jsonb_build_object(
       'month', (select coalesce(sum(amount), 0) from public.payments where kind = 'kira' and status in ('approved','partial') and month = to_char(now(), 'YYYY-MM')),
       'prevMonth', (select coalesce(sum(amount), 0) from public.payments where kind = 'kira' and status in ('approved','partial') and month = to_char(now() - interval '1 month', 'YYYY-MM'))),
    'supportOpen', (select count(*) from public.support_requests where status = 'open'),
    -- Aktivasyon hunisi: mülk sahibi → mülk ekledi → kiracı bağlandı → onaylı ödeme aldı.
    'funnel', (select jsonb_build_object(
       'owners', count(*),
       'withProperty', count(*) filter (where exists (select 1 from public.properties pr where pr.owner_id = o.id)),
       'withTenant', count(*) filter (where exists (select 1 from public.properties pr join public.memberships m on m.property_id = pr.id
                                                     where pr.owner_id = o.id and m.role = 'tenant')),
       'withPayment', count(*) filter (where exists (select 1 from public.properties pr join public.payments pa on pa.property_id = pr.id
                                                      where pr.owner_id = o.id and pa.status in ('approved','partial'))))
       from public.profiles o where o.role = 'landlord'),
    -- Etkin kullanıcı: son 7 / 30 günde en az bir işlem yapan (mülk sahibi, kiracı, ekip).
    'activeUsers', jsonb_build_object(
       'week', (select count(distinct actor) from public.activity where at > now() - interval '7 days'),
       'month', (select count(distinct actor) from public.activity where at > now() - interval '30 days')),
    -- Kiracı davetleri: dönemde oluşturulan ve kabul edilen.
    'invites', jsonb_build_object(
       'created', (select count(*) from public.invites where role = 'tenant' and created_at > now() - make_interval(0, 0, 0, d)),
       'accepted', (select count(*) from public.invites where role = 'tenant' and accepted_at > now() - make_interval(0, 0, 0, d))),
    -- Arıza / tadilat talepleri.
    'requests', jsonb_build_object(
       'open', (select count(*) from public.requests where status < 3),
       'done', (select count(*) from public.requests where status = 3),
       'period', (select count(*) from public.requests where req_date > current_date - d)),
    -- Geçen ayın ödemeleri: vadesinde (ödeme günü ≤ vade günü) ya da geç.
    'punctuality', (select jsonb_build_object(
       'onTime', count(*) filter (where pa.paid_on <= make_date(split_part(pa.month, '-', 1)::int, split_part(pa.month, '-', 2)::int, least(greatest(pr.due_day, 1), 28))),
       'late', count(*) filter (where pa.paid_on > make_date(split_part(pa.month, '-', 1)::int, split_part(pa.month, '-', 2)::int, least(greatest(pr.due_day, 1), 28))))
       from public.payments pa join public.properties pr on pr.id = pa.property_id
       where pa.kind = 'kira' and pa.status in ('approved','partial') and pa.paid_on is not null and pa.month = to_char(now() - interval '1 month', 'YYYY-MM')),
    'series', (select coalesce(jsonb_agg(jsonb_build_object('d', g::date,
                 'landlords', (select count(*) from public.profiles where role = 'landlord' and created_at::date = g::date),
                 'tenants', (select count(*) from public.profiles where role <> 'landlord' and created_at::date = g::date)) order by g), '[]'::jsonb)
               from generate_series(current_date - (d - 1), current_date, interval '1 day') g)
  ) into res;
  return res;
end $$;
grant execute on function public.admin_kpis(int) to authenticated;

create or replace function public.admin_subscriptions()
returns table (id uuid, name text, email text, created_at timestamptz, subscribed boolean, in_trial boolean, trial_ends timestamptz,
               extra_days int, plan text, store text, expires_at timestamptz, will_renew boolean, billing_issue boolean,
               banned boolean, units bigint, tenants bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  return query
    select p.id, p.name, u.email::text, p.created_at,
           (a ->> 'subscribed')::boolean, (a ->> 'inTrial')::boolean, (a ->> 'trialEnds')::timestamptz,
           p.extra_trial_days, a ->> 'plan', s.store, s.expires_at, coalesce(s.will_renew, false), coalesce(s.billing_issue, false),
           exists (select 1 from public.bans b where b.user_id = p.id),
           (select count(*) from public.properties pr where pr.owner_id = p.id),
           (select count(*) from public.memberships m join public.properties pr on pr.id = m.property_id
             where pr.owner_id = p.id and m.role = 'tenant')
    from public.profiles p
    cross join lateral (select public.access_state(p.id) a) st
    left join auth.users u on u.id = p.id
    left join public.subscriptions s on s.user_id = p.id
    where p.role = 'landlord'
    order by p.created_at desc;
end $$;
grant execute on function public.admin_subscriptions() to authenticated;

create or replace function public.admin_extend_trial(uid uuid, add_days int, why text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  if add_days not between 1 and 90 then raise exception 'Uzatma 1 ile 90 gün arasında olmalı' using errcode = '22023'; end if;
  if (select role from public.profiles where id = uid) <> 'landlord' then
    raise exception 'Deneme yalnızca mülk sahipleri için uzatılır' using errcode = '22023';
  end if;
  update public.profiles set extra_trial_days = extra_trial_days + add_days where id = uid;
  perform public.audit('trial.extend', uid::text, jsonb_build_object('days', add_days, 'reason', why));
end $$;
grant execute on function public.admin_extend_trial(uuid, int, text) to authenticated;

/** Paket ver (plan: tek | bes | kurumsal) ya da kaldır (plan boş). until boşsa süresiz. */
create or replace function public.admin_set_plan(uid uuid, plan text, until timestamptz, why text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  if coalesce(plan, '') = '' then
    delete from public.subscriptions where user_id = uid and store = 'admin';
  elsif plan not in ('tek','bes','kurumsal') then
    raise exception 'Geçersiz paket' using errcode = '22023';
  else
    insert into public.subscriptions (user_id, entitlement, product_id, store, expires_at, active, will_renew, updated_at)
    values (uid, 'pro', plan, 'admin', until, true, false, now())
    on conflict (user_id) do update set product_id = excluded.product_id, store = 'admin', expires_at = excluded.expires_at,
      active = true, will_renew = false, billing_issue = false, updated_at = now();
  end if;
  perform public.audit('plan.set', uid::text, jsonb_build_object('plan', nullif(plan, ''), 'until', until, 'reason', why));
end $$;
grant execute on function public.admin_set_plan(uuid, text, timestamptz, text) to authenticated;

do $$
begin
  execute 'drop policy if exists not_banned on public.team_members';
  execute 'create policy not_banned on public.team_members as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned())';
  execute 'drop policy if exists not_banned on public.support_requests';
  execute 'create policy not_banned on public.support_requests as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned())';
end $$;

-- ---------------------------------------------------------------------
-- 13. Aylık ve yıllık rapor e-postası (Kurumsal)
-- ---------------------------------------------------------------------
-- `report` Edge Function'ı her ayın 1'inde (ve 1 Ocak'ta yıllık) bu iki fonksiyonu
-- service_role ile çağırır; uygulama kullanıcıları çağıramaz.

/** Raporu alacak mülk sahipleri: Kurumsal (ya da deneme) paketinde ve ayarı kapatmamış olanlar. */
create or replace function public.report_recipients(period text)
returns table (user_id uuid, email text, name text, lang text)
language sql stable security definer set search_path = public as $$
  select p.id, u.email::text, p.name, p.lang
    from public.profiles p join auth.users u on u.id = p.id
   where p.role = 'landlord'
     and not exists (select 1 from public.bans b where b.user_id = p.id)
     and (public.access_state(p.id) ->> 'plan') in ('kurumsal', 'pro', 'trial')
     and coalesce((p.settings ->> case when period = 'year' then 'reportYearly' else 'reportMonthly' end)::boolean, true)
     and exists (select 1 from public.properties x where x.owner_id = p.id)
$$;

/** Bir mülk sahibinin dönem özeti. period: 'month' (ref'in ayı) | 'year' (ref'in yılı). */
create or replace function public.owner_report(uid uuid, period text, ref date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d0 date := case when period = 'year' then date_trunc('year', ref)::date else date_trunc('month', ref)::date end;
  d1 date := case when period = 'year' then (date_trunc('year', ref) + interval '1 year')::date else (date_trunc('month', ref) + interval '1 month')::date end;
  months text[];
  props jsonb;
begin
  select array_agg(to_char(m, 'YYYY-MM')) into months from generate_series(d0, d1 - 1, interval '1 month') m;
  with pr as (
    select p.*,
           -- Dönemde kiralı olduğu ay sayısı: sözleşme aralığıyla kesişen aylar.
           (select count(*) from unnest(months) mm where to_date(mm, 'YYYY-MM') >= date_trunc('month', p.start_date)
                                                   and to_date(mm, 'YYYY-MM') <= p.contract_end) as active_months,
           exists (select 1 from public.memberships m where m.property_id = p.id and m.role = 'tenant') as has_tenant
      from public.properties p where p.owner_id = uid
  ), pay as (
    select pr.id, coalesce(sum(y.amount) filter (where y.status in ('approved', 'partial')), 0) as collected,
           count(*) filter (where y.status = 'approved') as paid_months
      from pr left join public.payments y on y.property_id = pr.id and y.month = any (months) and y.kind = 'kira'
     group by pr.id
  ), exp as (
    select pr.id, coalesce(sum(e.amount), 0) as spent
      from pr left join public.expenses e on e.property_id = pr.id and e.spent_on >= d0 and e.spent_on < d1
     group by pr.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', pr.name, 'rent', pr.rent, 'expected', pr.rent * pr.active_months,
           'collected', pay.collected, 'spent', exp.spent, 'paidMonths', pay.paid_months,
           'activeMonths', pr.active_months, 'hasTenant', pr.has_tenant, 'contractEnd', pr.contract_end)
         order by pr.name), '[]'::jsonb)
    into props
    from pr join pay on pay.id = pr.id join exp on exp.id = pr.id;

  return jsonb_build_object(
    'period', period, 'from', d0, 'to', d1 - 1,
    'properties', props,
    'units', jsonb_array_length(props),
    'occupied', (select count(*) from jsonb_array_elements(props) x where (x ->> 'hasTenant')::boolean),
    'expected', (select coalesce(sum((x ->> 'expected')::numeric), 0) from jsonb_array_elements(props) x),
    'collected', (select coalesce(sum((x ->> 'collected')::numeric), 0) from jsonb_array_elements(props) x),
    'spent', (select coalesce(sum((x ->> 'spent')::numeric), 0) from jsonb_array_elements(props) x),
    'requests', jsonb_build_object(
      'opened', (select count(*) from public.requests r join public.properties p on p.id = r.property_id
                  where p.owner_id = uid and r.req_date >= d0 and r.req_date < d1),
      'done', (select count(*) from public.requests r join public.properties p on p.id = r.property_id
                where p.owner_id = uid and r.status = 3 and r.updated_at >= d0 and r.updated_at < d1),
      'open', (select count(*) from public.requests r join public.properties p on p.id = r.property_id
                where p.owner_id = uid and r.status < 3)),
    'renewals', (select count(*) from public.properties p where p.owner_id = uid
                   and p.contract_end >= d1 and p.contract_end < d1 + 90)
  );
end $$;

revoke execute on function public.report_recipients(text) from public, anon, authenticated;
revoke execute on function public.owner_report(uuid, text, date) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.report_recipients(text) to service_role;
    grant execute on function public.owner_report(uuid, text, date) to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 14. Kurumsal paket başvuru formu (sitedeki "Bize ulaşın")
-- ---------------------------------------------------------------------
-- Başvurular "Bize ulaş" talepleriyle aynı tabloya düşer (yönetici paneli → Talepler).
-- Oturumsuz ziyaretçi de gönderebilir; doğrudan tablo yetkisi yok, yalnız submit_lead işlevi yazar.
-- info@anahtar.io'ya e-posta: supabase/functions/lead-mail (Database Webhook, support_requests INSERT).
alter table public.support_requests add column if not exists company text not null default '' check (length(company) <= 160);
alter table public.support_requests add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.support_requests add column if not exists source  text not null default 'app' check (source in ('app','web'));

create or replace function public.submit_lead(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  nm text := btrim(coalesce(p ->> 'name', ''));
  em text := lower(btrim(coalesce(p ->> 'email', '')));
  ph text := btrim(coalesce(p ->> 'phone', ''));
  co text := btrim(coalesce(p ->> 'company', ''));
  msg text := btrim(coalesce(p ->> 'message', ''));
  units int;
  types jsonb := coalesce(p -> 'types', '[]'::jsonb);
  rid uuid;
begin
  if length(nm) not between 2 and 120 then raise exception 'Adını yaz.' using errcode = '22023'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(em) > 200 then raise exception 'Geçerli bir e-posta adresi yaz.' using errcode = '22023'; end if;
  if length(ph) > 30 or length(co) > 160 or length(msg) > 4000 then raise exception 'Alanlardan biri çok uzun.' using errcode = '22023'; end if;
  if coalesce((p ->> 'consent')::boolean, false) is not true then raise exception 'Aydınlatma metnini onayla.' using errcode = '22023'; end if;
  begin units := nullif(p ->> 'units', '')::int; exception when others then units := null; end;
  if units is not null and (units < 0 or units > 1000000) then units := null; end if;
  if jsonb_typeof(types) <> 'array' or exists (select 1 from jsonb_array_elements_text(types) x where x not in ('Konut','Ofis','Mağaza','Depo','Arsa','Diğer')) then
    types := '[]'::jsonb;
  end if;
  -- Kötüye kullanım sınırı: aynı adresten saatte en fazla 3, sistem genelinde 10 dakikada en fazla 30 başvuru.
  if (select count(*) from public.support_requests where source = 'web' and email = em and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.support_requests where source = 'web' and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'Çok sık başvuru. Biraz sonra yeniden dene.' using errcode = '54000';
  end if;
  insert into public.support_requests (user_id, kind, units, name, email, phone, message, company, source, details)
  values (auth.uid(), 'kurumsal', units, nm, em, ph, msg, co, 'web', jsonb_build_object(
    'types', types,
    'role', left(coalesce(p ->> 'role', ''), 60),
    'city', left(coalesce(p ->> 'city', ''), 80),
    'timeline', left(coalesce(p ->> 'timeline', ''), 60)))
  returning id into rid;
  return rid;
end $$;
grant execute on function public.submit_lead(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 15. Yasal kira artış oranı (TÜFE 12 aylık ortalamalara göre değişim)
-- ---------------------------------------------------------------------
-- month: verinin ait olduğu ay (TÜİK bülteni bir sonraki ayın başında açıklanır). Herkese açık veridir:
-- sitedeki /kira-artis-hesaplama sayfası oturumsuz okur. Yazma: tufe-sync fonksiyonu (service_role) ya da yönetici.
create table if not exists public.cpi_rates (
  month      text primary key check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  avg12      numeric(7,2) not null check (avg12 > -100 and avg12 < 1000),
  source     text not null default 'manual' check (source in ('manual','evds')),
  updated_at timestamptz not null default now()
);
alter table public.cpi_rates enable row level security;
drop policy if exists cpi_read on public.cpi_rates;
create policy cpi_read on public.cpi_rates for select to anon, authenticated using (true);
grant select on public.cpi_rates to anon, authenticated;
revoke insert, update, delete on public.cpi_rates from anon, authenticated;

/** Yönetici: bir ayın oranını girer ya da düzeltir (boş oran satırı siler). */
create or replace function public.admin_set_cpi(m text, rate numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  if rate is null then
    delete from public.cpi_rates where month = m;
  else
    insert into public.cpi_rates (month, avg12, source, updated_at) values (m, round(rate, 2), 'manual', now())
    on conflict (month) do update set avg12 = excluded.avg12, source = 'manual', updated_at = now();
  end if;
  perform public.audit('cpi.set', m, jsonb_build_object('rate', rate));
end $$;
grant execute on function public.admin_set_cpi(text, numeric) to authenticated;

-- ---------------------------------------------------------------------
-- 16. Kurumlar (kurumsal müşteri hesabı) — yol planı Faz 0
-- ---------------------------------------------------------------------
-- Kurum: site yönetimi, AVM, GYO, depo, emlak ofisi, family office gibi kurumsal müşteri.
-- Bireysel kullanıcılar kurum kullanmaz (properties.org_id boş kalır); onlar için hiçbir şey değişmez.
-- Bir kurumun tek bir master yöneticisi vardır; diğer yöneticilerin yetkisi kurumun rollerinden gelir.
-- Roller ve yetkileri master yönetici düzenler. Kurumu ve master yöneticiyi anahtar yöneticisi açar.
-- Yetki ve modül listeleri uygulamadaki domain/org.js ile aynıdır.

create table if not exists public.organizations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(btrim(name)) between 2 and 160),
  sector         text not null check (sector in ('site','avm','gyo','depo','emlak','family','diger')),
  modules        text[] not null default '{}',
  status         text not null default 'active' check (status in ('active','paused')),
  units          int check (units is null or units between 1 and 1000000),
  contract_until date,
  billing        jsonb not null default '{}'::jsonb,
  note           text not null default '' check (length(note) <= 4000),
  lead_id        uuid references public.support_requests(id) on delete set null,
  created_by     uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.org_roles (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 60),
  perms      text[] not null default '{}',
  position   int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table if not exists public.org_members (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role_id    uuid references public.org_roles(id) on delete set null,
  is_master  boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create unique index if not exists org_members_one_master on public.org_members (org_id) where is_master;
create index if not exists org_members_user on public.org_members (user_id);

create table if not exists public.org_invites (
  code        text primary key default ('K' || upper(substr(md5(gen_random_uuid()::text), 1, 7))),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  role_id     uuid references public.org_roles(id) on delete cascade,
  master      boolean not null default false,
  email       text not null default '',
  created_by  uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_by uuid references public.profiles(id) on delete set null,
  accepted_at timestamptz
);

-- Birim kuruma bağlıysa org_id dolu (Faz 2'de site/blok/daire burada kurulacak).
alter table public.properties add column if not exists org_id uuid references public.organizations(id) on delete set null;
create index if not exists properties_org on public.properties (org_id);

/** Yetki kataloğu (domain/org.js → PERMS). */
create or replace function public.org_perm_list()
returns text[] language sql immutable as $$
  select array['org.settings','org.members','units.manage','residents.manage','charges.manage','payments.approve',
               'expenses.manage','requests.manage','announce','documents.manage','reports.view']
$$;

/** Modül kataloğu (domain/org.js → MODULES) ve sektöre göre varsayılan modüller. */
create or replace function public.org_module_list()
returns text[] language sql immutable as $$
  select array['kira','aidat','gider_dagitim','duyuru','ciro_kira','ortak_gider','endeksleme','doluluk','onay_akisi','rapor','api']
$$;
create or replace function public.sector_modules(sec text)
returns text[] language sql immutable as $$
  select case sec
    when 'site'   then array['aidat','gider_dagitim','duyuru','rapor']
    when 'avm'    then array['kira','ortak_gider','ciro_kira','doluluk','rapor']
    when 'depo'   then array['kira','ortak_gider','endeksleme','rapor']
    when 'gyo'    then array['kira','ortak_gider','doluluk','onay_akisi','rapor','api']
    else array['kira','rapor'] end
$$;

create or replace function public.is_org_member(oid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members where org_id = oid and user_id = auth.uid())
$$;
create or replace function public.is_org_master(oid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members where org_id = oid and user_id = auth.uid() and is_master)
$$;

/** Kurumda bu yetki var mı? Master her şeyi yapar; diğerleri rolünün yetkileriyle. Askıdaki kurumda kimse yazamaz. */
create or replace function public.org_can(oid uuid, perm text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.org_members m
    join public.organizations o on o.id = m.org_id and o.status = 'active'
    left join public.org_roles r on r.id = m.role_id
    where m.org_id = oid and m.user_id = auth.uid() and not public.is_banned()
      and (m.is_master or perm = any(coalesce(r.perms, '{}'))))
$$;
grant execute on function public.is_org_member(uuid), public.is_org_master(uuid), public.org_can(uuid, text) to authenticated;

alter table public.organizations enable row level security;
alter table public.org_roles     enable row level security;
alter table public.org_members   enable row level security;
alter table public.org_invites   enable row level security;
drop policy if exists org_read on public.organizations;
create policy org_read on public.organizations for select to authenticated using (public.is_org_member(id) or public.is_admin());
drop policy if exists org_roles_read on public.org_roles;
create policy org_roles_read on public.org_roles for select to authenticated using (public.is_org_member(org_id) or public.is_admin());
drop policy if exists org_members_read on public.org_members;
create policy org_members_read on public.org_members for select to authenticated using (public.is_org_member(org_id) or public.is_admin());
drop policy if exists org_invites_read on public.org_invites;
create policy org_invites_read on public.org_invites for select to authenticated
  using (public.org_can(org_id, 'org.members') or public.is_admin());
-- Yazma yalnızca aşağıdaki işlevlerle (yetki ve tutarlılık denetimi orada).
revoke insert, update, delete on public.organizations, public.org_roles, public.org_members, public.org_invites from anon, authenticated;

/** Yeni kurumun hazır rolleri (master sonradan düzenler). */
create or replace function public.org_seed_roles(oid uuid, sec text)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.org_roles (org_id, name, perms, position)
  select oid, x.n, x.p, x.i from (values
    (case when sec = 'site' then 'Muhasebe' else 'Muhasebe ve finans' end,
       array['charges.manage','payments.approve','expenses.manage','reports.view'], 1),
    (case when sec = 'site' then 'Teknik ekip' else 'Operasyon ve teknik' end,
       array['requests.manage','documents.manage','units.manage'], 2),
    (case when sec = 'site' then 'Güvenlik ve resepsiyon' else 'Kiracı ilişkileri' end,
       array['requests.manage','announce','residents.manage'], 3),
    (case when sec = 'site' then 'Yönetim kurulu' else 'Salt okunur' end,
       array['reports.view'], 4)
  ) as x(n, p, i)
  on conflict (org_id, name) do nothing;
end $$;
revoke execute on function public.org_seed_roles(uuid, text) from public, anon, authenticated;

/** Oturumdaki kişinin kurumları: kurum bilgisi, master mı, rolü ve yetkileri. */
create or replace function public.my_orgs()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', o.id, 'name', o.name, 'sector', o.sector, 'modules', to_jsonb(o.modules), 'status', o.status, 'units', o.units,
    'master', m.is_master, 'role', case when r.id is null then null else jsonb_build_object('id', r.id, 'name', r.name) end,
    'perms', to_jsonb(case when m.is_master then public.org_perm_list() else coalesce(r.perms, '{}') end)
  ) order by o.name), '[]'::jsonb)
  from public.org_members m join public.organizations o on o.id = m.org_id left join public.org_roles r on r.id = m.role_id
  where m.user_id = auth.uid()
$$;
grant execute on function public.my_orgs() to authenticated;

/** Kurum ayrıntısı: roller, yöneticiler; yönetici ekleme yetkisi olana açık davetler. */
create or replace function public.org_detail(oid uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare o public.organizations;
begin
  if not (public.is_org_member(oid) or public.is_admin()) then raise exception 'Bu kurumda yetkin yok' using errcode = '42501'; end if;
  select * into o from public.organizations where id = oid;
  return jsonb_build_object(
    'org', to_jsonb(o) - 'note' - 'billing' - 'lead_id' || case when public.is_admin() or public.org_can(oid, 'org.settings')
                                                           then jsonb_build_object('billing', o.billing) else '{}'::jsonb end,
    'roles', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name, 'perms', to_jsonb(r.perms),
                         'count', (select count(*) from public.org_members x where x.role_id = r.id)) order by r.position, r.name)
                       from public.org_roles r where r.org_id = oid), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'name', p.name, 'email', u.email,
                           'role_id', m.role_id, 'master', m.is_master, 'since', m.created_at) order by m.is_master desc, p.name)
                         from public.org_members m join public.profiles p on p.id = m.user_id left join auth.users u on u.id = m.user_id
                         where m.org_id = oid), '[]'::jsonb),
    'invites', case when public.is_admin() or public.org_can(oid, 'org.members') then
                 coalesce((select jsonb_agg(jsonb_build_object('code', i.code, 'role_id', i.role_id, 'master', i.master, 'email', i.email,
                             'expires_at', i.expires_at) order by i.created_at desc)
                           from public.org_invites i where i.org_id = oid and i.accepted_by is null and i.expires_at > now()), '[]'::jsonb)
               else '[]'::jsonb end);
end $$;
grant execute on function public.org_detail(uuid) to authenticated;

/** Rol ekler ya da düzenler (yalnızca master ya da anahtar yöneticisi). */
create or replace function public.org_role_save(oid uuid, rid uuid, nm text, perms text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare out_id uuid;
begin
  if not (public.is_org_master(oid) and public.org_can(oid, 'org.members') or public.is_admin()) then
    raise exception 'Rolleri yalnızca master yönetici düzenler' using errcode = '42501';
  end if;
  nm := btrim(coalesce(nm, ''));
  if length(nm) not between 1 and 60 then raise exception 'Rol adını yaz' using errcode = '22023'; end if;
  if exists (select 1 from unnest(coalesce(perms, '{}')) x where x <> all(public.org_perm_list())) then
    raise exception 'Geçersiz yetki' using errcode = '22023';
  end if;
  perms := array(select distinct x from unnest(coalesce(perms, '{}')) x order by 1);
  if exists (select 1 from public.org_roles where org_id = oid and lower(name) = lower(nm) and id is distinct from rid) then
    raise exception 'Bu adla bir rol var' using errcode = '23505';
  end if;
  if rid is null then
    insert into public.org_roles (org_id, name, perms, position)
    values (oid, nm, perms, coalesce((select max(position) from public.org_roles where org_id = oid), 0) + 1)
    returning id into out_id;
  else
    update public.org_roles set name = nm, perms = org_role_save.perms where id = rid and org_id = oid returning id into out_id;
    if out_id is null then raise exception 'Rol bulunamadı' using errcode = 'P0002'; end if;
  end if;
  if public.is_admin() then perform public.audit('org.role', oid::text, jsonb_build_object('role', nm, 'perms', perms)); end if;
  return out_id;
end $$;
grant execute on function public.org_role_save(uuid, uuid, text, text[]) to authenticated;

create or replace function public.org_role_delete(rid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare oid uuid := (select org_id from public.org_roles where id = rid);
begin
  if oid is null then raise exception 'Rol bulunamadı' using errcode = 'P0002'; end if;
  if not (public.is_org_master(oid) and public.org_can(oid, 'org.members') or public.is_admin()) then
    raise exception 'Rolleri yalnızca master yönetici düzenler' using errcode = '42501';
  end if;
  delete from public.org_roles where id = rid;   -- bu roldeki yöneticiler rolsüz (yetkisiz) kalır
end $$;
grant execute on function public.org_role_delete(uuid) to authenticated;

/** Yönetici davet kodu üretir. Rol verilmezse yetkisiz katılır; master daveti yalnızca anahtar yöneticisi üretir. */
create or replace function public.org_invite_create(oid uuid, rid uuid, mail text default '')
returns text language plpgsql security definer set search_path = public as $$
declare c text;
begin
  if not (public.org_can(oid, 'org.members') or public.is_admin()) then
    raise exception 'Yönetici davet etme yetkin yok' using errcode = '42501';
  end if;
  if rid is not null and not exists (select 1 from public.org_roles where id = rid and org_id = oid) then
    raise exception 'Rol bu kuruma ait değil' using errcode = '22023';
  end if;
  insert into public.org_invites (org_id, role_id, email) values (oid, rid, left(lower(btrim(coalesce(mail, ''))), 200))
  returning code into c;
  return c;
end $$;
grant execute on function public.org_invite_create(uuid, uuid, text) to authenticated;

create or replace function public.org_invite_delete(c text)
returns void language plpgsql security definer set search_path = public as $$
declare oid uuid := (select org_id from public.org_invites where code = c);
begin
  if oid is null then return; end if;
  if not (public.org_can(oid, 'org.members') or public.is_admin()) then raise exception 'Yetki yok' using errcode = '42501'; end if;
  delete from public.org_invites where code = c;
end $$;
grant execute on function public.org_invite_delete(text) to authenticated;

/** Kurum davetini kabul eder (her hesap türü katılabilir). */
create or replace function public.accept_org_invite(invite_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  inv public.org_invites;
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  if public.is_banned() then raise exception 'Hesap askıya alındı' using errcode = '42501'; end if;
  select * into inv from public.org_invites where code = upper(btrim(invite_code)) for update;
  if inv.code is null then raise exception 'Davet kodu bulunamadı' using errcode = 'P0002'; end if;
  if inv.accepted_by is not null and inv.accepted_by <> me then raise exception 'Bu davet kullanılmış' using errcode = '22023'; end if;
  if inv.expires_at < now() then raise exception 'Davetin süresi dolmuş' using errcode = '22023'; end if;
  if inv.master then
    update public.org_members set is_master = false where org_id = inv.org_id and is_master and user_id <> me;
    insert into public.org_members (org_id, user_id, role_id, is_master) values (inv.org_id, me, null, true)
    on conflict (org_id, user_id) do update set is_master = true, role_id = null;
  else
    insert into public.org_members (org_id, user_id, role_id) values (inv.org_id, me, inv.role_id)
    on conflict (org_id, user_id) do update set role_id = case when public.org_members.is_master then null else excluded.role_id end;
  end if;
  update public.org_invites set accepted_by = me, accepted_at = now() where code = inv.code;
  return inv.org_id;
end $$;
grant execute on function public.accept_org_invite(text) to authenticated;

/** Yöneticinin rolünü değiştirir (master'ın rolü olmaz; master değiştirilemez). */
create or replace function public.org_member_set(oid uuid, member uuid, rid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.org_can(oid, 'org.members') or public.is_admin()) then raise exception 'Yönetici düzenleme yetkin yok' using errcode = '42501'; end if;
  if rid is not null and not exists (select 1 from public.org_roles where id = rid and org_id = oid) then
    raise exception 'Rol bu kuruma ait değil' using errcode = '22023';
  end if;
  if exists (select 1 from public.org_members where org_id = oid and user_id = member and is_master) then
    raise exception 'Master yöneticinin rolü değiştirilemez' using errcode = '22023';
  end if;
  update public.org_members set role_id = rid where org_id = oid and user_id = member;
  if not found then raise exception 'Bu kişi kurumda değil' using errcode = 'P0002'; end if;
end $$;
grant execute on function public.org_member_set(uuid, uuid, uuid) to authenticated;

/** Kurumdan çıkarır ya da kişi kendisi ayrılır. Master çıkarılamaz, önce devretmeli. */
create or replace function public.org_member_remove(oid uuid, member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (member = auth.uid() or public.org_can(oid, 'org.members') or public.is_admin()) then
    raise exception 'Yönetici çıkarma yetkin yok' using errcode = '42501';
  end if;
  if exists (select 1 from public.org_members where org_id = oid and user_id = member and is_master) then
    raise exception 'Master yönetici çıkarılamaz; önce master yetkisini devret' using errcode = '22023';
  end if;
  delete from public.org_members where org_id = oid and user_id = member;
end $$;
grant execute on function public.org_member_remove(uuid, uuid) to authenticated;

/** Master yetkisini kurumdaki başka bir yöneticiye devreder (master ya da anahtar yöneticisi). */
create or replace function public.org_transfer_master(oid uuid, member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.is_org_master(oid) or public.is_admin()) then raise exception 'Yalnızca master yönetici devredebilir' using errcode = '42501'; end if;
  if not exists (select 1 from public.org_members where org_id = oid and user_id = member) then
    raise exception 'Bu kişi kurumda değil' using errcode = 'P0002';
  end if;
  update public.org_members set is_master = false where org_id = oid and is_master;
  update public.org_members set is_master = true, role_id = null where org_id = oid and user_id = member;
  if public.is_admin() then perform public.audit('org.master', oid::text, jsonb_build_object('user', member)); end if;
end $$;
grant execute on function public.org_transfer_master(uuid, uuid) to authenticated;

-- ---- Yönetici (anahtar ekibi): kurum açma ve yönetme ---------------
create or replace function public.admin_orgs()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(o) || jsonb_build_object(
      'members', (select count(*) from public.org_members m where m.org_id = o.id),
      'unit_count', (select count(*) from public.properties p where p.org_id = o.id),
      'master', (select jsonb_build_object('id', m.user_id, 'name', p.name, 'email', u.email)
                 from public.org_members m join public.profiles p on p.id = m.user_id left join auth.users u on u.id = m.user_id
                 where m.org_id = o.id and m.is_master),
      'master_invite', (select i.code from public.org_invites i where i.org_id = o.id and i.master and i.accepted_by is null
                        and i.expires_at > now() order by i.created_at desc limit 1))
    order by o.created_at desc) from public.organizations o), '[]'::jsonb);
end $$;
grant execute on function public.admin_orgs() to authenticated;

/** Kurum açar ya da günceller. p: {id?, name, sector, modules?, status?, units?, contract_until?, billing?, note?, lead_id?}.
    Yeni kurumda modüller verilmezse sektörün varsayılanları, roller sektörün hazır rolleri olur; bağlı başvuru kapanır. */
create or replace function public.admin_org_save(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  oid uuid := nullif(p ->> 'id', '')::uuid;
  sec text := coalesce(p ->> 'sector', '');
  mods text[];
  lead uuid := nullif(p ->> 'lead_id', '')::uuid;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  if sec not in ('site','avm','gyo','depo','emlak','family','diger') then raise exception 'Sektör seç' using errcode = '22023'; end if;
  if length(btrim(coalesce(p ->> 'name', ''))) < 2 then raise exception 'Kurum adını yaz' using errcode = '22023'; end if;
  mods := case when p ? 'modules' then array(select distinct x from jsonb_array_elements_text(p -> 'modules') x order by 1)
               else public.sector_modules(sec) end;
  if exists (select 1 from unnest(mods) x where x <> all(public.org_module_list())) then
    raise exception 'Geçersiz modül' using errcode = '22023';
  end if;
  if oid is null then
    insert into public.organizations (name, sector, modules, status, units, contract_until, billing, note, lead_id)
    values (btrim(p ->> 'name'), sec, mods, coalesce(nullif(p ->> 'status', ''), 'active'), nullif(p ->> 'units', '')::int,
            nullif(p ->> 'contract_until', '')::date, coalesce(p -> 'billing', '{}'::jsonb), coalesce(p ->> 'note', ''), lead)
    returning id into oid;
    perform public.org_seed_roles(oid, sec);
    if lead is not null then update public.support_requests set status = 'done' where id = lead; end if;
    perform public.audit('org.create', oid::text, jsonb_build_object('name', p ->> 'name', 'sector', sec));
  else
    update public.organizations set name = btrim(p ->> 'name'), sector = sec, modules = mods,
      status = coalesce(nullif(p ->> 'status', ''), status), units = nullif(p ->> 'units', '')::int,
      contract_until = nullif(p ->> 'contract_until', '')::date, billing = coalesce(p -> 'billing', billing),
      note = coalesce(p ->> 'note', note), updated_at = now()
    where id = oid;
    if not found then raise exception 'Kurum bulunamadı' using errcode = 'P0002'; end if;
    perform public.audit('org.update', oid::text, jsonb_build_object('name', p ->> 'name', 'sector', sec, 'status', p ->> 'status'));
  end if;
  return oid;
end $$;
grant execute on function public.admin_org_save(jsonb) to authenticated;

/** Master yöneticiyi belirler: e-postayla kayıtlı hesap varsa doğrudan atanır, yoksa master davet kodu üretilir. */
create or replace function public.admin_org_set_master(oid uuid, mail text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid;
  c text;
begin
  if not public.is_admin() then raise exception 'Yönetici yetkisi gerekli' using errcode = '42501'; end if;
  if not exists (select 1 from public.organizations where id = oid) then raise exception 'Kurum bulunamadı' using errcode = 'P0002'; end if;
  mail := lower(btrim(coalesce(mail, '')));
  if mail !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Geçerli bir e-posta adresi yaz.' using errcode = '22023'; end if;
  select id into uid from auth.users where lower(email) = mail;
  if uid is not null and exists (select 1 from public.profiles where id = uid) then
    update public.org_members set is_master = false where org_id = oid and is_master and user_id <> uid;
    insert into public.org_members (org_id, user_id, role_id, is_master) values (oid, uid, null, true)
    on conflict (org_id, user_id) do update set is_master = true, role_id = null;
    perform public.audit('org.master', oid::text, jsonb_build_object('user', uid, 'email', mail));
    return jsonb_build_object('status', 'set', 'user', uid);
  end if;
  delete from public.org_invites where org_id = oid and master and accepted_by is null;
  insert into public.org_invites (org_id, master, email) values (oid, true, mail) returning code into c;
  perform public.audit('org.master_invite', oid::text, jsonb_build_object('email', mail));
  return jsonb_build_object('status', 'invited', 'code', c);
end $$;
grant execute on function public.admin_org_set_master(uuid, text) to authenticated;

do $$
begin
  execute 'drop policy if exists not_banned on public.org_members';
  execute 'create policy not_banned on public.org_members as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned())';
end $$;

-- ---------------------------------------------------------------------
-- 17. Site yönetimi (kurumsal yol planı Faz 2)
-- ---------------------------------------------------------------------
-- Sektörü "site" olan kurum: bloklar ve daireler (site_units), her dairenin malik ve kiracıları (site_residents),
-- aylık tahakkuklar (site_charges: aidat, yakıt, demirbaş, özel toplama), ortak giderler, duyurular ve yönetime talepler.
-- Yönetim tarafı kurumun rol yetkileriyle (org_can), sakin tarafı dairedeki kaydıyla erişir. Sakin dekontu yönetim onaylar.
-- Aidatı varsayılan olarak kiracı öder (daire bazında değişir); malik dairesinin tahakkuklarını her zaman görür.

create table if not exists public.site_units (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  block      text not null default '' check (length(block) <= 40),
  no         text not null check (length(btrim(no)) between 1 and 20),
  area       numeric check (area is null or area > 0),
  share      numeric check (share is null or share > 0),
  aidat      numeric check (aidat is null or aidat >= 0),
  payer      text not null default 'kiraci' check (payer in ('kiraci','malik')),
  note       text not null default '' check (length(note) <= 500),
  created_at timestamptz not null default now(),
  unique (org_id, block, no)
);

create table if not exists public.site_residents (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  unit_id    uuid not null references public.site_units(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  role       text not null check (role in ('malik','kiraci')),
  name       text not null default '' check (length(name) <= 120),
  phone      text not null default '' check (length(phone) <= 30),
  email      text not null default '' check (length(email) <= 200),
  lives_here boolean not null default true,
  code       text not null unique default ('S' || upper(substr(md5(gen_random_uuid()::text), 1, 7))),
  created_at timestamptz not null default now()
);
create index if not exists site_residents_user on public.site_residents (user_id);
create index if not exists site_residents_unit on public.site_residents (unit_id);

create table if not exists public.site_charges (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  unit_id       uuid not null references public.site_units(id) on delete cascade,
  month         text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  kind          text not null default 'aidat' check (kind in ('aidat','yakit','demirbas','ozel')),
  title         text not null default '' check (length(title) <= 120),
  amount        numeric not null check (amount >= 0),
  status        text not null default 'open' check (status in ('open','review','partial','paid','rejected')),
  paid_amount   numeric not null default 0 check (paid_amount >= 0),
  paid_on       date,
  receipt_name  text not null default '',
  receipt_path  text,
  note          text,
  reject_reason text,
  method        text not null default 'dekont' check (method in ('dekont','havale','nakit','pos')),
  paid_by       uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (unit_id, month, kind, title)
);
create index if not exists site_charges_org on public.site_charges (org_id, month);

create table if not exists public.site_expenses (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  cat        text not null check (length(cat) between 1 and 60),
  amount     numeric not null check (amount >= 0),
  spent_on   date not null default current_date,
  note       text not null default '' check (length(note) <= 500),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.site_announcements (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  title      text not null check (length(btrim(title)) between 2 and 120),
  body       text not null default '' check (length(body) <= 4000),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.site_requests (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  unit_id    uuid references public.site_units(id) on delete set null,
  user_id    uuid references public.profiles(id) on delete set null default auth.uid(),
  cat        text not null default 'genel' check (cat in ('ariza','aidat','genel')),
  title      text not null check (length(btrim(title)) between 2 and 120),
  body       text not null default '' check (length(body) <= 4000),
  status     int not null default 0 check (status between 0 and 3),
  reply      text not null default '' check (length(reply) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

/** Oturumdaki kişi bu dairenin maliki ya da kiracısı mı? (rolü döner) */
create or replace function public.site_role(unit uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when bool_or(role = 'malik') then 'malik' when bool_or(role = 'kiraci') then 'kiraci' end
  from public.site_residents where unit_id = unit and user_id = auth.uid()
$$;
/** Oturumdaki kişi bu sitede oturan ya da daire sahibi mi? */
create or replace function public.is_site_resident(oid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.site_residents where org_id = oid and user_id = auth.uid())
$$;
grant execute on function public.site_role(uuid), public.is_site_resident(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['site_units','site_residents','site_charges','site_expenses','site_announcements','site_requests'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists not_banned on public.%I', t);
    execute format('create policy not_banned on public.%I as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned())', t);
  end loop;
end $$;

drop policy if exists su_read on public.site_units;
create policy su_read on public.site_units for select to authenticated
  using (public.is_org_member(org_id) or public.site_role(id) is not null or public.is_admin());
drop policy if exists su_write on public.site_units;
create policy su_write on public.site_units for all to authenticated
  using (public.org_can(org_id, 'units.manage')) with check (public.org_can(org_id, 'units.manage'));

drop policy if exists sr_read on public.site_residents;
create policy sr_read on public.site_residents for select to authenticated
  using (public.is_org_member(org_id) or user_id = auth.uid() or public.is_admin());
drop policy if exists sr_write on public.site_residents;
create policy sr_write on public.site_residents for all to authenticated
  using (public.org_can(org_id, 'residents.manage'))
  with check (public.org_can(org_id, 'residents.manage') and exists (select 1 from public.site_units u where u.id = unit_id and u.org_id = site_residents.org_id));

drop policy if exists sc_read on public.site_charges;
create policy sc_read on public.site_charges for select to authenticated
  using (public.is_org_member(org_id) or public.site_role(unit_id) is not null or public.is_admin());
drop policy if exists sc_insert on public.site_charges;
create policy sc_insert on public.site_charges for insert to authenticated
  with check (public.org_can(org_id, 'charges.manage') and exists (select 1 from public.site_units u where u.id = unit_id and u.org_id = site_charges.org_id));
drop policy if exists sc_update on public.site_charges;
create policy sc_update on public.site_charges for update to authenticated
  using (public.org_can(org_id, 'charges.manage') or public.org_can(org_id, 'payments.approve') or public.site_role(unit_id) is not null)
  with check (public.org_can(org_id, 'charges.manage') or public.org_can(org_id, 'payments.approve') or public.site_role(unit_id) is not null);
drop policy if exists sc_delete on public.site_charges;
create policy sc_delete on public.site_charges for delete to authenticated
  using (public.org_can(org_id, 'charges.manage') and status = 'open');

/** Tahakkuk koruması: sakin yalnızca ödeme bilgisini girip onaya gönderir; onay ve tutar yönetimin yetkisindedir. */
create or replace function public.guard_site_charges()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  approve boolean := public.org_can(new.org_id, 'payments.approve');
  manage boolean := public.org_can(new.org_id, 'charges.manage');
begin
  new.updated_at := now();
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.org_id <> old.org_id or new.unit_id <> old.unit_id then raise exception 'Tahakkuk taşınamaz' using errcode = '42501'; end if;
  if not manage and (new.amount <> old.amount or new.kind <> old.kind or new.title <> old.title or new.month <> old.month) then
    raise exception 'Tahakkuku yalnızca yönetim değiştirebilir' using errcode = '42501';
  end if;
  if approve then return new; end if;
  if manage and new.status = old.status and new.paid_amount = old.paid_amount then return new; end if;
  -- Sakin: ödenmiş tahakkuku değiştiremez, yalnızca dekontla onaya gönderir.
  if old.status = 'paid' then raise exception 'Ödenmiş tahakkuk değiştirilemez' using errcode = '42501'; end if;
  if new.status <> 'review' then raise exception 'Ödemeyi yalnızca yönetim onaylayabilir' using errcode = '42501'; end if;
  if new.paid_amount <= 0 then raise exception 'Ödenen tutarı yaz' using errcode = '22023'; end if;
  new.paid_by := auth.uid();
  new.reject_reason := null;
  new.method := 'dekont';
  return new;
end $$;
drop trigger if exists guard_site_charges on public.site_charges;
create trigger guard_site_charges before update on public.site_charges for each row execute function public.guard_site_charges();

drop policy if exists se_read on public.site_expenses;
create policy se_read on public.site_expenses for select to authenticated
  using (public.org_can(org_id, 'expenses.manage') or public.org_can(org_id, 'reports.view') or public.is_admin());
drop policy if exists se_write on public.site_expenses;
create policy se_write on public.site_expenses for all to authenticated
  using (public.org_can(org_id, 'expenses.manage')) with check (public.org_can(org_id, 'expenses.manage'));

drop policy if exists sa_read on public.site_announcements;
create policy sa_read on public.site_announcements for select to authenticated
  using (public.is_org_member(org_id) or public.is_site_resident(org_id) or public.is_admin());
drop policy if exists sa_write on public.site_announcements;
create policy sa_write on public.site_announcements for all to authenticated
  using (public.org_can(org_id, 'announce')) with check (public.org_can(org_id, 'announce') and created_by = auth.uid());

drop policy if exists sq_read on public.site_requests;
create policy sq_read on public.site_requests for select to authenticated
  using (public.is_org_member(org_id) or user_id = auth.uid() or public.is_admin());
drop policy if exists sq_insert on public.site_requests;
create policy sq_insert on public.site_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 0 and reply = ''
              and exists (select 1 from public.site_residents r where r.org_id = site_requests.org_id and r.user_id = auth.uid()
                          and (site_requests.unit_id is null or r.unit_id = site_requests.unit_id)));
drop policy if exists sq_update on public.site_requests;
create policy sq_update on public.site_requests for update to authenticated
  using (public.org_can(org_id, 'requests.manage')) with check (public.org_can(org_id, 'requests.manage'));

/** Kurum yönetiminde bu yetkisi olanlar (bildirim alıcıları). */
create or replace function public.org_people(oid uuid, perm text)
returns setof uuid language sql stable security definer set search_path = public as $$
  select m.user_id from public.org_members m left join public.org_roles r on r.id = m.role_id
  where m.org_id = oid and (m.is_master or perm = any(coalesce(r.perms, '{}')))
$$;
revoke execute on function public.org_people(uuid, text) from public, anon, authenticated;

create or replace function public.unit_label(unit uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when block <> '' then block || ' Blok ' else '' end || 'No ' || no from public.site_units where id = unit
$$;

/** Tahakkuk kaleminin bildirimdeki adı ("Kasım aidatı", "Kasım kirası"…). */
create or replace function public.charge_word(k text, title text)
returns text language sql immutable as $$
  select case k when 'aidat' then 'aidatı' when 'kira' then 'kirası' when 'ortak_gider' then 'ortak gideri' when 'ciro' then 'ciro farkı'
                when 'yakit' then 'yakıt payı' when 'demirbas' then 'demirbaş payı' else coalesce(nullif(title, ''), 'tahakkuku') end
$$;
revoke execute on function public.unit_label(uuid) from public, anon, authenticated;

/** Bildirimler: dekont geldi (yönetime), onay/red (ödeyene), duyuru (sakinlere), talep (yönetime ve talep sahibine). */
create or replace function public.on_site_charge_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare lbl text := public.unit_label(new.unit_id);
begin
  if new.status = 'review' and old.status is distinct from 'review' then
    insert into public.notifications (user_id, title, body, url)
    select u, lbl || ': dekont geldi', new.month || ' ' || public.charge_word(new.kind, new.title)
             || ' için ' || public.fmt_tl(new.paid_amount) || ' ödendi.', '/uygulama/site'
    from public.org_people(new.org_id, 'payments.approve') u where u is distinct from auth.uid();
  elsif new.status in ('paid','partial','rejected') and old.status = 'review' and new.paid_by is not null then
    insert into public.notifications (user_id, title, body, url)
    values (new.paid_by, case when new.status = 'rejected' then 'Dekont reddedildi' else 'Ödemen onaylandı' end,
            lbl || ' · ' || new.month || case when new.status = 'rejected' then ': ' || coalesce(new.reject_reason, '') else '' end, '/uygulama/sitem');
  end if;
  return new;
end $$;
drop trigger if exists on_site_charge_change on public.site_charges;
create trigger on_site_charge_change after update on public.site_charges for each row execute function public.on_site_charge_change();

create or replace function public.on_site_announcement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (user_id, title, body, url)
  select distinct r.user_id, 'Duyuru: ' || new.title, left(new.body, 240), '/uygulama/sitem'
  from public.site_residents r where r.org_id = new.org_id and r.user_id is not null;
  return new;
end $$;
drop trigger if exists on_site_announcement on public.site_announcements;
create trigger on_site_announcement after insert on public.site_announcements for each row execute function public.on_site_announcement();

create or replace function public.on_site_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, title, body, url)
    select u, coalesce(public.unit_label(new.unit_id) || ': ', '') || 'yeni talep', new.title, '/uygulama/site'
    from public.org_people(new.org_id, 'requests.manage') u;
  elsif (new.status <> old.status or new.reply <> old.reply) and new.user_id is not null then
    insert into public.notifications (user_id, title, body, url)
    values (new.user_id, 'Talebin güncellendi', new.title || case when new.reply <> '' then ': ' || left(new.reply, 200) else '' end, '/uygulama/sitem');
  end if;
  return null;
end $$;
drop trigger if exists on_site_request on public.site_requests;
create trigger on_site_request after insert or update on public.site_requests for each row execute function public.on_site_request();

/** Daire davet kodunu kabul eder: kayıt oturumdaki hesaba bağlanır (malik ya da kiracı olarak). */
create or replace function public.accept_site_invite(invite_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.site_residents;
begin
  if auth.uid() is null then raise exception 'Oturum açılmamış' using errcode = '42501'; end if;
  if public.is_banned() then raise exception 'Hesap askıya alındı' using errcode = '42501'; end if;
  select * into r from public.site_residents where code = upper(btrim(invite_code)) for update;
  if r.id is null then raise exception 'Davet kodu bulunamadı' using errcode = 'P0002'; end if;
  if r.user_id is not null and r.user_id <> auth.uid() then raise exception 'Bu davet kullanılmış' using errcode = '22023'; end if;
  update public.site_residents set user_id = auth.uid() where id = r.id;
  return r.unit_id;
end $$;
grant execute on function public.accept_site_invite(text) to authenticated;

/** Sakinin daireleri: site, daire, rolü, aidatı kimin ödediği. */
create or replace function public.my_site_units()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'unit_id', u.id, 'org_id', o.id, 'org', o.name, 'block', u.block, 'no', u.no, 'area', u.area, 'aidat', u.aidat,
    'payer', u.payer, 'role', r.role, 'lives_here', r.lives_here) order by o.name, u.block, u.no), '[]'::jsonb)
  from public.site_residents r join public.site_units u on u.id = r.unit_id join public.organizations o on o.id = u.org_id
  where r.user_id = auth.uid()
$$;
grant execute on function public.my_site_units() to authenticated;

-- Dosyalar: site dekontları "site-<kurum>/<dosya>" klasöründe; yönetim ve o sitenin sakinleri erişir.
create or replace function public.site_folder_ok(folder text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare oid uuid;
begin
  if folder is null or folder !~ '^site-[0-9a-f-]{36}$' then return false; end if;
  oid := substr(folder, 6)::uuid;
  return public.is_org_member(oid) or public.is_site_resident(oid);
end $$;
grant execute on function public.site_folder_ok(text) to authenticated;
drop policy if exists site_files_read on storage.objects;
create policy site_files_read on storage.objects for select to authenticated
  using (bucket_id = 'evim' and public.site_folder_ok((storage.foldername(name))[1]));
drop policy if exists site_files_write on storage.objects;
create policy site_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'evim' and public.site_folder_ok((storage.foldername(name))[1]));


-- ---------------------------------------------------------------------
-- 18. Site: mülk–daire bağlantısı, aidat hatırlatmaları, işletme projesi, yönetim kurulu raporu
-- ---------------------------------------------------------------------
-- Ev sahibi anahtar'daki mülkünü sitedeki dairesine bağlar (dairenin maliki olarak kayıtlıysa). Bağlı mülkün
-- kiracısı o dairenin kiracısı sayılır: aidatını görür ve öder, duyuruları alır, yönetime talep açar.

alter table public.properties add column if not exists site_unit_id uuid references public.site_units(id) on delete set null;

/** Kişinin site daireleri: doğrudan kaydı (malik / kiracı) ve bağlı mülkünün kiracısı olarak. */
create or replace function public.site_links(uid uuid)
returns table (unit_id uuid, org_id uuid, role text) language sql stable security definer set search_path = public as $$
  select r.unit_id, r.org_id, r.role from public.site_residents r where r.user_id = uid
  union
  select u.id, u.org_id, 'kiraci' from public.properties p
    join public.site_units u on u.id = p.site_unit_id
    join public.memberships m on m.property_id = p.id and m.role = 'tenant'
   where m.user_id = uid
$$;
revoke execute on function public.site_links(uuid) from public, anon, authenticated;

create or replace function public.site_role(unit uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when bool_or(role = 'malik') then 'malik' when bool_or(role = 'kiraci') then 'kiraci' end
  from public.site_links(auth.uid()) where unit_id = unit
$$;
create or replace function public.is_site_resident(oid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.site_links(auth.uid()) where org_id = oid)
$$;

create or replace function public.my_site_units()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'unit_id', u.id, 'org_id', o.id, 'org', o.name, 'block', u.block, 'no', u.no, 'area', u.area, 'aidat', u.aidat,
    'payer', u.payer, 'role', l.role,
    'property_id', (select p.id from public.properties p where p.site_unit_id = u.id
                     and (p.owner_id = auth.uid() or exists (select 1 from public.memberships m where m.property_id = p.id and m.user_id = auth.uid()))
                     limit 1)) order by o.name, u.block, u.no), '[]'::jsonb)
  from (select unit_id, case when bool_or(role = 'malik') then 'malik' else 'kiraci' end as role
          from public.site_links(auth.uid()) group by unit_id) l
  join public.site_units u on u.id = l.unit_id join public.organizations o on o.id = u.org_id
$$;

drop policy if exists sq_insert on public.site_requests;
create policy sq_insert on public.site_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 0 and reply = '' and public.is_site_resident(org_id)
              and (unit_id is null or public.site_role(unit_id) is not null));

/** Mülkü site dairesine bağlar ya da bağı kaldırır (unit boş). Yalnızca mülkün sahibi, dairenin maliki olarak. */
create or replace function public.link_site_unit(pid text, unit uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_owner(pid) then raise exception 'Yalnızca mülk sahibi bağlayabilir' using errcode = '42501'; end if;
  if unit is not null and not exists (select 1 from public.site_residents where unit_id = unit and user_id = auth.uid() and role = 'malik') then
    raise exception 'Bu dairenin maliki olarak kayıtlı değilsin' using errcode = '42501';
  end if;
  if unit is not null and exists (select 1 from public.properties where site_unit_id = unit and id <> pid) then
    raise exception 'Bu daire başka bir mülke bağlı' using errcode = '23505';
  end if;
  update public.properties set site_unit_id = unit where id = pid;
end $$;
grant execute on function public.link_site_unit(text, uuid) to authenticated;

/** Bağlantı başka yoldan (doğrudan güncelleme) kurulamaz. */
create or replace function public.guard_site_link()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.site_unit_id is distinct from old.site_unit_id and new.site_unit_id is not null and auth.uid() is not null
     and not public.is_admin()
     and not exists (select 1 from public.site_residents where unit_id = new.site_unit_id and user_id = auth.uid() and role = 'malik') then
    raise exception 'Bu dairenin maliki olarak kayıtlı değilsin' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists guard_site_link on public.properties;
create trigger guard_site_link before update on public.properties for each row execute function public.guard_site_link();

/** Yönetim için: dairelere ev sahibi aracılığıyla bağlanan kiracılar (ad ve mülk adı; iletişim bilgisi verilmez). */
create or replace function public.site_linked_tenants(oid uuid)
returns table (unit_id uuid, name text) language sql stable security definer set search_path = public as $$
  select p.site_unit_id, coalesce(nullif(m.display_name, ''), pr.name)
  from public.properties p join public.site_units u on u.id = p.site_unit_id
  join public.memberships m on m.property_id = p.id and m.role = 'tenant' join public.profiles pr on pr.id = m.user_id
  where u.org_id = oid and public.is_org_member(oid)
$$;
grant execute on function public.site_linked_tenants(uuid) to authenticated;

-- ---- İşletme projesi (yıllık bütçe) -----------------------------------
-- items: [{cat, amount}] yıllık tutarlar. KMK md. 37: işletme projesi kat malikleri kurulunca onaylanır; giderler
-- (yönetim planında aksi yoksa) arsa payına göre paylaştırılır. Malik ve kiracılar da okur.
create table if not exists public.site_budgets (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  year        int not null check (year between 2000 and 2100),
  items       jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  method      text not null default 'share' check (method in ('share','area','equal')),
  note        text not null default '' check (length(note) <= 2000),
  approved_on date,
  updated_at  timestamptz not null default now(),
  primary key (org_id, year)
);
alter table public.site_budgets enable row level security;
drop policy if exists sb_read on public.site_budgets;
create policy sb_read on public.site_budgets for select to authenticated
  using (public.is_org_member(org_id) or public.is_site_resident(org_id) or public.is_admin());
drop policy if exists sb_write on public.site_budgets;
create policy sb_write on public.site_budgets for all to authenticated
  using (public.org_can(org_id, 'charges.manage')) with check (public.org_can(org_id, 'charges.manage'));
drop policy if exists not_banned on public.site_budgets;
create policy not_banned on public.site_budgets as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned());

-- ---- Aidat hatırlatmaları ------------------------------------------------
-- Ödeyene (dairenin "aidatı kim öder" seçimine göre; kiracı yoksa malike): ay sonundan 3 gün önce, ay sonunda,
-- ay sonundan 5 ve 15 gün sonra. Kullanıcı ayarlardan kapatabilir (remindAidat). Kanallar push/e-posta/SMS (push fonksiyonu).
create or replace function public.site_reminders(today date default (now() at time zone 'Europe/Istanbul')::date)
returns int language plpgsql security definer set search_path = public as $$
declare before int;
begin
  select count(*) into before from public.notifications;
  with due as (
    select c.*, coalesce(c.due_on, (date_trunc('month', to_date(c.month, 'YYYY-MM')) + interval '1 month' - interval '1 day')::date) as last_day,
           u.payer, public.unit_label(c.unit_id) as lbl
    from public.site_charges c join public.site_units u on u.id = c.unit_id
    join public.organizations o on o.id = c.org_id and o.status = 'active'
    where c.status in ('open','partial','rejected')
  ), stage as (
    select d.*, case today - d.last_day when -3 then 'soon' when 0 then 'due' when 5 then 'late' when 15 then 'late2' end as st
    from due d
  ), cand as (
    -- Dairenin hesabı bağlı kişileri: doğrudan kayıtlı malik/kiracı ve bağlı mülkün kiracısı.
    select s.*, x.user_id, x.role from stage s
    join lateral (
      select r.user_id, r.role from public.site_residents r where r.unit_id = s.unit_id and r.user_id is not null
      union
      select m.user_id, 'kiraci' from public.properties p join public.memberships m on m.property_id = p.id and m.role = 'tenant'
       where p.site_unit_id = s.unit_id
    ) x on true
    where s.st is not null
  ), who as (
    -- Ödeyen: dairede seçilen rol (aidatı kim öder); o rolde kimse yoksa diğer rol.
    select c.* from cand c
    where c.role = c.payer or not exists (select 1 from cand c2 where c2.id = c.id and c2.role = c.payer)
  )
  insert into public.notifications (user_id, title, body, url, tag)
  select distinct on (w.user_id, w.id) w.user_id,
         w.lbl || case when w.kind = 'kira' then ': kira ' else ': aidat ' end || case when w.st in ('late','late2') then 'gecikti' else 'günü yaklaşıyor' end,
         to_char(to_date(w.month, 'YYYY-MM'), 'MM.YYYY') || ' ' || public.charge_word(w.kind, w.title)
           || ' ' || public.fmt_tl(w.amount - case when w.status = 'partial' then w.paid_amount else 0 end)
           || case when w.st in ('late','late2') then ', son gün ' || to_char(w.last_day, 'DD.MM.YYYY') || ' idi.' else ', son gün ' || to_char(w.last_day, 'DD.MM.YYYY') || '.' end,
         '/uygulama/sitem', 'aidat-' || w.st || '-' || w.id
  from who w left join public.profiles pr on pr.id = w.user_id
  where coalesce((pr.settings ->> 'remindAidat')::boolean, true)
  on conflict do nothing;
  return (select count(*) from public.notifications) - before;
end $$;
revoke execute on function public.site_reminders(date) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'anahtar-site-reminders';
    perform cron.schedule('anahtar-site-reminders', '5 6 * * *', 'select public.site_reminders()');
  end if;
end $$;

-- ---- Yönetim kurulu raporu ----------------------------------------------
/** Dönem raporu (period: month | year; ref: dönemden bir gün): tahakkuk ve tahsilat (türe göre), giderler (kaleme göre),
    bütçe karşılaştırması, borçlular, talepler. Yönetimde "Raporlar" yetkisi olan ve report edge fonksiyonu (service_role) çağırır. */
create or replace function public.site_report(oid uuid, period text, ref date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  d0 date := case when period = 'year' then date_trunc('year', ref)::date else date_trunc('month', ref)::date end;
  d1 date := case when period = 'year' then (date_trunc('year', ref) + interval '1 year')::date else (date_trunc('month', ref) + interval '1 month')::date end;
  m0 text := to_char(d0, 'YYYY-MM');
  m1 text := to_char(d1 - 1, 'YYYY-MM');
  yr int := extract(year from d0)::int;
begin
  if auth.uid() is not null and not public.org_can(oid, 'reports.view') and not public.is_admin() then
    raise exception 'Rapor yetkin yok' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'org', (select name from public.organizations where id = oid),
    'sector', (select sector from public.organizations where id = oid),
    'period', period, 'from', d0, 'to', d1 - 1,
    'units', (select count(*) from public.site_units where org_id = oid),
    'charges', (select coalesce(jsonb_agg(x order by x.kind), '[]'::jsonb) from (
        select kind, sum(amount) as charged,
               sum(case when status = 'paid' then amount when status in ('partial') then paid_amount else 0 end) as collected
        from public.site_charges where org_id = oid and month between m0 and m1 group by kind) x),
    'expenses', (select coalesce(jsonb_agg(x order by x.total desc), '[]'::jsonb) from (
        select cat, sum(amount) as total from public.site_expenses where org_id = oid and spent_on >= d0 and spent_on < d1 group by cat) x),
    'budget', (select case when b.org_id is null then null else jsonb_build_object('year', b.year, 'approved_on', b.approved_on,
                 'items', b.items, 'total', (select coalesce(sum((i ->> 'amount')::numeric), 0) from jsonb_array_elements(b.items) i)) end
               from (select 1) one left join public.site_budgets b on b.org_id = oid and b.year = yr),
    'debtors', (select coalesce(jsonb_agg(x order by x.unpaid desc), '[]'::jsonb) from (
        select public.unit_label(unit_id) as unit, sum(amount - case when status = 'partial' then paid_amount else 0 end) as unpaid
        from public.site_charges where org_id = oid and status <> 'paid' and month <= m1
          and (date_trunc('month', to_date(month, 'YYYY-MM')) + interval '1 month')::date <= least(d1, current_date)
        group by unit_id order by 2 desc limit 20) x),
    'requests', jsonb_build_object(
        'opened', (select count(*) from public.site_requests where org_id = oid and created_at >= d0 and created_at < d1),
        'open', (select count(*) from public.site_requests where org_id = oid and status < 3)));
end $$;
grant execute on function public.site_report(uuid, text, date) to authenticated;

/** Rapor alıcıları: etkin site kurumlarında "Raporlar" yetkisi olan yöneticiler (master dahil). */
create or replace function public.site_report_recipients()
returns table (org_id uuid, user_id uuid, email text, name text, lang text) language sql stable security definer set search_path = public as $$
  select o.id, p.id, u.email::text, p.name, p.lang
  from public.organizations o
  cross join lateral public.org_people(o.id, 'reports.view') pp(uid)
  join public.profiles p on p.id = pp.uid join auth.users u on u.id = p.id
  where o.sector in ('site','avm','depo','gyo') and o.status = 'active' and coalesce((p.settings ->> 'siteReport')::boolean, true)
$$;
revoke execute on function public.site_report_recipients() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 19. Ticari portföy: AVM, depo ve GYO (kurumsal yol planı Faz 3)
-- ---------------------------------------------------------------------
-- Site altyapısı (birim, sakin, tahakkuk, gider, duyuru, talep) ticari kurumlarda da kullanılır; birime kira sözleşmesi
-- bilgisi eklenir. Tahakkuk türleri: kira, ortak alan gideri (ortak_gider), ciro farkı (ciro). Döviz kirası tahakkuk anında
-- girilen kurla TL'ye çevrilir (asıl tutar ve kur saklanır). Ciroya bağlı kira: kiracı aylık cirosunu bildirir, yönetim onaylayınca
-- "cironun %X'i sabit kirayı aşarsa aradaki fark" tahakkuk edilir. Endeksleme: sözleşme yıldönümünde TÜFE (12 aylık ortalama) ya da
-- sözleşmedeki sabit oranla artış; her değişiklik site_rent_changes'e yazılır.

alter table public.site_units add column if not exists rent          numeric check (rent is null or rent >= 0);
alter table public.site_units add column if not exists currency      text not null default 'TRY';
alter table public.site_units add column if not exists turnover_rate numeric check (turnover_rate is null or (turnover_rate >= 0 and turnover_rate <= 100));
alter table public.site_units add column if not exists lease_start   date;
alter table public.site_units add column if not exists lease_end     date;
alter table public.site_units add column if not exists index_kind    text not null default 'tufe';
alter table public.site_units add column if not exists index_rate    numeric check (index_rate is null or (index_rate >= 0 and index_rate <= 100));
alter table public.site_units add column if not exists vat           boolean not null default false;
alter table public.site_units add column if not exists stopaj        boolean not null default false;
alter table public.site_units add column if not exists due_day       int check (due_day is null or due_day between 1 and 28);
alter table public.site_units drop constraint if exists site_units_currency_check;
alter table public.site_units add constraint site_units_currency_check check (currency in ('TRY','USD','EUR'));
alter table public.site_units drop constraint if exists site_units_index_kind_check;
alter table public.site_units add constraint site_units_index_kind_check check (index_kind in ('tufe','sabit','yok'));
alter table public.site_units drop constraint if exists site_units_tax_check;
alter table public.site_units add constraint site_units_tax_check check (not (vat and stopaj));

alter table public.site_charges drop constraint if exists site_charges_kind_check;
alter table public.site_charges add constraint site_charges_kind_check check (kind in ('aidat','yakit','demirbas','ozel','kira','ortak_gider','ciro'));
alter table public.site_charges add column if not exists currency    text not null default 'TRY';
alter table public.site_charges add column if not exists fx          numeric check (fx is null or fx > 0);
alter table public.site_charges add column if not exists orig_amount numeric check (orig_amount is null or orig_amount >= 0);
alter table public.site_charges add column if not exists due_on      date;
alter table public.site_charges drop constraint if exists site_charges_currency_check;
alter table public.site_charges add constraint site_charges_currency_check check (currency in ('TRY','USD','EUR'));

/** Sakin tahakkukun tutar, kur ve vadesini de değiştiremez (18. bölümdeki korumaya ek alanlar). */
create or replace function public.guard_site_charges()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  approve boolean := public.org_can(new.org_id, 'payments.approve');
  manage boolean := public.org_can(new.org_id, 'charges.manage');
begin
  new.updated_at := now();
  if auth.uid() is null or public.is_admin() then return new; end if;
  if new.org_id <> old.org_id or new.unit_id <> old.unit_id then raise exception 'Tahakkuk taşınamaz' using errcode = '42501'; end if;
  if not manage and (new.amount <> old.amount or new.kind <> old.kind or new.title <> old.title or new.month <> old.month
                     or new.currency <> old.currency or new.fx is distinct from old.fx or new.orig_amount is distinct from old.orig_amount
                     or new.due_on is distinct from old.due_on) then
    raise exception 'Tahakkuku yalnızca yönetim değiştirebilir' using errcode = '42501';
  end if;
  if approve then return new; end if;
  if manage and new.status = old.status and new.paid_amount = old.paid_amount then return new; end if;
  if old.status = 'paid' then raise exception 'Ödenmiş tahakkuk değiştirilemez' using errcode = '42501'; end if;
  if new.status <> 'review' then raise exception 'Ödemeyi yalnızca yönetim onaylayabilir' using errcode = '42501'; end if;
  if new.paid_amount <= 0 then raise exception 'Ödenen tutarı yaz' using errcode = '22023'; end if;
  new.paid_by := auth.uid();
  new.reject_reason := null;
  new.method := 'dekont';
  return new;
end $$;

/** Birim etiketi: sitede "A Blok No 3", ticari kurumlarda "Zemin kat · Z-12". */
create or replace function public.unit_label(unit uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when o.sector = 'site' then case when u.block <> '' then u.block || ' Blok ' else '' end || 'No ' || u.no
              else case when u.block <> '' then u.block || ' · ' else '' end || u.no end
  from public.site_units u join public.organizations o on o.id = u.org_id where u.id = unit
$$;
revoke execute on function public.unit_label(uuid) from public, anon, authenticated;

create table if not exists public.site_rent_changes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  unit_id    uuid not null references public.site_units(id) on delete cascade,
  from_date  date not null,
  old_amount numeric,
  new_amount numeric not null check (new_amount >= 0),
  currency   text not null default 'TRY' check (currency in ('TRY','USD','EUR')),
  reason     text not null default '' check (length(reason) <= 200),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.site_turnovers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  unit_id       uuid not null references public.site_units(id) on delete cascade,
  month         text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount        numeric not null check (amount >= 0),
  note          text not null default '' check (length(note) <= 500),
  status        text not null default 'reported' check (status in ('reported','approved','rejected')),
  reject_reason text,
  reported_by   uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (unit_id, month)
);

do $$
declare t text;
begin
  foreach t in array array['site_rent_changes','site_turnovers'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists not_banned on public.%I', t);
    execute format('create policy not_banned on public.%I as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned())', t);
  end loop;
end $$;

drop policy if exists src_read on public.site_rent_changes;
create policy src_read on public.site_rent_changes for select to authenticated
  using (public.is_org_member(org_id) or public.site_role(unit_id) is not null or public.is_admin());
drop policy if exists src_write on public.site_rent_changes;
create policy src_write on public.site_rent_changes for all to authenticated
  using (public.org_can(org_id, 'charges.manage')) with check (public.org_can(org_id, 'charges.manage'));

drop policy if exists st_read on public.site_turnovers;
create policy st_read on public.site_turnovers for select to authenticated
  using (public.is_org_member(org_id) or public.site_role(unit_id) is not null or public.is_admin());
drop policy if exists st_insert on public.site_turnovers;
create policy st_insert on public.site_turnovers for insert to authenticated
  with check (exists (select 1 from public.site_units u where u.id = unit_id and u.org_id = site_turnovers.org_id)
              and (public.org_can(org_id, 'charges.manage')
                   or (public.site_role(unit_id) = 'kiraci' and status = 'reported' and reported_by = auth.uid())));
drop policy if exists st_update on public.site_turnovers;
create policy st_update on public.site_turnovers for update to authenticated
  using (public.org_can(org_id, 'charges.manage') or public.site_role(unit_id) = 'kiraci')
  with check (public.org_can(org_id, 'charges.manage') or public.site_role(unit_id) = 'kiraci');

/** Ciro koruması: kiracı onaylanmış ciroyu değiştiremez; düzeltme yeniden onaya düşer. Onay/red yönetimde. */
create or replace function public.guard_site_turnovers()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  if auth.uid() is null or public.is_admin() or public.org_can(new.org_id, 'charges.manage') then return new; end if;
  if new.unit_id <> old.unit_id or new.month <> old.month or new.org_id <> old.org_id then raise exception 'Ciro kaydı taşınamaz' using errcode = '42501'; end if;
  if old.status = 'approved' then raise exception 'Onaylanmış ciro değiştirilemez' using errcode = '42501'; end if;
  new.status := 'reported';
  new.reject_reason := null;
  new.reported_by := auth.uid();
  return new;
end $$;
drop trigger if exists guard_site_turnovers on public.site_turnovers;
create trigger guard_site_turnovers before update on public.site_turnovers for each row execute function public.guard_site_turnovers();

create or replace function public.on_site_turnover()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'reported' and (tg_op = 'INSERT' or old.status is distinct from 'reported' or old.amount <> new.amount) then
    insert into public.notifications (user_id, title, body, url)
    select u, public.unit_label(new.unit_id) || ': ciro bildirildi', new.month || ' cirosu ' || public.fmt_tl(new.amount) || '.', '/uygulama/site'
    from public.org_people(new.org_id, 'charges.manage') u where u is distinct from auth.uid();
  elsif tg_op = 'UPDATE' and new.status <> old.status and new.reported_by is not null then
    insert into public.notifications (user_id, title, body, url)
    values (new.reported_by, case when new.status = 'approved' then 'Ciro bildirimin onaylandı' else 'Ciro bildirimin reddedildi' end,
            public.unit_label(new.unit_id) || ' · ' || new.month || coalesce(': ' || new.reject_reason, ''), '/uygulama/sitem');
  end if;
  return null;
end $$;
drop trigger if exists on_site_turnover on public.site_turnovers;
create trigger on_site_turnover after insert or update on public.site_turnovers for each row execute function public.on_site_turnover();

/** Sakinin/kiracının birimleri: sektör ve sözleşme özeti de döner (ekran sözcükleri ve ciro bildirimi için). */
create or replace function public.my_site_units()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'unit_id', u.id, 'org_id', o.id, 'org', o.name, 'sector', o.sector, 'block', u.block, 'no', u.no, 'area', u.area, 'aidat', u.aidat,
    'payer', u.payer, 'role', l.role, 'rent', u.rent, 'currency', u.currency, 'turnover_rate', u.turnover_rate,
    'lease_start', u.lease_start, 'lease_end', u.lease_end,
    'property_id', (select p.id from public.properties p where p.site_unit_id = u.id
                     and (p.owner_id = auth.uid() or exists (select 1 from public.memberships m where m.property_id = p.id and m.user_id = auth.uid()))
                     limit 1)) order by o.name, u.block, u.no), '[]'::jsonb)
  from (select unit_id, case when bool_or(role = 'malik') then 'malik' else 'kiraci' end as role
          from public.site_links(auth.uid()) group by unit_id) l
  join public.site_units u on u.id = l.unit_id join public.organizations o on o.id = u.org_id
$$;
