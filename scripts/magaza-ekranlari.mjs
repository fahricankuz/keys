// Mağaza ekran görüntüleri: uygulamanın sahte verili derlemesini (app/dist-fake) açar, örnek bir portföyle giriş yapar ve
// App Store / Google Play'in istediği boyutlarda ekranları çeker. Çıktı: magaza-ekranlari/<cihaz>/<sıra>-<ekran>.png
// (depoya eklenmez). Kullanım (depo kökünde): node scripts/magaza-ekranlari.mjs
// Gerçek kişi verisi kullanılmaz; adlar ve tutarlar örnektir.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { serveDist, seed, ensureDist, PW, ID } from '../tests/app-helpers.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const DIST = join(ROOT, 'app/dist-fake');
const OUT = join(ROOT, 'magaza-ekranlari');
const PORT = 8391;

// Boyutlar piksel olarak: viewport × ölçek.
const DEVICES = [
  { key: 'iphone-6.9', w: 440, h: 956, scale: 3 },    // 1320 × 2868 (App Store zorunlu)
  { key: 'iphone-6.5', w: 428, h: 926, scale: 3 },    // 1284 × 2778
  { key: 'ipad-13', w: 1032, h: 1376, scale: 2 },     // 2064 × 2752 (supportsTablet: true olduğu için zorunlu)
  { key: 'android', w: 360, h: 800, scale: 3 }        // 1080 × 2400
];

function demo() {
  const d = seed();
  const now = new Date();
  const ym = (off) => { const x = new Date(now.getFullYear(), now.getMonth() + off, 1); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0'); };
  const day = (off) => new Date(now.getTime() + off * 86400000).toISOString().slice(0, 10);
  const base = d.tables.properties[0];
  d.tables.properties = [
    { ...base, id: 'p1', name: 'Moda Dairesi', addr: 'Caferağa Mah., Kadıköy / İstanbul', rent: 32500 },
    { ...base, id: 'p2', name: 'Bostancı 2+1', addr: 'Bostancı Mah., Kadıköy / İstanbul', rent: 27000, due_day: 1 },
    { ...base, id: 'p3', name: 'Nişantaşı Ofis', addr: 'Teşvikiye Mah., Şişli / İstanbul', rent: 48000, due_day: 10, prop_type: 'İşyeri' }
  ];
  d.tables.property_shared = d.tables.properties.map((p) => ({ property_id: p.id, inspect: { tenantOk: false, landlordOk: false, rooms: [] }, move_out: null, renewal: null }));
  d.tables.memberships = d.tables.properties.flatMap((p, i) => [
    { property_id: p.id, user_id: ID.landlord, role: 'landlord', display_name: 'Ayşe Mülk', phone: '', email: '' },
    ...(i === 0 ? [{ property_id: p.id, user_id: ID.tenant, role: 'tenant', display_name: 'Mehmet Kiracı', phone: '', email: 'kiraci@ornek.com' }] : [])
  ]);
  d.tables.rent_history = d.tables.properties.map((p) => ({ id: p.id + ':' + p.start_date, property_id: p.id, from_date: p.start_date, amount: p.rent, note: 'Sözleşme başlangıcı' }));
  d.tables.payments = [
    { property_id: 'p1', month: ym(0), kind: 'kira', status: 'review', amount: 32500, paid_on: day(-1), method: 'dekont', receipt_name: 'dekont.pdf' },
    ...[-1, -2, -3].map((o) => ({ property_id: 'p1', month: ym(o), kind: 'kira', status: 'approved', amount: 32500, paid_on: ym(o) + '-04', method: 'dekont' })),
    ...[0, -1, -2].map((o) => ({ property_id: 'p2', month: ym(o), kind: 'kira', status: 'approved', amount: 27000, paid_on: ym(o) + '-01', method: 'havale' }))
  ];
  d.tables.requests = [{ id: 'r1', property_id: 'p1', cat: 'Arıza', title: 'Kombi basıncı düşüyor', descr: 'Sabahları sıcak su gelmiyor.', urgency: 'Acil', status: 1, cost: 'Belirlenmedi', cost_ok: false, decision: null, req_date: day(-2), photos: 0, shots: [], log: [], quotes: [{ id: 'q0', vendor: 'Servis Mehmet', amount: 2200, phone: '', note: '2 gün', chosen: false, by: 'landlord' }], invoice: null }];
  d.tables.messages = [
    { id: 'm1', property_id: 'p1', from_role: 'tenant', by_user: ID.tenant, body: 'Merhaba, bu ayın dekontunu yükledim.', at: new Date(now.getTime() - 3600e3).toISOString() },
    { id: 'm2', property_id: 'p1', from_role: 'landlord', by_user: ID.landlord, body: 'Teşekkürler, onaylıyorum.', at: new Date(now.getTime() - 1800e3).toISOString() }
  ];
  d.tables.profiles.find((x) => x.id === ID.landlord).settings = { setupHidden: true };   // tanıtım görüntüsünde kurulum kartı yok
  d.tables.subscriptions = [{ user_id: ID.landlord, entitlement: 'pro', product_id: 'bes_3_aylik', store: 'app_store', active: true, will_renew: true, expires_at: new Date(now.getTime() + 20 * 86400000).toISOString(), updated_at: now.toISOString() }];
  return d;
}

const SHOTS = {
  landlord: [['01-portfoy', '/uygulama'], ['02-mulk', '/uygulama/mulk?pid=p1'], ['03-odemeler', '/uygulama/odemeler'], ['04-talepler', '/uygulama/talepler'], ['05-mesajlar', '/uygulama/mesajlar']],
  tenant: [['06-kiraci', '/uygulama']]
};

async function login(page, email, entry) {
  await page.goto(`http://localhost:${PORT}${entry}`);
  await page.getByLabel('E-posta').fill(email);
  await page.getByLabel('Şifre', { exact: true }).fill(PW);
  await page.getByRole('button', { name: 'Giriş yap' }).click();
  await page.waitForURL(/\/uygulama/);
}

await ensureDist(DIST);
const server = await serveDist(DIST, PORT);
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
try {
  for (const dev of DEVICES) {
    mkdirSync(join(OUT, dev.key), { recursive: true });
    for (const [who, list] of Object.entries(SHOTS)) {
      const ctx = await browser.newContext({ viewport: { width: dev.w, height: dev.h }, deviceScaleFactor: dev.scale, locale: 'tr-TR', timezoneId: 'Europe/Istanbul', isMobile: dev.key !== 'ipad-13', hasTouch: true });
      const db = demo();
      await ctx.addInitScript((x) => { if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(x)); }, db);
      const page = await ctx.newPage();
      await login(page, who === 'landlord' ? 'ev@ornek.com' : 'kiraci@ornek.com', who === 'landlord' ? '/giris/mulk-sahibi' : '/giris/kiraci');
      for (const [name, path] of list) {
        await page.goto(`http://localhost:${PORT}${path}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(800);
        const file = join(OUT, dev.key, name + '.png');
        await page.screenshot({ path: file });
        console.log(file);
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
