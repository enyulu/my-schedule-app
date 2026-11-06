import { useRef } from 'react';
import { ChevronDown, MoreHorizontal, X } from 'lucide-react';

export default function ScheduleActions({ compact, children }) {
  const dialogRef = useRef(null);
  const detailsRef = useRef(null);
  const closeAfterAction = event => {
    const button = event.target.closest('button');
    if (!button || button.closest('[data-menu-stay-open]')) return;
    if (compact) dialogRef.current?.close();
    else if (detailsRef.current) detailsRef.current.open = false;
  };
  if (compact) return <>
    <button type="button" aria-label="更多操作" aria-haspopup="dialog" onClick={() => dialogRef.current?.showModal()} className="shrink-0 h-11 px-2.5 inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600"><MoreHorizontal size={16} />更多</button>
    <dialog ref={dialogRef} aria-labelledby="schedule-actions-title" onClick={event => { if (event.target === event.currentTarget) dialogRef.current?.close(); }} className="fixed inset-x-0 bottom-0 top-auto m-0 w-full max-w-none max-h-[85dvh] overflow-auto rounded-t-[28px] bg-white p-0 shadow-2xl backdrop:bg-slate-900/45">
      <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 mb-3">
          <div><h2 id="schedule-actions-title" className="text-base font-black text-slate-800">更多操作</h2><p className="text-xs text-slate-500">统计、显示与备份</p></div>
          <button type="button" aria-label="关闭更多操作" onClick={() => dialogRef.current?.close()} className="h-11 w-11 flex items-center justify-center rounded-xl bg-slate-100 text-slate-600"><X size={18} /></button>
        </header>
        <div onClick={closeAfterAction} className="flex flex-wrap gap-2">{children}</div>
      </div>
    </dialog>
  </>;
  return <details ref={detailsRef} className="relative" onKeyDown={event => {
    if (event.key === 'Escape' && detailsRef.current.open) {
      event.stopPropagation();
      detailsRef.current.open = false;
      detailsRef.current.querySelector('summary')?.focus();
    }
  }}>
    <summary className="cursor-pointer list-none px-3 py-2.5 rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-600">更多操作 <ChevronDown size={12} className="inline" /></summary>
    <div onClick={closeAfterAction} className="absolute right-0 top-full mt-2 z-[100] w-[min(340px,calc(100vw-32px))] bg-white border border-slate-200 rounded-xl shadow-xl p-3 flex flex-wrap gap-2">{children}</div>
  </details>;
}
