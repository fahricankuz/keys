// Uçtan uca test hesapları: web (anahtar.io), TestFlight (iOS) ve Play iç test (Android) sürümlerinde elle denemek için
// gerçekçi verilerle dolu beş hesap. Mağaza inceleme hesaplarından (inceleme-hesaplari.mjs) ayrıdır; onlara dokunmaz.
//
// HESAPLAR (hepsi @anahtar.io, e-postası onaylı, hoş geldin e-postası kapalı)
//   test-mulk@anahtar.io      mülk sahibi, süresiz yönetici paketi (bes_9_aylik, mağaza "admin"); 3 mülk:
//                             Moda'da kiracılı daire (6 ay onaylı kira + aidat, bu ay onay bekleyen dekont, çözülmüş talep, mesajlar, sözleşme),
//                             Şişli'de geciken kiralı daire (açık arıza talebi, mesajlar, DASK belgesi, davet bekleyen kiracı), Kartal'da boş daire
//   test-kiraci@anahtar.io    Moda dairesinin kiracısı; gerçek davet koduyla katılmış (invites + üst veride invite)
//   test-yeni@anahtar.io      yeni mülk sahibi: yönetici paketi YOK, sunucunun normal 30 günlük denemesi; tek mülk (paywall / sandbox satın alma denemesi için)
//   test-yonetici@anahtar.io  "Test Yeşilvadi Sitesi" (site) kurumunun master yöneticisi
//   test-sakin@anahtar.io     o sitede A Blok No 3 dairesinin kiracısı
//   Site: 8 daire (A/B blok), 5 dairede kayıtlı sakin, 3 aylık aidat (ödenmiş / onay bekleyen / kısmi / geciken), gider, duyuru, açık talep, kasa.
//
// KULLANIM (bilgisayarında, depo kökünden; Node 22)
//   SUPABASE_URL=https://<proje>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role> node app/scripts/test-hesaplari.mjs          kurar / yeniler
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node app/scripts/test-hesaplari.mjs --kuru                                       yalnız okur, ne yapacağını yazar
//   SUPABASE_URL=... SUPABASE_ANON_KEY=<yayınlanabilir anahtar> node app/scripts/test-hesaplari.mjs --dogrula                      gerçek girişle sayar (yazmaz)
// service_role anahtarını asla depoya yazma; yalnızca komutu çalıştırırken ortam değişkeni olarak ver.
//
// ŞİFRE: beş hesabın şifresi aynıdır ve yalnızca Erdem'in yerel gizli klasöründeki ~/.config/anahtar/secrets/test-hesap-sifre dosyasındadır
// (izin 600). Betik onu ekrana yazmaz, günlüğe yazmaz. Dosya varsa aynısı kullanılır (yeniden çalıştırınca değişmez); yoksa rastgele üretilir.
// TEST_PASSWORD verilirse o kullanılır ve dosyaya yazılır. Şifreyi değiştirmek için dosyayı silip betiği yeniden çalıştır.
//
// YENİDEN ÇALIŞTIRMA güvenlidir: yalnızca bu betiğin kimlikleri (test-… mülkleri, 7e57… kurum/daire kimlikleri, beş e-posta) silinip yeniden yazılır;
// başka kullanıcıların satırlarına dokunulmaz. test-yeni için deneme süresini sıfırlamak ve mağaza aboneliğini temizlemek: TEST_YENI_SIFIRLA=1.
//
// E-POSTA VE BİLDİRİM: hoş geldin e-postası "skip" yazılır; hesapların profiles.settings değerlerinden email, sms, reportMonthly, reportYearly ve siteReport
// baştan false olur (veri yazan tetikleyiciler bildirim satırı açar, push işlevi de bildirim e-postası yollar; rapor e-postaları ayrı zamanlanmış iştir).
// Tetikleyicilerin bu çalışmada açtığı bildirim satırları sonunda silinir. Posta, push ya da SMS işlevi çağrılmaz. Ayarlardan e-postayı açarsan günlük hatırlatmalar bu adreslere e-posta gönderir (betik yeniden çalışınca yine kapatır).
//
// ÜRETİM İÇİN: önce --kuru çalıştır; yazma yalnız bu betiğin kendi satırlarına ve beş hesaba olur (hepsi eklemedir, silme yalnız kendi kimliklerinde).

import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const URL = process.env.SUPABASE_URL;
const MODE = process.argv.includes('--dogrula') ? 'dogrula' : process.argv.includes('--kuru') ? 'kuru' : 'kur';
const KEY = MODE === 'dogrula' ? process.env.SUPABASE_ANON_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error(MODE === 'dogrula' ? 'SUPABASE_URL ve SUPABASE_ANON_KEY gerekli.' : 'SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.');
  process.exit(1);
}
const PW_FILE = join(homedir(), '.config', 'anahtar', 'secrets', 'test-hesap-sifre');
const PW_SHOWN = '~/.config/anahtar/secrets/test-hesap-sifre';
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const sb = createClient(URL, KEY, opts);
const must = (r, what) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data; };

