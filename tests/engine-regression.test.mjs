// 검토 지적(2026-10-14) 회귀 테스트 + 엔진과 독립적인 완전 탐색 비교
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, normalizeOptions, buildCalendar, windowScore, toDayNum, fromDayNum, weekdayOf } from '../assets/engine.js';
import { HOLIDAYS } from '../assets/holidays.js';

const ranges = (r) => r.plan.map((w) => `${w.start}~${w.end}`);

test('공휴일 다음날 연차: 2026 성탄절 → 12/24(목) 또는 12/28(월) 연차로 4일', () => {
  const r = plan({ start: '2026-10-14', end: '2026-12-31', budget: 1, maxLeavePerBreak: 5, minBreak: 4 }, HOLIDAYS);
  assert.equal(r.plan.length, 1);
  assert.ok(['2026-12-24~2026-12-27', '2026-12-25~2026-12-28'].includes(ranges(r)[0]), ranges(r)[0]);
  assert.equal(r.plan[0].cost, 1);
});

test('평범한 주말 앞 금요일 연차: 2027-01 → 1/8(금)~1/10 3일', () => {
  const r = plan({ start: '2027-01-04', end: '2027-01-31', budget: 1, maxLeavePerBreak: 5, minBreak: 3 }, HOLIDAYS);
  assert.equal(r.plan.length, 1);
  assert.equal(r.plan[0].length, 3);
  assert.equal(r.plan[0].cost, 1);
  const d = r.plan[0].leaveDays[0];
  assert.ok([1, 5].includes(weekdayOf(d)), `월 또는 금: ${d}`);
});

test('주말 뒤 월요일 연차도 후보가 된다', () => {
  // 1/4(월)~1/31 기간, 금요일을 모두 사용 불가로 막으면 월요일 연차만 남는다
  const fridays = ['2027-01-08', '2027-01-15', '2027-01-22', '2027-01-29'].map((d) => ({ start: d, end: d }));
  const r = plan({ start: '2027-01-04', end: '2027-01-31', budget: 1, maxLeavePerBreak: 5, minBreak: 3, blackout: fridays }, HOLIDAYS);
  assert.equal(r.plan.length, 1);
  assert.equal(weekdayOf(r.plan[0].leaveDays[0]), 1);
});

test('고정 연차만으로 완성된 연휴는 결과와 캘린더에 남는다', () => {
  const r = plan({ start: '2026-10-14', end: '2026-12-31', budget: 1, maxLeavePerBreak: 5, minBreak: 4, fixedLeave: ['2026-12-24'] }, HOLIDAYS);
  assert.equal(r.budgetAfterFixed, 0);
  assert.equal(r.plan.length, 1);
  assert.equal(r.plan[0].start, '2026-12-24');
  assert.equal(r.plan[0].end, '2026-12-27');
  assert.equal(r.plan[0].secured, true);
  assert.deepEqual(r.plan[0].fixedLeaveDays, ['2026-12-24']);
  assert.equal(r.plan[0].cost, 0);
});

test('총 연차와 1회 최대 연차는 따로 지켜진다', () => {
  const r = plan({ start: '2027-01-01', end: '2027-12-31', budget: 10, maxLeavePerBreak: 2, minBreak: 4 }, HOLIDAYS);
  assert.ok(r.plan.every((w) => w.cost <= 2));
  assert.ok(r.planLeaveUsed <= 10);
  const r2 = plan({ start: '2027-01-01', end: '2027-12-31', budget: 3, maxLeavePerBreak: 10, minBreak: 4 }, HOLIDAYS);
  assert.ok(r2.planLeaveUsed <= 3);
});

test('회사 휴무일은 연차 없이 쉬는 날로, 사용 불가 기간에는 연차를 넣지 않는다', () => {
  const r = plan({ start: '2027-09-01', end: '2027-09-30', budget: 2, maxLeavePerBreak: 5, minBreak: 4, extraOff: ['2027-09-13'], blackout: [{ start: '2027-09-17', end: '2027-09-17' }] }, HOLIDAYS);
  const w = r.plan.find((x) => x.start <= '2027-09-15' && x.end >= '2027-09-15');
  assert.ok(w);
  assert.ok(!w.leaveDays.includes('2027-09-13'));
  assert.ok(r.plan.every((x) => !x.leaveDays.includes('2027-09-17')));
});

