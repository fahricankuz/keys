// Edge Function logu (supabase/functions/_shared/log.ts): tek satır JSON, temizleme, tabloya yazma, hata fırlatmama, sınır.
import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const ROOT = new URL('../supabase/functions/', import.meta.url).pathname;
test.describe.configure({ mode: 'serial' });

let n = 0;
/** log.ts'i her testte yeniden yükler (dakikalık sayaç sıfırlansın). */
async function load() {
  const { outputFiles } = await build({ entryPoints: [ROOT + '_shared/log.ts'], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'esnext', logLevel: 'silent' });
  const tmp = `${tmpdir()}/anahtar-log-${process.pid}-${n++}.mjs`;
  writeFileSync(tmp, outputFiles[0].text);
  return import(pathToFileURL(tmp).href);
}
function setup(env, fetchImpl) {
  const lines = [], calls = [];
  const saved = { Deno: globalThis.Deno, fetch: globalThis.fetch, error: console.error, warn: console.warn, log: console.log };
  globalThis.Deno = { env: { get: (k) => env[k] } };
  globalThis.fetch = async (u, o) => { calls.push({ url: String(u), headers: o.headers, body: JSON.parse(o.body) }); return fetchImpl ? fetchImpl() : new Response(null, { status: 201 }); };
  for (const k of ['error', 'warn', 'log']) console[k] = (l) => lines.push({ k, l });
  return { lines, calls, restore: () => { globalThis.Deno = saved.Deno; globalThis.fetch = saved.fetch; console.error = saved.error; console.warn = saved.warn; console.log = saved.log; } };
}
const ENV = { SUPABASE_URL: 'https://x.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'servis-anahtari' };

test('error: tek satır JSON yazılır, tabloya gider, kişisel veri her ikisinde de temizlenir', async () => {
  const { logger } = await load();
  const s = setup(ENV);
  try {
    await logger('mail-send').error('gönderilemedi a@b.co', { id: 7, error: new Error('Bearer abcdefgh12345678') });
    expect(s.lines.length).toBe(1);
    expect(s.lines[0].k).toBe('error');
    const line = JSON.parse(s.lines[0].l);
    expect(line).toMatchObject({ level: 'error', fn: 'mail-send', message: 'gönderilemedi [e-posta]' });
    expect(line.detail).toContain('Bearer [gizli]');
    expect(s.calls.length).toBe(1);
    expect(s.calls[0].url).toBe('https://x.supabase.co/rest/v1/function_logs');
    expect(s.calls[0].headers.apikey).toBe('servis-anahtari');
    expect(s.calls[0].body).toMatchObject({ fn: 'mail-send', level: 'error', message: 'gönderilemedi [e-posta]' });
    expect(JSON.stringify(s.calls[0].body)).not.toContain('abcdefgh12345678');
    expect(JSON.stringify(s.lines)).not.toContain('servis-anahtari');
  } finally { s.restore(); }
});

test('info yalnız konsola yazılır; warn tabloya da gider', async () => {
  const { logger } = await load();
  const s = setup(ENV);
  try {
    await logger('push').info('başladı');
    expect(s.calls.length).toBe(0);
    await logger('push').warn('yavaş');
    expect(s.calls.map((c) => c.body.level)).toEqual(['warn']);
    expect(s.lines.map((l) => l.k)).toEqual(['log', 'warn']);
  } finally { s.restore(); }
});

test('kayıt işi durdurmaz: ağ hatası, tablo yok (404), ortam değişkeni yok, döngüsel veri', async () => {
  const { logger } = await load();
  let s = setup(ENV, () => { throw new Error('ağ yok'); });
  try { await expect(logger('a').error('x')).resolves.toBeUndefined(); } finally { s.restore(); }
  s = setup(ENV, () => new Response('{}', { status: 404 }));
  try { await expect(logger('a').error('x')).resolves.toBeUndefined(); expect(s.lines.some((l) => /function_logs yazılamadı/.test(l.l))).toBe(true); } finally { s.restore(); }
  s = setup({});
  try { await logger('a').error('x'); expect(s.calls.length).toBe(0); } finally { s.restore(); }
  s = setup(ENV);
  try { const c = {}; c.c = c; await expect(logger('a').error('x', c)).resolves.toBeUndefined(); expect(s.lines.length).toBe(1); } finally { s.restore(); }
});

test('hata seli: dakikada en çok 30 tablo kaydı; konsola yazmaya devam eder', async () => {
  const { logger } = await load();
  const s = setup(ENV);
  try {
    const log = logger('a');
    for (let i = 0; i < 40; i++) await log.error('hata ' + i);
    expect(s.calls.length).toBe(30);
    expect(s.lines.length).toBe(40);
  } finally { s.restore(); }
});

test('fonksiyonlarda doğrudan console kullanılmaz: her kayıt ortak logdan geçer', () => {
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(d + f).isDirectory() ? walk(d + f + '/') : [d + f]));
  const bad = walk(ROOT).filter((f) => f.endsWith('.ts') && !f.endsWith('_shared/log.ts') && /console\.(log|warn|error|info|debug)/.test(readFileSync(f, 'utf8')));
  expect(bad).toEqual([]);
});
