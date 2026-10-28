import { BEIJING_ZONE, resolveWallTime, zonedParts } from './timeZones.js';

export const tuitionHours = minutes => String(Math.round(minutes / 60 * 100) / 100);
export const stepTuitionHours = (value, direction) => {
  const current = Number(value);
  return String(Math.round(Math.max(0, (Number.isFinite(current) ? current : 0) + (direction > 0 ? 1 : -1)) * 1000000) / 1000000);
};
export const hoursToMinutes = value => {
  const hours = Number(value);
  if (!String(value).trim() || !Number.isFinite(hours) || hours <= 0 || hours > 100000) throw Error('请输入大于0的有效课时');
  const minutes = Math.round(hours * 60);
  if (!minutes) throw Error('课时至少为1分钟');
  return minutes;
};
export const tuitionKey = row => `${row.date}|${row.startTime}`;
export const beijingInput = timestamp => {
  const value = zonedParts(timestamp, BEIJING_ZONE);
  return value ? `${value.date}T${value.time}` : '';
};
export const parseTuitionTime = value => {
  const [date, time] = String(value).split('T');
  const result = resolveWallTime(date, time, BEIJING_ZONE);
  if (result.status !== 'valid') throw Error('请选择有效的北京时间日期和时间');
  return result.instants[0];
};
export const tuitionStartDate = (accounts, bindings, now) => {
  const dates = accounts.map(account => beijingInput(account.startsAt).slice(0, 10)).filter(Boolean);
  bindings.forEach(binding => binding.segments.forEach(segment => {
    if (Number.isFinite(segment.originStartsAt) && /^\d{4}-\d{2}-\d{2}\|/.test(segment.originOccurrenceKey || '')) dates.push(segment.originOccurrenceKey.slice(0, 10));
  }));
  return dates.sort()[0] || beijingInput(Number(now)).slice(0, 10);
};
const calendarDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
};
const minuteOf = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '') ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : NaN;
export const collectTuitionOccurrences = ({ courses, fromDate, now }) => {
  const first = calendarDate(fromDate), last = zonedParts(Number(now), BEIJING_ZONE)?.date;
  const occurrences = [], warnings = [];
  if (!first || !last) return { occurrences, warnings: ['起算日期或当前时间无效，请核对课包'] };
  const end = calendarDate(last);
  if ((end - first) / 86400000 > 36600) return { occurrences, warnings: ['统计范围超过100年，请核对起算日期'] };
  for (const course of courses) {
    const status = String(course.status || '').trim().toLowerCase();
    if (course.cancelled || course.canceled || course.isCancelled || course.isCanceled || course.isSuspended || course.completed === false || course.isCompleted === false
      || ['cancelled', 'canceled', 'suspended', 'incomplete', 'unfinished', 'pending', '未完成', '取消', '已取消', '停课'].includes(status)) continue;
    const start = minuteOf(course.startTime), finish = minuteOf(course.endTime);
    let minutes = (finish - start + 1440) % 1440;
    if (!minutes && Number(course.duration) === 1440) minutes = 1440;
    const weekday = Number(course.colIndex ?? course.weekday);
    if (!course.id || !Number.isFinite(start) || !Number.isFinite(finish) || !minutes || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      warnings.push(`课程${course.title || course.id || '未命名'}的时间无效，需核对`); continue;
    }
    for (const day = new Date(first); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
      if ((day.getUTCDay() + 6) % 7 !== weekday) continue;
      const date = day.toISOString().slice(0, 10);
      const monday = new Date(day); monday.setUTCDate(monday.getUTCDate() - weekday);
      const week = monday.toISOString().slice(0, 10);
      if (course.isFixed) {
        if (course.baseWeekId && week < course.baseWeekId || course.endWeekId && week >= course.endWeekId || course.excludedWeeks?.includes(week)) continue;
        if (course.isBiweekly) {
          const base = calendarDate(course.baseWeekId);
          if (!base) { warnings.push(`隔周课程${course.title}缺少起始周`); break; }
          if (Math.round((monday - base) / 604800000) % 2 !== 0) continue;
        }
      } else if (course.weekId !== week) continue;
      const resolved = resolveWallTime(date, course.startTime, BEIJING_ZONE);
      if (resolved.status !== 'valid') continue;
      const startsAt = resolved.instants[0], endsAt = startsAt + minutes * 60000;
      if (endsAt > Number(now)) continue;
      occurrences.push({ key: `${course.id}|${date}|${course.startTime}`, courseId: course.id, date, startTime: course.startTime, endTime: course.endTime, startsAt, endsAt, minutes, title: course.title || course.name, category: String(course.category ?? course.tag ?? '').toUpperCase() });
    }
  }
  return { occurrences: occurrences.sort((a, b) => a.startsAt - b.startsAt || a.key.localeCompare(b.key)), warnings: [...new Set(warnings)] };
};

