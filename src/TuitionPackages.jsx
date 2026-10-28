import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Plus, X, ArrowLeft, Copy, Download, AlertCircle, Wallet, RefreshCw } from 'lucide-react';
import { beijingInput, calculateTuition, collectTuitionOccurrences, formatTuitionStatement, hoursToMinutes, parseTuitionTime, setBindingFrom, tuitionHours, tuitionStartDate } from './tuitionPackages.js';
import { occurrenceDate } from './timeZones.js';
import { TimePicker } from './TimeZoneAssistant.jsx';
import LessonHoursInput from './LessonHoursInput.jsx';

const input = 'w-full min-w-0 h-11 px-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const button = 'px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40';
const label = 'block text-xs font-bold text-slate-500 space-y-1.5';
const recordChange = (collection, row, patch) => ({ collection, id: row.id, expectedVersion: row.version || 0, data: { ...row, ...patch } });
const timestampText = time => beijingInput(time).replace('T', ' ');

function PendingTuitionNotice({ result }) {
  if (!result.pendingMinutes && !result.pendingAdjustmentMinutes) return null;
  return <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs font-normal text-amber-800">
    {result.pendingMinutes > 0 && <><p className="font-bold">待生效：{tuitionHours(result.pendingMinutes)}课时</p><p className="mt-1">最早于{timestampText(result.pendingPackages[0].effectiveAt)}生效，届时自动计入可用余额。</p></>}
    {result.pendingAdjustmentMinutes !== 0 && <p className="mt-1">待生效调整：{tuitionHours(result.pendingAdjustmentMinutes)}课时</p>}
  </div>;
}

function DateTimeField({ value, onChange, title }) {
  const [date = '', time = '00:00'] = value.split('T');
  return <fieldset className="min-w-0"><legend className="text-xs font-bold text-slate-500 mb-2">{title}（北京时间）</legend><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end"><label className={label}>日期<input aria-label={`${title}日期`} type="date" min="1900-01-01" max="9998-12-31" required value={date} onChange={event => onChange(`${event.target.value}T${time}`)} className={input} /></label><TimePicker label={`${title}时间`} value={time} onChange={next => onChange(`${date}T${next}`)} /></div></fieldset>;
}