/* ------------------------------------------------------------------ */
/* Tarih yardımcıları (Europe/Istanbul takvimi; makinenin saat diliminden bağımsız)                    */
/* ------------------------------------------------------------------ */
const p2 = (n) => String(n).padStart(2, '0');
const TODAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const [TY, TM, TD] = TODAY.split('-').map(Number);
/** k ay önce (negatif) ya da sonra (pozitif) ayın "YYYY-MM" değeri. */
const ymOf = (k) => { const t = TY * 12 + (TM - 1) + k; return `${Math.floor(t / 12)}-${p2((t % 12) + 1)}`; };
/** k. ayın d. günü ("YYYY-MM-DD"; gün en çok 28). */
const dateOf = (k, d) => `${ymOf(k)}-${p2(Math.min(d, 28))}`;
const daysAgo = (n) => new Date(Date.UTC(TY, TM - 1, TD) - n * 864e5).toISOString().slice(0, 10);
const plusYear = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y + 1, m - 1, d) - 864e5).toISOString().slice(0, 10); };
const msAgo = (days, hours = 0) => Date.now() - days * 864e5 - hours * 36e5;
const isoAgo = (days, hours = 0) => new Date(msAgo(days, hours)).toISOString();
const atNoon = (s) => `${s}T12:00:00+03:00`;
const ascii = (s) => s.replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => 'cCgGiIoOsSuU'['çÇğĞıİöÖşŞüÜ'.indexOf(c)]);
/** Uygulamadaki formatAddress ile aynı tek satırlık adres (domain/address.js). */
const oneLine = (a) => [[a.street, a.no ? 'No:' + a.no : '', a.unit ? 'D:' + a.unit : ''].filter(Boolean).join(' '), a.hood, [a.district, a.city].filter(Boolean).join('/')].filter(Boolean).join(', ');
const addr = (street, no, unit, hood, district) => ({ country: 'Türkiye', city: 'İstanbul', district, hood, street, no, unit, note: '' });

/* ------------------------------------------------------------------ */
/* Kimlikler: yeniden çalıştırmada yalnız bunlar silinip yazılır                                         */
/* ------------------------------------------------------------------ */
const PEOPLE = {
  mulk: { email: 'test-mulk@anahtar.io', name: 'Test Mülk Sahibi', phone: '05000000101', role: 'landlord' },
  kiraci: { email: 'test-kiraci@anahtar.io', name: 'Test Kiracı', phone: '05000000102', role: 'tenant' },
  yeni: { email: 'test-yeni@anahtar.io', name: 'Test Yeni Kullanıcı', phone: '05000000103', role: 'landlord' },
  yonetici: { email: 'test-yonetici@anahtar.io', name: 'Test Site Yöneticisi', phone: '05000000104', role: 'landlord' },
  sakin: { email: 'test-sakin@anahtar.io', name: 'Test Sakin', phone: '05000000105', role: 'tenant' }
};
const P1 = 'test-mulk-moda', P2 = 'test-mulk-sisli', P3 = 'test-mulk-bos', P4 = 'test-yeni-1';
const PROP_IDS = [P1, P2, P3, P4];
const hex = (n) => n.toString(16).padStart(12, '0');
const ORG_ID = '7e570001-0000-4000-8000-000000000001';
const unitId = (i) => `7e570002-0000-4000-8000-${hex(i + 1)}`;
const REQ_ID = '7e570004-0000-4000-8000-000000000001';
const REQ_MSG = (i) => `7e570005-0000-4000-8000-${hex(i + 1)}`;

