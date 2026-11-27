// Sosyal medya hesapları tek yerde (app/src/domain/config.js → CONFIG.social); web altbilgisi, uygulamadaki Yardım sekmesi,
// yapılandırılmış veri (sameAs) ve bio sayfası aynı adresleri kullanır.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const config = read('app/src/domain/config.js');
const URLS = ['https://www.instagram.com/anahtar_io/', 'https://www.tiktok.com/@anahtar.io', 'https://www.facebook.com/share/19o78yxmTv/', 'https://x.com/anahtar_io'];

test('hesap adresleri yapılandırmada, bio sayfasında ve sameAs’ta aynı', () => {
  const bio = read('app/public/merhaba/index.html');
  const harden = read('app/scripts/harden-html.mjs');
  for (const u of URLS) {
    expect(config, u).toContain(`url: '${u}'`);
    expect(bio, u).toContain(`href="${u}"`);
    expect(harden, u).toContain(`'${u}'`);
  }
});

test('web altbilgisi ve mobil Yardım sekmesi yapılandırmadan okur, İngilizce başlık var', () => {
  expect(read('app/src/site/Landing.tsx')).toContain('CONFIG.social');
  expect(read('app/src/app-ui/sheets.tsx')).toContain('CONFIG.social');
  expect(read('app/src/domain/en-extra.js')).toContain("'Bizi takip et': 'Follow us'");
});

test('web altbilgisi mağaza rozetleri doğru mağaza adreslerine gider', () => {
  expect(config).toContain("ios: 'https://apps.apple.com/tr/app/id6834434284'");
  expect(config).toContain("android: 'https://play.google.com/store/apps/details?id=io.anahtar.app'");
  const landing = read('app/src/site/Landing.tsx');
  expect(landing).toContain('CONFIG.stores.ios');
  expect(landing).toContain('CONFIG.stores.android');
});