const bindingSegmentAt = (binding, key) => {
  const segments = binding?.segments || [];
  const matching = segments.filter(segment => segment.fromKey <= key && (!segment.toKey || key < segment.toKey));
  if (matching.length > 1) throw Error('课包关联区间重叠，请核对');
  return matching[0] || null;
};
export const bindingAccountAt = (binding, key) => bindingSegmentAt(binding, key)?.accountId || null;
export const setBindingFrom = (binding, courseId, fromKey, accountId) => ({
  ...(binding || {}), id: courseId, courseId,
  segments: [...(binding?.segments || []).filter(segment => segment.fromKey < fromKey).map(segment => ({ ...segment, toKey: !segment.toKey || segment.toKey > fromKey ? fromKey : segment.toKey })), {
    ...(bindingSegmentAt(binding, fromKey)?.accountId === accountId && bindingSegmentAt(binding, fromKey)?.originOccurrenceKey === fromKey ? bindingSegmentAt(binding, fromKey) : {}), fromKey, toKey: null, accountId: accountId || null,
  }],
});

// Translate an association boundary by lesson occurrence, not by its old wall-clock time.
const mapFutureBindingBoundary = (key, source, target) => {
  const day = calendarDate(key.slice(0, 10));
  if (!day) return null;
  const weekday = (day.getUTCDay() + 6) % 7;
  day.setUTCDate(day.getUTCDate() - weekday);
  for (let count = 0; count < 5200; count++, day.setUTCDate(day.getUTCDate() + 7)) {
    const week = day.toISOString().slice(0, 10), originalDate = new Date(day);
    originalDate.setUTCDate(originalDate.getUTCDate() + Number(source.colIndex));
    const sourceKey = `${originalDate.toISOString().slice(0, 10)}|${source.startTime}`;
    if (source.endWeekId && week >= source.endWeekId) return null;
    if (sourceKey < key || source.baseWeekId && week < source.baseWeekId || source.excludedWeeks?.includes(week)) continue;
    if (source.isBiweekly && Math.round((day - calendarDate(source.baseWeekId)) / 604800000) % 2) continue;
    const nextDate = new Date(day); nextDate.setUTCDate(nextDate.getUTCDate() + Number(target.colIndex));
    return { key: `${nextDate.toISOString().slice(0, 10)}|${target.startTime}`, sourceKey };
  }
  return null;
};

