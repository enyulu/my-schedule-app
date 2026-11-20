import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const firstWeek = '2026-11-09';
const makeCourse = (id, colIndex, startTime, endTime, extra = {}) => ({ id, title: 'Daisy', name: 'Daisy', colIndex, weekday: colIndex, startTime, endTime, isFixed: true, baseWeekId: firstWeek, value: 400, tag: 'P', ...extra });
const saturday = makeCourse('sat', 5, '20:30', '22:30');
const sunday = makeCourse('sun', 6, '13:00', '15:00');
const anchor = (course, lessonNumber = 1, weekId = firstWeek) => ({ weekId, colIndex: course.colIndex, startTime: course.startTime, courseId: course.id, lessonNumber });

function harness(courses, anchors, enabled = true) {
  const settings = { enabled, anchors: new Map() };
  let draft;
  const context = vm.createContext({ courses, lessonSettingsByTitle: new Map([['Daisy', settings]]), useCallback: callback => callback,
    formData: { title: 'Daisy' }, editingCourseId: courses[0].id, viewWeekId: firstWeek,
    setLessonSettingsDraft: value => { draft = value; }, setLessonSettingsStatus() {}, setIsLessonSettingsModalOpen() {},
  });
  vm.runInContext(source.slice(source.indexOf('const getMonday ='), source.indexOf('// --- Gemini API'))
    + source.slice(source.indexOf('  const getCourseLessonNumber ='), source.indexOf('  const getCourseDisplayInfo ='))
    + source.slice(source.indexOf('  const openLessonSettingsDialog ='), source.indexOf('  const saveLessonSettingsFromCurrentCourse ='))
    + '\nglobalThis.api = {count:getCourseLessonNumber,key:getLessonAnchorKey,open:openLessonSettingsDialog};', context);
  for (const entry of anchors) settings.anchors.set(context.api.key(entry), entry);
  return { count: context.api.count, settings, open(course, week = firstWeek, pendingLessonNumber) { context.editingCourseId = course.id; context.viewWeekId = week; context.formData = { title: 'Daisy', pendingLessonNumber }; context.api.open(); return draft; } };
}

test('two 120-minute Daisy lessons accumulate 2, 4, then 6 and 8 across weeks', () => {
  const h = harness([saturday, sunday], [anchor(saturday)]);
  assert.equal(h.count(saturday, firstWeek), 2);
  assert.equal(h.count(sunday, firstWeek), 4);
  assert.equal(h.count(saturday, '2026-11-16'), 6);
  assert.equal(h.count(sunday, '2026-11-16'), 8);
});

test('30, 45, 90 and 120-minute lessons accumulate fractions rather than attendance counts', () => {
  const courses = [makeCourse('a', 0, '10:00', '10:30'), makeCourse('b', 1, '10:00', '10:45'), makeCourse('c', 2, '10:00', '11:30'), makeCourse('d', 3, '10:00', '12:00')];
  const h = harness(courses, [anchor(courses[0])]);
  assert.deepEqual(courses.map(course => h.count(course, firstWeek)), [.5, 1.25, 2.75, 4.75]);
});

test('precise Sunday reset leaves earlier Saturday history unchanged', () => {
  const h = harness([saturday, sunday], [anchor(saturday), anchor(sunday)]);
  assert.equal(h.count(saturday, firstWeek), 2);
  assert.equal(h.count(sunday, firstWeek), 2);
  assert.equal(h.count(saturday, '2026-11-16'), 4);
});

test('manual starting hour includes this lesson and does not count other learners', () => {
  const other = makeCourse('other', 5, '10:00', '12:00', { title: 'Other' });
  const h = harness([other, saturday, sunday], [anchor(saturday, 5)]);
  assert.equal(h.count(saturday, firstWeek), 6);
  assert.equal(h.count(sunday, firstWeek), 8);
});

test('legacy week-start zero anchors count the first lesson duration', () => {
  const h = harness([saturday, sunday], [{ weekId: firstWeek, colIndex: -1, startTime: '00:00', lessonNumber: 0 }]);
  assert.equal(h.count(saturday, firstWeek), 2);
  assert.equal(h.count(sunday, firstWeek), 4);
});

