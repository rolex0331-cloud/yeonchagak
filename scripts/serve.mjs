// 로컬 정적 서버. GitHub Pages와 같은 경로(/yeonchagak/)로 제공하고 없는 경로는 404.html.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PREFIX = '/yeonchagak/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.ics': 'text/calendar' };

export function startServer(port = 0) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/' || url.pathname === '/yeonchagak') {
      res.writeHead(302, { location: PREFIX });
      return res.end();
    }
    let rel = url.pathname.startsWith(PREFIX) ? decodeURIComponent(url.pathname.slice(PREFIX.length)) : null;
    const send = async (file, code = 200) => {
      const body = await readFile(file);
      res.writeHead(code, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
      res.end(body);
    };
    try {
      if (rel === null) throw new Error('outside');
      let file = normalize(join(root, rel));
      if (!file.startsWith(root)) throw new Error('traversal');
      if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
      await stat(file);
      await send(file);
    } catch {
      await send(join(root, '404.html'), 404);
    }
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const s = await startServer(Number(process.env.PORT || 8080));
  console.log(`http://127.0.0.1:${s.address().port}/yeonchagak/`);
}
