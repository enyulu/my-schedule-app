import { clampScheduleZoom } from './scheduleZoom.js';

const DENSITY_KEY = 'schedule-week-density';

export function readWeekDensity(storage) {
  try { return (storage ?? globalThis.localStorage)?.getItem(DENSITY_KEY) === 'comfort' ? 'comfort' : 'compact'; }
  catch { return 'compact'; }
}

export function saveWeekDensity(storage, density) {
  if (!['comfort', 'compact'].includes(density)) return;
  try { (storage ?? globalThis.localStorage)?.setItem(DENSITY_KEY, density); }
  catch { /* Display preferences remain usable when browser storage is blocked. */ }
}

export function resolveWeekLayout({ width, height, density, zoom = 100, mobile = false }) {
  const available = Number.isFinite(width) ? Math.max(0, width) : 1000;
  const scale = clampScheduleZoom(zoom) / 100;
  const compact = density === 'compact' && !mobile;
  if (!compact) {
    const boardWidth = Math.max(1000, Math.min(1400, available));
    return { boardWidth, pixelsPerHour: 90, compact, sideRail: !mobile && (available - boardWidth * scale) / 2 >= 296 };
  }
  // Andy occupies real layout space, unlike the old centered-margin overlay.
  const sideRail = available >= 1000 * scale + 248;
  const boardWidth = Math.max(1000, Math.floor((available - (sideRail ? 248 : 0)) / scale));
  const bodyHeight = Number.isFinite(height) ? Math.max(0, height / scale - 92) : 0;
  return { boardWidth, pixelsPerHour: Math.max(72, Math.min(90, Math.floor(bodyHeight / 16))), sideRail, compact };
}
