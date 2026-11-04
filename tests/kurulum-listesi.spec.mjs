// Kurulum kontrol listesi (app/src/domain/checklist.js): adımlar mevcut veriden hesaplanır; site kurulumunda ekip adımı yok.
import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const D = new URL('../app/src/domain/', import.meta.url).pathname;
const STUBS = new URL('./stubs/', import.meta.url).pathname;
let M;
test.beforeAll(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'kurulum-')), 'm.mjs');
  buildSync({ stdin: { contents: `export * from '${D}checklist.js';`, resolveDir: D, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js' } });
  M = await import(pathToFileURL(out).href);
});

const done = (steps) => Object.fromEntries(steps.map((s) => [s.key, s.done]));

test('mülk sahibi: boş portföyde yalnız ilk adım için yol var; adımlar veriden işaretlenir', () => {
  expect(done(M.landlordSteps([]))).toEqual({ prop: false, invite: false, joined: false, contract: false, dask: false, paid: false });
  const p = { id: 'p1', tenants: [{ id: 'inv:X', pending: true }], docs: [{ cat: 'Kira sözleşmesi' }], dask: null, pay: { '2026-10': { status: 'review' } }, aidatPay: {} };
  const s = M.landlordSteps([p]);
  expect(done(s)).toEqual({ prop: true, invite: true, joined: false, contract: true, dask: false, paid: false });
  expect(s.find((x) => x.key === 'joined').act).toEqual({ go: '/mulk-sahibi/mulk/p1' });
  expect(s.find((x) => x.key === 'paid').act).toEqual({ go: '/mulk-sahibi/mulk/p1/odeme' });
  expect(s.find((x) => x.key === 'dask').act).toEqual({ sheet: 'ev-duzenle', pid: 'p1' });
  const ok = { ...p, tenants: [{ id: 'u1' }], dask: '2027-01-01', pay: { '2026-10': { status: 'approved' } } };
  expect(M.progressOf(M.landlordSteps([ok]))).toEqual({ done: 6, total: 6 });
});

test('site: daire, m², kişi (%80), davet (%80), otomatik aidat, duyuru; ekip adımı yok', () => {
  const units = Array.from({ length: 5 }, (_, i) => ({ id: 'u' + i, area: i === 4 ? null : 100 }));
  const residents = [0, 1, 2, 3].map((i) => ({ unit_id: 'u' + i, user_id: i < 2 ? 'x' : null, invited_at: i === 2 ? '2026-11-01' : null }));
  const d = { sector: 'site', units, residents, auto: { enabled: false }, notes: [], charges: [] };
  const s = M.orgSteps(d, ['aidat', 'duyuru']);
  expect(s.map((x) => x.key)).toEqual(['units', 'area', 'people', 'invite', 'auto', 'note']);
  expect(done(s)).toEqual({ units: true, area: false, people: true, invite: false, auto: false, note: false });
  expect(s.find((x) => x.key === 'invite').progress).toBe(0.75);
  expect(s.find((x) => x.key === 'auto').act).toEqual({ section: 'tahakkuk' });
  // Modül kapalıysa adım çıkmaz.
  expect(M.orgSteps(d, []).map((x) => x.key)).toEqual(['units', 'area', 'people', 'invite']);
});

test('AVM / depo / GYO: kira sözleşmesi ve ilk kira tahakkuku adımları', () => {
  const d = { sector: 'avm', units: [{ id: 'u1', area: 200, rent: 2000 }], residents: [{ unit_id: 'u1', user_id: 'x' }], charges: [{ id: 'c1' }], notes: [] };
  const s = M.orgSteps(d, ['kira']);
  expect(s.map((x) => x.key)).toEqual(['units', 'area', 'lease', 'people', 'invite', 'charge']);
  expect(M.progressOf(s)).toEqual({ done: 6, total: 6 });
});
