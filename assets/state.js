// 설정 ↔ URL 쿼리 변환 (공유 링크용). 개인정보는 담지 않는다: 날짜와 숫자 설정만.
import { isValidDate } from './engine.js';

const bool = (v, d) => (v === '1' ? true : v === '0' ? false : d);
const int = (v, d) => (v != null && /^\d+$/.test(v) ? Number(v) : d);
const dates = (v) => (v ? v.split(',').filter(isValidDate) : []);

export function defaultState(today, years) {
  const cur = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  // 10월 이후에는 내년 계획 수요가 커서, 내년 데이터가 있으면 내년을 기본으로
  const y = month >= 10 && years.includes(cur + 1) ? cur + 1 : years.includes(cur) ? cur : Math.max(...years);
  return {
    year: y,
    mode: 'leave',
    start: null,
    end: null,
    budget: 15,
    maxLeavePerBreak: 5,
    minBreak: 4,
    goal: 'long',
    holidaysOff: true,
    substituteOff: true,
    laborOff: true,
    extraOff: [],
    fixedLeave: [],
    blackout: [],
  };
}

export function encodeState(s) {
  const p = new URLSearchParams();
  p.set('y', String(s.year));
  if (s.mode === 'free') p.set('mode', 'free');
  p.set('b', String(s.budget));
  p.set('m', String(s.maxLeavePerBreak));
  p.set('l', String(s.minBreak));
  if (s.goal === 'total') p.set('g', 'total');
  if (!s.holidaysOff) p.set('h', '0');
  if (!s.substituteOff) p.set('s', '0');
  if (!s.laborOff) p.set('lab', '0');
  if (s.start) p.set('from', s.start);
  if (s.end) p.set('to', s.end);
  if (s.extraOff.length) p.set('x', s.extraOff.join(','));
  if (s.fixedLeave.length) p.set('f', s.fixedLeave.join(','));
  if (s.blackout.length) p.set('k', s.blackout.map((r) => `${r.start}_${r.end}`).join(','));
  return p.toString();
}

export function decodeState(query, base) {
  const p = new URLSearchParams(query);
  if (!p.has('y') && !p.has('b')) return null;
  const s = { ...base };
  s.year = int(p.get('y'), base.year);
  s.mode = p.get('mode') === 'free' ? 'free' : 'leave';
  s.budget = int(p.get('b'), base.budget);
  s.maxLeavePerBreak = int(p.get('m'), base.maxLeavePerBreak);
  s.minBreak = int(p.get('l'), base.minBreak);
  s.goal = p.get('g') === 'total' ? 'total' : 'long';
  s.holidaysOff = bool(p.get('h'), true);
  s.substituteOff = bool(p.get('s'), true);
  s.laborOff = bool(p.get('lab'), true);
  s.start = isValidDate(p.get('from')) ? p.get('from') : null;
  s.end = isValidDate(p.get('to')) ? p.get('to') : null;
  s.extraOff = dates(p.get('x'));
  s.fixedLeave = dates(p.get('f'));
  s.blackout = (p.get('k') || '')
    .split(',')
    .map((r) => r.split('_'))
    .filter(([a, b]) => isValidDate(a) && isValidDate(b) && a <= b)
    .map(([start, end]) => ({ start, end }));
  return s;
}
