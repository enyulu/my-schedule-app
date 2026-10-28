// A course is still the authoritative saved record. Resolve the most recent
// explicit learner timezone first, then fall back to configured legacy courses.
export const studentTimeZoneDefault = (courses, title, draft = null) => {
  // Explicit conversion/manual choices belong to this draft, not the learner template.
  if (draft?.studentTimeZoneChanged) return draft.studentTimeZone || '';
  const matches = courses.filter(course => course.title?.trim() === title.trim() && typeof course.studentTimeZone === 'string' && course.studentTimeZone);
  matches.sort((a, b) => (Number(b.studentTimeZoneUpdatedAt) || 0) - (Number(a.studentTimeZoneUpdatedAt) || 0)
    || String(b.baseWeekId || b.weekId || '').localeCompare(String(a.baseWeekId || a.weekId || '')));
  return matches[0]?.studentTimeZone || '';
};
