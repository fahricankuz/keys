// Giriş tutanağı A4 belgesi (app/src/domain/inspect-html.js): tüm içerik, her fotoğrafın kendi açıklaması, iki tarafın ayrı onay
// tarihi/saati, kilit ifadesi, taslak durumu, güvenli kaçış; belge gerçek Chromium'da PDF'e dönüşür ve fotoğraflar yer alır.
import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const D = new URL('../app/src/domain/', import.meta.url).pathname;
const STUBS = new URL('./stubs/', import.meta.url).pathname;
let M, dir;
test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'tutanak-'));
  const out = join(dir, 'm.mjs');
  buildSync({
    stdin: { contents: `export * from '${D}inspect-html.js';`, resolveDir: D, loader: 'js' },
    bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent',
    alias: { 'react-native': STUBS + 'react-native.js', '@react-native-async-storage/async-storage': STUBS + 'async-storage.js' },
    external: ['@supabase/supabase-js', 'expo-*', '@capacitor/*']
  });
  M = await import(pathToFileURL(out).href);
});

// 1x1 farklı renkli görseller (eşleşmeyi ayırt etmek için).
const PX = (c) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="${c}"/></svg>`)}`;
const inspect = (extra = {}) => ({
  tenantOk: true, landlordOk: true, tenantAt: '2026-11-07T11:32:05Z', landlordAt: '2026-11-07T09:10:44Z', tenantBy: 'Test Kiracı', landlordBy: 'Bobo12',
  lockedAt: '2026-11-07T11:32:05Z', hash: 'ab'.repeat(32),
  rooms: [
    { n: 'Salon', note: 'Genel durum iyi', shots: ['s1', 's2'], caps: ['Sol duvarda çizik', 'Parke temiz'] },
    { n: 'Mutfak', note: '', shots: ['m1'], caps: [''] },
    { n: 'Banyo', note: 'Armatür yeni', shots: [], caps: [] }
  ], ...extra
});
const data = (ins) => ({ name: 'Bakırköy3+1', addr: 'Piaylepaşa sokak, Bakırköy/İstanbul', type: 'Konut', area: 120,
  landlord: { name: 'Bobo12', phone: '0500 000 00 01' }, tenant: { name: 'Test Kiracı', phone: '0500 000 00 02' }, inspect: ins,
  urls: [[PX('#c33'), PX('#3c3')], [PX('#33c')], []], docs: [{ cat: 'Kira sözleşmesi' }, { cat: 'DASK poliçesi' }], generated: new Date('2026-11-07T12:00:00Z') });

const figures = (h) => [...h.matchAll(/<figure>([\s\S]*?)<\/figure>/g)].map((m) => ({
  src: (m[1].match(/<img src="([^"]*)"/) || [])[1] || '', cap: m[1].replace(/<img[^>]*>/, '').replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').replace(/&#39;/g, "'")
}));

test('onaylı tutanak: tüm bilgiler, iki onay tarihi/saati ayrı, kilit ifadesi ve özet', () => {
  const h = M.inspectHtml(data(inspect()), { origin: 'https://anahtar.io' });
  for (const s of ['Bakırköy3+1', 'Piaylepaşa sokak', 'Bobo12', 'Test Kiracı', '0500 000 00 01', '0500 000 00 02', 'Salon', 'Mutfak', 'Banyo', 'Genel durum iyi', 'Armatür yeni']) expect(h, s).toContain(s);
  expect(h).toContain('Onaylandı · Kilitli');
  // İstanbul saati (UTC+3): mülk sahibi 09:10:44Z → 12:10:44, kiracı 11:32:05Z → 14:32:05; ikisi ayrı kutularda.
  const sigs = [...h.matchAll(/<div class="sig ok">([\s\S]*?)<\/div><\/div><\/div>/g)].map((m) => m[1]);
  expect(sigs).toHaveLength(2);
  expect(sigs[0]).toContain('Bobo12'); expect(sigs[0]).toContain('12:10:44'); expect(sigs[0]).toContain('7 Kasım 2026');
  expect(sigs[1]).toContain('Test Kiracı'); expect(sigs[1]).toContain('14:32:05');
  expect(h).toContain('Dijital olarak onaylandı');
  expect(h).toContain('Bu giriş tutanağı, her iki tarafın onayıyla 7 Kasım 2026 tarihinde 14:32:05 itibarıyla onaylanmış ve kilitlenmiştir. Onay sonrasında tutanak üzerinde herhangi bir değişiklik yapılamaz.');
  expect(h).toContain('ab'.repeat(32));
  expect(h).toContain('<li class="on"><i>✓</i>Kira sözleşmesi (imzalı)');
  expect(h).toContain('<li class=""><i></i>Depozito makbuzu');
});

