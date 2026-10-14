// 연차 최적화 엔진. DOM 의존성 없음 (브라우저·Node 공용).
// 모든 날짜는 'YYYY-MM-DD' 문자열, 내부 계산은 UTC 일 단위 정수.

const DAY_MS = 86400000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export function toDayNum(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return NaN;
  const [y, m, d] = iso.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return NaN;
  return t / DAY_MS;
}

export function fromDayNum(n) {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function weekdayOf(iso) {
  return new Date(toDayNum(iso) * DAY_MS).getUTCDay();
}

export function weekdayKo(iso) {
  return WEEKDAYS[weekdayOf(iso)];
}

export function isValidDate(iso) {
  return !Number.isNaN(toDayNum(iso));
}

export const DEFAULT_OPTIONS = {
  start: null, // 계획 시작일 (포함)
  end: null, // 계획 종료일 (포함)
  budget: 15, // 사용할 수 있는 연차 일수
  minBreak: 4, // 플랜에 포함할 최소 연휴 길이
  maxLeavePerBreak: 5, // 한 번의 연휴에 쓸 최대 연차
  goal: 'long', // 'long' = 긴 연휴 우선(길이² 합 최대), 'total' = 쉬는 날 합계 최대
  holidaysOff: true, // 관공서 공휴일에 쉰다
  substituteOff: true, // 대체공휴일에 쉰다
  laborOff: true, // 노동절(5/1)에 쉰다
  extraOff: [], // 회사 지정 휴무일
  fixedLeave: [], // 이미 쓰기로 정한 연차일
  blackout: [], // 연차를 쓸 수 없는 기간 [{start,end}]
};

const MAX_WINDOW = 21; // 한 연휴의 최대 탐색 길이(일)
export const LIMITS = { budgetMax: 40, maxLeavePerBreakMax: 15 };

export function normalizeOptions(input = {}) {
  const o = { ...DEFAULT_OPTIONS, ...input };
  const errors = [];
  if (!isValidDate(o.start)) errors.push('시작일이 올바르지 않습니다.');
  if (!isValidDate(o.end)) errors.push('종료일이 올바르지 않습니다.');
  if (!errors.length && toDayNum(o.end) < toDayNum(o.start)) errors.push('종료일이 시작일보다 빠릅니다.');
  if (!errors.length && toDayNum(o.end) - toDayNum(o.start) > 400) errors.push('계획 기간은 최대 400일까지 가능합니다.');
  const budget = Number(o.budget);
  if (!Number.isFinite(budget) || budget < 0 || !Number.isInteger(budget)) errors.push('연차 일수는 0 이상의 정수로 입력하세요.');
  else if (budget > LIMITS.budgetMax) errors.push(`연차 일수는 최대 ${LIMITS.budgetMax}일까지 입력할 수 있습니다.`);
  const minBreak = Number(o.minBreak);
  if (![3, 4, 5, 6, 7, 9].includes(minBreak)) errors.push('최소 연휴 길이 값이 올바르지 않습니다.');
  if (!['long', 'total'].includes(o.goal)) errors.push('계획 목표 값이 올바르지 않습니다.');
  const mlpb = Number(o.maxLeavePerBreak);
  if (!Number.isInteger(mlpb) || mlpb < 1 || mlpb > LIMITS.maxLeavePerBreakMax) errors.push(`한 번에 쓸 최대 연차는 1~${LIMITS.maxLeavePerBreakMax}일입니다.`);
  const dateList = (arr, label) => {
    const list = Array.isArray(arr) ? arr : [];
    const bad = list.filter((d) => !isValidDate(d));
    if (bad.length) errors.push(`${label}에 올바르지 않은 날짜가 있습니다: ${bad.join(', ')}`);
    return [...new Set(list.filter(isValidDate))].sort();
  };
  const extraOff = dateList(o.extraOff, '회사 휴무일');
  const fixedLeave = dateList(o.fixedLeave, '확정 연차일');
  const blackout = (Array.isArray(o.blackout) ? o.blackout : []).filter((r) => {
    const ok = r && isValidDate(r.start) && isValidDate(r.end) && toDayNum(r.end) >= toDayNum(r.start);
    if (!ok) errors.push('연차 불가 기간 중 올바르지 않은 항목이 있습니다.');
    return ok;
  });
  return {
    errors,
    options: { ...o, budget, minBreak, maxLeavePerBreak: mlpb, extraOff, fixedLeave, blackout },
  };
}

// 하루 단위 달력 생성. 계획 기간 앞뒤로 버퍼를 둬서 기간 경계의 연휴도 정확히 계산한다.
export function buildCalendar(options, holidayTable) {
  const s = toDayNum(options.start);
  const e = toDayNum(options.end);
  const holidayMap = new Map();
  for (const list of Object.values(holidayTable)) {
    for (const [date, name, kind] of list) {
      const prev = holidayMap.get(date);
      holidayMap.set(date, prev ? { name: `${prev.name} · ${name}`, kind: prev.kind } : { name, kind });
    }
  }
  const extra = new Set(options.extraOff);
  const fixed = new Set(options.fixedLeave);
  const blackoutRanges = options.blackout.map((r) => [toDayNum(r.start), toDayNum(r.end)]);
  const days = [];
  for (let n = s; n <= e; n++) {
    const date = fromDayNum(n);
    const dow = new Date(n * DAY_MS).getUTCDay();
    const h = holidayMap.get(date);
    let type = 'work';
    let name = '';
    if (h) {
      const off =
        (h.kind === 'holiday' && options.holidaysOff) ||
        (h.kind === 'substitute' && options.holidaysOff && options.substituteOff) ||
        (h.kind === 'labor' && options.laborOff);
      name = h.name;
      if (off) type = 'holiday';
    }
    if (type === 'work' && (dow === 0 || dow === 6)) type = 'weekend';
    if (type === 'work' && extra.has(date)) {
      type = 'extra';
      name = name || '회사 휴무';
    }
    let fixedLeave = false;
    if (type === 'work' && fixed.has(date)) {
      type = 'leave';
      fixedLeave = true;
    }
    const blocked = blackoutRanges.some(([a, b]) => n >= a && n <= b);
    days.push({ date, dow, type, name, fixedLeave, blocked, holidayName: h ? h.name : '' });
  }
  return days;
}

const isOff = (d) => d.type !== 'work';

function describeWindow(days, s, e, leaveIdx) {
  const slice = days.slice(s, e + 1);
  const holidays = [...new Set(slice.filter((d) => d.type === 'holiday').map((d) => d.name))];
  const length = e - s + 1;
  const cost = leaveIdx.length;
  return {
    start: days[s].date,
    end: days[e].date,
    length,
    leaveDays: leaveIdx.map((i) => days[i].date),
    cost,
    fixedLeaveDays: slice.filter((d) => d.fixedLeave).map((d) => d.date),
    holidays,
    weekendDays: slice.filter((d) => d.type === 'weekend').length,
    holidayDays: slice.filter((d) => d.type === 'holiday' || d.type === 'extra').length,
    efficiency: cost ? length / cost : Infinity,
  };
}

// 연차로 메워서 만들 수 있는 '최대 연속 휴일' 후보 전체.
// 조건: 앞날과 다음날이 근무일(=더 늘리려면 연차가 더 필요), 내부 근무일은 모두 연차로 채움.
// 구간 [s,e]마다 연차 배치가 하나로 정해지므로, 겹치지 않는 구간 조합이 가능한 모든 연차 배치를 덮는다.
export function enumerateWindows(days, options) {
  const n = days.length;
  const out = [];
  for (let s = 0; s < n; s++) {
    if (s > 0 && isOff(days[s - 1])) continue; // 앞날이 쉬는 날이면 최대 구간이 아님
    const leaveIdx = [];
    for (let e = s; e < n && e - s < MAX_WINDOW; e++) {
      const d = days[e];
      if (d.type === 'work') {
        if (d.blocked) break;
        leaveIdx.push(e);
        if (leaveIdx.length > options.maxLeavePerBreak) break;
      }
      if (e < n - 1 && isOff(days[e + 1])) continue; // 다음날도 쉬면 아직 끝이 아님
      // 시작·끝이 연차인 구간도 유효하다 (예: 공휴일 전날 연차, 주말 앞 금요일 연차)
      if (!leaveIdx.length) continue;
      out.push({ s, e, leaveIdx: leaveIdx.slice() });
    }
  }
  return out;
}

// 예산 내에서 겹치지 않는 연휴들의 총 일수를 최대화 (가중 구간 스케줄링 + 예산 DP)
export function windowScore(len, cost, goal) {
  return (goal === 'total' ? len : len * len) * 1000 - cost; // 같은 점수면 연차를 덜 쓰는 쪽
}

export function optimizePlan(days, windows, budget, minBreak, goal = 'long') {
  const n = days.length;
  const cands = windows.filter((w) => w.e - w.s + 1 >= minBreak && w.leaveIdx.length <= budget);
  const byEnd = Array.from({ length: n }, () => []);
  for (const w of cands) byEnd[w.e].push(w);
  // f[d][b]: 0..d-1일 범위 안에서 끝나는 연휴만으로 예산 b를 썼을 때 최대 점수
  const NEG = -Infinity;
  const f = Array.from({ length: n + 1 }, () => new Array(budget + 1).fill(NEG));
  const choice = Array.from({ length: n + 1 }, () => new Array(budget + 1).fill(null));
  f[0][0] = 0;
  for (let d = 0; d < n; d++) {
    for (let b = 0; b <= budget; b++) {
      if (f[d][b] > f[d + 1][b]) {
        f[d + 1][b] = f[d][b];
        choice[d + 1][b] = null;
      }
    }
    for (const w of byEnd[d]) {
      const c = w.leaveIdx.length;
      const from = Math.max(0, w.s - 1); // 직전 연휴와 근무일 하루 이상 간격 유지
      const score = windowScore(w.e - w.s + 1, c, goal);
      for (let b = c; b <= budget; b++) {
        const base = f[from][b - c];
        if (base === NEG) continue;
        if (base + score > f[d + 1][b]) {
          f[d + 1][b] = base + score;
          choice[d + 1][b] = { w, from, prevB: b - c };
        }
      }
    }
  }
  let bestB = 0;
  for (let b = 0; b <= budget; b++) if (f[n][b] > f[n][bestB]) bestB = b;
  const picked = [];
  let d = n;
  let b = bestB;
  while (d > 0) {
    const ch = choice[d][b];
    if (ch) {
      picked.push(ch.w);
      d = ch.from;
      b = ch.prevB;
    } else {
      d -= 1;
    }
  }
  picked.reverse();
  return picked.map((w) => describeWindow(days, w.s, w.e, w.leaveIdx));
}

// 서로 겹치지 않는 효율 좋은 연휴 추천 (연차 효율 → 길이 순)
export function rankWindows(days, windows, budget, minBreak, limit = 12) {
  const list = windows
    .filter((w) => w.leaveIdx.length <= budget && w.e - w.s + 1 >= Math.min(minBreak, 4))
    .map((w) => ({ w, len: w.e - w.s + 1, cost: w.leaveIdx.length }))
    .sort((a, b) => b.len / b.cost - a.len / a.cost || b.len - a.len || a.w.s - b.w.s);
  const used = [];
  const out = [];
  for (const it of list) {
    if (used.some(([a, b]) => !(it.w.e < a || it.w.s > b))) continue;
    used.push([it.w.s, it.w.e]);
    out.push(describeWindow(days, it.w.s, it.w.e, it.w.leaveIdx));
    if (out.length >= limit) break;
  }
  return out;
}

// 연차 k일로 만들 수 있는 가장 긴 연휴
export function longestByCost(days, windows, budget) {
  const best = new Map();
  for (const w of windows) {
    const c = w.leaveIdx.length;
    if (c > budget) continue;
    const len = w.e - w.s + 1;
    const cur = best.get(c);
    if (!cur || len > cur.e - cur.s + 1) best.set(c, w);
  }
  return [...best.keys()]
    .sort((a, b) => a - b)
    .map((c) => describeWindow(days, best.get(c).s, best.get(c).e, best.get(c).leaveIdx));
}

// 확정 연차(이미 쓰기로 한 날)로 이미 만들어진 3일 이상 연휴
export function securedBreaks(days) {
  const out = [];
  let i = 0;
  while (i < days.length) {
    if (!isOff(days[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < days.length && isOff(days[j + 1])) j++;
    const hasFixed = days.slice(i, j + 1).some((d) => d.fixedLeave);
    if (j - i + 1 >= 3 && hasFixed) out.push({ ...describeWindow(days, i, j, []), secured: true });
    i = j + 1;
  }
  return out;
}

// 연차 없이 쉬는 3일 이상 연휴
export function naturalBreaks(days) {
  const out = [];
  let i = 0;
  while (i < days.length) {
    if (!isOff(days[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < days.length && isOff(days[j + 1])) j++;
    const hasFixed = days.slice(i, j + 1).some((d) => d.fixedLeave);
    if (j - i + 1 >= 3 && !hasFixed) out.push(describeWindow(days, i, j, []));
    i = j + 1;
  }
  return out;
}

export function plan(input, holidayTable) {
  const { errors, options } = normalizeOptions(input);
  if (errors.length) return { ok: false, errors };
  const fixedCount = options.fixedLeave.filter((d) => {
    const n = toDayNum(d);
    return n >= toDayNum(options.start) && n <= toDayNum(options.end);
  }).length;
  const days = buildCalendar(options, holidayTable);
  const fixedApplied = days.filter((d) => d.fixedLeave).length;
  const budget = options.budget - fixedApplied;
  if (budget < 0) {
    return { ok: false, errors: [`확정 연차(${fixedApplied}일)가 보유 연차(${options.budget}일)보다 많습니다.`] };
  }
  const windows = enumerateWindows(days, options);
  const optimized = optimizePlan(days, windows, budget, options.minBreak, options.goal);
  // 추천 연휴와 겹치지 않는 '확정 연차로 이미 완성된 연휴'도 결과에 남긴다
  const overlaps = (a, b) => !(a.end < b.start || a.start > b.end);
  const secured = securedBreaks(days).filter((sb) => !optimized.some((w) => overlaps(w, sb)));
  const planned = [...optimized, ...secured].sort((a, b) => a.start.localeCompare(b.start));
  const used = planned.reduce((a, w) => a + w.cost, 0);
  const leaveSet = new Set(planned.flatMap((w) => w.leaveDays));
  const coverage = days.filter((d) => isOff(d) || leaveSet.has(d.date)).length;
  return {
    ok: true,
    options,
    days,
    budgetAfterFixed: budget,
    fixedLeaveCount: fixedApplied,
    fixedOutOfRange: fixedCount !== fixedApplied ? true : false,
    plan: planned,
    secured,
    planLeaveUsed: used,
    planDaysOff: planned.reduce((a, w) => a + w.length, 0),
    leftover: budget - used,
    top: rankWindows(days, windows, budget, options.minBreak),
    longest: longestByCost(days, windows, Math.min(budget, options.maxLeavePerBreak)),
    natural: naturalBreaks(days),
    totalOffDays: coverage,
  };
}

export function formatRange(w) {
  const f = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}(${weekdayKo(iso)})`;
  return `${f(w.start)} ~ ${f(w.end)}`;
}

// iCalendar(.ics) 생성. 종일 일정의 DTEND는 다음날(배타적).
export function toICS(plans, { title = '징검', stamp = new Date() } = {}) {
  const pad = (iso) => iso.replace(/-/g, '');
  const next = (iso) => fromDayNum(toDayNum(iso) + 1);
  const dtstamp = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//yeonchagak//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(title)}`];
  plans.forEach((w, i) => {
    const desc = `${w.cost ? `추가 연차 ${w.cost}일: ${w.leaveDays.join(', ')}` : '추가 연차 없음'}${(w.fixedLeaveDays || []).length ? `
확정 연차: ${w.fixedLeaveDays.join(', ')}` : ''}${w.holidays.length ? `\n포함 공휴일: ${w.holidays.join(', ')}` : ''}`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:break-${pad(w.start)}-${pad(w.end)}-${i}@yeonchagak`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${pad(w.start)}`,
      `DTEND;VALUE=DATE:${pad(next(w.end))}`,
      `SUMMARY:${esc(`연휴 ${w.length}일${w.cost ? ` (연차 ${w.cost}일)` : ''}`)}`,
      `DESCRIPTION:${esc(desc)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT'
    );
    (w.fixedLeaveDays || []).forEach((d) => {
      lines.push('BEGIN:VEVENT', `UID:fixed-${pad(d)}@yeonchagak`, `DTSTAMP:${dtstamp}`, `DTSTART;VALUE=DATE:${pad(d)}`, `DTEND;VALUE=DATE:${pad(next(d))}`, 'SUMMARY:연차(확정)', 'END:VEVENT');
    });
    w.leaveDays.forEach((d) => {
      lines.push(
        'BEGIN:VEVENT',
        `UID:leave-${pad(d)}@yeonchagak`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${pad(d)}`,
        `DTEND;VALUE=DATE:${pad(next(d))}`,
        'SUMMARY:연차',
        'END:VEVENT'
      );
    });
  });
  lines.push('END:VCALENDAR');
  // RFC 5545: 75옥텟 줄 접기는 대부분의 캘린더가 관대하게 처리하므로 짧은 줄만 생성
  return lines.join('\r\n') + '\r\n';
}

export function leaveRequestText(plans) {
  const all = plans.flatMap((w) => w.leaveDays).sort();
  if (!all.length) return '';
  const fmt = (iso) => `${iso.slice(0, 4)}.${iso.slice(5, 7)}.${iso.slice(8, 10)}(${weekdayKo(iso)})`;
  return [`[연차 사용 예정 일정] 총 ${all.length}일`, ...plans.map((w) => `- ${formatRange(w)} 연휴 ${w.length}일 / 연차: ${w.leaveDays.map(fmt).join(', ')}`)].join('\n');
}
