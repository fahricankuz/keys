// Uygulama logları (migration uygulama_loglari): kişisel veri temizliği, yetkiler, yakalanan hata türü, saklama süresi.
import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { newDb, tryCall, ID } from './db-helpers.mjs';

let db, as, q;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { ({ db, as, q } = await newDb()); });
test.beforeEach(async () => { await as(null); await q(`delete from public.client_errors`); await q(`delete from public.function_logs`); });

const SAMPLES = [
  ['Kullanıcı ali.veli+x@ornek.com.tr bulunamadı', 'Kullanıcı [e-posta] bulunamadı'],
  ['Authorization: Bearer abcdefgh12345678', 'Authorization: [gizli] [gizli]'],
  ['istek Bearer abcdefgh12345678 reddedildi', 'istek Bearer [gizli] reddedildi'],
  ['jeton eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2ln geçersiz', 'jeton [jeton] geçersiz'],
  ['/katil?token=abc123&x=1', '/katil?token=[gizli]&x=1'],
  ['{"password":"gizli-sifre-1","a":1}', '{"password":"[gizli]","a":1}'],
  ['Numara 0532 123 45 67 geçersiz', 'Numara [telefon] geçersiz'],
  ['Numara +905321234567.', 'Numara [telefon].'],
  ['Sipariş 1234567890123456 ve kullanıcı 00000000-0000-4000-8000-00000000000a', 'Sipariş 1234567890123456 ve kullanıcı 00000000-0000-4000-8000-00000000000a'],
  ['TypeError: x is not a function at /_expo/static/js/web/entry-0123456789abcdef0123456789abcdef.js:1:2', 'TypeError: x is not a function at /_expo/static/js/web/entry-0123456789abcdef0123456789abcdef.js:1:2']
];

test('log_redact kişisel veriyi ve sırları temizler, hata ayıklama bilgisini korur; TypeScript kopyası aynı sonucu verir', async () => {
  const { outputFiles } = await build({ entryPoints: [new URL('../supabase/functions/_shared/log.ts', import.meta.url).pathname], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'esnext', logLevel: 'silent' });
  const tmp = `${tmpdir()}/anahtar-log-sql-${process.pid}.mjs`;
  writeFileSync(tmp, outputFiles[0].text);
  const { redact } = await import(pathToFileURL(tmp).href);
  for (const [input, want] of SAMPLES) {
    const [{ out }] = await q(`select public.log_redact($1) as out`, [input]);
    expect(out, input).toBe(want);
    expect(redact(input), 'TS: ' + input).toBe(want);
  }
});

test('report_error: yakalanan hata türü korunur, metin ve yığın temizlenir; tablo doğrudan yazılsa da temizlenir', async () => {
  await as(ID.T);
  await q(`select public.report_error($1)`, [{ message: 'Eşitleme hatası: kiraci@ornek.com', stack: 'at 0532 123 45 67', route: '/uygulama', kind: 'caught' }]);
  await as(null);
  await q(`insert into public.client_errors (message) values ('doğrudan a@b.co')`);
  const rows = await q(`select message, stack, kind from public.client_errors order by id`);
  expect(rows[0]).toEqual({ message: 'Eşitleme hatası: [e-posta]', stack: 'at [telefon]', kind: 'caught' });
  expect(rows[1].message).toBe('doğrudan [e-posta]');
});

test('function_logs: temizlenir ve kısaltılır; kullanıcı okuyamaz yazamaz silemez; yönetici okur ve siler', async () => {
  await q(`insert into public.function_logs (fn, level, message, detail) values ('mail-send', 'error', 'gönderilemedi a@b.co', $1)`, ['x'.repeat(9000)]);
  const [row] = await q(`select message, length(detail) as n from public.function_logs`);
  expect(row).toEqual({ message: 'gönderilemedi [e-posta]', n: 4000 });
  expect(await tryCall(db, `insert into public.function_logs (level) values ('sahte')`)).toBeTruthy();

  await as(ID.T);
  expect(await q(`select * from public.function_logs`)).toEqual([]);
  expect(await tryCall(db, `insert into public.function_logs (message) values ('sahte')`)).toBeTruthy();
  await q(`delete from public.function_logs`);
  await as(null, true);
  expect(await tryCall(db, `select * from public.function_logs where false`) || await tryCall(db, `insert into public.function_logs (message) values ('sahte')`)).toBeTruthy();
  await as(null);
  expect((await q(`select id from public.function_logs`)).length).toBe(1);   // kullanıcının silmesi etkisiz

  await as(ID.A);
  expect((await q(`select id from public.function_logs`)).length).toBe(1);
  await q(`delete from public.function_logs`);
  expect((await q(`select id from public.function_logs`)).length).toBe(0);
});

test('prune_logs 90 günden eskiyi siler, yeniyi ve denetim kaydını korur; kullanıcı çağıramaz', async () => {
  const old = `now() - interval '91 days'`, fresh = `now() - interval '89 days'`;
  await q(`insert into public.client_errors (at, message) values (${old}, 'eski'), (${fresh}, 'yeni')`);
  await q(`insert into public.function_logs (at, message) values (${old}, 'eski'), (${fresh}, 'yeni')`);
  await q(`insert into public.admin_audit (at, action) values (${old}, 'eski-islem')`);
  for (const uid of [ID.T, ID.A]) {
    await as(uid);
    expect(await tryCall(db, `select public.prune_logs(0)`), uid).toBeTruthy();
    expect(await tryCall(db, `select public.log_redact('x')`), uid).toBeTruthy();
  }
  await as(null);
  expect((await q(`select public.prune_logs() as n`))[0].n).toBe(2);
  expect((await q(`select message from public.client_errors`)).map((r) => r.message)).toEqual(['yeni']);
  expect((await q(`select message from public.function_logs`)).map((r) => r.message)).toEqual(['yeni']);
  expect((await q(`select id from public.admin_audit where action = 'eski-islem'`)).length).toBe(1);
});
