// Yeni istemci + ESKİ şema (site migration'lardan ÖNCE yayına çıkar): sunucuda olmayan işlev (PostgREST 404 / PGRST202) için eski yola düşülür.
//   - sistem mesajları: post_system_message yoksa eski doğrudan insert (from_role = 'system', eski satır biçimi); yokluk oturum boyunca hatırlanır
//   - sakin davet kodu: site_resident_code yoksa site_residents.code seçilir
//   - davet e-postası: {sent:false, reason:'throttled'} gönderilmedi sayılır
//   - RESIDENT_COLS yalnız eski şemada da bulunan sütunları içerir (mailed_at yok)
// Tarayıcı gerekmez; sunucu yerine kayıt tutan bir sahte istemci kullanılır.
import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const D = new URL('../app/src/domain/', import.meta.url).pathname;
const STUBS = new URL('./stubs/', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'rpc-yedek-'));
const alias = { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js', 'expo-secure-store': STUBS + 'expo-secure-store.js' };

// backend.js yerine: site.js yalnız client(), live, storeFile, inviteLink ve inviteRejected'ı kullanır; istemci testten verilir (globalThis.__sb).
const backendStub = `export const client = async () => globalThis.__sb; export const live = {}; export const storeFile = async () => null;
  export const inviteLink = (c) => 'https://anahtar.io/katil?kod=' + c; export const inviteRejected = () => Object.assign(new Error('red'), { code: 'INVITE' });`;

let n = 0;
/** İçeriği paketleyip yeni bir modül olarak yükler (her çağrı kendi bellek durumunu, yani "işlev yok" önbelleğini alır). */
async function load(contents, { stubBackend = false } = {}) {
  const out = join(dir, `m${n++}.mjs`);
  await build({
    stdin: { contents, resolveDir: D, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent', alias,
    external: ['@supabase/supabase-js', 'expo-crypto'],
    plugins: stubBackend ? [{ name: 'backend-stub', setup(b) {
      b.onResolve({ filter: /(^|\/)backend\.js$/ }, () => ({ path: 'backend-stub', namespace: 'stub' }));
      b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: backendStub, loader: 'js' }));
    } }] : []
  });
  return import(pathToFileURL(out).href);
}

const MISSING = { status: 404, error: { code: 'PGRST202', message: 'Could not find the function public.post_system_message(p_kind, p_payload, p_property) in the schema cache' } };
const OK = { status: 200, error: null, data: 'id' };

/** Çağrıları kaydeden sahte supabase istemcisi. rpcs: işlev adı → yanıt (ya da yanıt dizisi); tables: tablo → { upsert, select } yanıtı. */
function fake({ rpcs = {}, upsert = { error: null }, select = { data: { code: 'S1234567' }, error: null }, invoke = { data: { ok: true, sent: true }, error: null } } = {}) {
  const log = { rpc: [], upsert: [], select: [], update: [], invoke: [] };
  const queues = Object.fromEntries(Object.entries(rpcs).map(([k, v]) => [k, Array.isArray(v) ? [...v] : [v]]));
  const sb = {
    rpc: async (name, args) => { log.rpc.push([name, args]); const q = queues[name] || [OK]; return q.length > 1 ? q.shift() : q[0]; },
    from: (t) => ({
      upsert: async (rows, opts) => { log.upsert.push([t, rows, opts]); return typeof upsert === 'function' ? upsert(log.upsert.length) : upsert; },
      select: (cols) => ({ eq: (k, v) => ({ maybeSingle: async () => { log.select.push([t, cols, k, v]); return select; } }) }),
      update: (v) => ({ eq: async (k, id) => { log.update.push([t, v, k, id]); return { error: null }; } })
    }),
    functions: { invoke: async (name, o) => { log.invoke.push([name, o]); return invoke; } }
  };
  return { sb, log };
}

const op = (extra = {}) => ({
  table: 'messages', kind: 'rpc', fn: 'post_system_message',
  calls: [{ p_property: 'p1', p_kind: 'request_status', p_payload: { id: 'm1', text: 'Talep durumu: Musluk · İşlemde' } }],
  fallbackRows: [{ id: 'm1', property_id: 'p1', from_role: 'system', by_user: 'u1', body: 'Talep durumu: Musluk · İşlemde', at: '2026-11-13T10:00:00.000Z', image_path: null }],
  ...extra
});

test('sistem mesajı: işlev varsa yalnız işlev çağrılır, doğrudan insert yok', async () => {
  const M = await load(`export * from '${D}system-message.js';`);
  const { sb, log } = fake();
  await M.writeSystemMessages(sb, op());
  expect(log.rpc).toEqual([['post_system_message', op().calls[0]]]);
  expect(log.upsert).toEqual([]);
});

