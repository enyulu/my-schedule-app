// Independent attendance counts: never a course duration, fee or package debit.
export const localAndyDate = value => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const parseAndyDay = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || value < '1900-01-01') throw Error('请选择有效日期');
  const date = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(date.getTime()) || localAndyDate(date) !== value) throw Error('请选择有效日期');
  return date;
};
export const createAndyBackfill = (date, count, now = new Date(), makeId = () => crypto.randomUUID()) => {
  const day = parseAndyDay(date);
  if (date > localAndyDate(now)) throw Error('不能补录未来日期的上课记录');
  if (!Number.isInteger(count) || count < 1 || count > 50) throw Error('每次补录堂数必须为1至50的整数；同一天可分次补录');
  const occurredAt = date === localAndyDate(now) ? now.getTime() : day.getTime();
  return Array.from({ length: count }, () => ({ id: makeId(), occurredAt, voided: false, entryKind: 'backfill', recordedAt: now.getTime() }));
};
export const andyMonthCells = month => {
  const first = parseAndyDay(`${month}-01`), start = new Date(first);
  start.setDate(first.getDate() - (first.getDay() + 6) % 7);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start); day.setDate(start.getDate() + index);
    const date = localAndyDate(day);
    return { date, day: day.getDate(), inMonth: date.slice(0, 7) === month };
  });
};
export const validateAndySession = row => {
  if (!row || typeof row.id !== 'string' || !/^[\w-]{1,100}$/.test(row.id)
    || !Number.isFinite(row.occurredAt) || !Number.isFinite(new Date(row.occurredAt).getTime())
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
  const result = { total: active.length, weekCount: 0, monthCount: 0, rangeCount: 0, weekStart, byMonth: {}, byDay: {}, latest: active[0] || null };
  for (const row of active) {
    const date = localAndyDate(row.occurredAt), rowMonth = date.slice(0, 7);
    if (row.occurredAt >= monday.getTime()) result.weekCount++;
    if (rowMonth === month) result.monthCount++;
    if (range && date >= range.start && date <= range.end) result.rangeCount++;
    result.byMonth[rowMonth] = (result.byMonth[rowMonth] || 0) + 1;
    result.byDay[date] = (result.byDay[date] || 0) + 1;
  }
  return result;
};
