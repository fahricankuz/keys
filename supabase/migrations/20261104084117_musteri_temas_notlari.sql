-- Müşteri temas notları (yönetici paneli → Müşteri sağlığı)
-- anahtar ekibinin risk listesindeki müşteriyle (mülk sahibi ya da kurum) temasını kaydeder: ne zaman, kim, ne konuşuldu.
-- Yalnız yönetici okur ve yazar; müşteri hiç görmez. Yeni tablo; eski kodla uyumlu, yeniden çalıştırılabilir.

create table if not exists public.customer_contacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id) on delete cascade,
  org_id     uuid references public.organizations(id) on delete cascade,
  note       text not null check (length(btrim(note)) between 1 and 1000),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (user_id is not null or org_id is not null)
);
create index if not exists customer_contacts_user on public.customer_contacts (user_id, created_at desc);
create index if not exists customer_contacts_org on public.customer_contacts (org_id, created_at desc);
alter table public.customer_contacts enable row level security;
drop policy if exists cc_admin on public.customer_contacts;
create policy cc_admin on public.customer_contacts for all to authenticated
  using (public.is_admin()) with check (public.is_admin() and created_by = auth.uid());
