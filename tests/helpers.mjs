import { expect } from '@playwright/test';

/** Sayfa hatalarını toplar; test sonunda boş olmalı. */
export function watchErrors(page){
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Yazı tipleri ve ağ erişimi test ortamında engellenebilir; uygulama hatası sayılmaz.
    if (/fonts\.g|ERR_CERT|ERR_NAME|ERR_INTERNET|net::ERR/.test(t)) return;
    errors.push('console: ' + t);
  });
  return errors;
}

/** Adrese gider ve ekran çizilene kadar bekler. */
export async function open(page, hash = '#/kiraci'){
  await page.goto('index.html' + hash);
  await expect(page.locator('#screen h1')).toBeVisible();
}

/** Açık sheet. */
export const sheet = page => page.locator('#layer .sheet');

/** Küçük geçerli PNG — dosya yükleme testleri için. */
export const PNG = {
  name: 'dekont.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
};


/** Telefon boyutunda (5000x4000, 20 MP) düz renkli PNG ve bozuk bir "fotoğraf" üretir (fotoğraf küçültme testleri). Klasör yolunu döner. */
export async function makeTestPhotos() {
  const { deflateSync } = await import('node:zlib');
  const { writeFileSync, mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'foto-'));
  const w = 5000, h = 4000, row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 160)]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let r = 0xffffffff; for (const x of b) r = table[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  writeFileSync(join(dir, 'buyuk.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  writeFileSync(join(dir, 'bozuk.png'), Buffer.from('bu bir fotoğraf değil, rastgele baytlar'));
  return dir;
}
