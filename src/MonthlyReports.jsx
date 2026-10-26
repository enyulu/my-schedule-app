import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { buildMonthlyReport, collectReportLessons, createMonthlyReportCsv, monthId, shiftMonth } from './monthlyReports.js';

const number = value => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
const money = value => value === null ? '—' : `¥${number(value)}`;
const hours = minutes => number(minutes / 60);
const categoryStyle = {
  A: { name: 'A类', color: '#38bdf8' }, B: { name: 'B类', color: '#34d399' },
  P: { name: 'P类', color: '#fb7185' }, unclassified: { name: '未分类', color: '#94a3b8' },
};
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const percent = value => `${number(value)}%`;
const tableClass = 'w-full text-left text-xs sm:text-sm border-collapse';
const cellClass = 'px-3 py-3 border-b border-slate-100 whitespace-nowrap';

function Panel({ title, description, children, action }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 min-w-0">
    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
      <div><h3 className="font-black text-slate-800">{title}</h3>{description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{description}</p>}</div>{action}
    </div>{children}
  </section>;
}

function FeeChart({ months }) {
  const max = Math.max(1, ...months.map(row => row.fee));
  return <div className="overflow-x-auto pb-2" role="img" aria-label="每月已完成课程课酬柱状图，具体数值见月度明细表">
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${months.length}, minmax(44px, 1fr))`, minWidth: months.length * 58 }}>
      {months.map(row => <div key={row.month} className="min-w-0 text-center">
        <div className="h-40 flex flex-col justify-end items-center gap-1 border-b border-slate-200">
          <span className="text-[10px] font-bold text-indigo-700">{number(row.fee)}</span>
          <div className="w-8 sm:w-10 rounded-t-md bg-gradient-to-t from-indigo-600 to-violet-400" style={{ height: `${row.fee / max * 80}%`, minHeight: row.fee ? 3 : 0 }} title={`${row.month}：${money(row.fee)}，${hours(row.minutes)}课时`} />
        </div>
        <p className="text-[10px] text-slate-500 mt-2">{row.month}</p>
      </div>)}
    </div>
  </div>;
}

function RateChart({ months }) {
  const max = Math.max(1, ...months.map(row => row.avgRate ?? 0));
  const path = months.map((row, index) => {
    if (row.avgRate === null) return '';
    const command = index > 0 && months[index - 1].avgRate !== null ? 'L' : 'M';
    return `${command}${45 + index * 525 / (months.length - 1)},${140 - row.avgRate / max * 105}`;
  }).join(' ');
  return <div className="overflow-x-auto">
    <svg viewBox="0 0 610 180" className="w-full min-w-[440px]" role="img" aria-label="加权平均每课时课酬折线图，缺数据月份不连线，具体数值见月度明细表">
      {[0, 1, 2].map(tick => <g key={tick}><line x1="40" x2="585" y1={140 - tick * 52.5} y2={140 - tick * 52.5} stroke="#e2e8f0" strokeDasharray="4 4" /><text x="3" y={144 - tick * 52.5} fontSize="10" fill="#64748b">{Math.round(max * tick / 2)}</text></g>)}
      <path d={path} fill="none" stroke="#0d9488" strokeWidth="3" />
      {months.map((row, index) => {
        const x = 45 + index * 525 / (months.length - 1);
        return <g key={row.month}>{row.avgRate !== null && <circle cx={x} cy={140 - row.avgRate / max * 105} r="4" fill="#0d9488"><title>{row.month}：{money(row.avgRate)}/课时</title></circle>}<text x={x} y="165" fontSize="9" textAnchor="middle" fill="#64748b">{row.month.slice(2)}</text></g>;
      })}
    </svg>
  </div>;
}

export default function MonthlyReports({ courses, collectLessons, now, onClose }) {
  const [month, setMonth] = useState(() => monthId(now));
  const [windowMonths, setWindowMonths] = useState(6);
  const [metric, setMetric] = useState('minutes');
  const [monthError, setMonthError] = useState('');
  const [showAllStudents, setShowAllStudents] = useState(false);
  const dialogRef = useRef(null), closeRef = useRef(null);
  const currentMonth = monthId(now);
  const { report, undatedCount } = useMemo(() => {
    const dataset = collectReportLessons({ courses, month, windowMonths, now, collectLessons });
    return { report: { ...buildMonthlyReport({ lessons: dataset.lessons, month, windowMonths, now }), undatedCount: dataset.undatedCount }, undatedCount: dataset.undatedCount };
  }, [courses, month, windowMonths, now, collectLessons]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const elements = [...dialogRef.current.querySelectorAll('button, input, select, summary')].filter(el => !el.disabled && el.getClientRects().length);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [onClose]);
  const chooseMonth = value => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || value < '1900-01' || value > currentMonth) { setMonthError('请选择有效且不晚于本月的月份'); return; }
    setMonthError(''); setMonth(value);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([createMonthlyReportCsv(report)], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a'); link.href = url; link.download = `课表统计报告_${month}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const maxHeat = Math.max(1, ...report.heatmap.flat());
  const visibleStudents = showAllStudents ? report.students : report.students.slice(0, 10);
  const cards = [
    { label: '已完成课酬', value: money(report.completed.fee), change: report.feeChange, note: `${report.completed.count}次课程，不代表已到账` },
    { label: '已上课时', value: `${hours(report.completed.minutes)}课时`, change: report.hoursChange, note: '按真实课程分钟数 ÷ 60' },
    { label: '平均每课时课酬', value: money(report.completed.avgRate), change: report.rateChange, note: '总课酬 ÷ 总课时，加权计算' },
    { label: '授课学员', value: `${report.completed.studentCount}名`, change: null, note: `上期${report.previous.studentCount}名，按已有标识或名称分组` },
  ];
  return <div className="fixed inset-0 z-[10000] bg-slate-900/50 backdrop-blur-sm p-2 sm:p-5 flex items-center justify-center" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="monthly-report-title" className="w-full max-w-6xl max-h-[94dvh] flex flex-col rounded-2xl bg-slate-50 shadow-2xl overflow-hidden">
      <header className="shrink-0 bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
        <div><h2 id="monthly-report-title" className="text-lg sm:text-xl font-black flex items-center gap-2"><BarChart3 className="text-indigo-600" size={22} />统计报告</h2><p className="text-xs text-slate-500 mt-1">课酬、课时与课程结构 · 只读分析</p></div>
        <div className="flex gap-1 sm:gap-2"><button type="button" onClick={download} title="导出月度汇总和学员表" className="p-2 sm:px-3 rounded-lg text-indigo-600 bg-indigo-50 font-bold flex items-center gap-1"><Download size={16} /><span className="hidden sm:inline">导出CSV</span><span className="sr-only sm:hidden">导出CSV</span></button><button ref={closeRef} type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 flex items-center gap-1"><X size={18} />关闭</button></div>
      </header>
      <div className="overflow-y-auto p-3 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2"><button type="button" aria-label="查看上个月报告" disabled={month <= '1900-01'} onClick={() => chooseMonth(shiftMonth(month, -1))} className="p-2 bg-white border border-slate-200 rounded-lg disabled:opacity-30"><ChevronLeft size={18} /></button><label className="text-xs font-bold text-slate-500">报告月份<input type="month" min="1900-01" max={currentMonth} value={month} onChange={event => chooseMonth(event.target.value)} className="block bg-white text-slate-800 rounded-lg border border-slate-200 px-2 py-2 mt-1 max-w-[180px]" /></label><button type="button" aria-label="查看下个月报告" disabled={month >= currentMonth} onClick={() => chooseMonth(shiftMonth(month, 1))} className="p-2 bg-white border border-slate-200 rounded-lg disabled:opacity-30"><ChevronRight size={18} /></button></div>
          <div className="flex flex-wrap items-center gap-2"><button type="button" onClick={() => chooseMonth(currentMonth)} className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-bold">本月</button><label className="text-xs font-bold text-slate-500">趋势范围 <select value={windowMonths} onChange={event => setWindowMonths(Number(event.target.value))} className="bg-white border border-slate-200 rounded-lg px-2 py-2 text-slate-700"><option value={6}>近6个月</option><option value={12}>近12个月</option></select></label></div>
        </div>
        {monthError && <p role="alert" className="text-red-600 text-sm">{monthError}</p>}
        <div className="text-xs leading-relaxed text-slate-500 bg-white border border-slate-200 rounded-xl p-3">
          按本地上课日期统计已结束课程；取消、停课及明确未完成课程不计入。{month === currentMonth ? `当前月截至${now.getDate()}日${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}，与上月同日同一时间比较。` : '历史月份与完整上月比较。'}基于当前已保存记录，无法还原已删除或被覆盖的历史。
        </div>
        {undatedCount > 0 && <p className="bg-amber-50 border border-amber-200 text-amber-800 text-xs leading-relaxed p-3 rounded-xl">{undatedCount}条旧固定课程缺少起始周；报告仅从本周起纳入这些课程，避免推算不存在的历史。因此历史月份可能不完整。</p>}
        <div aria-live="polite" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map(card => <div key={card.label} className="bg-white border border-slate-200 rounded-2xl p-4 min-w-0"><p className="text-xs font-bold text-slate-500">{card.label}</p><p className="text-xl sm:text-2xl font-black text-slate-800 mt-2 break-words">{card.value}</p><p className={`text-xs mt-2 ${card.change !== null && card.change < 0 ? 'text-amber-700' : 'text-teal-700'}`}>{card.change === null ? card.label === '授课学员' ? report.comparisonLabel : '上期为零或无数据，暂无变化率' : `${report.comparisonLabel} ${card.change >= 0 ? '+' : ''}${percent(card.change)}`}</p><p className="text-[11px] text-slate-400 mt-2 leading-relaxed">{card.note}</p></div>)}
        </div>
        {month === currentMonth && <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900 leading-relaxed"><strong>待完成排课预计课酬 {money(report.scheduled.fee)}</strong><span className="block sm:inline sm:ml-3 text-xs">{report.scheduled.count}次｜{hours(report.scheduled.minutes)}课时，包含进行中课程；与已完成课酬合计预计 {money(report.projectedFee)}。不保证实际上课或收款。</span></div>}
        <Panel title="本月观察" description="由当前记录计算的变化提示，不对缺失历史作推断。"><ul className="space-y-2 text-sm text-slate-600">{report.insights.map((insight, index) => <li key={index} className="flex gap-2"><span className="text-indigo-400">•</span><span>{insight}</span></li>)}</ul></Panel>
        <div className="grid lg:grid-cols-2 gap-5">
          <Panel title="每月课酬趋势" description="仅已完成课程，单位：元；当前月为截至当前时间的累计值。"><FeeChart months={report.months} /></Panel>
          <Panel title="平均课时课酬变化" description="单位：元/课时。变化也受课程结构影响，不等同于每名学员都调价。"><RateChart months={report.months} /></Panel>
        </div>
        <Panel title="课程类别结构" description="A/B/P读取已有类别字段，旧课程的未知类别保留在未分类。" action={<div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-50">{[['minutes', '按课时'], ['fee', '按课酬']].map(([key, label]) => <button type="button" key={key} aria-pressed={metric === key} onClick={() => setMetric(key)} className={`text-xs px-3 py-1.5 rounded-md font-bold ${metric === key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div>}>
          <div className="flex flex-wrap gap-4 text-xs text-slate-600 mb-4">{Object.entries(categoryStyle).map(([key, style]) => <span key={key} className="flex gap-1 items-center"><i className="w-2.5 h-2.5 rounded-full" style={{ background: style.color }} />{style.name}</span>)}</div>
          <div className="space-y-2 mb-5">{report.months.map(row => {
            const total = row[metric];
            return <div key={row.month} className="flex items-center gap-3 text-[10px]"><span className="w-14 shrink-0 text-slate-500">{row.month}</span><div className="h-6 flex flex-1 rounded-md overflow-hidden bg-slate-100">{row.categories.map(category => total > 0 && category[metric] > 0 && <div key={category.key} title={`${categoryStyle[category.key].name}：${metric === 'minutes' ? `${hours(category.minutes)}课时` : money(category.fee)}`} style={{ width: `${category[metric] / total * 100}%`, background: categoryStyle[category.key].color }} className="flex items-center justify-center text-slate-900 font-bold">{category[metric] / total >= .18 ? categoryStyle[category.key].name : ''}</div>)}{!total && <span className="text-slate-400 px-2 self-center">暂无数据</span>}</div></div>;
          })}</div>
          <div className="overflow-x-auto"><table className={tableClass}><caption className="text-left text-xs text-slate-500 mb-2">{month} 分类明细</caption><thead><tr>{['类别', '次数', '课时', '课酬', '学员数', '课酬占比'].map(label => <th scope="col" key={label} className={cellClass}>{label}</th>)}</tr></thead><tbody>{report.categories.map(row => <tr key={row.key}><th scope="row" className={cellClass}>{categoryStyle[row.key].name}</th><td className={cellClass}>{row.count}</td><td className={cellClass}>{hours(row.minutes)}</td><td className={cellClass}>{money(row.fee)}</td><td className={cellClass}>{row.studentCount}</td><td className={cellClass}>{percent(report.completed.fee ? row.fee / report.completed.fee * 100 : 0)}</td></tr>)}</tbody></table></div>
          <p className="text-[11px] text-slate-400 mt-2">同一学员可跨类别出现，各类别人数不直接相加。</p>
        </Panel>
        <Panel title="学员贡献" description="按已完成课酬排序；没有独立学员标识时沿用现有名称分组，不猜测或合并不同课程名称。">
          {!report.students.length ? <p className="text-sm text-slate-400 py-5 text-center">所选月份暂无已完成课程</p> : <><div className="overflow-x-auto"><table className={tableClass}><thead><tr>{['学员', '次数', '课时', '课酬', '平均课时课酬', '课酬占比'].map(label => <th scope="col" key={label} className={cellClass}>{label}</th>)}</tr></thead><tbody>{visibleStudents.map(row => <tr key={row.key}><th scope="row" className={`${cellClass} max-w-[200px] truncate`} title={row.name}>{row.name}</th><td className={cellClass}>{row.count}</td><td className={cellClass}>{hours(row.minutes)}</td><td className={cellClass}>{money(row.fee)}</td><td className={cellClass}>{money(row.avgRate)}</td><td className={cellClass}>{percent(row.share)}</td></tr>)}</tbody></table></div>{report.students.length > 10 && <button type="button" onClick={() => setShowAllStudents(!showAllStudents)} className="mt-3 text-xs text-indigo-600 font-bold">{showAllStudents ? '收起为前10名' : `展开全部${report.students.length}名学员`}</button>}</>}
        </Panel>
        <Panel title="固定课与临时课" description="固定课包含每周及隔周循环课程，按已完成课时比较。">
          <div className="flex h-5 bg-slate-100 rounded-md overflow-hidden mb-4">{report.recurrence.map(row => report.completed.minutes > 0 && <div key={row.key} style={{ width: `${row.minutes / report.completed.minutes * 100}%`, background: row.key === 'fixed' ? '#818cf8' : '#fbbf24' }} title={`${row.key === 'fixed' ? '固定课' : '临时课'}：${hours(row.minutes)}课时`} />)}</div>
          <div className="overflow-x-auto"><table className={tableClass}><thead><tr>{['排课方式', '次数', '课时', '课酬', '课时占比'].map(label => <th scope="col" key={label} className={cellClass}>{label}</th>)}</tr></thead><tbody>{report.recurrence.map(row => <tr key={row.key}><th scope="row" className={cellClass}>{row.key === 'fixed' ? '固定课' : '临时课'}</th><td className={cellClass}>{row.count}</td><td className={cellClass}>{hours(row.minutes)}</td><td className={cellClass}>{money(row.fee)}</td><td className={cellClass}>{percent(report.completed.minutes ? row.minutes / report.completed.minutes * 100 : 0)}</td></tr>)}</tbody></table></div>
        </Panel>
        <Panel title="授课时段热力图" description="每格为该月份在对应星期、小时内累计的已上课时，颜色越深越集中。跨午夜按时段拆分，重叠排课会累加，不代表可预约时间。">
          <div className="overflow-x-auto"><table className="w-full min-w-[380px] text-center text-[10px]"><thead><tr><th scope="col" className="py-2 text-slate-500">时段</th>{weekdays.map(day => <th scope="col" key={day} className="py-2 text-slate-500">{day}</th>)}</tr></thead><tbody>{report.heatmap.map((row, hour) => (hour >= 8 || row.some(Boolean)) && <tr key={hour}><th scope="row" className="pr-2 py-0.5 text-slate-400 font-medium">{String(hour).padStart(2, '0')}:00</th>{row.map((minutes, day) => <td key={day} className="p-0.5"><div title={`${weekdays[day]} ${hour}:00—${hour + 1}:00：${hours(minutes)}课时`} className="rounded py-1" style={{ background: minutes ? `rgba(99,102,241,${.1 + .8 * minutes / maxHeat})` : '#f1f5f9', color: minutes / maxHeat > .55 ? 'white' : '#475569' }}>{minutes ? hours(minutes) : '·'}</div></td>)}</tr>)}</tbody></table></div>
        </Panel>
        <Panel title="月度数据明细" description="图表对应的可核对数值，导出CSV也包含此表。">
          <div className="overflow-x-auto"><table className={tableClass}><thead><tr>{['月份', '次数', '课时', '已完成课酬', '平均课时课酬', '学员数'].map(label => <th scope="col" key={label} className={cellClass}>{label}</th>)}</tr></thead><tbody>{report.months.map(row => <tr key={row.month} className={row.month === month ? 'bg-indigo-50' : ''}><th scope="row" className={cellClass}>{row.month}{row.month === currentMonth ? '（截至当前）' : ''}</th><td className={cellClass}>{row.count}</td><td className={cellClass}>{hours(row.minutes)}</td><td className={cellClass}>{money(row.fee)}</td><td className={cellClass}>{money(row.avgRate)}</td><td className={cellClass}>{row.studentCount}</td></tr>)}</tbody></table></div>
        </Panel>
      </div>
    </section>
  </div>;
}
