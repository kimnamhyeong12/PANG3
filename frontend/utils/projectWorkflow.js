// Native controls use the same meaning as the web report filters.
export const emptyProjectFilters = () => ({ search: '', worker: '', dong: '', start: '', end: '' });
export const recordDay = value => Array.isArray(value)
  ? `${value[0]}-${String(value[1]).padStart(2, '0')}-${String(value[2]).padStart(2, '0')}`
  : String(value || '').slice(0, 10);
export const assigneeKey = row => row.assigneeUserId != null ? String(row.assigneeUserId) : `name:${row.assigneeName || ''}`;
export function filterProjectRecords(rows, filters) {
  const query = filters.search.trim().toLocaleLowerCase();
  return rows.filter(row => {
    const day = recordDay(row.createdAt);
    return (!filters.worker || assigneeKey(row) === filters.worker)
      && (!filters.dong || row.adminDong === filters.dong)
      && (!filters.start || day >= filters.start) && (!filters.end || day <= filters.end)
      && (!query || [row.detailAddress, row.roadAddress, row.adminDong, row.assigneeName, row.performedByName]
        .some(value => String(value || '').toLocaleLowerCase().includes(query)));
  });
}
export function projectFilterOptions(rows) {
  const names = [...new Map(rows.map(row => [assigneeKey(row), row.assigneeName || '담당자 확인 불가'])).entries()];
  return {
    workers: names.sort((a, b) => a[1].localeCompare(b[1], 'ko')).map(([value, name]) => ({
      value, label: names.some(([id, other]) => id !== value && other === name) && !value.startsWith('name:') ? `${name} (${value})` : name,
    })),
    dongs: [...new Set(rows.map(row => row.adminDong).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko')),
  };
}
export const isCompletedRecord = row => ['complete', 'completed', 'done'].includes(String(row.progressStatus || row.taskStatus || row.status || '').toLowerCase());
export function toggleProjectSelection(selected, ids, checked) {
  const next = new Set(selected);
  ids.forEach(id => checked ? next.add(String(id)) : next.delete(String(id)));
  return next;
}
export const selectionChanged = (a, b) => a.size !== b.size || [...a].some(id => !b.has(id));
