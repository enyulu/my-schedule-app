const canonical = value => JSON.stringify(value ?? null, (_, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
export const sameCourseRecord = (left, right) => left === right || canonical(left) === canonical(right);

const bindingContent = row => {
  if (!row?.segments?.length) return null;
  return Object.fromEntries(Object.entries(row).filter(([key]) => !['version', 'createdAt', 'updatedAt'].includes(key)));
};
export const sameBindingContent = (left, right) => sameCourseRecord(bindingContent(left), bindingContent(right));
const writeRow = (rows, id, row) => { if (row) rows.set(id, row); else rows.delete(id); };

export function applyCourseReceipt(rows, pending, changes) {
  const next = new Map(rows.map(row => [row.id, row]));
  for (const { id, before, after } of changes) {
    const current = next.get(id);
    if (!sameCourseRecord(current, before)) continue;
    writeRow(next, id, after);
    pending.set(id, { after, older: [...(pending.get(id)?.older || []), before] });
  }
  return [...next.values()];
}

export function reconcileCourseSnapshot(rows, pending, authoritative) {
  const next = new Map(rows.map(row => [row.id, row])), verify = [];
  for (const [id, entry] of pending) {
    const incoming = next.get(id);
    const older = entry.older.some(row => sameCourseRecord(incoming, row));
    if (authoritative && !older) { pending.delete(id); continue; }
    writeRow(next, id, entry.after);
    if (authoritative && !entry.checking) verify.push(id);
  }
  return { rows: [...next.values()], verify };
}

export function stageCourseUndo(batch, receipt, rows, bindings, ref) {
  const byId = new Map(rows.map(row => [row.id, row]));
  const byBinding = new Map(bindings.map(row => [row.courseId, row]));
  for (const change of receipt.courseChanges) {
    if (!sameCourseRecord(byId.get(change.id), change.after)) throw Error('课程已有后续修改，无法安全撤销');
  }
  for (const change of receipt.bindingGuards || receipt.bindingReceipts) {
    if (!sameBindingContent(byBinding.get(change.id), change.after)) throw Error('课包关联已有后续修改或尚未同步，无法安全撤销');
  }
  batch.expectUndo(receipt);
  for (const change of receipt.courseChanges) {
    if (change.before) batch.set(ref(change.id), change.before);
    else batch.delete(ref(change.id));
  }
  batch.restoreBindings(receipt.bindingReceipts.map(({ id, before }) => before || { id, courseId: id, segments: [], sourceDeleted: true }));
}

export const sharesCoursePriceScope = (original, candidate) => original.id === candidate.id || Boolean(
  original.studentId && candidate.studentId && String(original.studentId) === String(candidate.studentId)
  && original.title === candidate.title && (original.subject ?? '') === (candidate.subject ?? ''),
);
