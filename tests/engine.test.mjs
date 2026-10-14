import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plan, toDayNum, fromDayNum, weekdayOf, toICS, leaveRequestText, normalizeOptions, buildCalendar, enumerateWindows, windowScore } from '../assets/engine.js';
import { HOLIDAYS } from '../assets/holidays.js';
import { encodeState, decodeState, defaultState } from '../assets/state.js';
import { flightUrl, hotelUrl } from '../assets/links.js';
import { DESTINATIONS } from '../assets/config.js';

const Y = { start: '2027-01-01', end: '2027-12-31' };

test('날짜 변환과 잘못된 날짜 거부', () => {
  assert.equal(fromDayNum(toDayNum('2027-09-13')), '2027-09-13');
  assert.ok(Number.isNaN(toDayNum('2027-02-30')));
  assert.ok(Number.isNaN(toDayNum('2027-9-1')));
  assert.ok(Number.isNaN(toDayNum(undefined)));
  assert.equal(weekdayOf('2027-09-13'), 1); // 월
});

test('2027 추석: 연차 2일(9/13, 9/17)로 9/11~9/19 9일', () => {
  const r = plan({ ...Y, budget: 2, minBreak: 4, maxLeavePerBreak: 5 }, HOLIDAYS);
  assert.ok(r.ok);
  const nine = r.longest.find((w) => w.cost === 2);
  assert.equal(nine.start, '2027-09-11');
  assert.equal(nine.end, '2027-09-19');
  assert.deepEqual(nine.leaveDays, ['2027-09-13', '2027-09-17']);
  assert.equal(nine.length, 9);
  // 기본 목표(긴 연휴 우선)에서는 플랜도 9일 연휴 하나를 고른다
  assert.equal(r.plan.length, 1);
  assert.equal(r.plan[0].start, '2027-09-11');
  // 합계 우선이면 5/1~5/5(5일) + 9/11~9/16(6일) = 11일
  const t = plan({ ...Y, budget: 2, goal: 'total' }, HOLIDAYS);
  assert.equal(t.planDaysOff, 11);
});

test('연차 1일 최고 효율은 추석 9/13(월) → 6일', () => {
  const r = plan({ ...Y, budget: 15 }, HOLIDAYS);
  assert.equal(r.top[0].cost, 1);
  assert.equal(r.top[0].length, 6);
  assert.equal(r.top[0].start, '2027-09-11');
});

test('플랜은 예산을 넘지 않고, 연휴끼리 겹치거나 붙지 않는다', () => {
  for (const budget of [0, 1, 3, 7, 15, 25, 40]) {
    for (const minBreak of [3, 4, 5, 7, 9]) {
      const r = plan({ ...Y, budget, minBreak, maxLeavePerBreak: 10 }, HOLIDAYS);
      assert.ok(r.ok);
      assert.ok(r.planLeaveUsed <= budget, `budget ${budget}`);
      assert.equal(r.leftover, budget - r.planLeaveUsed);
      const sorted = [...r.plan].sort((a, b) => a.start.localeCompare(b.start));
      for (let i = 1; i < sorted.length; i++) {
        assert.ok(toDayNum(sorted[i].start) - toDayNum(sorted[i - 1].end) >= 2, '근무일 하루 이상 간격');
      }
      for (const w of r.plan) {
        assert.ok(w.length >= minBreak);
        assert.ok(w.cost <= 10);
        // 연차일은 모두 연휴 범위 안의 평일
        for (const d of w.leaveDays) {
          assert.ok(d >= w.start && d <= w.end);
          assert.ok(![0, 6].includes(weekdayOf(d)));
        }
      }
    }
  }
});

test('예산이 늘면 쉬는 날 합계는 줄지 않는다 (단조성)', () => {
  let prev = -1;
  for (let b = 0; b <= 30; b++) {
    const r = plan({ ...Y, budget: b, maxLeavePerBreak: 5, goal: 'total' }, HOLIDAYS);
    assert.ok(r.planDaysOff >= prev, `budget ${b}`);
    prev = r.planDaysOff;
  }
});

