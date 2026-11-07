// Giriş tutanağı kilidi (gerçek Postgres / PGlite): iki taraf onaylayınca tutanak sistem tarafında değişmez olur;
// onay zamanı ve adı sunucuda yazılır, kilit anında içerik özeti (SHA-256) kaydedilir, kilitli fotoğraf dosyaları silinemez.
import { test, expect } from '@playwright/test';
import { newDb, ID } from './db-helpers.mjs';

const { L, T } = ID;
let db, as, q;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });

const ins = async () => (await q(`select inspect from public.property_shared where property_id = 'p1'`))[0].inspect;
const base = { tenantOk: false, landlordOk: false, rooms: [{ n: 'Salon', note: 'Duvar temiz', shots: ['sb:p1/a.jpg'], caps: ['Sol duvar'] }] };
const set = (obj) => db.query(`update public.property_shared set inspect = $1::jsonb where property_id = 'p1'`, [JSON.stringify(obj)]);

test('onay zamanı ve adı sunucuda yazılır; istemcinin gönderdiği zaman ezilir', async () => {
  await as(L);
  await set(base);
  await as(T);
  await set({ ...base, tenantOk: true, tenantAt: '2001-01-01T00:00:00Z', tenantBy: 'Sahte' });
  const i = await ins();
  expect(i.tenantOk).toBe(true);
  expect(i.tenantBy).toBe('Kiracı');
  expect(new Date(i.tenantAt).getFullYear()).toBeGreaterThan(2020);
  expect(i.lockedAt).toBeUndefined();
  expect(i.hash).toBeUndefined();
});

test('karşı tarafın onayı ve zamanı verilemez', async () => {
  await as(T);
  await expect(set({ ...(await ins()), landlordOk: true })).rejects.toThrow(/karşı tarafın/i);
});

test('ikinci onay tutanağı kilitler: kilit zamanı, iki onay zamanı ve içerik özeti yazılır', async () => {
  await as(L);
  const cur = await ins();
  await set({ ...cur, landlordOk: true });
  const i = await ins();
  expect(i.landlordBy).toBe('Ev Sahibi');
  expect(i.landlordAt).toBeTruthy();
  expect(i.tenantAt).toBe(cur.tenantAt);                      // kiracının onay zamanı korunur
  expect(i.lockedAt).toBeTruthy();
  expect(i.hash).toMatch(/^[0-9a-f]{64}$/);
});

test('kilitten sonra hiçbir taraf tutanağı değiştiremez: fotoğraf, açıklama, oda, onay', async () => {
  const kilitli = await ins();
  for (const uid of [L, T]) {
    await as(uid);
    const r = kilitli.rooms[0];
    for (const degisim of [
      { ...kilitli, rooms: [{ ...r, shots: [...r.shots, 'sb:p1/b.jpg'], caps: [...r.caps, 'Yeni'] }] },   // fotoğraf ekle
      { ...kilitli, rooms: [{ ...r, shots: [], caps: [] }] },                                                // fotoğraf sil
      { ...kilitli, rooms: [{ ...r, caps: ['Başka açıklama'] }] },                                          // açıklamayı değiştir
      { ...kilitli, rooms: [{ ...r, note: '' }] },                                                          // notu sil
      { ...kilitli, rooms: [...kilitli.rooms, { n: 'Mutfak', note: '', shots: [] }] },                      // oda ekle
      { ...kilitli, tenantOk: false },                                                                       // onayı geri al
      { ...kilitli, hash: 'x'.repeat(64) }                                                                   // özeti değiştir
    ]) await expect(set(degisim)).rejects.toThrow(/kilitlendi/);
  }
  await as(null);
  expect(await ins()).toEqual(kilitli);
});

test('kilitli tutanakla birlikte diğer alanlar (çıkış süreci) güncellenebilir; tutanak aynı kalır', async () => {
  await as(L);
  const kilitli = await ins();
  await db.query(`update public.property_shared set move_out = '{"rooms":[],"deductions":[],"tenantOk":false,"landlordOk":false,"refunded":null}' where property_id = 'p1'`);
  expect(await ins()).toEqual(kilitli);
});

test('kilit öncesi onay geri alınınca onay zamanı silinir; yeniden onayda yeni zaman yazılır', async () => {
  await as(null);
  await db.query(`update public.property_shared set inspect = $1::jsonb where property_id = 'p1'`, [JSON.stringify(base)]);   // sunucu rolü: sıfırla
  await as(T);
  await set({ ...base, tenantOk: true });
  const a = (await ins()).tenantAt;
  expect(a).toBeTruthy();
  await set({ ...(await ins()), tenantOk: false });
  const i = await ins();
  expect(i.tenantAt).toBeUndefined();
  expect(i.tenantBy).toBeUndefined();
});

test('kilitli tutanağın fotoğraf dosyası depodan silinemez; kilitsizler silinir', async () => {
  await as(null);
  await db.query(`update public.property_shared set inspect = $1::jsonb where property_id = 'p1'`, [JSON.stringify(base)]);
  await as(L);
  await db.query(`insert into storage.objects (bucket_id, name, owner) values ('evim', 'p1/a.jpg', $1), ('evim', 'p1/zz.jpg', $1)`, [L]);
  await as(T);
  await set({ ...base, tenantOk: true });
  await as(L);
  await set({ ...(await ins()), landlordOk: true });
  await db.query(`delete from storage.objects where name in ('p1/a.jpg', 'p1/zz.jpg')`);
  await as(null);
  const kalan = (await q(`select name from storage.objects order by name`)).map((r) => r.name);
  expect(kalan).toEqual(['p1/a.jpg']);                                    // tutanaktaki fotoğraf kaldı, ilgisiz dosya silindi
});
