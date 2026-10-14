// 엔진 계산 결과로 연도별 공휴일·꿀조합 정적 페이지와 sitemap.xml을 생성한다.
// 사용: node scripts/build-content.mjs  (결과물은 저장소에 커밋되어 정적으로 배포됨)
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { plan, formatRange, weekdayKo } from '../assets/engine.js';
import { HOLIDAYS, YEARS, DATA_VERIFIED_AT } from '../assets/holidays.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://rolex0331-cloud.github.io/yeonchagak/';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const md = (iso) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8))}일(${weekdayKo(iso)})`;
const short = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8))}(${weekdayKo(iso)})`;

const LOGO = readFileSync(join(root, 'assets', 'logo-inline.svg'), 'utf8').trim();
function header(prefix) {
  return `<header class="site-header"><div class="wrap header-in">
  <a class="logo" href="${prefix}" aria-label="징검 홈">${LOGO}</a>
  <nav class="nav" aria-label="주요 메뉴"><a href="${prefix}2027-holidays/">2027 공휴일</a><a href="${prefix}guide/">연차 규칙</a><a href="${prefix}about/">소개</a></nav>
</div></header>`;
}
function footer(prefix) {
  return `<footer class="site-footer"><div class="wrap">
  <p>공휴일 데이터 ${DATA_VERIFIED_AT} 확인 기준. 새로 지정된 임시공휴일은 반영 전까지 빠질 수 있어요.</p>
  <p class="foot-links"><a href="${prefix}">연차 계산기</a><a href="${prefix}about/#privacy">개인정보 안내</a><a href="${prefix}about/">소개·문의</a></p>
</div></footer>`;
}
export function page({ title, desc, path, body, prefix = '../' }) {
  const m = body.match(/^\s*(<h1>[\s\S]*?<\/h1>\s*<p class="lead">[\s\S]*?<\/p>)/);
  const top = m ? m[1] : '';
  const rest = m ? body.slice(m[0].length) : body;
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${BASE}${path}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${BASE}${path}">
<meta property="og:image" content="${BASE}assets/og.png">
<meta name="theme-color" content="#0D1726">
<link rel="icon" href="${prefix}assets/icon.svg" type="image/svg+xml">
<link rel="preload" href="${prefix}assets/fonts/pretendard-subset.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${prefix}assets/style.css">
</head>
<body>
<div class="doc-top">
${header(prefix)}
<div class="wrap doc">${top}</div>
</div>
<main class="wrap doc"><div class="doc-body">
${rest}
</div></main>
${footer(prefix)}
</body>
</html>
`;
}

function yearPage(year) {
  const list = HOLIDAYS[year];
  const r = plan({ start: `${year}-01-01`, end: `${year}-12-31`, budget: 15, minBreak: 4, maxLeavePerBreak: 5 }, HOLIDAYS);
  if (!r.ok) throw new Error(r.errors.join(', '));
  const realHolidays = list.filter(([d]) => ![0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay())).length;
  const subs = list.filter(([, , k]) => k === 'substitute').length;
  const rows = list
    .map(([d, n, k]) => `<tr><td>${md(d)}</td><td>${esc(n)}</td><td>${k === 'substitute' ? '대체공휴일' : k === 'labor' ? '노동절' : '공휴일'}</td></tr>`)
    .join('');
  const top = r.top.slice(0, 8);
  const topRows = top
    .map((w) => `<tr><td><b>${w.length}일</b></td><td>${formatRange(w)}</td><td>${w.cost}일<br><span class="muted">${w.leaveDays.map(short).join(', ')}</span></td><td>${esc(w.holidays.join(', ') || '주말 연결')}</td></tr>`)
    .join('');
  const longest = r.longest
    .map((w) => `<li>연차 <b>${w.cost}일</b> → <b>${w.length}일</b> 연휴: ${formatRange(w)} <span class="muted">(연차 ${w.leaveDays.map(short).join(', ')})</span></li>`)
    .join('');
  const planList = r.plan
    .map((w) => `<li>${formatRange(w)} — <b>${w.length}일</b> 휴식, 연차 ${w.cost}일 (${w.leaveDays.map(short).join(', ')})</li>`)
    .join('');
  const natural = r.natural.map((w) => `<li>${formatRange(w)} ${w.length}일 — ${esc(w.holidays.join(', '))}</li>`).join('');
  const best = r.top[0];
  const body = `
<h1>${year}년 공휴일 총정리와 연차 꿀조합</h1>
<p class="lead">${year}년 관공서 공휴일 ${list.length}일(대체공휴일 ${subs}일 포함) 중 평일에 해당하는 날은 ${realHolidays}일입니다. 아래 조합은 주 5일(토·일 휴무), 공휴일·대체공휴일·노동절에 모두 쉬는 직장을 기준으로 징검 계산기가 산출한 결과입니다.</p>
<p class="cta"><a class="btn primary" href="../?y=${year}&b=15&m=5&l=4">내 남은 연차로 다시 계산하기 →</a></p>
<p class="note">회사가 공휴일에 쉬지 않거나(5인 미만 사업장 등), 창립기념일·연차 불가 기간이 있다면 결과가 달라집니다. 계산기에서 조건을 바꾸면 그 기준으로 다시 계산됩니다.</p>

<h2>연차 효율이 가장 좋은 날짜</h2>
<p>가장 효율이 좋은 조합은 <b>${formatRange(best)}</b>로, 연차 ${best.cost}일로 ${best.length}일을 쉽니다.</p>
<div class="table-scroll"><table>
<thead><tr><th>연휴</th><th>기간</th><th>연차</th><th>포함 휴일</th></tr></thead>
<tbody>${topRows}</tbody></table></div>

<h2>연차를 몰아 쓰면 얼마나 쉴 수 있나</h2>
<ul>${longest}</ul>

<h2>연차 15일을 1년에 나눠 쓴다면</h2>
<p>4일 이상 연휴만 만들고, 한 번에 최대 5일까지 쓰면서 긴 연휴를 우선하는 배분입니다. 연차 ${r.planLeaveUsed}일로 연휴 ${r.plan.length}번, 총 ${r.planDaysOff}일을 쉽니다.</p>
<ol>${planList}</ol>

<h2>연차 없이 3일 이상 쉬는 연휴</h2>
<ul>${natural}</ul>

<h2>${year}년 공휴일 전체 목록</h2>
<div class="table-scroll"><table>
<thead><tr><th>날짜</th><th>이름</th><th>구분</th></tr></thead>
<tbody>${rows}</tbody></table></div>
<p class="help">출처: 우주항공청 '${year}년도 월력요항' 발표 내용(언론 보도)과 공개 공휴일 캘린더를 교차 확인 (${DATA_VERIFIED_AT}). 정부가 임시공휴일을 지정하면 바뀔 수 있습니다. 대체공휴일 기준은 <a href="../guide/">연차 규칙</a>을 참고하세요.</p>
<p class="cta"><a class="btn primary" href="../?y=${year}&b=15&m=5&l=4">내 조건으로 계산하기 →</a></p>
`;
  return page({
    title: `${year}년 공휴일·대체공휴일 총정리와 연차 꿀조합 | 징검`,
    desc: `${year}년 공휴일 ${list.length}일과 대체공휴일 ${subs}일 전체 목록, 연차 ${best.cost}일로 ${best.length}일 쉬는 ${formatRange(best)} 등 연차 효율 순위. 내 연차 일수로 바로 다시 계산할 수 있습니다.`,
    path: `${year}-holidays/`,
    body,
  });
}

function write(rel, content) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  console.log('wrote', rel);
}

const LAW = 'https://www.law.go.kr/';
const guideBody = `
<h1>연차·공휴일 규칙, 계산 전에 알아둘 것</h1>
<p class="lead">징검 계산 결과는 회사가 어떤 날을 쉬는지에 따라 달라집니다. 계산기의 체크 항목이 무엇을 뜻하는지 정리했습니다. 법률 상담이 아니며, 최종 기준은 회사 취업규칙과 법령 원문입니다.</p>

<h2>연차는 몇 일인가요?</h2>
<ul>
<li>1년간 80% 이상 출근하면 15일의 유급휴가가 생깁니다 (근로기준법 제60조 제1항).</li>
<li>입사 1년 미만이거나 1년간 80% 미만 출근했다면 1개월 개근 시 1일씩 생깁니다 (같은 조 제2항).</li>
<li>3년 이상 근속하면 최초 1년을 넘는 근속 2년마다 1일이 더해지고, 최대 25일입니다 (같은 조 제4항).</li>
<li>회사는 근로자가 청구한 시기에 연차를 줘야 하지만, 사업 운영에 막대한 지장이 있으면 시기를 바꿀 수 있습니다 (같은 조 제5항). 그래서 계산기에 <b>연차를 쓸 수 없는 기간</b> 설정이 있습니다.</li>
</ul>

<h2>'빨간 날(공휴일)에 쉰다' 체크</h2>
<p>상시 근로자 5인 이상 사업장은 관공서 공휴일과 대체공휴일을 유급휴일로 보장해야 합니다 (근로기준법 제55조 제2항). 5인 미만 사업장은 이 조항과 연차 조항(제60조)이 적용되지 않는 것으로 보도되고 있습니다. 회사가 공휴일에 근무한다면 이 체크를 끄세요. 그러면 주말만 쉬는 기준으로 다시 계산됩니다.</p>

<h2>대체공휴일</h2>
<p>설날·추석 연휴가 일요일과 겹치거나, 국경일(3·1절·제헌절·광복절·개천절·한글날)과 어린이날·부처님오신날·성탄절이 토요일 또는 일요일과 겹치면 그 다음 첫 번째 평일이 대체공휴일이 됩니다 (공휴일에 관한 법률, 관공서의 공휴일에 관한 규정). 2027년에는 대체공휴일이 7일 있습니다.</p>

<h2>노동절(5월 1일)과 제헌절</h2>
<p>2026년 4월 국무회의에서 노동절과 제헌절을 관공서 공휴일로 정하는 규정 개정안이 의결됐다고 보도됐습니다. 노동절의 사업장 규모별 적용, 휴일 대체 가능 여부는 자료마다 설명이 다르므로 회사 기준이나 고용노동부 상담(국번 없이 1350)으로 확인하세요. 회사가 노동절에 쉬지 않는다면 계산기의 '노동절에 쉰다'를 끄면 됩니다.</p>

<h2>임시공휴일</h2>
<p>정부가 임시공휴일을 새로 지정하면 징검은 공휴일 데이터 확인 후 반영합니다. 반영 전까지는 결과에 포함되지 않으니, 뉴스에서 임시공휴일 소식을 들었다면 계산기 고급 설정의 <b>회사 휴무일</b>에 직접 추가해 계산할 수 있습니다.</p>

<h2>법령 원문</h2>
<ul>
<li><a href="${LAW}법령/근로기준법" rel="noopener">근로기준법 (국가법령정보센터)</a></li>
<li><a href="${LAW}법령/공휴일에관한법률" rel="noopener">공휴일에 관한 법률</a></li>
<li><a href="${LAW}법령/관공서의공휴일에관한규정" rel="noopener">관공서의 공휴일에 관한 규정</a></li>
</ul>
<p class="cta"><a class="btn primary" href="../">내 조건으로 연차 계산하기 →</a></p>
`;

const aboutBody = `
<h1>징검 소개</h1>
<p class="lead">징검은 남은 연차를 공휴일·주말 사이 어디에 넣어야 가장 길게 쉴 수 있는지 계산하는 무료 웹 도구입니다.</p>

<h2>계산 방법</h2>
<ul>
<li>선택한 기간의 날짜를 근무일·주말·공휴일·회사 휴무일로 나눕니다.</li>
<li>연차로 근무일을 메웠을 때 앞뒤가 근무일로 막히는 '최대 연속 휴일' 후보를 모두 찾습니다 (최대 21일 길이).</li>
<li><b>추천 플랜</b>: 보유 연차 안에서 서로 겹치지 않는 연휴들을 골라 쉬는 날 합계가 가장 많아지도록 동적 계획법으로 계산합니다. 합계가 같으면 연차를 덜 쓰는 조합을 고릅니다.</li>
<li><b>연차 효율 TOP</b>: 연휴 길이 ÷ 사용 연차가 큰 순서입니다.</li>
<li>반차·시차 출퇴근, 교대 근무 일정은 아직 반영하지 않습니다.</li>
</ul>

<h2>공휴일 데이터</h2>
<p>우주항공청이 매년 발표하는 월력요항(언론 보도)과 공개 공휴일 캘린더를 교차 확인해 수록합니다. 현재 확인일: ${DATA_VERIFIED_AT}, 수록 연도: ${YEARS.join(', ')}년. 매주 자동 점검으로 공개 캘린더와 차이가 생기면 운영자에게 알림이 가고, 확인 후 반영합니다.</p>

<h2 id="privacy">개인정보 안내</h2>
<ul>
<li>회원가입이 없고, 입력한 연차 일수·날짜는 서버로 전송되지 않습니다. 계산은 모두 사용 중인 브라우저 안에서 이뤄집니다.</li>
<li>다음 방문 때 편하도록 마지막 설정을 이 브라우저의 로컬 저장소(localStorage)에만 저장합니다. 브라우저의 사이트 데이터 삭제로 지울 수 있습니다.</li>
<li>'결과 공유'를 누르면 설정값(연도, 연차 일수, 선택한 날짜)이 링크 주소에 담깁니다. 이름·연락처 같은 개인 정보는 담기지 않습니다.</li>
<li>방문 통계 도구를 쓰게 되면, 쿠키 없이 페이지 조회와 버튼 사용 횟수만 집계하는 방식으로 이 안내를 먼저 갱신합니다. 현재는 통계 도구를 사용하지 않습니다.</li>
<li>사이트는 GitHub Pages에서 호스팅되며, GitHub는 보안 목적으로 접속 IP를 기록할 수 있습니다 (<a href="https://docs.github.com/ko/site-policy/privacy-policies/github-general-privacy-statement" rel="noopener">GitHub 개인정보처리방침</a>).</li>
</ul>

<h2>여행 링크와 제휴 고지</h2>
<p>연휴 카드의 항공권·숙소 버튼은 해당 날짜가 입력된 트립닷컴 검색 결과로 연결됩니다. 제휴 프로그램에 승인되면 이 링크는 제휴 링크가 되며, 그때부터 모든 페이지 하단에 제휴 사실을 표시합니다. 이용자가 내는 가격은 같습니다. 현재는 제휴 링크가 아닌 일반 검색 링크입니다.</p>

<h2>문의·오류 제보</h2>
<p>공휴일 오류나 기능 제안은 <a href="https://github.com/rolex0331-cloud/yeonchagak/issues" rel="noopener">GitHub 이슈</a>로 남겨 주세요.</p>

<h2>면책</h2>
<p>계산 결과는 참고용입니다. 실제 연차 사용 가능 여부와 휴일은 회사 취업규칙·근로계약과 정부 발표를 따릅니다.</p>
<p class="cta"><a class="btn primary" href="../">연차 계산하기 →</a></p>
`;

write('index.html', readFileSync(join(root, 'scripts', 'index.template.html'), 'utf8').replace('{{LOGO}}', LOGO));
write('404.html', readFileSync(join(root, 'scripts', '404.template.html'), 'utf8').replace('{{LOGO}}', LOGO));

const yearPages = YEARS.filter((y) => y >= 2027);
for (const y of yearPages) write(`${y}-holidays/index.html`, yearPage(y));
write('guide/index.html', page({ title: '연차·공휴일·대체공휴일 규칙 정리 (5인 미만, 노동절) | 징검', desc: '연차 15일 발생 기준, 5인 미만 사업장의 공휴일, 대체공휴일 기준, 노동절·제헌절 공휴일 지정까지 연차 계획 전에 알아둘 규칙을 법령 출처와 함께 정리했습니다.', path: 'guide/', body: guideBody }));
write('about/index.html', page({ title: '징검 소개 · 계산 방법 · 개인정보 안내', desc: '징검의 연차 최적화 계산 방법, 공휴일 데이터 출처, 개인정보 처리와 제휴 고지 안내.', path: 'about/', body: aboutBody }));

const urls = ['', ...yearPages.map((y) => `${y}-holidays/`), 'guide/', 'about/'];
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${BASE}${u}</loc><lastmod>${DATA_VERIFIED_AT}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`
);
