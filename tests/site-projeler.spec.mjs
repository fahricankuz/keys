// Site projeleri ve talep yazışması (istemci): yeni ekranlardaki her metnin İngilizce karşılığı var; uygulamadaki yetki kataloğu
// (domain/org.js → PERMS) sunucudaki org_perm_list ile aynı; "Projeler" bölümü site panelinde ve adres listesinde.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('site projeleri ve talep yazışması ekranlarındaki her metnin İngilizce karşılığı var', async () => {
  const { EN_PAKET } = await import('../app/src/domain/en-paket.js');
  const { EN_EXTRA } = await import('../app/src/domain/en-extra.js');
  const { EN_MULK } = await import('../app/src/domain/en-mulk.js');
  const { EN } = await import('../app/src/domain/en.js');
  const all = { ...EN_EXTRA, ...EN_MULK, ...EN_PAKET, ...EN };
  const keys = [];
  for (const f of ['app/src/app-ui/site-projects.tsx']) {
    for (const m of src(f).matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) keys.push(m[1].replace(/\\'/g, "'"));
  }
  // domain/site.js içindeki proje durumları ve hata metni.
  for (const k of ['Planlandı', 'Başladı', 'Devam ediyor', 'Askıda', 'Tamamlandı', 'Fotoğraf yüklenemedi', 'Projeler', 'Site projeleri',
    'Onayla ve gönder', 'Bu ödeme kaydı silinsin mi?', '{n} daireye toplam {sum} yazılacak ve sakinlere bildirim gidecek. Onaylıyor musun?']) keys.push(k);
  expect(keys.length).toBeGreaterThan(40);
  expect(keys.filter((k) => !(k in all))).toEqual([]);
});

test('uygulamadaki yetki kataloğu sunucudakiyle aynı (yeni: projects.manage)', () => {
  const client = [...src('app/src/domain/org.js').matchAll(/\{ key: '([a-z.]+)', label: t\('[^']+'\), desc:/g)].map((m) => m[1]);
  const schema = src('supabase/schema.sql');
  const last = [...schema.matchAll(/function public\.org_perm_list\(\)[\s\S]*?select array\[([\s\S]*?)\]/g)].pop();
  const server = [...last[1].matchAll(/'([a-z.]+)'/g)].map((m) => m[1]);
  expect(client).toContain('projects.manage');
  expect(client.slice().sort()).toEqual(server.slice().sort());
});

test('"Projeler" bölümü: site panelinde menüde ve adres listesinde', () => {
  expect(src('app/src/domain/org.js')).toMatch(/if \(site\) list\.push\(\{ key: 'projeler'/);
  expect(src('app/src/app-ui/site.tsx')).toMatch(/SECTION_KEYS = \[[^\]]*'projeler'/);
  expect(src('app/src/app-ui/site.tsx')).toMatch(/cur\.key === 'projeler' && <SiteProjects/);
});
