import { plan, formatRange, toICS, leaveRequestText, weekdayKo, toDayNum, fromDayNum } from './engine.js';
import { HOLIDAYS, YEARS, DATA_VERIFIED_AT } from './holidays.js';
import { defaultState, encodeState, decodeState } from './state.js';
import { DESTINATIONS, ORIGINS, AFFILIATE, affiliateEnabled, ANALYTICS } from './config.js';
import { flightUrl, hotelUrl } from './links.js';
import { PLACES, climate, recommend, tzText } from './places.js';

const $ = (id) => document.getElementById(id);
const STORE_KEY = 'yeonchagak:v1';

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const TODAY = localToday();

// ---- 측정: 설정된 경우에만 GoatCounter 이벤트 전송 (입력값·날짜는 보내지 않음)
function track(name) {
  if (!ANALYTICS.goatcounterCode) return;
  try {
    window.goatcounter?.count?.({ path: `event/${name}`, title: name, event: true });
  } catch {
    /* 측정 실패는 무시 */
  }
}
if (ANALYTICS.goatcounterCode) {
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://gc.zgo.at/count.js';
  s.dataset.goatcounter = `https://${ANALYTICS.goatcounterCode}.goatcounter.com/count`;
  document.head.appendChild(s);
}

// ---- 저장소 (실패해도 동작)
const store = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    } catch {
      return null;
    }
  },
  set(v) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(v));
    } catch {
      /* 사생활 보호 모드 등 */
    }
  },
};

const base = defaultState(TODAY, YEARS);
let state = decodeState(location.search, base) || { ...base, ...(store.get() || {}) };
if (!YEARS.includes(state.year)) state.year = base.year;
let result = null;
let currentTab = 'top';

const isFree = () => state.mode === 'free';
const passes = () => (result ? (isFree() ? result.natural : result.plan) : []);

function applyMode() {
  document.body.classList.toggle('mode-free', isFree());
  $('toggles-legend').textContent = isFree() ? '나는' : '우리 회사는';
}

function rangeFor(s) {
  const yStart = `${s.year}-01-01`;
  const yEnd = `${s.year}-12-31`;
  let start = s.start || (s.year === Number(TODAY.slice(0, 4)) && TODAY > yStart ? TODAY : yStart);
  let end = s.end || yEnd;
  return { start, end };
}

// ---- 폼 ↔ 상태
function fillForm() {
  const ysel = $('year');
  ysel.innerHTML = YEARS.map((y) => `<option value="${y}">${y}년${y === Number(TODAY.slice(0, 4)) ? ' (남은 기간)' : ''}</option>`).join('');
  ysel.value = String(state.year);
  $('budget').value = state.budget;
  $('maxLeavePerBreak').value = String(state.maxLeavePerBreak);
  if (!$('maxLeavePerBreak').value) $('maxLeavePerBreak').value = '5';
  $('minBreak').value = String(state.minBreak);
  if (!$('minBreak').value) $('minBreak').value = '4';
  document.querySelectorAll('input[name=goal]').forEach((r) => (r.checked = r.value === (state.goal || 'long')));
  document.querySelectorAll('input[name=mode]').forEach((r) => (r.checked = r.value === (state.mode || 'leave')));
  document.querySelectorAll('input[name=origin]').forEach((r) => (r.checked = r.value === (state.origin || 'sel')));
  applyMode();
  $('holidaysOff').checked = state.holidaysOff;
  $('substituteOff').checked = state.substituteOff;
  $('laborOff').checked = state.laborOff;
  $('start').value = state.start || '';
  $('end').value = state.end || '';
  renderTags();
  if (state.extraOff.length || state.fixedLeave.length || state.blackout.length || state.start || state.end) $('advanced').open = true;
}

function readForm() {
  const raw = $('budget').value.trim();
  state.year = Number($('year').value);
  state.budget = raw === '' ? NaN : Number(raw);
  state.maxLeavePerBreak = Number($('maxLeavePerBreak').value);
  state.minBreak = Number($('minBreak').value);
  state.goal = document.querySelector('input[name=goal]:checked')?.value || 'long';
  state.mode = document.querySelector('input[name=mode]:checked')?.value || 'leave';
  state.holidaysOff = $('holidaysOff').checked;
  state.substituteOff = $('substituteOff').checked;
  state.laborOff = $('laborOff').checked;
  state.start = $('start').value || null;
  state.end = $('end').value || null;
}

