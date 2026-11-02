import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Gem, Plus, Undo2, Sparkles, LoaderCircle } from 'lucide-react';
import { summarizeAndy } from './andyCounter.js';
import AndyCalendar from './AndyCalendar.jsx';
import './andyCounter.css';

function Jewel({ burst = false }) {
  return <svg aria-hidden="true" viewBox="0 0 160 140" fill="none" className={burst ? 'andy-jewel-art' : 'andy-jewel-icon'}>
    <path d="M35 25H125L148 61 80 125 12 61Z" fill="#ddd6fe" stroke="#a78bfa" strokeWidth="2" />
    <path d="M35 25 52 61 80 25 108 61 125 25" fill="#f5f3ff" />
    <path d="M12 61H148L108 61 80 125 52 61Z" fill="#a78bfa" />
    <path d="M52 61H108L80 125Z" fill="#7c3aed" /><path d="M80 25 52 61H108Z" fill="#c4b5fd" />
    <path d="m118 5 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="#fbbf24" />
    <path d="m24 85 2 7 7 2-7 2-2 7-2-7-7-2 7-2Z" fill="#fbbf24" />
    <path d="m130 100 2 7 7 2-7 2-2 7-2-7-7-2 7-2Z" fill="#c4b5fd" />
  </svg>;
}

export default function AndyCounter({ counter, side = false }) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const closeCalendar = useCallback(() => setCalendarOpen(false), []);
  const [expiredId, setExpiredId] = useState(null);
  const burst = counter.celebration && counter.celebration.id !== expiredId ? counter.celebration.id : null;
  useEffect(() => {
    if (!counter.celebration) return;
    const timer = setTimeout(() => setExpiredId(counter.celebration.id), 2000);
    return () => clearTimeout(timer);
  }, [counter.celebration]);
  const ready = counter.status === 'ready', hasData = ready || counter.status === 'cached';
  return <aside aria-label="Andy独立上课计数" className={`andy-card ${side ? 'andy-card--side' : ''}`}>
    <div className="andy-card-top"><span><Gem size={15} />独立上课记录</span><button type="button" onClick={() => setCalendarOpen(true)} className="andy-card-tag flex items-center gap-1 hover:text-violet-700" aria-label="查看Andy上课记录"><CalendarDays size={12} />记录</button></div>
    <button type="button" aria-label={counter.retry ? '重试Andy本次上课记录' : 'Andy课时增加一次'} disabled={!ready || counter.pending || !!counter.undoRetry} onClick={counter.add} className="andy-add">
      <span className="andy-title">Andy课时 <Sparkles size={17} /></span>
      <span className="andy-count" aria-live="polite">{hasData ? counter.summary.weekCount : '—'}<small>次<span>本周已上</span></small></span>
      <span className="andy-add-hint">{counter.pending ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={18} />}{counter.pending ? '等待云端确认' : !ready ? counter.status === 'cached' ? '离线缓存 · 暂不可记录' : '等待记录加载' : counter.undoRetry ? '请先完成下方撤销' : counter.retry ? '重试本次记录' : '点击一次，记录一堂'}</span>
      {burst && <span key={burst} className="andy-jewel-burst" aria-hidden="true"><Jewel burst /><i>+1</i>{Array.from({ length: 8 }, (_, index) => <b key={index} style={{ '--i': index }}>✦</b>)}</span>}
    </button>
    <div className="andy-mini-stats"><span>本月 <strong>{hasData ? counter.summary.monthCount : '—'}</strong> 次</span><span>累计 <strong>{hasData ? counter.summary.total : '—'}</strong> 次</span></div>
    <div className="andy-card-bottom"><span>周一自动开启新一周<br />历史记录始终保留</span><button type="button" onClick={counter.undo} disabled={!ready || counter.pending || !!counter.retry || !(counter.undoRetry || counter.summary.latest)} title="撤销最近一次有效上课记录" aria-label="撤销Andy上一次上课"><Undo2 size={13} />{counter.undoRetry ? '重试撤销' : '撤销上一次'}</button></div>
    {counter.summary.latest && <p className="andy-latest">最近记录 · {new Date(counter.summary.latest.occurredAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</p>}
    {(counter.error || counter.actionError) && <p role="alert" className="andy-error">{counter.error || counter.actionError}</p>}
    {counter.status === 'error' && <p className="andy-latest">请检查网络或权限后刷新，不会清空已有记录。</p>}
    {calendarOpen && <AndyCalendar counter={counter} onClose={closeCalendar} />}
  </aside>;
}

export function AndyStatistics({ counter, range, months = [] }) {
  const summary = useMemo(() => summarizeAndy(counter.rows, counter.now, range), [counter.rows, counter.now, range]);
  const available = counter.status === 'ready' || counter.status === 'cached';
  const max = Math.max(1, ...months.map(month => summary.byMonth[month] || 0));
  return <section aria-label="Andy课时独立统计" className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 sm:p-5">
    <div className="flex flex-wrap justify-between items-center gap-3"><div><h3 className="font-black text-violet-900 flex items-center gap-2"><Gem size={18} />Andy课时</h3><p className="text-xs text-slate-500 mt-1">独立次数统计 · 不计入排课课时、课酬或课包</p></div><div className="text-violet-700"><strong className="text-2xl tabular-nums">{available ? summary.rangeCount : '—'}</strong><span className="text-xs ml-1">次 / 所选范围</span></div></div>
    <p className="text-xs text-slate-500 mt-3">历史累计 {available ? summary.total : '—'} 次{counter.status === 'cached' ? ' · 离线缓存，尚未确认最新记录' : ''}</p>
    {!available && <p role="status" className="text-sm text-amber-700 mt-3">{counter.error || '正在加载Andy上课记录…'}</p>}
    {available && summary.rangeCount === 0 && <p className="text-xs text-slate-500 mt-3">所选日期范围内暂无Andy上课记录</p>}
    {months.length > 0 && available && <div className="mt-4 space-y-2" role="img" aria-label="Andy每月上课次数趋势">{months.map(month => <div key={month} className="flex items-center gap-3 text-xs"><span className="text-slate-500 w-16 shrink-0">{month}</span><div className="flex-1 h-3 bg-violet-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-indigo-500" style={{ width: `${(summary.byMonth[month] || 0) / max * 100}%` }} /></div><strong className="w-10 text-right text-violet-700">{summary.byMonth[month] || 0}次</strong></div>)}</div>}
  </section>;
}