test('excluded weeks, biweekly schedules and deleted occurrences are not counted', () => {
  const excluded = { ...saturday, excludedWeeks: ['2026-11-16'] };
  const fortnight = { ...sunday, isBiweekly: true };
  const h = harness([excluded, fortnight], [anchor(saturday)]);
  assert.equal(h.count(excluded, '2026-11-23'), 6);
  assert.equal(harness([saturday], [anchor(saturday)]).count(saturday, '2026-11-16'), 4);
});

test('disabled tracking stays hidden but settings can read its accumulated hours', () => {
  const h = harness([saturday], [anchor(saturday)], false);
  assert.equal(h.count(saturday, firstWeek), null);
  assert.equal(h.count(saturday, firstWeek, true), 2);
});

test('opening settings converts cumulative hours back to the starting hour without increasing it', () => {
  const h = harness([saturday, sunday], [anchor(saturday)]);
  assert.equal(h.open(saturday).lessonNumber, 1);
  assert.equal(h.open(sunday).lessonNumber, 3);
  const half = makeCourse('half', 0, '10:00', '10:30');
  const mixed = harness([half, saturday], [anchor(half)]);
  assert.equal(mixed.open(saturday).lessonNumber, 1.5);
});

test('overnight lessons use real elapsed minutes and rounding happens only for final display', () => {
  const night = makeCourse('night', 0, '23:00', '00:30');
  assert.equal(harness([night], [anchor(night)]).count(night, firstWeek), 1.5);
  const minutes = [0, 1, 2].map(index => makeCourse(String(index), index, '10:00', '10:20'));
  assert.equal(harness(minutes, [anchor(minutes[0])]).count(minutes[2], firstWeek), 1);
});

test('fractional anchors survive loading and new-course settings save without integer rounding', async () => {
  const context = vm.createContext({
    currentWeekId: firstWeek, formData: { title: 'Daisy' }, lessonSettingsDraft: { enabled: true, lessonNumber: 1.5 },
    courses: [], editingCourseId: null, canEdit: true, syncing: false, saveInFlightRef: { current: false },
    setFormData: update => { context.formData = update(context.formData); }, setLessonSettingsStatus() {}, setTimeout() {},
  });
  vm.runInContext(source.slice(source.indexOf('const TAGS ='), source.indexOf('// --- 工具函数 ---'))
    + source.slice(source.indexOf('const getMonday ='), source.indexOf('// --- Gemini API'))
    + source.slice(source.indexOf('const COURSE_SCHEMA_VERSION'), source.indexOf('const getCoursesRef'))
    + source.slice(source.indexOf('  const saveLessonSettingsFromCurrentCourse ='), source.indexOf('  const handleDownload ='))
    + '\nglobalThis.api = {normalize:normalizeCourse,save:saveLessonSettingsFromCurrentCourse};', context);
  const normalized = context.api.normalize({ ...saturday, lessonTrackingAnchors: [anchor(saturday, 1.5)] }, 0, firstWeek);
  assert.equal(normalized.lessonTrackingAnchors[0].lessonNumber, 1.5);
  await context.api.save();
  assert.equal(context.formData.pendingLessonNumber, 1.5);
  await context.api.save(1);
  assert.equal(context.formData.pendingLessonNumber, 1);
});

test('unsaved starting-hour adjustment takes precedence when settings are reopened', () => {
  // Exercise the same open handler with a pending edit, before a course save.
  const setup = harness([saturday], [anchor(saturday)]);
  assert.equal(setup.open(saturday, firstWeek, 3.5).lessonNumber, 3.5);
});

test('cancelled, suspended and explicitly unfinished lessons do not inflate cumulative hours', () => {
  for (const flags of [{ cancelled: true }, { status: '停课' }, { isCompleted: false }, { status: 'pending' }]) {
    const h = harness([{ ...saturday, ...flags }, sunday], [anchor(saturday)]);
    assert.equal(h.count(sunday, firstWeek), 2);
  }
});

