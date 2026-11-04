// Web Push servis çalışıcısı (app/public/bildirim-sw.js): bildirimi gösterir, yalnız site içi yolları açar;
// _layout eski çalışıcıları temizlerken bunu korur; derleme VAPID açık anahtarını alır.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../', import.meta.url).pathname;
const SW = readFileSync(ROOT + 'app/public/bildirim-sw.js', 'utf8');

function load(){
  const on = {}, shown = [], opened = [], tabs = [];
  const self = {
    addEventListener: (k, f) => { on[k] = f; }, skipWaiting(){}, location: { origin: 'https://anahtar.io' },
    registration: { showNotification: async (title, o) => { shown.push({ title, ...o }); } },
    clients: { claim: async () => {}, matchAll: async () => tabs, openWindow: async (u) => { opened.push(u); } },
  };
  vm.runInNewContext(SW, { self, URL });
  return { on, shown, opened, tabs };
}
const fire = async (f, ev) => { let p; f({ ...ev, waitUntil: (x) => { p = x; } }); await p; };
const pushEv = (d) => ({ data: { json: () => d, text: () => JSON.stringify(d) } });

test('push: başlık, metin ve site içi bağlantı gösterilir', async () => {
  const s = load();
  await fire(s.on.push, pushEv({ title: 'Kira ödendi', body: '28.500 ₺', url: '/uygulama/mulk-sahibi/mulk/p1', tag: 'pay' }));
  expect(s.shown[0]).toMatchObject({ title: 'Kira ödendi', body: '28.500 ₺', tag: 'pay', data: { url: '/uygulama/mulk-sahibi/mulk/p1' } });
});

test('push: dış bağlantı yerine panel açılır', async () => {
  const s = load();
  await fire(s.on.push, pushEv({ title: 'x', url: 'https://kotu.example/' }));
  await fire(s.on.push, pushEv({ title: 'y', url: '//kotu.example/' }));
  await fire(s.on.push, pushEv({ title: 'z', url: '/\\kotu.example/' }));
  expect(s.shown.map((x) => x.data.url)).toEqual(['/uygulama', '/uygulama', '/uygulama']);
});

test('dokununca açık sekme varsa ona gider, yoksa yeni pencere açar', async () => {
  const s = load();
  const note = { close(){}, data: { url: '/uygulama/talepler' } };
  await fire(s.on.notificationclick, { notification: note });
  expect(s.opened).toEqual(['/uygulama/talepler']);
  const nav = [];
  s.tabs.push({ url: 'https://anahtar.io/uygulama', focus: async () => {}, navigate: async (u) => { nav.push(u); } });
  await fire(s.on.notificationclick, { notification: note });
  expect(nav).toEqual(['/uygulama/talepler']);
});

test('eski çalışıcı temizliği bildirim çalışıcısını korur; derleme VAPID anahtarını alır', () => {
  expect(readFileSync(ROOT + 'app/src/app/_layout.tsx', 'utf8')).toMatch(/bildirim-sw\.js/);
  expect(readFileSync(ROOT + '.github/workflows/hostinger.yml', 'utf8')).toMatch(/EXPO_PUBLIC_VAPID_PUBLIC_KEY: \$\{\{ vars\.VAPID_PUBLIC_KEY \}\}/);
  expect(readFileSync(ROOT + 'supabase/functions/push/index.ts', 'utf8')).toMatch(/url: panelPath\(n\.url\)/);
});
