import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const DIST = path.resolve(import.meta.dirname, '..', 'dist');
const PORT = process.env.PORT || 4173;
let BASE = (process.env.BASE_PATH || '').trim().replace(/\/+$/, '');
if (BASE === '/') BASE = '';
if (BASE && !BASE.startsWith('/')) BASE = '/' + BASE;
const TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript',
  '.webp':'image/webp', '.xml':'application/xml', '.txt':'text/plain', '.json':'application/json' };

createServer(async (req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (BASE && (url === BASE || url.startsWith(BASE + '/'))) url = url.slice(BASE.length) || '/';
  let p = path.join(DIST, url);
  try {
    let s = await stat(p).catch(() => null);
    if (s?.isDirectory()) { p = path.join(p, 'index.html'); s = await stat(p); }
    if (!s) { const alt = p + '.html'; if (await stat(alt).catch(() => null)) p = alt; else throw 0; }
    const body = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    const body = await readFile(path.join(DIST, '404.html')).catch(() => 'Not found');
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  }
}).listen(PORT, () => console.log(`serving dist/ on http://localhost:${PORT}${BASE}/`));