test('same-title learners with different identities have independent hours and settings', () => {
  const a = { ...saturday, studentId: 'learner-a' }, b = { ...sunday, studentId: 'learner-b' };
  const scopedSource = source.slice(source.indexOf('  const lessonSettingsByTitle ='), source.indexOf('  const getCourseDisplayInfo ='));
  const context = vm.createContext({ courses: [
    { ...a, lessonTrackingEnabled: true, lessonTrackingAnchors: [anchor(a)] },
    { ...b, lessonTrackingEnabled: true, lessonTrackingAnchors: [anchor(b)] },
  ], useMemo: f => f(), useCallback: f => f });
  vm.runInContext(source.slice(source.indexOf('const getMonday ='), source.indexOf('// --- Gemini API')) + scopedSource + '\nglobalThis.count=getCourseLessonNumber;', context);
  assert.equal(context.count(a, firstWeek), 2);
  assert.equal(context.count(b, firstWeek), 2);
  assert.equal(context.count(a, '2026-11-16'), 4);
  assert.equal(context.count(b, '2026-11-16'), 4);
  context.courses[1].lessonTrackingEnabled = false;
  const disabled = vm.createContext({ courses: context.courses, useMemo: f => f(), useCallback: f => f });
  vm.runInContext(source.slice(source.indexOf('const getMonday ='), source.indexOf('// --- Gemini API')) + scopedSource + '\nglobalThis.count=getCourseLessonNumber;', disabled);
  assert.equal(disabled.count(a, firstWeek), 2);
  assert.equal(disabled.count(b, firstWeek), null);
});

test('saving a reset updates only this learner, never a different student with the same course title', async () => {
  const a = { ...saturday, studentId: 'a', lessonTrackingEnabled: true, lessonTrackingAnchors: [anchor(saturday)] };
  const b = { ...sunday, studentId: 'b', lessonTrackingEnabled: true, lessonTrackingAnchors: [anchor(sunday)] };
  const writes = [];
  const context = vm.createContext({ courses: [a, b], formData: a, editingCourseId: a.id, viewWeekId: firstWeek,
    useMemo: f => f(), canEdit: true, syncing: false, saveInFlightRef: { current: false }, user: { uid: 'test-only' }, db: {},
    FIXED_APP_ID: 'stable-schedule-private-v999', lessonSettingsDraft: { enabled: true, lessonNumber: 1 },
    doc: (...args) => args.at(-1), courseWriteBatch: () => ({ update: (id, data) => writes.push({ id, data }), commit: async () => {} }),
    setSyncing() {}, setLessonSettingsStatus() {}, setTimeout() {}, logFirestoreError() {},
  });
  vm.runInContext(source.slice(source.indexOf('const getMonday ='), source.indexOf('// --- Gemini API'))
    + source.slice(source.indexOf('  const lessonSettingsByTitle ='), source.indexOf('  const getCourseLessonNumber ='))
    + source.slice(source.indexOf('  const saveLessonSettingsFromCurrentCourse ='), source.indexOf('  const handleDownload ='))
    + '\nglobalThis.save=saveLessonSettingsFromCurrentCourse;', context);
  await context.save(1);
  assert.deepEqual(writes.map(row => row.id), ['sat']);
  assert.equal(writes[0].data.lessonTrackingAnchors.length, 1);
});

test('learner-specific legacy display cannot add a second rounded cumulative total', () => {
  const course = { ...saturday, title: '芮彤数学', startTime: '10:00', endTime: '10:45', baseWeekId: '2026-05-11' };
  const context = vm.createContext({ courses: [course], useCallback: f => f, getCourseLessonNumber: () => .75 });
  vm.runInContext(source.slice(source.indexOf('const getMonday ='), source.indexOf('// --- Gemini API'))
    + source.slice(source.indexOf('  const getCourseDisplayInfo ='), source.indexOf('  const visibleCourses =')) + '\nglobalThis.display=getCourseDisplayInfo;', context);
  assert.equal(context.display(course, '2026-05-11').dynamicNote, '累计0.75课时');
});
