import { useEffect, useMemo, useRef, useState } from 'react';
import { createAndyStore } from './andyStore.js';
import { summarizeAndy, createAndyBackfill } from './andyCounter.js';

const empty = { userId: null, rows: [], status: 'loading', error: '', actionError: '', pending: false, retry: null, undoRetry: null, celebration: null };
export default function useAndyCounter({ db, appId, userId, identityRef }) {
  const [snapshot, setSnapshot] = useState(empty);
  const [clock, setClock] = useState(() => Date.now());
  const scopeRef = useRef(null);
  useEffect(() => {
    let timer;
    const tick = () => { setClock(Date.now()); timer = setTimeout(tick, 60000 - Date.now() % 60000 + 5); };
    tick();
    const focus = () => setClock(Date.now());
    window.addEventListener('focus', focus);
    return () => { clearTimeout(timer); window.removeEventListener('focus', focus); };
  }, []);
  useEffect(() => {
    if (!userId) return;
    const scope = { userId, active: true, busy: false, retry: null, undoRetry: null, status: 'loading' };
    const isCurrent = () => scope.active && identityRef.current === userId;
    scope.isCurrent = isCurrent;
    const store = createAndyStore({ db, appId, userId, isCurrentUser: isCurrent });
    scope.store = store;
    scopeRef.current = scope;
    let initializing = true;
    const close = store.subscribe(state => {
      scope.status = state.status;
      scope.rows = state.rows;
      const reset = initializing; initializing = false;
      setClock(Date.now());
      setSnapshot(previous => ({ ...(!reset && previous.userId === userId ? previous : empty), ...state, userId }));
    });
    return () => { scope.active = false; close(); if (scopeRef.current === scope) scopeRef.current = null; };
  }, [db, appId, userId, identityRef]);
  const state = snapshot.userId === userId ? snapshot : empty;
  const summary = useMemo(() => summarizeAndy(state.rows, new Date(clock)), [state.rows, clock]);
  const perform = async (undo, options = {}) => {
    const scope = scopeRef.current;
    if (!scope?.isCurrent() || scope.userId !== userId || scope.busy || scope.status !== 'ready') return false;
    const latest = undo ? options.id ? (scope.rows || []).find(row => row.id === options.id && !row.voided) : summarizeAndy(scope.rows || [], new Date()).latest : null;
    if (undo && (!(scope.undoRetry || latest) || scope.retry) || !undo && scope.undoRetry) return false;
    scope.busy = true;
    setSnapshot(previous => ({ ...previous, pending: true, actionError: '' }));
    try {
      let entry;
      if (undo) entry = scope.undoRetry || latest;
      else if (scope.retry) entry = scope.retry;
      else if (options.date !== undefined) {
        const entries = createAndyBackfill(options.date, options.count, new Date(), () => crypto.randomUUID());
        entry = { id: entries[0].id, entries, date: options.date, kind: 'backfill' };
      } else entry = { id: crypto.randomUUID(), occurredAt: Date.now(), voided: false };
      if (!undo) scope.retry = entry;
      else scope.undoRetry = entry;
      if (undo) await scope.store.undo(entry.id);
      else if (entry.entries) await scope.store.addMany(entry.entries);
      else await scope.store.add(entry);
      if (!scope.isCurrent()) return false;
      scope.retry = null; scope.undoRetry = null;
      setClock(Date.now());
      const entries = entry.entries || [entry];
      const applyRows = rows => undo ? rows.map(row => row.id === entry.id ? { ...row, voided: true } : row) : [...rows, ...entries.filter(row => !rows.some(existing => existing.id === row.id))];
      scope.rows = applyRows(scope.rows || []);
      setSnapshot(previous => ({ ...previous, retry: null, undoRetry: null, celebration: undo || entry.kind === 'backfill' ? null : { id: entry.id }, actionError: '', rows: applyRows(previous.rows) }));
      return true;
    } catch (error) {
      if (scope.isCurrent()) setSnapshot(previous => ({ ...previous, retry: scope.retry, undoRetry: scope.undoRetry, actionError: `${undo ? '撤销' : '记录'}未确认：${error.message}。请${undo ? '重试撤销' : '重试本次记录'}，不会重复${undo ? '扣除' : '计数'}。` }));
      return false;
    } finally {
      scope.busy = false;
      if (scope.isCurrent()) setSnapshot(previous => ({ ...previous, pending: false }));
    }
  };
  return { ...state, summary, now: new Date(clock), add: () => perform(false), undo: () => perform(true), backfill: (date, count) => perform(false, { date, count }), undoEntry: id => perform(true, { id }) };
}
