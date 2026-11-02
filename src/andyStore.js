import * as firestore from 'firebase/firestore';
import { validateAndySession } from './andyCounter.js';

export const createAndyStore = ({ db, appId, userId, isCurrentUser, sdk = firestore }) => {
  if (appId !== 'stable-schedule-private-v999' || typeof userId !== 'string' || !userId || userId.includes('/')) throw Error('Andy记录用户命名空间无效');
  const root = ['artifacts', appId, 'users', userId, 'andy_sessions'];
  const guard = () => { if (!isCurrentUser()) throw Error('账号已改变，已取消Andy记录操作'); };
  const subscribe = callback => {
    let active = true, rows = [];
    const emit = state => { if (active && isCurrentUser()) callback({ rows, ...state }); };
    emit({ status: 'loading', error: '' });
    const close = sdk.onSnapshot(sdk.collection(db, ...root), { includeMetadataChanges: true }, snapshot => {
      try {
        const incoming = snapshot.docs.map(doc => validateAndySession({ ...doc.data(), id: doc.id }));
        if (snapshot.metadata?.fromCache && !incoming.length) {
          emit({ status: rows.length ? 'cached' : 'loading', error: rows.length ? '' : '离线且无可用缓存，等待云端确认Andy记录；未清空历史记录。' });
          return;
        }
        rows = incoming;
        emit({ status: snapshot.metadata?.fromCache ? 'cached' : 'ready', error: '' });
      } catch (error) { emit({ status: 'error', error: error.message }); }
    }, error => emit({ status: 'error', error: `Andy记录无法读取：${error.message}` }));
    return () => { active = false; close(); };
  };
  const add = async row => {
    guard(); validateAndySession(row);
    if (row.voided) throw Error('不能新增已撤销记录');
    const target = sdk.doc(db, ...root, row.id);
    await sdk.runTransaction(db, async transaction => {
      guard();
      const current = await transaction.get(target);
      guard();
      if (current.exists()) {
        const existing = validateAndySession({ ...current.data(), id: row.id });
        if (existing.occurredAt !== row.occurredAt) throw Error('Andy记录编号冲突，请刷新后重试');
        return; // Retrying an ambiguous acknowledgement must never add twice.
      }
      transaction.set(target, { id: row.id, occurredAt: row.occurredAt, voided: false, createdAt: Date.now() });
    });
  };
  const undo = async id => {
    guard();
    if (!/^[\w-]{1,100}$/.test(id)) throw Error('撤销记录无效');
    const target = sdk.doc(db, ...root, id);
    await sdk.runTransaction(db, async transaction => {
      guard();
      const current = await transaction.get(target);
      guard();
      if (!current.exists()) throw Error('撤销记录不存在，请刷新记录');
      const row = validateAndySession({ ...current.data(), id });
      if (row.voided) return;
      transaction.set(target, { ...row, voided: true, voidedAt: Date.now() });
    });
  };
  return { subscribe, add, undo };
};
