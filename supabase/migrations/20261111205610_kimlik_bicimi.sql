-- Metin kimliklere biçim kuralı: yalnız harf, rakam ve _ : . - (en çok 80); __proto__, constructor, prototype yasak.
-- Neden: istemci kayıtları kimlikle anahtarlanmış nesnelerde tutar (S.props[id] …). Kimliği "__proto__" olan bir mülk (API üzerinden
-- açılıp kiracıya paylaşılırsa) kiracının tarayıcısında nesne prototipini değiştirebilirdi (prototip kirlenmesi; CodeQL uyarıları).
-- Mevcut kayıtlar kurala uyuyor (production'da denetlendi); kural yalnız yeni ve değişen satırlarda uygulanır (NOT VALID). Yeniden çalıştırılabilir.
do $$
declare t text;
begin
  foreach t in array array['properties','rent_history','requests','messages','documents','expenses'] loop
    if not exists (select 1 from pg_constraint where conname = t || '_id_bicim') then
      execute format('alter table public.%I add constraint %I check (id ~ ''^[A-Za-z0-9_:.-]{1,80}$'' and id not in (''__proto__'',''constructor'',''prototype'')) not valid', t, t || '_id_bicim');
    end if;
  end loop;
end $$;
