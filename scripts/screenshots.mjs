// 화면 캡처 (검증 기록용): node scripts/screenshots.mjs [BASE_URL]
import puppeteer from 'puppeteer-core';
import { existsSync } from 'node:fs';
import { startServer } from './serve.mjs';
const exe = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].filter(Boolean).find((p) => existsSync(p));
let server;
let base = process.argv[2];
if (!base) { server = await startServer(0); base = `http://127.0.0.1:${server.address().port}/yeonchagak/`; }
const out = process.argv[3] || 'docs/screenshots';
const b = await puppeteer.launch({ executablePath: exe, headless: true });
const shots = [
  ['desktop-home', '?y=2027&b=15', 1280, 900, false, true],
  ['mobile-home', '?y=2027&b=15', 390, 844, true, false],
  ['mobile-results', '?y=2027&b=2', 390, 844, true, 'results'],
  ['desktop-2027', '2027-holidays/', 1280, 900, false, false],
];
for (const [name, path, w, h, mobile, full] of shots) {
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h, isMobile: mobile, deviceScaleFactor: 1 });
  await p.goto(base + path, { waitUntil: 'networkidle0' });
  if (full === 'results') { await p.$eval('#results', (e) => e.scrollIntoView()); }
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: full === true });
  await p.close();
}
await b.close(); server?.close();
console.log('done');
