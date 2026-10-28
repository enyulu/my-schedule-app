export const monthId = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
export const shiftMonth = (month, offset) => {
  const [year, number] = month.split('-').map(Number);
  return monthId(new Date(year, number - 1 + offset, 1));
};
const summary = lessons => {
  const minutes = lessons.reduce((n, row) => n + row.minutes, 0);
  const fee = lessons.reduce((n, row) => n + row.fee, 0);
  return { count: lessons.length, minutes, fee, studentCount: new Set(lessons.map(row => row.studentKey)).size, avgRate: minutes ? fee * 60 / minutes : null };
};
const change = (current, previous) => previous > 0 ? (current - previous) / previous * 100 : null;
const share = (part, whole) => whole > 0 ? part / whole * 100 : 0;
const categoryKeys = ['A', 'B', 'P', 'unclassified'];
const categoryOf = row => categoryKeys.includes(row.category) ? row.category : 'unclassified';

export const collectReportLessons = ({ courses, month, windowMonths, now, collectLessons }) => {
  const firstMonth = shiftMonth(month, -(windowMonths === 6 ? 5 : 11));
  const [year, number] = month.split('-').map(Number);
  const end = new Date(year, number, 0, 23, 59, 59, 999);
  const endDate = `${month}-${String(end.getDate()).padStart(2, '0')}`;
  const rows = collectLessons(courses, { start: `${firstMonth}-01`, end: endDate }, end, { includeUnfinished: true });
  return filterKnownOccurrences(courses, rows, now);
};

export const filterKnownOccurrences = (courses, rows, now) => {
  const missingStart = new Set(courses.filter(course => course.isFixed && !course.baseWeekId).map(course => course.id));
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return { lessons: rows.filter(row => !missingStart.has(row.courseId ?? row.key.split('|')[0]) || row.startsAt >= monday.getTime()), undatedCount: missingStart.size };
};

