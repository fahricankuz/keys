-- Düzenli gider eklendiğinde (ya da yeniden başlatıldığında) bu ayın günü geçtiyse o ayın gideri hemen yazılır.
-- Sorun: düzenli gider yalnız her sabahki işte (site_recurring_run, 06:15 UTC) yazılıyordu; gün içinde eklenen ve ayın günü geçmiş
-- düzenli gider ertesi sabaha kadar "Giderler"de ve kasada görünmüyordu. Aynı ay ikinci kez yazılmaz (last_month).
-- Yeni işlev ve tetikleyici; eski istemciyle uyumlu, yeniden çalıştırılabilir.

/** Tek düzenli gider için bu ayın kaydı (site_recurring_run ile aynı kural, yalnız bu satır). */
create or replace function public.site_recurring_one(rid uuid, today date default (now() at time zone 'Europe/Istanbul')::date)
returns int language plpgsql security definer set search_path = public as $$
declare m text := to_char(today, 'YYYY-MM'); m0 date := date_trunc('month', today)::date; n int;
begin
  insert into public.site_expenses (org_id, cat, amount, spent_on, note, recurring_id)
  select r.org_id, r.cat, r.amount, m0 + (r.day - 1), r.note, r.id
  from public.site_recurring_expenses r join public.organizations o on o.id = r.org_id and o.status = 'active'
  where r.id = rid and r.active and r.start_month <= m and (r.end_month is null or r.end_month >= m)
    and extract(day from today) >= r.day and coalesce(r.last_month, '') < m
  on conflict do nothing;
  get diagnostics n = row_count;
  if n > 0 then update public.site_recurring_expenses set last_month = m where id = rid; end if;
  return n;
end $$;
revoke execute on function public.site_recurring_one(uuid, date) from public, anon, authenticated;

create or replace function public.site_recurring_now()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active then perform public.site_recurring_one(new.id); end if;
  return null;
end $$;
revoke execute on function public.site_recurring_now() from public, anon, authenticated;
drop trigger if exists site_recurring_now on public.site_recurring_expenses;
create trigger site_recurring_now after insert or update of active on public.site_recurring_expenses
  for each row execute function public.site_recurring_now();
