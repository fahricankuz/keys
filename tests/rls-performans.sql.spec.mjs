// Migration rls_performans: politikalarda auth.uid() sorgu başına bir kez hesaplanır ("(select auth.uid())"), anlam değişmez;
// dizinsiz yabancı anahtar kalmaz. Anlam eşdeğerliği: migration öncesi ve sonrası politika tanımları (sarma kaldırılınca) birebir aynıdır.
import { test, expect } from '@playwright/test';
import { PGlite } from '@electric-sql/pglite';
import { newDb, ID, STUB, SCHEMA } from './db-helpers.mjs';

const parts = SCHEMA.split(/\n-- ===== migration: (\d{14}_rls_performans\.sql) =====\n/);
const BEFORE = parts[0];
const WRAPPED = '( SELECT auth.uid() AS uid)';
const norm = (s) => (s == null ? null : s.split(WRAPPED).join('auth.uid()'));
const POLICIES = `select schemaname || '.' || tablename || ' :: ' || policyname k, permissive, roles::text r, cmd, qual, with_check from pg_policies
                  where schemaname in ('public', 'storage') order by 1`;

let db, as, q;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

test('hiçbir public politikasında sarılmamış auth.uid() kalmadı (sarılı biçim kullanılıyor)', async () => {
  await as(null);
  const rows = await q(`select tablename, policyname from pg_policies where schemaname in ('public', 'storage')
    and (replace(coalesce(qual, ''), '${WRAPPED}', '') like '%auth.uid()%' or replace(coalesce(with_check, ''), '${WRAPPED}', '') like '%auth.uid()%')`);
  expect(rows).toEqual([]);
  const [{ n }] = await q(`select count(*)::int n from pg_policies where schemaname = 'public' and (qual like '%${WRAPPED}%' or with_check like '%${WRAPPED}%')`);
  expect(n).toBeGreaterThan(40);                                                              // çoğu politika auth.uid() kullanır; hepsi sarılı
});

test('anlam eşdeğerliği: migration öncesi ve sonrası her politika (kapsam, tür, roller, ifade) sarma kaldırılınca aynı', async () => {
  const before = new PGlite();
  await before.exec(STUB);
  await before.exec(BEFORE);
  await before.exec(BEFORE);
  const a = (await before.query(POLICIES)).rows;
  await as(null);
  const b = await q(POLICIES);
  expect(b.map((r) => r.k)).toEqual(a.map((r) => r.k));                                       // politika eklenip silinmedi
  const unwrapped = (await before.query(`select count(*)::int n from pg_policies where schemaname = 'public' and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')`)).rows[0].n;
  expect(unwrapped).toBeGreaterThan(0);                                                       // öncesinde sarılmamış çağrılar vardı (test anlamlı)
  for (let i = 0; i < a.length; i++) {
    // Tek bilinçli fark: reports_insert'in günlük sınır sayımı kendi tablosuna alt sorgu olmaktan çıkıp reports_today işlevine taşındı (özyineleme hatası).
    if (a[i].k === 'public.content_reports :: reports_insert') {
      expect(norm(b[i].with_check)).toContain('reports_today(');
      expect(norm(b[i].with_check)).toContain("(status = 'open'::text) AND (resolution = ''::text) AND ((property_id IS NULL) OR is_member(property_id))");
      continue;
    }
    expect({ k: b[i].k, permissive: b[i].permissive, r: b[i].r, cmd: b[i].cmd, qual: norm(b[i].qual), w: norm(b[i].with_check) },
      a[i].k).toEqual({ k: a[i].k, permissive: a[i].permissive, r: a[i].r, cmd: a[i].cmd, qual: norm(a[i].qual), w: norm(a[i].with_check) });
  }
});

test('bütün yabancı anahtarların sütunları bir dizinin ilk sütunları (Supabase "unindexed_foreign_keys" uyarısı kalmaz); dizinler geçerli', async () => {
  await as(null);
  const open = await q(`select c.conrelid::regclass::text t, c.conname from pg_constraint c join pg_class t on t.oid = c.conrelid join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f' and n.nspname = 'public' and t.relkind = 'r' and not exists (
      select 1 from pg_index i where i.indrelid = c.conrelid and i.indisvalid and i.indpred is null
        and cardinality(string_to_array(i.indkey::text, ' ')) >= cardinality(c.conkey)
        and (string_to_array(i.indkey::text, ' ')::int2[])[1:cardinality(c.conkey)] <@ c.conkey)`);
  expect(open).toEqual([]);
  const fk = await q(`select indexname from pg_indexes where schemaname = 'public' and indexname like '%\\_fk' order by 1`);
  expect(fk.length).toBeGreaterThan(30);
  for (const { indexname } of fk) expect(indexname.length).toBeLessThanOrEqual(63);
  // yeniden çalıştırınca ikinci bir dizin açılmaz
  const n0 = (await q(`select count(*)::int n from pg_indexes where schemaname = 'public'`))[0].n;
  await db.exec(SCHEMA);
  expect((await q(`select count(*)::int n from pg_indexes where schemaname = 'public'`))[0].n).toBe(n0);
});

test('davranış: politikalar sarılı olsa da aynı satırları verir (kiracı, mülk sahibi, yabancı, yönetici)', async () => {
  await as(ID.T);
  expect((await q(`select id from public.properties`)).map((r) => r.id)).toEqual(['p1']);
  expect((await q(`select count(*)::int c from public.memberships`))[0].c).toBeGreaterThan(0);
  await as(ID.X);
  expect(await q(`select id from public.properties`)).toEqual([]);
  expect(await q(`select * from public.profiles where id <> '${ID.X}'`)).toEqual([]);
  await as(ID.L);
  await db.query(`insert into public.notifications (user_id, title, body) values ($1, 'a', 'b')`, [ID.L]).catch(() => {});
  expect((await q(`select id from public.properties`)).map((r) => r.id)).toEqual(['p1']);
  await as(ID.A);
  expect((await q(`select id from public.properties order by id`)).map((r) => r.id)).toEqual(['p1', 'p2']);
});
