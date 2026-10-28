import test from 'node:test';
import assert from 'node:assert/strict';
import { hoursToMinutes, collectTuitionOccurrences, calculateTuition, formatTuitionStatement } from '../src/tuitionPackages.js';

const now = Date.parse('2026-10-30T16:00:00Z');
const startsAt = Date.parse('2026-10-26T00:00:00+08:00');
const account = { id: 'math', studentName: 'Nina', subject: 'Math', category: 'A', startsAt, reminderMinutes: 120 };
const course = { id: 'wed', title: 'Nina', category: 'A', colIndex: 2, startTime: '14:00', endTime: '15:30', isFixed: true, baseWeekId: '2026-10-26' };
const binding = { id: 'wed', courseId: 'wed', segments: [{ fromKey: '2026-10-26|00:00', toKey: null, accountId: 'math' }] };
const pack = { id: 'first', accountId: 'math', minutes: 600, effectiveAt: startsAt, createdAt: 1 };
const collect = (courses = [course], at = now) => collectTuitionOccurrences({ courses, fromDate: '2026-10-26', now: at });
const calc = (overrides = {}) => calculateTuition({ accounts: [account], packages: [pack], bindings: [binding], adjustments: [], occurrences: collect().occurrences, now, ...overrides }).accounts[0];

test('minute units and actual course duration are not lesson counts', () => {
  for (const [hours, minutes] of [[0.5, 30], [0.75, 45], [1, 60], [1.5, 90], [2, 120]]) assert.equal(hoursToMinutes(hours), minutes);
  for (const value of [0, -1, '', 'x', Infinity]) assert.throws(() => hoursToMinutes(value));
  assert.equal(calc().usedMinutes, 90);
  assert.equal(calc().remainingMinutes, 510);
});
test('future, ongoing, cancelled and incomplete courses do not consume credit', () => {
  assert.equal(collect([course], Date.parse('2026-10-28T15:00:00+08:00')).occurrences.length, 0);
  for (const extra of [{ cancelled: true }, { status: 'cancelled' }, { completed: false }]) assert.equal(collect([{ ...course, ...extra }]).occurrences.length, 0);
  assert.equal(collect([course], Date.parse('2026-10-28T15:30:00+08:00')).occurrences.length, 1);
});
test('overnight end is evaluated in Beijing, independently of device timezone', () => {
  const late = { ...course, startTime: '23:00', endTime: '00:30' };
  assert.equal(collect([late], Date.parse('2026-10-29T00:29:00+08:00')).occurrences.length, 0);
  const rows = collect([late], Date.parse('2026-10-29T00:30:00+08:00')).occurrences;
  assert.equal(rows[0].minutes, 90);
  assert.equal(rows[0].endsAt, Date.parse('2026-10-29T00:30:00+08:00'));
});
test('continuation begins at the selected lesson, never at the beginning of its week', () => {
  const rows = collect([{ ...course, id: 'mon', colIndex: 0 }, { ...course, id: 'early', startTime: '10:00', endTime: '11:00' }, course]).occurrences;
  const result = calc({ accounts: [{ ...account, startsAt: Date.parse('2026-10-28T14:00:00+08:00') }], packages: [{ ...pack, minutes: 210 }], occurrences: rows, bindings: [binding, ...['mon', 'early'].map(id => ({ ...binding, id, courseId: id }))] });
  assert.equal(result.usedMinutes, 90);
  assert.equal(result.remainingMinutes, 120);
});
test('old package first and cross-batch allocation are deterministic and do not write deductions', () => {
  const args = { packages: [{ ...pack, minutes: 30 }, { ...pack, id: 'next', minutes: 600, createdAt: 2 }] };
  const result = calc(args);
  assert.equal(result.packages[0].usedMinutes, 30);
  assert.equal(result.packages[1].usedMinutes, 60);
  assert.equal(result.remainingMinutes, 540);
  assert.equal(calc(args).remainingMinutes, 540);
});
test('independent learners and subjects never share balances, even with identical names', () => {
  const all = calculateTuition({ accounts: [account, { ...account, id: 'english', subject: 'English' }, { ...account, id: 'other' }], packages: [pack], bindings: [binding], adjustments: [], occurrences: collect().occurrences, now }).accounts;
  assert.deepEqual(all.map(row => row.remainingMinutes), [510, 0, 0]);
  const duplicate = collect().occurrences;
  assert.equal(calc({ occurrences: [...duplicate, ...duplicate] }).usedMinutes, 90);
});
test('delete and cancel recompute refunds; ending a fixed series retains prior consumption', () => {
  assert.equal(calc({ occurrences: [] }).remainingMinutes, 600);
  assert.equal(collect([{ ...course, excludedWeeks: ['2026-10-26'] }]).occurrences.length, 0);
  assert.equal(collect([{ ...course, endWeekId: '2026-11-02' }]).occurrences.length, 1);
});
test('unbound and orphaned rows produce warnings instead of name matching', () => {
  assert.equal(calc({ bindings: [] }).usedMinutes, 0);
  const result = calculateTuition({ accounts: [account], packages: [pack], bindings: [{ ...binding, segments: [{ fromKey: '2026-10-26|00:00', accountId: 'missing' }] }], occurrences: collect().occurrences, adjustments: [], now });
  assert.ok(result.warnings.length);
});
test('renewal covers oldest debt only after its effective time and explicit debt coverage', () => {
  const renewal = { ...pack, effectiveAt: Date.parse('2026-10-29T00:00:00+08:00'), coverDebt: true };
  assert.equal(calc({ packages: [] }).remainingMinutes, -90);
  assert.equal(calc({ packages: [renewal] }).remainingMinutes, 510);
  assert.equal(calc({ packages: [{ ...renewal, coverDebt: false }] }).debtMinutes, 90);
  assert.equal(calc({ packages: [{ ...renewal, effectiveAt: now + 1 }] }).remainingMinutes, -90);
});
test('adjustments require a reason and voided purchases do not fund lessons', () => {
  assert.equal(calc({ adjustments: [{ id: 'gift', accountId: 'math', minutes: 30, reason: '赠送', effectiveAt: startsAt }] }).remainingMinutes, 540);
  assert.equal(calc({ packages: [{ ...pack, voided: true }] }).remainingMinutes, -90);
  assert.ok(calc({ adjustments: [{ id: 'bad', accountId: 'math', minutes: 30, effectiveAt: startsAt }] }).warnings.length);
  assert.match(formatTuitionStatement(calc(), account), /剩余.*8.5/);
});

test('biweekly cadence and precise source end preserve each occurrence exactly once', () => {
  const fortnight = { ...course, isBiweekly: true, baseWeekId: '2026-10-12', endWeekId: '2026-11-09' };
  const rows = collectTuitionOccurrences({ courses: [fortnight], fromDate: '2026-10-12', now: Date.parse('2026-11-10T00:00:00+08:00') }).occurrences;
  assert.deepEqual(rows.map(row => row.date), ['2026-10-14', '2026-10-28']);
});
