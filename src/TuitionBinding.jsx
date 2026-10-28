import { Layers, AlertCircle } from 'lucide-react';
import { tuitionHours } from './tuitionPackages.js';

export default function TuitionBinding({ accountId, category, state, results, onChange, onManage }) {
  const account = state.accounts.find(row => row.id === accountId), result = results.accounts.find(row => row.id === accountId);
  const mismatch = account && account.category !== category;
  return <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-3 font-normal">
    <div className="flex justify-between gap-2 items-center"><h3 className="text-xs font-black text-emerald-800 flex items-center gap-1"><Layers size={14}/>本次排课关联课包</h3><button type="button" onClick={onManage} className="text-[11px] text-emerald-700 font-bold underline">管理／新建课包</button></div>
    {state.status !== 'ready' && <p role="alert" className="text-xs text-amber-800">{state.error || '正在确认课包数据，请联网后再关联；普通课程无需关联。'}</p>}
    <label className="block text-xs text-slate-500 font-bold">选择独立课包账户<select disabled={state.status !== 'ready'} value={accountId || ''} onChange={event => onChange(event.target.value)} className="block mt-1.5 w-full min-w-0 h-11 px-3 bg-white border border-emerald-100 rounded-xl text-sm text-slate-700 disabled:opacity-40"><option value="">不关联课包（普通排课）</option>{state.accounts.filter(row => row.category === category && !row.archived).map(row => <option key={row.id} value={row.id}>{row.studentName} · {row.subject} · {row.category}类 · {row.id.slice(0, 6)}</option>)}{accountId && (!account || mismatch) && <option value={accountId} disabled>{account ? `${account.studentName} · ${account.subject}（类别不匹配）` : '原关联课包无法读取'}</option>}</select></label>
    {mismatch && <p role="alert" className="text-xs text-amber-800 flex gap-1"><AlertCircle size={13} className="shrink-0"/>类别已改变，请明确选择兼容课包或“不关联”；不会自动转移余额。</p>}
    {result && <p className="text-xs text-emerald-800">当前{result.remainingMinutes < 0 ? '欠' : '剩余'}{tuitionHours(Math.abs(result.remainingMinutes))}课时；本堂结束后按实际时长计入。</p>}
    <p className="text-[10px] leading-relaxed text-slate-400">保存后从当前这堂开始关联，更早课程归属不变；不同学员、科目和类别不共用余额。新复制的课程默认不关联。</p>
  </div>;
}
