// Beyaz kutu: birim testleri. Uygulamanın alan mantığı (app/src/domain) tarayıcı olmadan, esbuild ile paketlenip Node'da çalışır.
// react-native ve async-storage küçük taklitlerle değiştirilir.
import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const D = new URL('../app/src/domain/', import.meta.url).pathname;
const STUBS = new URL('./stubs/', import.meta.url).pathname;
let M;

test.beforeAll(async () => {
  const out = join(mkdtempSync(join(tmpdir(), 'kiracim-unit-')), 'domain.mjs');
  buildSync({
    stdin: { contents: `export * from '${D}logic.js'; export * from '${D}util.js'; export * from '${D}admin-derive.js'; export * from '${D}mapping.js'; export * as i18n from '${D}i18n.js'; export { S } from '${D}state.js';`, resolveDir: D, loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js' }
  });
  M = await import(pathToFileURL(out).href);
});

const prop = (o = {}) => ({ id: 'p', rent: 10000, dueDay: 5, pay: {}, startDate: '2020-01-01', rentHistory: [], ...o });

/* ------------------------------------------------------------ tarih yardımcıları */

test('birim: addM ay sonlarında taşmaz (31 Ocak + 1 ay = Şubat sonu)', () => {
  const k = (d, n) => M.iso(M.addM(new Date(d), n));
  expect(k('2026-01-31T12:00:00', 1)).toBe('2026-02-28');
  expect(k('2024-01-31T12:00:00', 1)).toBe('2024-02-29');        // artık yıl
  expect(k('2026-03-31T12:00:00', -1)).toBe('2026-02-28');
  expect(k('2026-10-31T12:00:00', -11)).toBe('2025-11-30');
  expect(k('2026-12-15T12:00:00', 1)).toBe('2027-01-15');
  expect(k('2026-01-15T12:00:00', -1)).toBe('2025-12-15');
  // 12 ay geriye giden bir liste her ayı bir kez içerir (eskiden 29-31'inde yinelenen ay çıkardı)
  const keys = Array.from({ length: 12 }, (_, i) => M.mkey(M.addM(new Date('2026-03-31T12:00:00'), -i)));
  expect(new Set(keys).size).toBe(12);
});

test('birim: para, tarih ve arama biçimleri Türkçe', () => {
  M.i18n.setLang('tr');
  expect(M.tl(28500)).toBe('₺28.500');
  expect(M.tl(0)).toBe('₺0');
  expect(M.tl('abc')).toBe('₺0');
  expect(M.tl(1234567.6)).toBe('₺1.234.568');
  expect(M.mkey(M.parse('2026-10-05'))).toBe('2026-10');
  expect(M.iso(M.parse('2026-02-03'))).toBe('2026-02-03');
  expect(M.match('Şişli Ağaoğlu Çarşı', 'sisli agaoglu carsi')).toBe(true);
  expect(M.match('İstanbul', 'istanbul')).toBe(true);
  expect(M.esc('<b onclick="x">&\'</b>')).toBe('&lt;b onclick=&quot;x&quot;&gt;&amp;&#39;&lt;/b&gt;');
});

/* ------------------------------------------------------------ kira mantığı */

test('birim: vade günü; sözleşmenin ilk ayında vade başlangıçtan önceye düşmez (yeni mülk "gecikti" görünmez)', () => {
  const today = M.t0();
  const start = M.iso(today);
  const p = prop({ startDate: start, dueDay: Math.max(1, today.getDate() - 3) || 1 });
  if (today.getDate() > 3) {
    expect(M.statusOf(p, M.mkey(today))).toBe('pending');           // eskiden 'late'
    expect(M.iso(M.dueDate(p, M.mkey(today)))).toBe(start);
  }
  // sonraki ay normal vade günü
  const nx = M.addM(new Date(today.getFullYear(), today.getMonth(), 1), 1);
  expect(M.dueDate(p, M.mkey(nx)).getDate()).toBe(p.dueDay);
  // sözleşme geçmişte başladıysa ilk ay da normal
  const old = prop({ startDate: '2020-01-01' });
  expect(M.dueDate(old, '2020-01').getDate()).toBe(5);
  expect(M.statusOf(old, '2020-01')).toBe('late');
});

test('birim: dönem = kapanmamış ilk ay; hepsi ödendiyse gelecek ay', () => {
  const today = M.t0();
  const cur = M.mkey(today);
  const prev = M.mkey(M.addM(new Date(today.getFullYear(), today.getMonth(), 1), -1));
  const p = prop({ startDate: M.iso(M.addM(new Date(today.getFullYear(), today.getMonth(), 1), -1)), pay: { [prev]: { status: 'approved' } } });
  expect(M.period(p).key).toBe(cur);
  p.pay[cur] = { status: 'approved' };
  expect(M.period(p).key).toBe(M.mkey(M.addM(new Date(today.getFullYear(), today.getMonth(), 1), 1)));
  // geçmiş ay ödenmediyse odak orada kalır (gecikme gözden kaçmaz)
  const q = prop({ startDate: M.iso(M.addM(new Date(today.getFullYear(), today.getMonth(), 1), -2)), pay: {} });
  expect(M.period(q).status).toBe('late');
});

test('birim: ödenmemiş kira toplamı gecikmiş ve kısmi ayları sayar, onaylıyı saymaz', () => {
  const today = M.t0();
  const m = (n) => M.mkey(M.addM(new Date(today.getFullYear(), today.getMonth(), 1), -n));
  const p = prop({ rent: 10000, dueDay: 1, startDate: M.iso(M.addM(new Date(today.getFullYear(), today.getMonth(), 1), -3)),
    pay: { [m(3)]: { status: 'approved' }, [m(2)]: { status: 'partial', amount: 4000 }, [m(1)]: { status: 'rejected' } } });
  const u = M.unpaid(p);
  expect(u.months.map((x) => x.key)).toEqual([m(2), m(1), ...(today.getDate() > 1 ? [m(0)] : [])]);
  expect(u.months[0].owed).toBe(6000);
  expect(u.total).toBe(6000 + 10000 + (today.getDate() > 1 ? 10000 : 0));
});

test('birim: kira geçmişi, stopaj (net ↔ brüt) ve kısmi ödeme bakiyesi', () => {
  const p = prop({ rent: 10000, rentHistory: [{ from: '2020-01-01', amount: 10000 }, { from: '2026-06-01', amount: 15000 }], stopaj: true });
  expect(M.rentAt(p, '2026-05')).toBe(10000);
  expect(M.rentAt(p, '2026-06')).toBe(15000);
  expect(M.rentAt(p, '2027-01')).toBe(15000);
  const net = M.expectedAt(p, '2026-07');
  expect(net).toBeLessThan(15000);
  const g = M.grossOf(p, '2026-07', net);
  expect(Math.abs(g.gross - 15000)).toBeLessThanOrEqual(1);       // yuvarlama payı
  expect(g.withheld).toBe(g.gross - net);
  expect(M.remaining({ ...p, stopaj: false, pay: { '2026-07': { status: 'partial', amount: 6000 } } }, '2026-07')).toBe(9000);
  expect(M.remaining(prop(), '2026-07')).toBe(0);
});

/* ------------------------------------------------------------ yönetici paneli türetmesi */

test('birim: yönetici özeti — bağlantısız kiracı, yasaklı sayısı, mülk sahibi → kiracı ağacı, kuyruk sırası', () => {
  const U = (id, role, extra = {}) => ({ id, email: id + '@x', name: id, role, phone: '', created_at: '2026-01-01', is_admin: false, subscribed: false, banned: false, ...extra });
  const d = M.derive({
    users: [U('L1', 'landlord', { subscribed: true }), U('T1', 'tenant'), U('T2', 'tenant', { banned: true }), U('T3', 'tenant'), U('A', 'tenant', { is_admin: true })],
    props: [{ id: 'p1', owner_id: 'L1', name: 'Ev', addr: '', rent: 100, due_day: 5, prop_type: 'Konut', created_at: '2026-01-01' }],
    members: [{ property_id: 'p1', user_id: 'L1', role: 'landlord', display_name: 'L1', phone: '', email: '' }, { property_id: 'p1', user_id: 'T1', role: 'tenant', display_name: 'T1', phone: '', email: '' }],
    invites: [{ code: 'ABC', property_id: 'p1', name: 'Davetli', email: '', phone: '', accepted_by: null }],
    payments: [{ property_id: 'p1', month: '2026-10', status: 'review', amount: 100, updated_at: '2026-10-02' }],
    reviews: [
      { kind: 'payment', property_id: 'p1', ref_id: '2026-10', uploader: 'T1', label: 'a', status: 'pending', created_at: '2026-10-01' },
      { kind: 'document', property_id: 'p1', ref_id: 'd1', uploader: 'L1', label: 'b', status: 'approved', created_at: '2026-10-03' }
    ]
  });
  expect(d.stats).toMatchObject({ landlords: 1, tenants: 3, props: 1, subscribed: 1, pending: 1, banned: 1 });
  expect(d.unlinked.map((u) => u.id)).toEqual(['T2', 'T3']);           // yönetici ve bağlı kiracı hariç
  expect(d.landlords[0].tenantCount).toBe(1);
  expect(d.landlords[0].props[0].invited.map((i) => i.code)).toEqual(['ABC']);
  expect(d.queue.map((r) => r.label)).toEqual(['b', 'a']);              // yeniden eskiye
  expect(d.queue[1]).toMatchObject({ uploaderName: 'T1', uploaderRole: 'tenant', landlord: 'L1' });
  expect(d.payments[0].review.status).toBe('pending');
});

test('birim: boş veride yönetici özeti çökmez', () => {
  const d = M.derive({ users: [], props: [], members: [], invites: [], payments: [], reviews: [] });
  expect(d.stats).toMatchObject({ landlords: 0, tenants: 0, props: 0, pending: 0, banned: 0 });
  expect(d.queue).toEqual([]);
  expect(d.unlinked).toEqual([]);
});

/* ------------------------------------------------------------ entegrasyon: eşitleme farkı */

test('entegrasyon: mülk farkı (diffProperty) yeni mesajı ve ödeme dekontunu doğru işlemlere çevirir', () => {
  const base = { id: 'p1', ownerId: 'L', name: 'Ev', rent: 1, dueDay: 5, pay: {}, msgs: [], requests: [], docs: [], expenses: [], rentHistory: [], inspect: { rooms: [] }, tenants: [] };
  const next = JSON.parse(JSON.stringify(base));
  next.msgs.push({ id: 'm1', from: 'tenant', text: 'merhaba', at: Date.now() });
  const ops = M.diffProperty(base, next, { role: 'tenant', meId: 'T' });
  expect(Array.isArray(ops)).toBe(true);
  expect(ops.some((o) => JSON.stringify(o).includes('merhaba'))).toBe(true);
  expect(M.diffProperty(base, JSON.parse(JSON.stringify(base)), { role: 'tenant', meId: 'T' })).toEqual([]);      // değişiklik yok → işlem yok
});
