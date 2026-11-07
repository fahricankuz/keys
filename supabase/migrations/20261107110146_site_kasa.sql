-- Site kasası ve gider eki.
-- 1. Gidere fatura ya da fiş eki: dosya sitenin klasöründe (site-<kurum>/…); yol başka kurumun klasörünü gösteremez.
-- 2. Kasa (aidat havuzu): açılış bakiyesi ve günü (sitenin anahtar'a geçtiği gün). Kasa hesabı uygulamada yapılır:
--    devreden + dönemde tahsil edilen aidat − dönemin giderleri = kasada kalan. Açılış girilmezse kasa sıfırdan başlar.
--    Okuma: kurum üyesi; yazma: tahakkuk ya da gider yetkisi olan.
-- Kategoriler mevcut "cat" alanında kalır (eski serbest metinler bozulmaz, işletme projesiyle eşleşme sürer).
-- Yeni sütunlar ve tablo; eski kodla uyumlu, yeniden çalıştırılabilir.

alter table public.site_expenses add column if not exists receipt_path text;
alter table public.site_expenses add column if not exists receipt_name text not null default '';
alter table public.site_expenses drop constraint if exists site_expenses_receipt_check;
alter table public.site_expenses add constraint site_expenses_receipt_check
  check ((receipt_path is null or position('site-' || org_id::text || '/' in receipt_path) = 1) and length(receipt_name) <= 200);

create table if not exists public.site_cash (
  org_id     uuid primary key references public.organizations(id) on delete cascade,
  opening    numeric not null default 0,
  opening_on date not null default current_date,
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);
alter table public.site_cash enable row level security;
drop policy if exists not_banned on public.site_cash;
create policy not_banned on public.site_cash as restrictive for all to authenticated using (not public.is_banned()) with check (not public.is_banned());
drop policy if exists scash_read on public.site_cash;
create policy scash_read on public.site_cash for select to authenticated using (public.is_org_member(org_id) or public.is_admin());
drop policy if exists scash_write on public.site_cash;
create policy scash_write on public.site_cash for all to authenticated
  using (public.org_can(org_id, 'charges.manage') or public.org_can(org_id, 'expenses.manage'))
  with check (public.org_can(org_id, 'charges.manage') or public.org_can(org_id, 'expenses.manage'));
grant select, insert, update, delete on public.site_cash to authenticated;
