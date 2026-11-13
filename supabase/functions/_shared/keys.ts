// anahtar — Supabase istemcileri (Edge Function'lar). Anahtarlar _shared/key-env.ts üzerinden okunur:
// SUPABASE_SECRET_KEYS / SUPABASE_PUBLISHABLE_KEYS (yeni), yoksa SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY (eski).
// Bu dosya npm: bağımlılığı içerdiği için log.ts tarafından değil, fonksiyonların index.ts dosyalarından içe aktarılır.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { publishableKey, secretKey } from './key-env.ts';

export { apiKeyHeaders, isOpaqueKey, publishableKey, secretKey } from './key-env.ts';

const url = () => Deno.env.get('SUPABASE_URL') ?? '';

/** RLS'i aşan sunucu istemcisi (gizli anahtar). Yalnız fonksiyonun içinde, yetki denetiminden sonra kullanılır. */
export function serviceClient() {
  return createClient(url(), secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Çağıranın oturumuyla çalışan istemci: yetkiyi RLS ve veritabanı işlevleri denetler. */
export function userClient(authorization: string) {
  return createClient(url(), publishableKey(), {
    global: { headers: { authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
