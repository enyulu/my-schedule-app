import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const handlerStart = source.indexOf('  const handleSave = async');
const handler = source.slice(handlerStart, source.indexOf('\n  };', handlerStart) + 5);
const base = { id: 'wed', title: 'Jayden', name: 'Jayden', colIndex: 2, weekday: 2, startTime: '14:00', endTime: '15:00', duration: 60, value: 240, price: 240, tag: 'A', category: 'A', isFixed: true, baseWeekId: '2026-09-28', excludedWeeks: [], lessonTrackingEnabled: false, lessonCycleStarts: [], lessonTrackingAnchors: [] };

async function saveCategory({ courses = [base], id = 'wed', value = 240, category = 'P', duplicate = false, fail = false, form = {} } = {}) {
  const original = courses.find(course => course.id === id);
  const stored = new Map(courses.map(course => [course.id, structuredClone(course)]));
  const errors = [];
  const context = vm.createContext({
    courses: structuredClone(courses), editingCourseId: id, user: { uid: 'local-test-only' },
    formData: { ...original, recurrence: original.isFixed ? (original.isBiweekly ? 'biweekly' : 'weekly') : 'temp', tag: category, value, ...form },
    viewWeekId: '2026-10-19', currentWeekId: '2026-10-19', lessonSettingsByTitle: new Map(), FIXED_APP_ID: 'stable-schedule-private-v999', db: {},
    canEdit: true, saveInFlightRef: { current: false }, activeUserIdRef: { current: 'local-test-only' }, setScheduleView() {},
    saveSnapshotForUndo() {}, setSyncing() {}, setIsModalOpen() {}, setCourseCelebration() {},
    setRestoreError: message => { if (message) errors.push(message); }, logFirestoreError() {}, setTimeout() {}, console: { info() {}, warn() {} },
    doc: (...parts) => String(parts.at(-1)).split('/').at(-1),
    writeBatch: () => {
      const operations = [];
      return {
        set: (key, data) => operations.push(() => stored.set(key, structuredClone(data))),
        update: (key, data) => operations.push(() => stored.set(key, { ...stored.get(key), ...structuredClone(data) })),
        commit: async () => { if (fail) throw Error('simulated offline'); operations.forEach(run => run()); },
      };
    },
  });
  vm.runInContext(source.slice(source.indexOf('const TAGS ='), source.indexOf('// --- 工具函数 ---'))
    + source.slice(source.indexOf('const getMonday ='), source.indexOf('// --- Gemini API'))
    + source.slice(source.indexOf('const COURSE_SCHEMA_VERSION'), source.indexOf('const getCoursesRef'))
    + handler + '\nglobalThis.api = {save: handleSave, visible: isCourseVisibleInWeek};', context);
  await context.api.save(duplicate);
  return {
    records: [...stored.values()], errors,
    at(week, colIndex = 2, startTime = '14:00') {
      return [...stored.values()].filter(course => course.colIndex === colIndex && course.startTime === startTime && context.api.visible(course, week));
    },
  };
}

test('category-only edit preserves previous weeks and changes the selected recurring lesson onwards', async () => {
  const saved = await saveCategory();
  assert.deepEqual(saved.errors, []);
  assert.equal(saved.at('2026-10-12')[0].category, 'A');
  assert.equal(saved.at('2026-10-19')[0].category, 'P');
  assert.equal(saved.at('2026-10-26')[0].category, 'P');
  assert.equal(saved.at('2026-10-12')[0].price, 240);
  assert.equal(saved.at('2026-10-19')[0].price, 240);
  assert.equal(saved.at('2026-10-19').length, 1);
});

test('category with default price change preserves history and updates both tag fields', async () => {
  const saved = await saveCategory({ value: 400 });
  assert.equal(saved.at('2026-10-12')[0].category, 'A');
  assert.equal(saved.at('2026-10-12')[0].price, 240);
  assert.equal(saved.at('2026-10-19')[0].category, 'P');
  assert.equal(saved.at('2026-10-19')[0].tag, 'P');
  assert.equal(saved.at('2026-10-19')[0].price, 400);
});

