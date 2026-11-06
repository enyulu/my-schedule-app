export const FINANCE_CATEGORIES = ['A', 'B', 'P', 'unclassified'];
export const financeCategoryLabel = key => key === 'unclassified' ? '未分类' : `${key}类`;

export const buildFinanceExport = ({ courses, lessons, courseFilter = '', displayInfo = course => ({ title: course.title }) }) => {
  const byId = new Map(courses.map(course => [course.id, course]));
  const details = Object.fromEntries(FINANCE_CATEGORIES.map(key => [key, []]));
  const totals = Object.fromEntries(FINANCE_CATEGORIES.map(key => [key, 0]));
  let count = 0, totalAll = 0;
  for (const lesson of lessons) {
    const course = byId.get(lesson.courseId);
    if (!course || (courseFilter && (course.title || '').replace(/\s*\(第\d+课\)/g, '').trim() !== courseFilter)) continue;
    const category = Object.hasOwn(details, lesson.category) ? lesson.category : 'unclassified';
    const { title, dynamicNote } = displayInfo(course, lesson.date);
    details[category].push({
      date: lesson.date, title, time: `${lesson.startTime}—${lesson.endTime}`,
      duration: `${Math.round(lesson.minutes / 60 * 100) / 100} 小时`, value: lesson.fee,
      notes: [dynamicNote, course.notes].filter(Boolean).join(' | '),
    });
    totals[category] += lesson.fee;
    totalAll += lesson.fee;
    count++;
  }
  return { details, totals, count, totalAll };
};

export const createFinanceCsv = result => {
  const cell = value => {
    let text = String(value ?? '');
    if (typeof value === 'string' && (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text))) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = [['类别', '日期', '课程', '上课时间', '时长', '结算', '备注']];
  for (const category of FINANCE_CATEGORIES) {
    if (!result.details[category].length) continue;
    const label = financeCategoryLabel(category);
    for (const row of result.details[category]) rows.push([label, row.date, row.title, row.time, row.duration, row.value, row.notes]);
    rows.push([`${label}合计`, '', '', '', '', result.totals[category], '']);
  }
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
};
