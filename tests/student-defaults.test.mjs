import test from 'node:test';
import assert from 'node:assert/strict';
import { studentTimeZoneDefault } from '../src/studentDefaults.js';
test('timezone default skips old same-name courses without a timezone', () => {
  assert.equal(studentTimeZoneDefault([{ title: 'Nina', weekId: '2026-10-26' }, { title: 'Nina', studentTimeZone: 'Europe/London', weekId: '2026-10-19' }], 'Nina'), 'Europe/London');
});
test('explicit latest Beijing preference overrides older overseas defaults', () => {
  const rows = [{ title: 'Nina', studentTimeZone: 'Europe/London', studentTimeZoneUpdatedAt: 10 }, { title: 'Nina', studentTimeZone: 'Asia/Shanghai', studentTimeZoneUpdatedAt: 20 }];
  assert.equal(studentTimeZoneDefault(rows, 'Nina'), 'Asia/Shanghai');
  assert.equal(studentTimeZoneDefault(rows, 'Nina CS'), '');
});
