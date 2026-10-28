import test from 'node:test';
import assert from 'node:assert/strict';
import { createTuitionStore, createCourseWriteBatch } from '../src/tuitionStore.js';

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
