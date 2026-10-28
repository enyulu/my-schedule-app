import test from 'node:test';
import assert from 'node:assert/strict';
import { planBindingMutation, bindingAccountAt, calculateTuition, collectTuitionOccurrences, tuitionStartDate } from '../src/tuitionPackages.js';

const original = { id: 'old', title: 'Nina Math', category: 'A', isFixed: true, baseWeekId: '2026-10-05', colIndex: 2, startTime: '10:00', endTime: '11:00' };
const binding = { id: 'old', courseId: 'old', version: 2, segments: [{ fromKey: '2026-10-05|00:00', accountId: 'math', toKey: null }] };
const account = { id: 'math', category: 'A' };
test('fixed series split explicitly inherits future binding, preserving old segment ownership', () => {
  const after = [{ ...original, endWeekId: '2026-10-26' }, { ...original, id: 'future', baseWeekId: '2026-10-26', startTime: '14:00', endTime: '15:00' }];
  const result = planBindingMutation({ beforeCourses: [original], afterCourses: after, bindings: [binding], accounts: [account], inheritances: [{ fromId: 'old', toId: 'future', fromKey: '2026-10-26|00:00' }], selections: [] });
  const future = result.bindingChanges.find(row => row.id === 'future');
  assert.equal(bindingAccountAt(future.data, '2026-10-28|14:00'), 'math');
  assert.equal(bindingAccountAt(binding, '2026-10-14|10:00'), 'math');
});
test('unrelated copies do not acquire a package just because the title matches', () => {
  const result = planBindingMutation({ beforeCourses: [original], afterCourses: [original, { ...original, id: 'copy' }], bindings: [binding], accounts: [account], selections: [], inheritances: [] });
  assert.equal(result.bindingChanges.some(row => row.id === 'copy'), false);
});
test('category changes require explicit reassociation or unbinding from the chosen lesson', () => {
  const args = { beforeCourses: [original], afterCourses: [{ ...original, category: 'P' }], bindings: [binding], accounts: [account], inheritances: [], selections: [] };
  assert.throws(() => planBindingMutation(args), /类别/);
  const result = planBindingMutation({ ...args, selections: [{ courseId: 'old', fromKey: '2026-10-28|10:00', accountId: null }] });
  assert.equal(bindingAccountAt(result.bindingChanges[0].data, '2026-10-21|10:00'), 'math');
  assert.equal(bindingAccountAt(result.bindingChanges[0].data, '2026-10-28|10:00'), null);
});
test('deleted sources are marked for audit rather than deleting purchase history', () => {
  const result = planBindingMutation({ beforeCourses: [original], afterCourses: [], bindings: [binding], accounts: [account], inheritances: [], selections: [] });
  assert.equal(result.bindingChanges[0].data.sourceDeleted, true);
  assert.deepEqual(result.affectedAccountIds, ['math']);
});

test('moving earlier preserves the selected occurrence owner, not the account of its new wall time', () => {
  const source = { ...binding, segments: [{ fromKey: '2026-10-01|00:00', toKey: '2026-10-28|10:00', accountId: 'older' }, { fromKey: '2026-10-28|10:00', accountId: 'math', toKey: null }] };
  const moved = { ...original, id: 'moved', isFixed: false, weekId: '2026-10-26', startTime: '09:00', endTime: '10:00' };
  const result = planBindingMutation({ beforeCourses: [original], afterCourses: [{ ...original, excludedWeeks: ['2026-10-26'] }, moved], bindings: [source], accounts: [account, { ...account, id: 'older' }], relocations: [{ fromId: 'old', toId: 'moved', sourceKey: '2026-10-28|10:00', targetKey: '2026-10-28|09:00', permanent: false }] });
  assert.equal(bindingAccountAt(result.bindingChanges.find(row => row.id === 'moved')?.data, '2026-10-28|09:00'), 'math');
});

test('a moved initial lesson retains onboarding eligibility without lowering other lessons cutoff', () => {
  const source = { ...binding, segments: [{ fromKey: '2026-10-28|10:00', accountId: 'math', toKey: null }] };
  const moved = { ...original, startTime: '09:00', endTime: '10:00' };
  const result = planBindingMutation({ beforeCourses: [original], afterCourses: [moved], bindings: [source], accounts: [account], relocations: [{ fromId: 'old', toId: 'old', sourceKey: '2026-10-28|10:00', targetKey: '2026-10-28|09:00', permanent: true }] });
  const now = Date.parse('2026-10-28T12:00:00+08:00'), start = Date.parse('2026-10-28T10:00:00+08:00');
  const rows = collectTuitionOccurrences({ courses: [moved], fromDate: '2026-10-28', now }).occurrences;
  const calculated = calculateTuition({ accounts: [{ ...account, startsAt: start }], packages: [{ id: 'p', accountId: 'math', minutes: 600, effectiveAt: start }], bindings: result.bindingChanges.map(row => row.data), adjustments: [], occurrences: rows, now });
  assert.equal(calculated.accounts[0].usedMinutes, 60);
  assert.equal(calculated.accounts[0].remainingMinutes, 540);
});

test('recovery omissions are different from explicit deletion and require reconciliation', () => {
  const result = planBindingMutation({ beforeCourses: [original], afterCourses: [], bindings: [binding], accounts: [account], recovery: true });
  assert.equal(result.bindingChanges[0].data.recoveryMissing, true);
});

test('permanent day change translates later package changes and includes initial lesson moved before cutoff day', () => {
  const start = Date.parse('2026-10-28T10:00:00+08:00');
  const source = { ...binding, segments: [{ fromKey: '2026-10-28|10:00', toKey: '2026-11-04|10:00', accountId: 'math' }, { fromKey: '2026-11-04|10:00', accountId: 'next', toKey: null }] };
  const moved = { ...original, id: 'future', colIndex: 1, startTime: '09:00', endTime: '10:00', baseWeekId: '2026-10-26' };
  const accounts = [{ ...account, startsAt: start }, { ...account, id: 'next', startsAt: Date.parse('2026-11-04T10:00:00+08:00') }];
  const result = planBindingMutation({ beforeCourses: [original], afterCourses: [{ ...original, endWeekId: '2026-10-26' }, moved], bindings: [source], accounts, relocations: [{ fromId: 'old', toId: 'future', sourceKey: '2026-10-28|10:00', targetKey: '2026-10-27|09:00', permanent: true }] });
  const newBinding = result.bindingChanges.find(row => row.id === 'future').data;
  assert.equal(bindingAccountAt(newBinding, '2026-10-27|09:00'), 'math');
  assert.equal(bindingAccountAt(newBinding, '2026-11-03|09:00'), 'next');
  assert.equal(tuitionStartDate(accounts, [newBinding], start), '2026-10-27');
});
