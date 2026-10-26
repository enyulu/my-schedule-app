import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const context = vm.createContext({ Date, TAGS: { A: {}, B: {}, P: {} }, COURSE_TIME_PATTERN: /^([01]\d|2[0-3]):([0-5]\d)$/ });
vm.runInContext(source.slice(source.indexOf('const getMonday ='), source.indexOf('// --- Gemini API'))
  + source.slice(source.indexOf('const getCourseTotalValue ='), source.indexOf('export default function App'))
  + '\nglobalThis.collect = collectCompletedLessons;', context);
const collect = context.collect;
const base = { id: 'one', title: 'Jayden', colIndex: 0, startTime: '09:00', endTime: '10:30', price: 400, category: 'P', isFixed: false, weekId: '2026-10-26' };

test('report occurrences reuse existing fee calculation and completion cutoff', () => {
  const result = collect([base, { ...base, id: 'future', colIndex: 2 }], { start: '2026-10-26', end: '2026-10-31' }, new Date(2026, 9, 26, 12));
  assert.equal(result.length, 1);
  assert.equal(result[0].fee, 600);
  assert.equal(result[0].endsAt, +new Date(2026, 9, 26, 10, 30));
  assert.equal(result[0].isFixed, false);
});

test('report opt-in includes future and cross-month scheduled courses, default statistics do not', () => {
  const course = { ...base, colIndex: 5, startTime: '23:00', endTime: '00:30' };
  const range = { start: '2026-10-01', end: '2026-10-31' }, monthEnd = new Date(2026, 9, 31, 23, 59, 59, 999);
  assert.equal(collect([course], range, monthEnd).length, 0);
  const rows = collect([course], range, monthEnd, { includeUnfinished: true });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2026-10-31');
  assert.equal(rows[0].fee, 600);
});

test('report forecast continues to exclude cancelled and explicitly incomplete courses', () => {
  const result = collect([{ ...base, status: 'cancelled' }, { ...base, completed: false }], { start: '2026-10-01', end: '2026-10-31' }, new Date(2026, 9, 31), { includeUnfinished: true });
  assert.equal(result.length, 0);
});
