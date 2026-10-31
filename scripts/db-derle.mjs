// supabase/migrations/*.sql dosyalarından supabase/schema.sql'i üretir (testler ve SQL Editor ile elle kurulum bu dosyayı kullanır).
// Gerçek kaynak migration'lardır; schema.sql üretilmiş bir özettir, elle düzenlenmez.
//   node scripts/db-derle.mjs           → schema.sql'i yeniden yazar
//   node scripts/db-derle.mjs --kontrol → schema.sql güncel değilse hata ile çıkar (CI / test)
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const MIGRATIONS = join(ROOT, 'supabase/migrations');
export const SCHEMA = join(ROOT, 'supabase/schema.sql');
/** YYYYMMDDHHMMSS_ad.sql */
export const NAME = /^\d{14}_[a-z0-9_]+\.sql$/;

export function files(dir = MIGRATIONS) {
  return readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
}

/** Migration'ları sırayla birleştirir. Tek dosya varken (baseline) çıktı o dosyayla birebir aynıdır. */
export function build(dir = MIGRATIONS) {
  const list = files(dir);
  return list.map((f, i) => {
    const body = readFileSync(join(dir, f), 'utf8').replace(/\s+$/, '') + '\n';
    return i === 0 ? body : `\n-- ===== migration: ${f} =====\n` + body;
  }).join('');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = build();
  if (process.argv.includes('--kontrol')) {
    if (readFileSync(SCHEMA, 'utf8') !== out) { console.error('supabase/schema.sql güncel değil: `npm run db:derle` çalıştır.'); process.exit(1); }
    console.log('schema.sql güncel.');
  } else {
    writeFileSync(SCHEMA, out);
    console.log('schema.sql yazıldı (' + files().length + ' migration).');
  }
}