for (const goal of ['long', 'total'])
test(`DP 결과는 완전 탐색 최적값과 같다 (작은 기간, ${goal})`, () => {
  const opts = { start: '2027-09-01', end: '2027-10-31', budget: 6, minBreak: 4, maxLeavePerBreak: 5, goal };
  const r = plan(opts, HOLIDAYS);
  const { options } = normalizeOptions(opts);
  const days = buildCalendar(options, HOLIDAYS);
  const wins = enumerateWindows(days, options).filter((w) => w.e - w.s + 1 >= 4);
  let best = 0;
  const rec = (i, lastEnd, budget, total) => {
    best = Math.max(best, total);
    for (let j = i; j < wins.length; j++) {
      const w = wins[j];
      if (w.s - 1 <= lastEnd) continue;
      if (w.leaveIdx.length > budget) continue;
      rec(j + 1, w.e, budget - w.leaveIdx.length, total + windowScore(w.e - w.s + 1, w.leaveIdx.length, goal));
    }
  };
  wins.sort((a, b) => a.s - b.s);
  rec(0, -2, 6, 0);
  const got = r.plan.reduce((a, w) => a + windowScore(w.length, w.cost, goal), 0);
  assert.equal(got, best);
});

test('공휴일에 쉬지 않는 회사(5인 미만 등)는 주말만 쉰다', () => {
  const r = plan({ ...Y, budget: 2, holidaysOff: false, laborOff: false }, HOLIDAYS);
  const chuseok = r.days.find((d) => d.date === '2027-09-15');
  assert.equal(chuseok.type, 'work');
  assert.equal(r.natural.length, 0); // 연차 없이 3일 이상 연휴 없음
});

test('대체공휴일 미적용 시 2/9는 근무일', () => {
  const r = plan({ ...Y, budget: 5, substituteOff: false }, HOLIDAYS);
  assert.equal(r.days.find((d) => d.date === '2027-02-09').type, 'work');
  assert.equal(r.days.find((d) => d.date === '2027-02-08').type, 'holiday');
});

test('노동절 미적용 시 5/1은 주말(토), 5/3 대체공휴일은 유지', () => {
  const r = plan({ ...Y, budget: 5, laborOff: false }, HOLIDAYS);
  assert.equal(r.days.find((d) => d.date === '2027-05-01').type, 'weekend');
  assert.equal(r.days.find((d) => d.date === '2027-05-03').type, 'holiday');
});

test('연차 불가 기간 안에는 연차를 배치하지 않는다', () => {
  const r = plan({ ...Y, budget: 15, blackout: [{ start: '2027-09-01', end: '2027-09-30' }] }, HOLIDAYS);
  for (const w of r.plan) for (const d of w.leaveDays) assert.ok(d < '2027-09-01' || d > '2027-09-30');
});

test('확정 연차는 예산에서 차감되고 쉬는 날로 처리된다', () => {
  const r = plan({ ...Y, budget: 3, fixedLeave: ['2027-09-13', '2027-09-17'] }, HOLIDAYS);
  assert.equal(r.budgetAfterFixed, 1);
  assert.equal(r.days.find((d) => d.date === '2027-09-13').type, 'leave');
  const over = plan({ ...Y, budget: 1, fixedLeave: ['2027-09-13', '2027-09-17'] }, HOLIDAYS);
  assert.equal(over.ok, false);
});

test('회사 휴무일이 연휴를 늘린다', () => {
  const a = plan({ ...Y, budget: 1 }, HOLIDAYS);
  const b = plan({ ...Y, budget: 1, extraOff: ['2027-09-17'] }, HOLIDAYS);
  const best = (r) => Math.max(...r.longest.map((w) => w.length));
  assert.ok(best(b) > best(a));
});

test('잘못된 입력은 오류 메시지로 거부', () => {
  for (const bad of [
    { ...Y, budget: -1 },
    { ...Y, budget: 1.5 },
    { ...Y, budget: NaN },
    { ...Y, budget: 41 },
    { start: '2027-12-31', end: '2027-01-01', budget: 3 },
    { start: 'x', end: '2027-01-01', budget: 3 },
    { ...Y, budget: 3, minBreak: 8 },
    { ...Y, budget: 3, maxLeavePerBreak: 0 },
    { ...Y, budget: 3, goal: 'max' },
    { start: '2026-01-01', end: '2027-12-31', budget: 3 },
    { ...Y, budget: 3, extraOff: ['2027-13-01'] },
  ]) {
    const r = plan(bad, HOLIDAYS);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(r.errors.length > 0);
  }
});

