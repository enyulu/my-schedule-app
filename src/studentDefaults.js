// A course is still the authoritative saved record. Resolve the most recent
// explicit learner timezone first, then fall back to configured legacy courses.
export const studentTimeZoneDefault = (courses, title) => {
  const matches = courses.filter(course => course.title?.trim() === title.trim() && typeof course.studentTimeZone === 'string' && course.studentTimeZone);
  matches.sort((a, b) => (Number(b.studentTimeZoneUpdatedAt) || 0) - (Number(a.studentTimeZoneUpdatedAt) || 0)
    || String(b.baseWeekId || b.weekId || '').localeCompare(String(a.baseWeekId || a.weekId || '')));
  return matches[0]?.studentTimeZone || '';
};