export const buildMonthlyReport = ({ lessons, month, windowMonths = 6, now }) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1900 || month > monthId(now)) throw Error('请选择有效且不晚于本月的月份');
  const valid = lessons.filter(row => Number.isFinite(row.minutes) && row.minutes > 0 && Number.isFinite(row.fee) && Number.isFinite(row.startsAt) && Number.isFinite(row.endsAt));
  const current = month === monthId(now);
  const previousMonth = shiftMonth(month, -1);
  const [year, monthNumber] = previousMonth.split('-').map(Number);
  const sameDay = Math.min(now.getDate(), new Date(year, monthNumber, 0).getDate());
  const previousCutoff = current ? new Date(year, monthNumber - 1, sameDay, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()).getTime() : now.getTime();
  const inMonth = row => row.date.slice(0, 7) === month;
  const completedLessons = valid.filter(row => inMonth(row) && row.endsAt <= now.getTime());
  const scheduledLessons = valid.filter(row => inMonth(row) && row.endsAt > now.getTime());
  const completed = summary(completedLessons);
  const scheduled = summary(scheduledLessons);
  const previousLessons = valid.filter(row => row.date.slice(0, 7) === previousMonth && row.endsAt <= previousCutoff);
  const previous = summary(previousLessons);
  const months = Array.from({ length: windowMonths === 6 ? 6 : 12 }, (_, index) => {
    const key = shiftMonth(month, index - (windowMonths === 6 ? 5 : 11));
    const rows = valid.filter(row => row.date.slice(0, 7) === key && row.endsAt <= now.getTime());
    const totals = summary(rows);
    return { month: key, ...totals, categories: categoryKeys.map(category => ({ key: category, ...summary(rows.filter(row => categoryOf(row) === category)) })) };
  });
  const categories = categoryKeys.map(key => ({ key, ...summary(completedLessons.filter(row => categoryOf(row) === key)) }));
  const grouped = new Map();
  completedLessons.forEach(row => {
    if (!grouped.has(row.studentKey)) grouped.set(row.studentKey, { name: row.student, rows: [] });
    grouped.get(row.studentKey).rows.push(row);
  });
  const students = [...grouped.entries()].map(([key, group]) => {
    const totals = summary(group.rows);
    return { key, name: group.name, ...totals, share: share(totals.fee, completed.fee) };
  }).sort((a, b) => b.fee - a.fee || b.minutes - a.minutes);
  const recurrence = [true, false].map(isFixed => ({ key: isFixed ? 'fixed' : 'temp', ...summary(completedLessons.filter(row => Boolean(row.isFixed) === isFixed)) }));
  const heatmap = Array.from({ length: 24 }, () => Array(7).fill(0));
  completedLessons.forEach(row => {
    const start = new Date(row.startsAt);
    let weekday = (start.getDay() + 6) % 7;
    let minute = start.getHours() * 60 + start.getMinutes(), remaining = row.minutes;
    while (remaining > 0) {
      const hour = Math.floor(minute / 60);
      const piece = Math.min(remaining, 60 - minute % 60);
      heatmap[hour][weekday] += piece;
      remaining -= piece;
      minute += piece;
      if (minute === 1440) { minute = 0; weekday = (weekday + 1) % 7; }
    }
  });
  const feeChange = change(completed.fee, previous.fee);
  const hoursChange = change(completed.minutes, previous.minutes);
  const rateChange = completed.avgRate === null || previous.avgRate === null ? null : change(completed.avgRate, previous.avgRate);
  const insights = [];
  if (!completed.count) insights.push('所选月份暂无已完成课程，当前图表不包含待完成排课。');
  else {
    if (feeChange !== null) insights.push(`${current ? '较上月同期' : '较上月'}课酬${feeChange >= 0 ? '增加' : '减少'}${Math.abs(feeChange).toFixed(1)}%，课时${hoursChange >= 0 ? '增加' : '减少'}${Math.abs(hoursChange).toFixed(1)}%。`);
    else insights.push('上期没有已完成课酬，暂不计算课酬增长率；请结合历史数据完整性判断。');
    if (hoursChange > 0 && rateChange < 0) insights.push(`课时增加，但平均每课时课酬下降${Math.abs(rateChange).toFixed(1)}%；可检查课程类别和单价结构。`);
    const pShare = share(categories[2].fee, completed.fee);
    const previousP = share(summary(previousLessons.filter(row => categoryOf(row) === 'P')).fee, previous.fee);
    if (previous.fee > 0 && Math.abs(pShare - previousP) >= 1) insights.push(`P类课酬占比${pShare >= previousP ? '上升' : '下降'}${Math.abs(pShare - previousP).toFixed(1)}个百分点，当前为${pShare.toFixed(1)}%。`);
    const concentration = students.slice(0, 3).reduce((n, student) => n + student.share, 0);
    insights.push(`前${Math.min(3, students.length)}名学员贡献${concentration.toFixed(1)}%的已完成课酬，可关注其排课稳定性。`);
    if (categories[3].count) insights.push(`有${categories[3].count}次课程类别未明确，已计入“未分类”，未从总计剔除。`);
  }
  const asOf = `${monthId(now)}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return { month, asOf, months, completed, previous, scheduled, projectedFee: completed.fee + scheduled.fee, categories, students, recurrence, heatmap, insights, feeChange, hoursChange, rateChange, comparisonLabel: current ? '较上月同期' : '较完整上月' };
};

export const createMonthlyReportCsv = report => {
  const cell = value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const hours = minutes => Math.round(minutes / 60 * 100) / 100;
  const rows = [
    ['统计口径', '已完成课程课酬，不代表已到账；按本地开始日期归属月份'],
    ['统计截至', report.asOf],
    ['对比口径', report.comparisonLabel],
    ['历史数据说明', '以当前保存记录为准，无法还原已删除或被覆盖的历史'],
    ...(report.undatedCount ? [['历史数据提示', `${report.undatedCount}条固定课程缺少起始周，仅从本周起纳入，历史可能不完整`]] : []),
    ['月份', '上课次数', '已上课时', '已完成课酬', '平均每课时课酬', '学员数'],
    ...report.months.map(row => [row.month, row.count, hours(row.minutes), row.fee, row.avgRate === null ? '' : row.avgRate.toFixed(2), row.studentCount]),
    [], ['所选月份', report.month], ['待完成排课预计课酬', report.scheduled.fee],
    [], ['类别', '上课次数', '课时', '课酬'],
    ...report.categories.map(row => [row.key === 'unclassified' ? '未分类' : `${row.key}类`, row.count, hours(row.minutes), row.fee]),
    [], ['学员', '上课次数', '课时', '课酬', '课酬占比'],
    ...report.students.map(row => [row.name, row.count, hours(row.minutes), row.fee, `${row.share.toFixed(1)}%`]),
  ];
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
};
