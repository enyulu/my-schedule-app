import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAndy, validateAndySession, createAndyBackfill, andyMonthCells } from '../src/andyCounter.js';
import { createAndyStore } from '../src/andyStore.js';

const at = value => new Date(value).getTime();
const session = (id, time, extra = {}) => ({ id, occurredAt: at(time), voided: false, ...extra });
test('backfill creates separate sessions on the chosen local date with multiple daily submissions accumulating', () => {
  let id = 0;
  const now = new Date('2026-11-02T10:00:00');
  const a = createAndyBackfill('2026-10-31', 3, now, () => `entry-${++id}`);
  const b = createAndyBackfill('2026-10-31', 2, now, () => `entry-${++id}`);
  const result = summarizeAndy([...a, ...b], now, { start: '2026-10-01', end: '2026-10-31' });
  assert.equal(result.total, 5); assert.equal(result.rangeCount, 5);
  assert.equal(result.weekCount, 0); assert.equal(result.byDay['2026-10-31'], 5);
  assert.equal(a[0].entryKind, 'backfill');
  assert.equal(a[0].recordedAt, now.getTime());
  const today = createAndyBackfill('2026-11-02', 2, now, () => `entry-${++id}`);
  assert.equal(summarizeAndy(today, now).total, 2);
});
test('backfill rejects future, impossible dates and non-integer or unsafe quantities', () => {
  const now = new Date('2026-11-02T10:00:00');
  for (const date of ['2026-11-03', '2026-02-30', '2026-1-1', '']) assert.throws(() => createAndyBackfill(date, 1, now), /日期/);
  for (const count of [0, -1, 1.5, 51, NaN]) assert.throws(() => createAndyBackfill('2026-11-01', count, now), /堂数/);
});
test('calendar has Monday-first alignment including leading and trailing month dates', () => {
  const cells = andyMonthCells('2026-11');
  assert.equal(cells.length, 42);
  assert.equal(cells[0].date, '2026-10-26');
  assert.equal(cells[6].date, '2026-11-01');
  assert.equal(cells[6].inMonth, true); assert.equal(cells[0].inMonth, false);
  assert.equal(cells[41].date, '2026-12-06');
});
test('all calendar-supported historical dates remain valid store records, including pre-1970 dates', () => {
  const rows = createAndyBackfill('1969-12-31', 2, new Date('2026-11-02T10:00:00'), (() => { let id = 0; return () => `old-${++id}`; })());
  rows.forEach(row => assert.doesNotThrow(() => validateAndySession(row)));
  assert.equal(summarizeAndy(rows, new Date('2026-11-02T10:00:00')).byDay['1969-12-31'], 2);
});
test('Monday local midnight resets the week without losing previous month or lifetime counts', () => {
  const rows = [session('a', '2026-11-01T23:59:59'), session('b', '2026-11-02T00:00:00'), session('c', '2026-10-31T12:00:00')];
  const result = summarizeAndy(rows, new Date('2026-11-02T12:00:00'));
  assert.equal(result.weekCount, 1);
  assert.equal(result.monthCount, 2);
  assert.equal(result.total, 3);
  assert.equal(result.weekStart, '2026-11-02');
});
test('inclusive ranges count both calendar endpoints and exclude voided or future events', () => {
  const rows = [session('a', '2026-10-01T00:00:00'), session('b', '2026-10-31T23:59:59.999'), session('c', '2026-11-01T00:00:00'), session('d', '2026-10-10T10:00:00', { voided: true }), session('e', '2026-12-01T10:00:00')];
  const result = summarizeAndy(rows, new Date('2026-11-01T12:00:00'), { start: '2026-10-01', end: '2026-10-31' });
  assert.equal(result.rangeCount, 2);
  assert.equal(result.total, 3);
  assert.equal(result.byMonth['2026-10'], 2);
  assert.equal(result.byMonth['2026-11'], 1);
  assert.equal(result.latest.id, 'c');
  assert.throws(() => summarizeAndy(rows, new Date(), { start: '2026-11-02', end: '2026-11-01' }), /开始日期/);
});
test('session validation rejects malformed or non-counter data instead of silently showing zero', () => {
  assert.throws(() => validateAndySession({ id: 'bad', occurredAt: NaN }), /记录/);
  assert.throws(() => validateAndySession({ id: '../bad', occurredAt: 1, voided: false }), /记录/);
  assert.throws(() => validateAndySession({ id: 'bad', occurredAt: 1, voided: 'false' }), /记录/);
});

