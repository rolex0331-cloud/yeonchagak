// 브라우저 E2E. 로컬 서버(기본) 또는 BASE_URL(배포 사이트)을 대상으로 실제 사용 과정을 검증한다.
// 필요: Chrome/Chromium 실행 파일 (CHROME_PATH 또는 기본 설치 경로)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { startServer } from '../scripts/serve.mjs';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));

let browser;
let server;
let BASE = process.env.BASE_URL;

before(async () => {
  if (!executablePath) throw new Error('Chrome 실행 파일을 찾지 못했습니다. CHROME_PATH를 지정하세요.');
  if (!BASE) {
    server = await startServer(0);
    BASE = `http://127.0.0.1:${server.address().port}/yeonchagak/`;
  }
  browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
});
after(async () => {
  await browser?.close();
  server?.close();
});

async function open(path = '', { width = 1280, height = 900, mobile = false, beforeLoad } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile });
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && !/favicon/.test(m.text()) && errors.push(m.text()));
  page.on('request', (r) => requests.push(r.url()));
  if (beforeLoad) await page.evaluateOnNewDocument(beforeLoad);
  const res = await page.goto(BASE + path, { waitUntil: 'networkidle0' });
  return { page, errors, requests, res };
}

const text = (page, sel) => page.$eval(sel, (el) => el.textContent);
const visible = (page, sel) => page.$eval(sel, (el) => !el.hidden && el.offsetParent !== null);

async function setBudget(page, v) {
  await page.$eval('#budget', (el, val) => {
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, String(v));
  await page.click('#run');
  await new Promise((r) => setTimeout(r, 150));
}

test('첫 방문: 기본 계산 결과가 보이고 오류·외부 요청이 없다', async () => {
  const { page, errors, requests } = await open('');
  assert.ok(await visible(page, '#results'));
  const summary = await text(page, '#summary');
  assert.match(summary, /연차 \d+일로 \d+번의 연휴, 총 \d+일 쉬어요/);
  assert.ok((await page.$$('#plan > li')).length >= 1);
  const origin = new URL(BASE).origin;
  assert.deepEqual(requests.filter((u) => !u.startsWith(origin) && !u.startsWith('data:')), []);
  assert.deepEqual(errors, []);
  await page.close();
});

test('연차 2일 → 2027 추석 9일 연휴와 날짜가 들어간 항공권 링크', async () => {
  const { page } = await open('?y=2027&b=15');
  await setBudget(page, 2);
  const first = await text(page, '#plan > li:first-child .pi-range');
  assert.match(first, /9\/11\(토\) ~ 9\/19\(일\)/);
  const href = await page.$eval('#plan > li:first-child [data-out=flight]', (a) => a.href);
  const u = new URL(href);
  assert.equal(u.searchParams.get('ddate'), '2027-09-11');
  assert.equal(u.searchParams.get('rdate'), '2027-09-19');
  // 목적지 변경 시 링크 갱신, 숙소 미지원 목적지는 숙소 버튼 숨김
  await page.select('#plan > li:first-child select', 'fuk');
  assert.equal(new URL(await page.$eval('#plan > li:first-child [data-out=flight]', (a) => a.href)).searchParams.get('acity'), 'fuk');
  assert.equal(await page.$eval('#plan > li:first-child [data-out=hotel]', (a) => a.hidden), true);
  await page.select('#plan > li:first-child select', 'tyo');
  assert.equal(await page.$eval('#plan > li:first-child [data-out=hotel]', (a) => a.hidden), false);
  // 주소창에 상태 반영 → 새로고침 후 유지
  assert.match(page.url(), /b=2/);
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('#budget', (el) => el.value), '2');
  await page.close();
});

test('빈 입력·범위 초과 입력은 오류 표시, 결과 숨김', async () => {
  const { page } = await open('');
  await page.$eval('#budget', (el) => (el.value = ''));
  await page.click('#run');
  assert.ok(await visible(page, '#errors'));
  assert.equal(await page.$eval('#results', (el) => el.hidden), true);
  await setBudget(page, 99);
  assert.match(await text(page, '#errors'), /최대 40일/);
  await setBudget(page, 0);
  assert.equal(await page.$eval('#errors', (el) => el.hidden), true);
  assert.match(await text(page, '#summary'), /찾지 못했어요/);
  await page.close();
});

