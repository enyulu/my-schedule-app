import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinanceExport } from '../src/financeExport.js';
import { filterKnownOccurrences } from '../src/monthlyReports.js';
const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const context = vm.createContext({ Date, TAGS: { A: {}, B: {}, P: {} }, COURSE_TIME_PATTERN: /^([01]\d|2[0-3]):([0-5]\d)$/ });
vm.runInContext(source.slice(source.indexOf('const getMonday ='), source.indexOf('// --- Gemini API'))
  + source.slice(source.indexOf('const getCourseTotalValue ='), source.indexOf('export default function App'))
  + '\nglobalThis.collect = collectCompletedLessons;', context);
const collect = context.collect;
const base = { id: 'one', title: 'Jayden', colIndex: 0, startTime: '09:00', endTime: '10:30', price: 400, category: 'P', isFixed: false, weekId: '2026-10-26' };

test('stored hourly rate is authoritative regardless of learner name or legacy dates', () => {
  for (const title of ['David 商务', '芮彤数学', 'Jayden']) {
    const row = { ...base, title, startTime: '09:00', endTime: '11:00', price: 500, weekId: '2026-04-27' };
    assert.equal(collect([row], { start: '2026-04-27', end: '2026-04-27' }, new Date(2026, 3, 28))[0].fee, 1000);
    row.weekId = '2026-11-16';
    assert.equal(collect([row], { start: '2026-11-16', end: '2026-11-16' }, new Date(2026, 10, 17))[0].fee, 1000);
  }
});

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

test('financial export counts a completed overnight lesson by its start date even when it ends after the selected range', () => {
  const course = { ...base, colIndex: 5, startTime: '23:00', endTime: '00:30' };
  const start = source.indexOf('  const exportResult = useMemo');
  const calculation = source.slice(start, source.indexOf('  const applyCourseBindings', start));
  Object.assign(context, {
    courses: [course], statisticsCourses: [course], isExportModalOpen: true, exportCourseFilter: '',
    exportRange: { start: '2026-10-01', end: '2026-10-31' }, statisticsNow: new Date(2026, 10, 2),
    useMemo: fn => fn(), buildFinanceExport, filterKnownOccurrences, getCourseDisplayInfo: row => ({ title: row.title }),
  });
  const result = vm.runInContext(`${calculation}\nexportResult;`, context);
  assert.equal(result.count, 1);
  assert.equal(result.details.P[0].date, '2026-10-31');
  assert.equal(result.totalAll, 600);
});
