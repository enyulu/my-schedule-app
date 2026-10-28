import * as firestore from 'firebase/firestore';
import { planBindingMutation } from './tuitionPackages.js';

export const TUITION_COLLECTIONS = ['tuition_accounts', 'tuition_packages', 'tuition_bindings', 'tuition_adjustments', 'tuition_audit'];
const names = ['accounts', 'packages', 'bindings', 'adjustments', 'audit'];
const safeId = id => typeof id === 'string' && id && !id.includes('/') && id.length < 200;
export const validateTuitionRecord = (collection, row) => {
  if (!row || !safeId(row.id)) throw Error('课包记录ID无效');
  if (collection === 'tuition_accounts' && (!row.studentName?.trim() || !row.subject?.trim() || !['A', 'B', 'P'].includes(row.category) || !Number.isFinite(row.startsAt) || !Number.isInteger(row.reminderMinutes) || row.reminderMinutes < 0)) throw Error('请填写学员、课程、类别、起算时间和提醒阈值');
  if (['tuition_packages', 'tuition_adjustments'].includes(collection) && (!safeId(row.accountId) || !Number.isFinite(row.effectiveAt) || !Number.isInteger(row.minutes) || !row.minutes || collection === 'tuition_packages' && row.minutes < 0)) throw Error('课包数量或生效时间无效');
  if (collection === 'tuition_adjustments' && !row.reason?.trim()) throw Error('调整课时必须填写原因');
  if (collection === 'tuition_packages' && row.amount != null && (!Number.isFinite(row.amount) || row.amount < 0)) throw Error('实收金额无效');
  if (collection === 'tuition_bindings') {
    if (!safeId(row.courseId) || !Array.isArray(row.segments)) throw Error('课程关联记录无效');
    const segments = [...row.segments].sort((a, b) => a.fromKey.localeCompare(b.fromKey));
    for (let index = 0; index < segments.length; index++) {
      const segment = segments[index];
      if (!/^\d{4}-\d{2}-\d{2}\|([01]\d|2[0-3]):[0-5]\d$/.test(segment.fromKey || '') || segment.toKey && segment.toKey <= segment.fromKey || segment.accountId && !safeId(segment.accountId)
        || index && (!segments[index - 1].toKey || segments[index - 1].toKey > segment.fromKey)) throw Error('课包关联区间无效或重叠');
    }
  }
  return row;
};

export const createTuitionStore = ({ db, appId, userId, isCurrentUser, sdk = firestore }) => {
  if (appId !== 'stable-schedule-private-v999' || !safeId(userId)) throw Error('课包用户命名空间无效');
  const root = ['artifacts', appId, 'users', userId];
  const recordRef = (collection, id) => sdk.doc(db, ...root, collection, id);
  const subscribe = onState => {
    let active = true;
    const state = { accounts: [], packages: [], bindings: [], adjustments: [], audit: [] }, status = new Map(), errors = new Map();
    const emit = () => {
      if (!active || !isCurrentUser()) return;
      onState({ ...state, status: errors.size ? 'error' : status.size < 5 ? 'loading' : [...status.values()].includes('cached') ? 'cached' : 'ready', error: [...errors.values()].join('；') });
    };
    const closers = TUITION_COLLECTIONS.map((collection, index) => sdk.onSnapshot(sdk.collection(db, ...root, collection), { includeMetadataChanges: true }, snapshot => {
      if (!active || !isCurrentUser()) return;
      try {
        const rows = snapshot.docs.map(item => validateTuitionRecord(collection, { ...item.data(), id: item.id }));
        state[names[index]] = rows;
        status.set(collection, snapshot.metadata?.fromCache ? 'cached' : 'ready');
        errors.delete(collection);
      } catch (error) { errors.set(collection, error.message); }
      emit();
    }, error => { errors.set(collection, `课包无法加载（${collection}）：${error.message}`); emit(); }));
    emit();
    return () => { active = false; closers.forEach(close => close()); };
  };
  const commit = async ({ changes, audit = { action: 'update' } }) => {
    if (!isCurrentUser()) throw Error('账号已改变，请重新打开课包');
    if (!Array.isArray(changes) || !changes.length || changes.length > 400) throw Error('课包修改数量无效');
    const now = Date.now(), ids = new Set();
    for (const change of changes) {
      if (!TUITION_COLLECTIONS.slice(0, 4).includes(change.collection) || !safeId(change.id) || !Number.isInteger(change.expectedVersion) || change.expectedVersion < 0 || ids.has(`${change.collection}/${change.id}`)) throw Error('课包修改目标或版本无效');
      ids.add(`${change.collection}/${change.id}`);
      validateTuitionRecord(change.collection, { ...change.data, id: change.id });
    }
    await sdk.runTransaction(db, async transaction => {
      if (!isCurrentUser()) throw Error('账号已改变，已取消保存');
      const manifestRef = recordRef('app_state', 'tuition_manifest');
      const manifestSnapshot = await transaction.get(manifestRef);
      const existing = await Promise.all(changes.map(change => transaction.get(recordRef(change.collection, change.id))));
      if (!isCurrentUser()) throw Error('账号已改变，已取消保存');
      existing.forEach((snapshot, index) => {
        const version = snapshot.exists() ? snapshot.data().version : 0;
        if (version !== changes[index].expectedVersion) throw Error('记录已被修改，请刷新后重试，草稿已保留');
      });
      changes.forEach((change, index) => transaction.set(recordRef(change.collection, change.id), {
        ...change.data, id: change.id, version: change.expectedVersion + 1,
        createdAt: existing[index].exists() ? existing[index].data().createdAt : now, updatedAt: now,
      }));
      transaction.set(manifestRef, { enabled: true, courseIds: [...new Set([...(manifestSnapshot.exists() ? manifestSnapshot.data().courseIds || [] : []), ...changes.filter(change => change.collection === 'tuition_bindings').map(change => change.id)])], version: (manifestSnapshot.exists() ? manifestSnapshot.data().version || 0 : 0) + 1, updatedAt: now });
      transaction.set(recordRef('tuition_audit', crypto.randomUUID()), {
        ...audit, entityIds: [...ids], before: existing.map(snapshot => snapshot.exists() ? snapshot.data() : null), after: changes.map(change => change.data), createdAt: now, version: 1,
      });
    });
  };
  return { subscribe, commit };
};

