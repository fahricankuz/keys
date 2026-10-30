// App Store ve Google Play inceleme ekibi için demo hesapları: bir mülk sahibi ve bir kiracı, örnek verilerle dolu bir mülk.
// İncelemeci giriş yapınca boş ekran görmez (mağaza kuralı: giriş gerektiren uygulamada çalışan demo hesap verilmelidir).
//
// Kullanım (bilgisayarında, depo kökünden):
//   SUPABASE_URL=https://<proje>.supabase.co SUPABASE_SERVICE_ROLE_KEY=<service_role> node app/scripts/inceleme-hesaplari.mjs
// İsteğe bağlı: DEMO_PASSWORD (verilmezse rastgele üretilir ve ekrana yazılır).
// service_role anahtarını asla depoya yazma; yalnızca bu komutu çalıştırırken ortam değişkeni olarak ver.
// Tekrar çalıştırmak güvenlidir: hesaplar varsa şifreleri güncellenir, örnek mülk yeniden kurulur.

import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli.'); process.exit(1); }
const PASSWORD = process.env.DEMO_PASSWORD || 'Inceleme-' + randomBytes(6).toString('hex');
const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const must = (r, what) => { if (r.error) throw new Error(what + ': ' + r.error.message); return r.data; };

const PEOPLE = [
  { email: 'inceleme-mulk@anahtar.io', name: 'Demo Mülk Sahibi', role: 'landlord' },
  { email: 'inceleme-kiraci@anahtar.io', name: 'Demo Kiracı', role: 'tenant' }
];

async function ensureUser(p) {
  // Hesap varsa şifresi güncellenir; yoksa e-postası onaylı olarak açılır (profil, kayıt tetikleyicisiyle oluşur).
  for (let page = 1; page < 50; page++) {
    const { users } = must(await sb.auth.admin.listUsers({ page, perPage: 200 }), 'kullanıcı listesi');
    const u = users.find((x) => x.email === p.email);
    if (u) { must(await sb.auth.admin.updateUserById(u.id, { password: PASSWORD, email_confirm: true }), 'şifre'); return u.id; }
    if (users.length < 200) break;
  }
  const { user } = must(await sb.auth.admin.createUser({ email: p.email, password: PASSWORD, email_confirm: true, user_metadata: { name: p.name, role: p.role } }), 'hesap');
  return user.id;
}

const ym = (d) => d.toISOString().slice(0, 7);
const day = (d) => d.toISOString().slice(0, 10);

async function main() {
  const [L, T] = [await ensureUser(PEOPLE[0]), await ensureUser(PEOPLE[1])];
  // Mülk sahibinin paketi süresiz açık olsun (inceleme deneme süresine takılmasın).
  must(await sb.from('subscriptions').upsert({ user_id: L, product_id: 'bes_3_aylik', store: 'admin', period_type: 'normal', active: true, will_renew: false, expires_at: null }), 'paket');
  // Hoş geldin e-postası demo hesaplara gitmesin.
  await sb.from('welcome_mail').upsert([{ user_id: L, kind: 'skip' }, { user_id: T, kind: 'skip' }]);

  const pid = 'demo-inceleme';
  await sb.from('properties').delete().eq('id', pid);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const end = new Date(now.getFullYear() + 1, now.getMonth() - 5, 1);
  must(await sb.from('properties').insert({ id: pid, owner_id: L, name: 'Moda Dairesi (demo)', addr: 'Kadıköy, İstanbul', rent: 25000, due_day: 5,
    deposit: 50000, start_date: day(start), contract_end: day(end), prop_type: 'Konut', aidat: 1500, aidat_payer: 'Kiracı' }), 'mülk');
  must(await sb.from('memberships').upsert({ property_id: pid, user_id: T, role: 'tenant', display_name: PEOPLE[1].name, email: PEOPLE[1].email }), 'kiracı üyeliği');

  // Son 4 ayın kirası ödenmiş ve onaylı; bu ay bekliyor.
  const pays = [];
  for (let i = 4; i >= 1; i--) {
    const m = new Date(now.getFullYear(), now.getMonth() - i, 1);
    pays.push({ property_id: pid, month: ym(m), kind: 'kira', status: 'approved', amount: 25000, paid_on: day(new Date(m.getFullYear(), m.getMonth(), 4)), receipt_name: 'dekont.pdf' });
  }
  must(await sb.from('payments').upsert(pays), 'ödemeler');
  must(await sb.from('requests').upsert({ id: 'demo-talep-1', property_id: pid, cat: 'Arıza', title: 'Mutfak musluğu damlatıyor', descr: 'İki gündür damlatıyor, conta değişmeli.',
    urgency: 'Normal', status: 1, cost: 'Mülk sahibi', req_date: day(new Date(now.getTime() - 3 * 864e5)), log: [{ at: Date.now() - 3 * 864e5, text: 'Talep açıldı' }] }), 'talep');
  must(await sb.from('messages').upsert([
    { id: 'demo-m1', property_id: pid, from_role: 'tenant', by_user: T, body: 'Merhaba, musluk için talep açtım.', at: new Date(now.getTime() - 3 * 864e5).toISOString() },
    { id: 'demo-m2', property_id: pid, from_role: 'landlord', by_user: L, body: 'Teşekkürler, yarın usta gelecek.', at: new Date(now.getTime() - 2 * 864e5).toISOString() }
  ]), 'mesajlar');

  console.log('\nİnceleme hesapları hazır (App Store Connect → App Review Information, Play Console → App access):');
  for (const p of PEOPLE) console.log(`  ${p.role === 'landlord' ? 'Mülk sahibi' : 'Kiracı    '}  ${p.email}  /  ${PASSWORD}`);
  console.log('Şifreyi bir yere not et; komutu yeniden çalıştırırsan (DEMO_PASSWORD vermezsen) değişir.\n');
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
