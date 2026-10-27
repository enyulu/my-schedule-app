import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWallTime, zonedParts, convertBeijingLesson, occurrenceDate, nextOffsetChange, beijingPlacement } from '../src/timeZones.js';

test('US West follows actual summer/winter dates, independently of device timezone', () => {
  assert.equal(convertBeijingLesson('2026-07-15', '20:00', 60, 'America/Los_Angeles').start.time, '05:00');
  assert.equal(convertBeijingLesson('2026-12-15', '20:00', 60, 'America/Los_Angeles').start.time, '04:00');
});
test('US Central, UK and Thailand use the correct city offsets', () => {
  assert.equal(convertBeijingLesson('2026-07-15', '20:00', 60, 'America/Chicago').start.time, '07:00');
  assert.equal(convertBeijingLesson('2026-07-15', '20:00', 60, 'Europe/London').start.time, '13:00');
  assert.equal(convertBeijingLesson('2026-12-15', '20:00', 60, 'Europe/London').start.time, '12:00');
  assert.equal(convertBeijingLesson('2026-07-15', '20:00', 60, 'Asia/Bangkok').start.time, '19:00');
});
test('date rollover explicitly retains the previous day and correct ending date', () => {
  const result = convertBeijingLesson('2026-10-26', '08:00', 90, 'America/Los_Angeles');
  assert.equal(result.start.date, '2026-10-25');
  assert.equal(result.start.time, '17:00');
  assert.equal(result.start.dayOffset, -1);
  const overnight = convertBeijingLesson('2026-10-26', '23:30', 90, 'Asia/Shanghai');
  assert.equal(overnight.end.date, '2026-10-27');
  assert.equal(overnight.end.time, '01:00');
});
test('spring-forward nonexistent local time cannot be applied', () => {
  const result = resolveWallTime('2026-03-08', '02:30', 'America/Los_Angeles');
  assert.equal(result.status, 'nonexistent');
  assert.equal(result.instants.length, 0);
});
test('fall-back duplicated hour returns two distinct choices in chronological order', () => {
  const result = resolveWallTime('2026-11-01', '01:30', 'America/Los_Angeles');
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.instants.length, 2);
  assert.equal(result.instants[1] - result.instants[0], 3600000);
  assert.equal(zonedParts(result.instants[0], 'Asia/Shanghai').time, '16:30');
  assert.equal(zonedParts(result.instants[1], 'Asia/Shanghai').time, '17:30');
});
test('UK and US switch on different dates, so transition week must not use today’s offset', () => {
  assert.equal(convertBeijingLesson('2026-10-26', '20:00', 60, 'Europe/London').start.time, '12:00');
  assert.equal(convertBeijingLesson('2026-10-26', '20:00', 60, 'America/Los_Angeles').start.time, '05:00');
  assert.equal(convertBeijingLesson('2026-11-02', '20:00', 60, 'America/Los_Angeles').start.time, '04:00');
});
test('reverse conversion fills the Beijing date, week, weekday and time', () => {
  const result = resolveWallTime('2026-10-25', '17:00', 'America/Los_Angeles');
  assert.equal(result.status, 'valid');
  const placement = beijingPlacement(result.instants[0]);
  assert.deepEqual(placement, { date: '2026-10-26', weekId: '2026-10-26', colIndex: 0, startTime: '08:00' });
  assert.equal(occurrenceDate('2026-10-26', 6), '2026-11-01');
});
test('fixed Beijing time is retained while next US DST change is surfaced', () => {
  const change = nextOffsetChange('2026-10-26', '20:00', 60, 'America/Los_Angeles', 7);
  assert.equal(change.date, '2026-11-02');
  assert.equal(change.start.time, '04:00');
  assert.equal(nextOffsetChange('2026-10-26', '20:00', 60, 'Asia/Bangkok', 7), null);
});
test('invalid dates, times and timezones are rejected rather than rolled over', () => {
  for (const [date, time, zone] of [['2026-02-30', '10:00', 'Asia/Shanghai'], ['2026-10-26', '25:00', 'Asia/Shanghai'], ['', '10:00', 'Asia/Shanghai'], ['2026-10-26', '10:00', 'not/a/zone']]) {
    assert.equal(resolveWallTime(date, time, zone).status, 'invalid');
  }
});
