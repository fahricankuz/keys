// CRM (migration crm): yalnız yönetici okur ve yazar; not eklenince son temas güncellenir; kazanıldı/kaybedildi kapanış zamanı;
// 30/60/90 gün sessizlik ve takip günü hatırlatması yöneticilere; kapalı kişiye hatırlatma yok.
import { test, expect } from '@playwright/test';
import { newDb, ID, tryCall } from './db-helpers.mjs';

let db, as, q, a, b;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await as(ID.A);
  [{ id: a }] = await q(`insert into public.crm_leads (name, phone, company, sector, plan, units, stage, source, next_at) values ('Selin Yılmaz', '0532', 'Atakum Sitesi', 'site', 'kurumsal', 240, 'gorusme', 'web', '2026-11-20') returning id`);
  [{ id: b }] = await q(`insert into public.crm_leads (name, plan, units) values ('Ali Veli', 'bes', 3) returning id`);
  await as(null);
  await db.query(`update public.crm_leads set created_at = '2026-10-01T09:00:00Z' where id in ($1, $2)`, [a, b]);
});

test('not eklenince son temas; kazanıldı ve kaybedildi kapanış zamanı yazar, yeniden açınca silinir', async () => {
  await as(ID.A);
  await q(`insert into public.crm_notes (lead_id, note) values ($1, 'Aradım, teklif istedi')`, [a]);
  expect((await q(`select last_contact_at is not null c from public.crm_leads where id = $1`, [a]))[0].c).toBe(true);
  await q(`update public.crm_leads set stage = 'kazanildi' where id = $1`, [b]);
  expect((await q(`select closed_at is not null c from public.crm_leads where id = $1`, [b]))[0].c).toBe(true);
  await q(`update public.crm_leads set stage = 'teklif' where id = $1`, [b]);
  expect((await q(`select closed_at from public.crm_leads where id = $1`, [b]))[0].closed_at).toBe(null);
  expect(await tryCall(db, `update public.crm_leads set stage = 'bilinmeyen' where id = $1`, [b])).toMatch(/check/);
});

test('hatırlatma: takip günü ve 30 gün sessizlik yöneticiye; kapalı kişiye yok; aynı gün iki kez yazılmaz', async () => {
  await as(null);
  await db.query(`update public.crm_leads set last_contact_at = null where id = $1`, [a]);
  expect((await q(`select public.crm_reminders('2026-10-31') n`))[0].n).toBe(2);       // ikisi de 30 gün (1 Ekim → 31 Ekim)
  expect((await q(`select public.crm_reminders('2026-10-31') n`))[0].n).toBe(0);
  const titles = (await q(`select title from public.notifications where user_id = $1 and tag like 'crm-%' order by title`, [ID.A])).map((x) => x.title);
  expect(titles).toEqual(['CRM: Ali Veli 30 gündür aranmadı', 'CRM: Selin Yılmaz 30 gündür aranmadı']);
  expect((await q(`select public.crm_reminders('2026-11-20') n`))[0].n).toBe(1);       // takip günü (Selin)
  await db.query(`update public.crm_leads set stage = 'kaybedildi' where id = $1`, [a]);
  expect((await q(`select public.crm_reminders('2026-11-30') n`))[0].n).toBe(1);       // yalnız Ali (60 gün); Selin kapalı
});

test('kullanıcı CRM’i göremez, yazamaz', async () => {
  for (const who of [ID.L, ID.T]) {
    await as(who);
    expect(await q(`select * from public.crm_leads`)).toEqual([]);
    expect(await q(`select * from public.crm_notes`)).toEqual([]);
    expect(await tryCall(db, `insert into public.crm_leads (name) values ('Sahte')`)).toMatch(/row-level security/);
  }
});
