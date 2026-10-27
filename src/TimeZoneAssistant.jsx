import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, Globe2, CalendarDays, X } from 'lucide-react';
import { BEIJING_ZONE, TIME_ZONES, zonedParts, resolveWallTime, convertBeijingLesson, occurrenceDate, nextOffsetChange, zoneLabel, zoneShort, formatOffset, shiftDate } from './timeZones.js';

const inputClass = 'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const dayLabel = (date, reference) => date === reference ? '同一天' : date === shiftDate(reference, -1) ? '前一天' : date === shiftDate(reference, 1) ? '后一天' : '跨日';
const dateText = parts => `${parts.date} ${parts.weekday}`;

function ZoneSelect({ value, onChange, label }) {
  return <label className="block min-w-0"><span className="block mb-1.5 text-xs font-bold text-slate-500">{label}</span><select value={value} onChange={event => onChange(event.target.value)} className={inputClass}>
    {TIME_ZONES.map(zone => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
    {value && !TIME_ZONES.some(zone => zone.id === value) && <option value={value}>{value}</option>}
  </select></label>;
}

export function CourseTimeZonePanel({ weekId, formData, onChange, onConvert }) {
  const zone = formData.studentTimeZone || BEIJING_ZONE;
  const date = occurrenceDate(weekId, Number(formData.colIndex));
  const preview = useMemo(() => convertBeijingLesson(date, formData.startTime, Number(formData.duration), zone), [date, formData.startTime, formData.duration, zone]);
  const change = useMemo(() => formData.recurrence !== 'temp' && zone !== BEIJING_ZONE
    ? nextOffsetChange(date, formData.startTime, Number(formData.duration), zone, formData.recurrence === 'biweekly' ? 14 : 7)
    : null, [date, formData.startTime, formData.duration, formData.recurrence, zone]);
  const beijing = preview ? zonedParts(preview.instant, BEIJING_ZONE) : null;
  return <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/60 p-4 space-y-3">
    <div className="flex items-center gap-2 text-indigo-700 font-black text-sm"><span className="p-1.5 rounded-lg bg-white shadow-sm"><Globe2 size={16} /></span>跨时区排课<span className="ml-auto text-[10px] font-bold text-indigo-400">按实际上课日期换算</span></div>
    <ZoneSelect label="学员所在时区" value={zone} onChange={value => onChange(value === BEIJING_ZONE ? '' : value)} />
    {zone === BEIJING_ZONE ? <p className="text-xs font-medium text-slate-500 leading-relaxed">选择国外学员所在城市，即可查看当地日期与时间。保存课程时记住该时区，选择已有学员时可复用。</p> : preview ? <>
      <div className="grid sm:grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-100 bg-white p-3"><p className="text-[10px] font-bold text-slate-400">课表 · 北京时间</p><p className="text-xs font-bold text-slate-500 mt-1">{dateText(beijing)}</p><p className="text-lg font-black text-slate-800 mt-1">{formData.startTime}<span className="text-sm text-slate-400"> → {zonedParts(preview.instant + Number(formData.duration) * 60000, BEIJING_ZONE).time}</span></p></div>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3"><div className="flex justify-between gap-1"><p className="text-[10px] font-bold text-indigo-500">学员 · {zoneShort(zone)}</p><span className="text-[10px] font-bold text-indigo-500">{dayLabel(preview.start.date, date)}</span></div><p className="text-xs font-bold text-indigo-600 mt-1">{dateText(preview.start)}</p><p className="text-lg font-black text-indigo-800 mt-1">{preview.start.time}<span className="text-sm text-indigo-400"> → {preview.end.time}</span></p><p className="text-[10px] text-indigo-400 mt-1">{formatOffset(preview.start.offsetMinutes)}{preview.end.date !== preview.start.date ? ` · 结束于${preview.end.date}` : ''}</p></div>
      </div>
      {change && <p className="text-xs font-bold leading-relaxed text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3">未来12次排课中，{change.date}起当地时差发生变化，对应当地{change.start.time}。当前固定课保持北京时间，不会自动移动排课。</p>}
      <button type="button" onClick={() => onConvert({ date: preview.start.date, time: preview.start.time, timeZone: zone, duration: Number(formData.duration) })} className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:text-indigo-800">按学员当地时间反向换算 <ArrowRight size={13} /></button>
    </> : <p className="text-xs text-amber-700">请先填写有效的开始时间和课程时长。</p>}
    <p className="text-[10px] text-slate-400 font-medium leading-relaxed">时区信息只用于显示和换算；固定课以已保存的北京时间为准。关闭或取消不会保存修改。</p>
  </section>;
}

export function CourseTimeZoneBadge({ preview, zone, compact, notes, onClick }) {
  if (!preview) return null;
  const title = `${zoneLabel(zone)}：${dateText(preview.start)} ${preview.start.time}—${preview.end.date !== preview.start.date ? `${preview.end.date} ` : ''}${preview.end.time}（${formatOffset(preview.start.offsetMinutes)}）${notes ? ` · ${notes}` : ''}`;
  return <button type="button" onClick={event => { event.stopPropagation(); onClick(); }} aria-label={`查看${zoneShort(zone)}当地时间`} title={title} className={compact ? 'shrink-0 text-indigo-500 rounded hover:bg-indigo-100' : 'shrink-0 min-w-0 flex items-center gap-1 text-[9px] leading-[12px] text-indigo-600 hover:text-indigo-800 text-left'}>
    <Globe2 size={compact ? 10 : 9} className="shrink-0" />{!compact && <span className="truncate">{zoneShort(zone)} {preview.start.weekday.replace('星期', '周')}{preview.start.time}{preview.start.dayOffset ? `（${preview.start.dayOffset < 0 ? '前' : '后'}一天）` : ''}{notes ? ` · ${notes}` : ''}</span>}
  </button>;
}

export default function TimeZoneConverter({ initial, onClose, onUse }) {
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [sourceZone, setSourceZone] = useState(initial.timeZone || BEIJING_ZONE);
  const [duration, setDuration] = useState(initial.duration || 60);
  const [fold, setFold] = useState(() => {
    if (!Number.isFinite(initial.instant)) return '';
    const index = resolveWallTime(initial.date, initial.time, initial.timeZone || BEIJING_ZONE).instants.indexOf(initial.instant);
    return index >= 0 ? String(index) : '';
  });
  const [targets, setTargets] = useState([BEIJING_ZONE, 'America/Los_Angeles', 'America/Chicago', 'Europe/London', 'Asia/Bangkok']);
  const [useError, setUseError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const dialogRef = useRef(null), closeRef = useRef(null);
  const resolved = useMemo(() => resolveWallTime(date, time, sourceZone), [date, time, sourceZone]);
  const instant = resolved.status === 'valid' ? resolved.instants[0] : resolved.status === 'ambiguous' && fold !== '' ? resolved.instants[Number(fold)] : null;
  const rows = useMemo(() => instant === null ? [] : targets.map(zone => ({ zone, start: zonedParts(instant, zone), end: zonedParts(instant + Number(duration) * 60000, zone) })).filter(row => row.start && row.end), [instant, targets, duration]);
  const beijing = instant === null ? null : zonedParts(instant, BEIJING_ZONE);
  const reset = () => { setFold(''); setUseError(''); setCopyStatus(''); };
  useEffect(() => {
    const previousFocus = document.activeElement;
    closeRef.current?.focus();
    const key = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const elements = [...dialogRef.current.querySelectorAll('button, input, select')].filter(el => !el.disabled && el.getClientRects().length);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [onClose]);
  const copy = async () => {
    const text = rows.map(row => `${zoneLabel(row.zone)}｜${dateText(row.start)} ${row.start.time}—${row.end.date !== row.start.date ? `${row.end.date} ` : ''}${row.end.time}（${formatOffset(row.start.offsetMinutes)}）`).join('\n');
    try { await navigator.clipboard.writeText(text); setCopyStatus('已复制，可粘贴发给学员'); }
    catch { setCopyStatus('未能访问剪贴板，请手动复制换算结果'); }
  };
  return <div className="fixed inset-0 z-[11000] flex items-center justify-center p-2 sm:p-5 bg-slate-900/55 backdrop-blur-sm" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="time-zone-title" className="w-full max-w-3xl max-h-[94dvh] rounded-2xl sm:rounded-3xl bg-slate-50 shadow-2xl flex flex-col overflow-hidden">
      <header className="bg-white px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0"><div><h2 id="time-zone-title" className="text-lg font-black flex items-center gap-2"><span className="p-2 bg-indigo-50 rounded-xl text-indigo-600"><Globe2 size={21} /></span>时区换算</h2><p className="text-xs text-slate-400 mt-1">同一堂课，不同城市的当地时间</p></div><button ref={closeRef} type="button" onClick={onClose} className="rounded-xl px-2 py-2 hover:bg-slate-100 text-slate-500 flex items-center gap-1"><X size={18} />关闭</button></header>
      <div className="p-4 sm:p-6 space-y-4 overflow-y-auto">
        <section className="p-4 bg-white rounded-2xl border border-slate-200 space-y-3">
          <ZoneSelect label="输入时间所属的城市" value={sourceZone} onChange={value => { setSourceZone(value); reset(); }} />
          <div className="grid grid-cols-2 sm:grid-cols-[1.5fr_1fr_1fr] gap-3"><label className="block min-w-0"><span className="block text-xs text-slate-500 font-bold mb-1.5">当地日期</span><input type="date" min="1900-01-01" max="9998-12-31" value={date} onChange={event => { setDate(event.target.value); reset(); }} className={inputClass} /></label><label className="block min-w-0"><span className="block text-xs text-slate-500 font-bold mb-1.5">当地开始时间</span><input type="time" value={time} onChange={event => { setTime(event.target.value); reset(); }} className={inputClass} /></label><label className="block min-w-0 col-span-2 sm:col-span-1"><span className="block text-xs text-slate-500 font-bold mb-1.5">课程时长</span><select value={duration} onChange={event => { setDuration(Number(event.target.value)); setUseError(''); }} className={inputClass}>{[...new Set([30, 60, 90, 120, 150, 180, Number(initial.duration || 60)])].sort((a, b) => a - b).map(value => <option key={value} value={value}>{value}分钟</option>)}</select></label></div>
        </section>
        {resolved.status === 'invalid' && <p role="alert" className="text-sm text-amber-800 bg-amber-50 p-3 rounded-xl">请填写有效的日期、时间和时区。</p>}
        {resolved.status === 'nonexistent' && <p role="alert" className="text-sm text-amber-800 bg-amber-50 p-3 rounded-xl">这个当地时间因夏令时跳时而不存在，请选择其他时间，系统不会自动替你调整。</p>}
        {resolved.status === 'ambiguous' && <div className="text-sm text-amber-800 bg-amber-50 p-3 rounded-xl space-y-2"><p>这一天因冬令时回拨出现了两次 {time}，请选择你指的是哪一次。</p><label className="block text-xs font-bold">重复时间选择<select value={fold} onChange={event => { setFold(event.target.value); setUseError(''); }} className={`${inputClass} mt-1`}><option value="">请选择第一次或第二次</option>{resolved.instants.map((value, index) => <option key={value} value={index}>第{index === 0 ? '一' : '二'}次 {time}（{formatOffset(zonedParts(value, sourceZone).offsetMinutes)}，北京{zonedParts(value, BEIJING_ZONE).time}）</option>)}</select></label></div>}
        <section><div className="flex flex-wrap justify-between items-center gap-2 mb-2"><h3 className="text-xs font-black text-slate-500">对照城市</h3><select aria-label="添加对照城市" value="" onChange={event => { if (event.target.value) setTargets(current => [...current, event.target.value]); }} className="text-xs rounded-lg border border-slate-200 bg-white px-2 py-1.5 max-w-[200px]"><option value="">＋ 添加城市</option>{TIME_ZONES.filter(zone => !targets.includes(zone.id)).map(zone => <option key={zone.id} value={zone.id}>{zone.label}</option>)}</select></div>
          <div className="flex flex-wrap gap-2">{targets.map(zone => <button type="button" key={zone} onClick={() => setTargets(current => current.filter(item => item !== zone))} title="点击移除此对照城市" className="inline-flex items-center gap-1 text-xs font-bold rounded-full border border-indigo-100 bg-indigo-50 text-indigo-600 px-2.5 py-1.5">{zoneShort(zone)}<X size={10} /></button>)}</div>
        </section>
        <div aria-live="polite" className="grid sm:grid-cols-2 gap-3">{rows.map(row => <article key={row.zone} className={`min-w-0 rounded-2xl border p-4 ${row.zone === BEIJING_ZONE ? 'bg-gradient-to-br from-indigo-600 to-violet-600 border-indigo-500 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
          <div className="flex justify-between items-center gap-2"><h3 className={`text-xs font-bold ${row.zone === BEIJING_ZONE ? 'text-indigo-100' : 'text-slate-500'}`}>{zoneLabel(row.zone)}</h3><span className={`text-[10px] px-2 py-0.5 rounded-full ${row.zone === BEIJING_ZONE ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>{dayLabel(row.start.date, date)}</span></div>
          <p className="text-xs font-bold mt-3 opacity-70 flex items-center gap-1"><CalendarDays size={12} />{dateText(row.start)}</p><p className="text-2xl font-black tracking-tight mt-1 tabular-nums">{row.start.time}<span className="text-sm font-bold opacity-50 mx-2">—</span>{row.end.time}</p><p className="text-[10px] opacity-60 mt-2">{formatOffset(row.start.offsetMinutes)}{row.end.date !== row.start.date ? ` · 结束于${row.end.date}` : ''}{row.start.offsetMinutes !== row.end.offsetMinutes ? ` · 结束时${formatOffset(row.end.offsetMinutes)}` : ''}</p>
        </article>)}</div>
        {instant !== null && !rows.length && <p className="text-center text-xs text-slate-400">请添加至少一个对照城市。</p>}
        <p className="text-[11px] text-slate-400 leading-relaxed">按所选日期的时区规则计算，包含夏令时。课表始终按北京时间显示；此处换算不会自动修改或保存课程。</p>
        {(useError || copyStatus) && <p role="status" className={`rounded-xl p-3 text-xs ${useError ? 'bg-amber-50 text-amber-800' : 'bg-teal-50 text-teal-700'}`}>{useError || copyStatus}</p>}
      </div>
      <footer className="shrink-0 p-3 sm:px-6 sm:py-4 border-t border-slate-200 bg-white flex flex-wrap justify-end gap-2"><button type="button" disabled={!rows.length} onClick={copy} className="px-3 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold flex items-center gap-1 disabled:opacity-30"><Copy size={14} />复制对照结果</button><button type="button" disabled={instant === null} onClick={() => setUseError(onUse({ instant, duration: Number(duration), studentTimeZone: sourceZone === BEIJING_ZONE ? initial.studentTimeZone || '' : sourceZone }) || '')} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center gap-1 hover:bg-indigo-700 disabled:opacity-30"><Check size={15} />{initial.context === 'editor' ? '使用此时间' : '用于新增排课'}{beijing && <span className="opacity-70">（北京 {beijing.time}）</span>}</button></footer>
    </section>
  </div>;
}