test('기간 경계: 시작일·종료일에 걸친 연휴도 기간 안에서만 계산', () => {
  const r = plan({ start: '2027-09-13', end: '2027-09-17', budget: 2, maxLeavePerBreak: 5, minBreak: 3 }, HOLIDAYS);
  for (const w of r.plan) assert.ok(w.start >= '2027-09-13' && w.end <= '2027-09-17');
  assert.ok(r.plan.length >= 1);
});

test('예산 초과·중복 배치 없음', () => {
  for (let b = 0; b <= 12; b++) {
    const r = plan({ start: '2027-01-01', end: '2027-12-31', budget: b, maxLeavePerBreak: 5, minBreak: 3 }, HOLIDAYS);
    assert.ok(r.ok);
    const all = r.plan.flatMap((w) => w.leaveDays);
    assert.equal(new Set(all).size, all.length, '같은 날 두 번 배치 없음');
    assert.ok(all.length <= b);
    const sorted = [...r.plan].sort((x, y) => x.start.localeCompare(y.start));
    for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].start > sorted[i - 1].end, '겹침 없음');
  }
});

// ---- 엔진과 독립적인 완전 탐색: 근무일 중 연차 k개(≤예산)를 고르는 모든 경우를 직접 평가
function bruteForce(opts) {
  const { options } = normalizeOptions(opts);
  const days = buildCalendar(options, HOLIDAYS);
  const work = days.map((d, i) => (d.type === 'work' && !d.blocked ? i : -1)).filter((i) => i >= 0);
  let best = 0;
  const chosen = [];
  const evalSet = () => {
    const off = days.map((d, i) => d.type !== 'work' || chosen.includes(i));
    let score = 0;
    let i = 0;
    while (i < days.length) {
      if (!off[i]) { i++; continue; }
      let j = i;
      while (j + 1 < days.length && off[j + 1]) j++;
      const cost = chosen.filter((c) => c >= i && c <= j).length;
      const len = j - i + 1;
      if (cost > options.maxLeavePerBreak) return; // 1회 최대 연차 초과 배치는 불가
      if (cost > 0 && len >= options.minBreak) score += windowScore(len, cost, options.goal);
      i = j + 1;
    }
    if (score > best) best = score;
  };
  const rec = (start, left) => {
    evalSet();
    if (!left) return;
    for (let k = start; k < work.length; k++) {
      chosen.push(work[k]);
      rec(k + 1, left - 1);
      chosen.pop();
    }
  };
  rec(0, options.budget);
  return best;
}

function rng(seed) {
  let x = seed;
  return () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
}

test('완전 탐색과 최적화 결과가 일치 (무작위 300개 조건)', () => {
  const R = rng(20261014);
  const base = toDayNum('2026-10-14');
  const span = toDayNum('2027-12-31') - base - 30;
  let checked = 0;
  for (let t = 0; t < 300; t++) {
    const s = base + Math.floor(R() * span);
    const len = 10 + Math.floor(R() * 20);
    const start = fromDayNum(s);
    const end = fromDayNum(s + len);
    const budget = 1 + Math.floor(R() * 3);
    const maxLeavePerBreak = 1 + Math.floor(R() * 3);
    const minBreak = [3, 4, 5][Math.floor(R() * 3)];
    const goal = R() < 0.5 ? 'long' : 'total';
    const extraOff = R() < 0.3 ? [fromDayNum(s + Math.floor(R() * len))] : [];
    const bo = R() < 0.3 ? s + Math.floor(R() * len) : null;
    const blackout = bo ? [{ start: fromDayNum(bo), end: fromDayNum(bo + Math.floor(R() * 3)) }] : [];
    const opts = { start, end, budget, maxLeavePerBreak, minBreak, goal, extraOff, blackout };
    const r = plan(opts, HOLIDAYS);
    assert.ok(r.ok, JSON.stringify(opts));
    const got = r.plan.filter((w) => !w.secured).reduce((a, w) => a + windowScore(w.length, w.cost, goal), 0);
    assert.equal(got, bruteForce(opts), JSON.stringify(opts));
    checked++;
  }
  assert.equal(checked, 300);
});
