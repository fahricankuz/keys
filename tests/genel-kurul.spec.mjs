// Genel kurul paketi ve yoklama sonucu (app/src/domain/meeting.js): kullanıcı verisi HTML'e kaçışlanarak yazılır,
// hazirun cetvelinde her daire ve ön bildirim yer alır; sonuç oranı ağırlıklıysa arsa payına göre.
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
  const out = join(mkdtempSync(join(tmpdir(), 'genelkurul-')), 'm.mjs');
  buildSync({ stdin: { contents: `export * from '${D}meeting.js';`, resolveDir: D, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js' } });
  M = await import(pathToFileURL(out).href);
});

const d = {
  units: [{ id: 'u2', block: 'A', no: '2', share: 1, sector: 'site' }, { id: 'u1', block: 'A', no: '1', share: 3, sector: 'site' }],
  residents: [{ unit_id: 'u1', role: 'malik', name: '<img src=x onerror=alert(1)>' }, { unit_id: 'u2', role: 'kiraci', name: 'Kiracı Kişi' }],
  charges: [{ unit_id: 'u1', month: '2026-03', kind: 'aidat', amount: 1500, status: 'paid' }],
  expenses: [{ cat: 'Asansör', amount: 900, spent_on: '2026-03-10' }], requests: [], budgets: [{ year: 2027, items: [{ cat: 'Temizlik', amount: 72000 }] }]
};
const m = { id: 'm1', title: 'Olağan genel kurul', kind: 'olagan', held_at: '2026-11-25T16:00:00Z', place: 'Otopark "B"', agenda: ['Açılış', '<script>x</script>'] };

test('paket: kaçışlama, hazirun cetveli, vekil ve işletme projesi', () => {
  const h = M.meetingPackHtml({ org: 'Atakum & Co', m, d, replies: [{ meeting_id: 'm1', unit_id: 'u1', answer: 'vekalet', proxy_name: 'Ali <b>' }] });
  expect(h).not.toMatch(/<img src=x|<script>x|Ali <b>/);
  expect(h).toContain('&lt;img src=x onerror=alert(1)&gt;');
  expect(h).toContain('Atakum &amp; Co');
  expect(h).toContain('Otopark &quot;B&quot;');
  expect(h).toContain('Ali &lt;b&gt;');
  expect(h.indexOf('A Blok No 1')).toBeLessThan(h.indexOf('A Blok No 2'));    // daireler sıralı
  expect(h).not.toContain('Kiracı Kişi');                                    // cetvelde yalnız malik
  expect(h).toContain('Temizlik');                                           // sonraki yılın işletme projesi
});

test('sonuç oranı: ağırlıklıda arsa payına, değilse daire sayısına göre', () => {
  const r = { units: 3, share: 6, voted: 2, voted_share: 4, options: [{ label: 'Evet', count: 1, share: 3 }, { label: 'Hayır', count: 1, share: 1 }] };
  expect(M.pollRows({ weighted: true }, r).map((x) => x.pct)).toEqual([75, 25]);
  expect(M.pollRows({ weighted: false }, r).map((x) => x.pct)).toEqual([50, 50]);
  expect(M.pollRows({ weighted: true }, null)).toEqual([]);
});
