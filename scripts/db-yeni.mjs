// Yeni migration dosyası açar: supabase/migrations/<UTC zaman damgası>_<ad>.sql ve schema.sql'i günceller.
//   npm run db:yeni -- kullanici_silme
import { writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { MIGRATIONS, NAME, build, SCHEMA } from './db-derle.mjs';

const TR = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
export const slug = (s) => String(s).toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (c) => TR[c]).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
export const stamp = (d = new Date()) => d.toISOString().replace(/[-:T]/g, '').slice(0, 14);

export function yeni(ad, dir = MIGRATIONS, now = new Date()) {
  const s = slug(ad);
  if (!s) throw new Error('Ad gerekli: npm run db:yeni -- kisa_aciklama');
  const file = `${stamp(now)}_${s}.sql`;
  if (!NAME.test(file)) throw new Error('Geçersiz ad: ' + file);
  const path = join(dir, file);
  if (existsSync(path)) throw new Error('Bu migration zaten var: ' + file);
  writeFileSync(path, `-- ${s.replace(/_/g, ' ')}
-- Yeniden çalıştırılabilir yaz (if not exists / create or replace / drop ... if exists): schema.sql testlerde iki kez çalıştırılır.
-- Yeni tabloda RLS'i aynı dosyada aç, politikaları aynı dosyada yaz. Dışarıdan çağrılan işlevi tests/qa-db.spec.mjs izin listesine ekle.

`);
  return file;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const file = yeni(process.argv.slice(2).join(' '));
    writeFileSync(SCHEMA, build());
    console.log('Oluşturuldu: supabase/migrations/' + file + '\nschema.sql güncellendi.');
  } catch (e) { console.error(e.message); process.exit(1); }
}
