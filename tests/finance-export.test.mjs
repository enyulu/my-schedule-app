import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFinanceExport, createFinanceCsv } from '../src/financeExport.js';

test('finance export retains completed legacy categories and free courses', () => {
  const courses = [{ id: 'a', title: 'Learner A' }, { id: 'b', title: 'Learner B' }];
  const lessons = [
    { courseId: 'a', category: 'LEGACY', date: '2026-11-02', startTime: '10:00', endTime: '11:30', minutes: 90, fee: 450 },
    { courseId: 'b', category: 'A', date: '2026-11-02', startTime: '12:00', endTime: '13:00', minutes: 60, fee: 0 },
  ];
  const result = buildFinanceExport({ courses, lessons });
  assert.equal(result.count, 2);
  assert.equal(result.totalAll, 450);
  assert.equal(result.details.unclassified[0].duration, '1.5 小时');
  const free = buildFinanceExport({ courses, lessons, courseFilter: 'Learner B' });
  assert.equal(free.totalAll, 0);
  assert.equal(free.count, 1);
  assert.match(createFinanceCsv(free), /Learner B/);
});

test('finance CSV preserves commas and protects titles and notes against spreadsheet formulas', () => {
  const courses = [{ id: 'a', title: '=1+1, "test"', notes: ' @SUM(1,2)' }];
  const lessons = [{ courseId: 'a', category: 'unclassified', date: '2026-11-02', startTime: '10:00', endTime: '11:00', minutes: 60, fee: 100 }];
  const csv = createFinanceCsv(buildFinanceExport({ courses, lessons }));
  assert.match(csv, /"未分类"/);
  assert.ok(csv.includes(`"'=1+1, ""test"""`));
  assert.ok(csv.includes(`"' @SUM(1,2)"`));
  assert.match(csv, /"未分类合计","","","","","100",""/);
});
