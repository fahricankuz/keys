-- RLS performansı (Supabase performans uyarıları, 2026-11-13: auth_rls_initplan 47 uyarı, unindexed_foreign_keys 79 bilgi)
-- 1. Politikalarda auth.uid() her satır için yeniden hesaplanıyordu; "(select auth.uid())" sorgu başına bir kez hesaplanır (initplan).
--    Anlam değişmez: yalnız çağrı sarılır. Dosya, önceki migration'lar uygulandıktan sonraki politikaları (public şeması) okuyup yeniden yazar;
--    zaten sarılmış çağrılara dokunmaz. Politikanın rolü, komutu, türü (permissive/restrictive) ve ifadesinin geri kalanı aynı kalır.
-- 2. Dizinsiz yabancı anahtarlar: her yabancı anahtarın sütunları için (başka bir dizinin ilk sütunları olarak yoksa) dizin açılır.
--    Silme/güncelleme sırasında ilgili tabloda sıralı tarama ve kilit süresi azalır; tablolar küçük olduğundan kurulum anlıktır.
-- Yeniden çalıştırılabilir: ikinci çalıştırmada yeniden yazılacak politika ve eksik dizin kalmaz.

-- ---------------------------------------------------------------------
-- 0. content_reports.reports_insert: günlük sınırın sayımı politikanın içinde kendi tablosuna alt sorguydu. Politikalar sarılınca (aşağıda)
--    "infinite recursion detected in policy" hatası verir; sayım aynı anlamla bir security definer işleve taşınır (kullanıcının son 24 saatteki bildirimi).
-- ---------------------------------------------------------------------
create or replace function public.reports_today(uid uuid) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.content_reports r where r.reporter = uid and r.created_at > now() - interval '1 day'
$$;
drop policy if exists reports_insert on public.content_reports;
create policy reports_insert on public.content_reports for insert to authenticated
  with check (reporter = (select auth.uid()) and status = 'open' and resolution = ''
              and (property_id is null or public.is_member(property_id))
              and public.reports_today((select auth.uid())) < 20);

-- ---------------------------------------------------------------------
-- 1. auth.uid() → (select auth.uid())
-- ---------------------------------------------------------------------
do $$
declare
  p record;
  q text;
  w text;
  wrapped constant text := '( SELECT auth.uid() AS uid)';      -- Postgres'in sarılı çağrıyı yazdığı biçim
  mark constant text := '@@ZATEN_SARILI@@';
  cmd text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check from pg_policies
     where schemaname = 'public'
       and (replace(coalesce(qual, ''), wrapped, mark) like '%auth.uid()%' or replace(coalesce(with_check, ''), wrapped, mark) like '%auth.uid()%')
  loop
    q := replace(replace(replace(p.qual, wrapped, mark), 'auth.uid()', '(select auth.uid())'), mark, '(select auth.uid())');
    w := replace(replace(replace(p.with_check, wrapped, mark), 'auth.uid()', '(select auth.uid())'), mark, '(select auth.uid())');
    cmd := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if q is not null then cmd := cmd || ' using (' || q || ')'; end if;
    if w is not null then cmd := cmd || ' with check (' || w || ')'; end if;
    execute cmd;
  end loop;
end $$;

-- Depolama: hukuk klasörü yazma politikası (storage.objects; aynı kalıpla, yalnız çağrı sarılır)
drop policy if exists legal_files_write on storage.objects;
create policy legal_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'evim' and (storage.foldername(name))[1] = 'hukuk-' || (select auth.uid())::text);

-- ---------------------------------------------------------------------
-- 2. Dizinsiz yabancı anahtarlar
-- ---------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select c.conrelid::regclass as tbl, t.relname as tname,
           (select string_agg(quote_ident(a.attname), ', ' order by x.ord) from unnest(c.conkey) with ordinality x(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = x.attnum) as cols,
           (select string_agg(a.attname, '_' order by x.ord) from unnest(c.conkey) with ordinality x(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = x.attnum) as colnames
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where c.contype = 'f' and n.nspname = 'public' and t.relkind = 'r'
       and not exists (
         select 1 from pg_index i
          where i.indrelid = c.conrelid and i.indisvalid and i.indpred is null
            and cardinality(string_to_array(i.indkey::text, ' ')) >= cardinality(c.conkey)
            and (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] <@ c.conkey)
  loop
    execute format('create index if not exists %I on %s (%s)', left(f.tname || '_' || f.colnames || '_fk', 63), f.tbl, f.cols);
  end loop;
end $$;
