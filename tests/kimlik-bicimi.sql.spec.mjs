// Metin kimlik biçimi (migration kimlik_bicimi): "__proto__" gibi kimlikler ve izinsiz karakterler reddedilir; normal kimlik geçer.
import { test, expect } from '@playwright/test';
import { newDb, tryCall, ID } from './db-helpers.mjs';

test('mülk ve mesaj kimliği: __proto__, constructor ve izinsiz karakter reddedilir', async () => {
  const { db, as, q } = await newDb();
  await as(ID.L);
  for (const bad of ['__proto__', 'constructor', 'a b', 'x<y>', '']) {
    expect(await tryCall(db, `insert into public.properties (id, owner_id, name, rent, due_day) values ($1, $2, 'Ev', 1000, 5)`, [bad, ID.L])).toMatch(/id_bicim|check/);
  }
  await q(`insert into public.properties (id, owner_id, name, rent, due_day) values ('p-ok_1', $1, 'Ev', 1000, 5)`, [ID.L]);
  await as(null);                                   // kural RLS'ten bağımsız: doğrudan yazımda da geçerli
  for (const t of ['messages', 'requests', 'documents', 'expenses', 'rent_history'])
    expect((await db.query(`select pg_get_constraintdef(oid) d from pg_constraint where conname = $1`, [t + '_id_bicim'])).rows[0]?.d).toMatch(/__proto__/);
});
