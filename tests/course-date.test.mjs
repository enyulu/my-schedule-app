import test from 'node:test';
import assert from 'node:assert/strict';
import { courseDateSelection } from '../src/courseDate.js';

test('course calendar date maps to the correct Monday and weekday', () => {
  assert.deepEqual(courseDateSelection('2026-10-28'), { date: '2026-10-28', weekId: '2026-10-26', colIndex: 2 });
  assert.deepEqual(courseDateSelection('2026-11-01'), { date: '2026-11-01', weekId: '2026-10-26', colIndex: 6 });
  assert.deepEqual(courseDateSelection('2026-11-02'), { date: '2026-11-02', weekId: '2026-11-02', colIndex: 0 });
});
test('calendar selection rejects missing and impossible dates without rollover', () => {
  assert.equal(courseDateSelection(''), null);
  assert.equal(courseDateSelection('2026-02-30'), null);
  assert.equal(courseDateSelection('2026-13-01'), null);
  assert.equal(courseDateSelection('2024-02-29').date, '2024-02-29');
});
