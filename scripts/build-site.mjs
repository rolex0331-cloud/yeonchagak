// 배포용 _site 폴더 구성 (공개할 파일만 복사)
import { cpSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '_site');
const PUBLIC = ['index.html', '404.html', 'robots.txt', 'sitemap.xml', 'assets', 'guide', 'about', ...readdirSync(root).filter((n) => /^\d{4}-holidays$/.test(n))];
rmSync(out, { recursive: true, force: true });
mkdirSync(out);
for (const p of PUBLIC) cpSync(join(root, p), join(out, p), { recursive: true });
console.log('built _site:', PUBLIC.join(', '));