const fixture = () => {
  const records = new Map();
  let active = true, fail = false, listener;
  const sdk = {
    doc: (db, ...path) => path.join('/'), collection: (db, ...path) => path.join('/'),
    onSnapshot: (path, options, success, error) => { listener = { path, success, error }; return () => {}; },
    runTransaction: async (db, callback) => {
      const changes = [];
      await callback({ get: async path => ({ exists: () => records.has(path), data: () => records.get(path) }), set: (path, row) => changes.push([path, row]) });
      if (fail) throw Error('offline');
      changes.forEach(([path, row]) => records.set(path, row));
    },
  };
  const store = createAndyStore({ db: {}, appId: 'stable-schedule-private-v999', userId: 'alice', isCurrentUser: () => active, sdk });
  return { records, store, getListener: () => listener, deactivate: () => { active = false; }, fail: value => { fail = value; } };
};
test('idempotent additions persist independently of courses; undo preserves the original event', async () => {
  const f = fixture(), row = session('one', '2026-11-01T12:00:00');
  await f.store.add(row); await f.store.add(row);
  assert.equal(f.records.size, 1);
  const path = 'artifacts/stable-schedule-private-v999/users/alice/andy_sessions/one';
  assert.equal(f.records.get(path).occurredAt, row.occurredAt);
  await f.store.undo('one');
  assert.equal(f.records.get(path).voided, true);
  await f.store.add(row); // Retry cannot resurrect an already undone event.
  assert.equal(f.records.get(path).voided, true);
  await f.store.undo('one'); // Lost acknowledgement retries must not undo a different event.
  assert.equal(f.records.size, 1);
});
test('failures and account switches cannot partially save or write under the wrong user', async () => {
  const f = fixture(), row = session('one', '2026-11-01T12:00:00');
  f.fail(true); await assert.rejects(f.store.add(row), /offline/);
  assert.equal(f.records.size, 0);
  f.fail(false); f.deactivate(); await assert.rejects(f.store.add(row), /账号/);
  assert.equal(f.records.size, 0);
});
test('multi-session backfills are atomic and safe to retry without replacing existing records', async () => {
  const f = fixture(), entries = [session('batch-a', '2026-10-31T12:00:00'), session('batch-b', '2026-10-31T12:00:00')];
  f.fail(true); await assert.rejects(f.store.addMany(entries), /offline/); assert.equal(f.records.size, 0);
  f.fail(false); await f.store.addMany(entries); await f.store.addMany(entries);
  assert.equal(f.records.size, 2);
  await f.store.undo('batch-a'); await f.store.addMany(entries);
  assert.equal([...f.records.values()].filter(row => !row.voided).length, 1);
  await assert.rejects(f.store.addMany([entries[0], entries[0]]), /重复/);
});
test('permission errors and cached records are distinct from an empty server-confirmed count', () => {
  const f = fixture(), states = [];
  const close = f.store.subscribe(state => states.push(state));
  const listener = f.getListener();
  assert.equal(listener.path, 'artifacts/stable-schedule-private-v999/users/alice/andy_sessions');
  listener.success({ docs: [], metadata: { fromCache: true } });
  assert.equal(states.at(-1).status, 'loading');
  assert.match(states.at(-1).error, /缓存/);
  listener.success({ docs: [{ id: 'known', data: () => ({ occurredAt: 1, voided: false }) }], metadata: { fromCache: true } });
  assert.equal(states.at(-1).status, 'cached');
  listener.error(Error('permission denied'));
  assert.equal(states.at(-1).status, 'error');
  close(); const count = states.length;
  listener.success({ docs: [], metadata: { fromCache: false } });
  assert.equal(states.length, count);
});