function renderTags() {
  const fmt = (d) => `${d.slice(2).replace(/-/g, '.')}(${weekdayKo(d)})`;
  const item = (label, key, idx) =>
    `<li>${label}<button type="button" data-remove="${key}" data-idx="${idx}" aria-label="${label} 삭제">×</button></li>`;
  $('fixedLeave-list').innerHTML = state.fixedLeave.map((d, i) => item(fmt(d), 'fixedLeave', i)).join('');
  $('extraOff-list').innerHTML = state.extraOff.map((d, i) => item(fmt(d), 'extraOff', i)).join('');
  $('blackout-list').innerHTML = state.blackout.map((r, i) => item(`${fmt(r.start)}~${fmt(r.end)}`, 'blackout', i)).join('');
}

function showErrors(list) {
  const box = $('errors');
  if (!list.length) {
    box.hidden = true;
    box.textContent = '';
    return;
  }
  box.hidden = false;
  box.innerHTML = list.map((e) => `<p>${escapeHtml(e)}</p>`).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// ---- 계산
function run({ scroll = false, userAction = false } = {}) {
  readForm();
  const { start, end } = rangeFor(state);
  if (end < start) {
    showErrors([`${state.year}년은 남은 기간이 없습니다. 다른 연도를 선택하세요.`]);
    $('results').hidden = true;
    return;
  }
  result = plan(
    {
      start,
      end,
      budget: isFree() ? 0 : state.budget,
      minBreak: state.minBreak,
      maxLeavePerBreak: state.maxLeavePerBreak,
      goal: state.goal,
      holidaysOff: state.holidaysOff,
      substituteOff: state.substituteOff,
      laborOff: state.laborOff,
      extraOff: state.extraOff,
      fixedLeave: isFree() ? [] : state.fixedLeave,
      blackout: isFree() ? [] : state.blackout,
    },
    HOLIDAYS
  );
  if (!result.ok) {
    showErrors(result.errors);
    $('results').hidden = true;
    return;
  }
  showErrors([]);
  store.set(state);
  const qs = encodeState(state);
  history.replaceState(null, '', `${location.pathname}?${qs}`);
  render();
  $('results').hidden = false;
  if (userAction && !run._tracked) {
    run._tracked = true; // 조건을 직접 바꿔 계산한 방문을 1회만 집계
    track('plan_run');
  }
  if (scroll) $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const WEEK_FULL = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const md = (iso) => `${Number(iso.slice(5, 7))}.${String(Number(iso.slice(8))).padStart(2, '0')}`;
const mdSlash = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8))}`;
const flightCode = (w) => `JG ${w.start.slice(5, 7)}${w.start.slice(8)}`;
const effText = (w) => (w.length / w.cost).toFixed(1).replace(/\.0$/, '');
const relOpts = () => `noopener${affiliateEnabled() ? ' sponsored' : ''}`;

function render() {
  const r = result;
  const { start, end } = rangeFor(state);
  const s = $('summary');
  const fixedNote = r.fixedLeaveCount ? ` · 확정 연차 ${r.fixedLeaveCount}일 제외 후 ${r.budgetAfterFixed}일 기준` : '';
  const list = passes();
  if (isFree()) {
    const total = list.reduce((a, w) => a + w.length, 0);
    s.innerHTML = list.length
      ? `<p class="kicker">${state.year} 빨간 날 연휴</p><p class="big">연차 없이 <b>${list.length}번</b>의 연휴, 총 <b>${total}일</b> 쉬어요</p><p class="hint">${start} ~ ${end} · 3일 이상 이어지는 휴일만 모았어요</p>`
      : `<p class="kicker">${state.year} 빨간 날 연휴</p><p class="big">남은 기간에 3일 이상 연휴가 없어요</p><p class="hint">다른 연도를 선택해 보세요.</p>`;
  } else if (!r.plan.length) {
    s.innerHTML = `<p class="kicker">${state.year} 연휴 계획</p><p class="big">조건에 맞는 연휴를 찾지 못했어요</p>
      <p class="hint">${start} ~ ${end}, 연차 ${r.budgetAfterFixed}일${fixedNote}. '연휴로 칠 최소 길이'를 줄이거나 '한 번에 쓸 최대 연차'를 늘려 보세요.</p>`;
  } else {
    s.innerHTML = `<p class="kicker">${state.year} 연휴 계획</p><p class="big">연차 <b>${r.planLeaveUsed}일</b>로 <b>${r.plan.length}번</b>의 연휴, 총 <b>${r.planDaysOff}일</b> 쉬어요</p>
      <p class="hint">${start} ~ ${end} · 사용 가능 연차 ${r.budgetAfterFixed}일${fixedNote}${r.leftover > 0 ? ` · 남는 연차 ${r.leftover}일은 원하는 날에` : ''}</p>`;
  }
  $('plan').innerHTML = list.map((w, i) => planCard(w, i)).join('');
  list.forEach((_, i) => updateTravel(i));
  renderBoard();
  renderPanel();
  renderMonths(start, end);
}

function renderBoard() {
  const r = result;
  const list = (passes().length ? passes() : r.top).slice().sort((a, b) => b.length - a.length).slice(0, 6).sort((a, b) => a.start.localeCompare(b.start));
  const longest = Math.max(0, ...list.map((w) => w.length));
  const key = list.map((w) => w.start + w.end).join('|');
  const changed = renderBoard._key !== undefined && renderBoard._key !== key;
  renderBoard._key = key;
  $('board').innerHTML = list.length
    ? list
        .map((w, i) => {
          const st = w.length === longest ? '<span class="st">최장 연휴</span>' : '<span class="st go">탑승 가능</span>';
          const leaveTxt = w.leaveDays.length ? `신청 ${w.leaveDays.map(mdSlash).join('·')}` : w.secured ? '확정 연차로 완성' : '연차 없이';
          return `<li${changed ? ` class="flip" style="animation-delay:${i * 60}ms"` : ''}>
            <span class="route-b">${md(w.start)}<span class="sub">${weekdayKo(w.start)}</span> → ${md(w.end)}<span class="sub">${weekdayKo(w.end)}</span></span>
            <span class="days">${w.length}일 쉼</span>
            <span class="leave">${w.cost ? `연차 ${w.cost}일` : '연차 0일'}</span>
            <span class="apply">${leaveTxt}</span>
            ${st}
            <span class="fl">${flightCode(w)}</span>
          </li>`;
        })
        .join('')
    : '<li><span class="route-b">조건에 맞는 연휴가 없어요</span></li>';
  $('board-foot').textContent = isFree() ? `${state.year}년 · 연차 없이 쉬는 연휴 · 아래에서 조건을 바꾸면 안내판도 바뀝니다` : `${state.year}년 · 연차 ${r.budgetAfterFixed}일 기준 · 아래에서 조건을 바꾸면 안내판도 바뀝니다`;
}

const destName = (id) => (DESTINATIONS.find((d) => d.id === id) || {}).name || id;
const dayDiff = (iso) => Math.round((toDayNum(iso) - toDayNum(TODAY)));
const isPeak = (w) => w.holidays.some((h) => /설날|추석/.test(h));

function planCard(w, i) {
  const fixed = (w.fixedLeaveDays || []).map((d) => `<span class="chip fixed">${mdSlash(d)}(${weekdayKo(d)}) 확정</span>`).join('');
  const leave = w.leaveDays.length
    ? w.leaveDays.map((d) => `<span class="chip">${mdSlash(d)}(${weekdayKo(d)})</span>`).join('') + fixed
    : fixed || '<span class="chip free">연차 필요 없음</span>';
  const dates = [];
  for (let n = toDayNum(w.start); n <= toDayNum(w.end); n++) dates.push(fromDayNum(n));
  const opt = (d, sel) => `<option value="${d}"${d === sel ? ' selected' : ''}>${mdSlash(d)}(${weekdayKo(d)})</option>`;
  const month = Number(w.start.slice(5, 7));
  const recs = recommend(DESTINATIONS.map((d) => d.id), w.length, month);
  const pick = recs[0]?.id || DESTINATIONS[0].id;
  const options = DESTINATIONS.map((d) => `<option value="${d.id}"${d.id === pick ? ' selected' : ''}>${d.name}</option>`).join('');
  const chips = recs
    .slice(0, 3)
    .map((r) => `<button type="button" class="dchip${r.id === pick ? ' on' : ''}" data-pick="${r.id}" data-i="${i}">${destName(r.id)} <span>${r.c.hi}°</span></button>`)
    .join('');
  const via = w.holidays.length ? escapeHtml(w.holidays.filter((h) => !/대체공휴일/.test(h)).map((h) => h.replace(' 연휴', '')).filter((h, k, a) => a.indexOf(h) === k).join('·')) : '주말';
  const dd = dayDiff(w.start);
  return `<li class="pass" data-i="${i}">
    <div class="pass-main">
      <div class="pass-top"><span>Boarding pass · 탑승권</span><span class="code">${flightCode(w)}</span></div>
      <p class="sr pi-range">${formatRange(w)}</p>
      <div class="route" aria-hidden="true">
        <div class="pt"><span class="d">${md(w.start)}</span><span class="w">${WEEK_FULL[new Date(w.start + 'T00:00:00Z').getUTCDay()]} 출발</span></div>
        <div class="path"><svg><use href="#i-plane"/></svg><span class="len">${w.length}일 연휴</span></div>
        <div class="pt to"><span class="d">${md(w.end)}</span><span class="w">${WEEK_FULL[new Date(w.end + 'T00:00:00Z').getUTCDay()]} 도착</span></div>
      </div>
      <dl class="meta">
        <div><dt>연휴</dt><dd>${w.length}일</dd></div>
        <div><dt>연차</dt><dd>${w.cost}일</dd></div>
        <div><dt>${w.cost ? '효율' : '출발까지'}</dt><dd>${w.cost ? `×${effText(w)}` : dd > 0 ? `D-${dd}` : '진행 중'}</dd></div>
        <div><dt>경유</dt><dd class="small">${via}</dd></div>
      </dl>
      <div class="leave-row"><span class="label">${w.leaveDays.length ? '신청할 연차' : '연차'}</span>${leave}</div>
      ${w.secured ? '<p class="peak">이미 정한 연차로 완성된 연휴예요. 추가로 신청할 연차는 없어요.</p>' : ''}
      ${isPeak(w) ? '<p class="peak">명절 연휴는 출발 수요가 몰리는 기간이에요. 날짜가 정해졌다면 항공권을 일찍 확인해 보세요.</p>' : ''}
    </div>
    <div class="pass-stub">
      <span class="label">이번 연휴 추천 여행지</span>
      <div class="dchips">${chips}</div>
      <label class="sr" for="dest-${i}">여행지 선택</label>
      <select id="dest-${i}" data-dest="${i}">${options}</select>
      <div class="tripdates">
        <label><span class="label">여행 출발</span><select data-dep="${i}">${dates.slice(0, -1).map((d) => opt(d, w.start)).join('')}</select></label>
        <label><span class="label">귀국 출발</span><select data-ret="${i}">${dates.slice(1).map((d) => opt(d, w.end)).join('')}</select></label>
      </div>
      <p class="nights" data-nights="${i}"></p>
      <ul class="facts" data-facts="${i}"></ul>
      <div class="stub-btns">
        <a class="btn primary" target="_blank" rel="${relOpts()}" data-out="flight" data-i="${i}" href="#"><svg><use href="#i-plane"/></svg>항공권</a>
        <a class="btn" target="_blank" rel="${relOpts()}" data-out="hotel" data-i="${i}" href="#"><svg><use href="#i-bed"/></svg>숙소</a>
      </div>
      <p class="hint travel-note" data-note="${i}"></p>
    </div>
  </li>`;
}

function updateTravel(i) {
  const w = passes()[i];
  const sel = document.querySelector(`[data-dest="${i}"]`);
  if (!w || !sel) return;
  const dest = DESTINATIONS.find((d) => d.id === sel.value) || DESTINATIONS[0];
  document.querySelectorAll(`[data-pick][data-i="${i}"]`).forEach((b) => b.classList.toggle('on', b.dataset.pick === dest.id));
  const f = document.querySelector(`[data-out="flight"][data-i="${i}"]`);
  const h = document.querySelector(`[data-out="hotel"][data-i="${i}"]`);
  const depSel = document.querySelector(`[data-dep="${i}"]`);
  const retSel = document.querySelector(`[data-ret="${i}"]`);
  let dep = depSel?.value || w.start;
  let ret = retSel?.value || w.end;
  if (retSel && ret <= dep) {
    // 귀국일이 출발일보다 빠르면 출발 다음 날로 맞춘다
    ret = fromDayNum(toDayNum(dep) + 1);
    retSel.value = ret;
  }
  const nightsN = toDayNum(ret) - toDayNum(dep);
  const nEl = document.querySelector(`[data-nights="${i}"]`);
  if (nEl) nEl.textContent = `${nightsN}박 ${nightsN + 1}일 여행 · 연휴 ${w.length}일 중`;
  const origin = ORIGINS.find((o) => o.id === state.origin) || ORIGINS[0];
  f.href = flightUrl(dest, dep, ret, origin.id);
  const hu = hotelUrl(dest, dep, ret);
  if (hu) {
    h.href = hu;
    h.hidden = false;
  } else {
    h.hidden = true;
  }
  const month = Number(w.start.slice(5, 7));
  const c = climate(dest.id, month);
  const pl = PLACES[dest.id];
  const facts = [];
  if (c) {
    facts.push(`<li><span>${month}월 평년 기온</span><b>${c.hi}° / ${c.lo}°</b></li>`);
    facts.push(`<li><span>비행 (인천 기준)</span><b>직항 ${pl.flight}</b></li>`);
    facts.push(`<li><span>시차</span><b>${tzText(pl.tz)}</b></li>`);
    const warn = [c.rainy ? `비가 많은 달 (평년 ${c.rain}mm)` : '', c.typhoon ? '태풍 영향 가능 시기' : ''].filter(Boolean);
    if (warn.length) facts.push(`<li class="warn"><span>참고</span><b>${warn.join(' · ')}</b></li>`);
  }
  document.querySelector(`[data-facts="${i}"]`).innerHTML = facts.join('');
  document.querySelector(`[data-note="${i}"]`).textContent = `${origin.name} 출발 ${dest.name} 왕복 · ${mdSlash(dep)} 출발, ${mdSlash(ret)} 귀국편 출발 기준으로 트립닷컴에서 열려요. 한국 도착일은 항공편에 따라 다를 수 있어요.${origin.id !== 'sel' ? ' 노선에 따라 경유편만 있을 수 있어요.' : ''}${hu ? '' : ' 이 도시는 숙소 바로가기를 준비 중이에요.'}${c ? ` 기온은 ${pl.src} 1991–2020 평년값이며 실제 예보가 아니에요.` : ''}`;
}

function listRow(w) {
  const eff = w.cost ? `연차 ${w.cost}일 · 효율 ×${effText(w)}` : '연차 없이';
  const leave = w.leaveDays.length ? ` · ${w.leaveDays.map(mdSlash).join(', ')}` : '';
  return `<li><span class="n">${w.length}일</span><span class="r">${formatRange(w)}</span><span class="m">${eff}${leave}${w.holidays.length ? ` · ${escapeHtml(w.holidays.join(', '))}` : ''}</span></li>`;
}

function renderPanel() {
  const r = result;
  const map = {
    top: [r.top, '연차 하루로 가장 많이 쉬는 순서예요. 서로 겹치지 않는 후보만 보여 드려요.'],
    longest: [r.longest, `한 번에 몰아 쓸 때 일수별로 가장 긴 연휴예요 (최대 ${state.maxLeavePerBreak}일).`],
    natural: [r.natural, '연차 없이도 3일 이상 이어지는 휴일이에요.'],
  };
  const [list, desc] = map[currentTab];
  $('panel').innerHTML = `<p class="hint">${desc}</p>${list.length ? `<ul class="rows">${list.map(listRow).join('')}</ul>` : '<p class="hint">해당하는 연휴가 없습니다.</p>'}`;
  document.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === currentTab)));
}

function renderMonths(start, end) {
  const leave = new Set(passes().flatMap((w) => w.leaveDays));
  const inBreak = new Set();
  passes().forEach((w) => {
    for (let n = toDayNum(w.start); n <= toDayNum(w.end); n++) inBreak.add(fromDayNum(n));
  });
  const dayMap = new Map(result.days.map((d) => [d.date, d]));
  const months = [];
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  const endKey = end.slice(0, 7);
  while (`${y}-${String(m).padStart(2, '0')}` <= endKey) {
    months.push([y, m]);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  $('months').innerHTML = months
    .map(([yy, mm]) => {
      const first = `${yy}-${String(mm).padStart(2, '0')}-01`;
      const pad = new Date(Date.UTC(yy, mm - 1, 1)).getUTCDay();
      const daysIn = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
      let cells = '<span class="dh sun">일</span><span class="dh">월</span><span class="dh">화</span><span class="dh">수</span><span class="dh">목</span><span class="dh">금</span><span class="dh sat">토</span>';
      cells += '<span class="dc empty"></span>'.repeat(pad);
      for (let d = 1; d <= daysIn; d++) {
        const iso = `${first.slice(0, 8)}${String(d).padStart(2, '0')}`;
        const info = dayMap.get(iso);
        let cls = 'out';
        let title = '';
        if (info) {
          cls = info.fixedLeave ? 'fixed' : leave.has(iso) ? 'leave' : info.type;
          if (info.blocked && info.type === 'work') cls += ' blocked';
          title = info.name || (leave.has(iso) ? '추천 연차' : '');
          if (info.fixedLeave) title = '확정 연차';
        }
        if (inBreak.has(iso)) cls += ' brk';
        cells += `<span class="dc ${cls}"${title ? ` title="${escapeHtml(title)}"` : ''}>${d}</span>`;
      }
      return `<div class="month"><p class="mt">${yy}년 ${mm}월</p><div class="grid">${cells}</div></div>`;
    })
    .join('');
}

// ---- 내보내기
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 3500);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

$('dl-ics').addEventListener('click', () => {
  if (!passes().length) return toast('저장할 연휴가 없습니다.');
  const blob = new Blob([toICS(passes(), { title: `징검 ${state.year} 연휴 계획` })], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `yeonchagak-${state.year}.ics`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
  toast('캘린더 파일을 저장했어요. 구글·아이폰·아웃룩 캘린더에서 열면 연휴와 연차일이 추가됩니다.');
  track('ics_download');
});

$('copy-request').addEventListener('click', async () => {
  if (!result?.plan.length) return toast('복사할 연차 일정이 없습니다.');
  const ok = await copyText(leaveRequestText(result.plan));
  toast(ok ? '연차 일정 문구를 복사했어요. 메신저나 결재 사유에 붙여 넣으세요.' : '복사에 실패했습니다. 브라우저 권한을 확인하세요.');
  if (ok) track('copy_request');
});

$('share').addEventListener('click', async () => {
  const url = location.href;
  const best = passes().slice().sort((a, b) => b.length - a.length)[0];
  const text = !best ? '징검 — 빨간 날 사이 징검다리 놓고 떠나요' : isFree() ? `${state.year}년 빨간 날 연휴 ${passes().length}번, 최장 ${best.length}일 (${formatRange(best)})` : `내 연차 ${result.planLeaveUsed}일로 ${result.planDaysOff}일 쉬는 ${state.year}년 플랜 (최장 ${best.length}일 연휴)`;
  if (navigator.share) {
    try {
      await navigator.share({ title: '징검', text, url });
      track('share');
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }
  const ok = await copyText(`${text}\n${url}`);
  toast(ok ? '공유 링크를 복사했어요. 링크를 연 사람에게 같은 조건의 결과가 보입니다.' : '복사에 실패했습니다. 주소창의 링크를 직접 복사하세요.');
  if (ok) track('share');
});

$('print').addEventListener('click', () => window.print());

// ---- 이벤트
$('planner').addEventListener('submit', (e) => {
  e.preventDefault();
  run({ scroll: true, userAction: true });
});

document.querySelectorAll('input[name=goal]').forEach((r) => r.addEventListener('change', () => run({ userAction: true })));
document.querySelectorAll('input[name=mode]').forEach((r) =>
  r.addEventListener('change', () => {
    state.mode = r.value;
    applyMode();
    run({ userAction: true });
  })
);
document.querySelectorAll('.step').forEach((b) =>
  b.addEventListener('click', () => {
    const input = $('budget');
    const v = Math.min(40, Math.max(0, (Number(input.value) || 0) + Number(b.dataset.step)));
    input.value = v;
    run({ userAction: true });
  })
);

['year', 'maxLeavePerBreak', 'minBreak', 'holidaysOff', 'substituteOff', 'laborOff', 'start', 'end'].forEach((id) =>
  $(id).addEventListener('change', () => {
    if (id === 'year') {
      $('start').value = '';
      $('end').value = '';
    }
    if (id === 'holidaysOff') $('substituteOff').disabled = !$('holidaysOff').checked;
    run({ userAction: true });
  })
);
$('budget').addEventListener('input', () => {
  if ($('budget').value.trim() !== '') run({ userAction: true });
});

document.querySelector('.advanced').addEventListener('click', (e) => {
  const add = e.target.closest('[data-add]');
  const rm = e.target.closest('[data-remove]');
  if (add) {
    const key = add.dataset.add;
    if (key === 'blackout') {
      const a = $('bo-start').value;
      const b = $('bo-end').value || a;
      if (!a) return showErrors(['연차 불가 기간의 시작일을 선택하세요.']);
      if (b < a) return showErrors(['연차 불가 기간의 끝이 시작보다 빠릅니다.']);
      state.blackout.push({ start: a, end: b });
      $('bo-start').value = '';
      $('bo-end').value = '';
    } else {
      const input = key === 'fixedLeave' ? $('fixed-input') : $('extra-input');
      if (!input.value) return showErrors(['추가할 날짜를 선택하세요.']);
      if (!state[key].includes(input.value)) state[key] = [...state[key], input.value].sort();
      input.value = '';
    }
    renderTags();
    run({ userAction: true });
  }
  if (rm) {
    state[rm.dataset.remove].splice(Number(rm.dataset.idx), 1);
    renderTags();
    run({ userAction: true });
  }
});

document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  currentTab = b.dataset.tab;
  renderPanel();
});

$('plan').addEventListener('change', (e) => {
  const sel = e.target.closest('[data-dest]');
  if (sel) {
    updateTravel(Number(sel.dataset.dest));
    track('dest_change');
  }
  const d = e.target.closest('[data-dep],[data-ret]');
  if (d) {
    updateTravel(Number(d.dataset.dep ?? d.dataset.ret));
    track('trip_dates_change');
  }
});
document.querySelectorAll('input[name=origin]').forEach((r) =>
  r.addEventListener('change', () => {
    state.origin = r.value;
    store.set(state);
    history.replaceState(null, '', `${location.pathname}?${encodeState(state)}`);
    passes().forEach((_, i) => updateTravel(i));
    track('origin_change');
  })
);
$('plan').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-pick]');
  if (chip) {
    const sel = document.querySelector(`[data-dest="${chip.dataset.i}"]`);
    sel.value = chip.dataset.pick;
    updateTravel(Number(chip.dataset.i));
    track('dest_change');
    return;
  }
  const a = e.target.closest('[data-out]');
  if (!a) return;
  updateTravel(Number(a.dataset.i)); // 클릭 직전 최신 링크 보장
  track(`outbound_${a.dataset.out}`);
});

// ---- 초기화
$('verified').textContent = DATA_VERIFIED_AT;
$('data-note').textContent = `공휴일 데이터 ${YEARS.join('·')}년 수록 (${DATA_VERIFIED_AT} 확인)`;
if (affiliateEnabled()) {
  const n = $('aff-note');
  n.hidden = false;
  n.textContent = `이 사이트의 항공권·숙소 링크는 ${AFFILIATE.provider} 제휴 링크로, 링크를 통해 예약하면 사이트 운영자가 수수료를 받을 수 있습니다. 이용자가 내는 가격은 같습니다.`;
}
fillForm();
$('substituteOff').disabled = !state.holidaysOff;
run();
