import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

// Exercise the actual save handler with only the external Firestore boundary replaced.
const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const saveHandler = source.slice(source.indexOf('  const handleSave = async'), source.indexOf('\n  };', source.indexOf('  const handleSave = async')) + 5);
const createSave = ({ tag = 'P', recurrence = 'temp', editing = false, fail = false, signedIn = true } = {}) => {
  const celebrations = [];
  let writes = 0;
  const formData = { title: 'Test learner', tag, recurrence, startTime: '10:00', duration: 60, value: 400 };
  const context = vm.createContext({
    formData, user: signedIn ? { uid: 'test-only' } : null,
    editingCourseId: editing ? 'existing' : null,
    courses: editing ? [{ ...formData, id: 'existing' }] : [],
    lessonSettingsByTitle: new Map(), viewWeekId: '2026-10-12', FIXED_APP_ID: 'test-only', db: {},
    saveSnapshotForUndo() {}, setSyncing() {}, setIsModalOpen() {}, setRestoreError() {},
    setCourseCelebration(effect) { celebrations.push(effect); },
    normalizeCourse: data => data, minutesToTime: () => '11:00', timeToMinutes: () => 600,
    getOccurrenceKey: () => '', getLessonAnchorKey: () => '', doc() {},
    writeBatch: () => ({ set() {}, update() {}, async commit() { if (fail) throw new Error('offline'); writes++; } }),
    logFirestoreError() {}, setTimeout() {}, console: { info() {} },
  });
  vm.runInContext(saveHandler + '\nglobalThis.save = handleSave;', context);
  return { save: context.save, celebrations, get writes() { return writes; } };
};

for (const [recurrence, want] of [['temp', 'ingot'], ['weekly', 'flower'], ['biweekly', 'flower']]) {
  test(`new P ${recurrence}: celebrates once after the write succeeds`, async () => {
    const run = createSave({ recurrence });
    const pending = run.save();
    assert.equal(run.celebrations.length, 0, 'must wait for Firestore success');
    await pending;
    assert.equal(run.writes, 1);
    assert.equal(run.celebrations.length, 1);
    assert.equal(run.celebrations[0].type, want);
  });
}
for (const options of [{ editing: true }, { tag: 'A' }, { tag: 'B' }, { fail: true }, { signedIn: false }]) {
  test(`no celebration: ${JSON.stringify(options)}`, async () => {
    const run = createSave(options);
    await run.save();
    assert.equal(run.celebrations.length, 0);
  });
}

test('an explicitly duplicated P course is a new save and celebrates once', async () => {
  const run = createSave({ editing: true, recurrence: 'weekly' });
  await run.save(true);
  assert.equal(run.celebrations.length, 1);
  assert.equal(run.celebrations[0].type, 'flower');
});

test('celebration is removed after one second and its timer is cleaned up', () => {
  const effectStart = source.indexOf('  useEffect(() => {', source.indexOf('const [courseCelebration,'));
  const effect = source.slice(effectStart, source.indexOf('\n  }, [courseCelebration]);', effectStart) + '\n  }, [courseCelebration]);'.length);
  let callback, delay, cleanup, cleared;
  const values = [];
  const context = vm.createContext({
    courseCelebration: { type: 'ingot', id: 'test' },
    setCourseCelebration: value => values.push(value),
    useEffect: handler => { cleanup = handler(); },
    setTimeout: (handler, ms) => { callback = handler; delay = ms; return 42; },
    clearTimeout: timer => { cleared = timer; },
  });
  vm.runInContext(effect, context);
  assert.equal(delay, 1000);
  assert.deepEqual(values, []);
  callback();
  assert.deepEqual(values, [null]);
  cleanup();
  assert.equal(cleared, 42);
});