test('경계값: 연차 0일, 하루짜리 기간, 연도 경계', () => {
  const zero = plan({ ...Y, budget: 0 }, HOLIDAYS);
  assert.ok(zero.ok);
  assert.equal(zero.plan.length, 0);
  const one = plan({ start: '2027-09-15', end: '2027-09-15', budget: 3 }, HOLIDAYS);
  assert.ok(one.ok);
  const cross = plan({ start: '2026-12-20', end: '2027-01-10', budget: 5, minBreak: 4 }, HOLIDAYS);
  assert.ok(cross.ok);
  assert.ok(cross.plan.length >= 1);
});

test('ICS: 종일 일정, DTEND 배타적, CRLF', () => {
  const r = plan({ ...Y, budget: 2 }, HOLIDAYS);
  const ics = toICS(r.plan, { stamp: new Date('2026-10-14T00:00:00Z') });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.match(ics, /DTSTART;VALUE=DATE:20270911\r\nDTEND;VALUE=DATE:20270920/);
  assert.match(ics, /DTSTART;VALUE=DATE:20270913\r\nDTEND;VALUE=DATE:20270914/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, (ics.match(/END:VEVENT/g) || []).length);
});

test('연차 신청 문구', () => {
  const r = plan({ ...Y, budget: 2 }, HOLIDAYS);
  const t = leaveRequestText(r.plan);
  assert.match(t, /총 2일/);
  assert.match(t, /2027\.09\.13\(월\)/);
  assert.equal(leaveRequestText([]), '');
});

test('공유 링크 상태 왕복', () => {
  const base = defaultState('2026-10-14', [2026, 2027]);
  assert.equal(base.year, 2027);
  assert.equal(defaultState('2026-03-01', [2026, 2027]).year, 2026);
  const s = { ...base, budget: 7, holidaysOff: false, extraOff: ['2027-03-02'], fixedLeave: ['2027-09-13'], blackout: [{ start: '2027-12-01', end: '2027-12-31' }] };
  const back = decodeState(encodeState(s), base);
  assert.deepEqual(back, s);
  assert.equal(decodeState('', base), null);
  const junk = decodeState('y=2027&b=abc&x=2027-02-31,hello&k=2027-05-01_2027-04-01', base);
  assert.equal(junk.budget, base.budget);
  assert.deepEqual(junk.extraOff, []);
  assert.deepEqual(junk.blackout, []);
});

test('여행 링크: 날짜 포함, 제휴 미설정 시 제휴 파라미터 없음', () => {
  const tyo = DESTINATIONS.find((d) => d.id === 'tyo');
  const f = new URL(flightUrl(tyo, '2027-09-11', '2027-09-19'));
  assert.equal(f.hostname, 'kr.trip.com');
  assert.equal(f.searchParams.get('ddate'), '2027-09-11');
  assert.equal(f.searchParams.get('rdate'), '2027-09-19');
  assert.equal(f.searchParams.get('Allianceid'), null);
  const h = new URL(hotelUrl(tyo, '2027-09-11', '2027-09-19'));
  assert.equal(h.searchParams.get('cityId'), '228');
  assert.equal(hotelUrl(DESTINATIONS.find((d) => d.id === 'fuk'), '2027-09-11', '2027-09-19'), null);
});

test('공휴일 점검 스크립트: 차이 감지와 알려진 차이 제외', async () => {
  const { compare } = await import('../scripts/check-holidays.mjs');
  const table = { 2027: [['2027-02-06', '설날 연휴', 'holiday'], ['2027-03-01', '3·1절', 'holiday']] };
  const ev = [
    { date: '2027-03-01', summary: '삼일절' },
    { date: '2027-04-05', summary: '식목일' },
    { date: '2027-06-03', summary: '임시공휴일' },
  ];
  const r = compare(ev, table, new Date('2026-10-14'));
  assert.deepEqual(r, ['2027: 공개 캘린더에만 있음 → 2027-06-03 임시공휴일']);
  const next = Array.from({ length: 16 }, (_, i) => ({ date: `2028-01-${String(i + 1).padStart(2, '0')}`, summary: 'x' }));
  assert.equal(compare([...ev, ...next], table, new Date('2026-10-14')).length, 1);
  assert.equal(compare([...ev, ...next], table, new Date('2027-07-01')).length, 2);
});
