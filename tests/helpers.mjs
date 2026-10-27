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