test('same-name earlier lessons retain their category and price; category changes only the selected series', async () => {
  const mon = { ...base, id: 'mon', colIndex: 0, weekday: 0 };
  const temp = { ...base, id: 'earlier-wed', startTime: '10:00', endTime: '11:00', isFixed: false, weekId: '2026-10-19' };
  const saved = await saveCategory({ courses: [base, mon, temp], value: 400 });
  assert.equal(saved.at('2026-10-19', 0)[0].category, 'A');
  assert.equal(saved.at('2026-10-19', 0)[0].price, 240);
  assert.equal(saved.at('2026-10-26', 0)[0].category, 'A');
  assert.equal(saved.at('2026-10-26', 0)[0].price, 400);
  assert.equal(saved.at('2026-10-19', 2, '10:00')[0].price, 240);
  assert.equal(saved.at('2026-10-19', 2, '10:00')[0].category, 'A');
  assert.equal(saved.at('2026-10-19')[0].category, 'P');
});

test('biweekly category split keeps alternate-week cadence, exclusions and original end date', async () => {
  const course = { ...base, baseWeekId: '2026-09-21', isBiweekly: true, endWeekId: '2026-12-14', excludedWeeks: ['2026-10-05', '2026-11-02'] };
  const saved = await saveCategory({ courses: [course] });
  assert.equal(saved.at('2026-09-21')[0].category, 'A');
  assert.equal(saved.at('2026-10-05').length, 0);
  assert.equal(saved.at('2026-10-19')[0].category, 'P');
  assert.equal(saved.at('2026-10-26').length, 0);
  assert.equal(saved.at('2026-11-02').length, 0);
  assert.equal(saved.at('2026-11-16')[0].category, 'P');
  assert.equal(saved.at('2026-12-14').length, 0);
});

test('renaming while changing category still preserves old lessons', async () => {
  const saved = await saveCategory({ form: { title: 'Jayden Maths' } });
  assert.equal(saved.at('2026-10-12')[0].title, 'Jayden');
  assert.equal(saved.at('2026-10-12')[0].category, 'A');
  assert.equal(saved.at('2026-10-19')[0].title, 'Jayden Maths');
  assert.equal(saved.at('2026-10-19')[0].category, 'P');
});

test('one-off edit does not touch other occurrences', async () => {
  const course = { ...base, isFixed: false, weekId: '2026-10-19' };
  const previous = { ...course, id: 'past', weekId: '2026-10-12' };
  const saved = await saveCategory({ courses: [course, previous] });
  assert.equal(saved.at('2026-10-12')[0].category, 'A');
  assert.equal(saved.at('2026-10-19')[0].category, 'P');
});

test('failed category save leaves all stored records intact', async () => {
  const saved = await saveCategory({ fail: true });
  assert.deepEqual(saved.records, [base]);
  assert.match(saved.errors[0], /保存失败/);
});

test('copy as new leaves the original recurring history intact', async () => {
  const saved = await saveCategory({ duplicate: true });
  assert.equal(saved.at('2026-10-12').length, 1);
  assert.equal(saved.at('2026-10-12')[0].category, 'A');
  assert.deepEqual(saved.at('2026-10-19').map(course => course.category).sort(), ['A', 'P']);
});

test('changing a fixed lesson date preserves earlier weeks and saves the selected weekday', async () => {
  const saved = await saveCategory({ category: 'A', form: { colIndex: 4 } });
  assert.equal(saved.at('2026-10-12', 2).length, 1);
  assert.equal(saved.at('2026-10-19', 2).length, 0);
  assert.equal(saved.at('2026-10-19', 4).length, 1);
  assert.equal(saved.at('2026-10-26', 4).length, 1);
});
test('changing a fixed lesson time preserves prior times and fee history', async () => {
  const saved = await saveCategory({ category: 'A', form: { startTime: '16:00' } });
  assert.equal(saved.at('2026-10-12', 2, '14:00').length, 1);
  assert.equal(saved.at('2026-10-19', 2, '14:00').length, 0);
  assert.equal(saved.at('2026-10-19', 2, '16:00')[0].price, 240);
});

test('valid early and overnight legacy courses remain editable without losing their times', async () => {
  for (const [startTime, endTime, duration] of [['07:00', '08:00', 60], ['23:00', '00:30', 90]]) {
    const course = { ...base, startTime, endTime, duration };
    const saved = await saveCategory({ category: 'A', courses: [course], form: { notes: 'updated' } });
    assert.deepEqual(saved.errors, []);
    assert.equal(saved.records[0].startTime, startTime);
    assert.equal(saved.records[0].endTime, endTime);
    assert.equal(saved.records[0].notes, 'updated');
  }
});
