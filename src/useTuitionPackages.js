import { useEffect, useMemo, useRef, useState } from 'react';
import { createTuitionStore } from './tuitionStore.js';
import { tuitionStartDate, calculateTuition, collectTuitionOccurrences } from './tuitionPackages.js';

const empty = { accounts: [], packages: [], bindings: [], adjustments: [], audit: [], status: 'loading', error: '' };
export default function useTuitionPackages({ db, appId, userId, courses, now }) {
  const userRef = useRef(userId), inFlight = useRef(false), storeRef = useRef(null);
  const [snapshot, setSnapshot] = useState({ ...empty, userId: null });
  const [pending, setPending] = useState(false);
  useEffect(() => {
    userRef.current = userId;
    if (!userId) { storeRef.current = null; return; }
    let active = true;
    const store = createTuitionStore({ db, appId, userId, isCurrentUser: () => active && userRef.current === userId });
    storeRef.current = store;
    const close = store.subscribe(state => setSnapshot({ ...state, userId }));
    return () => { active = false; close(); storeRef.current = null; };
  }, [db, appId, userId]);
  const state = snapshot.userId === userId ? snapshot : empty;
  const results = useMemo(() => {
    const linked = new Set(state.bindings.map(binding => binding.courseId));
    const relevant = courses.filter(course => linked.has(course.id));
    const fromDate = tuitionStartDate(state.accounts, state.bindings, now.getTime());
    const { occurrences, warnings } = collectTuitionOccurrences({ courses: relevant, fromDate, now: now.getTime() });
    const calculated = calculateTuition({ ...state, occurrences, now: now.getTime() });
    const missing = state.bindings.filter(binding => (binding.recoveryMissing || !binding.sourceDeleted) && binding.segments.some(segment => segment.accountId) && !courses.some(course => course.id === binding.courseId));
    for (const binding of missing) {
      for (const accountId of new Set(binding.segments.map(segment => segment.accountId).filter(Boolean))) {
        const account = calculated.accounts.find(row => row.id === accountId);
        if (account) account.warnings.push(`关联课程${binding.courseId}在恢复后缺失或来源不明，余额已重算但需人工核对`);
      }
    }
    return { ...calculated, warnings: [...new Set([...calculated.warnings, ...warnings, ...missing.map(binding => `关联的课程${binding.courseId}已删除或不在当前数据中；余额已重算，请结合操作记录核对`)])] };
  }, [state, courses, now]);
  const commit = async command => {
    const store = storeRef.current;
    if (!store || userRef.current !== userId || state.status !== 'ready') throw Error(state.error || '请等待课包从服务器加载完成，联网后重试');
    if (inFlight.current) throw Error('正在保存，请勿重复点击');
    inFlight.current = true; setPending(true);
    try { await store.commit(command); } finally { inFlight.current = false; setPending(false); }
  };
  return { state, results, pending, commit };
}
