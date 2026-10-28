import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, Globe2, CalendarDays, ChevronDown, Clock3, X } from 'lucide-react';
import { BEIJING_ZONE, TIME_ZONES, zonedParts, resolveWallTime, convertBeijingLesson, occurrenceDate, nextOffsetChange, zoneLabel, zoneShort, formatOffset, shiftDate } from './timeZones.js';

const inputClass = 'w-full min-w-0 h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const dayLabel = (date, reference) => date === reference ? '同一天' : date === shiftDate(reference, -1) ? '前一天' : date === shiftDate(reference, 1) ? '后一天' : '跨日';
const dateText = parts => `${parts.date} ${parts.weekday}`;

function ZoneSelect({ value, onChange, label }) {
  return <label className="block min-w-0"><span className="block mb-1.5 text-xs font-bold text-slate-500">{label}</span><span className="relative block"><select value={value} onChange={event => onChange(event.target.value)} className={`${inputClass} appearance-none pr-9`}>
    {TIME_ZONES.map(zone => <option key={zone.id} value={zone.id}>{zone.label}</option>)}
    {value && !TIME_ZONES.some(zone => zone.id === value) && <option value={value}>{value}</option>}
  </select><ChevronDown aria-hidden="true" size={15} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" /></span></label>;
}

export function TimePicker({ value, onChange, label = '当地时间', large = false }) {
  const [hour = '', minute = ''] = value.split(':');
  return <fieldset className="min-w-0"><legend className={`mb-1.5 ${large ? 'text-[15px] font-black text-slate-700' : 'text-xs font-bold text-slate-500'}`}>{label} <span className="font-normal text-xs text-slate-400">24小时制</span></legend>
    <div className={`${large ? 'h-12' : 'h-11'} flex items-center rounded-xl border border-slate-200 bg-white focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100 px-2`}>
      <Clock3 size={15} aria-hidden="true" className="shrink-0 text-slate-400 mr-1" />
      <span className="relative flex-1 min-w-0"><select aria-label={`${label}（小时）`} value={hour} onChange={event => onChange(`${event.target.value}:${minute || '00'}`)} className="h-10 w-full appearance-none pl-1 pr-4 bg-transparent text-base font-bold tabular-nums text-slate-800 outline-none"><option value="" disabled>时</option>{Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0')).map(option => <option key={option}>{option}</option>)}</select><ChevronDown size={11} aria-hidden="true" className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" /></span>
      <span aria-hidden="true" className="px-1 text-slate-300 font-bold">:</span>
      <span className="relative flex-1 min-w-0"><select aria-label={`${label}（分钟）`} value={minute} onChange={event => onChange(`${hour || '00'}:${event.target.value}`)} className="h-10 w-full appearance-none pl-1 pr-4 bg-transparent text-base font-bold tabular-nums text-slate-800 outline-none"><option value="" disabled>分</option>{Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0')).map(option => <option key={option}>{option}</option>)}</select><ChevronDown size={11} aria-hidden="true" className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" /></span>
    </div>
  </fieldset>;
}

const timeDifference = (target, source) => {
  const minutes = target.offsetMinutes - source.offsetMinutes;
  if (!minutes) return '与输入地相同';
  const amount = Math.abs(minutes);
  return `${minutes > 0 ? '快' : '慢'}${Math.floor(amount / 60) ? `${Math.floor(amount / 60)}小时` : ''}${amount % 60 ? `${amount % 60}分钟` : ''}`;
};

export function CourseTimeZonePanel({ weekId, formData, onChange, onConvert }) {
  const zone = formData.studentTimeZone || BEIJING_ZONE;
  const date = occurrenceDate(weekId, Number(formData.colIndex));
  const preview = useMemo(() => convertBeijingLesson(date, formData.startTime, Number(formData.duration), zone), [date, formData.startTime, formData.duration, zone]);
  const change = useMemo(() => formData.recurrence !== 'temp' && zone !== BEIJING_ZONE
    ? nextOffsetChange(date, formData.startTime, Number(formData.duration), zone, formData.recurrence === 'biweekly' ? 14 : 7)
    : null, [date, formData.startTime, formData.duration, formData.recurrence, zone]);
  const beijing = preview ? zonedParts(preview.instant, BEIJING_ZONE) : null;
  return <details open={zone !== BEIJING_ZONE} className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 via-white to-sky-50/60 p-4">
    <summary className="flex items-center gap-2 text-indigo-700 font-black text-sm cursor-pointer list-none"><span className="p-1.5 rounded-lg bg-white shadow-sm"><Globe2 size={16} /></span>学员时区<span className="ml-auto text-[11px] font-bold text-indigo-400">{zoneShort(zone)} · 点击展开<ChevronDown size={12} className="inline ml-1" /></span></summary>
    <div className="space-y-3 mt-3">
    <ZoneSelect label="学员所在时区" value={zone} onChange={onChange} />
    {zone === BEIJING_ZONE ? <p className="text-xs font-medium text-slate-500 leading-relaxed">选择国外学员所在城市，即可查看当地日期与时间。保存课程时记住该时区，选择已有学员时可复用。</p> : preview ? <>
      <div className="grid sm:grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-100 bg-white p-3"><p className="text-[10px] font-bold text-slate-400">课表 · 北京时间</p><p className="text-xs font-bold text-slate-500 mt-1">{dateText(beijing)}</p><p className="text-lg font-black text-slate-800 mt-1">{formData.startTime}<span className="text-sm text-slate-400"> → {zonedParts(preview.instant + Number(formData.duration) * 60000, BEIJING_ZONE).time}</span></p></div>
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3"><div className="flex justify-between gap-1"><p className="text-[10px] font-bold text-indigo-500">学员 · {zoneShort(zone)}</p><span className="text-[10px] font-bold text-indigo-500">{dayLabel(preview.start.date, date)}</span></div><p className="text-xs font-bold text-indigo-600 mt-1">{dateText(preview.start)}</p><p className="text-lg font-black text-indigo-800 mt-1">{preview.start.time}<span className="text-sm text-indigo-400"> → {preview.end.time}</span></p><p className="text-[10px] text-indigo-400 mt-1">{formatOffset(preview.start.offsetMinutes)}{preview.end.date !== preview.start.date ? ` · 结束于${preview.end.date}` : ''}</p></div>
      </div>
      {change && <p className="text-xs font-bold leading-relaxed text-amber-800 bg-amber-50 border border-amber-100 rounded-xl p-3">未来12次排课中，{change.date}起当地时差发生变化，对应当地{change.start.time}。当前固定课保持北京时间，不会自动移动排课。</p>}
      <button type="button" onClick={() => onConvert({ date: preview.start.date, time: preview.start.time, timeZone: zone, duration: Number(formData.duration) })} className="text-xs font-bold text-indigo-600 flex items-center gap-1 hover:text-indigo-800">按学员当地时间反向换算 <ArrowRight size={13} /></button>
    </> : <p className="text-xs text-amber-700">请先填写有效的开始时间和课程时长。</p>}
    <p className="text-[10px] text-slate-400 font-medium leading-relaxed">时区信息只用于显示和换算；固定课以已保存的北京时间为准。关闭或取消不会保存修改。</p>
    </div>
  </details>;
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
  const rows = useMemo(() => instant === null ? [] : targets.filter(zone => zone !== sourceZone).map(zone => ({ zone, start: zonedParts(instant, zone), end: zonedParts(instant + Number(duration) * 60000, zone) })).filter(row => row.start && row.end), [instant, targets, duration, sourceZone]);
  const sourceStart = instant === null ? null : zonedParts(instant, sourceZone);
  const sourceEnd = instant === null ? null : zonedParts(instant + Number(duration) * 60000, sourceZone);
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
    const text = [{ zone: sourceZone, start: sourceStart, end: sourceEnd }, ...rows].map(row => `${zoneLabel(row.zone)}｜${dateText(row.start)} ${row.start.time}—${row.end.date !== row.start.date ? `${row.end.date} ` : ''}${row.end.time}（${formatOffset(row.start.offsetMinutes)}）`).join('\n');
    try { await navigator.clipboard.writeText(text); setCopyStatus('已复制，可粘贴发给学员'); }
    catch { setCopyStatus('未能访问剪贴板，请手动复制换算结果'); }
  };
  return <div className="fixed inset-0 z-[11000] flex items-center justify-center p-2 sm:p-5 bg-slate-900/55 backdrop-blur-sm" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="time-zone-title" className="w-full max-w-2xl max-h-[94dvh] rounded-2xl sm:rounded-3xl bg-white shadow-2xl flex flex-col overflow-hidden">
      <header className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 shrink-0"><div className="flex items-center gap-3"><span className="p-2.5 bg-indigo-50 rounded-2xl text-indigo-600"><Globe2 size={22} /></span><div><h2 id="time-zone-title" className="text-lg font-black text-slate-800">时区换算</h2><p className="text-[11px] text-slate-400 mt-0.5">选好时间，即刻对照世界各地</p></div></div><button ref={closeRef} type="button" onClick={onClose} className="rounded-xl px-2 py-2 hover:bg-slate-100 text-slate-400 flex items-center gap-1 text-xs"><X size={17} />关闭</button></header>
      <div className="p-4 sm:p-6 space-y-5 overflow-y-auto bg-slate-50/60">
        <section className="p-4 bg-white rounded-2xl border border-indigo-100 shadow-sm shadow-indigo-50 space-y-4">
          <div className="flex justify-between items-center"><h3 className="text-[10px] tracking-widest font-black text-indigo-500">设定基准时间</h3><button type="button" onClick={() => { const current = zonedParts(Date.now(), sourceZone); if (current) { setDate(current.date); setTime(current.time); reset(); } }} className="text-[11px] text-slate-400 hover:text-indigo-600 flex items-center gap-1"><Clock3 size={12} />现在</button></div>
          <ZoneSelect label="输入时间所属的城市" value={sourceZone} onChange={value => { setSourceZone(value); reset(); }} />
          <div className="grid grid-cols-2 sm:grid-cols-[1.2fr_1.15fr_.85fr] gap-3"><label className="block min-w-0"><span className="block text-xs text-slate-500 font-bold mb-1.5">当地日期</span><input type="date" min="1900-01-01" max="9998-12-31" value={date} onChange={event => { setDate(event.target.value); reset(); }} className={`${inputClass} text-xs sm:text-sm`} /></label><TimePicker value={time} onChange={value => { setTime(value); reset(); }} /><label className="block min-w-0 col-span-2 sm:col-span-1"><span className="block text-xs text-slate-500 font-bold mb-1.5">课程时长</span><span className="relative block"><select value={duration} onChange={event => { setDuration(Number(event.target.value)); setUseError(''); setCopyStatus(''); }} className={`${inputClass} appearance-none pr-8`}>{[...new Set([30, 60, 90, 120, 150, 180, Number(initial.duration || 60)])].sort((a, b) => a - b).map(value => <option key={value} value={value}>{value}分钟</option>)}</select><ChevronDown aria-hidden="true" size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" /></span></label></div>
          {sourceStart && <div className="flex flex-wrap gap-x-3 gap-y-1 items-center pt-3 border-t border-slate-100 text-xs"><span className="text-slate-400 flex items-center gap-1"><CalendarDays size={12} />{dateText(sourceStart)}</span><span className="font-bold tabular-nums text-indigo-600">{sourceStart.time}—{sourceEnd.time}</span>{sourceEnd.date !== sourceStart.date && <span className="text-amber-600">结束于{sourceEnd.date}</span>}<span className="text-[10px] text-slate-400 ml-auto">{formatOffset(sourceStart.offsetMinutes)}</span></div>}
        </section>
        {resolved.status === 'invalid' && <p role="alert" className="text-sm text-amber-800 bg-amber-50 p-3 rounded-xl">请填写有效的日期、时间和时区。</p>}
        {resolved.status === 'nonexistent' && <p role="alert" className="text-sm text-amber-800 bg-amber-50 p-3 rounded-xl">这个当地时间因夏令时跳时而不存在，请选择其他时间，系统不会自动替你调整。</p>}
        {resolved.status === 'ambiguous' && <div className="text-sm text-amber-800 bg-amber-50 p-3 rounded-xl space-y-2"><p>这一天因冬令时回拨出现了两次 {time}，请选择你指的是哪一次。</p><label className="block text-xs font-bold">重复时间选择<select value={fold} onChange={event => { setFold(event.target.value); setUseError(''); }} className={`${inputClass} mt-1`}><option value="">请选择第一次或第二次</option>{resolved.instants.map((value, index) => <option key={value} value={index}>第{index === 0 ? '一' : '二'}次 {time}（{formatOffset(zonedParts(value, sourceZone).offsetMinutes)}，北京{zonedParts(value, BEIJING_ZONE).time}）</option>)}</select></label></div>}
        <section><div className="flex justify-between items-center gap-2 mb-3"><div><h3 className="text-sm font-black text-slate-700">各地上课时间</h3><p className="text-[10px] text-slate-400 mt-0.5">与输入时间对应的同一时刻</p></div><span className="relative min-w-0 max-w-[160px]"><select aria-label="添加对照城市" value="" onChange={event => { if (event.target.value) { setTargets(current => [...current, event.target.value]); setCopyStatus(''); } }} className="text-xs h-9 w-full appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-7 text-indigo-600 font-bold outline-none focus:border-indigo-400"><option value="">＋ 添加城市</option>{TIME_ZONES.filter(zone => zone.id !== sourceZone && !targets.includes(zone.id)).map(zone => <option key={zone.id} value={zone.id}>{zone.label}</option>)}</select><ChevronDown aria-hidden="true" size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" /></span></div>
          <div aria-live="polite" className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">{rows.map(row => <article key={row.zone} aria-label={zoneLabel(row.zone)} className={`group relative px-3 sm:px-4 py-3 sm:py-3.5 flex items-center gap-3 ${row.zone === BEIJING_ZONE ? 'bg-indigo-50/50' : 'hover:bg-slate-50/60'}`}>
            <span aria-hidden="true" className={`hidden sm:flex w-9 h-9 shrink-0 items-center justify-center rounded-xl text-xs font-black ${row.zone === BEIJING_ZONE ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'}`}>{zoneShort(row.zone).slice(0, 2)}</span>
            <div className="min-w-0 flex-1"><h4 className="text-xs sm:text-sm font-bold text-slate-700 truncate pr-2" title={zoneLabel(row.zone)}>{zoneLabel(row.zone)}</h4><p className="text-[10px] sm:text-[11px] text-slate-400 mt-1">{dateText(row.start)}</p><p className="text-[10px] text-slate-400 mt-0.5">{formatOffset(row.start.offsetMinutes)} · {timeDifference(row.start, sourceStart)}</p></div>
            <div className="shrink-0 text-right"><p className={`text-lg sm:text-2xl font-black tabular-nums tracking-tight ${row.zone === BEIJING_ZONE ? 'text-indigo-700' : 'text-slate-800'}`}>{row.start.time}<span className="text-slate-300 text-xs sm:text-base font-medium mx-1.5">—</span>{row.end.time}</p><div className="flex justify-end items-center gap-1.5 mt-1"><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${row.start.date === date ? 'bg-slate-100 text-slate-400' : 'bg-amber-50 text-amber-700'}`}>{dayLabel(row.start.date, date)}</span>{row.end.date !== row.start.date && <span className="text-[9px] text-amber-600">结束于{row.end.date}</span>}</div>{row.start.offsetMinutes !== row.end.offsetMinutes && <p className="text-[9px] text-amber-600 mt-1">结束时{formatOffset(row.end.offsetMinutes)}</p>}</div>
            <button type="button" aria-label={`移除${zoneShort(row.zone)}对照`} onClick={() => { setTargets(current => current.filter(zone => zone !== row.zone)); setCopyStatus(''); }} className="shrink-0 p-1 text-slate-300 hover:text-slate-600 focus:text-slate-600 rounded-md hover:bg-slate-100"><X size={13} /></button>
          </article>)}</div>
        </section>
        {instant !== null && !rows.length && <p className="text-center text-xs text-slate-400">请添加至少一个对照城市。</p>}
        <p className="text-[10px] text-slate-400 leading-relaxed flex gap-1.5"><Globe2 size={12} className="shrink-0 mt-0.5" />已按所选日期处理夏令时。换算不会保存课程，点击应用后仍需在排课表单确认。</p>
        {(useError || copyStatus) && <p role="status" className={`rounded-xl p-3 text-xs ${useError ? 'bg-amber-50 text-amber-800' : 'bg-teal-50 text-teal-700'}`}>{useError || copyStatus}</p>}
      </div>
      <footer className="shrink-0 p-3 sm:px-6 sm:py-4 border-t border-slate-100 bg-white flex flex-wrap justify-end gap-2"><button type="button" disabled={!rows.length} onClick={copy} className="px-3 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold flex items-center gap-1.5 hover:bg-slate-50 disabled:opacity-30"><Copy size={14} />复制结果</button><button type="button" disabled={instant === null} onClick={() => setUseError(onUse({ instant, duration: Number(duration), studentTimeZone: sourceZone === BEIJING_ZONE ? initial.studentTimeZone || '' : sourceZone }) || '')} className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-30"><Check size={15} />{initial.context === 'editor' ? '使用此时间' : '用于新增排课'}{beijing && <span className="opacity-70">· 北京 {beijing.time}</span>}</button></footer>
    </section>
  </div>;
}