export const planBindingMutation = ({ beforeCourses, afterCourses, bindings, accounts, inheritances = [], selections = [], overrides = [], relocations = [], recovery = false }) => {
  const before = new Map(beforeCourses.map(row => [row.id, row])), after = new Map(afterCourses.map(row => [row.id, row]));
  const original = new Map(bindings.map(row => [row.courseId, row])), next = new Map(original), changed = new Set(), affected = new Set();
  const track = binding => binding?.segments.forEach(segment => { if (segment.accountId) affected.add(segment.accountId); });
  for (const override of overrides) {
    const existing = original.get(override.courseId);
    track(existing); track(override);
    next.set(override.courseId, { ...override, version: existing?.version || 0 }); changed.add(override.courseId);
  }
  for (const inherited of inheritances) {
    const source = original.get(inherited.fromId);
    if (!source || inherited.toId === inherited.fromId) continue;
    const segments = source.segments.filter(segment => !segment.toKey || segment.toKey > inherited.fromKey).map(segment => ({ ...segment, fromKey: segment.fromKey < inherited.fromKey ? inherited.fromKey : segment.fromKey }));
    if (!segments.length) continue;
    next.set(inherited.toId, { id: inherited.toId, courseId: inherited.toId, segments, sourceDeleted: false, inheritedFrom: inherited.fromId });
    changed.add(inherited.toId); track(source);
  }
  for (const moved of relocations) {
    const source = original.get(moved.fromId), oldCourse = before.get(moved.fromId), newCourse = after.get(moved.toId);
    if (!source || !oldCourse || !newCourse) continue;
    const segment = bindingSegmentAt(source, moved.sourceKey);
    const origin = segment?.originOccurrenceKey === moved.sourceKey && Number.isFinite(segment.originStartsAt) ? segment.originStartsAt : parseTuitionTime(moved.sourceKey.replace('|', 'T'));
    const initial = { fromKey: moved.targetKey, toKey: null, accountId: segment?.accountId || null, originOccurrenceKey: moved.targetKey, originStartsAt: origin };
    const events = new Map([[moved.targetKey, initial]]);
    if (moved.permanent && oldCourse.isFixed) {
      const boundaries = [...new Set(source.segments.flatMap(row => [row.fromKey, row.toKey]).filter(key => key && key > moved.sourceKey))].sort();
      for (const boundary of boundaries) {
        const translated = mapFutureBindingBoundary(boundary, oldCourse, newCourse);
        if (!translated || translated.key <= moved.targetKey) continue;
        events.set(translated.key, { fromKey: translated.key, toKey: null, accountId: bindingAccountAt(source, translated.sourceKey), originOccurrenceKey: translated.key, originStartsAt: parseTuitionTime(translated.sourceKey.replace('|', 'T')) });
      }
    }
    const segments = [...events.values()].sort((a, b) => a.fromKey.localeCompare(b.fromKey)).map((row, index, all) => ({ ...row, toKey: all[index + 1]?.fromKey || null }));
    next.set(moved.toId, { ...(next.get(moved.toId) || {}), id: moved.toId, courseId: moved.toId, segments, sourceDeleted: false, recoveryMissing: false });
    changed.add(moved.toId); track(source); track(next.get(moved.toId));
  }
  for (const selection of selections) {
    const existing = next.get(selection.courseId);
    track(existing);
    const binding = { ...setBindingFrom(existing, selection.courseId, selection.fromKey, selection.accountId), sourceDeleted: false };
    next.set(selection.courseId, binding); changed.add(selection.courseId); track(binding);
  }
  for (const [id, binding] of next) {
    const previous = before.get(id), current = after.get(id);
    if (previous && !current) {
      track(binding); next.set(id, { ...binding, sourceDeleted: true, recoveryMissing: recovery }); changed.add(id); continue;
    }
    if (!current) continue;
    if (previous && JSON.stringify(previous) === JSON.stringify(current) && !changed.has(id)) continue;
    track(binding);
    if (binding.sourceDeleted && !overrides.some(row => row.courseId === id && row.sourceDeleted)) {
      next.set(id, { ...binding, sourceDeleted: false, recoveryMissing: false }); changed.add(id);
    }
    const latest = [...next.get(id).segments].sort((a, b) => b.fromKey.localeCompare(a.fromKey))[0];
    if (!latest?.accountId) continue;
    const account = accounts.find(row => row.id === latest.accountId);
    if (!account) throw Error('关联的课包账户不存在，请重新选择');
    if (account.category !== (current.category ?? current.tag)) throw Error('课程类别已改变，请明确选择新类别的课包或“不关联”，原余额不会转移');
  }
  const bindingChanges = [...changed].map(id => ({ collection: 'tuition_bindings', id, expectedVersion: original.get(id)?.version || 0, data: { ...next.get(id), id, courseId: id } }));
  return { bindingChanges, affectedAccountIds: [...affected].sort(), beforeCourses, afterCourses };
};

