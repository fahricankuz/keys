// CRM: kişi eklenir, potansiyel getiri paket ve adetten hesaplanır; sütunlar arasında taşınır; görüşme notu eklenir;
// Talepler'den "CRM'e ekle" formu doldurur; takip günü gelen kişi uyarı alır.
import { test, expect } from '@playwright/test';
import { serveDist, seed, PW, ensureDist } from './app-helpers.mjs';
import { watchErrors } from './helpers.mjs';

const DIST = new URL('../app/dist-fake', import.meta.url).pathname;
const PORT = 8273;
let server, errors;
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => { test.setTimeout(300_000); await ensureDist(DIST); server = await serveDist(DIST, PORT); });
test.afterAll(() => server && server.close());
test.beforeEach(async ({ page }) => {
  errors = watchErrors(page);
  const d = seed();
  d.tables.support_requests = [{ id: '11111111-2222-4333-8444-555555555555', user_id: null, kind: 'kurumsal', units: 240, name: 'Selin Yılmaz', email: 'selin@ornek.com', phone: '05320000000', message: 'Site için teklif', company: 'Atakum Sitesi', source: 'web', details: {}, status: 'open', created_at: new Date().toISOString() }];
  d.tables.crm_leads = [{ id: 'l-eski', name: 'Eski Görüşme', plan: 'tek', units: 2, stage: 'teklif', source: 'telefon', next_at: new Date().toISOString().slice(0, 10), created_at: new Date().toISOString(), updated_at: new Date().toISOString() }];
  await page.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, d);
});
test.afterEach(() => { expect(errors).toEqual([]); });
const url = (p) => `http://localhost:${PORT}${p}`;
async function admin(page) {
  await page.goto(url('/giris/yonetici'));
  await page.getByLabel('E-posta').fill('admin@ornek.com');
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await page.getByRole('button', { name: 'CRM', exact: true }).first().click();
}

test('kişi ekle, potansiyel getiri, taşı, not; takip günü uyarısı', async ({ page }) => {
  await admin(page);
  await expect(page.getByText('Eski Görüşme')).toBeVisible();
  await expect(page.getByText('Takip günü').first()).toBeVisible();                 // bugün takip
  await page.getByRole('button', { name: 'Kişi ekle' }).click();
  await page.getByLabel('Ad soyad').fill('Mert Kaya');
  await page.getByLabel('Telefon').fill('05551112233');
  await page.getByLabel('Mülk / birim adedi').fill('4');
  await expect(page.getByText(/Potansiyel: ₺800 \/ ay/)).toBeVisible();              // Profesyonel ₺199,99 × 4
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.getByText('Mert Kaya').first()).toBeVisible();
  let leads = await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')).tables.crm_leads);
  const mert = leads.find((l) => l.name === 'Mert Kaya');
  expect(mert).toMatchObject({ plan: 'bes', units: 4, stage: 'yeni' });
  await page.getByRole('button', { name: 'Kapat' }).first().click();
  await page.getByRole('button', { name: 'İletişime geçildi ›' }).first().click();
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')).tables.crm_leads)).find((l) => l.name === 'Mert Kaya').stage).toBe('iletisim');
  await page.getByRole('button', { name: 'Mert Kaya kişisini aç' }).click();
  await page.getByLabel('Görüşme notu').fill('Aradım, demo istedi');
  await page.getByRole('button', { name: 'Notu ekle' }).click();
  await expect(page.getByText(/: Aradım, demo istedi$/)).toBeVisible();
});

test('Talepler’den CRM’e ekle: form talebin bilgileriyle dolu açılır', async ({ page }) => {
  await admin(page);
  await page.getByRole('button', { name: 'Talepler', exact: true }).first().click();
  await page.getByRole('button', { name: 'CRM’e ekle' }).click();
  await expect(page.getByLabel('Ad soyad')).toHaveValue('Selin Yılmaz');
  await expect(page.getByRole('textbox', { name: 'Kurum', exact: true })).toHaveValue('Atakum Sitesi');
  await expect(page.getByLabel('Mülk / birim adedi')).toHaveValue('240');
  await page.getByLabel('Aylık tutar (₺, teklif)').fill('15000');
  await expect(page.getByText(/Potansiyel: ₺15\.000 \/ ay · ₺180\.000 \/ yıl/)).toBeVisible();
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem('__fakedb')).tables.crm_leads)).find((l) => l.name === 'Selin Yılmaz')?.request_id).toBe('11111111-2222-4333-8444-555555555555');
});
