-- blok adi tekrari
-- Birim etiketinde "Blok" tekrarı önlenir: blok adı zaten "Blok" / "Bloğu" / "Block" ile bitiyorsa ("A Blok", "Gül Bloğu")
-- sona bir daha " Blok" eklenmez ("A Blok Blok No 3" yerine "A Blok No 3"). Bildirim ve e-postalar bu işlevi kullanır.
-- Uygulamadaki karşılığı: app/src/domain/site.js → blockTitle / unitLabel. Eski istemciyi etkilemez (yalnız işlev gövdesi değişir).

create or replace function public.unit_label(unit uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when o.sector = 'site'
              then case when u.block <> '' then btrim(u.block) || case when btrim(u.block) ~* '(^|[[:space:]])(blok|blo[ğĞ]u|block)$' then ' ' else ' Blok ' end else '' end
                   || case when u.no ~ '^[0-9]' then 'No ' else '' end || u.no
              else case when u.block <> '' then u.block || ' · ' else '' end || u.no end
  from public.site_units u join public.organizations o on o.id = u.org_id where u.id = unit
$$;
revoke execute on function public.unit_label(uuid) from public, anon, authenticated;