test('her fotoğraf kendi açıklamasıyla eşleşir; açıklamalar başka fotoğrafın altına düşmez', () => {
  const f = figures(M.inspectHtml(data(inspect()), {}));
  expect(f).toHaveLength(3);
  expect(f[0].src).toBe(PX('#c33')); expect(f[0].cap).toContain('Salon · Fotoğraf 1'); expect(f[0].cap).toContain('Sol duvarda çizik'); expect(f[0].cap).not.toContain('Parke temiz');
  expect(f[1].src).toBe(PX('#3c3')); expect(f[1].cap).toContain('Salon · Fotoğraf 2'); expect(f[1].cap).toContain('Parke temiz'); expect(f[1].cap).not.toContain('Sol duvarda');
  expect(f[2].src).toBe(PX('#33c')); expect(f[2].cap).toContain('Mutfak · Fotoğraf 1'); expect(f[2].cap).toContain('Açıklama yok');
});

test('açıklamalar fotoğraftan kısa/uzunsa da hizası bozulmaz (caps eksik olan eski kayıt)', () => {
  const ins = inspect({ rooms: [{ n: 'Salon', note: '', shots: ['a', 'b', 'c'], caps: ['Birinci'] }] });
  const f = figures(M.inspectHtml({ ...data(ins), urls: [[PX('#111'), PX('#222'), PX('#333')]] }, {}));
  expect(f.map((x) => /Birinci/.test(x.cap))).toEqual([true, false, false]);
  expect(f.every((x) => /Açıklama yok|Birinci/.test(x.cap))).toBe(true);
});

test('tek taraf onayladı: taslak, kilit ifadesi yok, bekleyen taraf "Onay bekleniyor"', () => {
  const ins = inspect({ landlordOk: false, landlordAt: undefined, landlordBy: undefined, lockedAt: undefined, hash: undefined });
  const h = M.inspectHtml(data(ins), {});
  expect(h).toContain('Taslak · Onay bekleniyor');
  expect(h).toContain('Onay bekleniyor');
  expect(h).not.toContain('kilitlenmiştir');
  expect(h).toContain('Bu tutanak taslaktır');
  expect(h.match(/class="sig ok"/g)).toHaveLength(1);
});

test('eski onay (zaman kaydı yok): kilit ifadesi tarihsiz, onay zamanı "Kayıtlı değil"', () => {
  const h = M.inspectHtml(data(inspect({ tenantAt: undefined, landlordAt: undefined, lockedAt: undefined, hash: undefined })), {});
  expect(h).toContain('Bu giriş tutanağı, her iki tarafın onayıyla onaylanmış ve kilitlenmiştir.');
  expect(h).toContain('Kayıtlı değil');
});

test('kullanıcı metni kaçışlanır (HTML ve betik çalışmaz)', () => {
  const ins = inspect({ rooms: [{ n: '<b>Oda</b>', note: '<script>alert(1)</script>', shots: ['x'], caps: ['"><img src=x onerror=alert(2)>'] }] });
  const h = M.inspectHtml({ ...data(ins), name: '<i>Ev</i>', urls: [[PX('#000')]] }, {});
  expect(h).not.toContain('<script'); expect(h).not.toContain('<b>Oda'); expect(h).not.toContain('<i>Ev'); expect(h).not.toMatch(/<img src=x/);
});

test('gerçek Chromium: belge PDF olur, tüm metin ve 9 fotoğraf yer alır, sayfa sonu fotoğrafı açıklamasından ayırmaz', async ({ page }) => {
  const rooms = Array.from({ length: 3 }, (_, i) => ({ n: 'Oda ' + (i + 1), note: 'Not ' + (i + 1), shots: ['a', 'b', 'c'], caps: ['Açıklama A' + i, 'Açıklama B' + i, 'Açıklama C' + i] }));
  const urls = rooms.map(() => [PX('#c33'), PX('#3c3'), PX('#33c')]);
  const html = M.inspectHtml({ ...data(inspect({ rooms })), urls }, { origin: '' });
  await page.setContent(html);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
  const f = join(dir, 'tutanak.pdf');
  writeFileSync(f, pdf);
  if (process.env.TUTANAK_PDF) writeFileSync(process.env.TUTANAK_PDF, pdf);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  const { execFileSync } = await import('node:child_process');
  const txt = execFileSync('pdftotext', ['-layout', f, '-'], { encoding: 'utf8' });
  for (const s of ['Bakırköy3+1', 'Açıklama A0', 'Açıklama C2', 'Dijital olarak onaylandı', 'kilitlenmiştir']) expect(txt, s).toContain(s);
  const pages = Number((execFileSync('pdfinfo', [f], { encoding: 'utf8' }).match(/Pages:\s+(\d+)/) || [])[1]);
  expect(pages).toBeGreaterThanOrEqual(2);
  expect(pages).toBeLessThanOrEqual(5);
  // Her açıklama bir figürün içinde: sayfa kırılımı (break-inside: avoid) figürleri bölmez.
  expect(html.match(/break-inside:avoid/g).length).toBeGreaterThan(3);
});
