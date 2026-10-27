import { createRequire } from 'node:module'; const req = createRequire(import.meta.url); const { chromium } = req('playwright');
import { ensureDist, serveDist, seed, PW } from '/home/user/keys/tests/app-helpers.mjs';
const DIST = '/home/user/keys/app/dist-fake'; await ensureDist(DIST);
const server = await serveDist(DIST, 8793);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome' });
const missing = new Set(), turkish = new Map();
const db = seed(); const now = new Date(); const m = (k) => new Date(Date.UTC(now.getFullYear(), now.getMonth() + k, 1)).toISOString().slice(0, 7);
db.tables.payments = [{ property_id: 'p1', month: m(-1), status: 'approved', amount: 30000, paid_on: m(-1) + '-03', receipt_name: 'r.png' }];
db.tables.requests = [{ id: 'r1', property_id: 'p1', cat: 'Arıza', title: 'Kombi', descr: '', urgency: 'Normal', status: 1, cost: 'Belirlenmedi', cost_ok: false, req_date: m(0) + '-02', photos: 0, shots: [], log: [], quotes: [] }];
async function sweep(page, where) {
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => ({ miss: [...(globalThis.__i18nMissing || [])], text: document.body.innerText }));
  r.miss.forEach((x) => missing.add(x));
  for (const line of r.text.split('\n')) if (/[ğşıİĞŞçÇöÖüÜ]/.test(line) && line.trim().length > 1) { if (!turkish.has(line.trim())) turkish.set(line.trim(), where); }
}
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript((d) => { localStorage.setItem('evim-tercih', JSON.stringify({ lang: 'en' })); if (!localStorage.getItem('__fakedb')) localStorage.setItem('__fakedb', JSON.stringify(d)); }, db);
const go = async (p) => { await page.goto('http://localhost:8793' + p); await sweep(page, p); };
await go('/');
for (const tab of await page.getByRole('tab').all()) { try { await tab.click({ timeout: 1500 }); await sweep(page, '/ tabs'); } catch {} }
for (const q of await page.locator('[aria-expanded]').all()) { try { await q.click({ timeout: 1500 }); } catch {} } await sweep(page, '/ faq');
for (const p of ['/giris', '/giris/kiraci', '/giris/mulk-sahibi', '/giris/yonetici', '/kayit', '/kayit/kiraci', '/kayit/mulk-sahibi', '/kayit/ekip', '/sifre', '/katil?kod=ABC12345']) await go(p);
async function login(email, entry) {
  await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('__fakedb')); d.session = null; localStorage.setItem('__fakedb', JSON.stringify(d)); });
  await page.goto('http://localhost:8793' + entry); await page.waitForTimeout(1200);
  await page.locator('input[type="email"], input').first().fill(email); await page.locator('input[type="password"]').first().fill(PW);
  await page.locator('input[type="password"]').first().press('Enter'); await page.waitForTimeout(3000);
}
await login('kiraci@ornek.com', '/giris/kiraci');
for (const p of ['/uygulama', '/uygulama/odemeler', '/uygulama/talepler', '/uygulama/mesajlar', '/uygulama/belgeler', '/uygulama/belgeler/tutanak', '/uygulama/belgeler/cikis', '/uygulama/takvim']) await go(p);
await login('ev@ornek.com', '/giris/mulk-sahibi');
for (const p of ['/uygulama', '/uygulama/mulk/p1', '/uygulama/mulk/p1/odeme', '/uygulama/mulk/p1/talep', '/uygulama/mulk/p1/belge', '/uygulama/mulk/p1/tutanak', '/uygulama/mulk/p1/gider', '/uygulama/mulk/p1/rapor', '/uygulama/rapor', '/uygulama/talepler', '/uygulama/mesajlar', '/uygulama/takvim', '/uygulama/ekip', '/uygulama/ice-aktar']) await go(p);
for (const lbl of ['Settings', 'Notifications and reminders', 'Search']) { try { await page.getByRole('button', { name: lbl }).first().click({ timeout: 1500 }); await sweep(page, 'sheet ' + lbl); await page.keyboard.press('Escape'); } catch {} }
await login('admin@ornek.com', '/giris/yonetici');
await sweep(page, '/admin');
for (const tab of ['Overview', 'Subscriptions', 'Requests', 'Review', 'Payments', 'Connections', 'Messages', 'Users', 'Log']) { try { await page.getByRole('button', { name: new RegExp('^' + tab) }).first().click({ timeout: 1500 }); await sweep(page, 'admin ' + tab); } catch (e) { console.log('no tab', tab); } }
await b.close(); server.close();
console.log('MISSING', missing.size); [...missing].forEach((x) => console.log('  M', JSON.stringify(x)));
console.log('TURKISH', turkish.size); [...turkish].forEach(([x, w]) => console.log('  T', w, '|', x.slice(0, 120)));
console.log('errors', errs.slice(0, 5));
