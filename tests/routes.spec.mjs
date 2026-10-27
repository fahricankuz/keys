import { test, expect } from '@playwright/test';
import { watchErrors, open } from './helpers.mjs';

const ROUTES = [
  ['#/kiraci', 'Moda’daki ev'],
  ['#/kiraci/odemeler', 'Ödemeler'],
  ['#/kiraci/talepler', 'Talepler'],
  ['#/kiraci/mesajlar', 'Mesajlar'],
  ['#/kiraci/belgeler', 'Belgeler'],
  ['#/kiraci/belgeler/tutanak', 'Tutanak'],
  ['#/kiraci/belgeler/cikis', 'Tutanak'],
  ['#/kiraci/takvim', 'Takvim'],
  ['#/mulk-sahibi', 'Portföyüm'],
  ['#/mulk-sahibi/talepler', 'Talepler'],
  ['#/mulk-sahibi/mesajlar', 'Mesajlar'],
  ['#/mulk-sahibi/takvim', 'Takvim'],
  ['#/mulk-sahibi/rapor', 'Rapor'],
  ['#/mulk-sahibi/mulk/moda', 'Moda’daki ev'],
  ['#/mulk-sahibi/mulk/moda/odeme', 'Moda’daki ev'],
  ['#/mulk-sahibi/mulk/moda/talep', 'Moda’daki ev'],
  ['#/mulk-sahibi/mulk/moda/mesaj', 'Moda’daki ev'],
  ['#/mulk-sahibi/mulk/moda/belge', 'Moda’daki ev'],
  ['#/mulk-sahibi/mulk/moda/tutanak', 'Moda’daki ev'],
  ['#/mulk-sahibi/mulk/moda/cikis', 'Moda’daki ev'],
  ['#/mulk-sahibi/mulk/moda/gider', 'Moda’daki ev'],
  ['#/mulk-sahibi/mulk/cihangir/odeme', 'Cihangir 1+1'],
  ['#/mulk-sahibi/mulk/atasehir/ozet', 'Ataşehir 2+1'],
  ['#/bilinmeyen/yol', 'Moda’daki ev']
];

for (const [hash, title] of ROUTES){
  test(`rota ${hash} çizilir`, async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, hash);
    await expect(page.locator('#screen h1')).toHaveText(title);
    expect(errors).toEqual([]);
  });
}

const SHEETS = [
  '#/kiraci/odemeler?s=odeme&pid=moda',
  '#/kiraci/talepler?s=talep&pid=moda&id=r1',
  '#/kiraci/talepler/r1',
  '#/mulk-sahibi?s=ayarlar',
  '#/mulk-sahibi?s=bildirim',
  '#/mulk-sahibi?s=arama',
  '#/mulk-sahibi?s=harita',
  '#/mulk-sahibi?s=ev-ekle',
  '#/mulk-sahibi/mulk/moda?s=ev-duzenle',
  '#/mulk-sahibi/mulk/moda/odeme?s=yenileme',
  '#/mulk-sahibi/mulk/moda?s=kiraci-ekle',
  '#/mulk-sahibi/mulk/moda/gider?s=gider',
  '#/mulk-sahibi/mulk/moda/gider?s=gider&id=e1',
  '#/mulk-sahibi/mulk/moda/talep?s=teklif&pid=moda&id=r1',
  '#/mulk-sahibi/mulk/moda/talep?s=fatura&pid=moda&id=r1',
  '#/mulk-sahibi/mulk/moda/cikis?s=cikis-baslat&pid=moda'
];

for (const hash of SHEETS){
  test(`sheet ${hash} açılır`, async ({ page }) => {
    const errors = watchErrors(page);
    await open(page, hash);
    await expect(page.locator('#layer .sheet')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
