import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, Gem, Minus, Plus, Undo2, X } from 'lucide-react';
import { andyMonthCells, isAndyDateSelected, localAndyDate } from './andyCounter.js';
import { shiftMonth } from './monthlyReports.js';

const dateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

export default function AndyCalendar({ counter, onClose }) {
  const today = localAndyDate(counter.now), currentMonth = today.slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [selected, setSelected] = useState(today);
  const [quantity, setQuantity] = useState('1');
  const [message, setMessage] = useState('');
  const dialogRef = useRef(null), closeRef = useRef(null), scrollRef = useRef(null), dayRef = useRef(null);
  const ready = counter.status === 'ready';
  const available = ready || counter.status === 'cached';
  const hasDate = isAndyDateSelected(selected, month, today);
  const blocked = !hasDate || !ready || counter.pending || !!counter.retry || !!counter.undoRetry;
  const cells = useMemo(() => {
    const days = andyMonthCells(month);
    return days.slice(0, Math.ceil((days.findLastIndex(day => day.inMonth) + 1) / 7) * 7);
  }, [month]);
  const records = useMemo(() => counter.rows.filter(row => !row.voided && row.occurredAt <= counter.now.getTime() && localAndyDate(row.occurredAt) === selected).sort((a, b) => (b.createdAt || b.recordedAt || b.occurredAt) - (a.createdAt || a.recordedAt || a.occurredAt) || a.id.localeCompare(b.id)), [counter.rows, counter.now, selected]);
  useEffect(() => {
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    const onKey = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const elements = [...dialogRef.current.querySelectorAll('button, input')].filter(el => !el.disabled && el.getClientRects().length);
      const first = elements[0], last = elements.at(-1);
      if (!dialogRef.current.contains(document.activeElement) || document.activeElement?.disabled) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [onClose]);
  const changeMonth = next => {
    if (next === month) return;
    setMonth(next); setSelected(''); setQuantity('1'); setMessage('');
  };
  const choose = (date, scroll = true) => {
    if (date !== selected) setQuantity('1');
    setSelected(date); setMessage('');
    if (scroll && window.matchMedia('(max-width: 767px)').matches) requestAnimationFrame(() => {
      const container = scrollRef.current, section = dayRef.current;
      if (!container || !section) return;
      container.scrollTo({ top: container.scrollTop + section.getBoundingClientRect().top - container.getBoundingClientRect().top - 12,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    });
  };
  const save = async event => {
    event.preventDefault();
    if (blocked) return;
    setMessage('');
    if (await counter.backfill(selected, Number(quantity))) {
      setMessage(`已为${selected}补录${Number(quantity)}堂，已计入对应日期统计。`);
      setQuantity('1');
    }
  };
  return createPortal(<div className="fixed inset-0 z-[10040] bg-slate-900/45 backdrop-blur-sm flex items-center justify-center p-2 sm:p-5" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="andy-calendar-title" className="w-full max-w-4xl max-h-[94dvh] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-violet-100">
      <header className="flex items-center justify-between gap-3 p-4 sm:px-6 sm:py-5 border-b border-violet-100 bg-gradient-to-r from-violet-50 to-white shrink-0">
        <div className="flex items-center gap-3"><span className="p-3 rounded-2xl bg-white text-violet-600 shadow-sm"><CalendarDays size={22} /></span><div><h2 id="andy-calendar-title" className="font-black text-lg text-violet-950">Andy课时 · 上课记录</h2><p className="text-xs text-slate-500 mt-1">翻阅日历，补上每一堂 · 仅统计次数</p></div></div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭Andy上课记录" className="p-2 rounded-xl text-slate-500 hover:bg-violet-100"><X size={20} /></button>
      </header>
      <div ref={scrollRef} className="overflow-y-auto overscroll-contain p-3 sm:p-6 grid md:grid-cols-[1.1fr_1fr] gap-4 md:gap-5 items-start">
        <section aria-label="Andy上课月历" className="min-w-0">
          <div className="flex items-center justify-between gap-2 mb-4">
            <button type="button" aria-label="Andy日历上个月" disabled={month <= '1900-01' || counter.pending} onClick={() => changeMonth(shiftMonth(month, -1))} className="p-2 rounded-xl border border-violet-100 text-violet-700 disabled:opacity-30"><ChevronLeft size={18} /></button>
            <label className="text-center text-xs text-slate-500 font-bold">记录月份<input type="month" min="1900-01" max={currentMonth} value={month} disabled={counter.pending} onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) && event.target.value >= '1900-01' && event.target.value <= currentMonth) changeMonth(event.target.value); }} className="block mt-1 max-w-[170px] text-base text-violet-900 bg-violet-50 border border-violet-100 rounded-xl px-2 py-2" /></label>
            <button type="button" aria-label="Andy日历下个月" disabled={month >= currentMonth || counter.pending} onClick={() => changeMonth(shiftMonth(month, 1))} className="p-2 rounded-xl border border-violet-100 text-violet-700 disabled:opacity-30"><ChevronRight size={18} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-400 mb-2">{weekdays.map(day => <span key={day} className="py-1">{day}</span>)}</div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {cells.map(cell => {
              const count = available ? counter.summary.byDay[cell.date] || 0 : null;
              if (!cell.inMonth) return <span key={cell.date} aria-hidden="true" className="min-h-[54px] py-2 text-center text-xs text-slate-200">{cell.day}</span>;
              const active = selected === cell.date;
              return <button key={cell.date} type="button" aria-label={`${cell.date} ${count === null ? '记录未确认' : `${count}堂`}`} aria-pressed={active} aria-current={cell.date === today ? 'date' : undefined} disabled={cell.date > today || counter.pending} onClick={() => choose(cell.date)} className={`min-w-0 min-h-[54px] rounded-xl flex flex-col items-center justify-center gap-1 border text-sm font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${active ? 'bg-violet-600 border-violet-600 text-white shadow-md shadow-violet-200' : count > 0 ? 'bg-violet-100 border-violet-200 text-violet-800 hover:bg-violet-200' : 'bg-slate-50 border-transparent text-slate-600 hover:border-violet-200'} ${cell.date === today && !active ? 'ring-1 ring-violet-400' : ''}`}><span>{cell.day}</span><span className={`text-[9px] leading-none ${active ? 'text-violet-100' : 'text-violet-500'}`}>{count > 0 ? `${count}堂` : count === null ? '—' : cell.date === today ? '今天' : '·'}</span></button>;
            })}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 mt-4"><span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded bg-violet-200" />有上课记录 · 数字为当天堂数</span><button type="button" disabled={counter.pending} onClick={() => { setMonth(currentMonth); choose(today, false); }} className="font-bold text-violet-600 px-2 py-1">回到今天</button></div>
          <p className="rounded-xl bg-violet-50 text-violet-700 text-xs p-3 mt-3 flex items-center gap-2"><Gem size={15} />{month} 共 {available ? counter.summary.byMonth[month] || 0 : '—'} 堂</p>
        </section>
        <section ref={dayRef} aria-label="Andy所选日期记录" className="min-w-0 rounded-2xl bg-slate-50 border border-slate-100 p-3 sm:p-4">
          <h3 aria-live="polite" className="font-black text-slate-800 text-sm">{hasDate ? dateLabel(selected) : '请在本月日历选择日期'}</h3>
          {hasDate && <p className="text-xs text-slate-500 mt-1">当天已记录 <strong className="text-violet-700 text-lg mx-1">{available ? records.length : '—'}</strong> 堂</p>}
          <form onSubmit={save} className="mt-4 p-3 rounded-xl bg-white border border-violet-100 space-y-3">
            <label className="text-xs font-bold text-slate-600 block" htmlFor="andy-backfill-quantity">补录堂数</label>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="补录堂数减少1" disabled={blocked || Number(quantity) <= 1} onClick={() => setQuantity(String(Math.max(1, (Number(quantity) || 1) - 1)))} className="p-2 rounded-xl bg-violet-50 text-violet-600 disabled:opacity-30"><Minus size={18} /></button>
              <input id="andy-backfill-quantity" type="number" min="1" max="50" step="1" required disabled={blocked} value={quantity} onChange={event => setQuantity(event.target.value)} className="w-full min-w-0 px-3 py-2 border border-violet-100 rounded-xl text-center text-xl font-black text-violet-700 bg-white" />
              <button type="button" aria-label="补录堂数增加1" disabled={blocked || Number(quantity) >= 50} onClick={() => setQuantity(String(Math.min(50, (Number(quantity) || 0) + 1)))} className="p-2 rounded-xl bg-violet-50 text-violet-600 disabled:opacity-30"><Plus size={18} /></button>
            </div>
            <button type="submit" disabled={blocked} className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-bold disabled:opacity-40">{counter.pending ? '等待云端确认…' : hasDate ? `为 ${selected} 补录 ${quantity || '—'} 堂` : '选好日期后再补录'}</button>
            <p className="text-[10px] leading-relaxed text-slate-400">新增堂数会累加，不会覆盖当天记录。每次可补录1—50堂，同一天可多次补录；不计课酬和时长。</p>
          </form>
          {message && <p role="status" className="text-xs text-emerald-700 bg-emerald-50 p-3 rounded-xl mt-3">{message}</p>}
          {(counter.error || counter.actionError) && <p role="alert" className="text-xs text-amber-800 bg-amber-50 p-3 rounded-xl mt-3">{counter.error || counter.actionError}</p>}
          {counter.retry && <div className="text-xs text-amber-800 bg-amber-50 p-3 mt-3 rounded-xl"><p>{counter.retry.entries ? `待确认补录：${counter.retry.date} · ${counter.retry.entries.length}堂` : '有一笔快捷上课记录尚未确认'}。重试保留原日期与数量。</p><button type="button" disabled={!ready || counter.pending} onClick={counter.add} className="mt-2 font-bold underline">重试这次记录</button></div>}
          {counter.undoRetry && <button type="button" disabled={!ready || counter.pending} onClick={counter.undo} className="text-xs mt-3 p-2 rounded-lg bg-amber-50 text-amber-800 font-bold">重试上次撤销（不会重复扣除）</button>}
          <div className="flex justify-between items-center mt-5 mb-2"><h4 className="text-xs font-bold text-slate-600">当天记录</h4><span className="text-[10px] text-slate-400">每条代表一堂</span></div>
          {!hasDate ? <p className="text-xs text-slate-500 py-3">选定日期后查看当天明细。</p> : !available ? <p className="text-xs text-slate-500 py-3">记录尚未确认，联网后重试。</p> : !records.length ? <p className="text-xs text-slate-400 text-center bg-white rounded-xl py-6">这一天还没有上课记录</p> : <ol className="space-y-2 max-h-64 overflow-y-auto pr-1">{records.map((row, index) => <li key={row.id} className="flex items-center gap-2 bg-white border border-slate-100 rounded-xl p-3"><span className="w-7 h-7 shrink-0 rounded-full bg-violet-50 text-violet-500 text-xs flex items-center justify-center">{index + 1}</span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-600">{row.entryKind === 'backfill' ? '补录上课 · 1堂' : '快捷记录 · 1堂'}</p><p className="text-[10px] text-slate-400 mt-1">录入于 {new Date(row.recordedAt || row.createdAt || row.occurredAt).toLocaleString('zh-CN', { hour12: false })}</p></div><button type="button" aria-label={`撤销${selected}第${index + 1}条记录`} disabled={blocked} onClick={async () => { if (window.confirm(`撤销${selected}的这1堂上课记录？其他记录不会改变。`)) { setMessage(''); await counter.undoEntry(row.id); } }} className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-30"><Undo2 size={15} /></button></li>)}</ol>}
        </section>
      </div>
    </section>
  </div>, document.fullscreenElement || document.body);
}
