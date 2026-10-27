import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { open } from './helpers.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

function walk(dir){
  return readdirSync(join(ROOT, dir)).flatMap(f => {
    const rel = dir + '/' + f;
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel) : [rel];
  });
}

test('manifest geçerli ve ikonları mevcut', () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  expect(m.name).toBeTruthy();
  expect(m.display).toBe('standalone');
  expect(m.icons.some(i => i.purpose === 'maskable')).toBe(true);
  for (const i of m.icons) expect(existsSync(join(ROOT, i.src))).toBe(true);
});

test('service worker önbellek listesi assets klasörüyle birebir eşleşir', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const shell = sw.slice(sw.indexOf('const SHELL'), sw.indexOf('];', sw.indexOf('const SHELL')));
  const list = [...shell.matchAll(/'\.\/(assets\/[^']+)'/g)].map(m => m[1]).sort();
  const files = walk('assets').sort();
  // Yeni bir dosya eklenip SHELL'e yazılmazsa çevrimdışı açılış bozulur.
  expect(list).toEqual(files);
});

test('uygulama çevrimdışıyken de açılır', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium');
  await open(page, '#/kiraci');
  await page.evaluate(() => navigator.serviceWorker.ready);
  // clients.claim() ile ilk ziyarette de sayfa denetime geçer; kendiliğinden yenilenmemeli.
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect(page.locator('#screen h1')).toHaveText('Moda’daki ev');

  await context.setOffline(true);
  await page.goto('index.html#/mulk-sahibi/rapor');
  await expect(page.locator('#screen h1')).toHaveText('Rapor');
  await context.setOffline(false);
});
