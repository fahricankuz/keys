// Kurum sözleşmesi sektöre göre sayılır (migration kurum_sektor_sayac): GYO/AVM/depo/site birimleri sayar ve birim eklemesi
// sözleşme adediyle sınırlıdır; bu kurumların master'ının kişisel mülkleri kişisel pakete tabidir (deneme görünür, kurum sınırı yok).
// Emlak ofisi/aile ofisi/diğer master'ın mülklerini sayar ve kişisel deneme göstermez. Gerçek Postgres'te (PGlite) sınanır.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

const G = '00000000-0000-0000-0000-0000000000f1', E = '00000000-0000-0000-0000-0000000000f2';
let db, as, q, gyo, emlak;
const acc = async (u) => { await as(u); return (await q(`select public.my_access() a`))[0].a; };

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  ({ db, as, q } = await newDb());
  await as(null);
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'gyo@ornek.com', '{"name":"GYO","role":"landlord"}'),
    ($2, 'emlak@ornek.com', '{"name":"Emlak","role":"landlord"}')`, [G, E]);
  await as(ID.A);
  [{ admin_org_save: gyo }] = await q(`select public.admin_org_save($1)`, [{ name: 'GYO A.Ş.', sector: 'gyo', units: 3 }]);
  [{ admin_org_save: emlak }] = await q(`select public.admin_org_save($1)`, [{ name: 'Emlak Ofisi', sector: 'emlak', units: 4 }]);
  await q(`select public.admin_org_set_master($1, 'gyo@ornek.com')`, [gyo]);
  await q(`select public.admin_org_set_master($1, 'emlak@ornek.com')`, [emlak]);
});

test('GYO master: kişisel tarafta deneme ve kişisel sınır; kurum sınırı ve kurum bilgisi yok', async () => {
  const a = await acc(G);
  expect(a).toMatchObject({ access: true, inTrial: true, plan: 'trial', units: 5, org: null });
});

test('GYO birimleri sözleşme adediyle sınırlı (sunucu işleri aşabilir); kişisel mülk kuruma bağlanmaz', async () => {
  await as(G);
  for (const no of ['1', '2', '3']) await q(`insert into public.site_units (org_id, no) values ($1, $2)`, [gyo, no]);
  expect(await tryCall(db, `insert into public.site_units (org_id, no) values ($1, '4')`, [gyo])).toMatch(/Sözleşme sınırı: en fazla 3 birim/);
  await as(null);                                                                 // oturumsuz sunucu işi (içe aktarma vb.)
  await q(`insert into public.site_units (org_id, no) values ($1, '4')`, [gyo]);
  await as(G);
  await q(`insert into public.properties (id, owner_id, name) values ('g-ev', $1, 'Kendi evim')`, [G]);
  expect((await q(`select org_id from public.properties where id = 'g-ev'`))[0].org_id).toBeNull();
});

test('Emlak ofisi master: kurumsal, deneme yok; sözleşme mülkleri sayar ve kullanım döner', async () => {
  await as(E);
  await q(`insert into public.properties (id, owner_id, name) values ('e1', $1, 'Daire 1')`, [E]);
  const a = await acc(E);
  expect(a).toMatchObject({ plan: 'kurumsal', units: 4, inTrial: false, trialEnds: null, org: emlak, orgName: 'Emlak Ofisi', orgUsed: 1 });
  await as(E);
  for (const id of ['e2', 'e3', 'e4']) await q(`insert into public.properties (id, owner_id, name) values ($1, $2, 'x')`, [id, E]);
  expect(await tryCall(db, `insert into public.properties (id, owner_id, name) values ('e5', $1, 'x')`, [E])).toMatch(/Sözleşme sınırı: en fazla 4 mülk/);
});
