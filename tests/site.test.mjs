// 공휴일 데이터 무결성 + 정적 사이트 점검 (링크, 메타, 비밀값, sitemap)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOLIDAYS } from '../assets/holidays.js';
import { weekdayOf, isValidDate } from '../assets/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['node_modules', '.git', 'tests', 'docs', 'scripts', '.github', 'dist', '_site']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(root);
const html = files.filter((f) => f.endsWith('.html'));

test('공휴일 데이터: 형식, 연도, 정렬, 중복 없음', () => {
  for (const [year, list] of Object.entries(HOLIDAYS)) {
    const dates = list.map(([d]) => d);
    assert.equal(new Set(dates).size, dates.length, `${year} 중복`);
    assert.deepEqual([...dates].sort(), dates, `${year} 정렬`);
    for (const [d, name, kind] of list) {
      assert.ok(isValidDate(d) && d.startsWith(year), d);
      assert.ok(name.length > 0);
      assert.ok(['holiday', 'substitute', 'labor'].includes(kind));
      if (kind === 'substitute') assert.ok(![0, 6].includes(weekdayOf(d)), `대체공휴일은 평일이어야 함 ${d}`);
    }
  }
  assert.equal(HOLIDAYS[2027].length, 24); // 월력요항: 국경일·대체공휴일 등 24일
  assert.equal(HOLIDAYS[2027].filter(([, , k]) => k === 'substitute').length, 7);
});

test('모든 HTML: lang, viewport, title, description', () => {
  for (const f of html) {
    const s = readFileSync(f, 'utf8');
    const rel = relative(root, f);
    assert.match(s, /<html lang="ko">/, rel);
    assert.match(s, /name="viewport"/, rel);
    assert.match(s, /<title>[^<]{4,}<\/title>/, rel);
    if (!rel.startsWith('404')) assert.match(s, /name="description" content="[^"]{20,}"/, rel);
  }
});

test('내부 링크와 리소스가 실제 파일로 존재', () => {
  for (const f of html) {
    const s = readFileSync(f, 'utf8');
    const refs = [...s.matchAll(/(?:href|src)="([^"#?]+)[^"]*"/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (/^(https?:|mailto:|data:)/.test(ref)) continue;
      let target;
      if (ref.startsWith('/yeonchagak/')) target = join(root, ref.slice('/yeonchagak/'.length));
      else target = resolve(dirname(f), ref);
      if (ref.endsWith('/') || existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html');
      assert.ok(existsSync(target), `${relative(root, f)} → ${ref}`);
    }
  }
});

test('sitemap의 모든 URL이 존재하는 페이지', () => {
  const xml = readFileSync(join(root, 'sitemap.xml'), 'utf8');
  const locs = [...xml.matchAll(/<loc>https:\/\/rolex0331-cloud\.github\.io\/yeonchagak\/([^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length >= 4);
  for (const l of locs) assert.ok(existsSync(join(root, l, 'index.html')), l);
});

test('배포 파일에 비밀값 형태의 문자열이 없다', () => {
  const pattern = /(gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[baprs]-[A-Za-z0-9-]{10,})/;
  for (const f of files.filter((x) => /\.(html|js|css|json|txt|xml|svg)$/.test(x))) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), pattern, relative(root, f));
  }
});

test('외부 요청 최소화: 앱 페이지는 외부 스크립트를 직접 로드하지 않는다', () => {
  const s = readFileSync(join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(s, /<script[^>]+src="https?:/);
});
