import test from 'node:test';
import assert from 'node:assert/strict';
import { createTuitionStore, createCourseWriteBatch } from '../src/tuitionStore.js';
import { stageCourseUndo } from '../src/courseReceipts.js';

const fixture = () => {
  const records = new Map(), listeners = new Map();
  let fail = false, active = true;
  const sdk = {
    collection: (...parts) => parts.slice(1).join('/'), doc: (...parts) => parts.slice(1).join('/'),
    onSnapshot: (path, options, success, error) => { listeners.set(path, { success, error }); return () => listeners.delete(path); },
    runTransaction: async (db, fn) => {
      const pending = [];
      await fn({ get: async path => ({ exists: () => records.has(path), data: () => records.get(path) }), set: (path, row) => pending.push([path, row]), update: (path, row) => pending.push([path, { ...records.get(path), ...row }]), delete: path => pending.push([path, null]) });
      if (fail) throw Error('offline');
      for (const [path, row] of pending) { if (row === null) records.delete(path); else records.set(path, row); }
    },
  };
  const store = createTuitionStore({ db: {}, appId: 'stable-schedule-private-v999', userId: 'A', isCurrentUser: () => active, sdk });
  return { store, records, listeners, sdk, setFail: value => { fail = value; }, deactivate: () => { active = false; } };
};
const accountChange = { collection: 'tuition_accounts', id: 'one', expectedVersion: 0, data: { studentName: 'Nina', subject: 'Math', category: 'A', startsAt: 1, reminderMinutes: 120 } };
test('confirmed receipt preserves raw fields and undo never touches an unrelated later course', async () => {
  const f = fixture(), root = 'artifacts/stable-schedule-private-v999/users/A/';
  const ref = id => root + 'courses/' + id;
  const original = { id: 'c', title: 'Fixture', category: 'A', notes: 'old', legacyField: 'keep' };
  const unrelated = { id: 'later', title: 'Other device', category: 'B' };
  let receipt;
  const make = (beforeCourses, onApplied) => createCourseWriteBatch({ db: {}, appId: 'stable-schedule-private-v999', userId: 'A', isCurrentUser: () => true, sdk: f.sdk, beforeCourses, tuitionState: { status: 'ready', accounts: [], bindings: [] }, onApplied });
  f.records.set(ref('c'), original);
  const forward = make([original], result => { receipt = result; });
  forward.update(ref('c'), { notes: 'updated' });
  f.setFail(true); await assert.rejects(forward.commit(), /offline/); assert.equal(receipt, undefined);
  f.setFail(false); await forward.commit();
  const updated = { ...original, notes: 'updated' };
  assert.deepEqual(receipt.courseChanges, [{ id: 'c', before: original, after: updated }]);
  f.records.set(ref('later'), unrelated);
  const undo = make([updated, unrelated]);
  stageCourseUndo(undo, receipt, [updated, unrelated], [], ref);
  await undo.commit();
  assert.deepEqual(f.records.get(ref('c')), original);
  assert.deepEqual(f.records.get(ref('later')), unrelated);
});

test('undo of a previously unbound copy refuses a binding added later by another device', async () => {
  const f = fixture(), root = 'artifacts/stable-schedule-private-v999/users/A/';
  const ref = id => root + 'courses/' + id;
  const copy = { id: 'copy', title: 'Fixture', category: 'A' };
  const account = { ...accountChange.data, id: 'one', version: 1 };
  const binding = { id: 'copy', courseId: 'copy', version: 1, segments: [{ fromKey: '2026-11-02|09:00', toKey: null, accountId: 'one' }] };
  let receipt;
  const make = (beforeCourses, bindings, onApplied) => createCourseWriteBatch({ db: {}, appId: 'stable-schedule-private-v999', userId: 'A', isCurrentUser: () => true, sdk: f.sdk, beforeCourses, tuitionState: { status: 'ready', accounts: [account], bindings }, onApplied });
  const forward = make([], [], result => { receipt = result; }); forward.set(ref('copy'), copy); await forward.commit();
  f.records.set(root + 'tuition_bindings/copy', binding);
  const undo = make([copy], [binding]);
  assert.throws(() => stageCourseUndo(undo, receipt, [copy], [binding], ref), /课包关联已有后续修改/);
  const staleUndo = make([copy], []);
  stageCourseUndo(staleUndo, receipt, [copy], [], ref);
  await assert.rejects(staleUndo.commit(), /课包关联已被修改/);
  assert.deepEqual(f.records.get(ref('copy')), copy);
});

