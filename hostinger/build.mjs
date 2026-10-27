// Derlenmiş site (site/) çıktı klasörüne (dist/) kopyalanır. Bağımlılık yok; .htaccess gibi gizli dosyalar da kopyalanır.
import { cpSync, existsSync, rmSync } from 'node:fs';
if (!existsSync('site/index.html')) throw new Error('site/index.html yok');
rmSync('dist', { recursive: true, force: true });
cpSync('site', 'dist', { recursive: true });
console.log('Site hazır: dist/');
