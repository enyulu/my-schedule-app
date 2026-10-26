import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyReport, createMonthlyReportCsv, collectReportLessons } from '../src/monthlyReports.js';

const now = new Date(2026, 9, 26, 12);
const lesson = (month, day, hour, minutes = 60, fee = 240, extra = {}) => {
  const start = new Date(2026, month - 1, day, hour);
  return { key: `${month}-${day}-${hour}`, date: `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, startsAt: +start, endsAt: +start + minutes * 60000, startTime: `${hour}:00`, minutes, fee, student: 'Jayden', studentKey: 'jayden', category: 'A', isFixed: true, ...extra };
};
const report = lessons => buildMonthlyReport({ lessons, month: '2026-10', windowMonths: 6, now });

test('weighted hourly fee, category/student/recurrence sums and pending forecast use actual durations', () => {
  const result = report([lesson(10, 1, 10), lesson(10, 2, 10, 90, 600, { category: 'P', studentKey: 'nina', student: 'Nina', isFixed: false }), lesson(10, 27, 10, 60, 400)]);
  assert.equal(result.completed.count, 2);
  assert.equal(result.completed.minutes, 150);
  assert.equal(result.completed.fee, 840);
  assert.equal(result.completed.avgRate, 336);
  assert.equal(result.completed.studentCount, 2);
  assert.equal(result.scheduled.fee, 400);
  assert.equal(result.projectedFee, 1240);
  for (const groups of [result.categories, result.students, result.recurrence]) {
    assert.equal(groups.reduce((n, g) => n + g.fee, 0), 840);
    assert.equal(groups.reduce((n, g) => n + g.minutes, 0), 150);
  }
});

test('current month compares against last month through same local day and time', () => {
  const result = report([lesson(9, 26, 10), lesson(9, 26, 12), lesson(9, 27, 10), lesson(10, 26, 10), lesson(10, 26, 12)]);
  assert.equal(result.comparisonLabel, '较上月同期');
  assert.equal(result.previous.count, 1);
  assert.equal(result.completed.count, 1);
  assert.equal(result.scheduled.count, 1);
  assert.equal(result.feeChange, 0);
});

test('past months compare full months and historical prices and categories stay separate', () => {
  const result = buildMonthlyReport({ lessons: [lesson(8, 31, 10, 60, 240), lesson(9, 30, 23, 90, 600, { category: 'P' })], month: '2026-09', windowMonths: 6, now });
  assert.equal(result.comparisonLabel, '较完整上月');
  assert.equal(result.previous.fee, 240);
  assert.equal(result.completed.fee, 600);
  assert.equal(result.categories.find(c => c.key === 'P').count, 1);
  assert.equal(result.months.find(m => m.month === '2026-08').fee, 240);
});

test('month end comparison clamps to shorter previous month', () => {
  const result = buildMonthlyReport({ lessons: [lesson(2, 28, 10), lesson(2, 28, 13)], month: '2026-03', now: new Date(2026, 2, 31, 12), windowMonths: 6 });
  assert.equal(result.previous.count, 1);
});

test('empty report has finite zeros, unavailable average and no fabricated growth', () => {
  const result = report([]);
  assert.equal(result.completed.avgRate, null);
  assert.equal(result.feeChange, null);
  assert.equal(result.months.length, 6);
  assert.ok(!JSON.stringify(result).includes('NaN'));
});

test('unknown categories remain included and a learner is counted once', () => {
  const result = report([lesson(10, 1, 10, 45, 180, { category: 'legacy' }), lesson(10, 2, 10, 30, 120, { category: '' })]);
  assert.equal(result.categories.find(c => c.key === 'unclassified').count, 2);
  assert.equal(result.students.length, 1);
  assert.equal(result.students[0].minutes, 75);
});

test('heatmap splits overnight course duration between weekdays', () => {
  const result = report([lesson(10, 4, 23, 90, 600)]);
  assert.equal(result.heatmap[23][6], 60);
  assert.equal(result.heatmap[0][0], 30);
  assert.equal(result.heatmap.flat().reduce((n, minutes) => n + minutes, 0), 90);
});

test('CSV quotes student names and guards spreadsheet formulas', () => {
  const result = report([lesson(10, 1, 10, 60, 240, { student: '=HYPERLINK("x")' })]);
  const csv = createMonthlyReportCsv(result);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes('""x""'));
  assert.ok(csv.includes('2026-10'));
});

test('export retains current cutoff and warns when historical recurring starts are missing', () => {
  const result = report([]);
  const csv = createMonthlyReportCsv({ ...result, undatedCount: 2 });
  assert.ok(csv.includes('2026-10-26 12:00'));
  assert.ok(csv.includes('2条固定课程缺少起始周'));
  assert.ok(csv.includes('历史可能不完整'));
});

test('future or malformed month is rejected and trend window is limited', () => {
  assert.throws(() => buildMonthlyReport({ lessons: [], month: '2026-13', now }));
  assert.throws(() => buildMonthlyReport({ lessons: [], month: '2026-11', now }));
  assert.equal(buildMonthlyReport({ lessons: [], month: '2026-10', windowMonths: 1200, now }).months.length, 12);
});

test('undated recurring lessons are excluded from speculative history but retained from current Monday', () => {
  const result = collectReportLessons({
    courses: [{ id: 'legacy', isFixed: true }, { id: 'dated', isFixed: true, baseWeekId: '2026-09-28' }],
    month: '2026-10', windowMonths: 6, now,
    collectLessons: () => [
      { ...lesson(10, 19, 10), key: 'legacy|past' },
      { ...lesson(10, 26, 10), key: 'legacy|today' },
      { ...lesson(10, 19, 10), key: 'dated|past' },
    ],
  });
  assert.equal(result.undatedCount, 1);
  assert.deepEqual(result.lessons.map(row => row.key), ['legacy|today', 'dated|past']);
});