export const calculateTuition = ({ accounts = [], packages = [], bindings = [], adjustments = [], occurrences = [], now }) => {
  const warnings = [], results = new Map();
  for (const account of accounts) results.set(account.id, { ...account, recordedMinutes: 0, pendingMinutes: 0, pendingPackages: [], pendingAdjustmentMinutes: 0, purchasedMinutes: 0, usedMinutes: 0, remainingMinutes: 0, debtMinutes: 0, packages: [], lessons: [], warnings: [], adjustmentMinutes: 0 });
  const bindingMap = new Map(bindings.map(binding => [binding.courseId, binding]));
  const selected = new Map(accounts.map(account => [account.id, []]));
  const seen = new Set();
  for (const row of [...occurrences].sort((a, b) => a.startsAt - b.startsAt || a.key.localeCompare(b.key))) {
    if (seen.has(row.key) || row.endsAt > Number(now)) continue;
    seen.add(row.key);
    let accountId, segment;
    try { segment = bindingSegmentAt(bindingMap.get(row.courseId), tuitionKey(row)); accountId = segment?.accountId; } catch (error) { warnings.push(error.message); continue; }
    if (!accountId) continue;
    const account = results.get(accountId);
    if (!account) { warnings.push(`课程${row.title}关联的课包不存在，需核对`); continue; }
    if (!Number.isFinite(account.startsAt)) { account.warnings.push('课包缺少有效起算时间'); continue; }
    const creditAt = segment.originOccurrenceKey === tuitionKey(row) && Number.isFinite(segment.originStartsAt) ? segment.originStartsAt : row.startsAt;
    if (creditAt < account.startsAt) continue;
    if (row.category !== account.category) { account.warnings.push(`${row.date} ${row.title}类别与课包不一致，需重新关联`); continue; }
    selected.get(accountId).push({ ...row, creditAt });
  }
  for (const account of results.values()) {
    const credits = packages.filter(pack => pack.accountId === account.id && !pack.voided)
      .sort((a, b) => a.effectiveAt - b.effectiveAt || (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id));
    for (const pack of credits) {
      if (!Number.isInteger(pack.minutes) || pack.minutes <= 0 || !Number.isFinite(pack.effectiveAt)) { account.warnings.push('存在无效购买课时或生效时间'); continue; }
      account.recordedMinutes += pack.minutes;
      if (pack.effectiveAt > Number(now)) { account.pendingMinutes += pack.minutes; account.pendingPackages.push(pack); continue; }
      account.packages.push({ ...pack, usedMinutes: 0, remainingMinutes: pack.minutes });
      account.purchasedMinutes += pack.minutes;
    }
    const events = selected.get(account.id).map(row => ({ ...row, adjustment: false }));
    const funding = [...account.packages];
    for (const adjustment of adjustments.filter(row => row.accountId === account.id && !row.voided)) {
      if (!Number.isInteger(adjustment.minutes) || !adjustment.minutes || !Number.isFinite(adjustment.effectiveAt) || !adjustment.reason?.trim()) { account.warnings.push('调整记录无效或缺少原因／生效时间'); continue; }
      if (adjustment.effectiveAt > Number(now)) { account.pendingAdjustmentMinutes += adjustment.minutes; continue; }
      account.adjustmentMinutes += adjustment.minutes;
      if (adjustment.minutes > 0) funding.push({ ...adjustment, remainingMinutes: adjustment.minutes, usedMinutes: 0, coverDebt: true });
      else events.push({ ...adjustment, startsAt: adjustment.effectiveAt, minutes: -adjustment.minutes, adjustment: true, key: `adjustment|${adjustment.id}` });
    }
    funding.sort((a, b) => a.effectiveAt - b.effectiveAt || (a.createdAt || 0) - (b.createdAt || 0) || a.id.localeCompare(b.id));
    for (const row of events.sort((a, b) => a.startsAt - b.startsAt || a.key.localeCompare(b.key))) {
      let remaining = row.minutes;
      const allocations = [];
      for (const pack of funding) {
        if (remaining <= 0) break;
        if (pack.effectiveAt > (row.creditAt ?? row.startsAt) && !pack.coverDebt) continue;
        const minutes = Math.min(remaining, pack.remainingMinutes);
        if (minutes <= 0) continue;
        pack.remainingMinutes -= minutes; pack.usedMinutes += minutes; remaining -= minutes;
        allocations.push({ packageId: pack.id, minutes });
      }
      account.debtMinutes += remaining;
      if (!row.adjustment) { account.usedMinutes += row.minutes; account.lessons.push({ ...row, allocations, debtMinutes: remaining }); }
    }
    account.remainingMinutes = account.purchasedMinutes + account.adjustmentMinutes - account.usedMinutes;
    account.warnings = [...new Set(account.warnings)];
  }
  return { accounts: [...results.values()], warnings: [...new Set(warnings)] };
};

export const formatTuitionStatement = (result, account) => `${account.studentName}｜${account.subject}｜${account.category}类\n已录入${tuitionHours(result.recordedMinutes ?? result.purchasedMinutes)}课时｜已用${tuitionHours(result.usedMinutes)}课时｜${result.remainingMinutes < 0 ? '欠' : '剩余'}${tuitionHours(Math.abs(result.remainingMinutes))}课时\n${result.pendingMinutes > 0 ? `待生效${tuitionHours(result.pendingMinutes)}课时，尚未计入当前余额\n` : ''}${result.lessons.map(row => `${row.date} ${row.startTime}—${row.endTime}｜${tuitionHours(row.minutes)}课时`).join('\n')}`;