const pathOf = ref => typeof ref === 'string' ? ref : ref.path;
const canonical = value => JSON.stringify(value, (_, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

// One transaction owns course writes, association version checks and audit. Rendering never writes.
export const createCourseWriteBatch = ({ db, appId, userId, isCurrentUser, beforeCourses, tuitionState, normalizeCourse = row => row, confirmImpact = () => true, onApplied = () => {}, sdk = firestore }) => {
  const root = `artifacts/${appId}/users/${userId}/`, ops = [], inheritances = [], selections = [], overrides = [], relocations = [];
  let recovery = false;
  if (appId !== 'stable-schedule-private-v999' || !safeId(userId)) throw Error('课程用户命名空间无效');
  const ref = (collection, id) => sdk.doc(db, 'artifacts', appId, 'users', userId, collection, id);
  const before = new Map(beforeCourses.map(row => [row.id, row]));
  const api = {
    set: (target, data) => { ops.push({ method: 'set', target, data }); },
    update: (target, data) => { ops.push({ method: 'update', target, data }); },
    delete: target => { ops.push({ method: 'delete', target }); },
    inheritBinding: (fromId, toId, fromKey) => inheritances.push({ fromId, toId, fromKey }),
    relocateBinding: (fromId, toId, sourceKey, targetKey, permanent) => relocations.push({ fromId, toId, sourceKey, targetKey, permanent }),
    markRecovery: () => { recovery = true; },
    bindCourse: (courseId, fromKey, accountId) => selections.push({ courseId, fromKey, accountId }),
    restoreBindings: rows => overrides.push(...rows),
    commit: async () => {
      if (!isCurrentUser()) throw Error('账号已改变，已取消课程保存');
      if (!ops.length || ops.length > 400) throw Error('课程修改数量超过安全限制');
      if (ops.some(op => !pathOf(op.target)?.startsWith(root))) throw Error('拒绝跨用户修改课程');
      const after = new Map(before);
      const courseOps = ops.filter(op => pathOf(op.target).startsWith(`${root}courses/`) && !pathOf(op.target).endsWith('/_metadata_'));
      const touched = new Set(courseOps.map(op => pathOf(op.target).split('/').at(-1)));
      for (const op of courseOps) {
        const id = pathOf(op.target).split('/').at(-1);
        if (op.method === 'delete') after.delete(id);
        else after.set(id, { ...(op.method === 'update' ? after.get(id) || {} : {}), ...op.data, id });
      }
      const plan = planBindingMutation({ beforeCourses, afterCourses: [...after.values()], bindings: tuitionState.bindings || [], accounts: tuitionState.accounts || [], inheritances, selections, overrides, relocations, recovery });
      if (ops.length + plan.bindingChanges.length + 2 > 500) throw Error('相关课程和课包修改超过一次安全事务限制，请减少操作数量');
      plan.bindingChanges.forEach(change => validateTuitionRecord(change.collection, change.data));
      const hasImpact = plan.affectedAccountIds.length > 0 || plan.bindingChanges.length > 0;
      if (hasImpact && tuitionState.status !== 'ready') throw Error('课包关联状态尚未确认，已保留课程草稿，请联网重试');
      if (hasImpact && !await confirmImpact(plan)) throw Error('已取消操作，课程与课包均未修改');
      const now = Date.now();
      await sdk.runTransaction(db, async transaction => {
        const manifestRef = ref('app_state', 'tuition_manifest'), manifestSnap = await transaction.get(manifestRef);
        const manifest = manifestSnap.exists() ? manifestSnap.data() : { courseIds: [], version: 0 };
        if (manifest.courseIds?.some(id => touched.has(id) || inheritances.some(row => row.fromId === id) || relocations.some(row => row.fromId === id)) && tuitionState.status !== 'ready') throw Error('课包关联状态无法读取，请先恢复连接再修改这门课');
        const currentCourses = await Promise.all(courseOps.map(op => transaction.get(op.target)));
        currentCourses.forEach((snapshot, index) => {
          const id = pathOf(courseOps[index].target).split('/').at(-1), previous = before.get(id);
          if (previous && !snapshot.exists() || !previous && snapshot.exists()) throw Error('课程记录已被修改，请刷新后重试');
          if (previous && canonical(normalizeCourse({ ...snapshot.data(), id })) !== canonical(normalizeCourse(previous))) throw Error('课程记录已被修改，请刷新后重试');
        });
        const checkedBindings = new Set([...plan.bindingChanges.map(change => change.id), ...inheritances.map(row => row.fromId), ...relocations.map(row => row.fromId), ...[...(manifest.courseIds || [])].filter(id => touched.has(id))]);
        const bindingIds = [...checkedBindings];
        const currentBindings = await Promise.all(bindingIds.map(id => transaction.get(ref('tuition_bindings', id))));
        currentBindings.forEach((snapshot, index) => {
          const original = tuitionState.bindings?.find(binding => binding.courseId === bindingIds[index]);
          if ((snapshot.exists() ? snapshot.data().version : 0) !== (original?.version || 0)) throw Error('课包关联已被修改，请刷新后重试');
        });
        const selectedAccounts = await Promise.all(plan.affectedAccountIds.map(id => transaction.get(ref('tuition_accounts', id))));
        selectedAccounts.forEach((snapshot, index) => {
          if (!snapshot.exists()) throw Error('关联的课包账户不存在');
          const expected = tuitionState.accounts.find(row => row.id === plan.affectedAccountIds[index]);
          if ((snapshot.data().version || 0) !== (expected?.version || 0)) throw Error('课包账户已被修改，请刷新后重试');
        });
        if (!isCurrentUser()) throw Error('账号已改变，已取消课程保存');
        ops.forEach(op => { if (op.method === 'delete') transaction.delete(op.target); else transaction[op.method](op.target, op.data); });
        plan.bindingChanges.forEach(change => transaction.set(ref(change.collection, change.id), { ...change.data, version: change.expectedVersion + 1, createdAt: change.data.createdAt || now, updatedAt: now }));
        if (hasImpact) {
          transaction.set(ref('tuition_audit', crypto.randomUUID()), { action: recovery ? '课表恢复／请核对余额' : '排课变更／重新核算', accountIds: plan.affectedAccountIds, before: beforeCourses.filter(row => touched.has(row.id)), after: [...after.values()].filter(row => touched.has(row.id)), bindingBefore: tuitionState.bindings.filter(row => checkedBindings.has(row.courseId)), bindingAfter: plan.bindingChanges.map(row => row.data), createdAt: now, version: 1 });
          transaction.set(manifestRef, { enabled: true, courseIds: [...new Set([...(manifest.courseIds || []), ...plan.bindingChanges.map(row => row.id)])], version: (manifest.version || 0) + 1, updatedAt: now });
        }
      });
      if (isCurrentUser()) onApplied(plan);
    },
  };
  return api;
};
