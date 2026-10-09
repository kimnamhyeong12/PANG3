import { locationKey } from './routeSession';

export const assignmentKey = (row) => `${locationKey(row)}:${row.assignedAt || row.assigned_at || ''}`;
export function splitWorkPlan(rows, choices, day, legacyRows = [], { autoAddToday = false, holdUntilSelected = new Set() } = {}) {
  const legacy = new Set(legacyRows.map(locationKey));
  const map = [], pending = [], incoming = [];
  rows.forEach((row) => {
    const scheduled = String(row.scheduledDate ?? row.workDate ?? '').slice(0, 10);
    const choice = choices[assignmentKey(row)];
    const heldTransfer = holdUntilSelected.has(String(row.id ?? row.taskId ?? row.task_id));
    if (row.status === 'complete') {
      if (choice === day || !scheduled || scheduled === day) map.push(choice === day ? { ...row, scheduledDate: day } : row);
    } else if (choice === day || (!heldTransfer && !choice && (legacy.has(locationKey(row)) || autoAddToday) && (!scheduled || scheduled === day))) {
      map.push({ ...row, scheduledDate: day });
    } else {
      pending.push({ ...row, isNewAssignment: !choice && (!scheduled || scheduled <= day) });
      if (!choice && (!scheduled || scheduled <= day)) incoming.push(row);
    }
  });
  return { map, pending, incoming };
}
