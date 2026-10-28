import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const raw = { id: 'real', name: 'Learner', colIndex: 0, startTime: '10:00', endTime: '11:00', value: 240, category: 'legacy', weekId: '2026-10-26', status: 'cancelled', completed: false, studentId: 'student-1', studentName: 'Nina' };
function normalizer() {
  const context = vm.createContext({ currentWeekId: '2026-10-26', console: { info() {}, warn() {} } });
  vm.runInContext(source.slice(source.indexOf('const TAGS ='), source.indexOf('// --- 工具函数 ---'))
    + source.slice(source.indexOf('const getMonday ='), source.indexOf('// --- Gemini API'))
    + source.slice(source.indexOf('const COURSE_SCHEMA_VERSION'), source.indexOf('const getCoursesRef'))
    + '\nglobalThis.api = {normalizeCourse, normalizeCourseDataset};', context);
  return context.api;
}
test('normalization preserves cancellation, learner identity and unknown historical category', () => {
  const row = normalizer().normalizeCourse(raw, 0);
  assert.equal(row.status, 'cancelled');
  assert.equal(row.completed, false);
  assert.equal(row.studentId, 'student-1');
  assert.equal(row.studentName, 'Nina');
  assert.equal(row.category, 'LEGACY');
});
test('backup validation rejects the entire partial-invalid dataset and accepts an explicitly empty one', () => {
  const normalize = normalizer().normalizeCourseDataset;
  assert.throws(() => normalize([raw, { id: 'invalid' }], 'backup-test'));
  assert.equal(normalize([], 'empty-backup').length, 0);
});
test('failed backup read neither replaces cloud data nor substitutes seed data locally', async () => {
  const start = source.indexOf('  const restoreLatestSchedule = async');
  const handler = source.slice(start, source.indexOf('\n  };', start) + 5);
  let cloudWrites = 0, localChanges = 0;
  const context = vm.createContext({
    user: { uid: 'test' }, canEdit: true, syncing: false, dataState: 'ready', viewWeekId: '2026-10-26', courses: [raw], db: {}, FIXED_APP_ID: 'test',
    saveInFlightRef: { current: false }, actionInFlightRef: { current: false },
    createDefaultSchedule: () => [{ id: 'seed' }], saveSnapshotForUndo() {}, setSyncing() {}, setRestoreError() {}, setHideEmptyOverlay() {},
    setCourses() { localChanges++; }, getDoc: async () => { throw Error('backup unavailable'); }, doc() {},
    replaceFirestoreSchedule: async () => { cloudWrites++; }, logFirestoreError() {}, setTimeout() {},
    window: { confirm: () => true }, console: { info() {}, warn() {} },
  });
  vm.runInContext(handler + '\nglobalThis.restore = restoreLatestSchedule;', context);
  await context.restore();
  assert.equal(cloudWrites, 0);
  assert.equal(localChanges, 0);
});

test('permanent drag changes future fixed lessons without rewriting historical start time', async () => {
  const start = source.indexOf('  const handleConfirmMove = async');
  const handler = source.slice(start, source.indexOf('\n  };', start) + 5);
  const original = { id: 'fixed', name: 'Nina', title: 'Nina', colIndex: 0, weekday: 0, startTime: '10:00', endTime: '11:00', duration: 60, isFixed: true, baseWeekId: '2026-10-05', category: 'A', value: 240, excludedWeeks: [] };
  const records = new Map([[original.id, original]]);
  const context = vm.createContext({
    user: { uid: 'test' }, canEdit: true, syncing: false, saveInFlightRef: { current: false },
    moveConfirmInfo: { course: original, newColIdx: 2, newStartTime: '16:00', newEndTime: '17:00' }, viewWeekId: '2026-10-26', db: {}, FIXED_APP_ID: 'test',
    saveSnapshotForUndo() {}, setSyncing() {}, setMoveConfirmInfo() {}, setRestoreError() {}, logFirestoreError() {},
    timeToMinutes: time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3)), normalizeCourse: row => row,
    doc: (...parts) => String(parts.at(-1)).split('/').at(-1),
    writeBatch: () => ({ set: (key, row) => records.set(key, row), update: (key, row) => records.set(key, { ...records.get(key), ...row }), commit: async () => {} }),
  });
  vm.runInContext(handler + '\nglobalThis.move = handleConfirmMove;', context);
  await context.move('permanent');
  assert.equal(records.get('fixed').startTime, '10:00');
  assert.equal(records.get('fixed').endWeekId, '2026-10-26');
  assert.equal([...records.values()].filter(row => row.startTime === '16:00' && row.baseWeekId === '2026-10-26').length, 1);
});

test('account change clears undo history, editor and backup drafts', () => {
  const start = source.indexOf('  useEffect(() => {\n    let active = true, unsubscribe');
  const effect = source.slice(start, source.indexOf('\n  }, [authAttempt]);', start) + '\n  }, [authAttempt]);'.length);
  const state = {};
  let observer;
  const context = { authAttempt: 0, auth: {}, isStandalone: true, activeUserIdRef: { current: null }, saveInFlightRef: { current: false }, console: { error() {} }, useEffect: fn => fn(), onAuthStateChanged: (auth, cb) => { observer = cb; return () => {}; }, getMonday: value => value };
  for (const setter of new Set(effect.match(/set[A-Z]\w+/g))) context[setter] = value => { state[setter] = value; };
  vm.runInContext(effect, vm.createContext(context));
  observer({ uid: 'A' });
  state.setUndoStack = ['private-A']; state.setBackupText = 'private backup A'; state.setIsModalOpen = true;
  observer({ uid: 'B' });
  assert.equal(state.setUndoStack.length, 0);
  assert.equal(state.setBackupText, '');
  assert.equal(state.setIsModalOpen, false);
});

test('empty cache and read failures retain courses; confirmed empty server snapshot is read-only', () => {
  const start = source.indexOf('  useEffect(() => {\n    if (!user) return;');
  const effect = source.slice(start, source.indexOf('\n  }, [user, loadAttempt]);', start) + '\n  }, [user, loadAttempt]);'.length);
  const state = { courses: [raw] };
  let snapshot, failure;
  const context = vm.createContext({
    user: { uid: 'test' }, loadAttempt: 0, currentWeekId: '2026-10-26',
    useEffect: fn => fn(), getCoursesRef() {},
    onSnapshot: (ref, options, success, error) => { snapshot = success; failure = error; return () => {}; },
    normalizeCourseDataset: normalizer().normalizeCourseDataset,
    setCourses: rows => { state.courses = rows; }, setStatisticsSource() {},
    setDataState: status => { state.status = status; }, setLoadError: error => { state.error = error; }, setHideEmptyOverlay() {}, logFirestoreError() {},
  });
  vm.runInContext(effect, context);
  snapshot({ docs: [], metadata: { fromCache: true } });
  assert.equal(state.courses[0].id, raw.id);
  failure(Error('denied'));
  assert.equal(state.courses[0].id, raw.id);
  assert.equal(state.status, 'error');
  snapshot({ docs: [], metadata: { fromCache: false } });
  assert.equal(state.courses.length, 0);
  assert.equal(state.status, 'ready');
});
