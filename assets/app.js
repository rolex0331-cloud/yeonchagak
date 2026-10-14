import { plan, formatRange, toICS, leaveRequestText, weekdayKo, toDayNum, fromDayNum } from './engine.js';
import { HOLIDAYS, YEARS, DATA_VERIFIED_AT } from './holidays.js';
import { defaultState, encodeState, decodeState } from './state.js';
import { DESTINATIONS, AFFILIATE, affiliateEnabled, ANALYTICS } from './config.js';
import { flightUrl, hotelUrl } from './links.js';

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
  box.innerHTML = list.map((e) => `<p>⚠️ ${escapeHtml(e)}</p>`).join('');
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
      budget: state.budget,
      minBreak: state.minBreak,
      maxLeavePerBreak: state.maxLeavePerBreak,
      goal: state.goal,
      holidaysOff: state.holidaysOff,
      substituteOff: state.substituteOff,
      laborOff: state.laborOff,
      extraOff: state.extraOff,
      fixedLeave: state.fixedLeave,
      blackout: state.blackout,
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

function render() {
  const r = result;
  const { start, end } = rangeFor(state);
  const s = $('summary');
  const fixedNote = r.fixedLeaveCount ? ` (확정 연차 ${r.fixedLeaveCount}일 포함 시 남은 ${r.budgetAfterFixed}일 기준)` : '';
  if (!r.plan.length) {
    s.innerHTML = `<p class="big">조건에 맞는 연휴를 찾지 못했어요.</p>
      <p class="help">${start} ~ ${end} 기간, 연차 ${r.budgetAfterFixed}일${fixedNote} 기준입니다. '연휴로 칠 최소 길이'를 줄이거나 '한 번에 쓸 최대 연차'를 늘려 보세요.</p>`;
  } else {
    s.innerHTML = `<p class="big">연차 <b>${r.planLeaveUsed}일</b>로 <b>${r.plan.length}번</b>의 연휴, 총 <b>${r.planDaysOff}일</b> 쉬어요</p>
      <p class="help">${start} ~ ${end} · 사용 가능 연차 ${r.budgetAfterFixed}일${fixedNote}${r.leftover > 0 ? ` · 남는 연차 ${r.leftover}일 (원하는 날 자유롭게)` : ''}</p>`;
  }
  $('plan').innerHTML = r.plan.map((w, i) => planCard(w, i)).join('');
  renderPanel();
  renderMonths(start, end);
}

function planCard(w, i) {
  const leave = w.leaveDays.map((d) => `<span class="chip leave">${Number(d.slice(5, 7))}/${Number(d.slice(8))}(${weekdayKo(d)})</span>`).join('');
  const eff = (w.length / w.cost).toFixed(1).replace(/\.0$/, '');
  const options = DESTINATIONS.map((d) => `<option value="${d.id}">${d.name}</option>`).join('');
  return `<li class="card plan-item" data-i="${i}">
    <div class="pi-head">
      <span class="pi-len">${w.length}일</span>
      <div>
        <p class="pi-range">${formatRange(w)}</p>
        <p class="pi-sub">연차 ${w.cost}일 → ${w.length}일 연속 휴식 · 연차 1일당 ${eff}일${w.holidays.length ? ` · ${escapeHtml(w.holidays.join(', '))}` : ''}</p>
      </div>
    </div>
    <p class="pi-leave"><span class="label">연차 쓸 날</span> ${leave}</p>
    <div class="travel">
      <label class="label" for="dest-${i}">이 날짜로 여행 검색</label>
      <div class="inline">
        <select id="dest-${i}" data-dest="${i}">${options}</select>
        <a class="btn small" target="_blank" rel="noopener${affiliateEnabled() ? ' sponsored' : ''}" data-out="flight" data-i="${i}" href="#">✈️ 항공권</a>
        <a class="btn small" target="_blank" rel="noopener${affiliateEnabled() ? ' sponsored' : ''}" data-out="hotel" data-i="${i}" href="#">🏨 숙소</a>
      </div>
      <p class="help travel-note" data-note="${i}"></p>
    </div>
  </li>`;
}

