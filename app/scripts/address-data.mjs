// Türkiye il / ilçe / mahalle verisi: `node scripts/address-data.mjs <turkey-neighbourhoods/src/data klasörü>`.
// Kaynak: npm "turkey-neighbourhoods" (MIT, PTT posta kodu listesinden üretilir). Yılda bir güncellemek yeterli.
// Çıktı: src/domain/places-tr.json (81 il + 973 ilçe; uygulamaya gömülü) ve public/adres/<il kodu>.json
// (ilçe → mahalle listesi; adres formunda il seçilince indirilir).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) { console.error('Kullanım: node scripts/address-data.mjs <turkey-neighbourhoods/src/data>'); process.exit(1); }
const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(join(src, f), 'utf8'));
const cmp = (a, b) => a.localeCompare(b, 'tr');
const FIRST = ['34', '06', '35'];                       // İstanbul, Ankara, İzmir en başta

const names = read('cityNamesByCode.json');
const districts = read('districtsByCityCode.json');
const hoods = read('neighbourhoodsByDistrictAndCityCode.json');
const code = (c) => String(c).padStart(2, '0');

const cities = Object.entries(names).map(([c, n]) => ({ code: code(c), name: n }))
  .sort((a, b) => (FIRST.includes(a.code) || FIRST.includes(b.code)
    ? (FIRST.indexOf(a.code) + 1 || 99) - (FIRST.indexOf(b.code) + 1 || 99)
    : cmp(a.name, b.name)));
const dist = Object.fromEntries(Object.entries(districts).map(([c, l]) => [code(c), [...new Set(l)].sort(cmp)]));
writeFileSync(join(HERE, '../src/domain/places-tr.json'), JSON.stringify({ cities, districts: dist }));

// "Bostancı Mah" → "Bostancı Mahallesi"; köy ve belde adları olduğu gibi.
const clean = (s) => s.replace(/ Mah(?=$| \()/, ' Mahallesi').replace(/\s+/g, ' ').trim();
const out = join(HERE, '../public/adres');
mkdirSync(out, { recursive: true });
let total = 0;
for (const [c, byDistrict] of Object.entries(hoods)) {
  const data = Object.fromEntries(Object.entries(byDistrict).map(([d, l]) => [d, [...new Set(l.map(clean))].sort(cmp)]));
  total += Object.values(data).reduce((a, l) => a + l.length, 0);
  writeFileSync(join(out, code(c) + '.json'), JSON.stringify(data));
}
writeFileSync(join(out, 'KAYNAK.txt'), 'İl, ilçe ve mahalle listesi: turkey-neighbourhoods (MIT, Murat Gözel), PTT posta kodu listesinden.\n');
console.log(`adres: ${cities.length} il, ${Object.values(dist).reduce((a, l) => a + l.length, 0)} ilçe, ${total} mahalle/köy`);
