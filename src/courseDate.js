// A calendar date is not an instant; perform only calendar arithmetic here.
export const courseDateSelection = date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (year < 1900) return null;
  const selected = new Date(Date.UTC(year, month - 1, day));
  if (selected.getUTCFullYear() !== year || selected.getUTCMonth() !== month - 1 || selected.getUTCDate() !== day) return null;
  const colIndex = (selected.getUTCDay() + 6) % 7;
  selected.setUTCDate(selected.getUTCDate() - colIndex);
  const weekId = `${selected.getUTCFullYear()}-${String(selected.getUTCMonth() + 1).padStart(2, '0')}-${String(selected.getUTCDate()).padStart(2, '0')}`;
  return { date, weekId, colIndex };
};