test('sistem mesajı: işlev sunucuda yoksa (404 / PGRST202) eski doğrudan insert: from_role system, eski satır biçimi, aynı kimlik atlanır; yokluk hatırlanır', async () => {
  const M = await load(`export * from '${D}system-message.js';`);
  const { sb, log } = fake({ rpcs: { post_system_message: MISSING } });
  await M.writeSystemMessages(sb, op());
  expect(log.upsert).toEqual([['messages', op().fallbackRows, { ignoreDuplicates: true }]]);
  expect(log.upsert[0][1][0]).toEqual({ id: 'm1', property_id: 'p1', from_role: 'system', by_user: 'u1', body: 'Talep durumu: Musluk · İşlemde', at: '2026-11-13T10:00:00.000Z', image_path: null });
  // ikinci eşitleme: işlev artık sorulmaz (oturum boyunca "yok" hatırlanır), doğrudan insert gider
  await M.writeSystemMessages(sb, op({ calls: [{ ...op().calls[0] }, { ...op().calls[0] }], fallbackRows: [op().fallbackRows[0], { ...op().fallbackRows[0], id: 'm2' }] }));
  expect(log.rpc.length).toBe(1);
  expect(log.upsert.length).toBe(2);
  expect(log.upsert[1][1].map((r) => r.id)).toEqual(['m1', 'm2']);
});

test('sistem mesajı: 404 durum kodu ya da "Could not find the function" iletisi de işlev yok demektir; başka hata yedeğe düşmez, fırlatılır', async () => {
  for (const res of [{ status: 404, error: { code: '', message: 'Not Found' } }, { status: 400, error: { code: 'PGRST202', message: 'x' } },
                     { status: 400, error: { code: '', message: 'Could not find the function public.post_system_message' } }]) {
    const M = await load(`export * from '${D}system-message.js';`);
    const { sb, log } = fake({ rpcs: { post_system_message: res } });
    await M.writeSystemMessages(sb, op());
    expect(log.upsert.length, JSON.stringify(res)).toBe(1);
  }
  const M = await load(`export * from '${D}system-message.js';`);
  for (const err of [{ code: '42501', message: 'Bu mülkte mesaj yazma yetkin yok' }, { code: '22023', message: 'Sistem mesajı metni türüne uymuyor' }, { code: '', message: 'Failed to fetch' }]) {
    const { sb, log } = fake({ rpcs: { post_system_message: { status: 400, error: err } } });
    await expect(M.writeSystemMessages(sb, op())).rejects.toBe(err);
    expect(log.upsert, err.message).toEqual([]);                      // gerçek hata sessizce doğrudan insert'e çevrilmez
  }
});

test('sistem mesajı: eski şemada türü bulunamayan mesaj da eski yolla yazılır; işlevle gönderilmez', async () => {
  const M = await load(`export * from '${D}system-message.js';`);
  const { sb, log } = fake({ rpcs: { post_system_message: MISSING } });
  // işlev çağrısı yok (tür çözülemedi): yokluk keşfedilmediği için doğrudan insert da gitmez; sonraki işlevli çağrı keşfeder
  await M.writeSystemMessages(sb, op({ calls: [] }));
  expect(log.rpc).toEqual([]);
  expect(log.upsert).toEqual([]);
  await M.writeSystemMessages(sb, op());
  await M.writeSystemMessages(sb, op({ calls: [], fallbackRows: [{ ...op().fallbackRows[0], id: 'eski-turlu', body: 'Bilinmeyen eski metin' }] }));
  expect(log.upsert.map((u) => u[1].map((r) => r.id))).toEqual([['m1'], ['eski-turlu']]);
});

test('sistem mesajı: doğrudan insert sonradan kapatılırsa (RLS 42501) işlev bir kez yeniden denenir', async () => {
  const M = await load(`export * from '${D}system-message.js';`);
  const rls = { error: { code: '42501', message: 'new row violates row-level security policy for table "messages"' } };
  // 1. işlev yok -> doğrudan insert reddedildi -> işlev yeniden denendi ve bu kez var
  const a = fake({ rpcs: { post_system_message: [MISSING, OK] }, upsert: rls });
  await M.writeSystemMessages(a.sb, op());
  expect(a.log.rpc.length).toBe(2);
  expect(a.log.upsert.length).toBe(1);
  // işlev hâlâ yoksa ve doğrudan insert de reddedilirse hata fırlatılır (sonsuz döngü yok)
  const M2 = await load(`export * from '${D}system-message.js';`);
  const b = fake({ rpcs: { post_system_message: MISSING }, upsert: rls });
  await expect(M2.writeSystemMessages(b.sb, op())).rejects.toMatchObject({ code: '42501' });
  expect(b.log.rpc.length).toBe(2);
  expect(b.log.upsert.length).toBe(2);
});

