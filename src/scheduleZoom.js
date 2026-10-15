export const clampScheduleZoom = percent => Number.isFinite(percent) ? Math.max(60, Math.min(140, Math.round(percent))) : 100;

export const getScheduleFitPercent = (availableWidth, boardWidth) => clampScheduleZoom(Math.floor(availableWidth / boardWidth * 100));

// Browser pointer coordinates include zoom and scrolling; timetable coordinates do not.
export const getScheduleGridPoint = ({ clientX, clientY, rect, scale }) => {
  const x = (clientX - rect.left) / scale - 65;
  const y = (clientY - rect.top) / scale;
  const columnsWidth = rect.width / scale - 65;
  if (x < 0 || x > columnsWidth || y < 0 || y > rect.height / scale) return null;
  return { colIndex: Math.min(6, Math.floor(x / (columnsWidth / 7))), y };
};

export const getScheduleStartMinutes = (y, { startHour, endHour, pixelsPerHour, duration = 60, snap = 'floor' }) => {
  const minutes = y / pixelsPerHour * 60 + startHour * 60;
  const snapped = Math[snap](minutes / 15) * 15;
  return Math.max(startHour * 60, Math.min(endHour * 60 - duration, snapped));
};