test('공휴일에 쉬지 않는 회사: 연차 없이 쉬는 연휴 없음', async () => {
  const { page } = await open('?y=2027&b=15');
  await page.click('#holidaysOff');
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(await page.$eval('#substituteOff', (el) => el.disabled), true);
  await page.click('#tab-natural');
  assert.match(await text(page, '#panel'), /해당하는 연휴가 없습니다/);
  assert.match(page.url(), /h=0/);
  await page.close();
});

test('고급 설정: 9월 연차 불가 → 9월에 연차 배치 안 함, 태그 삭제 가능', async () => {
  const { page } = await open('?y=2027&b=15');
  await page.click('#advanced summary');
  await page.$eval('#bo-start', (el) => (el.value = '2027-09-01'));
  await page.$eval('#bo-end', (el) => (el.value = '2027-09-30'));
  await page.click('[data-add=blackout]');
  await new Promise((r) => setTimeout(r, 150));
  const chips = await page.$$eval('#plan .chip', (els) => els.map((e) => e.textContent));
  assert.ok(chips.length > 0);
  assert.ok(chips.every((c) => !c.startsWith('9/')), chips.join(','));
  assert.equal((await page.$$('#blackout-list li')).length, 1);
  await page.click('#blackout-list button');
  assert.equal((await page.$$('#blackout-list li')).length, 0);
  await page.close();
});

test('캘린더(.ics) 파일이 실제로 저장된다', async () => {
  const { page } = await open('?y=2027&b=2');
  const dir = mkdtempSync(join(tmpdir(), 'ycg-'));
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
  await page.click('#dl-ics');
  let file;
  for (let i = 0; i < 40 && !file; i++) {
    await new Promise((r) => setTimeout(r, 100));
    file = readdirSync(dir).find((f) => f.endsWith('.ics'));
  }
  assert.ok(file, 'ics 파일 없음');
  const ics = readFileSync(join(dir, file), 'utf8');
  assert.match(ics, /DTSTART;VALUE=DATE:20270911/);
  assert.match(await text(page, '#toast'), /캘린더 파일을 저장했어요/);
  await page.close();
});

test('공유·복사 버튼은 결과 메시지를 보여 준다 (가짜 성공 없음)', async () => {
  const { page } = await open('?y=2027&b=2');
  await page.evaluate(() => {
    delete Navigator.prototype.share;
  });
  await page.click('#copy-request');
  await page.waitForFunction(() => !document.getElementById('toast').hidden);
  const t = await text(page, '#toast');
  assert.match(t, /복사했어요|복사에 실패했습니다/);
  await page.close();
});

test('localStorage가 막혀도 동작한다', async () => {
  const { page, errors } = await open('', {
    beforeLoad: () => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    },
  });
  assert.ok(await visible(page, '#results'));
  assert.deepEqual(errors, []);
  await page.close();
});

