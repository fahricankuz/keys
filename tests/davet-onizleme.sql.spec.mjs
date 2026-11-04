// /katil sayfasının dayandığı önizlemeler gerçek şemada: var olmayan kod null döner (sayfa "Davet bulunamadı" der).
import { test, expect } from '@playwright/test';
import { newDb } from './db-helpers.mjs';

test('var olmayan kiracı ve site davet kodu oturumsuz çağrıda null döner', async () => {
  const { as, q } = await newDb();
  await as(null, true);
  expect((await q(`select public.invite_preview('YANLIS99') as r`))[0].r).toBeNull();
  expect((await q(`select public.site_invite_info('SABCDEF0') as r`))[0].r).toBeNull();
});