function updateTravel(i) {
  const w = result.plan[i];
  const sel = document.querySelector(`[data-dest="${i}"]`);
  if (!w || !sel) return;
  const dest = DESTINATIONS.find((d) => d.id === sel.value) || DESTINATIONS[0];
  const f = document.querySelector(`[data-out="flight"][data-i="${i}"]`);
  const h = document.querySelector(`[data-out="hotel"][data-i="${i}"]`);
  f.href = flightUrl(dest, w.start, w.end);
  const hu = hotelUrl(dest, w.start, w.end);
  if (hu) {
    h.href = hu;
    h.hidden = false;
  } else {
    h.hidden = true;
  }
  document.querySelector(`[data-note="${i}"]`).textContent = `${dest.name} 왕복 ${w.start} 출발 · ${w.end} 귀국 기준 (트립닷컴 새 창). 실제 출국·귀국일은 연휴 안에서 조정하세요.${hu ? '' : ' 이 목적지는 숙소 바로가기를 아직 지원하지 않습니다.'}`;
}

function listRow(w) {
  const eff = w.cost ? `연차 ${w.cost}일 · 1일당 ${(w.length / w.cost).toFixed(1).replace(/\.0$/, '')}일` : '연차 0일';
  const leave = w.leaveDays.length ? ` · 연차: ${w.leaveDays.map((d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`).join(', ')}` : '';
  return `<li><b>${w.length}일</b> ${formatRange(w)} <span class="muted">${eff}${leave}${w.holidays.length ? ` · ${escapeHtml(w.holidays.join(', '))}` : ''}</span></li>`;
}

function renderPanel() {
  const r = result;
  const map = {
    top: [r.top, '연차 1일당 쉬는 날이 많은 순서입니다. 서로 겹치지 않는 후보만 보여 줍니다.'],
    longest: [r.longest, `연차를 한 번에 몰아 쓸 때 일수별 가장 긴 연휴입니다 (최대 ${state.maxLeavePerBreak}일).`],
    natural: [r.natural, '연차를 쓰지 않아도 3일 이상 이어지는 휴일입니다.'],
  };
  const [list, desc] = map[currentTab];
  $('panel').innerHTML = `<p class="help">${desc}</p>${list.length ? `<ul class="rows">${list.map(listRow).join('')}</ul>` : '<p>해당하는 연휴가 없습니다.</p>'}`;
  document.querySelectorAll('[role=tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === currentTab)));
}

function renderMonths(start, end) {
  const leave = new Set(result.plan.flatMap((w) => w.leaveDays));
  const inBreak = new Set();
  result.plan.forEach((w) => {
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
      return `<div class="month card"><p class="mt">${yy}년 ${mm}월</p><div class="grid">${cells}</div></div>`;
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
  if (!result?.plan.length) return toast('저장할 연휴가 없습니다.');
  const blob = new Blob([toICS(result.plan, { title: `징검 ${state.year} 연휴 계획` })], { type: 'text/calendar;charset=utf-8' });
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
  const best = result?.plan?.slice().sort((a, b) => b.length - a.length)[0];
  const text = best ? `내 연차 ${result.planLeaveUsed}일로 ${result.planDaysOff}일 쉬는 ${state.year}년 플랜 (최장 ${best.length}일 연휴)` : '징검 — 내 연차로 가장 길게 쉬는 날짜';
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
  if (sel) updateTravel(Number(sel.dataset.dest));
});
$('plan').addEventListener('click', (e) => {
  const a = e.target.closest('[data-out]');
  if (!a) return;
  updateTravel(Number(a.dataset.i)); // 클릭 직전 최신 링크 보장
  track(`outbound_${a.dataset.out}`);
});
const observer = new MutationObserver(() => result?.plan.forEach((_, i) => updateTravel(i)));
observer.observe($('plan'), { childList: true });

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