test('consecutive scoped undos restore package-only edits without rewinding versions', async () => {
  const f = fixture(), root = 'artifacts/stable-schedule-private-v999/users/A/';
  const ref = id => root + 'courses/' + id;
  const course = { id: 'c', title: 'Fixture', category: 'A' };
  const accounts = ['one', 'two'].map(id => ({ ...accountChange.data, id, version: 1 }));
  f.records.set(ref('c'), course);
  accounts.forEach(row => f.records.set(root + 'tuition_accounts/' + row.id, row));
  const bindingPath = root + 'tuition_bindings/c';
  const bindings = () => f.records.has(bindingPath) ? [f.records.get(bindingPath)] : [];
  const receipts = [];
  const make = onApplied => createCourseWriteBatch({ db: {}, appId: 'stable-schedule-private-v999', userId: 'A', isCurrentUser: () => true, sdk: f.sdk, beforeCourses: [course], tuitionState: { status: 'ready', accounts, bindings: bindings() }, onApplied });
  for (const account of accounts) {
    const batch = make(result => receipts.push(result));
    batch.set(ref('c'), course); batch.bindCourse('c', '2026-11-02|09:00', account.id); await batch.commit();
  }
  assert.equal(receipts[0].courseChanges.length, 0);
  for (const receipt of receipts.reverse()) {
    const undo = make(); stageCourseUndo(undo, receipt, [course], bindings(), ref); await undo.commit();
  }
  assert.equal(f.records.get(bindingPath).version, 4);
  assert.deepEqual(f.records.get(bindingPath).segments, []);
  assert.deepEqual(f.records.get(ref('c')), course);
});
test('course-only recovery cannot change or remove an active package-bound lesson', async () => {
  const f = fixture(), root = 'artifacts/stable-schedule-private-v999/users/A/';
  const course = { id: 'c', title: 'Nina', category: 'A', colIndex: 2, startTime: '09:00', endTime: '10:00' };
  const account = { ...accountChange.data, id: 'one', version: 1 };
  const binding = { id: 'c', courseId: 'c', version: 1, segments: [{ fromKey: '2026-11-04|09:00', toKey: null, accountId: 'one' }] };
  f.records.set(root + 'courses/c', course); f.records.set(root + 'tuition_accounts/one', account);
  f.records.set(root + 'tuition_bindings/c', binding); f.records.set(root + 'app_state/tuition_manifest', { courseIds: ['c'], version: 1 });
  const make = () => createCourseWriteBatch({ db: {}, appId: 'stable-schedule-private-v999', userId: 'A', isCurrentUser: () => true, sdk: f.sdk, beforeCourses: [course], tuitionState: { status: 'ready', accounts: [account], bindings: [binding] } });
  for (const replacement of [{ ...course, colIndex: 0 }, null]) {
    const batch = make(); batch.markRecovery();
    batch.set(root + 'app_state/pre_restore_backup', { courses: [course] });
    if (replacement) batch.set(root + 'courses/c', replacement); else batch.delete(root + 'courses/c');
    await assert.rejects(batch.commit(), /课包关联.*恢复/);
    assert.equal(f.records.get(root + 'courses/c'), course);
    assert.equal(f.records.has(root + 'app_state/pre_restore_backup'), false);
  }
  const unchanged = make(); unchanged.markRecovery(); unchanged.set(root + 'courses/c', { ...course });
  await unchanged.commit();
  assert.deepEqual(f.records.get(root + 'courses/c'), course);
});
test('new record and audit commit together under the fixed private user namespace', async () => {
  const { store, records } = fixture();
  await store.commit({ changes: [accountChange], audit: { action: 'create' } });
  const path = 'artifacts/stable-schedule-private-v999/users/A/tuition_accounts/one';
  assert.equal(records.get(path).version, 1);
  assert.equal([...records.keys()].filter(key => key.includes('/tuition_audit/')).length, 1);
});
test('conflict and network failures never partially replace records', async () => {
  const f = fixture();
  await f.store.commit({ changes: [accountChange] });
  await assert.rejects(f.store.commit({ changes: [accountChange] }), /已被修改/);
  f.setFail(true);
  await assert.rejects(f.store.commit({ changes: [{ ...accountChange, id: 'two' }] }));
  assert.equal([...f.records.keys()].filter(key => key.includes('/tuition_accounts/')).length, 1);
});
test('permission errors are not an empty ready account and late snapshots are ignored after unsubscribe', () => {
  const f = fixture(), states = [];
  const close = f.store.subscribe(state => states.push(state));
  const handler = [...f.listeners.values()][0];
  handler.error(Error('permission denied'));
  assert.equal(states.at(-1).status, 'error');
  const count = states.length;
  close();
  handler.success({ docs: [], metadata: { fromCache: false } });
  assert.equal(states.length, count);
});
test('switched user cannot commit the old account draft', async () => {
  const f = fixture(); f.deactivate();
  await assert.rejects(f.store.commit({ changes: [accountChange] }), /账号/);
  assert.equal(f.records.size, 0);
});
test('invalid records and unsupported collections are rejected before any writes', async () => {
  const f = fixture();
  await assert.rejects(f.store.commit({ changes: [{ ...accountChange, collection: 'courses' }] }));
  await assert.rejects(f.store.commit({ changes: [{ ...accountChange, data: { ...accountChange.data, studentName: '' } }] }));
  assert.equal(f.records.size, 0);
});

