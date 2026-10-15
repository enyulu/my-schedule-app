import test from 'node:test';
import assert from 'node:assert/strict';
import { clampScheduleZoom, getScheduleFitPercent, getScheduleGridPoint, getScheduleStartMinutes } from '../src/scheduleZoom.js';

test('zoom is limited to 60–140 percent and invalid preferences reset to 100', () => {
  assert.equal(clampScheduleZoom(50), 60);
  assert.equal(clampScheduleZoom(150), 140);
  assert.equal(clampScheduleZoom(110), 110);
  assert.equal(clampScheduleZoom(NaN), 100);
});

test('fit uses available content width, respects the minimum and never overflows from rounding', () => {
  assert.equal(getScheduleFitPercent(975, 1000), 97);
  assert.equal(getScheduleFitPercent(327, 1000), 60);
  assert.equal(getScheduleFitPercent(1400, 1400), 100);
});

for (const scale of [0.6, 0.8, 1, 1.4]) {
  test(`click and drag retain the same day and start time at ${scale * 100}%`, () => {
    const rect = { left: -120, top: -200, width: 1000 * scale, height: 1440 * scale };
    const point = getScheduleGridPoint({ clientX: rect.left + (65 + 935 / 7 * 2.5) * scale, clientY: rect.top + 180 * scale, rect, scale });
    assert.equal(point.colIndex, 2);
    assert.equal(getScheduleStartMinutes(point.y, { startHour: 8, endHour: 23, pixelsPerHour: 90 }), 600);
    const pointerY = 210 * scale;
    const grabOffsetY = 30 * scale;
    assert.equal(getScheduleStartMinutes((pointerY - grabOffsetY) / scale, { startHour: 8, endHour: 23, pixelsPerHour: 90, snap: 'round', duration: 90 }), 600);
    assert.equal(getScheduleGridPoint({ clientX: rect.left + 20 * scale, clientY: 0, rect, scale }), null);
    assert.equal(getScheduleGridPoint({ clientX: rect.left + 1001 * scale, clientY: 0, rect, scale }), null);
  });
}

test('time selection snaps to quarter hours and keeps the entire course inside the day', () => {
  const options = { startHour: 8, endHour: 23, pixelsPerHour: 90, duration: 90 };
  assert.equal(getScheduleStartMinutes(28, options), 495);
  assert.equal(getScheduleStartMinutes(28, { ...options, snap: 'round' }), 495);
  assert.equal(getScheduleStartMinutes(38, { ...options, snap: 'round' }), 510);
  assert.equal(getScheduleStartMinutes(-100, options), 480);
  assert.equal(getScheduleStartMinutes(2000, options), 1290);
});
