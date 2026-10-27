// Bağımlılıksız statik sunucu: geliştirme ve testler için.
// Kullanım: node scripts/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const PORT = Number(process.argv[2] || process.env.PORT || 8000);

const TYPES = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json', '.webmanifest':'application/manifest+json',
  '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.txt':'text/plain; charset=utf-8'
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control':'no-store' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'content-type':'text/plain' }).end('Bulunamadı');
  }
}).listen(PORT, () => console.log('Kiracım → http://localhost:' + PORT));