export default function TuitionPackages({ state, results, pending, onCommand, courses, now, viewWeekId, onClose }) {
  const [selected, setSelected] = useState(null), [mode, setMode] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [form, setForm] = useState({ studentName: '', subject: '', category: 'A', kind: 'continuation', hours: '', originalHours: '', boundary: beijingInput(now.getTime()), paidDate: beijingInput(now.getTime()).slice(0, 10), amount: '', reminder: '2', sourceCourseId: '', reason: '', direction: 'credit' });
  const [interactionAt, setInteractionAt] = useState(() => Date.now());
  const calculationTime = Math.max(now.getTime(), interactionAt);
  const dialog = useRef(null), close = useRef(null), formGuard = useRef(false);
  useEffect(() => {
    const previous = document.activeElement; close.current?.focus();
    const key = event => {
      if (event.key === 'Escape' && !pending) { event.preventDefault(); event.stopImmediatePropagation(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.current.querySelectorAll('button,input,select,summary,textarea')].filter(element => !element.disabled && element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); if (previous?.isConnected) previous.focus(); };
  }, [onClose, pending]);
  const account = state.accounts.find(row => row.id === selected), result = results.accounts.find(row => row.id === selected);
  const patch = (key, value) => { setInteractionAt(Date.now()); setForm(current => ({ ...current, [key]: value })); };
  const begin = nextMode => {
    const instant = Date.now(); setInteractionAt(instant);
    setMode(nextMode); setError(''); setNotice('');
    setForm(current => ({ ...current, hours: '', originalHours: '', amount: '', sourceCourseId: '', reason: '', boundary: beijingInput(instant), paidDate: beijingInput(instant).slice(0, 10) }));
  };
  const makeCommand = (preview = false) => {
    const id = preview ? 'preview-account' : crypto.randomUUID(), packId = preview ? 'preview-package' : crypto.randomUUID();
    const minutes = hoursToMinutes(form.hours), effectiveAt = parseTuitionTime(form.boundary);
    const changes = [], affectedIds = new Set(), after = { accounts: [...state.accounts], packages: [...state.packages], adjustments: [...state.adjustments], bindings: [...state.bindings] };
    let target = account;
    if (mode === 'create') {
      if (!form.studentName.trim() || !form.subject.trim()) throw Error('请填写学员姓名和课程／科目');
      const reminder = Number(form.reminder);
      if (!Number.isFinite(reminder) || reminder < 0) throw Error('提醒阈值应为0或正数');
      target = { id, studentName: form.studentName.trim(), subject: form.subject.trim(), category: form.category, startsAt: effectiveAt, reminderMinutes: Math.round(reminder * 60), archived: false };
      after.accounts.push(target); changes.push(recordChange('tuition_accounts', target, {}));
      if (form.sourceCourseId) {
        const source = courses.find(row => row.id === form.sourceCourseId);
        if (!source || String(source.category ?? source.tag) !== target.category) throw Error('所选排课类别与课包不同，请重新选择');
        const existing = state.bindings.find(row => row.courseId === source.id);
        existing?.segments.forEach(segment => { if (segment.accountId && (!segment.toKey || segment.toKey > form.boundary.replace('T', '|'))) affectedIds.add(segment.accountId); });
        const binding = setBindingFrom(existing, source.id, form.boundary.replace('T', '|'), id);
        after.bindings = [...after.bindings.filter(row => row.courseId !== source.id), binding];
        changes.push(recordChange('tuition_bindings', binding, {}));
      }
    }
    if (!target) throw Error('请选择课包账户');
    affectedIds.add(target.id);
    if (effectiveAt < target.startsAt) throw Error('生效时间不能早于本账户起算时间');
    if (mode === 'adjust') {
      if (!form.reason.trim()) throw Error('请填写调整原因');
      const adjustment = { id: packId, accountId: target.id, minutes: form.direction === 'debit' ? -minutes : minutes, effectiveAt, reason: form.reason.trim(), voided: false };
      after.adjustments.push(adjustment); changes.push(recordChange('tuition_adjustments', adjustment, {}));
    } else {
      const amount = form.amount === '' ? null : Number(form.amount);
      if (amount !== null && (!Number.isFinite(amount) || amount < 0)) throw Error('请输入有效的实收金额');
      const pack = { id: packId, accountId: target.id, kind: mode === 'create' ? form.kind : 'purchase', minutes, effectiveAt, paidAt: parseTuitionTime(`${form.paidDate}T00:00`), amount, coverDebt: mode === 'renew', notes: form.reason.trim(), voided: false, createdAt: calculationTime, originalMinutes: form.originalHours ? hoursToMinutes(form.originalHours) : null };
      if (pack.kind === 'continuation' && pack.originalMinutes !== null && pack.originalMinutes < pack.minutes) throw Error('原购买课时不能小于当前剩余课时');
      after.packages.push(pack); changes.push(recordChange('tuition_packages', pack, {}));
    }
    const relevantIds = new Set(after.bindings.map(row => row.courseId));
    const collected = collectTuitionOccurrences({ courses: courses.filter(row => relevantIds.has(row.id)), fromDate: tuitionStartDate(after.accounts, after.bindings, calculationTime), now: calculationTime });
    const calculated = calculateTuition({ ...after, occurrences: collected.occurrences, now: calculationTime });
    const previewResult = calculated.accounts.find(row => row.id === target.id);
    const affectedResults = calculated.accounts.filter(row => affectedIds.has(row.id)).map(row => ({ ...row, previousMinutes: results.accounts.find(previous => previous.id === row.id)?.remainingMinutes || 0 }));
    return { changes, audit: { action: mode, accountId: target.id, accountIds: [...affectedIds] }, previewResult, affectedResults, target, effectiveAt, isPending: effectiveAt > calculationTime, warnings: collected.warnings };
  };
  const preview = useMemo(() => {
    if (!mode || !form.hours) return null;
    try { return makeCommand(true); } catch (reason) { return { error: reason.message }; }
  // makeCommand is deliberately evaluated against the current form and records, never writes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, form, account, state, courses, now, results, calculationTime]);
  const submit = async event => {
    event.preventDefault(); if (formGuard.current) return;
    try {
      setError('');
      const command = makeCommand();
      const extra = (command.isPending ? `本次${tuitionHours(hoursToMinutes(form.hours))}课时尚未生效，将于${timestampText(command.effectiveAt)}生效，当前可用余额暂不增加。\n` : '') + (mode === 'renew' ? '续费会先补本账户最早的欠课时，再用于后续课程。' : '仅扣起算边界之后且已结束的关联课程。');
      const impact = command.affectedResults.map(row => `${row.studentName} · ${row.subject}：${tuitionHours(row.previousMinutes)} → ${tuitionHours(row.remainingMinutes)}课时`).join('\n');
      if (!window.confirm(`确认保存？\n受影响课包：\n${impact}\n${extra}`)) return;
      formGuard.current = true;
      await onCommand({ changes: command.changes, audit: command.audit });
      setSelected(command.target.id); setMode(''); setNotice('已保存，余额随有效排课自动更新。');
    } catch (reason) { setError(reason.message); } finally { formGuard.current = false; }
  };
  const voidRecord = async (collection, row) => {
    if (!window.confirm('确认撤销这条记录？会重新计算余额，原记录保留供核对，可能产生欠课时。')) return;
    try { setError(''); await onCommand({ changes: [recordChange(collection, row, { voided: true })], audit: { action: 'void', accountId: row.accountId } }); } catch (reason) { setError(reason.message); }
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, exportedAt: now.getTime(), ...state }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = url; anchor.download = `课包备份-${beijingInput(now.getTime()).slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
  };
  const ready = state.status === 'ready' && !pending;
  return <div className="fixed inset-0 z-[10030] bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
    <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="tuition-heading" className="w-full max-w-5xl max-h-[92dvh] bg-slate-50 rounded-3xl shadow-2xl border border-white flex flex-col overflow-hidden">
      <header className="p-4 sm:px-6 sm:py-5 bg-white border-b border-slate-100 flex justify-between items-center gap-3"><div><h2 id="tuition-heading" className="text-xl font-black text-slate-800 flex items-center gap-2"><span className="p-2 rounded-xl bg-emerald-50 text-emerald-600"><BookOpen size={22}/></span>课包管理</h2><p className="text-xs text-slate-400 mt-1">每位学员独立记账 · 60分钟 = 1课时 · 旧包优先</p></div><button ref={close} disabled={pending} onClick={onClose} aria-label="关闭课包管理" className="p-2 rounded-xl hover:bg-slate-100 disabled:opacity-40"><X size={20}/></button></header>
      <div className="overflow-y-auto min-h-0 p-4 sm:p-6 space-y-4">
        {(error || state.error) && <p role="alert" className="p-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-700 flex items-start gap-2"><AlertCircle size={16} className="shrink-0"/>{error || state.error}</p>}
        {state.status === 'loading' && <p role="status" className="text-sm text-slate-500">正在读取课包，请稍候…</p>}
        {state.status === 'cached' && <p className="text-xs text-amber-700 bg-amber-50 rounded-xl p-3">当前为离线缓存，余额仅供参考；联网并确认服务器数据后才可保存。</p>}
        {notice && <p role="status" className="text-xs text-emerald-700 bg-emerald-50 rounded-xl p-3">{notice}</p>}
        {results.warnings.length > 0 && <details className="bg-amber-50 text-amber-800 rounded-xl p-3 text-xs"><summary className="font-bold cursor-pointer">有{results.warnings.length}项记录需核对</summary>{results.warnings.map(text => <p key={text} className="mt-2">{text}</p>)}</details>}
        <div className="flex justify-between gap-2 flex-wrap"><button disabled={!ready} onClick={() => { setSelected(null); begin('create'); }} className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold flex items-center gap-1 disabled:opacity-40"><Plus size={16}/>新建学员课包</button><button disabled={!ready} onClick={exportData} className={`${button} flex items-center gap-1`}><Download size={14}/>导出课包备份</button></div>
        {mode ? <form onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4">
          <div className="flex justify-between items-center"><h3 className="text-base font-black text-slate-800">{mode === 'create' ? '建立独立课包' : mode === 'renew' ? '续费 · 旧包优先' : '调整课时'}{account && <span className="block text-xs text-slate-400 font-bold mt-1">{account.studentName} · {account.subject} · {account.category}类</span>}</h3><button type="button" disabled={pending} onClick={() => { setMode(''); setError(''); }} className={button}>返回</button></div>
          <fieldset disabled={!ready} className="space-y-4 min-w-0">
            {mode === 'create' && <>
              <div className="grid sm:grid-cols-2 gap-3"><label className={label}>学员姓名<input required maxLength={80} value={form.studentName} onChange={event => patch('studentName', event.target.value)} className={input}/></label><label className={label}>课程／科目<input required maxLength={100} value={form.subject} onChange={event => patch('subject', event.target.value)} className={input}/></label></div>
              <div className="grid grid-cols-2 gap-3"><label className={label}>课程类别<select value={form.category} onChange={event => { patch('category', event.target.value); patch('sourceCourseId', ''); }} className={input}>{['A', 'B', 'P'].map(value => <option key={value} value={value}>{value}类</option>)}</select></label><label className={label}>录入方式<select value={form.kind} onChange={event => patch('kind', event.target.value)} className={input}><option value="continuation">接续已有余额</option><option value="purchase">新购课包</option></select></label></div>
              <p className="text-[11px] text-slate-400">即使姓名相同，也会建立独立账户；不同科目／类别不共用余额。</p>
              <label className={label}>关联已有排课（可选，从所选起算时间开始）<select value={form.sourceCourseId} onChange={event => {
                const source = courses.find(row => row.id === event.target.value);
                setForm(current => ({ ...current, sourceCourseId: event.target.value, ...(source ? { boundary: `${occurrenceDate(source.isFixed ? viewWeekId : source.weekId, Number(source.colIndex))}T${source.startTime}` } : {}) }));
              }} className={input}><option value="">暂不关联，之后在排课中选择课包</option>{courses.filter(row => (row.category ?? row.tag) === form.category).map(row => <option key={row.id} value={row.id}>{row.title} · {row.startTime}—{row.endTime} · {row.id.slice(0, 6)}</option>)}</select></label>
            </>}
            <div className="grid sm:grid-cols-2 gap-3"><label className={label}>{mode === 'adjust' ? '调整课时数' : mode === 'create' && form.kind === 'continuation' ? '当前剩余课时' : '本次购买课时'}<LessonHoursInput required label={mode === 'adjust' ? '调整课时数' : mode === 'create' && form.kind === 'continuation' ? '当前剩余课时' : '本次购买课时'} value={form.hours} onChange={value => patch('hours', value)} className={input}/></label>{mode === 'adjust' ? <label className={label}>调整方向<select value={form.direction} onChange={event => patch('direction', event.target.value)} className={input}><option value="credit">增加／赠送</option><option value="debit">减少／补扣</option></select></label> : <label className={label}>实收金额（可选，不计入已上课酬）<input type="number" min="0" step="0.01" value={form.amount} onChange={event => patch('amount', event.target.value)} className={input}/></label>}</div>
            {mode === 'create' && form.kind === 'continuation' && <label className={label}>原购买总课时（可选，仅留档）<LessonHoursInput label="原购买总课时（可选，仅留档）" value={form.originalHours} onChange={value => patch('originalHours', value)} className={input}/></label>}
            <DateTimeField title={mode === 'create' ? '扣课起算' : '生效'} value={form.boundary} onChange={value => patch('boundary', value)}/>
            <button type="button" onClick={() => patch('boundary', beijingInput(Date.now()))} className="text-xs font-bold text-indigo-600 border border-indigo-100 bg-indigo-50 rounded-lg px-3 py-2">{mode === 'create' ? '从现在起算' : '立即生效'}</button>
            <p className="text-[11px] text-slate-400 leading-relaxed">从这堂课的开始时间起计入，边界之前的课程不追扣；未结束的课程不扣。关闭网页期间无需运行，下次打开自动补算。</p>
            {mode !== 'adjust' && <label className={label}>缴费日期<input type="date" required value={form.paidDate} onChange={event => patch('paidDate', event.target.value)} className={input}/></label>}
            {mode === 'create' && <label className={label}>剩余多少课时提醒<LessonHoursInput label="剩余多少课时提醒" value={form.reminder} onChange={value => patch('reminder', value)} className={input}/></label>}
            <label className={label}>{mode === 'adjust' ? '调整原因（必填）' : '备注（可选）'}<input required={mode === 'adjust'} maxLength={200} value={form.reason} onChange={event => patch('reason', event.target.value)} className={input}/></label>
          </fieldset>
          {preview && <div className={`rounded-xl p-3 text-xs ${preview.error ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>{preview.error || <><p className="font-bold">{preview.isPending ? '保存后当前可用余额：' : '保存后余额：'}{tuitionHours(preview.previewResult.remainingMinutes)}课时</p>{preview.isPending && <p className="mt-1 font-bold">本次录入尚未生效：{timestampText(preview.effectiveAt)}生效；当前可用余额暂不包含这笔课时。</p>}<PendingTuitionNotice result={preview.previewResult}/><p className="mt-1">本次录入{tuitionHours(hoursToMinutes(form.hours))}课时（{hoursToMinutes(form.hours)}分钟）；已结束关联课共{preview.previewResult.lessons.length}次、{tuitionHours(preview.previewResult.usedMinutes)}课时。</p>{preview.affectedResults.map(row => <p key={row.id} className="mt-1">{row.studentName} · {row.subject}：{tuitionHours(row.previousMinutes)} → {tuitionHours(row.remainingMinutes)}课时</p>)}{preview.previewResult.warnings.map(text => <p key={text}>{text}</p>)}</>}</div>}
          <button disabled={!ready || !preview || Boolean(preview.error)} type="submit" className="w-full bg-emerald-600 text-white rounded-xl py-3 font-bold disabled:opacity-40">{pending ? '正在保存…' : '确认并保存'}</button>
        </form> : account && result ? <section className="space-y-4">
          <button onClick={() => setSelected(null)} className={`${button} inline-flex items-center gap-1`}><ArrowLeft size={14}/>全部课包</button>
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5"><h3 className="text-lg font-black text-slate-800">{account.studentName}<span className="text-xs text-slate-400 font-bold ml-2">{account.category}类</span></h3><p className="text-sm text-slate-500 mt-1">{account.subject}</p><p className="text-[11px] text-slate-400 mt-1">从{timestampText(account.startsAt)}起算 · 账户{account.id.slice(0, 8)}</p><div className="grid grid-cols-3 gap-2 mt-4">{[['累计录入', result.recordedMinutes], ['已上消耗', result.usedMinutes], [result.remainingMinutes < 0 ? '欠课时' : '剩余', Math.abs(result.remainingMinutes)]].map(([title, minutes]) => <div key={title} className="p-3 rounded-xl bg-slate-50"><p className="text-[10px] text-slate-400">{title}</p><p className={`mt-1 text-xl font-black ${title === '欠课时' ? 'text-red-600' : 'text-emerald-700'}`}>{tuitionHours(minutes)}<span className="text-[10px] font-bold ml-1">课时</span></p></div>)}</div><PendingTuitionNotice result={result}/>{result.adjustmentMinutes !== 0 && <p className="text-xs text-slate-500 mt-2">另有调整：{tuitionHours(result.adjustmentMinutes)}课时</p>}{result.warnings.map(text => <p key={text} className="mt-2 text-xs text-amber-700">{text}</p>)}<div className="flex flex-wrap gap-2 mt-4"><button disabled={!ready} onClick={() => begin('renew')} className={`${button} text-emerald-700 flex items-center gap-1`}><RefreshCw size={14}/>续费／增加课包</button><button disabled={!ready} onClick={() => begin('adjust')} className={button}>调整课时</button><button onClick={async () => { try { await navigator.clipboard.writeText(formatTuitionStatement(result, account)); setNotice('对账摘要已复制'); } catch { setError('复制失败，请手动复制明细'); } }} className={`${button} flex items-center gap-1`}><Copy size={14}/>复制对账摘要</button></div></div>
          <details open className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="font-black text-sm cursor-pointer text-slate-700">购买与续费记录</summary><div className="divide-y divide-slate-100 mt-2">{state.packages.filter(row => row.accountId === account.id).sort((a, b) => a.effectiveAt - b.effectiveAt || (a.createdAt || 0) - (b.createdAt || 0)).map(row => <div key={row.id} className="py-3 text-xs flex items-start justify-between gap-3"><div><p className="font-bold text-slate-700">{row.kind === 'continuation' ? '接续余额' : '购买／续费'} {tuitionHours(row.minutes)}课时 {row.voided ? <span className="text-red-500">已撤销</span> : row.effectiveAt > calculationTime ? <span className="text-amber-600">待生效</span> : null}</p><p className="text-slate-400 mt-1">生效：{timestampText(row.effectiveAt)}{row.amount != null ? ` · 实收¥${row.amount}` : ''}</p>{row.originalMinutes && <p className="text-slate-400 mt-1">接入前原购{tuitionHours(row.originalMinutes)}，已用{tuitionHours(row.originalMinutes - row.minutes)}课时（仅留档）</p>}<p className="text-slate-400 mt-1">{row.notes}</p></div>{!row.voided && <button disabled={!ready} onClick={() => voidRecord('tuition_packages', row)} className="text-red-500 whitespace-nowrap disabled:opacity-40">撤销</button>}</div>)}</div></details>
          <details open className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="font-black text-sm cursor-pointer text-slate-700">已上课程明细 · {result.lessons.length}次</summary>{!result.lessons.length && <p className="text-xs text-slate-400 py-4">暂无已完成的关联课程，请在排课中关联此课包。</p>}<div className="divide-y divide-slate-100 mt-2">{result.lessons.map(row => <div key={row.key} className="py-3 text-xs"><p className="font-bold text-slate-700">{row.date} {row.startTime}—{row.endTime}<span className="float-right text-emerald-700">{tuitionHours(row.minutes)}课时</span></p><p className="text-slate-400 mt-1">{row.title} · {row.category}类{row.allocations.length > 1 ? ' · 已按旧包优先分摊' : ''}{row.debtMinutes ? ` · 其中欠${tuitionHours(row.debtMinutes)}课时` : ''}</p></div>)}</div></details>
          <details className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="font-black text-sm cursor-pointer text-slate-700">调整及操作记录</summary>{state.adjustments.filter(row => row.accountId === account.id).map(row => <div key={row.id} className="flex justify-between text-xs py-2 border-b border-slate-100"><span>{tuitionHours(row.minutes)}课时 · {row.reason}{row.voided ? '（已撤销）' : ''}</span>{!row.voided && <button disabled={!ready} onClick={() => voidRecord('tuition_adjustments', row)} className="text-red-500">撤销</button>}</div>)}{state.audit.filter(row => row.accountId === account.id || row.accountIds?.includes(account.id)).sort((a, b) => b.createdAt - a.createdAt).slice(0, 100).map(row => <p key={row.id} className="text-xs text-slate-400 mt-2">{timestampText(row.createdAt)} · {row.action}</p>)}</details>
        </section> : <div className="grid sm:grid-cols-2 gap-3">{results.accounts.map(row => <button key={row.id} onClick={() => { setSelected(row.id); setError(''); }} className="text-left bg-white rounded-2xl border border-slate-200 p-5 hover:border-emerald-300 hover:shadow-sm transition-all"><div className="flex justify-between gap-2"><h3 className="font-black text-slate-800">{row.studentName}</h3><span className={`text-[10px] font-bold rounded-full px-2 py-1 ${row.warnings.length || row.pendingMinutes > 0 && row.remainingMinutes <= 0 ? 'bg-amber-50 text-amber-700' : row.remainingMinutes <= 0 ? 'bg-red-50 text-red-600' : row.remainingMinutes <= row.reminderMinutes ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-600'}`}>{row.warnings.length ? '待核对' : row.pendingMinutes > 0 && row.remainingMinutes <= 0 ? '待生效' : row.remainingMinutes < 0 ? '待续费' : row.remainingMinutes === 0 ? '已用完' : row.remainingMinutes <= row.reminderMinutes ? '余额提醒' : '正常'}</span></div><p className="text-xs text-slate-500 mt-1">{row.subject} · {row.category}类 · {row.id.slice(0, 6)}</p><p className={`mt-4 text-2xl font-black ${row.remainingMinutes <= 0 ? 'text-red-600' : 'text-emerald-700'}`}>{row.remainingMinutes < 0 ? '欠' : '剩余'} {tuitionHours(Math.abs(row.remainingMinutes))}<span className="ml-1 text-xs font-bold">课时</span></p><PendingTuitionNotice result={row}/><p className="text-[11px] text-slate-400 mt-2">已上{tuitionHours(row.usedMinutes)}课时 · {row.lessons.length}次课程</p>{row.warnings.length > 0 && <p className="text-[11px] text-amber-700 mt-1">有记录需核对</p>}</button>)}{state.status === 'ready' && !state.accounts.length && <div className="sm:col-span-2 text-center rounded-2xl border border-dashed border-emerald-200 p-10 bg-white"><Wallet size={32} className="mx-auto text-emerald-400"/><h3 className="font-black text-slate-700 mt-3">还没有课包</h3><p className="text-xs text-slate-400 mt-2 leading-relaxed">为需要预付费的学员建立独立课包。<br/>已有课包可直接录入当前剩余，不必重建过去的课程。</p></div>}</div>}
      </div>
      <footer className="bg-white border-t border-slate-100 p-3 text-[10px] text-slate-400 text-center">按北京时间有效排课核算，截至{timestampText(now.getTime())}；删除／取消排课后余额重算，充值不混入已上课酬。</footer>
    </section>
  </div>;
}
