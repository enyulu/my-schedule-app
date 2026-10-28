import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { beijingPlacement } from '../src/timeZones.js';

const source = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const start = source.indexOf('  const applyConvertedTime =');
const handler = source.slice(start, source.indexOf('\n  };', start) + 5);

test('applying a conversion retains Beijing date, time, duration and an explicit timezone even when unchanged', () => {
  let draft = { title: 'Nina', studentTimeZone: 'America/Chicago' };
  const context = vm.createContext({
    canEdit: true, syncing: false, saveInFlightRef: { current: false },
    START_HOUR: 8, END_HOUR: 23, beijingPlacement,
    timeToMinutes: time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3)),
    zoneConverter: { context: 'editor' }, editingCourseId: null, viewWeekId: '2026-10-26',
    setScheduleView() {}, setViewWeekStart() {}, openModal() {}, setZoneConverter() {},
    setFormData: update => { draft = update(draft); },
  });
  vm.runInContext(handler + '\nglobalThis.apply = applyConvertedTime;', context);
  assert.equal(context.apply({ instant: Date.parse('2026-10-28T18:00:00Z'), duration: 90, studentTimeZone: 'America/Chicago' }), '');
  assert.equal(draft.colIndex, 3);
  assert.equal(draft.weekday, 3);
  assert.equal(draft.startTime, '02:00');
  assert.equal(draft.duration, 90);
  assert.equal(draft.studentTimeZone, 'America/Chicago');
  assert.equal(draft.studentTimeZoneChanged, true);
});