test('associated course save and binding are atomic, leaving both intact on failure', async () => {
  const f = fixture(), root = 'artifacts/stable-schedule-private-v999/users/A/';
  const course = { id: 'c', title: 'Nina', category: 'A', colIndex: 2, startTime: '10:00', endTime: '11:00', isFixed: true, baseWeekId: '2026-10-26' };
  f.records.set(root + 'courses/c', course);
  f.records.set(root + 'tuition_accounts/one', { ...accountChange.data, id: 'one', version: 1 });
  const batch = createCourseWriteBatch({ db: {}, appId: 'stable-schedule-private-v999', userId: 'A', isCurrentUser: () => true, sdk: f.sdk, beforeCourses: [course], tuitionState: { status: 'ready', accounts: [{ ...accountChange.data, id: 'one', version: 1 }], bindings: [] }, confirmImpact: () => true });
  batch.set(root + 'courses/c', { ...course, notes: 'updated' });
  batch.bindCourse('c', '2026-10-28|10:00', 'one');
  f.setFail(true); await assert.rejects(batch.commit(), /offline/);
  assert.equal(f.records.get(root + 'courses/c').notes, undefined);
  assert.equal(f.records.has(root + 'tuition_bindings/c'), false);
});

test('successful associated save writes course, binding, manifest and audit in one transaction', async () => {
  const f = fixture(), root = 'artifacts/stable-schedule-private-v999/users/A/';
  const course = { id: 'c', title: 'Nina', category: 'A', colIndex: 2, startTime: '10:00', endTime: '11:00' };
  const account = { ...accountChange.data, id: 'one', version: 1 };
  f.records.set(root + 'courses/c', course); f.records.set(root + 'tuition_accounts/one', account);
  const batch = createCourseWriteBatch({ db: {}, appId: 'stable-schedule-private-v999', userId: 'A', isCurrentUser: () => true, sdk: f.sdk, beforeCourses: [course], tuitionState: { status: 'ready', accounts: [account], bindings: [] }, confirmImpact: () => true });
  batch.set(root + 'courses/c', { ...course, notes: 'updated' }); batch.bindCourse('c', '2026-10-28|10:00', 'one');
  await batch.commit();
  assert.equal(f.records.get(root + 'courses/c').notes, 'updated');
  assert.equal(f.records.get(root + 'tuition_bindings/c').version, 1);
  assert.deepEqual(f.records.get(root + 'app_state/tuition_manifest').courseIds, ['c']);
  assert.equal([...f.records.keys()].filter(path => path.includes('/tuition_audit/')).length, 1);
});

test('a server manifest blocks edits to linked courses if binding permissions are unavailable', async () => {
  const f = fixture(), root = 'artifacts/stable-schedule-private-v999/users/A/';
  const course = { id: 'c', title: 'Nina', startTime: '10:00', endTime: '11:00' };
  f.records.set(root + 'courses/c', course); f.records.set(root + 'app_state/tuition_manifest', { enabled: true, courseIds: ['c'], version: 1 });
  const batch = createCourseWriteBatch({ db: {}, appId: 'stable-schedule-private-v999', userId: 'A', isCurrentUser: () => true, sdk: f.sdk, beforeCourses: [course], tuitionState: { status: 'error', accounts: [], bindings: [] } });
  batch.delete(root + 'courses/c');
  await assert.rejects(batch.commit(), /课包关联状态/);
  assert.equal(f.records.has(root + 'courses/c'), true);
});

test('course wrapper rejects concurrent schedule changes instead of overwriting them', async () => {
  const f = fixture(), root = 'artifacts/stable-schedule-private-v999/users/A/';
  const course = { id: 'c', title: 'Nina', startTime: '10:00', endTime: '11:00', colIndex: 0 };
  f.records.set(root + 'courses/c', { ...course, startTime: '12:00' });
  const batch = createCourseWriteBatch({ db: {}, appId: 'stable-schedule-private-v999', userId: 'A', isCurrentUser: () => true, sdk: f.sdk, beforeCourses: [course], tuitionState: { status: 'ready', accounts: [], bindings: [] }, confirmImpact: () => true });
  batch.delete(root + 'courses/c');
  await assert.rejects(batch.commit(), /课程.*已被修改/);
  assert.equal(f.records.get(root + 'courses/c').startTime, '12:00');
});