/* ------------------------------------------------------------------ */
/* Örnek PDF (dekont ve belge): küçük, geçerli, yalnız ASCII metin                                       */
/* ------------------------------------------------------------------ */
function pdf(title, lines) {
  const esc = (s) => ascii(s).replace(/[\\()]/g, '\\$&');
  const text = [`BT /F1 16 Tf 56 780 Td (${esc(title)}) Tj ET`, ...lines.map((l, i) => `BT /F1 11 Tf 56 ${750 - i * 18} Td (${esc(l)}) Tj ET`)].join('\n');
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}`
    + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
const FILES = {
  dekont: () => pdf('ORNEK DEKONT', ['anahtar test hesabi verisi', 'Bu dosya gercek bir odeme degildir.']),
  sozlesme: () => pdf('ORNEK KIRA SOZLESMESI', ['anahtar test hesabi verisi', 'Moda 2+1 daire - 12 ay - gercek bir sozlesme degildir.']),
  dask: () => pdf('ORNEK DASK POLICESI', ['anahtar test hesabi verisi', 'Gercek bir police degildir.'])
};

/* ------------------------------------------------------------------ */
/* Mülk verisi (kimliklerden bağımsız saf kurulum; sayılar --kuru ve --dogrula için de buradan)          */
/* ------------------------------------------------------------------ */
function propertyData(u) {
  const a1 = addr('Moda Caddesi', '112', '6', 'Caferağa Mahallesi', 'Kadıköy');
  const a2 = addr('Halaskargazi Caddesi', '207', '11', 'Harbiye Mahallesi', 'Şişli');
  const a3 = addr('Çavuşoğlu Caddesi', '34', '8', 'Orhantepe Mahallesi', 'Kartal');
  const a4 = addr('Çırağan Caddesi', '58', '4', 'Sinanpaşa Mahallesi', 'Beşiktaş');
  const bills = (who = 'Kiracı') => [{ n: 'Elektrik', who }, { n: 'Doğalgaz', who }, { n: 'Su', who }, { n: 'İnternet', who }];
  const daskSisli = dateOf(5, 20);
  // Boş mülklerde sözleşme başlangıcı gelecekte: uygulama başlangıçtan sonra ödemesiz ayları "gecikmiş" sayar, boş mülk gecikmiş görünmesin.
  const s1 = dateOf(-6, 1), s2 = dateOf(-4, 1), s3 = dateOf(2, 1);
  const props = [
    { id: P1, owner_id: u.mulk, name: 'Moda 2+1 (kiracılı)', address: a1, addr: oneLine(a1), rent: 32000, due_day: 5, aidat: 1800, aidat_payer: 'Kiracı',
      deposit: 64000, deposit_note: 'Sözleşme imzasında nakit alındı.', start_date: s1, contract_end: plusYear(s1), dask: dateOf(7, 15), value: 6500000,
      prop_type: 'Konut', area: 95, bills: bills() },
    { id: P2, owner_id: u.mulk, name: 'Şişli 1+1 (geciken kira)', address: a2, addr: oneLine(a2), rent: 21500, due_day: 28, aidat: 1200, aidat_payer: 'Kiracı',
      deposit: 43000, deposit_note: '', start_date: s2, contract_end: plusYear(s2), dask: daskSisli, value: 4200000, prop_type: 'Konut', area: 62, bills: bills() },
    { id: P3, owner_id: u.mulk, name: 'Kartal 3+1 (boş)', address: a3, addr: oneLine(a3), rent: 27000, due_day: 1, aidat: 2000, aidat_payer: 'Kiracı',
      deposit: 0, deposit_note: '', start_date: s3, contract_end: plusYear(s3), dask: null, value: 5100000, prop_type: 'Konut', area: 135, bills: bills() },
    { id: P4, owner_id: u.yeni, name: 'Beşiktaş 2+1', address: a4, addr: oneLine(a4), rent: 28000, due_day: 1, aidat: 1500, aidat_payer: 'Kiracı',
      deposit: 0, deposit_note: '', start_date: s3, contract_end: plusYear(s3), dask: null, value: 7800000, prop_type: 'Konut', area: 88, bills: bills() }
  ].map((p) => ({ stopaj: false, deposit_kind: 'Nakit', ...p }));

  // Ödemeler. Moda: son 6 ay onaylı, bu ay dekont onay bekliyor (kira ve aidat). Şişli: 3 ay onaylı, geçen ay hiç ödenmemiş (geciken).
  const pay = (pid, k, kind, amount, status) => ({
    property_id: pid, month: ymOf(k), kind, status, amount, method: 'dekont', receipt_name: 'dekont.pdf', receipt_path: `${pid}/dekont-ornek.pdf`,
    paid_on: dateOf(k, k === 0 ? Math.min(TD, 4) : 3 + (((k % 3) + 3) % 3)),
    ...(status === 'approved' ? { approved_at: atNoon(dateOf(k, 4 + (((k % 3) + 3) % 3))) } : {})
  });
  const payments = [];
  for (let k = -6; k <= 0; k++) for (const [kind, amt] of [['kira', 32000], ['aidat', 1800]]) payments.push(pay(P1, k, kind, amt, k === 0 ? 'review' : 'approved'));
  for (let k = -4; k <= -2; k++) for (const [kind, amt] of [['kira', 21500], ['aidat', 1200]]) payments.push(pay(P2, k, kind, amt, 'approved'));

  const requests = [
    { id: 'test-talep-moda-1', property_id: P1, cat: 'Arıza', title: 'Mutfak musluğu damlatıyor', descr: 'İki gündür damlatıyor, conta değişmeli.', urgency: 'Normal',
      status: 3, cost: 'Mülk sahibi', cost_ok: true, req_date: daysAgo(20), created_by: u.kiraci,
      log: [{ at: msAgo(20), text: 'Talep açıldı' }, { at: msAgo(19), text: 'Mülk sahibi görüntüledi' }, { at: msAgo(18), text: 'Usta çağrıldı · İşlemde' }, { at: msAgo(17), text: 'Çözüldü' }] },
    { id: 'test-talep-sisli-1', property_id: P2, cat: 'Arıza', title: 'Banyo gideri tıkalı', descr: 'Duş giderinden su geri geliyor, kötü koku var.', urgency: 'Acil',
      status: 2, cost: 'Mülk sahibi', cost_ok: true, req_date: daysAgo(6), created_by: null,
      log: [{ at: msAgo(6), text: 'Talep açıldı' }, { at: msAgo(5, 20), text: 'Mülk sahibi görüntüledi' }, { at: msAgo(5), text: 'Masraf mülk sahibinde olarak onaylandı' }, { at: msAgo(4, 22), text: 'Tesisatçı çağrıldı · İşlemde' }] }
  ];

  const msg = (id, pid, from, by, body, days, hours = 0) => ({ id, property_id: pid, from_role: from, by_user: by, body, at: isoAgo(days, hours) });
  const messages = [
    msg('test-m-moda-1', P1, 'system', null, 'Test Kiracı eve katıldı', 180),
    msg('test-m-moda-2', P1, 'tenant', u.kiraci, 'Merhaba, kombi bakımının tarihini öğrenebilir miyim?', 31),
    msg('test-m-moda-3', P1, 'landlord', u.mulk, 'Merhaba, bakım firması Perşembe sabahı geliyor. O gün evde olabilir misiniz?', 31, -2),
    msg('test-m-moda-4', P1, 'tenant', u.kiraci, 'Evdeyim, teşekkürler.', 30),
    msg('test-m-moda-5', P1, 'tenant', u.kiraci, 'Bu ayın kirasını ve aidatı yükledim, kontrol edebilir misiniz?', 1),
    msg('test-m-moda-6', P1, 'landlord', u.mulk, 'Bakıp onaylayacağım, teşekkürler.', 0, 20),
    msg('test-m-sisli-1', P2, 'landlord', u.mulk, 'Merhaba Ahmet Bey, geçen ayın kirası henüz hesabıma ulaşmadı. Bir sorun mu var?', 8),
    msg('test-m-sisli-2', P2, 'tenant', null, 'Merhaba, maaşım geç yattı. Bu hafta içinde göndereceğim.', 7, 3),
    msg('test-m-sisli-3', P2, 'landlord', u.mulk, 'Tamam, ödemeyi yapınca dekontu uygulamaya yükleyebilirsiniz.', 7),
    msg('test-m-sisli-4', P2, 'tenant', null, 'Ayrıca banyoda gider tıkandı, talep açtım.', 6),
    msg('test-m-sisli-5', P2, 'landlord', u.mulk, 'Gördüm, tesisatçı yarın uğrayacak.', 5, 20)
  ];

  const docs = [
    { id: 'test-belge-moda-1', property_id: P1, cat: 'Kira sözleşmesi', name: 'Moda 2+1 · Kira sözleşmesi.pdf', path: `sb:${P1}/kira-sozlesmesi-ornek.pdf`, uploaded_on: s1, uploaded_by: u.mulk },
    { id: 'test-belge-sisli-1', property_id: P2, cat: 'DASK poliçesi', name: 'Şişli 1+1 · DASK poliçesi.pdf', path: `sb:${P2}/dask-police-ornek.pdf`,
      uploaded_on: daysAgo(40), until: daskSisli, uploaded_by: u.mulk }
  ];
  const expenses = [
    { id: 'test-gider-moda-1', property_id: P1, cat: 'Tamir ve bakım', amount: 2850, spent_on: daysAgo(18), note: 'Musluk contası ve usta' },
    { id: 'test-gider-moda-2', property_id: P1, cat: 'DASK ve sigorta', amount: 1420, spent_on: daysAgo(120), note: 'DASK yenileme' },
    { id: 'test-gider-bos-1', property_id: P3, cat: 'Tamir ve bakım', amount: 14500, spent_on: daysAgo(10), note: 'Boya badana' }
  ];
  return { props, payments, requests, messages, docs, expenses };
}

/* ------------------------------------------------------------------ */
/* Site verisi                                                                                          */
/* ------------------------------------------------------------------ */
// Her dairede [ödeme durumu: 2 ay önce, geçen ay, bu ay]. paid = ödendi, review = dekont onay bekliyor, partial = kısmi, open = ödenmemiş.
const SITE_UNITS = [
  { block: 'A', no: '1', area: 95, aidat: 1800, payer: 'malik', st: ['paid', 'paid', 'paid'], res: [{ role: 'malik', name: 'Mehmet Yıldız', phone: '05000000111', lives: true }] },
  { block: 'A', no: '2', area: 95, aidat: 1800, payer: 'kiraci', st: ['paid', 'paid', 'review'],
    res: [{ role: 'malik', name: 'Selin Aksoy', phone: '05000000112', lives: false }, { role: 'kiraci', name: 'Burak Çelik', phone: '05000000113', lives: true }] },
  { block: 'A', no: '3', area: 110, aidat: 2100, payer: 'kiraci', st: ['paid', 'paid', 'open'],
    res: [{ role: 'malik', name: 'Hasan Kaya', phone: '05000000114', lives: false }, { role: 'kiraci', who: 'sakin', lives: true }] },
  { block: 'A', no: '4', area: 110, aidat: 2100, payer: 'malik', st: ['paid', 'paid', 'open'], res: [] },
  { block: 'B', no: '1', area: 130, aidat: 2400, payer: 'malik', st: ['paid', 'paid', 'paid'], res: [{ role: 'malik', name: 'Fatma Öztürk', phone: '05000000115', lives: true }] },
  { block: 'B', no: '2', area: 130, aidat: 2400, payer: 'kiraci', st: ['paid', 'open', 'open'],
    res: [{ role: 'malik', name: 'Murat Şahin', phone: '05000000116', lives: false }, { role: 'kiraci', name: 'Elif Arslan', phone: '05000000117', lives: true }] },
  { block: 'B', no: '3', area: 95, aidat: 1800, payer: 'malik', st: ['paid', 'partial', 'open'], res: [{ role: 'malik', name: 'Derya Koç', phone: '05000000118', lives: true }] },
  { block: 'B', no: '4', area: 95, aidat: 1800, payer: 'malik', st: ['paid', 'open', 'open'], res: [] }
];
const SITE_ROLES = [   // org_seed_roles ("site" sektörü) ile aynı hazır roller
  { name: 'Muhasebe', perms: ['charges.manage', 'payments.approve', 'expenses.manage', 'reports.view'], position: 1 },
  { name: 'Teknik ekip', perms: ['requests.manage', 'documents.manage', 'units.manage'], position: 2 },
  { name: 'Güvenlik ve resepsiyon', perms: ['requests.manage', 'announce', 'residents.manage'], position: 3 },
  { name: 'Yönetim kurulu', perms: ['reports.view'], position: 4 }
];

function siteCharges(u, sakinUnit) {
  const rows = [];
  SITE_UNITS.forEach((x, i) => {
    [-2, -1, 0].forEach((k, j) => {
      const st = x.st[j];
      const mine = i === sakinUnit;   // test-sakin'in dairesi: ödemeleri dekontla, kendi adına
      // Toplu eklemede her satır aynı alanları taşır (eksik alan boş (null) yazılır ve NOT NULL sütunları bozardı).
      const r = { org_id: ORG_ID, unit_id: unitId(i), month: ymOf(k), kind: 'aidat', title: '', amount: x.aidat, due_on: dateOf(k, 10), status: st,
        paid_amount: 0, paid_on: null, method: 'dekont', receipt_name: '', receipt_path: null, paid_by: null, note: null };
      if (st === 'paid') Object.assign(r, { paid_amount: x.aidat, paid_on: dateOf(k, 3 + ((i + j) % 6)), method: mine ? 'dekont' : 'havale' },
        mine ? { receipt_name: 'dekont.pdf', receipt_path: `site-${ORG_ID}/dekont-ornek.pdf`, paid_by: u.sakin } : {});
      if (st === 'review') Object.assign(r, { paid_amount: x.aidat, paid_on: dateOf(k, Math.min(TD, 9)), method: 'dekont', receipt_name: 'dekont.pdf', receipt_path: `site-${ORG_ID}/dekont-ornek.pdf` });
      if (st === 'partial') Object.assign(r, { paid_amount: x.aidat / 2, paid_on: dateOf(k, 12), method: 'havale', note: 'Kalanı gelecek ay ödenecek.' });
      rows.push(r);
    });
  });
  return rows;
}
const siteExpenses = (u) => [
  { cat: 'Personel', amount: 17500, spent_on: dateOf(-1, 5), note: 'Kapıcı maaşı' },
  { cat: 'Personel', amount: 17500, spent_on: dateOf(0, 5), note: 'Kapıcı maaşı' },
  { cat: 'Asansör', amount: 4200, spent_on: dateOf(-1, 14), note: 'A ve B blok asansör periyodik bakımı' },
  { cat: 'Elektrik ve su (ortak alan)', amount: 3180, spent_on: dateOf(-1, 20), note: 'Ortak alan elektrik ve su faturası' },
  { cat: 'Temizlik', amount: 2400, spent_on: dateOf(0, 8), note: 'Temizlik malzemeleri' }
].map((e) => ({ org_id: ORG_ID, created_by: u.yonetici, ...e }));
const siteNotes = (u) => [
  { org_id: ORG_ID, created_by: u.yonetici, created_at: isoAgo(3), title: 'Asansör periyodik bakımı',
    body: 'Bu Cuma 10:00–12:00 arasında A ve B blok asansörlerinin periyodik bakımı yapılacaktır. Bu sürede asansörler kullanılamaz.' },
  { org_id: ORG_ID, created_by: u.yonetici, created_at: isoAgo(10), title: 'Aidat son ödeme günü',
    body: 'Aidatlar her ayın 10’una kadar ödenmelidir. Dekontunuzu uygulamadan yükleyebilirsiniz.' }
];
const SITE_SAKIN_UNIT = SITE_UNITS.findIndex((x) => x.res.some((r) => r.who === 'sakin'));

/** Beklenen sayılar: kurulumdan sonra --dogrula bunlarla karşılaştırır. */
function expected() {
  const dummy = { mulk: 'm', kiraci: 'k', yeni: 'y', yonetici: 'o', sakin: 's' };
  const d = propertyData(dummy);
  const c = siteCharges(dummy, SITE_SAKIN_UNIT);
  return {
    mulkProps: 3, mulkPays: d.payments.length, kiraciPays: d.payments.filter((p) => p.property_id === P1).length,
    siteUnits: SITE_UNITS.length, siteCharges: c.length, siteResidents: SITE_UNITS.reduce((n, x) => n + x.res.length, 0),
    siteExpenses: siteExpenses(dummy).length, siteNotes: siteNotes(dummy).length,
    sakinCharges: c.filter((x) => x.unit_id === unitId(SITE_SAKIN_UNIT)).length
  };
}

/* ------------------------------------------------------------------ */
/* Şifre                                                                                                */
/* ------------------------------------------------------------------ */
function readPassword() { try { return readFileSync(PW_FILE, 'utf8').trim() || null; } catch { return null; } }
function writePassword(pw) {
  mkdirSync(dirname(PW_FILE), { recursive: true, mode: 0o700 });
  writeFileSync(PW_FILE, pw + '\n', { mode: 0o600 });
  chmodSync(PW_FILE, 0o600);
}
/** Dosyadaki şifre; yoksa TEST_PASSWORD; o da yoksa rastgele üretilip dosyaya yazılır. Hesaplar açılmadan ÖNCE dosyaya yazılır. */
function resolvePassword() {
  const env = process.env.TEST_PASSWORD;
  if (env) {
    if (env.length < 12) throw new Error('TEST_PASSWORD en az 12 karakter olmalı.');
    if (readPassword() !== env) writePassword(env);
    return env;
  }
  const have = readPassword();
  if (have) return have;
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // karışan harfler (l, I, O, 0, 1) yok: telefonda yazması kolay
  const part = () => Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join('');
  const pw = [part(), part(), part(), part()].join('-');
  writePassword(pw);
  return pw;
}

/* ------------------------------------------------------------------ */
/* Hesaplar                                                                                             */
/* ------------------------------------------------------------------ */
let USERS = null;
async function findUser(email) {
  if (!USERS) {
    USERS = [];
    for (let page = 1; page < 50; page++) {
      const { users } = must(await sb.auth.admin.listUsers({ page, perPage: 200 }), 'kullanıcı listesi');
      USERS.push(...users);
      if (users.length < 200) break;
    }
  }
  return USERS.find((x) => (x.email || '').toLowerCase() === email) || null;
}

/** Hesap varsa şifresi güncellenir; yoksa e-postası onaylı açılır (profil kayıt tetikleyicisiyle oluşur).
    Kiracı ve site sakini hesabı yalnız geçerli davet koduyla açılır (handle_new_user → signup_code_ok). */
async function ensureUser(p, password, invite) {
  const u = await findUser(p.email);
  let id;
  if (u) {
    must(await sb.auth.admin.updateUserById(u.id, { password, email_confirm: true }), 'şifre');
    id = u.id;
  } else {
    const r = must(await sb.auth.admin.createUser({ email: p.email, password, email_confirm: true,
      user_metadata: { name: p.name, role: p.role, lang: 'tr', ...(invite ? { invite } : {}) } }), 'hesap ' + p.email);
    id = r.user.id;
  }
  // E-posta ve SMS baştan kapalı: veri yazan tetikleyiciler bildirim satırı açar, push işlevi de e-posta yollar (email=false ise yollamaz);
  // aylık / yıllık rapor e-postaları (report_recipients) ve site yönetim raporu (site_report_recipients) da ayardan kapatılır.
  // Var olan diğer ayarlar korunur.
  const cur = must(await sb.from('profiles').select('settings').eq('id', id).single(), 'profil ayarı').settings || {};
  must(await sb.from('profiles').update({ name: p.name, phone: p.phone, lang: 'tr',
    settings: { ...cur, email: false, sms: false, reportMonthly: false, reportYearly: false, siteReport: false } }).eq('id', id), 'profil');
  // Hoş geldin e-postası gitmesin.
  must(await sb.from('welcome_mail').upsert({ user_id: id, kind: 'skip' }), 'hoş geldin kaydı');
  return id;
}

async function upload(path, buf) {
  const r = await sb.storage.from('evim').upload(path, buf, { contentType: 'application/pdf', upsert: true });
  if (r.error) throw new Error('dosya ' + path + ': ' + r.error.message);
}

/* ------------------------------------------------------------------ */
/* Kurulum                                                                                              */
/* ------------------------------------------------------------------ */
async function kur() {
  const started = Date.now() - 5 * 60 * 1000;   // bu çalışmada tetikleyicilerin açtığı bildirimleri sonda silmek için
  const pw = resolvePassword();
  const u = {};

  // 1. Mülk sahibi hesapları ve paketler
  u.mulk = await ensureUser(PEOPLE.mulk, pw);
  u.yeni = await ensureUser(PEOPLE.yeni, pw);
  u.yonetici = await ensureUser(PEOPLE.yonetici, pw);
  // test-mulk: süresiz yönetici paketi (mağaza "admin": mağaza eşitlemesi ve billing işlevi bu satırı ezemez, bkz. guard_grant).
  must(await sb.from('subscriptions').upsert({ user_id: u.mulk, entitlement: 'pro', product_id: 'bes_9_aylik', store: 'admin', period_type: 'normal',
    active: true, will_renew: false, expires_at: null, units: 9 }), 'paket');
  // test-yeni: paketi YOK; deneme süresi hesabın açılışından başlar (30 gün). İstenirse sıfırlanır.
  if (process.env.TEST_YENI_SIFIRLA === '1') {
    must(await sb.from('subscriptions').delete().eq('user_id', u.yeni), 'test-yeni paketi');
    must(await sb.from('profiles').update({ created_at: new Date().toISOString(), landlord_since: null, extra_trial_days: 0 }).eq('id', u.yeni), 'deneme sıfırlama');
  }
  const stale = must(await sb.from('subscriptions').select('store, active').eq('user_id', u.yeni), 'test-yeni paket kontrolü');
  if (stale.length) console.log('Uyarı: test-yeni için abonelik satırı var (' + stale.map((x) => x.store).join(', ') + '); deneme durumu yerine abone görünür. Sıfırlamak için TEST_YENI_SIFIRLA=1.');

  // 2. Mülkler ve bağlı veriler (önce kendi kimliklerimiz silinir; ilişkili satırlar cascade ile gider)
  must(await sb.from('properties').delete().in('id', PROP_IDS), 'eski mülkler');
  const d = propertyData({ ...u, kiraci: null });   // kiracı hesabı daveti kabul edince açılır; ona bağlı satırlar aşağıda yazılır
  must(await sb.from('properties').insert(d.props), 'mülkler');
  await upload(`${P1}/dekont-ornek.pdf`, FILES.dekont());
  await upload(`${P1}/kira-sozlesmesi-ornek.pdf`, FILES.sozlesme());
  await upload(`${P2}/dekont-ornek.pdf`, FILES.dekont());
  await upload(`${P2}/dask-police-ornek.pdf`, FILES.dask());
  await upload(`site-${ORG_ID}/dekont-ornek.pdf`, FILES.dekont());

  // 3. Kiracı: gerçek davet koduyla katılır (handle_new_user doğrular, accept_invite'ın etkileri aşağıda yazılır)
  const inv = must(await sb.from('invites').insert({ property_id: P1, created_by: u.mulk, name: PEOPLE.kiraci.name, email: PEOPLE.kiraci.email,
    phone: PEOPLE.kiraci.phone, role: 'tenant' }).select('code').single(), 'davet');
  u.kiraci = await ensureUser(PEOPLE.kiraci, pw, inv.code);
  must(await sb.from('memberships').insert({ property_id: P1, user_id: u.kiraci, role: 'tenant', display_name: PEOPLE.kiraci.name,
    phone: PEOPLE.kiraci.phone, email: PEOPLE.kiraci.email }), 'kiracı üyeliği');
  must(await sb.from('invites').update({ accepted_by: u.kiraci, accepted_at: isoAgo(180) }).eq('code', inv.code), 'davet kabulü');
  // Şişli: kiracı davet etmiş ama hesabı yok (bekleyen davet)
  must(await sb.from('invites').insert({ property_id: P2, created_by: u.mulk, name: 'Ahmet Kaya', phone: '05000000121', role: 'tenant' }), 'bekleyen davet');

  const full = propertyData(u);
  must(await sb.from('payments').insert(full.payments), 'ödemeler');
  must(await sb.from('requests').insert(full.requests), 'talepler');
  must(await sb.from('messages').insert(full.messages), 'mesajlar');
  must(await sb.from('documents').insert(full.docs), 'belgeler');
  must(await sb.from('expenses').insert(full.expenses), 'giderler');

  // 4. Site: kurum, roller, master yönetici, daireler, sakinler
  must(await sb.from('organizations').delete().eq('id', ORG_ID), 'eski site');
  must(await sb.from('organizations').insert({ id: ORG_ID, name: 'Test Yeşilvadi Sitesi', sector: 'site', status: 'active', units: 20,
    modules: ['aidat', 'duyuru', 'gider_dagitim', 'rapor'], note: 'test-hesaplari.mjs tarafından açılan deneme sitesi' }), 'kurum');
  must(await sb.from('org_roles').insert(SITE_ROLES.map((r) => ({ org_id: ORG_ID, ...r }))), 'roller');
  must(await sb.from('org_members').insert({ org_id: ORG_ID, user_id: u.yonetici, role_id: null, is_master: true }), 'master yönetici');
  must(await sb.from('site_units').insert(SITE_UNITS.map((x, i) => ({ id: unitId(i), org_id: ORG_ID, block: x.block, no: x.no, area: x.area,
    share: Math.round(x.area) / 10, aidat: x.aidat, payer: x.payer }))), 'daireler');
  const people = [];
  SITE_UNITS.forEach((x, i) => x.res.forEach((r) => people.push({ org_id: ORG_ID, unit_id: unitId(i), role: r.role, lives_here: r.lives,
    ...(r.who === 'sakin' ? { name: PEOPLE.sakin.name, phone: PEOPLE.sakin.phone, email: PEOPLE.sakin.email, invited_at: isoAgo(30) }
      : { name: r.name, phone: r.phone, email: '', invited_at: null }) })));
  const made = must(await sb.from('site_residents').insert(people).select('id, code, email'), 'sakinler');
  const mine = made.find((r) => r.email === PEOPLE.sakin.email);
  // test-sakin: daire kodunu kullanarak açılır (signup_code_ok), sonra accept_site_invite'ın etkisi: kayıt hesaba bağlanır
  u.sakin = await ensureUser(PEOPLE.sakin, pw, mine.code);
  must(await sb.from('site_residents').update({ user_id: u.sakin }).eq('id', mine.id), 'sakin bağlama');

  // 5. Aidat, gider, duyuru, kasa, talep
  must(await sb.from('site_charges').insert(siteCharges(u, SITE_SAKIN_UNIT)), 'aidatlar');
  must(await sb.from('site_expenses').insert(siteExpenses(u)), 'site giderleri');
  must(await sb.from('site_announcements').insert(siteNotes(u)), 'duyurular');
  must(await sb.from('site_cash').upsert({ org_id: ORG_ID, opening: 40000, opening_on: dateOf(-2, 1) }), 'kasa');
  // Otomatik aidat (yeni sitede açık gelir) bu ayı zaten yazılmış sayılsın; sonraki ayları kendisi yazar.
  must(await sb.from('site_auto').update({ last_month: ymOf(0) }).eq('org_id', ORG_ID), 'otomatik aidat');
  must(await sb.from('site_requests').insert({ id: REQ_ID, org_id: ORG_ID, unit_id: unitId(SITE_SAKIN_UNIT), user_id: u.sakin, cat: 'ariza',
    title: 'Giriş katı koridor lambası yanmıyor', body: 'A blok girişindeki koridor lambası üç gündür yanmıyor, akşamları merdiven karanlık kalıyor.',
    status: 1, reply: '', created_at: isoAgo(4), updated_at: isoAgo(3) }), 'talep');
  // Talep yazışması: tetikleyici gönderen tarafı oturumdan belirler (service_role'de oturum yok); doğru gönderen ve zaman sonradan yazılır.
  must(await sb.from('site_request_messages').insert([
    { id: REQ_MSG(0), request_id: REQ_ID, org_id: ORG_ID, body: 'Teknik ekibe ilettik, bu hafta içinde lambayı değiştireceğiz.' },
    { id: REQ_MSG(1), request_id: REQ_ID, org_id: ORG_ID, body: 'Teşekkürler, haber bekliyorum.' }]), 'talep mesajları');
  must(await sb.from('site_request_messages').update({ user_id: u.yonetici, from_mgmt: true, created_at: isoAgo(3) }).eq('id', REQ_MSG(0)), 'talep mesajı 1');
  must(await sb.from('site_request_messages').update({ user_id: u.sakin, from_mgmt: false, created_at: isoAgo(2) }).eq('id', REQ_MSG(1)), 'talep mesajı 2');

  // 6. Tetikleyicilerin bu çalışmada beş hesaba açtığı bildirim satırları silinir (e-posta zaten kapalı; liste temiz başlasın)
  must(await sb.from('notifications').delete().in('user_id', Object.values(u)).gte('created_at', new Date(started).toISOString()), 'bildirim temizliği');

  console.log('\nTest hesapları hazır (hepsi @anahtar.io, e-posta onaylı, hoş geldin e-postası kapalı):');
  console.log('  Mülk sahibi    ' + PEOPLE.mulk.email + '      süresiz yönetici paketi; 3 mülk (kiracılı, geciken kiralı, boş)');
  console.log('  Kiracı         ' + PEOPLE.kiraci.email + '    Moda 2+1 dairesinin kiracısı (davet koduyla katılmış)');
  console.log('  Yeni kullanıcı ' + PEOPLE.yeni.email + '       paketsiz, 30 günlük deneme; 1 mülk (paywall / sandbox satın alma)');
  console.log('  Site yönetici  ' + PEOPLE.yonetici.email + '   Test Yeşilvadi Sitesi master yöneticisi (8 daire, 3 aylık aidat)');
  console.log('  Site sakini    ' + PEOPLE.sakin.email + '      A Blok No 3 dairesinin kiracısı');
  console.log('Şifre (beş hesap için aynı): ' + PW_SHOWN + ' dosyasında; ekrana yazılmaz.');
  console.log('E-posta, SMS ve rapor e-postaları bu hesaplarda kapalı (profiles.settings); Ayarlar → Bildirimler\'den açılabilir.\n');
}

/* ------------------------------------------------------------------ */
/* Kuru çalıştırma: yalnız okur                                                                          */
/* ------------------------------------------------------------------ */
async function kuru() {
  console.log('KURU ÇALIŞTIRMA: hiçbir şey yazılmaz.');
  for (const p of Object.values(PEOPLE)) console.log(`  hesap ${p.email}: ${(await findUser(p.email)) ? 'var (şifresi güncellenir, verisi yenilenir)' : 'yok (açılacak)'}`);
  const props = must(await sb.from('properties').select('id').in('id', PROP_IDS), 'mülkler');
  const org = must(await sb.from('organizations').select('id').eq('id', ORG_ID), 'kurum');
  console.log(`  silinip yeniden yazılacak: ${props.length} mülk (${PROP_IDS.length} kimlikten), ${org.length} site kurumu`);
  console.log('  şifre dosyası: ' + (readPassword() ? 'var (aynısı kullanılır)' : 'yok (rastgele üretilip yazılacak)') + ' → ' + PW_SHOWN);
  const e = expected();
  console.log(`  yazılacak: ${e.mulkProps} mülk sahibi mülkü, ${e.mulkPays} ödeme (mülk sahibi), ${e.siteUnits} daire, ${e.siteResidents} sakin kaydı, ${e.siteCharges} aidat, ${e.siteExpenses} gider, ${e.siteNotes} duyuru, 1 talep`);
}

/* ------------------------------------------------------------------ */
/* Doğrulama: gerçek girişle (yayınlanabilir anahtar), yalnız okur; yalnız sayılar yazılır                */
/* ------------------------------------------------------------------ */
async function dogrula() {
  const pw = readPassword();
  if (!pw) throw new Error('Şifre dosyası okunamadı: ' + PW_SHOWN);
  const e = expected();
  let bad = 0;
  const line = (who, what, got, want) => {
    const ok = want === undefined ? true : got === want;
    if (!ok) bad++;
    console.log(`  ${ok ? 'ok ' : 'HATA'} ${who.padEnd(10)} ${what.padEnd(26)} ${String(got).padStart(4)}${want === undefined ? '' : ok ? '' : '  (beklenen ' + want + ')'}`);
  };
  const login = async (p) => {
    const c = createClient(URL, KEY, opts);
    const r = await c.auth.signInWithPassword({ email: p.email, password: pw });
    if (r.error) { bad++; console.log(`  HATA ${p.email}: giriş başarısız (${r.error.message})`); return null; }
    return c;
  };
  const count = async (c, table) => { const r = await c.from(table).select('*', { count: 'exact', head: true }); if (r.error) throw new Error(table + ': ' + r.error.message); return r.count; };
  const access = async (c) => { const r = await c.rpc('my_access'); if (r.error) throw new Error('my_access: ' + r.error.message); return r.data; };

  console.log('DOĞRULAMA (gerçek giriş, yalnız okuma):');
  let c = await login(PEOPLE.mulk);
  if (c) {
    line('mülk sahibi', 'giriş', 'ok');
    line('mülk sahibi', 'mülk', await count(c, 'properties'), e.mulkProps);
    line('mülk sahibi', 'ödeme', await count(c, 'payments'), e.mulkPays);
    const a = await access(c);
    line('mülk sahibi', 'paket abone (admin)', a.subscribed ? 1 : 0, 1);
    line('mülk sahibi', 'mülk hakkı (units)', a.units, 9);
    await c.auth.signOut();
  }
  c = await login(PEOPLE.kiraci);
  if (c) {
    line('kiracı', 'mülk', await count(c, 'properties'), 1);
    line('kiracı', 'ödeme', await count(c, 'payments'), e.kiraciPays);
    await c.auth.signOut();
  }
  c = await login(PEOPLE.yeni);
  if (c) {
    const a = await access(c);
    line('yeni', 'mülk', await count(c, 'properties'), 1);
    line('yeni', 'abonelik satırı', await count(c, 'subscriptions'), 0);
    line('yeni', 'denemede (inTrial)', a.inTrial ? 1 : 0, 1);
    line('yeni', 'deneme günü kaldı', Math.max(0, Math.ceil((Date.parse(a.trialEnds) - Date.now()) / 864e5)));
    await c.auth.signOut();
  }
  c = await login(PEOPLE.yonetici);
  if (c) {
    const o = await c.rpc('my_orgs');
    line('yönetici', 'site (my_orgs)', (o.data || []).filter((x) => x.sector === 'site' && x.master).length, 1);
    line('yönetici', 'daire', await count(c, 'site_units'), e.siteUnits);
    line('yönetici', 'sakin kaydı', await count(c, 'site_residents'), e.siteResidents);
    line('yönetici', 'aidat tahakkuku', await count(c, 'site_charges'), e.siteCharges);
    line('yönetici', 'gider', await count(c, 'site_expenses'), e.siteExpenses);
    line('yönetici', 'duyuru', await count(c, 'site_announcements'), e.siteNotes);
    line('yönetici', 'talep', await count(c, 'site_requests'), 1);
    await c.auth.signOut();
  }
  c = await login(PEOPLE.sakin);
  if (c) {
    const m = await c.rpc('my_site_units');
    line('sakin', 'daire (my_site_units)', (m.data || []).length, 1);
    line('sakin', 'aidat tahakkuku', await count(c, 'site_charges'), e.sakinCharges);
    line('sakin', 'duyuru', await count(c, 'site_announcements'), e.siteNotes);
    line('sakin', 'talep', await count(c, 'site_requests'), 1);
    line('sakin', 'gider (görmemeli)', await count(c, 'site_expenses'), 0);
    await c.auth.signOut();
  }
  console.log(bad ? `\n${bad} kontrol başarısız.` : '\nTüm kontroller geçti.');
  if (bad) process.exitCode = 1;
}

(MODE === 'dogrula' ? dogrula() : MODE === 'kuru' ? kuru() : kur()).catch((e) => { console.error(e.message || e); process.exit(1); });
