// Müşteri sağlığı kuralları (app/src/domain/health.js).
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
  const out = join(mkdtempSync(join(tmpdir(), 'saglik-')), 'm.mjs');
  buildSync({ stdin: { contents: `export * from '${D}health.js';`, resolveDir: D, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js' } });
  M = await import(pathToFileURL(out).href);
});

const NOW = Date.parse('2026-11-04T10:00:00Z');
const ago = (d) => new Date(NOW - d * 864e5).toISOString();
const land = (id, props = []) => ({ id, name: id, email: id + '@x', created_at: ago(20), props });

test('kurallar: deneme bitiyor (kiracısız acil), mülk eklemedi, eski davet, 30 gün ödeme yok, ödeme sorunu; sıralama önem derecesine göre', () => {
  const props = [{ id: 'p1', tenants: [{ id: 't1' }], invited: [] }];
  const list = M.healthList({
    now: NOW,
    users: [land('a'), land('b'), land('c', props), { ...land('d'), banned: true }],
    landlords: [land('a'), land('b', [{ id: 'p2', tenants: [], invited: [{ code: 'X' }] }]), land('c', props), land('d')],
    subs: [{ id: 'a', in_trial: true, trial_ends: ago(-3) }, { id: 'c', subscribed: true, billing_issue: true }],
    invites: [{ property_id: 'p2', created_at: ago(6) }, { property_id: 'p2', created_at: ago(1) }],
    payments: [{ property_id: 'p1', status: 'approved', paid_on: ago(40) }],
    contacts: [{ user_id: 'c', note: 'Aradım', created_at: ago(2) }]
  });
  const by = Object.fromEntries(list.map((x) => [x.id, x]));
  expect(Object.keys(by).sort()).toEqual(['a', 'b', 'c']);                       // askıdaki hesap listede yok
  expect(by.a.reasons.map((r) => [r.code, r.sev])).toEqual([['trial', 3], ['noprop', 2]]);
  expect(by.b.reasons.map((r) => r.code)).toEqual(['invite']);
  expect(by.b.reasons[0].label).toMatch(/^1 kiracı daveti/);                     // yalnız 5 günden eski davet sayılır
  expect(by.c.reasons.map((r) => r.code)).toEqual(['billing', 'nopay']);
  expect(by.c.last.note).toBe('Aradım');
  expect(list.map((x) => x.sev)).toEqual([3, 3, 2]);
});

test('kurumlar: birim yok, kişi yok ya da katılım %30 altı; askıdaki kurum yok', () => {
  const orgs = [
    { id: 'o1', name: 'A Sitesi', sector: 'site', status: 'active', created_at: ago(10), master: { email: 'm@a' } },
    { id: 'o2', name: 'B AVM', sector: 'avm', status: 'active', created_at: ago(10) },
    { id: 'o3', name: 'C Depo', sector: 'depo', status: 'paused', created_at: ago(10) },
    { id: 'o4', name: 'D Sitesi', sector: 'site', status: 'active', created_at: ago(10) }
  ];
  const sites = { o1: { units: 50, people: 40, linked: 8 }, o2: { units: 0, people: 0, linked: 0 }, o3: { units: 0, people: 0, linked: 0 }, o4: { units: 10, people: 10, linked: 6 } };
  const list = M.healthList({ now: NOW, orgs, sites });
  expect(list.map((x) => [x.id, x.reasons[0].code])).toEqual([['o1', 'orginvite'], ['o2', 'nounits']]);                  // aynı önemde ada göre
  expect(list.find((x) => x.id === 'o1').reasons[0].label).toBe('Sakin ve kiracıların yalnız %20’i katıldı');
  expect(list.find((x) => x.id === 'o1').email).toBe('m@a');
});