test('모바일(375px): 가로 스크롤 없음, 주요 버튼 터치 크기 확보', async () => {
  const { page } = await open('?y=2027&b=15', { width: 375, height: 812, mobile: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `overflow ${overflow}px`);
  const h = await page.$eval('#run', (b) => b.getBoundingClientRect().height);
  assert.ok(h >= 44);
  for (const p of ['2027-holidays/', 'guide/', 'about/']) {
    await page.goto(BASE + p, { waitUntil: 'networkidle0' });
    const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(o <= 0, `${p} overflow ${o}px`);
  }
  await page.close();
});

test('콘텐츠 페이지와 404', async () => {
  for (const p of ['2027-holidays/', 'guide/', 'about/']) {
    const { page, res, errors } = await open(p);
    assert.equal(res.status(), 200, p);
    assert.ok((await text(page, 'h1')).trim().length >= 4);
    assert.deepEqual(errors, []);
    await page.close();
  }
  const { page, res } = await open('no-such-page/');
  assert.equal(res.status(), 404);
  assert.match(await text(page, 'h1'), /운항하지 않아요/);
  await page.close();
});

test('제휴·측정 설정을 넣으면: 고지 표시, 링크에 파라미터, 이벤트에 입력값 미포함', async () => {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  const counted = [];
  await page.exposeFunction('__count', (v) => counted.push(v));
  page.on('request', async (req) => {
    const url = req.url();
    if (url.endsWith('/assets/config.js')) {
      const res = await fetch(url);
      let body = await res.text();
      body = body.replace('params: {}', "params: { Allianceid: 'TESTAID', SID: 'TESTSID' }").replace("goatcounterCode: ''", "goatcounterCode: 'test'");
      return req.respond({ status: 200, contentType: 'text/javascript', body });
    }
    if (url.startsWith('https://gc.zgo.at/')) {
      return req.respond({ status: 200, contentType: 'text/javascript', body: 'window.goatcounter={count:(o)=>window.__count(JSON.stringify(o))};' });
    }
    req.continue();
  });
  await page.goto(BASE + '?y=2027&b=2', { waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('#aff-note', (el) => el.hidden), false);
  assert.match(await text(page, '#aff-note'), /제휴 링크/);
  const a = await page.$eval('#plan > li:first-child [data-out=flight]', (el) => ({ href: el.href, rel: el.rel }));
  assert.equal(new URL(a.href).searchParams.get('Allianceid'), 'TESTAID');
  assert.match(a.rel, /sponsored/);
  await page.click('#dl-ics');
  await page.click('#holidaysOff');
  await new Promise((r) => setTimeout(r, 300));
  const paths = counted.map((c) => JSON.parse(c).path);
  assert.ok(paths.includes('event/ics_download'), paths.join(','));
  assert.ok(paths.includes('event/plan_run'), paths.join(','));
  assert.ok(counted.every((c) => !/2027-|\d{4}-\d{2}-\d{2}/.test(c)), '이벤트에 날짜·입력값 없음');
  await page.close();
});

test('연차가 없어요 모드: 빨간 날 연휴를 탑승권으로, 연차 입력은 숨김, 링크 유지', async () => {
  const { page, errors } = await open('?y=2027&b=15');
  await page.click('input[name=mode][value=free]');
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(await page.$eval('.q', (el) => getComputedStyle(el).display), 'none');
  assert.match(await text(page, '#summary'), /연차 없이 \d+번의 연휴, 총 \d+일 쉬어요/);
  const ranges = await page.$$eval('#plan .pi-range', (els) => els.map((e) => e.textContent));
  assert.ok(ranges.some((r) => /9\/14\(화\) ~ 9\/16\(목\)/.test(r)), ranges.join(' | '));
  assert.match(page.url(), /mode=free/);
  await page.reload({ waitUntil: 'networkidle0' });
  assert.equal(await page.$eval('input[name=mode][value=free]', (el) => el.checked), true);
  assert.deepEqual(errors, []);
  await page.close();
});

test('탑승권 여행 정보: 그 달 평년 기온·비행·시차, 추천 칩으로 목적지 변경', async () => {
  const { page } = await open('?y=2027&b=2');
  const facts = await text(page, '#plan > li:first-child [data-facts]');
  assert.match(facts, /9월 날씨/);
  assert.match(facts, /직항 \d시간대/);
  assert.match(facts, /시차/);
  const chip = await page.$('#plan > li:first-child [data-pick]:not(.on)');
  if (chip) {
    const id = await chip.evaluate((b) => b.dataset.pick);
    await chip.click();
    assert.equal(await page.$eval('#plan > li:first-child select', (s) => s.value), id);
    assert.equal(new URL(await page.$eval('#plan > li:first-child [data-out=flight]', (a) => a.href)).searchParams.get('acity'), id);
  }
  // 도쿄 9월 평년값(JMA): 최고 27.5 → 28°, 최저 20.3 → 20°
  await page.select('#plan > li:first-child select', 'tyo');
  assert.match(await text(page, '#plan > li:first-child [data-facts]'), /28° \/ 20°/);
  await page.close();
});
