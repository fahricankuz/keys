// Yük testi (k6): aynı anda çok kullanıcı mesaj yazıp son mesajları okuyunca sunucu ne kadar dayanıyor?
// ASLA canlı projeye karşı çalıştırma: ayrı bir deneme (staging) Supabase projesi kur ve oraya karşı çalıştır.
//
// Hazırlık (deneme projesinde):
//   1. supabase/schema.sql'i çalıştır.
//   2. 2 hesap aç (mülk sahibi + kiracı), bir mülk ekle, kiracıyı davet kodu ile bağla.
//   3. Aşağıdaki ortam değişkenlerini ver.
//
// Çalıştırma (k6 kurulu olmalı: https://k6.io/docs/get-started/installation/):
//   k6 run \
//     -e SUPABASE_URL=https://DENEME.supabase.co -e ANON_KEY=sb_publishable_... \
//     -e EMAIL=kiraci@ornek.com -e PASSWORD=... -e PROPERTY_ID=p_... \
//     yuk/mesajlasma.k6.js
//
// Eşikler (thresholds): istek hatası %1'in altında, mesaj okuma p95 < 800 ms, yazma p95 < 1200 ms. Aşılırsa k6 "başarısız" döner.
import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

export const options = {
  stages: [
    { duration: '30s', target: 20 },     // ısınma
    { duration: '1m', target: 100 },     // 100 eşzamanlı kullanıcı
    { duration: '30s', target: 0 }
  ],
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{kind:read}': ['p(95)<800'],
    'http_req_duration{kind:write}': ['p(95)<1200']
  }
};

const URL = __ENV.SUPABASE_URL, KEY = __ENV.ANON_KEY, PID = __ENV.PROPERTY_ID;

export function setup() {
  const r = http.post(`${URL}/auth/v1/token?grant_type=password`, JSON.stringify({ email: __ENV.EMAIL, password: __ENV.PASSWORD }),
    { headers: { apikey: KEY, 'content-type': 'application/json' } });
  check(r, { 'giriş yapıldı': (x) => x.status === 200 });
  return { token: r.json('access_token'), uid: r.json('user.id') };
}

export default function (d) {
  const h = { apikey: KEY, authorization: `Bearer ${d.token}`, 'content-type': 'application/json' };
  // Okuma: uygulamanın girişte yaptığı sorgu (son 30 mesaj).
  const read = http.post(`${URL}/rest/v1/rpc/recent_messages`, JSON.stringify({ pids: [PID], lim: 30 }), { headers: h, tags: { kind: 'read' } });
  check(read, { 'mesajlar okundu': (x) => x.status === 200 });
  // Yazma: bir mesaj gönder.
  const write = http.post(`${URL}/rest/v1/messages`, JSON.stringify({ id: 'k6_' + uuidv4(), property_id: PID, from_role: 'tenant', by_user: d.uid, body: 'yük testi ' + Date.now() }),
    { headers: { ...h, prefer: 'return=minimal' }, tags: { kind: 'write' } });
  check(write, { 'mesaj yazıldı': (x) => x.status === 201 });
  sleep(1 + Math.random() * 2);
}
