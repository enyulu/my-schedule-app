import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCourseReceipt, reconcileCourseSnapshot, stageCourseUndo, sharesCoursePriceScope } from '../src/courseReceipts.js';

const a = { id: 'a', title: 'Fixture', value: 100 }, b = { id: 'b', title: 'Unrelated' };
const changed = { ...a, value: 200 };
test('confirmed operations update only touched courses before listener delivery', () => {
  const pending = new Map(), copy = { ...a, id: 'copy' };
  const rows = applyCourseReceipt([a, b], pending, [{ id: 'a', before: a, after: null }, { id: 'copy', before: null, after: copy }]);
  assert.deepEqual(rows, [b, copy]);
  const old = reconcileCourseSnapshot([a, b], pending, true);
  assert.deepEqual(old.rows, [b, copy]);
  assert.deepEqual(old.verify, ['a', 'copy']);
  assert.deepEqual(reconcileCourseSnapshot([b, copy], pending, true).rows, [b, copy]);
  assert.equal(pending.size, 0);
});
test('unrelated and newer server changes are not overwritten by a receipt', () => {
  const pending = new Map(), newer = { ...a, value: 300 };
  assert.deepEqual(applyCourseReceipt([newer, b], pending, [{ id: 'a', before: a, after: changed }]), [newer, b]);
  applyCourseReceipt([a, b], pending, [{ id: 'a', before: a, after: changed }]);
  assert.deepEqual(reconcileCourseSnapshot([newer, b], pending, true).rows, [newer, b]);
  assert.equal(pending.size, 0);
});
test('undo stages only the affected record and rejects a newer edit to that record', () => {
  const ops = [], batch = { expectUndo() {}, set: (...args) => ops.push(args), delete: id => ops.push([id]), restoreBindings() {} };
  const receipt = { courseChanges: [{ id: 'a', before: a, after: changed }], bindingReceipts: [] };
  stageCourseUndo(batch, receipt, [changed, b], [], id => id);
  assert.deepEqual(ops, [['a', a]]);
  assert.throws(() => stageCourseUndo(batch, receipt, [{ ...changed, notes: 'New' }, b], [], id => id), /后续修改/);
});
test('price propagation requires known matching learner identity and title', () => {
  assert.equal(sharesCoursePriceScope(a, { ...a, id: 'other' }), false);
  assert.equal(sharesCoursePriceScope({ ...a, studentId: 'first' }, { ...a, id: 'other', studentId: 'second' }), false);
  assert.equal(sharesCoursePriceScope({ ...a, studentId: 'first' }, { ...a, id: 'other', studentId: 'first' }), true);
  assert.equal(sharesCoursePriceScope(a, a), true);
});
