import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { summarizeAndy, createAndyBackfill } from '../src/andyCounter.js';

// Execute the actual hook with a deterministic effect/state scheduler; replace
// only React scheduling and the external store, not the hook's action logic.
const harness = () => {
  let cursor = 0, dirty = true, clock = new Date('2026-11-01T12:00:00').getTime(), sequence = 0;
  const slots = [], effects = [], stores = [];
  const identityRef = { current: 'alice' }, params = { db: {}, appId: 'stable-schedule-private-v999', userId: 'alice', identityRef };
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const context = {
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } },
    crypto: { randomUUID: () => `event-${++sequence}` },
    window: { addEventListener() {}, removeEventListener() {} },
    setTimeout: () => 1, clearTimeout() {}, summarizeAndy, createAndyBackfill,
    useState: initial => {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => { const next = typeof value === 'function' ? value(slots[index].value) : value; if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true; } }];
    },
    useRef: initial => { const index = cursor++; return (slots[index] ||= { current: initial }); },
    useMemo: (fn, deps) => { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { deps, value: fn() }; return slots[index].value; },
    useEffect: (fn, deps) => {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) effects.push(() => { slots[index]?.cleanup?.(); slots[index] = { deps, cleanup: fn() }; });
    },
    createAndyStore: options => {
      const store = { options, subscribe: fn => { store.emit = fn; fn({ rows: [], status: 'loading', error: '' }); return () => {}; }, add: async () => {}, addMany: async rows => { store.added = rows; }, undo: async id => { store.undone = id; } };
      stores.push(store); return store;
    },
  };
  const source = readFileSync(new URL('../src/useAndyCounter.js', import.meta.url), 'utf8').replace(/^import .*\n/gm, '').replace('export default function', 'globalThis.useAndyCounter = function');
  vm.runInNewContext(source, context);
  let result;
  const flush = () => {
    for (let i = 0; dirty && i < 30; i++) {
      dirty = false; cursor = 0; result = context.useAndyCounter(params);
      effects.splice(0).forEach(effect => effect());
    }
    assert.equal(dirty, false, 'hook must settle');
    return result;
  };
  flush();
  return { flush, stores, context, ready: (rows = []) => { stores.at(-1).emit({ rows, status: 'ready', error: '' }); return flush(); }, switchUser: uid => { params.userId = uid; identityRef.current = uid; dirty = true; return flush(); }, advance: ms => { clock += ms; } };
};

test('same-account reauthentication resets abandoned pending and failed action state', async () => {
  const h = harness(); let release;
  h.ready(); h.stores[0].add = () => new Promise(resolve => { release = resolve; });
  const pending = h.flush().add();
  assert.equal(h.flush().pending, true);
  h.switchUser(null); h.switchUser('alice');
  assert.equal(h.ready().pending, false);
  release(); await pending;
  assert.equal(h.flush().summary.total, 0);
  h.stores.at(-1).add = async () => { throw Error('offline'); };
  await h.flush().add(); assert.ok(h.flush().retry);
  h.switchUser(null); h.switchUser('alice');
  assert.equal(h.ready().retry, null);
  assert.equal(h.flush().actionError, '');
});

test('a remote confirmed event immediately refreshes count and becomes the undo target', async () => {
  const h = harness(), base = new Date('2026-11-01T12:00:00').getTime();
  h.ready([{ id: 'older', occurredAt: base - 1000, voided: false }]);
  h.advance(20000);
  const result = h.ready([{ id: 'older', occurredAt: base - 1000, voided: false }, { id: 'remote', occurredAt: base + 19000, voided: false }]);
  assert.equal(result.summary.total, 2);
  await result.undo();
  assert.equal(h.stores.at(-1).undone, 'remote');
});

test('failed undo retry keeps its original target even when a later remote event arrives', async () => {
  const h = harness(), base = new Date('2026-11-01T12:00:00').getTime();
  let calls = 0;
  h.ready([{ id: 'first', occurredAt: base - 1000, voided: false }]);
  h.stores[0].undo = async id => { h.stores[0].undone = id; if (!calls++) throw Error('lost acknowledgement'); };
  await h.flush().undo(); assert.ok(h.flush().undoRetry);
  h.ready([{ id: 'first', occurredAt: base - 1000, voided: true }, { id: 'remote', occurredAt: base, voided: false }]);
  await h.flush().undo(); assert.equal(h.stores[0].undone, 'first');
  assert.equal(h.flush().summary.total, 1);
});

test('ID generation errors cannot leave the card permanently locked', async () => {
  const h = harness(); h.ready();
  h.context.crypto.randomUUID = () => { throw Error('unavailable'); };
  await h.flush().add();
  assert.equal(h.flush().pending, false);
  assert.match(h.flush().actionError, /unavailable/);
});
test('backfill retries retain date, quantity and event IDs, then refresh original month totals', async () => {
  const h = harness(); h.ready(); let attempts = 0, original;
  h.stores[0].addMany = async rows => { if (!attempts++) { original = rows; throw Error('offline'); } assert.deepEqual(rows, original); };
  assert.equal(await h.flush().backfill('2026-10-31', 3), false);
  assert.ok(h.flush().retry);
  assert.equal(await h.flush().backfill('2026-10-30', 8), true);
  assert.equal(h.flush().summary.byDay['2026-10-31'], 3);
  assert.equal(h.flush().summary.byMonth['2026-10'], 3);
  assert.equal(h.flush().celebration, null);
});
test('calendar undo targets the chosen historical record, never the latest unrelated attendance', async () => {
  const h = harness(), base = new Date('2026-11-01T12:00:00').getTime();
  h.ready([{ id: 'older', occurredAt: base - 86400000, voided: false }, { id: 'latest', occurredAt: base, voided: false }]);
  await h.flush().undoEntry('older');
  assert.equal(h.stores[0].undone, 'older');
  assert.equal(h.flush().summary.total, 1);
});
test('a freshly confirmed backfill can be undone before the next server listener notification', async () => {
  const h = harness(); h.ready();
  await h.flush().backfill('2026-10-31', 2);
  const entry = h.flush().rows[0];
  assert.ok(entry);
  await h.flush().undoEntry(entry.id);
  assert.equal(h.stores[0].undone, entry.id);
  assert.equal(h.flush().summary.total, 1);
});
