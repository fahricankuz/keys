// Kur altyapısı (migration kur_altyapisi): fx_rates yalnız sunucudan yazılır, oturum açan okur; hafta sonu ve tatilde son iş günü.
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { newDb, ID, tryCall } from './db-helpers.mjs';

let db, as, q;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await as(null);
  // Cuma 6 Kasım ve pazartesi 9 Kasım 2026; arada hafta sonu yok (kur açıklanmaz).
  await db.exec(`insert into public.fx_rates (day, currency, buy, sell) values
    ('2026-11-06', 'USD', 41.9, 42.0), ('2026-11-09', 'USD', 42.1, 42.2), ('2026-11-06', 'EUR', 48.4, 48.5)`);
});

const rate = async (cur, d) => (await q(`select public.fx_rate($1, $2::date)::text r`, [cur, d]))[0].r;

test('o günün satış kuru; hafta sonu ve tatilde son iş günü; TL 1; kur yoksa boş', async () => {
  await as(ID.L);
  expect(await rate('USD', '2026-11-06')).toBe('42.0000');
  expect(await rate('USD', '2026-11-07')).toBe('42.0000');   // cumartesi → cuma
  expect(await rate('USD', '2026-11-08')).toBe('42.0000');   // pazar → cuma
  expect(await rate('USD', '2026-11-09')).toBe('42.2000');
  expect(await rate('USD', '2026-12-31')).toBe('42.2000');   // henüz açıklanmamış gün → son kur
  expect(await rate('EUR', '2026-11-09')).toBe('48.5000');
  expect(await rate('TRY', '2026-11-09')).toBe('1');
  expect(await rate('USD', '2019-12-31')).toBe(null);        // kayıttan önce
});

test('oturum açan okur, kimse yazamaz; oturumsuz okuyamaz', async () => {
  for (const who of [ID.L, ID.T, ID.A]) {
    await as(who);
    expect((await q(`select count(*)::int n from public.fx_rates`))[0].n).toBe(3);
    expect(await tryCall(db, `insert into public.fx_rates (day, currency, sell) values ('2026-11-10', 'USD', 1)`)).toBeTruthy();
    expect(await tryCall(db, `update public.fx_rates set sell = 1`)).toBeTruthy();
    expect(await tryCall(db, `delete from public.fx_rates`)).toBeTruthy();
  }
  await as(null, true);
  expect(await tryCall(db, `select * from public.fx_rates`)).toMatch(/permission denied/);
  await as(null);
  expect((await q(`select count(*)::int n from public.fx_rates where sell = 1`))[0].n).toBe(0);
});

test('hatalı kur reddedilir: sıfır, eksi, bilinmeyen para birimi', async () => {
  await as(null);
  expect(await tryCall(db, `insert into public.fx_rates (day, currency, sell) values ('2026-11-10', 'USD', 0)`)).toBeTruthy();
  expect(await tryCall(db, `insert into public.fx_rates (day, currency, sell) values ('2026-11-10', 'USD', -1)`)).toBeTruthy();
  expect(await tryCall(db, `insert into public.fx_rates (day, currency, sell) values ('2026-11-10', 'GBP', 50)`)).toBeTruthy();
  expect(await tryCall(db, `insert into public.fx_rates (day, currency, sell) values ('2026-11-06', 'USD', 43)`)).toMatch(/duplicate|unique/);
});

test('tufe-sync zamanlaması her güne çevrilir (yalnız iş varsa; pg_cron yoksa hiçbir şey yapmaz)', () => {
  const dir = new URL('../supabase/migrations/', import.meta.url);
  const f = readdirSync(dir).find((x) => x.endsWith('_kur_altyapisi.sql'));
  const sql = readFileSync(new URL(f, dir), 'utf8');
  expect(sql).toMatch(/if exists \(select 1 from pg_extension where extname = 'pg_cron'\)/);
  expect(sql).toContain(`cron.alter_job(jobid, schedule := '0 13 * * *') from cron.job where jobname = 'tufe-sync-aylik'`);
});
