// 공개 대한민국 공휴일 캘린더(ICS)와 저장소 데이터를 비교한다.
// 차이가 있으면 종료 코드 1과 함께 diff를 출력한다 (운영 데이터는 바꾸지 않음).
// 네트워크 실패는 종료 코드 2 (데이터 문제와 구분).
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { HOLIDAYS } from '../assets/holidays.js';

const ICS_URL = 'https://calendar.google.com/calendar/ical/ko.south_korea%23holiday%40group.v.calendar.google.com/public/basic.ics';
// 공휴일이 아닌 기념일 (정확히 일치하는 이름만 제외. 새 이름은 공휴일 후보로 보고 알린다)
const OBSERVANCES = new Set(['식목일', '어버이날', '스승의날', '국군의날', '크리스마스 이브', '섣달 그믐날']);

// 공개 캘린더와 차이가 있지만 월력요항 기준으로 확인된 날짜 (사유 기록)
const KNOWN_DIFF = {
  '2027-02-06': '설 연휴 첫날(토). 공개 캘린더는 생략하지만 월력요항상 공휴일(설 전날)',
};

export function parseIcs(text) {
  const events = [];
  for (const block of text.split('BEGIN:VEVENT').slice(1)) {
    const unfolded = block.replace(/\r?\n[ \t]/g, '');
    const date = unfolded.match(/DTSTART;VALUE=DATE:(\d{8})/)?.[1];
    const summary = unfolded.match(/SUMMARY:(.*)/)?.[1]?.trim();
    if (date && summary) events.push({ date: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}`, summary });
  }
  return events;
}

export function compare(events, table, today = new Date()) {
  const report = [];
  for (const year of Object.keys(table)) {
    const ours = new Set(table[year].map(([d]) => d));
    const theirs = new Map();
    for (const e of events) if (e.date.startsWith(year) && !OBSERVANCES.has(e.summary)) theirs.set(e.date, e.summary);
    const missing = [...theirs].filter(([d]) => !ours.has(d));
    const extra = [...ours].filter((d) => !theirs.has(d) && !KNOWN_DIFF[d]);
    if (!theirs.size) {
      report.push(`${year}: 공개 캘린더에 해당 연도 데이터가 없음 (비교 생략)`);
      continue;
    }
    for (const [d, n] of missing) report.push(`${year}: 공개 캘린더에만 있음 → ${d} ${n}`);
    for (const d of extra) report.push(`${year}: 저장소에만 있음 → ${d}`);
  }
  const years = new Set(events.map((e) => e.date.slice(0, 4)));
  const nextYear = String(Math.max(...Object.keys(table).map(Number)) + 1);
  // 다음 해 월력요항은 전년도 6월경 발표된다. 그 전에 공개 캘린더에 있는 값은 추정치라 알리지 않는다.
  const announced = today >= new Date(`${Number(nextYear) - 1}-06-01T00:00:00Z`);
  const newYears = announced ? [...years].filter((y) => y === nextYear) : [];
  for (const y of newYears) {
    const n = events.filter((e) => e.date.startsWith(y) && !OBSERVANCES.has(e.summary)).length;
    if (n >= 15) report.push(`${y}: 공개 캘린더에 ${y}년 공휴일 ${n}건이 있음 → 우주항공청 월력요항(매년 6월경 발표) 확인 후 데이터 추가 필요`);
  }
  return report;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  let text;
  try {
    const res = await fetch(ICS_URL, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    text = await res.text();
  } catch (e) {
    console.error(`공개 캘린더를 가져오지 못했습니다: ${e.message}`);
    process.exitCode = 2;
  }
  if (text !== undefined) {
  const report = compare(parseIcs(text), HOLIDAYS);
  const actionable = report.filter((l) => !l.includes('비교 생략'));
  console.log(report.length ? report.join('\n') : '차이 없음');
  if (process.env.REPORT_FILE) writeFileSync(process.env.REPORT_FILE, actionable.join('\n'));
  process.exitCode = actionable.length ? 1 : 0;
  }
}
