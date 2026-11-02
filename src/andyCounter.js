// Independent attendance counts: never a course duration, fee or package debit.
export const localAndyDate = value => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
export const validateAndySession = row => {
  if (!row || typeof row.id !== 'string' || !/^[\w-]{1,100}$/.test(row.id)
    || !Number.isFinite(row.occurredAt) || row.occurredAt < 0 || !Number.isFinite(new Date(row.occurredAt).getTime())
    || typeof row.voided !== 'boolean') throw Error('Andy上课记录无效，请检查数据后重试');
  return row;
};
export const summarizeAndy = (rows, now, range) => {
  if (range && range.start > range.end) throw Error('开始日期不能晚于结束日期');
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const weekStart = localAndyDate(monday), month = localAndyDate(now).slice(0, 7);
  const active = rows.filter(row => !row.voided && row.occurredAt <= now.getTime()).sort((a, b) => b.occurredAt - a.occurredAt || b.id.localeCompare(a.id));
  const result = { total: active.length, weekCount: 0, monthCount: 0, rangeCount: 0, weekStart, byMonth: {}, latest: active[0] || null };
  for (const row of active) {
    const date = localAndyDate(row.occurredAt), rowMonth = date.slice(0, 7);
    if (row.occurredAt >= monday.getTime()) result.weekCount++;
    if (rowMonth === month) result.monthCount++;
    if (range && date >= range.start && date <= range.end) result.rangeCount++;
    result.byMonth[rowMonth] = (result.byMonth[rowMonth] || 0) + 1;
  }
  return result;
};
