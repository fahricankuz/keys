// Site dosyalarını (.htaccess dahil) dist/ klasörüne kopyalar; package.json ve build.mjs hariç.
import { cpSync, readdirSync, rmSync } from 'node:fs';
const skip = new Set(['dist', 'node_modules', '.git', 'package.json', 'package-lock.json', 'build.mjs']);
rmSync('dist', { recursive: true, force: true });
for (const f of readdirSync('.')) if (!skip.has(f)) cpSync(f, `dist/${f}`, { recursive: true });
console.log('Site hazır: dist/');
