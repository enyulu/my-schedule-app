import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveWeekLayout, readWeekDensity, saveWeekDensity } from '../src/scheduleLayout.js';
import { getScheduleGridPoint, getScheduleStartMinutes } from '../src/scheduleZoom.js';

test('desktop compact layout uses spare width without overlapping the Andy rail', () => {
  for (const width of [1280, 1440, 1920]) {
    for (const zoom of [60, 100, 140]) {
      const layout = resolveWeekLayout({ width, height: 900, density: 'compact', zoom, mobile: false });
      const reserved = layout.sideRail ? 248 : 0;
      assert.ok(layout.boardWidth * zoom / 100 + reserved <= Math.max(width, 1000 * zoom / 100) + 1);
      assert.equal(layout.sideRail, width >= 1000 * zoom / 100 + 248);
    }
  }
  assert.equal(resolveWeekLayout({ width: 1920, height: 900, density: 'compact', zoom: 100 }).boardWidth, 1672);
});

test('density compresses time, never below the readable limit, accounting for zoom and header', () => {
  const layout = height => resolveWeekLayout({ width: 1440, height, density: 'compact', zoom: 100 });
  assert.equal(layout(500).pixelsPerHour, 72);
  assert.equal(layout(1372).pixelsPerHour, 80);
  assert.equal(layout(1800).pixelsPerHour, 90);
  assert.equal(layout(NaN).pixelsPerHour, 72);
  assert.equal(resolveWeekLayout({ width: 1440, height: 860, density: 'compact', zoom: 60 }).pixelsPerHour, 83);
});

test('comfort and mobile keep the original grid and mobile never acquires desktop compact styling', () => {
  for (const options of [{ density: 'comfort', mobile: false }, { density: 'compact', mobile: true }]) {
    const layout = resolveWeekLayout({ width: 1920, height: 500, zoom: 100, ...options });
    assert.equal(layout.compact, false);
    assert.equal(layout.boardWidth, 1400);
    assert.equal(layout.pixelsPerHour, 90);
  }
});

test('density preference persists independently from zoom and tolerates blocked storage', () => {
  const values = new Map([['schedule-display-zoom', '{"percent":120}']]);
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  assert.equal(readWeekDensity(storage), 'compact');
  saveWeekDensity(storage, 'comfort');
  assert.equal(readWeekDensity(storage), 'comfort');
  saveWeekDensity(storage, 'invalid');
  assert.equal(readWeekDensity(storage), 'comfort');
  assert.equal(values.get('schedule-display-zoom'), '{"percent":120}');
  assert.equal(readWeekDensity({ getItem() { throw Error('blocked'); } }), 'compact');
  assert.doesNotThrow(() => saveWeekDensity({ setItem() { throw Error('blocked'); } }, 'compact'));
});

test('click, move and copy share exact time coordinates across densities, zooms and scrolling', () => {
  for (const pixelsPerHour of [72, 80, 90]) for (const scale of [.6, 1, 1.4]) {
    const rect = { left: -120, top: -430, width: 1200 * scale, height: pixelsPerHour * 16 * scale };
    const point = getScheduleGridPoint({ rect, scale, clientX: rect.left + (65 + 1135 / 7 * 4.5) * scale, clientY: rect.top + pixelsPerHour * 2.5 * scale });
    assert.equal(point.colIndex, 4);
    const options = { startHour: 8, endHour: 24, pixelsPerHour, duration: 30 };
    assert.equal(getScheduleStartMinutes(point.y, options), 630);
    assert.equal(getScheduleStartMinutes((pixelsPerHour * 2.5 * scale + 10 * scale - 10 * scale) / scale, { ...options, snap: 'round' }), 630);
    assert.equal(getScheduleStartMinutes(rect.height / scale, options), 1410);
    assert.equal(90 / 60 * pixelsPerHour / pixelsPerHour, 1.5);
  }
});
