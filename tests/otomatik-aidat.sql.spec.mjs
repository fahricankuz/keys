// Otomatik aidat varsayılan (migration otomatik_aidat_varsayilan): yeni site açık başlar; sektörü siteye çevrilen kurum da;
// AVM açılmaz; migration yeniden çalışınca yöneticinin kapattığı site yeniden açılmaz.
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { newDb, ID } from './db-helpers.mjs';

const MIG = new URL('../supabase/migrations/', import.meta.url).pathname;
const file = readdirSync(MIG).find((f) => f.endsWith('_otomatik_aidat_varsayilan.sql'));
let db, as, q;

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

test('yeni site açık başlar (bu aydan, son ödeme 10); AVM açılmaz; siteye çevrilen kurum açılır', async () => {
  await as(ID.A);
  const [{ admin_org_save: site }] = await q(`select public.admin_org_save($1)`, [{ name: 'Yeni Site', sector: 'site' }]);
  const [{ admin_org_save: avm }] = await q(`select public.admin_org_save($1)`, [{ name: 'Çarşı AVM', sector: 'avm' }]);
  await as(null);
  const month = (await q(`select to_char((now() at time zone 'Europe/Istanbul')::date, 'YYYY-MM') m`))[0].m;
  expect(await q(`select enabled, run_day, due_day, start_month, auto_default from public.site_auto where org_id = $1`, [site]))
    .toEqual([{ enabled: true, run_day: 1, due_day: 10, start_month: month, auto_default: true }]);
  expect(await q(`select 1 from public.site_auto where org_id = $1`, [avm])).toEqual([]);
  await q(`update public.organizations set sector = 'site' where id = $1`, [avm]);
  expect((await q(`select enabled from public.site_auto where org_id = $1`, [avm]))[0].enabled).toBe(true);
});

test('migration: kapalı eski site gelecek aydan açılır; yeniden çalışınca yöneticinin kapattığı açılmaz', async () => {
  await as(ID.A);
  const [{ admin_org_save: old }] = await q(`select public.admin_org_save($1)`, [{ name: 'Eski Site', sector: 'site' }]);
  await as(null);
  // Eski davranış: satır kapalı ve işaretsiz.
  await q(`update public.site_auto set enabled = false, auto_default = false, start_month = null where org_id = $1`, [old]);
  const sql = readFileSync(MIG + file, 'utf8');
  await db.exec(sql);
  const next = (await q(`select to_char((date_trunc('month', now() at time zone 'Europe/Istanbul') + interval '1 month')::date, 'YYYY-MM') m`))[0].m;
  expect(await q(`select enabled, start_month from public.site_auto where org_id = $1`, [old])).toEqual([{ enabled: true, start_month: next }]);
  await q(`update public.site_auto set enabled = false where org_id = $1`, [old]);   // yönetici kapattı
  await db.exec(sql);
  expect((await q(`select enabled from public.site_auto where org_id = $1`, [old]))[0].enabled).toBe(false);
});