// Each drain represents one server-read round; writes are still committed atomically.
const measureCourseReads = async ({ linked = false, staleBinding = false, conflict = '', retry = false } = {}) => {
  const f = fixture(), root = 'artifacts/stable-schedule-private-v999/users/A/';
  const course = { id: 'c', title: 'Nina', category: 'A', startTime: '10:00', endTime: '11:00' };
  const account = { ...accountChange.data, id: 'one', version: 1 };
  const binding = { id: 'c', courseId: 'c', version: 1, segments: [{ fromKey: '2026-10-28|10:00', toKey: null, accountId: 'one' }] };
  f.records.set(root + 'courses/c', course);
  if (linked) {
    f.records.set(root + 'app_state/tuition_manifest', { courseIds: ['c'], version: 1 });
    f.records.set(root + 'tuition_bindings/c', binding);
    f.records.set(root + 'tuition_accounts/one', account);
    if (conflict === 'binding') f.records.set(root + 'tuition_bindings/c', { ...binding, version: 2 });
    if (conflict === 'account') f.records.set(root + 'tuition_accounts/one', { ...account, version: 2 });
  }
  const queue = [], reads = [];
  let rounds = 0;
  const transaction = f.sdk.runTransaction;
  const readTransaction = (db, fn) => transaction(db, tx => fn({ ...tx, get: path => new Promise(resolve => {
    reads.push(path);
    queue.push(() => resolve({ exists: () => f.records.has(path), data: () => f.records.get(path) }));
  }) }));
  f.sdk.runTransaction = async (db, fn) => {
    if (retry) {
      // Discard the first attempt's writes, as Firestore does after contention.
      await readTransaction(db, tx => fn({ ...tx, set: () => {}, update: () => {}, delete: () => {} }));
      f.records.set(root + 'tuition_bindings/c', { ...binding, version: 2 });
    }
    return readTransaction(db, fn);
  };
  const batch = createCourseWriteBatch({ db: {}, appId: 'stable-schedule-private-v999', userId: 'A', isCurrentUser: () => true, sdk: f.sdk, beforeCourses: [course], tuitionState: { status: 'ready', accounts: linked ? [account] : [], bindings: linked && !staleBinding ? [binding] : [] } });
  batch.set(root + 'courses/c', { ...course, notes: 'updated' });
  let done = false, error;
  const saving = batch.commit().catch(reason => { error = reason; }).finally(() => { done = true; });
  while (!done) {
    await new Promise(resolve => setImmediate(resolve));
    if (queue.length) { rounds++; queue.splice(0).forEach(resolve => resolve()); }
  }
  await saving;
  return { rounds, reads, records: f.records, root, error };
};

test('ordinary course save completes its safety reads in one server round without package reads', async () => {
  const result = await measureCourseReads();
  assert.ifError(result.error);
  assert.equal(result.rounds, 1);
  assert.equal(result.reads.length, 2);
  assert.equal(result.records.get(result.root + 'courses/c').notes, 'updated');
});

test('known linked course reads course, binding, account and manifest concurrently without duplicate reads', async () => {
  const result = await measureCourseReads({ linked: true });
  assert.ifError(result.error);
  assert.equal(result.rounds, 1);
  assert.equal(result.reads.length, 4);
  assert.equal(result.records.get(result.root + 'courses/c').notes, 'updated');
  assert.equal([...result.records.keys()].filter(path => path.includes('/tuition_audit/')).length, 1);
});

test('server-discovered binding still blocks a stale client without partially saving', async () => {
  const result = await measureCourseReads({ linked: true, staleBinding: true });
  assert.match(result.error?.message || '', /课包关联已被修改/);
  assert.equal(result.records.get(result.root + 'courses/c').notes, undefined);
});

for (const conflict of ['binding', 'account']) {
  test(`parallel reads preserve ${conflict} version conflicts and atomic failure`, async () => {
    const result = await measureCourseReads({ linked: true, conflict });
    assert.match(result.error?.message || '', /已被修改/);
    assert.equal(result.records.get(result.root + 'courses/c').notes, undefined);
    assert.equal([...result.records.keys()].some(path => path.includes('/tuition_audit/')), false);
  });
}

test('transaction retries reread bindings instead of reusing the first attempt snapshots', async () => {
  const result = await measureCourseReads({ linked: true, retry: true });
  assert.match(result.error?.message || '', /课包关联已被修改/);
  assert.equal(result.records.get(result.root + 'courses/c').notes, undefined);
});
