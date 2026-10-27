export const BEIJING_ZONE = 'Asia/Shanghai';
export const TIME_ZONES = [
  { id: BEIJING_ZONE, label: '中国 · 北京', short: '北京' },
  { id: 'America/Los_Angeles', label: '美国西部 · 洛杉矶 / 旧金山', short: '美西' },
  { id: 'America/Chicago', label: '美国中部 · 芝加哥', short: '美中' },
  { id: 'Europe/London', label: '英国 · 伦敦', short: '英国' },
  { id: 'Asia/Bangkok', label: '泰国 · 曼谷', short: '泰国' },
  { id: 'America/New_York', label: '美国东部 · 纽约', short: '美东' },
  { id: 'America/Denver', label: '美国山地 · 丹佛', short: '丹佛' },
  { id: 'America/Phoenix', label: '美国 · 凤凰城（无夏令时）', short: '凤凰城' },
  { id: 'Asia/Singapore', label: '新加坡', short: '新加坡' },
  { id: 'Asia/Tokyo', label: '日本 · 东京', short: '日本' },
  { id: 'Australia/Sydney', label: '澳大利亚 · 悉尼', short: '悉尼' },
  { id: 'Pacific/Auckland', label: '新西兰 · 奥克兰', short: '奥克兰' },
];
export const zoneLabel = zone => TIME_ZONES.find(item => item.id === zone)?.label || zone;
export const zoneShort = zone => TIME_ZONES.find(item => item.id === zone)?.short || zone;
const formatters = new Map();
const pad = value => String(value).padStart(2, '0');
const calendarDate = stamp => {
  const date = new Date(stamp);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};
const wallStamp = (date, time = '00:00') => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return null;
  const [year, month, day] = date.split('-').map(Number);
  if (year < 1900) return null;
  const [hour, minute] = time.split(':').map(Number);
  const stamp = Date.UTC(year, month - 1, day, hour, minute);
  return calendarDate(stamp) === date ? stamp : null;
};
export const shiftDate = (date, days) => {
  const stamp = wallStamp(date);
  return stamp === null ? '' : calendarDate(stamp + days * 86400000);
};
export const occurrenceDate = (weekId, colIndex) => Number.isInteger(colIndex) && colIndex >= 0 && colIndex <= 6 ? shiftDate(weekId, colIndex) : '';
export const formatOffset = minutes => `UTC${minutes >= 0 ? '+' : '−'}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;

export const zonedParts = (instant, timeZone) => {
  if (!Number.isFinite(instant)) return null;
  try {
    if (!formatters.has(timeZone)) formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short',
    }));
    const parts = Object.fromEntries(formatters.get(timeZone).formatToParts(instant).map(part => [part.type, part.value]));
    const date = `${parts.year}-${parts.month}-${parts.day}`, time = `${parts.hour}:${parts.minute}`;
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
    return { date, time, weekday: `星期${['日', '一', '二', '三', '四', '五', '六'][new Date(wallStamp(date)).getUTCDay()]}`, abbreviation: parts.timeZoneName, offsetMinutes: Math.round((represented - Math.floor(instant / 1000) * 1000) / 60000) };
  } catch { return null; }
};

// Find every instant whose displayed wall time matches. Never silently choose a
// side of a repeated hour or normalize a spring-forward gap to another time.
export const resolveWallTime = (date, time, timeZone) => {
  const naive = wallStamp(date, time);
  if (naive === null || !zonedParts(naive, timeZone)) return { status: 'invalid', instants: [] };
  const offsets = new Set();
  for (let hours = -36; hours <= 36; hours += 6) offsets.add(zonedParts(naive + hours * 3600000, timeZone).offsetMinutes);
  const instants = [...offsets].map(offset => naive - offset * 60000).filter(instant => {
    const parts = zonedParts(instant, timeZone);
    return parts.date === date && parts.time === time;
  }).sort((a, b) => a - b);
  return { status: instants.length === 0 ? 'nonexistent' : instants.length > 1 ? 'ambiguous' : 'valid', instants };
};

export const convertBeijingLesson = (date, time, duration, timeZone) => {
  if (!Number.isFinite(Number(duration)) || Number(duration) <= 0 || Number(duration) > 1440) return null;
  const resolved = resolveWallTime(date, time, BEIJING_ZONE);
  if (resolved.status !== 'valid') return null;
  const instant = resolved.instants[0];
  const start = zonedParts(instant, timeZone), end = zonedParts(instant + Number(duration) * 60000, timeZone);
  if (!start || !end) return null;
  const offset = localDate => Math.round((wallStamp(localDate) - wallStamp(date)) / 86400000);
  return { instant, start: { ...start, dayOffset: offset(start.date) }, end: { ...end, dayOffset: offset(end.date) } };
};

export const nextOffsetChange = (date, time, duration, timeZone, intervalDays) => {
  const current = convertBeijingLesson(date, time, duration, timeZone);
  if (!current) return null;
  for (let index = 1; index <= 12; index++) {
    const nextDate = shiftDate(date, intervalDays * index);
    const next = convertBeijingLesson(nextDate, time, duration, timeZone);
    if (next && next.start.offsetMinutes !== current.start.offsetMinutes) return { date: nextDate, ...next };
  }
  return null;
};

export const beijingPlacement = instant => {
  const parts = zonedParts(instant, BEIJING_ZONE);
  if (!parts) return null;
  const weekday = (new Date(wallStamp(parts.date)).getUTCDay() + 6) % 7;
  return { date: parts.date, weekId: shiftDate(parts.date, -weekday), colIndex: weekday, startTime: parts.time };
};
