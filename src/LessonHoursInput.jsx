import { ChevronDown, ChevronUp } from 'lucide-react';
import { stepTuitionHours } from './tuitionPackages.js';

// Native step=1 rejects fractional entries; separate controls keep manual decimals valid.
export default function LessonHoursInput({ value, onChange, label, className, required = false }) {
  const step = direction => onChange(stepTuitionHours(value, direction));
  return <span className="relative block">
    <input aria-label={label} required={required} type="number" inputMode="decimal" min="0" step="any" value={value} onChange={event => onChange(event.target.value)} onKeyDown={event => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); step(event.key === 'ArrowUp' ? 1 : -1); }
    }} className={`${className} pr-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`} />
    <span className="absolute right-1 inset-y-1 flex flex-col w-8 text-slate-500">
      <button type="button" aria-label={`${label}增加1课时`} title="增加1课时" onClick={() => step(1)} className="flex-1 flex items-center justify-center rounded-t-lg hover:bg-indigo-50 hover:text-indigo-600 focus-visible:outline-indigo-400"><ChevronUp size={14} aria-hidden="true"/></button>
      <button type="button" aria-label={`${label}减少1课时`} title="减少1课时" onClick={() => step(-1)} className="flex-1 flex items-center justify-center rounded-b-lg hover:bg-indigo-50 hover:text-indigo-600 focus-visible:outline-indigo-400"><ChevronDown size={14} aria-hidden="true"/></button>
    </span>
  </span>;
}