test('residentCode: işlev varsa işlevden; yoksa (eski şema) code sütunu seçilir ve yokluk hatırlanır; yetki hatasında boş (yedek yok)', async () => {
  const bundle = `export { residentCode, RESIDENT_COLS } from '${D}site.js';`;
  let M = await load(bundle, { stubBackend: true });
  let f = fake({ rpcs: { site_resident_code: { status: 200, error: null, data: 'SABCDEFGHJKMNPQR2' } } });
  globalThis.__sb = f.sb;
  expect(await M.residentCode('r1')).toBe('SABCDEFGHJKMNPQR2');
  expect(f.log.select).toEqual([]);

  M = await load(bundle, { stubBackend: true });
  f = fake({ rpcs: { site_resident_code: { status: 404, error: { code: 'PGRST202', message: 'Could not find the function public.site_resident_code(p_resident)' } } }, select: { data: { code: 'S1234567' }, error: null } });
  globalThis.__sb = f.sb;
  expect(await M.residentCode('r1')).toBe('S1234567');
  expect(f.log.select).toEqual([['site_residents', 'code', 'id', 'r1']]);
  expect(await M.residentCode('r2')).toBe('S1234567');
  expect(f.log.rpc.length).toBe(1);                                 // ikincisinde işlev yeniden sorulmadı
  expect(f.log.select.length).toBe(2);

  M = await load(bundle, { stubBackend: true });
  f = fake({ rpcs: { site_resident_code: { status: 400, error: { code: '42501', message: 'Davet yetkin yok' } } } });
  globalThis.__sb = f.sb;
  expect(await M.residentCode('r1')).toBe('');
  expect(f.log.select).toEqual([]);                                  // yetki yok: sütunu doğrudan okumayı denemez

  // eski şemada kod satırı yoksa (silinmiş) boş döner
  M = await load(bundle, { stubBackend: true });
  f = fake({ rpcs: { site_resident_code: MISSING }, select: { data: null, error: null } });
  globalThis.__sb = f.sb;
  expect(await M.residentCode('yok')).toBe('');
});

test('RESIDENT_COLS: yalnız migration\'lardan önceki şemada da bulunan sütunlar (mailed_at ve code yok)', async () => {
  const M = await load(`export { RESIDENT_COLS } from '${D}site.js';`, { stubBackend: true });
  const cols = M.RESIDENT_COLS.split(',').map((c) => c.trim());
  expect(cols).toEqual(['id', 'org_id', 'unit_id', 'user_id', 'role', 'name', 'phone', 'email', 'lives_here', 'created_at', 'invited_at']);
  expect(cols).not.toContain('mailed_at');
  expect(cols).not.toContain('code');
});

test('sendSiteInvite: gönderildi true; {sent:false} false; reason throttled "throttled" (gönderilmedi); hata ve e-postasız false; davet her durumda işaretlenir', async () => {
  const bundle = `export { sendSiteInvite } from '${D}site.js';`;
  const M = await load(bundle, { stubBackend: true });
  const run = async (invoke, email = 'a@b.co') => { const f = fake({ invoke }); globalThis.__sb = f.sb; return { r: await M.sendSiteInvite({ id: 'r1', email }), f }; };
  expect((await run({ data: { ok: true, sent: true }, error: null })).r).toBe(true);
  expect((await run({ data: { ok: true }, error: null })).r).toBe(true);                       // eski işlev yanıtı (sent alanı yok)
  expect((await run({ data: { ok: true, sent: false, reason: 'throttled' }, error: null })).r).toBe('throttled');
  expect((await run({ data: { ok: true, sent: false }, error: null })).r).toBe(false);
  expect((await run({ data: null, error: { message: 'x' } })).r).toBe(false);
  const noMail = await run({ data: { ok: true, sent: true }, error: null }, '');
  expect(noMail.r).toBe(false);
  expect(noMail.f.log.invoke).toEqual([]);
  const th = await run({ data: { ok: true, sent: false, reason: 'throttled' }, error: null });
  expect(th.f.log.update.length).toBe(1);                                                      // markInvited yine çalışır (WhatsApp akışı için)
});
