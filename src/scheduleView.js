const storageKey = 'schedule-view-preference';
const valid = value => value === 'week' || value === 'list';
const narrowQuery = '(max-width: 767px)';

export const readScheduleView = storage => {
  try { const value = (storage ?? globalThis.localStorage).getItem(storageKey); return valid(value) ? value : null; }
  catch { return null; }
};
export const saveScheduleView = (storage, value) => {
  try { if (valid(value)) (storage ?? globalThis.localStorage).setItem(storageKey, value); }
  catch { /* Preferences are optional on restricted browsers. */ }
};
export const resolveScheduleView = (preference, compact) => valid(preference) ? preference : compact ? 'list' : 'week';
export const compactScheduleSnapshot = () => window.matchMedia(narrowQuery).matches;
export const subscribeCompactSchedule = listener => {
  const media = window.matchMedia(narrowQuery);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
};
