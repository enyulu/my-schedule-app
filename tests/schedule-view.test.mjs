import test from 'node:test';
import assert from 'node:assert/strict';
import { readScheduleView, resolveScheduleView, saveScheduleView } from '../src/scheduleView.js';
import { isAndyDateSelected } from '../src/andyCounter.js';

test('agenda is the narrow-screen default, but explicit choices survive reload and resizing', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(resolveScheduleView(readScheduleView(storage), true), 'list');
  assert.equal(resolveScheduleView(readScheduleView(storage), false), 'week');
  saveScheduleView(storage, 'week');
  assert.equal(resolveScheduleView(readScheduleView(storage), true), 'week');
  saveScheduleView(storage, 'list');
  assert.equal(resolveScheduleView(readScheduleView(storage), false), 'list');
  saveScheduleView(storage, 'invalid');
  assert.equal(readScheduleView(storage), 'list');
  assert.equal(readScheduleView({ getItem: () => 'invalid' }), null);
  assert.equal(readScheduleView({ getItem() { throw Error('blocked'); } }), null);
});

test('Andy backfill selection belongs to the displayed month and cannot be empty or future', () => {
  assert.equal(isAndyDateSelected('2026-11-06', '2026-10', '2026-11-06'), false);
  assert.equal(isAndyDateSelected('', '2026-10', '2026-11-06'), false);
  assert.equal(isAndyDateSelected('2026-11-07', '2026-11', '2026-11-06'), false);
  assert.equal(isAndyDateSelected('2026-10-30', '2026-10', '2026-11-06'), true);
});
